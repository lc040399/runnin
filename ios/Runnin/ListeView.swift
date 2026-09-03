import SwiftUI

/// Native listevisning af de filtrerede løb - sorteret efter dato, tap → detalje.
struct ListeView: View {
    @ObservedObject var store: RaceStore
    @Binding var selected: Race?

    private let paper = Color(red: 0.96, green: 0.953, blue: 0.933)
    private let ink = Color(red: 0.22, green: 0.14, blue: 0.05)
    private let muted = Color(red: 0.49, green: 0.42, blue: 0.31)
    private let hairline = Color(red: 0.22, green: 0.14, blue: 0.05).opacity(0.1)

    private var sorteret: [Race] {
        store.filtered.sorted { ($0.dt ?? $0.m ?? "9999") < ($1.dt ?? $1.m ?? "9999") }
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack(alignment: .firstTextBaseline) {
                Text("Kommende løb")
                    .font(.system(size: 26, weight: .bold)).foregroundColor(ink)
                Spacer()
                HStack(spacing: 3) {
                    CountingNumber(value: Double(store.filtered.count))
                    Text("løb")
                }
                .font(.system(size: 13)).foregroundColor(muted)
                .animation(.easeOut(duration: 0.5), value: store.filtered.count)
            }
            .padding(.horizontal, 18).padding(.top, 8).padding(.bottom, 12)

            ScrollView {
                LazyVStack(spacing: 8) {
                    ForEach(sorteret) { r in
                        Button { selected = r } label: { række(r) }.buttonStyle(.plain)
                    }
                    Color.clear.frame(height: 90) // plads til bund-nav
                }
                .padding(.horizontal, 16)
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(paper.ignoresSafeArea())
    }

    private func række(_ r: Race) -> some View {
        HStack(spacing: 11) {
            Circle().fill(r.typeColor).frame(width: 9, height: 9)
            VStack(alignment: .leading, spacing: 2) {
                Text(r.n).font(.system(size: 14, weight: .semibold)).foregroundColor(ink)
                    .lineLimit(1)
                Text("\(r.d) · \(r.c) \(r.flag)")
                    .font(.system(size: 12)).foregroundColor(muted).lineLimit(1)
            }
            Spacer(minLength: 8)
            Text(r.datoLabel).font(.system(size: 11.5)).foregroundColor(muted)
                .lineLimit(1).fixedSize()
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
            Text("Kommer snart i den native app.")
                .font(.system(size: 15)).foregroundColor(muted)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(paper.ignoresSafeArea())
    }
}
