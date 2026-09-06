import SwiftUI
import StoreKit

/// Gemte løb. Lokalt (UserDefaults) som gæste-/visningslag; synkes til Supabase
/// user_races (gemt-flag) når man er logget ind - union-merge, bevarer andre flag.
@MainActor
final class Saved: ObservableObject {
    @Published private(set) var navne: Set<String> = []
    @Published private(set) var tilmeldte: Set<String> = []   // "jeg HAR billet" (samme nøgle som web)
    @Published private(set) var bibs: [String: String] = [:]  // race_n → startnummer
    private let defaults = UserDefaults.standard

    init() {
        navne = Set((defaults.array(forKey: "runnin-favs") as? [String]) ?? [])
        tilmeldte = Set((defaults.array(forKey: "runnin-entries") as? [String]) ?? [])
        bibs = (defaults.dictionary(forKey: "runnin-bibs") as? [String: String]) ?? [:]
    }

    func erGemt(_ n: String) -> Bool { navne.contains(n) }
    func erTilmeldt(_ n: String) -> Bool { tilmeldte.contains(n) }
    func bib(_ n: String) -> String { bibs[n] ?? "" }

    /// sæt startnummer på et (tilmeldt) løb - synkes til user_races.bib
    func sætBib(_ n: String, _ bib: String, auth: Auth) {
        let trimmet = bib.trimmingCharacters(in: .whitespaces)
        if trimmet.isEmpty { bibs.removeValue(forKey: n) } else { bibs[n] = trimmet }
        gemLokal()
        if let tok = auth.token, let uid = auth.user?.id, !uid.isEmpty {
            Task { await pushBib(n, bib: trimmet.isEmpty ? nil : trimmet, token: tok, userId: uid) }
        }
    }

    /// markér/afmarkér "jeg er tilmeldt" - at markere gemmer også løbet (det hører til i Mine løb)
    func toggleTilmeldt(_ n: String, auth: Auth) {
        let nu = !tilmeldte.contains(n)
        if nu { tilmeldte.insert(n); navne.insert(n) } else { tilmeldte.remove(n) }
        gemLokal()
        if let tok = auth.token, let uid = auth.user?.id, !uid.isEmpty {
            Task { await pushTilmeldt(n, tilmeldt: nu, token: tok, userId: uid) }
        }
    }

    func toggle(_ n: String, auth: Auth) {
        if navne.contains(n) { navne.remove(n) } else { navne.insert(n) }
        gemLokal()
        // positivt øjeblik: 3. gemte løb → bed (højst én gang) om App Store-anmeldelse
        if navne.count == 3, !UserDefaults.standard.bool(forKey: "runnin-har-bedt-om-rating") {
            UserDefaults.standard.set(true, forKey: "runnin-har-bedt-om-rating")
            if let scene = UIApplication.shared.connectedScenes.first(where: { $0.activationState == .foregroundActive }) as? UIWindowScene {
                DispatchQueue.main.asyncAfter(deadline: .now() + 0.8) {
                    SKStoreReviewController.requestReview(in: scene)
                }
            }
        }
        if let tok = auth.token, let uid = auth.user?.id, !uid.isEmpty {
            let gemt = navne.contains(n)
            Task { await push(n, gemt: gemt, token: tok, userId: uid) }
        }
    }

    /// ved login: hent sky, foren med lokale, skub lokale der endnu ikke er i sky
    func syncMedSky(auth: Auth) async {
        guard let tok = auth.token, let uid = auth.user?.id, !uid.isEmpty else { return }
        let (skyGemte, skyTilmeldte) = await hentSky(token: tok)
        let lokaleGemte = navne, lokaleTilmeldte = tilmeldte
        navne = skyGemte.union(lokaleGemte)
        tilmeldte = skyTilmeldte.union(lokaleTilmeldte)
        gemLokal()
        for n in lokaleGemte.subtracting(skyGemte) { await push(n, gemt: true, token: tok, userId: uid) }
        for n in lokaleTilmeldte.subtracting(skyTilmeldte) { await pushTilmeldt(n, tilmeldt: true, token: tok, userId: uid) }
    }

    /// ved log ud: ryd lokal visnings-tilstand (som web)
    func ryd() { navne = []; tilmeldte = []; bibs = [:]; gemLokal() }

    private func gemLokal() {
        defaults.set(Array(navne), forKey: "runnin-favs")
        defaults.set(Array(tilmeldte), forKey: "runnin-entries")
        defaults.set(bibs, forKey: "runnin-bibs")
    }

    private func hentSky(token: String) async -> (gemte: Set<String>, tilmeldte: Set<String>) {
        var req = URLRequest(url: URL(string: "\(Auth.base)/rest/v1/user_races?select=race_n,gemt,tilmeldt,bib&or=(gemt.eq.true,tilmeldt.eq.true)")!)
        req.setValue(Auth.anon, forHTTPHeaderField: "apikey")
        req.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        guard let (data, _) = try? await URLSession.shared.data(for: req),
              let arr = (try? JSONSerialization.jsonObject(with: data)) as? [[String: Any]] else { return ([], []) }
        var g = Set<String>(), t = Set<String>()
        for r in arr {
            guard let n = r["race_n"] as? String else { continue }
            if r["gemt"] as? Bool == true { g.insert(n) }
            if r["tilmeldt"] as? Bool == true { t.insert(n) }
            if let b = r["bib"] as? String, !b.isEmpty, bibs[n] == nil { bibs[n] = b }  // sky-bib hvis vi ikke har lokalt
        }
        return (g, t)
    }

    private func pushBib(_ n: String, bib: String?, token: String, userId: String) async {
        // sikr rækken findes (upsert m. tilmeldt), sæt så bib
        var up = URLRequest(url: URL(string: "\(Auth.base)/rest/v1/user_races")!)
        up.httpMethod = "POST"
        up.setValue("resolution=merge-duplicates,return=minimal", forHTTPHeaderField: "Prefer")
        up.setValue("application/json", forHTTPHeaderField: "Content-Type")
        up.setValue(Auth.anon, forHTTPHeaderField: "apikey")
        up.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        up.httpBody = try? JSONSerialization.data(withJSONObject: ["user_id": userId, "race_n": n, "gemt": true, "tilmeldt": true, "bib": bib as Any])
        _ = try? await URLSession.shared.data(for: up)
    }

    private func pushTilmeldt(_ n: String, tilmeldt: Bool, token: String, userId: String) async {
        if tilmeldt {
            var req = URLRequest(url: URL(string: "\(Auth.base)/rest/v1/user_races")!)
            req.httpMethod = "POST"
            req.setValue("resolution=merge-duplicates,return=minimal", forHTTPHeaderField: "Prefer")
            req.setValue("application/json", forHTTPHeaderField: "Content-Type")
            req.httpBody = try? JSONSerialization.data(withJSONObject: ["user_id": userId, "race_n": n, "gemt": true, "tilmeldt": true])
            req.setValue(Auth.anon, forHTTPHeaderField: "apikey")
            req.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
            _ = try? await URLSession.shared.data(for: req)
        } else {
            let enc = n.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? n
            var req = URLRequest(url: URL(string: "\(Auth.base)/rest/v1/user_races?race_n=eq.\(enc)")!)
            req.httpMethod = "PATCH"
            req.setValue("return=minimal", forHTTPHeaderField: "Prefer")
            req.setValue("application/json", forHTTPHeaderField: "Content-Type")
            req.httpBody = try? JSONSerialization.data(withJSONObject: ["tilmeldt": false])
            req.setValue(Auth.anon, forHTTPHeaderField: "apikey")
            req.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
            _ = try? await URLSession.shared.data(for: req)
        }
    }

    private func push(_ n: String, gemt: Bool, token: String, userId: String) async {
        let enc = n.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? n
        var req: URLRequest
        if gemt {
            req = URLRequest(url: URL(string: "\(Auth.base)/rest/v1/user_races")!)
            req.httpMethod = "POST"
            req.setValue("resolution=merge-duplicates,return=minimal", forHTTPHeaderField: "Prefer")
            req.setValue("application/json", forHTTPHeaderField: "Content-Type")
            req.httpBody = try? JSONSerialization.data(withJSONObject: ["user_id": userId, "race_n": n, "gemt": true])
        } else {
            // behold rækken men fjern gemt-flag (bevarer evt. tilmeldt/paamind fra web)
            req = URLRequest(url: URL(string: "\(Auth.base)/rest/v1/user_races?race_n=eq.\(enc)")!)
            req.httpMethod = "PATCH"
            req.setValue("return=minimal", forHTTPHeaderField: "Prefer")
            req.setValue("application/json", forHTTPHeaderField: "Content-Type")
            req.httpBody = try? JSONSerialization.data(withJSONObject: ["gemt": false])
        }
        req.setValue(Auth.anon, forHTTPHeaderField: "apikey")
        req.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        _ = try? await URLSession.shared.data(for: req)
    }
}
