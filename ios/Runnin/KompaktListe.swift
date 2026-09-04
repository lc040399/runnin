import SwiftUI

/// Genbrugelig kompakt løbs-liste - bruges til søge-resultater (under søgefeltet)
/// og til stak-arket (flere løb på samme kort-punkt).
struct KompaktListe: View {
    let løb: [Race]
    var onVælg: (Race) -> Void

    private let ink = Color(red: 0.22, green: 0.14, blue: 0.05)
    private let muted = Color(red: 0.49, green: 0.42, blue: 0.31)
    private let coral = Color(red: 0.75, green: 0.35, blue: 0.0)
    private let hairline = Color(red: 0.22, green: 0.14, blue: 0.05).opacity(0.1)

    var body: some View {
        ScrollView {
            LazyVStack(spacing: 6) {
                ForEach(løb) { r in
                    Button { onVælg(r) } label: { række(r) }.buttonStyle(.plain)
                }
            }
        }
        .scrollDismissesKeyboard(.interactively)
    }

    private func række(_ r: Race) -> some View {
        HStack(spacing: 11) {
            Circle().fill(r.typeColor).frame(width: 9, height: 9)
            VStack(alignment: .leading, spacing: 2) {
                Text(r.n).font(.system(size: 14, weight: .semibold)).foregroundColor(ink).lineLimit(1)
                Text("\(r.distLabel) · \(r.c) \(r.flag)").font(.system(size: 12)).foregroundColor(muted).lineLimit(1)
            }
            Spacer(minLength: 8)
            Text(r.datoLabel).font(.system(size: 11.5)).foregroundColor(muted).lineLimit(1).fixedSize()
        }
        .padding(.vertical, 10).padding(.horizontal, 13)
        .background(Color.white)
        .overlay(RoundedRectangle(cornerRadius: 12).stroke(hairline))
        .clipShape(RoundedRectangle(cornerRadius: 12))
    }
}

/// Ark der viser flere løb på samme kort-punkt (fx en by med mange løbsserier).
struct StakSheet: View {
    let løb: [Race]
    @ObservedObject private var lang = Lang.shared
    var onVælg: (Race) -> Void
    @Environment(\.dismiss) private var dismiss

    private let paper = Color(red: 0.96, green: 0.953, blue: 0.933)
    private let ink = Color(red: 0.22, green: 0.14, blue: 0.05)
    private let muted = Color(red: 0.49, green: 0.42, blue: 0.31)

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack {
                VStack(alignment: .leading, spacing: 2) {
                    Text(løb.first?.c ?? "").font(.system(size: 20, weight: .bold)).foregroundColor(ink)
                    Text("\(løb.count) \(lang.t("løb her", "races here"))").font(.system(size: 13)).foregroundColor(muted)
                }
                Spacer()
                Button { dismiss() } label: {
                    Image(systemName: "xmark").font(.system(size: 13, weight: .semibold))
                        .foregroundColor(.secondary).frame(width: 30, height: 30)
                        .background(Color.black.opacity(0.05)).clipShape(Circle())
                }
            }
            .padding(.top, 18).padding(.bottom, 12)

            KompaktListe(løb: løb.sorted { ($0.dt ?? $0.m ?? "9999") < ($1.dt ?? $1.m ?? "9999") },
                         onVælg: onVælg)
        }
        .padding(.horizontal, 22)
        .background(paper.ignoresSafeArea())
        .presentationDetents([.medium, .large])
    }
}
