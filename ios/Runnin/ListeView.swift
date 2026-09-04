import SwiftUI

/// Native listevisning - bruges til både "Kommende løb" (filtreret) og "Mine løb" (gemte).
struct ListeView: View {
    @ObservedObject var store: RaceStore
    @ObservedObject var saved: Saved
    @ObservedObject private var lang = Lang.shared
    @Binding var selected: Race?
    var kilde: [Race]? = nil                 // nil = store.filtered
    var titel: String? = nil                 // nil = "Kommende løb"/"Upcoming races"
    var visAntal = true
    var tomTekst: String? = nil              // nil = standard "ingen løb"-tekst

    private let paper = Color(red: 0.96, green: 0.953, blue: 0.933)
    private let ink = Color(red: 0.22, green: 0.14, blue: 0.05)
    private let muted = Color(red: 0.49, green: 0.42, blue: 0.31)
    private let coral = Color(red: 0.75, green: 0.35, blue: 0.0)
    private let hairline = Color(red: 0.22, green: 0.14, blue: 0.05).opacity(0.1)

    private var liste: [Race] {
        (kilde ?? store.filtered).sorted { ($0.dt ?? $0.m ?? "9999") < ($1.dt ?? $1.m ?? "9999") }
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack(alignment: .firstTextBaseline) {
                Text(titel ?? lang.t("Kommende løb", "Upcoming races"))
                    .font(.system(size: 24, weight: .bold)).foregroundColor(ink)
                Spacer()
                if visAntal {
                    HStack(spacing: 3) {
                        CountingNumber(value: Double(liste.count))
                        Text(lang.t("løb", "races"))
                    }
                    .font(.system(size: 13)).foregroundColor(muted)
                    .animation(.easeOut(duration: 0.5), value: liste.count)
                }
            }
            .padding(.horizontal, 4).padding(.bottom, 12)

            if liste.isEmpty {
                VStack(spacing: 8) {
                    Image(systemName: "magnifyingglass").font(.system(size: 30, weight: .light))
                        .foregroundColor(ink.opacity(0.4))
                    Text(tomTekst ?? lang.t("Ingen løb med de filtre.", "No races match these filters."))
                        .font(.system(size: 15)).foregroundColor(muted).multilineTextAlignment(.center)
                }
                .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else {
                ScrollView {
                    LazyVStack(spacing: 8) {
                        ForEach(liste) { r in
                            Button { selected = r } label: { række(r) }.buttonStyle(.plain)
                        }
                        Color.clear.frame(height: 90)
                    }
                }
                .scrollDismissesKeyboard(.interactively)
            }
        }
    }

    private func række(_ r: Race) -> some View {
        HStack(spacing: 11) {
            Circle().fill(r.typeColor).frame(width: 9, height: 9)
            VStack(alignment: .leading, spacing: 2) {
                Text(r.n).font(.system(size: 14, weight: .semibold)).foregroundColor(ink).lineLimit(1)
                Text("\(r.distLabel) · \(r.c) \(r.flag)").font(.system(size: 12)).foregroundColor(muted).lineLimit(1)
            }
            Spacer(minLength: 8)
            if saved.erGemt(r.n) {
                Image(systemName: "heart.fill").font(.system(size: 12)).foregroundColor(coral)
            }
            Text(r.datoLabel).font(.system(size: 11.5)).foregroundColor(muted).lineLimit(1).fixedSize()
        }
        .padding(.vertical, 10).padding(.horizontal, 13)
        .background(Color.white)
        .overlay(RoundedRectangle(cornerRadius: 12).stroke(hairline))
        .clipShape(RoundedRectangle(cornerRadius: 12))
    }
}

/// Rolig placeholder for faner der endnu ikke er bygget native.
struct KommerSnartView: View {
    let titel: String
    let ikon: String
    private let paper = Color(red: 0.96, green: 0.953, blue: 0.933)
    private let ink = Color(red: 0.22, green: 0.14, blue: 0.05)
    private let muted = Color(red: 0.49, green: 0.42, blue: 0.31)

    var body: some View {
        VStack(spacing: 14) {
            Image(systemName: ikon).font(.system(size: 40, weight: .light)).foregroundColor(ink.opacity(0.5))
            Text(titel).font(.system(size: 22, weight: .bold)).foregroundColor(ink)
            Text(T("Kommer snart i den native app.", "Coming soon in the native app.")).font(.system(size: 15)).foregroundColor(muted)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(paper.ignoresSafeArea())
    }
}
