import Foundation

/// Én løbs-record fra den delte data/races.json (samme sandhed som web).
/// Ekstra felter i JSON (m, p, u, dt, rsid, note ...) ignoreres indtil de skal bruges.
struct Race: Decodable, Identifiable {
    let id: Int
    let n: String      // navn
    let c: String      // by
    let cc: String     // landekode
    let la: Double     // breddegrad
    let lo: Double     // længdegrad
    let t: String      // type: kort/half/marathon/ultra/tri
    let d: String      // distance-tekst
}

enum RaceType {
    /// brand-farver pr. type (matcher web's TYPE_COLOR)
    static func color(_ t: String) -> (r: Double, g: Double, b: Double) {
        switch t {
        case "kort":     return (0.42, 0.45, 0.50)   // skifergrå
        case "half":     return (0.15, 0.55, 0.42)   // grøn
        case "marathon": return (0.75, 0.35, 0.00)   // caramel
        case "ultra":    return (0.55, 0.22, 0.55)   // lilla
        default:         return (0.20, 0.45, 0.70)   // tri = blå
        }
    }
}
