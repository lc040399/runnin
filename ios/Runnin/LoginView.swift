import SwiftUI
import AuthenticationServices
import CryptoKit

/// Login / opret-konto-ark - to tilstande, pw-øje, "tjek din indbakke"-succes.
struct LoginView: View {
    @ObservedObject var auth: Auth
    @ObservedObject private var lang = Lang.shared
    @Environment(\.dismiss) private var dismiss

    @State private var opretMode = false
    @State private var navn = ""
    @State private var email = ""
    @State private var pw = ""
    @State private var visPw = false
    @State private var fejl: String?
    @State private var bekraeftEmail: String?
    @State private var appleNonce = ""
    @FocusState private var fokus: Felt?
    enum Felt { case navn, email, pw }

    private let paper = Color(red: 0.96, green: 0.953, blue: 0.933)
    private let ink = Color(red: 0.22, green: 0.14, blue: 0.05)
    private let muted = Color(red: 0.49, green: 0.42, blue: 0.31)
    private let coral = Color(red: 0.75, green: 0.35, blue: 0.0)
    private let hairline = Color(red: 0.22, green: 0.14, blue: 0.05).opacity(0.12)

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 0) {
                HStack {
                    Spacer()
                    Button { dismiss() } label: {
                        Image(systemName: "xmark").font(.system(size: 13, weight: .semibold))
                            .foregroundColor(.secondary).frame(width: 30, height: 30)
                            .background(Color.black.opacity(0.05)).clipShape(Circle())
                    }
                }
                .padding(.top, 12)

                if let mail = bekraeftEmail {
                    succes(mail)
                } else {
                    form
                }
            }
            .padding(.horizontal, 26)
            .padding(.bottom, 30)
        }
        .scrollDismissesKeyboard(.interactively)
        .presentationDetents([.large])
        .background(paper.ignoresSafeArea())
    }

    private var form: some View {
        VStack(alignment: .leading, spacing: 0) {
            Text(lang.t("RUNNIN-PROFIL", "RUNNIN PROFILE")).font(.system(size: 11, weight: .bold)).kerning(1.2).foregroundColor(coral)
                .padding(.top, 6)
            Text(opretMode ? lang.t("Opret konto", "Create account") : lang.t("Log ind", "Sign in"))
                .font(.system(size: 30, weight: .bold)).foregroundColor(ink).padding(.top, 4)
            Text(opretMode ? lang.t("Gem løb og find dem på tværs af dine enheder.", "Save races and find them across your devices.")
                           : lang.t("Velkommen tilbage - dine gemte løb venter.", "Welcome back - your saved races are waiting."))
                .font(.system(size: 15)).foregroundColor(muted).padding(.top, 8)

            SignInWithAppleButton(.signIn) { req in
                let rå = UUID().uuidString + UUID().uuidString
                appleNonce = rå
                req.requestedScopes = [.fullName, .email]
                req.nonce = SHA256.hash(data: Data(rå.utf8)).map { String(format: "%02x", $0) }.joined()
            } onCompletion: { resultat in
                switch resultat {
                case .success(let auth):
                    guard let cred = auth.credential as? ASAuthorizationAppleIDCredential,
                          let tokenData = cred.identityToken,
                          let idToken = String(data: tokenData, encoding: .utf8) else {
                        fejl = lang.t("Apple-login fejlede. Prøv igen.", "Apple sign-in failed. Please try again."); return
                    }
                    let navnDele = [cred.fullName?.givenName, cred.fullName?.familyName].compactMap { $0 }
                    let fuldeNavn = navnDele.isEmpty ? nil : navnDele.joined(separator: " ")
                    Task {
                        do { try await auth2Apple(idToken: idToken, fuldeNavn: fuldeNavn); dismiss() }
                        catch { fejl = (error as? Auth.AuthFejl)?.besked ?? lang.t("Apple-login fejlede. Prøv igen.", "Apple sign-in failed. Please try again.") }
                    }
                case .failure(let e):
                    if (e as? ASAuthorizationError)?.code != .canceled {
                        fejl = lang.t("Apple-login fejlede. Prøv igen.", "Apple sign-in failed. Please try again.")
                    }
                }
            }
            .signInWithAppleButtonStyle(.black)
            .frame(height: 50)
            .clipShape(RoundedRectangle(cornerRadius: 14))
            .padding(.top, 22)

            HStack(spacing: 10) {
                Rectangle().fill(hairline).frame(height: 1)
                Text(lang.t("eller med e-mail", "or with email")).font(.system(size: 12)).foregroundColor(muted).fixedSize()
                Rectangle().fill(hairline).frame(height: 1)
            }
            .padding(.top, 16)

            VStack(spacing: 12) {
                if opretMode {
                    felt(lang.t("Navn", "Name"), tekst: $navn, felt: .navn, autocap: .words)
                }
                felt(lang.t("E-mail", "Email"), tekst: $email, felt: .email, keyboard: .emailAddress, autocap: .never)
                pwFelt
            }
            .padding(.top, 14)

            if let fejl {
                Text(fejl).font(.system(size: 13)).foregroundColor(coral).padding(.top, 12)
            }

            Button(action: send) {
                HStack {
                    if auth.loading { ProgressView().tint(.white) }
                    else {
                        Text(opretMode ? lang.t("Opret konto", "Create account") : lang.t("Log ind", "Sign in")).font(.system(size: 16, weight: .semibold))
                        Text("→").font(.system(size: 16, weight: .semibold))
                    }
                }
                .foregroundColor(.white).frame(maxWidth: .infinity).padding(.vertical, 15)
                .background(coral).clipShape(RoundedRectangle(cornerRadius: 14))
            }
            .disabled(auth.loading)
            .padding(.top, 20)

            HStack(spacing: 5) {
                Text(opretMode ? lang.t("Har du en konto?", "Already have an account?") : lang.t("Ny her?", "New here?")).foregroundColor(muted)
                Button(opretMode ? lang.t("Log ind", "Sign in") : lang.t("Opret en konto", "Create one")) {
                    withAnimation(.easeOut(duration: 0.2)) { opretMode.toggle(); fejl = nil }
                }
                .foregroundColor(coral).fontWeight(.semibold)
            }
            .font(.system(size: 14)).frame(maxWidth: .infinity).padding(.top, 18)

            Text(lang.t("Konto og gemte løb opbevares sikkert hos Supabase (EU) og følger dig på tværs af enheder.",
                        "Your account and saved races are stored securely with Supabase (EU) and follow you across devices."))
                .font(.system(size: 12)).foregroundColor(muted).padding(.top, 22)
        }
    }

    private func succes(_ mail: String) -> some View {
        VStack(spacing: 14) {
            ZStack {
                Circle().fill(coral.opacity(0.12)).frame(width: 64, height: 64)
                Image(systemName: "checkmark").font(.system(size: 26, weight: .bold)).foregroundColor(coral)
            }
            .padding(.top, 30)
            Text(lang.t("Tjek din indbakke", "Check your inbox")).font(.system(size: 24, weight: .bold)).foregroundColor(ink)
            Text(lang.t("Vi har sendt et bekræftelses-link til\n\(mail)", "We've sent a confirmation link to\n\(mail)"))
                .multilineTextAlignment(.center).font(.system(size: 15)).foregroundColor(muted)
            Text(lang.t("Ikke modtaget? Kig i spam - eller prøv igen om lidt.", "Didn't get it? Check spam - or try again shortly."))
                .font(.system(size: 12)).foregroundColor(muted)
            Button {
                bekraeftEmail = nil; opretMode = false
            } label: {
                Text(lang.t("Til log ind →", "To sign in →")).font(.system(size: 15, weight: .semibold)).foregroundColor(.white)
                    .frame(maxWidth: .infinity).padding(.vertical, 14)
                    .background(coral).clipShape(RoundedRectangle(cornerRadius: 14))
            }
            .padding(.top, 8)
        }
        .frame(maxWidth: .infinity)
        .padding(.top, 20)
    }

    private func felt(_ titel: String, tekst: Binding<String>, felt: Felt,
                      keyboard: UIKeyboardType = .default,
                      autocap: TextInputAutocapitalization = .sentences) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(titel).font(.system(size: 12, weight: .semibold)).foregroundColor(muted)
            TextField("", text: tekst)
                .font(.system(size: 16)).foregroundColor(ink)
                .keyboardType(keyboard).textInputAutocapitalization(autocap).autocorrectionDisabled()
                .focused($fokus, equals: felt)
                .padding(.vertical, 13).padding(.horizontal, 14)
                .background(Color.white).clipShape(RoundedRectangle(cornerRadius: 12))
                .overlay(RoundedRectangle(cornerRadius: 12).stroke(fokus == felt ? ink : hairline,
                                                                   lineWidth: fokus == felt ? 1.5 : 1))
        }
    }

    private var pwFelt: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(lang.t("Adgangskode", "Password")).font(.system(size: 12, weight: .semibold)).foregroundColor(muted)
            HStack {
                Group {
                    if visPw { TextField("", text: $pw) } else { SecureField("", text: $pw) }
                }
                .font(.system(size: 16)).foregroundColor(ink)
                .textInputAutocapitalization(.never).autocorrectionDisabled()
                .focused($fokus, equals: .pw)
                Button { visPw.toggle() } label: {
                    Image(systemName: visPw ? "eye.slash" : "eye").foregroundColor(.secondary)
                }
            }
            .padding(.vertical, 13).padding(.horizontal, 14)
            .background(Color.white).clipShape(RoundedRectangle(cornerRadius: 12))
            .overlay(RoundedRectangle(cornerRadius: 12).stroke(fokus == .pw ? ink : hairline,
                                                               lineWidth: fokus == .pw ? 1.5 : 1))
        }
    }

    private func auth2Apple(idToken: String, fuldeNavn: String?) async throws {
        try await auth.loginMedApple(idToken: idToken, nonce: appleNonce, fuldeNavn: fuldeNavn)
    }

    private func send() {
        fokus = nil; fejl = nil
        Task {
            do {
                if opretMode {
                    let bekraeft = try await auth.signup(navn: navn, email: email, pw: pw)
                    if bekraeft { bekraeftEmail = email } else { dismiss() }
                } else {
                    try await auth.login(email: email, pw: pw)
                    dismiss()
                }
            } catch {
                fejl = (error as? Auth.AuthFejl)?.besked ?? lang.t("Noget gik galt. Prøv igen.", "Something went wrong. Please try again.")
            }
        }
    }
}
