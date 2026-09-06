import SwiftUI

/// Venne-skærm: invitér via link, se venner + hvilke løb de skal løbe.
struct VennerView: View {
    @ObservedObject var venner: Venner
    var auth: Auth
    let mitId: String
    @ObservedObject private var lang = Lang.shared
    @Environment(\.dismiss) private var dismiss

    private let paper = Color(red: 0.96, green: 0.953, blue: 0.933)
    private let ink = Color(red: 0.22, green: 0.14, blue: 0.05)
    private let muted = Color(red: 0.49, green: 0.42, blue: 0.31)
    private let coral = Color(red: 0.75, green: 0.35, blue: 0.0)
    private let hairline = Color(red: 0.22, green: 0.14, blue: 0.05).opacity(0.1)

    private var inviteLink: URL { URL(string: "https://runnin.org/#ven=\(mitId)")! }

    /// løb pr. ven (fra loebPerRace vendt om)
    private func løbFor(_ v: Ven) -> [String] {
        venner.loebPerRace.filter { $0.value.contains(where: { $0.id == v.id }) }.map(\.key).sorted()
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack {
                Text(lang.t("Venner", "Friends")).font(.system(size: 24, weight: .bold)).foregroundColor(ink)
                Spacer()
                Button { dismiss() } label: {
                    Image(systemName: "xmark").font(.system(size: 13, weight: .semibold))
                        .foregroundColor(.secondary).frame(width: 30, height: 30)
                        .background(Color.black.opacity(0.05)).clipShape(Circle())
                }
            }
            .padding(.top, 18).padding(.bottom, 14)

            ShareLink(item: inviteLink,
                      message: Text(lang.t("Følg mine løb på Runnin", "Follow my races on Runnin"))) {
                HStack(spacing: 8) {
                    Image(systemName: "person.badge.plus").font(.system(size: 15, weight: .semibold))
                    Text(lang.t("Invitér en ven", "Invite a friend")).font(.system(size: 15, weight: .semibold))
                }
                .foregroundColor(.white).frame(maxWidth: .infinity).padding(.vertical, 14)
                .background(coral).clipShape(RoundedRectangle(cornerRadius: 14))
            }
            .padding(.bottom, 14)

            Toggle(isOn: Binding(
                get: { venner.delTilmeldinger },
                set: { if let t = auth.token { venner.sætDel($0, token: t) } }
            )) {
                VStack(alignment: .leading, spacing: 2) {
                    Text(lang.t("Del mine tilmeldinger", "Share my registrations"))
                        .font(.system(size: 14, weight: .semibold)).foregroundColor(ink)
                    Text(lang.t("Venner får besked når du tilmelder dig et løb", "Friends get notified when you register for a race"))
                        .font(.system(size: 12)).foregroundColor(muted)
                        .fixedSize(horizontal: false, vertical: true)
                }
            }
            .tint(coral)
            .padding(.vertical, 11).padding(.horizontal, 13)
            .overlay(RoundedRectangle(cornerRadius: 14).stroke(hairline))
            .padding(.bottom, 18)

            if venner.venner.isEmpty {
                VStack(spacing: 8) {
                    Image(systemName: "person.2").font(.system(size: 34, weight: .light)).foregroundColor(ink.opacity(0.4))
                    Text(lang.t("Ingen venner endnu", "No friends yet")).font(.system(size: 16, weight: .semibold)).foregroundColor(ink)
                    Text(lang.t("Del dit invite-link - så kan I se hinandens løb og hvem der skal løbe hvad.",
                                "Share your invite link - then you can see each other's races and who's running what."))
                        .font(.system(size: 14)).foregroundColor(muted).multilineTextAlignment(.center)
                }
                .frame(maxWidth: .infinity).padding(.top, 40).padding(.horizontal, 20)
            } else {
                ScrollView {
                    LazyVStack(spacing: 10) {
                        ForEach(venner.venner) { v in
                            venRække(v)
                        }
                        Color.clear.frame(height: 40)
                    }
                }
            }
            Spacer(minLength: 0)
        }
        .padding(.horizontal, 22)
        .background(paper.ignoresSafeArea())
        .presentationDetents([.large])
    }

    private func venRække(_ v: Ven) -> some View {
        let løb = løbFor(v)
        return VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 11) {
                avatar(v)
                Text(v.navn).font(.system(size: 15, weight: .semibold)).foregroundColor(ink)
                Spacer()
                if !løb.isEmpty {
                    Text(lang.t("\(løb.count) løb", "\(løb.count) races")).font(.system(size: 12)).foregroundColor(muted)
                }
            }
            ForEach(løb.prefix(4), id: \.self) { n in
                HStack(spacing: 6) {
                    Circle().fill(coral).frame(width: 5, height: 5)
                    Text(n).font(.system(size: 13)).foregroundColor(muted).lineLimit(1)
                }
                .padding(.leading, 46)
            }
        }
        .padding(.vertical, 12).padding(.horizontal, 13)
        .background(Color.white)
        .overlay(RoundedRectangle(cornerRadius: 14).stroke(hairline))
        .clipShape(RoundedRectangle(cornerRadius: 14))
    }

    @ViewBuilder private func avatar(_ v: Ven) -> some View {
        ZStack {
            Circle().fill(ink)
            if let a = v.avatar, let url = URL(string: a) {
                AsyncImage(url: url) { $0.resizable().scaledToFill() } placeholder: {
                    Text(v.initialer).font(.system(size: 13, weight: .bold)).foregroundColor(paper)
                }
            } else {
                Text(v.initialer).font(.system(size: 13, weight: .bold)).foregroundColor(paper)
            }
        }
        .frame(width: 34, height: 34).clipShape(Circle())
    }
}
