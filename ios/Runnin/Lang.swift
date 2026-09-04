import SwiftUI

/// App-sprog: dansk på danske enheder, engelsk på alle andre; manuel skifter overstyrer.
/// Singleton så både Views (@ObservedObject) og model-/net-kode (global `T`) kan bruge det.
final class Lang: ObservableObject {
    static let shared = Lang()

    @Published var code: String {
        didSet { UserDefaults.standard.set(code, forKey: "runnin-sprog") }
    }

    private init() {
        if let gemt = UserDefaults.standard.string(forKey: "runnin-sprog") {
            code = gemt
        } else {
            // enhedens sprog er eneste runtime-signal (App Store-landet kan appen ikke se)
            let dev = Locale.preferredLanguages.first ?? "en"
            code = dev.hasPrefix("da") ? "da" : "en"
        }
    }

    var erDansk: Bool { code == "da" }

    /// vælg dansk eller engelsk streng
    func t(_ da: String, _ en: String) -> String { code == "da" ? da : en }
}

/// Global genvej til model-/net-kode uden for en View (fx Auth-fejl, Race-labels).
func T(_ da: String, _ en: String) -> String { Lang.shared.t(da, en) }
