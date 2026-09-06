import Foundation

/// Klima-normaler pr. 0,5°-celle (12 måneders temp + regn%), forudberegnet i
/// data/climate.json og hostet på runnin.org. Hentes én gang, caches til disk.
/// Bruges til vejr-grafen på løbsdetaljen - ægte Open-Meteo-arkivdata, ingen
/// API-kald pr. visning.
struct KlimaCelle {
    let t: [Int?]   // 12 måneders gns. temperatur (°C)
    let r: [Int?]   // 12 måneders regndags-andel (%)
}

@MainActor
final class Klima: ObservableObject {
    static let shared = Klima()
    @Published private(set) var klar = false
    private var celler: [String: KlimaCelle] = [:]
    private var henter = false

    private static func round05(_ x: Double) -> Double { (x * 2).rounded() / 2 }
    static func key(_ la: Double, _ lo: Double) -> String {
        String(format: "%.1f,%.1f", round05(la), round05(lo))
    }

    /// synkront opslag (nil hvis endnu ikke hentet, eller ingen data for cellen)
    func celle(la: Double, lo: Double) -> KlimaCelle? { celler[Self.key(la, lo)] }

    private var cacheURL: URL {
        FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask)[0]
            .appendingPathComponent("climate.json")
    }

    /// hent (cache først for hurtigt svar, så frisk fra nettet). Kald ved app-start.
    func hent() async {
        guard !henter else { return }
        henter = true
        if celler.isEmpty, let d = try? Data(contentsOf: cacheURL) { parse(d) }
        if let url = URL(string: "https://runnin.org/data/climate.json"),
           let (d, resp) = try? await URLSession.shared.data(from: url),
           (resp as? HTTPURLResponse)?.statusCode == 200, d.count > 1000 {
            parse(d)
            try? d.write(to: cacheURL)
        }
        klar = true
    }

    private func parse(_ d: Data) {
        guard let obj = try? JSONSerialization.jsonObject(with: d) as? [String: Any],
              let raw = obj["celler"] as? [String: [String: [Any]]] else { return }
        var ny: [String: KlimaCelle] = [:]
        for (k, v) in raw {
            let t = (v["t"] ?? []).map { $0 as? Int }
            let r = (v["r"] ?? []).map { $0 as? Int }
            if t.count == 12 { ny[k] = KlimaCelle(t: t, r: r.count == 12 ? r : Array(repeating: nil, count: 12)) }
        }
        if !ny.isEmpty { celler = ny }
    }
}
