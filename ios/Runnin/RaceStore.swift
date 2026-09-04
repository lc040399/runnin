import SwiftUI

/// Delt kilde til løb + filter-tilstand. Web og native deler data-JSON'en;
/// her holder vi den indlæste liste og de aktive filtre, og udregner det
/// filtrerede resultat som kortet klynger.
final class RaceStore: ObservableObject {
    @Published var search = ""
    @Published var region: String? = nil   // nil = hvor som helst
    @Published var month: Int? = nil        // 1-12, nil = når som helst
    @Published var type: String? = nil      // kort/half/marathon/ultra/tri, nil = alle

    /// løbene - loades fra cache/bundle straks, opdateres når remote-refresh lander
    @Published private(set) var all: [Race] = []
    /// øges ved hvert data-refresh, så kortet ved at genklynge på nye data
    @Published private(set) var dataVersion = 0

    init() {
        let local = RemoteData.loadLocal("races.json")
        if let d = local, let arr = try? JSONDecoder().decode([Race].self, from: d) {
            all = arr
        }
        // hent frisk data fra runnin.org i baggrunden (OTA for data)
        RemoteData.refresh("races.json", minBytes: 200_000) { [weak self] d in
            guard let self else { return }
            if d == local { return } // identisk → ingen grund til at gentegne
            guard let arr = try? JSONDecoder().decode([Race].self, from: d),
                  arr.count > 500 else { return } // krympe-vagt mod dårligt svar
            self.all = arr
            self.dataVersion += 1
        }
    }

    var aktiveFiltre: Int {
        [region != nil, month != nil, type != nil].filter { $0 }.count
    }

    /// signatur der ændrer sig når resultatet ændrer sig (så kortet ved at genklynge)
    var filterSignatur: String { "\(search)|\(region ?? "-")|\(month ?? 0)|\(type ?? "-")|\(dataVersion)" }

    private static let nordiske: Set<String> = ["DK", "NO", "SE", "FI", "IS", "FO", "GL"]

    var filtered: [Race] {
        let q = search.trimmingCharacters(in: .whitespaces).lowercased()
        return all.filter { r in
            if let type, r.t != type { return false }
            if let month {
                let mm = Int((r.dt ?? r.m ?? "").dropFirst(5).prefix(2))
                if mm != month { return false }
            }
            if let region, !matchRegion(r, region) { return false }
            if !q.isEmpty, !(r.n.lowercased().contains(q) || r.c.lowercased().contains(q)) { return false }
            return true
        }
    }

    private func matchRegion(_ r: Race, _ region: String) -> Bool {
        switch region {
        case "dk":     return r.cc == "DK"
        case "norden": return RaceStore.nordiske.contains(r.cc)
        case "EU", "NA", "SA", "AS", "AF", "OC": return r.co == region
        default:       return true
        }
    }
}

/// filter-valgmuligheder (matcher web)
enum Filtre {
    static let regioner: [(key: String?, label: String)] = [
        (nil, "Hvor som helst"), ("dk", "Danmark"), ("norden", "Norden"), ("EU", "Europa"),
        ("NA", "Nordamerika"), ("SA", "Sydamerika"), ("AS", "Asien"), ("AF", "Afrika"), ("OC", "Oceanien"),
    ]
    static let måneder = ["Januar","Februar","Marts","April","Maj","Juni",
                          "Juli","August","September","Oktober","November","December"]
    static let typer: [(key: String?, label: String)] = [
        (nil, "Alle distancer"), ("kort", "Kort løb"), ("half", "Halvmarathon"),
        ("marathon", "Marathon"), ("ultra", "Ultraløb"), ("tri", "Triatlon"),
    ]
}
