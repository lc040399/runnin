import SwiftUI

/// Én løbs-record fra den delte data/races.json (samme sandhed som web).
struct Race: Decodable, Identifiable {
    let id: Int
    let n: String      // navn
    let c: String      // by
    let cc: String     // landekode
    let la: Double     // breddegrad
    let lo: Double     // længdegrad
    let t: String      // type: kort/half/marathon/ultra/tri
    let d: String      // distance-tekst
    let co: String?    // kontinent (EU/NA/SA/AS/AF/OC)
    let u: String?     // tilmeldings-URL
    let m: String?     // næste udgave (YYYY-MM)
    let dt: String?    // eksakt dato (YYYY-MM-DD) hvis kendt
    let p: Double?     // startgebyr (kr) hvis kendt

    var flag: String { Race.flagEmoji(cc) }

    var typeLabel: String {
        switch t {
        case "kort": return T("Kort løb", "Short race")
        case "half": return T("Halvmarathon", "Half marathon")
        case "marathon": return "Marathon"
        case "ultra": return T("Ultraløb", "Ultra")
        case "tri": return T("Triatlon", "Triathlon")
        default: return t.capitalized
        }
    }

    var typeColor: Color {
        let c = Race.color(t); return Color(red: c.r, green: c.g, blue: c.b)
    }

    /// dato-label: eksakt dato hvis kendt, ellers måned - på appens sprog
    var datoLabel: String {
        let mdr = Lang.shared.erDansk
            ? ["", "januar","februar","marts","april","maj","juni",
               "juli","august","september","oktober","november","december"]
            : ["", "January","February","March","April","May","June",
               "July","August","September","October","November","December"]
        if let dt, dt.count == 10, let mm = Int(dt.dropFirst(5).prefix(2)), let dd = Int(dt.suffix(2)) {
            return Lang.shared.erDansk ? "\(dd). \(mdr[mm]) \(dt.prefix(4))"
                                       : "\(mdr[mm]) \(dd), \(dt.prefix(4))"
        }
        if let m, m.count == 7, let mm = Int(m.suffix(2)) {
            return "\(mdr[mm].capitalized) \(m.prefix(4))"
        }
        return ""
    }

    /// distance-tekst på appens sprog (d-feltet er dansk data: "Løb", "Triatlon" m.m.)
    var distLabel: String {
        if Lang.shared.erDansk { return d }
        switch d {
        case "Løb": return "Race"
        case "Triatlon": return "Triathlon"
        default: return d.replacingOccurrences(of: " bjerg", with: " mountain")
        }
    }

    /// dato i lokal tid som YYYY-MM-DD (til kommende-filtrering).
    /// Cachet: erKommende kaldes for 6400+ løb pr. filtrering - en ny DateFormatter
    /// hver gang gjorde nav'en langsom. Genberegnes højst hvert 30. minut.
    private static let isoFmt: DateFormatter = {
        let f = DateFormatter(); f.dateFormat = "yyyy-MM-dd"; f.timeZone = .current; f.locale = Locale(identifier: "en_US_POSIX"); return f
    }()
    private static var iDagCache: (dag: String, stamp: Date)?
    static var iDagISO: String {
        let nu = Date()
        if let c = iDagCache, nu.timeIntervalSince(c.stamp) < 1800 { return c.dag }
        let s = isoFmt.string(from: nu)
        iDagCache = (s, nu)
        return s
    }

    /// er løbet endnu ikke afholdt? (matcher web's erKommende: skjul kun rene fortids-løb)
    var erKommende: Bool {
        let iDag = Race.iDagISO
        if let dt, dt.count == 10, dt >= iDag { return true }   // kendt fremtidig dato
        if let m, m.count == 7, m + "-31" >= iDag { return true } // måned ikke helt forbi
        return dt == nil && m == nil                             // helt udateret → vis; ellers fortid → skjul
    }

    static func color(_ t: String) -> (r: Double, g: Double, b: Double) {
        switch t {
        case "kort":     return (0.42, 0.45, 0.50)
        case "half":     return (0.15, 0.55, 0.42)
        case "marathon": return (0.75, 0.35, 0.00)
        case "ultra":    return (0.55, 0.22, 0.55)
        default:         return (0.20, 0.45, 0.70)
        }
    }

    /// flag-emoji fra ISO-landekode (best-effort)
    static func flagEmoji(_ cc: String) -> String {
        let base: UInt32 = 127397
        var s = ""
        for u in cc.uppercased().unicodeScalars where u.value >= 65 && u.value <= 90 {
            if let scalar = UnicodeScalar(base + u.value) { s.unicodeScalars.append(scalar) }
        }
        return s
    }
}
