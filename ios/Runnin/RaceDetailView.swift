import SwiftUI

/// Detalje-ark for ét løb - navn, distance, sted, dato, pris + tilmeldingslink.
struct RaceDetailView: View {
    let race: Race
    @Environment(\.dismiss) private var dismiss

    private let ink = Color(red: 0.22, green: 0.14, blue: 0.05)
    private let muted = Color(red: 0.49, green: 0.42, blue: 0.31)
    private let coral = Color(red: 0.75, green: 0.35, blue: 0.0)

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

            Spacer(minLength: 22)

            if let u = race.u, let url = URL(string: u) {
                Link(destination: url) {
                    HStack {
                        Text("Tilmeld på officiel side")
                            .font(.system(size: 16, weight: .semibold))
                        Spacer()
                        Text("→").font(.system(size: 16, weight: .semibold))
                    }
                    .foregroundColor(.white)
                    .padding(.vertical, 15).padding(.horizontal, 20)
                    .background(coral)
                    .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
                }
            }
        }
        .padding(.horizontal, 24)
        .padding(.bottom, 20)
        .presentationDetents([.height(320)])
        .presentationDragIndicator(.hidden)
    }
}
