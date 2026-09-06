import SwiftUI

/// Én let velkomst ved allerførste launch. Ikke et blokerende karrusel-flow -
/// kortet forklarer sig selv; dette sætter bare tonen og peger på de tre greb.
struct WelcomeView: View {
    var luk: () -> Void
    @ObservedObject private var lang = Lang.shared
    @State private var inde = false

    private let paper = Color(red: 0.96, green: 0.953, blue: 0.933)
    private let ink = Color(red: 0.22, green: 0.14, blue: 0.05)
    private let muted = Color(red: 0.49, green: 0.42, blue: 0.31)
    private let coral = Color(red: 0.75, green: 0.35, blue: 0.0)

    private var punkter: [(String, String, String)] {
        [("map", lang.t("Hele verdens løb", "Every race on Earth"),
                lang.t("Zoom ind hvor som helst - marathon, trail, tri.", "Zoom in anywhere - marathon, trail, tri.")),
         ("heart", lang.t("Gem dem du vil løbe", "Save the ones you'll run"),
                lang.t("Dine løb følger dig på tværs af enheder.", "Your races follow you across devices.")),
         ("figure.run", lang.t("Se hvem der løber med", "See who's running too"),
                lang.t("Inviter venner og følg hinandens løb.", "Invite friends and follow each other's races."))]
    }

    var body: some View {
        ZStack {
            Color.black.opacity(inde ? 0.28 : 0)
                .ignoresSafeArea()
                .onTapGesture { afslut() }

            VStack(spacing: 0) {
                HStack(spacing: 8) {
                    if let logo = UIImage(named: "mark") {
                        Image(uiImage: logo).resizable().scaledToFit().frame(width: 26, height: 26)
                    }
                    Text("RUNNIN").font(.system(size: 15, weight: .heavy)).kerning(1.5).foregroundColor(ink)
                }
                .padding(.top, 26)

                Text(lang.t("Verdens løb, på ét kort", "The world's races, on one map"))
                    .font(.system(size: 23, weight: .bold)).foregroundColor(ink)
                    .multilineTextAlignment(.center)
                    .fixedSize(horizontal: false, vertical: true)
                    .padding(.top, 14).padding(.horizontal, 24)

                VStack(alignment: .leading, spacing: 16) {
                    ForEach(punkter, id: \.1) { ikon, titel, tekst in
                        HStack(alignment: .top, spacing: 13) {
                            Image(systemName: ikon)
                                .font(.system(size: 15, weight: .semibold)).foregroundColor(coral)
                                .frame(width: 26, height: 26)
                                .background(coral.opacity(0.1)).clipShape(RoundedRectangle(cornerRadius: 8))
                            VStack(alignment: .leading, spacing: 2) {
                                Text(titel).font(.system(size: 15, weight: .semibold)).foregroundColor(ink)
                                Text(tekst).font(.system(size: 13)).foregroundColor(muted)
                                    .fixedSize(horizontal: false, vertical: true)
                            }
                            Spacer(minLength: 0)
                        }
                    }
                }
                .padding(.top, 22).padding(.horizontal, 26)

                Button { afslut() } label: {
                    Text(lang.t("Udforsk kortet", "Explore the map"))
                        .font(.system(size: 16, weight: .semibold)).foregroundColor(.white)
                        .frame(maxWidth: .infinity).padding(.vertical, 15)
                        .background(ink).clipShape(RoundedRectangle(cornerRadius: 14))
                }
                .padding(.top, 26).padding(.horizontal, 22).padding(.bottom, 24)
            }
            .background(paper)
            .clipShape(RoundedRectangle(cornerRadius: 26, style: .continuous))
            .shadow(color: .black.opacity(0.2), radius: 30, y: 12)
            .padding(.horizontal, 26)
            .scaleEffect(inde ? 1 : 0.92)
            .opacity(inde ? 1 : 0)
        }
        .onAppear { withAnimation(.spring(response: 0.45, dampingFraction: 0.82)) { inde = true } }
    }

    private func afslut() {
        withAnimation(.easeIn(duration: 0.2)) { inde = false }
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.22) { luk() }
    }
}
