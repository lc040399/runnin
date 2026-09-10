import SwiftUI

/// Anmeldelses-ark: gennemsnit + liste (venner først), og for indloggede en
/// stjerne-vælger + tekst → upsert + markér gennemført. Åbnes fra RaceDetailView.
struct ReviewsSheet: View {
    let race: Race
    var auth: Auth
    @ObservedObject private var lang = Lang.shared
    @Environment(\.dismiss) private var dismiss

    @State private var reviews: [RaceReview] = []
    @State private var henter = true
    @State private var valgt = 0
    @State private var tekst = ""
    @State private var sender = false
    @State private var fejl: String?

    private let ink = Color(red: 0.22, green: 0.14, blue: 0.05)
    private let muted = Color(red: 0.49, green: 0.42, blue: 0.31)
    private let coral = Color(red: 0.75, green: 0.35, blue: 0.0)
    private let hairline = Color(red: 0.22, green: 0.14, blue: 0.05).opacity(0.14)

    private var minReview: RaceReview? { reviews.first(where: { $0.erMig }) }

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            Capsule().fill(Color.black.opacity(0.12)).frame(width: 38, height: 5)
                .frame(maxWidth: .infinity).padding(.top, 10).padding(.bottom, 16)

            HStack(alignment: .firstTextBaseline) {
                Text(lang.t("Anmeldelser", "Reviews")).font(.system(size: 19, weight: .bold)).foregroundColor(ink)
                Spacer()
                if !reviews.isEmpty {
                    let s = ReviewService.snit(reviews)
                    HStack(spacing: 6) {
                        StarRow(rating: s.snit, size: 13)
                        Text("\(String(format: "%.1f", s.snit)) · \(s.antal)").font(.system(size: 13, weight: .semibold)).foregroundColor(muted)
                    }
                }
            }
            Text(race.n).font(.system(size: 13)).foregroundColor(muted).lineLimit(1).padding(.top, 2)

            ScrollView {
                VStack(alignment: .leading, spacing: 16) {
                    if auth.user != nil { skrivFelt.padding(.top, 16) }
                    if henter {
                        ProgressView().tint(coral).frame(maxWidth: .infinity).padding(.top, 24)
                    } else if reviews.isEmpty && auth.user == nil {
                        Text(lang.t("Ingen anmeldelser endnu. Log ind for at anmelde.", "No reviews yet. Log in to review."))
                            .font(.system(size: 14)).foregroundColor(muted).padding(.top, 20)
                    } else {
                        ForEach(reviews) { r in reviewKort(r) }
                    }
                }
                .padding(.top, 4).padding(.bottom, 24)
            }
        }
        .padding(.horizontal, 22).padding(.bottom, 8)
        .background(Color(red: 0.96, green: 0.95, blue: 0.93).ignoresSafeArea())
        .task { await hent() }
    }

    // MARK: skriv

    private var skrivFelt: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text(minReview != nil ? lang.t("Din anmeldelse", "Your review")
                                  : lang.t("Har du løbet det? Anmeld det", "Ran it? Review it"))
                .font(.system(size: 13, weight: .semibold)).foregroundColor(ink)
            HStack(spacing: 6) {
                ForEach(1...5, id: \.self) { i in
                    Image(systemName: i <= valgt ? "star.fill" : "star")
                        .font(.system(size: 27))
                        .foregroundColor(i <= valgt ? Color(red: 0.91, green: 0.63, blue: 0.23) : muted.opacity(0.4))
                        .onTapGesture { withAnimation(.spring(response: 0.25, dampingFraction: 0.6)) { valgt = i } }
                }
            }
            TextField(lang.t("Hvordan var ruten, stemningen, arrangementet? (valgfri)",
                             "How was the route, atmosphere, organisation? (optional)"),
                      text: $tekst, axis: .vertical)
                .lineLimit(2...5)
                .font(.system(size: 14)).foregroundColor(ink)
                .padding(11)
                .overlay(RoundedRectangle(cornerRadius: 10).stroke(hairline, lineWidth: 1))
            if let fejl { Text(fejl).font(.system(size: 12)).foregroundColor(.red) }
            Button {
                Task { await send() }
            } label: {
                Text(minReview != nil ? lang.t("Opdatér", "Update") : lang.t("Send anmeldelse", "Post review"))
                    .font(.system(size: 15, weight: .semibold)).foregroundColor(.white)
                    .frame(maxWidth: .infinity).padding(.vertical, 13)
                    .background(coral).clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
            }
            .disabled(sender || valgt == 0).opacity(sender || valgt == 0 ? 0.5 : 1)
        }
        .padding(14)
        .background(Color(red: 0.94, green: 0.92, blue: 0.88))
        .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
    }

    @ViewBuilder private func reviewKort(_ r: RaceReview) -> some View {
        VStack(alignment: .leading, spacing: 3) {
            HStack {
                Text((r.erVen ? "🏃 " : "") + r.navn + (r.erMig ? " " + lang.t("(dig)", "(you)") : ""))
                    .font(.system(size: 13, weight: .semibold)).foregroundColor(ink)
                Spacer()
                if let d = r.dato { Text(relativ(d)).font(.system(size: 11)).foregroundColor(muted) }
            }
            StarRow(rating: Double(r.rating), size: 12)
            if let t = r.tekst, !t.isEmpty {
                Text(t).font(.system(size: 13)).foregroundColor(ink).fixedSize(horizontal: false, vertical: true).padding(.top, 2)
            }
        }
        .padding(.leading, 10)
        .overlay(Rectangle().fill(r.erVen ? coral : Color.clear).frame(width: 2), alignment: .leading)
    }

    // MARK: data

    private func hent() async {
        reviews = await ReviewService.hent(race.n, token: auth.token)
        henter = false
        if let m = minReview { valgt = m.rating; if tekst.isEmpty { tekst = m.tekst ?? "" } }
    }

    private func send() async {
        guard valgt > 0, let token = auth.token, let uid = auth.user?.id else { return }
        sender = true; fejl = nil
        let ok = await ReviewService.send(race.n, rating: valgt,
                                          tekst: tekst.trimmingCharacters(in: .whitespacesAndNewlines),
                                          token: token, userId: uid)
        sender = false
        if ok { henter = true; await hent() }
        else { fejl = lang.t("Kunne ikke gemme lige nu. Prøv igen om lidt.", "Couldn't save right now. Try again shortly.") }
    }

    private func relativ(_ d: Date) -> String {
        let dage = Int(Date().timeIntervalSince(d) / 86400)
        if dage <= 0 { return lang.t("i dag", "today") }
        if dage == 1 { return lang.t("i går", "yesterday") }
        if dage < 30 { return lang.t("\(dage) dage siden", "\(dage) days ago") }
        if dage < 365 { return lang.t("\(dage/30) mdr. siden", "\(dage/30) months ago") }
        return lang.t("\(dage/365) år siden", "\(dage/365) years ago")
    }
}
