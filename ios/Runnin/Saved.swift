import SwiftUI

/// Gemte løb. Lokalt (UserDefaults) som gæste-/visningslag; synkes til Supabase
/// user_races (gemt-flag) når man er logget ind - union-merge, bevarer andre flag.
@MainActor
final class Saved: ObservableObject {
    @Published private(set) var navne: Set<String> = []
    private let defaults = UserDefaults.standard

    init() {
        navne = Set((defaults.array(forKey: "runnin-favs") as? [String]) ?? [])
    }

    func erGemt(_ n: String) -> Bool { navne.contains(n) }

    func toggle(_ n: String, auth: Auth) {
        if navne.contains(n) { navne.remove(n) } else { navne.insert(n) }
        gemLokal()
        if let tok = auth.token, let uid = auth.user?.id, !uid.isEmpty {
            let gemt = navne.contains(n)
            Task { await push(n, gemt: gemt, token: tok, userId: uid) }
        }
    }

    /// ved login: hent sky, foren med lokale, skub lokale der endnu ikke er i sky
    func syncMedSky(auth: Auth) async {
        guard let tok = auth.token, let uid = auth.user?.id, !uid.isEmpty else { return }
        let sky = await hentSky(token: tok)
        let lokale = navne
        navne = sky.union(lokale)
        gemLokal()
        for n in lokale.subtracting(sky) { await push(n, gemt: true, token: tok, userId: uid) }
    }

    /// ved log ud: ryd lokal visnings-tilstand (som web)
    func ryd() { navne = []; gemLokal() }

    private func gemLokal() { defaults.set(Array(navne), forKey: "runnin-favs") }

    private func hentSky(token: String) async -> Set<String> {
        var req = URLRequest(url: URL(string: "\(Auth.base)/rest/v1/user_races?select=race_n&gemt=eq.true")!)
        req.setValue(Auth.anon, forHTTPHeaderField: "apikey")
        req.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        guard let (data, _) = try? await URLSession.shared.data(for: req),
              let arr = (try? JSONSerialization.jsonObject(with: data)) as? [[String: Any]] else { return [] }
        return Set(arr.compactMap { $0["race_n"] as? String })
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
