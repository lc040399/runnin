import SwiftUI

struct AuthUser: Codable {
    let id: String
    let email: String
    var navn: String
    var initialer: String {
        let dele = navn.split(separator: " ")
        let i = dele.prefix(2).compactMap { $0.first }.map(String.init).joined()
        return i.isEmpty ? String(email.prefix(1)).uppercased() : i.uppercased()
    }
}

/// Native auth mod Supabase GoTrue REST - samme backend/konto som web.
/// Tokens gemmes lokalt (UserDefaults); ingen ekstra SDK.
@MainActor
final class Auth: ObservableObject {
    @Published var user: AuthUser?
    @Published var loading = false
    private(set) var token: String?

    static let base = "https://qdqvyvidafslzvxgkvof.supabase.co"
    static let anon = "sb_publishable_UfiDozoliZR44TAJ9SX-ng_1f3q_Mk3"
    private let defaults = UserDefaults.standard

    init() {
        if let data = defaults.data(forKey: "runnin-user"),
           let u = try? JSONDecoder().decode(AuthUser.self, from: data) {
            user = u
            token = defaults.string(forKey: "runnin-token")
        }
    }

    struct AuthFejl: LocalizedError { let besked: String; var errorDescription: String? { besked } }

    private func request(_ path: String, body: [String: Any]) async throws -> [String: Any] {
        var req = URLRequest(url: URL(string: Self.base + path)!)
        req.httpMethod = "POST"
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        req.setValue(Self.anon, forHTTPHeaderField: "apikey")
        req.setValue("Bearer \(Self.anon)", forHTTPHeaderField: "Authorization")
        req.httpBody = try JSONSerialization.data(withJSONObject: body)
        let (data, resp) = try await URLSession.shared.data(for: req)
        let json = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any] ?? [:]
        if let http = resp as? HTTPURLResponse, http.statusCode >= 400 {
            let msg = (json["msg"] ?? json["error_description"] ?? json["error"]) as? String
            throw AuthFejl(besked: dansk(msg))
        }
        return json
    }

    private func dansk(_ raw: String?) -> String {
        guard let r = raw?.lowercased() else { return "Noget gik galt. Prøv igen." }
        if r.contains("invalid login") || r.contains("credentials") { return "Forkert e-mail eller adgangskode." }
        if r.contains("already registered") || r.contains("already been") { return "Der findes allerede en konto med den e-mail." }
        if r.contains("password") && r.contains("6") { return "Adgangskoden skal være mindst 6 tegn." }
        if r.contains("email") && r.contains("valid") { return "Skriv en gyldig e-mail." }
        return "Noget gik galt. Prøv igen."
    }

    func login(email: String, pw: String) async throws {
        loading = true; defer { loading = false }
        let json = try await request("/auth/v1/token?grant_type=password",
                                     body: ["email": email, "password": pw])
        guard json["access_token"] != nil else { throw AuthFejl(besked: "Forkert e-mail eller adgangskode.") }
        let u = json["user"] as? [String: Any]
        let meta = u?["user_metadata"] as? [String: Any]
        let navn = (meta?["navn"] as? String) ?? (meta?["name"] as? String) ?? String(email.split(separator: "@").first ?? "")
        let id = (u?["id"] as? String) ?? ""
        gem(AuthUser(id: id, email: email, navn: navn), token: json["access_token"] as? String,
            refresh: json["refresh_token"] as? String)
    }

    /// returnerer true hvis kontoen kræver e-mail-bekræftelse (ingen session endnu)
    func signup(navn: String, email: String, pw: String) async throws -> Bool {
        loading = true; defer { loading = false }
        let json = try await request("/auth/v1/signup",
                                     body: ["email": email, "password": pw, "data": ["navn": navn]])
        if let token = json["access_token"] as? String {
            let id = ((json["user"] as? [String: Any])?["id"] as? String) ?? (json["id"] as? String) ?? ""
            gem(AuthUser(id: id, email: email, navn: navn), token: token, refresh: json["refresh_token"] as? String)
            return false
        }
        return true // bekræftelses-mail sendt
    }

    func logout() {
        user = nil; token = nil
        for k in ["runnin-user", "runnin-token", "runnin-refresh"] { defaults.removeObject(forKey: k) }
    }

    private func gem(_ u: AuthUser, token tok: String?, refresh: String?) {
        user = u; token = tok
        if let d = try? JSONEncoder().encode(u) { defaults.set(d, forKey: "runnin-user") }
        defaults.set(tok, forKey: "runnin-token")
        defaults.set(refresh, forKey: "runnin-refresh")
    }
}
