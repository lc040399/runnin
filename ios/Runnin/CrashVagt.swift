import Foundation

/// Letvægts crash-telemetri uden tredjeparts-SDK: fanger ufangede exceptions
/// og fatale signaler, skriver en minimal rapport til disk, og sender den
/// ANONYMT (ingen bruger-/enheds-id) til Supabase ved næste opstart.
/// Matcher reg_klik-modellen: anon kan kun INSERT'e - rapporter kan ikke læses fra klienten.
enum CrashVagt {
    private static var rapportURL: URL {
        FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask)[0]
            .appendingPathComponent("crash-rapport.txt")
    }

    static func start() {
        sendVentende()

        NSSetUncaughtExceptionHandler { ex in
            let tekst = "exception: \(ex.name.rawValue)\n\(ex.reason ?? "-")\n"
                + ex.callStackSymbols.prefix(12).joined(separator: "\n")
            CrashVagt.skriv(tekst)
        }
        for sig in [SIGABRT, SIGSEGV, SIGBUS, SIGILL, SIGFPE, SIGTRAP] {
            signal(sig) { s in
                CrashVagt.skriv("signal: \(s)\n" + Thread.callStackSymbols.prefix(12).joined(separator: "\n"))
                exit(s)
            }
        }
    }

    private static func skriv(_ tekst: String) {
        try? tekst.data(using: .utf8)?.write(to: rapportURL, options: .atomic)
    }

    /// send en evt. rapport fra sidste session og ryd op (best-effort, blokerer aldrig)
    private static func sendVentende() {
        guard let data = try? Data(contentsOf: rapportURL),
              let besked = String(data: data, encoding: .utf8), !besked.isEmpty else { return }
        try? FileManager.default.removeItem(at: rapportURL)   // fjern FØRST (aldrig sende-loop)

        let info = Bundle.main.infoDictionary
        let krop: [String: Any] = [
            "platform": "ios",
            "app_version": info?["CFBundleShortVersionString"] as? String ?? "-",
            "build": info?["CFBundleVersion"] as? String ?? "-",
            "besked": String(besked.prefix(8000)),
        ]
        var req = URLRequest(url: URL(string: "\(Auth.base)/rest/v1/crash_rapporter")!)
        req.httpMethod = "POST"
        req.setValue(Auth.anon, forHTTPHeaderField: "apikey")
        req.setValue("Bearer \(Auth.anon)", forHTTPHeaderField: "Authorization")
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        req.setValue("return=minimal", forHTTPHeaderField: "Prefer")
        req.httpBody = try? JSONSerialization.data(withJSONObject: krop)
        URLSession.shared.dataTask(with: req).resume()
    }
}
