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
        guard let r = raw?.lowercased() else { return T("Noget gik galt. Prøv igen.", "Something went wrong. Please try again.") }
        if r.contains("invalid login") || r.contains("credentials") { return T("Forkert e-mail eller adgangskode.", "Wrong email or password.") }
        if r.contains("already registered") || r.contains("already been") { return T("Der findes allerede en konto med den e-mail.", "An account with that email already exists.") }
        if r.contains("password") && r.contains("6") { return T("Adgangskoden skal være mindst 6 tegn.", "Password must be at least 6 characters.") }
        if r.contains("email") && r.contains("valid") { return T("Skriv en gyldig e-mail.", "Enter a valid email.") }
        return T("Noget gik galt. Prøv igen.", "Something went wrong. Please try again.")
    }

    func login(email: String, pw: String) async throws {
        loading = true; defer { loading = false }
        let json = try await request("/auth/v1/token?grant_type=password",
                                     body: ["email": email, "password": pw])
        guard json["access_token"] != nil else { throw AuthFejl(besked: T("Forkert e-mail eller adgangskode.", "Wrong email or password.")) }
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

    /// Sign in with Apple: veksl Apples identityToken til en Supabase-session
    /// (grant_type=id_token). Navn følger kun med ved FØRSTE login - gemmes i metadata.
    func loginMedApple(idToken: String, nonce: String, fuldeNavn: String?) async throws {
        loading = true; defer { loading = false }
        var body: [String: Any] = ["provider": "apple", "id_token": idToken, "nonce": nonce]
        let json = try await request("/auth/v1/token?grant_type=id_token", body: body)
        guard let tok = json["access_token"] as? String else {
            throw AuthFejl(besked: T("Apple-login fejlede. Prøv igen.", "Apple sign-in failed. Please try again."))
        }
        let u = json["user"] as? [String: Any]
        let meta = u?["user_metadata"] as? [String: Any]
        let email = (u?["email"] as? String) ?? ""
        var navn = (meta?["navn"] as? String) ?? (meta?["name"] as? String) ?? ""
        if navn.isEmpty { navn = fuldeNavn ?? String(email.split(separator: "@").first ?? "Løber") }
        gem(AuthUser(id: (u?["id"] as? String) ?? "", email: email, navn: navn),
            token: tok, refresh: json["refresh_token"] as? String)
        // Apple giver kun navnet ved allerførste login - persistér det i Supabase-metadata
        if let fn = fuldeNavn, !fn.isEmpty, (meta?["navn"] as? String) == nil {
            var req = URLRequest(url: URL(string: "\(Self.base)/auth/v1/user")!)
            req.httpMethod = "PUT"
            req.setValue("application/json", forHTTPHeaderField: "Content-Type")
            req.setValue(Self.anon, forHTTPHeaderField: "apikey")
            req.setValue("Bearer \(tok)", forHTTPHeaderField: "Authorization")
            req.httpBody = try? JSONSerialization.data(withJSONObject: ["data": ["navn": fn]])
            _ = try? await URLSession.shared.data(for: req)
        }
    }

    func logout() {
        user = nil; token = nil
        for k in ["runnin-user", "runnin-token", "runnin-refresh"] { defaults.removeObject(forKey: k) }
    }

    /// sletter brugerens konto + data permanent (Apple-krav for konto-apps + GDPR)
    func deleteAccount() async throws {
        guard let tok = token else { throw AuthFejl(besked: T("Ikke logget ind.", "Not signed in.")) }
        var req = URLRequest(url: URL(string: "\(Self.base)/rest/v1/rpc/delete_own_account")!)
        req.httpMethod = "POST"
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        req.setValue(Self.anon, forHTTPHeaderField: "apikey")
        req.setValue("Bearer \(tok)", forHTTPHeaderField: "Authorization")
        req.httpBody = "{}".data(using: .utf8)
        let (_, resp) = try await URLSession.shared.data(for: req)
        if let http = resp as? HTTPURLResponse, http.statusCode >= 400 {
            throw AuthFejl(besked: T("Kunne ikke slette kontoen. Prøv igen.", "Couldn't delete the account. Please try again."))
        }
        logout()
        for k in ["runnin-favs"] { defaults.removeObject(forKey: k) }
    }

    private func gem(_ u: AuthUser, token tok: String?, refresh: String?) {
        user = u; token = tok
        if let d = try? JSONEncoder().encode(u) { defaults.set(d, forKey: "runnin-user") }
        defaults.set(tok, forKey: "runnin-token")
        defaults.set(refresh, forKey: "runnin-refresh")
    }
}
