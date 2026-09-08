import SwiftUI

/// Del-ark: byg en animeret Instagram Story af løbet ("Skal løbe" eller "Gennemført"
/// med stats), vælg lys/mørk, forhåndsvis, og del til Instagram eller system-arket.
struct StoryShareView: View {
    let race: Race
    var tilmeldt: Bool = false
    var brugerNavn: String = ""
    @ObservedObject private var lang = Lang.shared
    @Environment(\.dismiss) private var dismiss
    @Environment(\.colorScheme) private var systemScheme

    @State private var mode: StoryCardSpec.Mode = .kommende
    @State private var mørk = true
    @State private var tid = ""
    @State private var placering = ""
    @State private var poster: UIImage?
    @State private var laver = false
    @State private var frem: Double = 0
    @State private var fejl: String?

    private let ink = Color(red: 0.22, green: 0.14, blue: 0.05)
    private let muted = Color(red: 0.49, green: 0.42, blue: 0.31)
    private let coral = Color(red: 0.75, green: 0.35, blue: 0.0)
    private let hairline = Color(red: 0.22, green: 0.14, blue: 0.05).opacity(0.16)

    var body: some View {
        VStack(spacing: 0) {
            Capsule().fill(Color.black.opacity(0.12)).frame(width: 38, height: 5)
                .padding(.top, 10).padding(.bottom, 16)

            ScrollView {
                VStack(spacing: 18) {
                    preview
                    if tilmeldt || mode == .gennemført { modeVælger }
                    if mode == .gennemført { statsFelter }
                    temaVælger
                }
                .padding(.horizontal, 22).padding(.bottom, 12)
            }

            delKnapper
                .padding(.horizontal, 22).padding(.top, 8).padding(.bottom, 22)
        }
        .background(Color(red: 0.96, green: 0.95, blue: 0.93).ignoresSafeArea())
        .onAppear {
            mørk = systemScheme == .dark
            if tilmeldt && !race.erKommende { mode = .gennemført }
            genPoster()
        }
        .onChange(of: mørk) { _ in genPoster() }
        .onChange(of: mode) { _ in genPoster() }
    }

    // MARK: preview

    private var preview: some View {
        ZStack {
            RoundedRectangle(cornerRadius: 20, style: .continuous)
                .fill(mørk ? Color(red: 0.11, green: 0.07, blue: 0.03) : Color(red: 0.95, green: 0.93, blue: 0.88))
            if let poster {
                Image(uiImage: poster).resizable().aspectRatio(contentMode: .fit)
                    .clipShape(RoundedRectangle(cornerRadius: 20, style: .continuous))
            } else {
                ProgressView().tint(coral)
            }
            if laver {
                RoundedRectangle(cornerRadius: 20, style: .continuous).fill(Color.black.opacity(0.45))
                VStack(spacing: 12) {
                    ProgressView(value: frem).progressViewStyle(.linear).tint(.white).frame(width: 160)
                    Text(lang.t("Bygger din story…", "Building your story…"))
                        .font(.system(size: 13, weight: .semibold)).foregroundColor(.white)
                }
            }
        }
        .frame(height: 420)
        .frame(maxWidth: .infinity)
    }

    // MARK: mode

    private var modeVælger: some View {
        HStack(spacing: 8) {
            segment(lang.t("Skal løbe", "Running"), aktiv: mode == .kommende) { mode = .kommende }
            segment(lang.t("Gennemført", "Finished"), aktiv: mode == .gennemført) { mode = .gennemført }
        }
    }

    private var statsFelter: some View {
        VStack(spacing: 10) {
            felt(ikon: "clock", plads: lang.t("Din tid, fx 3:42:18", "Your time, e.g. 3:42:18"), tekst: $tid, tal: true)
            felt(ikon: "rosette", plads: lang.t("Placering (valgfri), fx Top 12%", "Placement (optional), e.g. Top 12%"), tekst: $placering, tal: false)
        }
    }

    private var temaVælger: some View {
        HStack(spacing: 8) {
            segment(lang.t("Mørk", "Dark"), aktiv: mørk) { mørk = true }
            segment(lang.t("Lys", "Light"), aktiv: !mørk) { mørk = false }
        }
    }

    private var delKnapper: some View {
        VStack(spacing: 10) {
            if let fejl {
                Text(fejl).font(.system(size: 12.5, weight: .medium)).foregroundColor(muted)
                    .multilineTextAlignment(.center)
            }
            Button {
                Task { await del(instagramFørst: true) }
            } label: {
                HStack(spacing: 9) {
                    Image(systemName: "square.and.arrow.up.fill").font(.system(size: 15, weight: .semibold))
                    Text(StoryShare.harInstagram() ? lang.t("Del til Instagram", "Share to Instagram")
                                                    : lang.t("Del story", "Share story"))
                        .font(.system(size: 16, weight: .semibold))
                }
                .foregroundColor(.white).frame(maxWidth: .infinity)
                .padding(.vertical, 15)
                .background(mode == .gennemført ? Color(red: 0.28, green: 0.56, blue: 0.39) : coral)
                .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
            }
            .disabled(laver || (mode == .gennemført && tid.trimmingCharacters(in: .whitespaces).isEmpty))
            .opacity(laver || (mode == .gennemført && tid.trimmingCharacters(in: .whitespaces).isEmpty) ? 0.5 : 1)

            if StoryShare.harInstagram() {
                Button { Task { await del(instagramFørst: false) } } label: {
                    Text(lang.t("Gem eller del andetsteds", "Save or share elsewhere"))
                        .font(.system(size: 14, weight: .semibold)).foregroundColor(ink)
                        .frame(maxWidth: .infinity).padding(.vertical, 13)
                        .overlay(RoundedRectangle(cornerRadius: 14).stroke(hairline, lineWidth: 1))
                }
                .disabled(laver)
            }
        }
    }

    // MARK: byg + del

    private func spec() -> StoryCardSpec {
        var s = StoryCardSpec(
            mode: mode, mørk: mørk, lon: race.lo, lat: race.la,
            titel: race.n, bruger: brugerNavn.isEmpty ? "Runnin" : brugerNavn,
            attribution: race.delLink)
        if mode == .gennemført {
            s.bruger = race.datoLabel.isEmpty ? s.bruger : "\(s.bruger) · \(race.datoLabel)"
            s.s1v = tid.trimmingCharacters(in: .whitespaces); s.s1l = lang.t("Tid", "Time")
            if let (pace, label) = tempo() { s.s2v = pace; s.s2l = label }
            else { s.s2v = kmTekst(); s.s2l = lang.t("Distance", "Distance") }
            let p = placering.trimmingCharacters(in: .whitespaces)
            if !p.isEmpty { s.s3v = p; s.s3l = lang.t("Placering", "Placement") }
        } else {
            var m = "\(race.distLabel) · \(race.c) \(race.flag)"
            if !race.datoLabel.isEmpty { m += " · \(race.datoLabel)" }
            s.meta = m
        }
        return s
    }

    @MainActor
    private func genPoster() {
        let s = spec()
        Task {
            let r = StoryVideoRenderer()
            if let img = try? await r.poster(s) { poster = img }
        }
    }

    @MainActor
    private func del(instagramFørst: Bool) async {
        fejl = nil; laver = true; frem = 0
        defer { laver = false }
        let r = StoryVideoRenderer()
        do {
            let url = try await r.renderVideo(spec()) { p in Task { @MainActor in frem = p } }
            if instagramFørst, StoryShare.tilInstagram(video: url, attribution: race.delLink) {
                dismiss(); return
            }
            if let vc = topVC() { StoryShare.system(video: url, fra: vc) }
        } catch {
            fejl = lang.t("Kunne ikke bygge videoen. Prøv igen.", "Couldn't build the video. Try again.")
        }
    }

    // MARK: stats-hjælp

    /// tempo pr. km ud fra tid + løbets distance (mm:ss). nil hvis distance ukendt.
    private func tempo() -> (String, String)? {
        guard let sek = sekunder(tid), let km = kmForLøb(), km > 0 else { return nil }
        let perKm = Double(sek) / km
        let m = Int(perKm) / 60, s = Int(perKm) % 60
        return (String(format: "%d:%02d", m, s), lang.t("Tempo /km", "Pace /km"))
    }

    private func sekunder(_ t: String) -> Int? {
        let dele = t.split(separator: ":").map { Int($0.trimmingCharacters(in: .whitespaces)) }
        guard dele.allSatisfy({ $0 != nil }) else { return nil }
        let d = dele.compactMap { $0 }
        switch d.count {
        case 3: return d[0] * 3600 + d[1] * 60 + d[2]
        case 2: return d[0] * 60 + d[1]
        default: return nil
        }
    }

    /// distance i km: parse tal fra d-teksten, ellers kendt fra type.
    private func kmForLøb() -> Double? {
        let t = race.d.lowercased().replacingOccurrences(of: ",", with: ".")
        if let r = t.range(of: #"[0-9]+(\.[0-9]+)?"#, options: .regularExpression),
           let v = Double(t[r]), t.contains("km") { return v }
        switch race.t {
        case "marathon": return 42.195
        case "half": return 21.0975
        default: return nil
        }
    }

    private func kmTekst() -> String {
        if let km = kmForLøb() {
            return String(format: "%@ km", (km == km.rounded() ? String(Int(km)) : String(km)))
                .replacingOccurrences(of: ".", with: ",")
        }
        return race.distLabel
    }

    // MARK: byggeklodser

    private func segment(_ titel: String, aktiv: Bool, _ handling: @escaping () -> Void) -> some View {
        Button(action: handling) {
            Text(titel).font(.system(size: 14, weight: .semibold))
                .foregroundColor(aktiv ? .white : ink)
                .frame(maxWidth: .infinity).padding(.vertical, 11)
                .background(aktiv ? coral : Color.clear)
                .overlay(RoundedRectangle(cornerRadius: 11).stroke(aktiv ? Color.clear : hairline, lineWidth: 1))
                .clipShape(RoundedRectangle(cornerRadius: 11, style: .continuous))
        }
    }

    private func felt(ikon: String, plads: String, tekst: Binding<String>, tal: Bool) -> some View {
        HStack(spacing: 9) {
            Image(systemName: ikon).font(.system(size: 14, weight: .semibold)).foregroundColor(muted)
            TextField(plads, text: tekst)
                .font(.system(size: 15, weight: .medium)).foregroundColor(ink)
                .keyboardType(tal ? .numbersAndPunctuation : .default)
                .autocorrectionDisabled()
        }
        .padding(.vertical, 12).padding(.horizontal, 13)
        .overlay(RoundedRectangle(cornerRadius: 11).stroke(hairline, lineWidth: 1))
    }

    private func topVC() -> UIViewController? {
        guard let root = UIApplication.shared.connectedScenes
            .compactMap({ $0 as? UIWindowScene }).flatMap({ $0.windows })
            .first(where: { $0.isKeyWindow })?.rootViewController else { return nil }
        var vc = root
        while let p = vc.presentedViewController { vc = p }
        return vc
    }
}
