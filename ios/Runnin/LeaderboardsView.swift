import SwiftUI

struct TopEntry: Codable, Identifiable {
    let navn: String
    let tid: String
    let løb: String
    let cc: String
    let by: String
    let pace: String
    var id: String { navn + tid + løb }
    var flag: String { Race.flagEmoji(cc) }
}

struct Toplister: Codable {
    let opdateret: String
    let kilde: String
    let nordiskKilde: String?
    let boards: [String: [TopEntry]]
    let nordisk: [String: [TopEntry]]
}

/// Toplister-store: cache/bundle straks + remote-refresh fra runnin.org (OTA for data).
final class TopStore: ObservableObject {
    @Published var data: Toplister?
    init() {
        if let d = RemoteData.loadLocal("toplister.json") {
            data = try? JSONDecoder().decode(Toplister.self, from: d)
        }
        RemoteData.refresh("toplister.json", minBytes: 500) { [weak self] d in
            guard let t = try? JSONDecoder().decode(Toplister.self, from: d) else { return }
            DispatchQueue.main.async { self?.data = t }
        }
    }
}

/// Native leaderboards - verden (RunSignup) / nordisk (EQ Timing), pr. distance.
struct LeaderboardsView: View {
    @StateObject private var store = TopStore()
    @ObservedObject private var lang = Lang.shared
    @State private var region = "nordisk"
    @State private var kategori = "marathon"

    private let paper = Color(red: 0.96, green: 0.953, blue: 0.933)
    private let ink = Color(red: 0.22, green: 0.14, blue: 0.05)
    private let muted = Color(red: 0.49, green: 0.42, blue: 0.31)
    private let coral = Color(red: 0.75, green: 0.35, blue: 0.0)
    private let hairline = Color(red: 0.22, green: 0.14, blue: 0.05).opacity(0.1)

    private let kategorier = [("marathon", "Marathon"), ("half", "Half"), ("10k", "10K"), ("5k", "5K")]

    private var entries: [TopEntry] {
        guard let t = store.data else { return [] }
        return (region == "nordisk" ? t.nordisk : t.boards)[kategori] ?? []
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack(alignment: .firstTextBaseline) {
                Text("Leaderboards").font(.system(size: 24, weight: .bold)).foregroundColor(ink)
                Spacer()
                if let d = store.data?.opdateret {
                    Text(lang.t("opdateret \(kortDato(d))", "updated \(kortDato(d))")).font(.system(size: 11.5)).foregroundColor(muted)
                }
            }
            .padding(.horizontal, 4).padding(.bottom, 10)

            Picker("", selection: $region) {
                Text(lang.t("Nordisk", "Nordic")).tag("nordisk")
                Text(lang.t("Verden", "World")).tag("verden")
            }
            .pickerStyle(.segmented)
            .padding(.bottom, 10)

            HStack(spacing: 7) {
                ForEach(kategorier, id: \.0) { key, label in
                    let on = key == kategori
                    Button { withAnimation(.easeOut(duration: 0.15)) { kategori = key } } label: {
                        Text(label).font(.system(size: 13, weight: .semibold))
                            .foregroundColor(on ? .white : ink)
                            .padding(.vertical, 8).frame(maxWidth: .infinity)
                            .background(on ? ink : Color.white)
                            .overlay(Capsule().stroke(hairline, lineWidth: on ? 0 : 1))
                            .clipShape(Capsule())
                    }
                }
            }
            .padding(.bottom, 12)

            if entries.isEmpty {
                VStack(spacing: 8) {
                    Image(systemName: "trophy").font(.system(size: 30, weight: .light)).foregroundColor(ink.opacity(0.4))
                    Text(lang.t("Ingen resultater i denne kategori endnu.", "No results in this category yet.")).font(.system(size: 14)).foregroundColor(muted)
                        .multilineTextAlignment(.center)
                }
                .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else {
                ScrollView {
                    LazyVStack(spacing: 7) {
                        ForEach(Array(entries.prefix(25).enumerated()), id: \.element.id) { i, e in
                            række(i + 1, e)
                        }
                        Color.clear.frame(height: 90)
                    }
                }
            }
        }
        .padding(.horizontal, 16).padding(.top, 6)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(paper.ignoresSafeArea())
        .onAppear { vælgFørsteMedData() }
        .onChange(of: region) { _ in vælgFørsteMedData() }
    }

    /// undgå at lande på en tom kategori - hop til den første med resultater
    private func vælgFørsteMedData() {
        guard let t = store.data else { return }
        let board = region == "nordisk" ? t.nordisk : t.boards
        if (board[kategori] ?? []).isEmpty {
            kategori = kategorier.first { !(board[$0.0] ?? []).isEmpty }?.0 ?? kategori
        }
    }

    private func række(_ rank: Int, _ e: TopEntry) -> some View {
        HStack(spacing: 12) {
            Text("\(rank)")
                .font(.system(size: 14, weight: .bold)).foregroundColor(rank <= 3 ? .white : muted)
                .frame(width: 26, height: 26)
                .background(rank <= 3 ? coral : Color.clear)
                .clipShape(Circle())
            VStack(alignment: .leading, spacing: 2) {
                Text("\(e.navn) \(e.flag)").font(.system(size: 14, weight: .semibold)).foregroundColor(ink).lineLimit(1)
                Text(e.løb).font(.system(size: 11.5)).foregroundColor(muted).lineLimit(1)
            }
            Spacer(minLength: 6)
            VStack(alignment: .trailing, spacing: 2) {
                Text(e.tid).font(.system(size: 14, weight: .bold)).foregroundColor(ink).monospacedDigit()
                Text("\(e.pace)/km").font(.system(size: 11)).foregroundColor(muted).monospacedDigit()
            }
        }
        .padding(.vertical, 9).padding(.horizontal, 12)
        .background(Color.white)
        .overlay(RoundedRectangle(cornerRadius: 12).stroke(hairline))
        .clipShape(RoundedRectangle(cornerRadius: 12))
    }

    private func kortDato(_ iso: String) -> String {
        let mdr = lang.erDansk
            ? ["", "jan","feb","mar","apr","maj","jun","jul","aug","sep","okt","nov","dec"]
            : ["", "Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"]
        guard iso.count == 10, let mm = Int(iso.dropFirst(5).prefix(2)), let dd = Int(iso.suffix(2)) else { return iso }
        return lang.erDansk ? "\(dd). \(mdr[mm])" : "\(mdr[mm]) \(dd)"
    }
}
