import SwiftUI
import MapKit

/// Detalje-ark for ét løb - navn, distance, sted, dato, pris + tilmeldingslink.
struct RaceDetailView: View {
    let race: Race
    @ObservedObject var saved: Saved
    @ObservedObject private var lang = Lang.shared
    @ObservedObject private var klima = Klima.shared
    var auth: Auth
    var venner: [Ven] = []
    var efterGem: () -> Void = {}
    var kræverLogin: () -> Void = {}
    @Environment(\.dismiss) private var dismiss
    @State private var visBib = false
    @State private var bibUdkast = ""

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

            Text("\(race.distLabel) · \(race.c) \(race.flag)")
                .font(.system(size: 15))
                .foregroundColor(muted)
                .padding(.top, 10)

            if !race.datoLabel.isEmpty {
                Text(race.datoLabel)
                    .font(.system(size: 15))
                    .foregroundColor(muted)
                    .padding(.top, 3)
            }

            Text(race.p != nil ? lang.t("Startgebyr: fra \(Int(race.p!)) kr", "Entry fee: from \(Int(race.p!)) DKK")
                               : lang.t("Pris: se tilmeldingssiden", "Price: see registration page"))
                .font(.system(size: 15))
                .foregroundColor(muted)
                .padding(.top, 3)

            if !venner.isEmpty {
                HStack(spacing: 7) {
                    Image(systemName: "figure.run").font(.system(size: 13, weight: .semibold)).foregroundColor(coral)
                    Text(vennerLabel).font(.system(size: 14, weight: .medium)).foregroundColor(ink).lineLimit(1)
                }
                .padding(.top, 10)
            }

            if let c = klima.celle(la: race.la, lo: race.lo), let mi = løbsMåned, c.t[mi] != nil {
                klimaStrip(c, mi).padding(.top, 16)
            }

            HStack(spacing: 9) {
                Button {
                    åbnIKort()
                } label: {
                    HStack(spacing: 7) {
                        Image(systemName: "map")
                            .font(.system(size: 14, weight: .semibold))
                        Text(lang.t("Åbn i Kort", "Open in Maps"))
                            .font(.system(size: 14, weight: .semibold))
                    }
                    .foregroundColor(coral)
                    .padding(.vertical, 9).padding(.horizontal, 14)
                    .overlay(RoundedRectangle(cornerRadius: 11).stroke(hairline, lineWidth: 1))
                }
                .buttonStyle(PressableStyle())

                Button {
                    if auth.user == nil { kræverLogin(); return }
                    withAnimation(.spring(response: 0.3, dampingFraction: 0.6)) {
                        saved.toggleTilmeldt(race.n, auth: auth)
                    }
                } label: {
                    let er = saved.erTilmeldt(race.n)
                    HStack(spacing: 7) {
                        Image(systemName: er ? "checkmark.seal.fill" : "ticket")
                            .font(.system(size: 14, weight: .semibold))
                        Text(er ? lang.t("Tilmeldt", "Registered") : lang.t("Er tilmeldt?", "Registered?"))
                            .font(.system(size: 14, weight: .semibold))
                    }
                    .foregroundColor(er ? .white : coral)
                    .padding(.vertical, 9).padding(.horizontal, 14)
                    .background(er ? coral : Color.clear)
                    .overlay(RoundedRectangle(cornerRadius: 11).stroke(er ? Color.clear : hairline, lineWidth: 1))
                    .clipShape(RoundedRectangle(cornerRadius: 11, style: .continuous))
                }
                .buttonStyle(PressableStyle())

                ShareLink(item: race.delLink,
                          message: Text(lang.t("Skal vi løbe \(race.n)?", "Want to run \(race.n)?"))) {
                    HStack(spacing: 7) {
                        Image(systemName: "square.and.arrow.up")
                            .font(.system(size: 14, weight: .semibold))
                        Text(lang.t("Del", "Share"))
                            .font(.system(size: 14, weight: .semibold))
                    }
                    .foregroundColor(coral)
                    .padding(.vertical, 9).padding(.horizontal, 14)
                    .overlay(RoundedRectangle(cornerRadius: 11).stroke(hairline, lineWidth: 1))
                }
            }
            .padding(.top, 14)

            if saved.erTilmeldt(race.n) {
                HStack(spacing: 8) {
                    Image(systemName: "number").font(.system(size: 13, weight: .semibold)).foregroundColor(muted)
                    TextField(lang.t("Startnummer", "Bib number"), text: $bibUdkast)
                        .font(.system(size: 15, weight: .medium)).foregroundColor(ink)
                        .keyboardType(.numberPad)
                        .submitLabel(.done)
                        .onSubmit { saved.sætBib(race.n, bibUdkast, auth: auth) }
                    if !bibUdkast.isEmpty {
                        Button {
                            saved.sætBib(race.n, bibUdkast, auth: auth)
                            hideKeyboard()
                        } label: {
                            Text(lang.t("Gem", "Save")).font(.system(size: 13, weight: .semibold)).foregroundColor(coral)
                        }
                    }
                }
                .padding(.vertical, 10).padding(.horizontal, 13)
                .overlay(RoundedRectangle(cornerRadius: 11).stroke(hairline, lineWidth: 1))
                .padding(.top, 10)
                .transition(.opacity.combined(with: .move(edge: .top)))
            }

            Spacer(minLength: 20)

            HStack(spacing: 10) {
                let gemt = saved.erGemt(race.n)
                Button {
                    withAnimation(.spring(response: 0.3, dampingFraction: 0.6)) {
                        saved.toggle(race.n, auth: auth)
                    }
                    if saved.erGemt(race.n) { efterGem() }   // netop gemt → bed om notifikations-lov
                } label: {
                    HStack(spacing: 7) {
                        Image(systemName: gemt ? "heart.fill" : "heart")
                            .font(.system(size: 15, weight: .semibold))
                        Text(gemt ? lang.t("Gemt", "Saved") : lang.t("Gem", "Save"))
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
                            Text(lang.t("Tilmeld på officiel side", "Register on official site")).font(.system(size: 16, weight: .semibold))
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
        .presentationDetents([.height(detentHøjde)])
        .presentationDragIndicator(.hidden)
        .onAppear { bibUdkast = saved.bib(race.n) }
    }

    /// "Anna skal løbe" / "Anna og 2 andre skal løbe"
    private var vennerLabel: String {
        let navne = venner.map { $0.navn.split(separator: " ").first.map(String.init) ?? $0.navn }
        switch navne.count {
        case 0: return ""
        case 1: return lang.t("\(navne[0]) skal løbe", "\(navne[0]) is running")
        case 2: return lang.t("\(navne[0]) og \(navne[1]) skal løbe", "\(navne[0]) and \(navne[1]) are running")
        default: return lang.t("\(navne[0]) og \(navne.count - 1) andre skal løbe", "\(navne[0]) and \(navne.count - 1) others are running")
        }
    }

    private func hideKeyboard() {
        UIApplication.shared.sendAction(#selector(UIResponder.resignFirstResponder), to: nil, from: nil, for: nil)
    }

    /// ark-højde: vokser med det der vises (venner / bib / klima)
    private var detentHøjde: CGFloat {
        var h: CGFloat = 400
        if !venner.isEmpty { h += 30 }
        if saved.erTilmeldt(race.n) { h += 70 }
        if let mi = løbsMåned, let c = klima.celle(la: race.la, lo: race.lo), c.t[mi] != nil { h += 150 }
        return min(h, 660)
    }

    /// løbsmåned 0-11 (fra m "YYYY-MM", ellers dt)
    private var løbsMåned: Int? {
        if let m = race.m, m.count == 7, let mm = Int(m.suffix(2)) { return mm - 1 }
        if let dt = race.dt, dt.count == 10, let mm = Int(dt.dropFirst(5).prefix(2)) { return mm - 1 }
        return nil
    }

    /// vejr-graf: 12 måneders klima, løbsmåneden fremhævet (samme som web)
    @ViewBuilder private func klimaStrip(_ c: KlimaCelle, _ mi: Int) -> some View {
        let mdr = lang.erDansk
            ? ["jan", "feb", "mar", "apr", "maj", "jun", "jul", "aug", "sep", "okt", "nov", "dec"]
            : ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
        let gyldige = c.t.compactMap { $0 }
        let lo = gyldige.min() ?? 0, hi = gyldige.max() ?? 1
        VStack(alignment: .leading, spacing: 11) {
            HStack {
                Text(lang.t("Vejret på løbsdagen", "Race-day weather"))
                    .font(.system(size: 14, weight: .bold)).foregroundColor(ink)
                Spacer()
                Text(lang.t("historisk", "historical")).font(.system(size: 11, weight: .semibold)).foregroundColor(muted)
            }
            HStack(alignment: .bottom, spacing: 4) {
                ForEach(0..<12, id: \.self) { m in
                    let v = c.t[m]
                    let h = v == nil ? 4 : 4 + 52 * Double(v! - lo) / Double(max(hi - lo, 1))
                    VStack(spacing: 4) {
                        Text(m == mi && v != nil ? "\(v!)°" : "")   // temp-tal over den aktive søjle
                            .font(.system(size: 10, weight: .heavy)).foregroundColor(coral)
                            .frame(height: 13)
                        RoundedRectangle(cornerRadius: 3)
                            .fill(m == mi ? AnyShapeStyle(LinearGradient(colors: [Color(red: 0.9, green: 0.6, blue: 0.33), coral], startPoint: .top, endPoint: .bottom))
                                          : AnyShapeStyle(Color(red: 0.94, green: 0.89, blue: 0.82)))
                            .frame(height: h)
                        Text(mdr[m]).font(.system(size: 8.5, weight: m == mi ? .heavy : .semibold))
                            .foregroundColor(m == mi ? coral : muted)
                            .lineLimit(1).minimumScaleFactor(0.7).fixedSize()
                    }
                    .frame(maxWidth: .infinity)
                }
            }
            .frame(height: 74, alignment: .bottom)
            HStack(spacing: 16) {
                if let t = c.t[mi] {
                    (Text(lang.t("Løbsmåneden: ", "Race month: ")).foregroundColor(muted)
                     + Text("\(t)°").foregroundColor(ink).fontWeight(.bold))
                        .font(.system(size: 12.5, weight: .semibold))
                }
                if let r = c.r[mi] {
                    (Text(lang.t("Regn ~", "Rain ~")).foregroundColor(muted)
                     + Text("\(r)%").foregroundColor(ink).fontWeight(.bold))
                        .font(.system(size: 12.5, weight: .semibold))
                }
            }
        }
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
