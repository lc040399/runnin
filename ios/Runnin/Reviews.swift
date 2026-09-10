import SwiftUI

/// Anmeldelser (samme backend som web): løbere bedømmer løb de har gennemført.
/// Læsning via SECURITY DEFINER-RPC race_anmeldelser (navne + venne-markering),
/// skrivning via den authenticerede REST-upsert (RLS: kun egen række). At anmelde
/// markerer løbet gennemført (user_races.gennemfoert, merge-duplicates bevarer andre flag).

struct RaceReview: Identifiable {
    let id = UUID()
    let navn: String
    let avatar: String?
    let rating: Int
    let tekst: String?
    let dato: Date?
    let erVen: Bool
    let erMig: Bool
}

enum ReviewService {
    private static let iso: ISO8601DateFormatter = {
        let f = ISO8601DateFormatter(); f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]; return f
    }()
    private static let isoUdenFrac = ISO8601DateFormatter()

    static func hent(_ raceN: String, token: String?) async -> [RaceReview] {
        var r = URLRequest(url: URL(string: "\(Auth.base)/rest/v1/rpc/race_anmeldelser")!)
        r.httpMethod = "POST"
        r.setValue(Auth.anon, forHTTPHeaderField: "apikey")
        r.setValue("Bearer \(token ?? Auth.anon)", forHTTPHeaderField: "Authorization")
        r.setValue("application/json", forHTTPHeaderField: "Content-Type")
        r.httpBody = try? JSONSerialization.data(withJSONObject: ["p_race": raceN])
        guard let (d, _) = try? await URLSession.shared.data(for: r),
              let arr = (try? JSONSerialization.jsonObject(with: d)) as? [[String: Any]] else { return [] }
        return arr.map { o in
            let ds = o["created_at"] as? String ?? ""
            return RaceReview(
                navn: o["navn"] as? String ?? "Løber", avatar: o["avatar_url"] as? String,
                rating: (o["rating"] as? NSNumber)?.intValue ?? 0, tekst: o["tekst"] as? String,
                dato: iso.date(from: ds) ?? isoUdenFrac.date(from: ds),
                erVen: o["er_ven"] as? Bool ?? false, erMig: o["er_mig"] as? Bool ?? false)
        }
    }

    /// upsert egen anmeldelse + markér løbet gennemført. token/userId læses af kalderen
    /// (View'et = main actor, hvor Auth-tilstanden bor). Returnerer true ved succes.
    @discardableResult
    static func send(_ raceN: String, rating: Int, tekst: String?, token: String, userId uid: String) async -> Bool {
        func upsert(_ path: String, _ body: [String: Any]) async -> Int {
            var r = URLRequest(url: URL(string: "\(Auth.base)\(path)")!)
            r.httpMethod = "POST"
            r.setValue(Auth.anon, forHTTPHeaderField: "apikey")
            r.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
            r.setValue("application/json", forHTTPHeaderField: "Content-Type")
            r.setValue("resolution=merge-duplicates,return=minimal", forHTTPHeaderField: "Prefer")
            r.httpBody = try? JSONSerialization.data(withJSONObject: body)
            guard let (_, resp) = try? await URLSession.shared.data(for: r) else { return 0 }
            return (resp as? HTTPURLResponse)?.statusCode ?? 0
        }
        var body: [String: Any] = ["user_id": uid, "race_n": raceN, "rating": rating]
        if let t = tekst, !t.isEmpty { body["tekst"] = t }
        let kode = await upsert("/rest/v1/race_reviews", body)
        guard (200..<300).contains(kode) else { return false }
        _ = await upsert("/rest/v1/user_races", ["user_id": uid, "race_n": raceN, "gennemfoert": true])
        return true
    }

    static func snit(_ r: [RaceReview]) -> (snit: Double, antal: Int) {
        guard !r.isEmpty else { return (0, 0) }
        return (Double(r.reduce(0) { $0 + $1.rating }) / Double(r.count), r.count)
    }
}

/// 5 stjerner, fyldt op til `rating` (understøtter decimaler til gennemsnit).
struct StarRow: View {
    let rating: Double
    var size: CGFloat = 13
    var body: some View {
        HStack(spacing: 1) {
            ForEach(0..<5, id: \.self) { i in
                Image(systemName: Double(i) + 0.5 < rating ? "star.fill" : "star")
                    .font(.system(size: size))
                    .foregroundColor(Double(i) + 0.5 < rating ? Color(red: 0.91, green: 0.63, blue: 0.23) : Color(red: 0.49, green: 0.42, blue: 0.31).opacity(0.35))
            }
        }
    }
}
