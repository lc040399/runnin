import SwiftUI

/// Bund-ark med alle filtre - Hvor / Når / Distance som chips, plus Nulstil/Vis.
struct FilterSheet: View {
    @ObservedObject var store: RaceStore
    @Environment(\.dismiss) private var dismiss

    private let ink = Color(red: 0.22, green: 0.14, blue: 0.05)
    private let coral = Color(red: 0.75, green: 0.35, blue: 0.0)
    private let hairline = Color(red: 0.22, green: 0.14, blue: 0.05).opacity(0.12)

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack {
                Text("Filtre").font(.system(size: 22, weight: .bold)).foregroundColor(ink)
                Spacer()
                Button { dismiss() } label: {
                    Image(systemName: "xmark").font(.system(size: 13, weight: .semibold))
                        .foregroundColor(.secondary).frame(width: 30, height: 30)
                        .background(Color.black.opacity(0.05)).clipShape(Circle())
                }
            }
            .padding(.top, 18).padding(.bottom, 4)

            ScrollView {
                VStack(alignment: .leading, spacing: 18) {
                    gruppe("Hvor") {
                        chips(Filtre.regioner.map { ($0.key, $0.label) },
                              valgt: store.region) { store.region = $0 }
                    }
                    gruppe("Når") {
                        chips([(nil, "Når som helst")] + Filtre.måneder.enumerated().map { (String($0.offset + 1), $0.element) },
                              valgt: store.month.map(String.init)) { store.month = $0.flatMap { Int($0) } }
                    }
                    gruppe("Distance") {
                        chips(Filtre.typer.map { ($0.key, $0.label) },
                              valgt: store.type) { store.type = $0 }
                    }
                }
                .padding(.top, 16).padding(.bottom, 12)
            }

            HStack(spacing: 10) {
                Button {
                    store.region = nil; store.month = nil; store.type = nil
                } label: {
                    Text("Nulstil").font(.system(size: 14, weight: .semibold))
                        .foregroundColor(.secondary)
                        .padding(.vertical, 13).padding(.horizontal, 20)
                        .overlay(RoundedRectangle(cornerRadius: 14).stroke(hairline))
                }
                .disabled(store.aktiveFiltre == 0)
                .opacity(store.aktiveFiltre == 0 ? 0.4 : 1)

                Button { dismiss() } label: {
                    HStack(spacing: 4) {
                        Text("Vis")
                        CountingNumber(value: Double(store.filtered.count))
                        Text("løb")
                    }
                    .animation(.easeOut(duration: 0.45), value: store.filtered.count)
                    .font(.system(size: 15, weight: .bold)).foregroundColor(.white)
                    .frame(maxWidth: .infinity).padding(.vertical, 14)
                    .background(coral).clipShape(RoundedRectangle(cornerRadius: 14))
                }
            }
            .padding(.top, 6).padding(.bottom, 8)
        }
        .padding(.horizontal, 22)
        .presentationDetents([.medium, .large])
    }

    @ViewBuilder private func gruppe<C: View>(_ titel: String, @ViewBuilder _ content: () -> C) -> some View {
        VStack(alignment: .leading, spacing: 9) {
            Text(titel.uppercased()).font(.system(size: 11.5, weight: .bold)).kerning(1)
                .foregroundColor(coral)
            content()
        }
    }

    @ViewBuilder private func chips(_ items: [(String?, String)], valgt: String?,
                                    _ vælg: @escaping (String?) -> Void) -> some View {
        FlowLayout(spacing: 8) {
            ForEach(items, id: \.1) { key, label in
                let on = key == valgt
                Button { vælg(on ? nil : key) } label: {
                    Text(label).font(.system(size: 13, weight: .medium))
                        .foregroundColor(on ? .white : ink)
                        .padding(.vertical, 9).padding(.horizontal, 15)
                        .background(on ? ink : Color(red: 0.99, green: 0.98, blue: 0.96))
                        .overlay(Capsule().stroke(hairline, lineWidth: on ? 0 : 1))
                        .clipShape(Capsule())
                }
            }
        }
    }
}

/// simpel flow-layout så chips ombryder pænt (iOS 16-kompatibel)
struct FlowLayout: Layout {
    var spacing: CGFloat = 8

    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        let maxW = proposal.width ?? .infinity
        var x: CGFloat = 0, y: CGFloat = 0, rowH: CGFloat = 0
        for v in subviews {
            let s = v.sizeThatFits(.unspecified)
            if x + s.width > maxW { x = 0; y += rowH + spacing; rowH = 0 }
            x += s.width + spacing; rowH = max(rowH, s.height)
        }
        return CGSize(width: maxW == .infinity ? x : maxW, height: y + rowH)
    }

    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        var x = bounds.minX, y = bounds.minY, rowH: CGFloat = 0
        for v in subviews {
            let s = v.sizeThatFits(.unspecified)
            if x + s.width > bounds.maxX { x = bounds.minX; y += rowH + spacing; rowH = 0 }
            v.place(at: CGPoint(x: x, y: y), proposal: ProposedViewSize(s))
            x += s.width + spacing; rowH = max(rowH, s.height)
        }
    }
}
