import SwiftUI

struct Ven: Identifiable, Hashable {
    let id: String      // user_id
    let navn: String
    let avatar: String?
    var initialer: String {
        let d = navn.split(separator: " ").prefix(2).compactMap { $0.first }.map(String.init).joined()
        return d.isEmpty ? "V" : d.uppercased()
    }
}

/// Venne-graf: gensidige venskaber via invite-link + hvilke løb ens venner er
/// tilmeldt/har gemt. Alt går via SECURITY DEFINER-RPC'er (RLS intakt).
@MainActor
final class Venner: ObservableObject {
    @Published var venner: [Ven] = []
    @Published var loebPerRace: [String: [Ven]] = [:]   // race_n → venner der skal løbe/har gemt
    @Published var delTilmeldinger = true                // deler mine tilmeldinger med venner (Strava-agtig flex)
    private var mitId: String?

    private func req(_ path: String, token: String, body: [String: Any]? = nil) -> URLRequest {
        var r = URLRequest(url: URL(string: "\(Auth.base)\(path)")!)
        r.httpMethod = "POST"
        r.setValue(Auth.anon, forHTTPHeaderField: "apikey")
        r.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        r.setValue("application/json", forHTTPHeaderField: "Content-Type")
        r.httpBody = try? JSONSerialization.data(withJSONObject: body ?? [:])
        return r
    }

    /// upsert egen let profil (navn + avatar), så venner kan se én
    func opdaterProfil(_ user: AuthUser, token: String) async {
        var r = URLRequest(url: URL(string: "\(Auth.base)/rest/v1/profiler")!)
        r.httpMethod = "POST"
        r.setValue(Auth.anon, forHTTPHeaderField: "apikey")
        r.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        r.setValue("application/json", forHTTPHeaderField: "Content-Type")
        r.setValue("resolution=merge-duplicates,return=minimal", forHTTPHeaderField: "Prefer")
        var krop: [String: Any] = ["user_id": user.id, "navn": user.navn]
        if let f = user.foto { krop["avatar_url"] = f }
        r.httpBody = try? JSONSerialization.data(withJSONObject: krop)
        _ = try? await URLSession.shared.data(for: r)
        mitId = user.id
        await hentDelValg(user.id, token: token)
    }

    /// hent egen del-indstilling (bevares på tværs af enheder)
    private func hentDelValg(_ userId: String, token: String) async {
        var g = URLRequest(url: URL(string: "\(Auth.base)/rest/v1/profiler?user_id=eq.\(userId)&select=del_tilmeldinger")!)
        g.setValue(Auth.anon, forHTTPHeaderField: "apikey")
        g.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        if let (d, _) = try? await URLSession.shared.data(for: g),
           let arr = (try? JSONSerialization.jsonObject(with: d)) as? [[String: Any]],
           let v = arr.first?["del_tilmeldinger"] as? Bool {
            delTilmeldinger = v
        }
    }

    /// slå deling til/fra (PATCH profiler)
    func sætDel(_ on: Bool, token: String) {
        delTilmeldinger = on
        guard let uid = mitId else { return }
        Task {
            var r = URLRequest(url: URL(string: "\(Auth.base)/rest/v1/profiler?user_id=eq.\(uid)")!)
            r.httpMethod = "PATCH"
            r.setValue(Auth.anon, forHTTPHeaderField: "apikey")
            r.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
            r.setValue("application/json", forHTTPHeaderField: "Content-Type")
            r.setValue("return=minimal", forHTTPHeaderField: "Prefer")
            r.httpBody = try? JSONSerialization.data(withJSONObject: ["del_tilmeldinger": on])
            _ = try? await URLSession.shared.data(for: r)
        }
    }

    func hent(token: String) async {
        if let (d, _) = try? await URLSession.shared.data(for: req("/rest/v1/rpc/mine_venner", token: token)),
           let arr = (try? JSONSerialization.jsonObject(with: d)) as? [[String: Any]] {
            venner = arr.map { Ven(id: $0["ven"] as? String ?? "", navn: $0["navn"] as? String ?? "Ven", avatar: $0["avatar_url"] as? String) }
        }
        if let (d, _) = try? await URLSession.shared.data(for: req("/rest/v1/rpc/venners_loeb", token: token)),
           let arr = (try? JSONSerialization.jsonObject(with: d)) as? [[String: Any]] {
            var map: [String: [Ven]] = [:]
            for r in arr {
                guard let rn = r["race_n"] as? String else { continue }
                let v = Ven(id: r["ven"] as? String ?? "", navn: r["navn"] as? String ?? "Ven", avatar: r["avatar_url"] as? String)
                if map[rn]?.contains(where: { $0.id == v.id }) != true { map[rn, default: []].append(v) }
            }
            loebPerRace = map
        }
    }

    /// venner tilmeldt DETTE løb (til indikator på detalje/liste)
    func tilmeldte(_ raceN: String) -> [Ven] { loebPerRace[raceN] ?? [] }

    func tilfoej(_ venId: String, token: String) async {
        _ = try? await URLSession.shared.data(for: req("/rest/v1/rpc/tilfoej_ven", token: token, body: ["p_ven": venId]))
        await hent(token: token)
    }

    func fjern(_ venId: String, token: String) async {
        _ = try? await URLSession.shared.data(for: req("/rest/v1/rpc/fjern_ven", token: token, body: ["p_ven": venId]))
        await hent(token: token)
    }

    func ryd() { venner = []; loebPerRace = [:]; delTilmeldinger = true; mitId = nil }
}
