import SwiftUI

/// Login / opret-konto-ark - to tilstande, pw-øje, "tjek din indbakke"-succes.
struct LoginView: View {
    @ObservedObject var auth: Auth
    @Environment(\.dismiss) private var dismiss

    @State private var opretMode = false
    @State private var navn = ""
    @State private var email = ""
    @State private var pw = ""
    @State private var visPw = false
    @State private var fejl: String?
    @State private var bekraeftEmail: String?
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
            Text("RUNNIN-PROFIL").font(.system(size: 11, weight: .bold)).kerning(1.2).foregroundColor(coral)
                .padding(.top, 6)
            Text(opretMode ? "Opret konto" : "Log ind")
                .font(.system(size: 30, weight: .bold)).foregroundColor(ink).padding(.top, 4)
            Text(opretMode ? "Gem løb og find dem på tværs af dine enheder."
                           : "Velkommen tilbage - dine gemte løb venter.")
                .font(.system(size: 15)).foregroundColor(muted).padding(.top, 8)

            VStack(spacing: 12) {
                if opretMode {
                    felt("Navn", tekst: $navn, felt: .navn, autocap: .words)
                }
                felt("E-mail", tekst: $email, felt: .email, keyboard: .emailAddress, autocap: .never)
                pwFelt
            }
            .padding(.top, 22)

            if let fejl {
                Text(fejl).font(.system(size: 13)).foregroundColor(coral).padding(.top, 12)
            }

            Button(action: send) {
                HStack {
                    if auth.loading { ProgressView().tint(.white) }
                    else {
                        Text(opretMode ? "Opret konto" : "Log ind").font(.system(size: 16, weight: .semibold))
                        Text("→").font(.system(size: 16, weight: .semibold))
                    }
                }
                .foregroundColor(.white).frame(maxWidth: .infinity).padding(.vertical, 15)
                .background(coral).clipShape(RoundedRectangle(cornerRadius: 14))
            }
            .disabled(auth.loading)
            .padding(.top, 20)

            HStack(spacing: 5) {
                Text(opretMode ? "Har du en konto?" : "Ny her?").foregroundColor(muted)
                Button(opretMode ? "Log ind" : "Opret en konto") {
                    withAnimation(.easeOut(duration: 0.2)) { opretMode.toggle(); fejl = nil }
                }
                .foregroundColor(coral).fontWeight(.semibold)
            }
            .font(.system(size: 14)).frame(maxWidth: .infinity).padding(.top, 18)

            Text("Konto og gemte løb opbevares sikkert hos Supabase (EU) og følger dig på tværs af enheder.")
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
            Text("Tjek din indbakke").font(.system(size: 24, weight: .bold)).foregroundColor(ink)
            Text("Vi har sendt et bekræftelses-link til\n\(mail)")
                .multilineTextAlignment(.center).font(.system(size: 15)).foregroundColor(muted)
            Text("Ikke modtaget? Kig i spam - eller prøv igen om lidt.")
                .font(.system(size: 12)).foregroundColor(muted)
            Button {
                bekraeftEmail = nil; opretMode = false
            } label: {
                Text("Til log ind →").font(.system(size: 15, weight: .semibold)).foregroundColor(.white)
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
            Text("Adgangskode").font(.system(size: 12, weight: .semibold)).foregroundColor(muted)
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
                fejl = (error as? Auth.AuthFejl)?.besked ?? "Noget gik galt. Prøv igen."
            }
        }
    }
}
