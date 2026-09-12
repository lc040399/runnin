import Foundation

/// Delt bro mellem app og widget (App Group): appen skriver et lille snapshot
/// af brugerens NÆSTE gemte løb, widgeten læser det. Ingen netværk i widgeten -
/// den viser præcis det, appen sidst vidste.
enum WidgetDeling {
    static let gruppe = "group.dk.runnin.ap"
    private static let nøgle = "runnin-widget-naeste"

    struct NæsteLøb: Codable {
        let navn: String
        let by: String
        let flag: String
        let dato: String    // YYYY-MM-DD (dt, ellers 1. i måneden fra m)
    }

    static func gem(_ løb: NæsteLøb?) {
        guard let d = UserDefaults(suiteName: gruppe) else { return }
        if let løb, let data = try? JSONEncoder().encode(løb) { d.set(data, forKey: nøgle) }
        else { d.removeObject(forKey: nøgle) }
    }

    static func læs() -> NæsteLøb? {
        guard let d = UserDefaults(suiteName: gruppe),
              let data = d.data(forKey: nøgle) else { return nil }
        return try? JSONDecoder().decode(NæsteLøb.self, from: data)
    }

    /// dage fra i dag (lokal midnat) til løbsdatoen - 0 = i dag, negativ = afholdt
    static func dageTil(_ dato: String, fra: Date = Date()) -> Int? {
        let f = DateFormatter()
        f.dateFormat = "yyyy-MM-dd"; f.timeZone = .current; f.locale = Locale(identifier: "en_US_POSIX")
        guard let d = f.date(from: dato) else { return nil }
        let cal = Calendar.current
        return cal.dateComponents([.day], from: cal.startOfDay(for: fra), to: cal.startOfDay(for: d)).day
    }
}
