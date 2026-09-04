import SwiftUI
import MapKit

/// Detalje-ark for ét løb - navn, distance, sted, dato, pris + tilmeldingslink.
struct RaceDetailView: View {
    let race: Race
    @ObservedObject var saved: Saved
    var auth: Auth
    @Environment(\.dismiss) private var dismiss

    private let ink = Color(red: 0.22, green: 0.14, blue: 0.05)
    private let muted = Color(red: 0.49, green: 0.42, blue: 0.31)
    private let coral = Color(red: 0.75, green: 0.35, blue: 0.0)
    private let hairline = Color(red: 0.22, green: 0.14, blue: 0.05).opacity(0.18)

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            Capsule().fill(Color.black.opacity(0.12))
                .frame(width: 38, height: 5)
                .frame(maxWidth: .infinity)
                .padding(.top, 10).padding(.bottom, 18)

            Text(race.typeLabel.uppercased())
                .font(.system(size: 11, weight: .bold)).kerning(1.2)
                .foregroundColor(race.typeColor)

            Text(race.n)
                .font(.system(size: 26, weight: .bold))
                .foregroundColor(ink)
                .fixedSize(horizontal: false, vertical: true)
                .padding(.top, 5)

            Text("\(race.d) · \(race.c) \(race.flag)")
                .font(.system(size: 15))
                .foregroundColor(muted)
                .padding(.top, 10)

            if !race.datoLabel.isEmpty {
                Text(race.datoLabel)
                    .font(.system(size: 15))
                    .foregroundColor(muted)
                    .padding(.top, 3)
            }

            Text(race.p != nil ? "Startgebyr: fra \(Int(race.p!)) kr" : "Pris: se tilmeldingssiden")
                .font(.system(size: 15))
                .foregroundColor(muted)
                .padding(.top, 3)

            Button {
                åbnIKort()
            } label: {
                HStack(spacing: 7) {
                    Image(systemName: "map")
                        .font(.system(size: 14, weight: .semibold))
                    Text("Åbn i Kort")
                        .font(.system(size: 14, weight: .semibold))
                }
                .foregroundColor(coral)
                .padding(.vertical, 9).padding(.horizontal, 14)
                .overlay(RoundedRectangle(cornerRadius: 11).stroke(hairline, lineWidth: 1))
            }
            .buttonStyle(PressableStyle())
            .padding(.top, 14)

            Spacer(minLength: 20)

            HStack(spacing: 10) {
                let gemt = saved.erGemt(race.n)
                Button {
                    withAnimation(.spring(response: 0.3, dampingFraction: 0.6)) {
                        saved.toggle(race.n, auth: auth)
                    }
                } label: {
                    HStack(spacing: 7) {
                        Image(systemName: gemt ? "heart.fill" : "heart")
                            .font(.system(size: 15, weight: .semibold))
                        Text(gemt ? "Gemt" : "Gem")
                            .font(.system(size: 15, weight: .semibold))
                    }
                    .foregroundColor(gemt ? .white : ink)
                    .padding(.vertical, 15).padding(.horizontal, 20)
                    .background(gemt ? coral : Color.clear)
                    .overlay(RoundedRectangle(cornerRadius: 14).stroke(gemt ? Color.clear : hairline, lineWidth: 1))
                    .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
                }
                .buttonStyle(PressableStyle())

                if let u = race.u, let url = URL(string: u) {
                    Link(destination: url) {
                        HStack {
                            Text("Tilmeld på officiel side").font(.system(size: 16, weight: .semibold))
                            Spacer()
                            Text("→").font(.system(size: 16, weight: .semibold))
                        }
                        .foregroundColor(.white)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 15).padding(.horizontal, 18)
                        .background(ink)
                        .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
                    }
                    .simultaneousGesture(TapGesture().onEnded { sporKlik() })
                }
            }
        }
        .padding(.horizontal, 24)
        .padding(.bottom, 20)
        .presentationDetents([.height(400)])
        .presentationDragIndicator(.hidden)
    }

    /// launcher Apples native Kort-app på løbets placering (Guideline 4 - Design)
    private func åbnIKort() {
        let coord = CLLocationCoordinate2D(latitude: race.la, longitude: race.lo)
        let item = MKMapItem(placemark: MKPlacemark(coordinate: coord))
        item.name = race.n
        item.openInMaps(launchOptions: [MKLaunchOptionsMapCenterKey: NSValue(mkCoordinate: coord)])
    }

    /// anonym tælling af tilmeldings-klik (kun løbsnavn + platform, ingen bruger-/enheds-id)
    private func sporKlik() {
        var req = URLRequest(url: URL(string: "\(Auth.base)/rest/v1/reg_klik")!)
        req.httpMethod = "POST"
        req.setValue(Auth.anon, forHTTPHeaderField: "apikey")
        req.setValue("Bearer \(Auth.anon)", forHTTPHeaderField: "Authorization")
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        req.setValue("return=minimal", forHTTPHeaderField: "Prefer")
        req.httpBody = try? JSONSerialization.data(withJSONObject: ["race_n": race.n, "platform": "ios"])
        URLSession.shared.dataTask(with: req).resume()
    }
}
