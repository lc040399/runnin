import UIKit
import UserNotifications

/// Fjern-push (APNs) til de SOCIALE beskeder: en ven tilmelder sig et løb, eller
/// nogen tilføjer dig som ven. Selve afsendelsen sker server-side (send-push edge
/// function); her registrerer vi bare enhedens token mod den aktuelle bruger.
/// Lokale løbs-påmindelser håndteres separat i Notifikationer.swift.
final class PushManager {
    static let shared = PushManager()
    private var hexToken: String?
    private weak var auth: Auth?

    func konfigurer(auth: Auth) { self.auth = auth }

    /// Bed om notifikations-lov og registrér for remote push. Kaldes når man er
    /// logget ind (så der er en bruger at knytte token til). Deler tilladelse med
    /// de lokale påmindelser - ét samlet prompt.
    func aktivér() {
        UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .sound, .badge]) { ok, _ in
            guard ok else { return }
            DispatchQueue.main.async { UIApplication.shared.registerForRemoteNotifications() }
        }
    }

    /// APNs leverede et token (fra AppDelegate) → gem hex og knyt til bruger.
    func sætToken(_ data: Data) {
        hexToken = data.map { String(format: "%02x", $0) }.joined()
        Task { @MainActor in knytTilBruger() }
    }

    /// upsert token→bruger via SECURITY DEFINER-RPC (flytter token rent v. re-login)
    @MainActor func knytTilBruger() {
        guard let tok = hexToken, let a = auth, let jwt = a.token,
              let uid = a.user?.id, !uid.isEmpty else { return }
        _ = uid
        kald("registrer_push_token", jwt: jwt, krop: ["p_token": tok, "p_platform": "ios"])
    }

    /// på log ud: fjern token, så man ikke får venners push efter logout
    @MainActor func frigør() {
        guard let tok = hexToken, let a = auth, let jwt = a.token else { return }
        kald("fjern_push_token", jwt: jwt, krop: ["p_token": tok])
    }

    private func kald(_ rpc: String, jwt: String, krop: [String: Any]) {
        var r = URLRequest(url: URL(string: "\(Auth.base)/rest/v1/rpc/\(rpc)")!)
        r.httpMethod = "POST"
        r.setValue(Auth.anon, forHTTPHeaderField: "apikey")
        r.setValue("Bearer \(jwt)", forHTTPHeaderField: "Authorization")
        r.setValue("application/json", forHTTPHeaderField: "Content-Type")
        r.httpBody = try? JSONSerialization.data(withJSONObject: krop)
        URLSession.shared.dataTask(with: r).resume()
    }
}

/// Fanger APNs-token. SwiftUI-app bruger UIApplicationDelegateAdaptor.
final class AppDelegate: NSObject, UIApplicationDelegate {
    func application(_ application: UIApplication,
                     didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data) {
        PushManager.shared.sætToken(deviceToken)
    }
    func application(_ application: UIApplication,
                     didFailToRegisterForRemoteNotificationsWithError error: Error) {
        #if DEBUG
        print("Push-registrering fejlede: \(error.localizedDescription)")
        #endif
    }
}
