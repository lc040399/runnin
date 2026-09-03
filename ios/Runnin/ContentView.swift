import SwiftUI

struct ContentView: View {
    @State private var selected: Race?
    private let paper = Color(red: 0.96, green: 0.953, blue: 0.933)
    private let ink = Color(red: 0.22, green: 0.14, blue: 0.05)

    var body: some View {
        ZStack(alignment: .top) {
            MapView(selected: $selected)
                .ignoresSafeArea()

            HStack(spacing: 8) {
                Text("RUNNIN")
                    .font(.system(size: 15, weight: .heavy))
                    .kerning(2.5)
                    .foregroundColor(ink)
                Spacer()
            }
            .padding(.horizontal, 20)
            .padding(.vertical, 12)
            .background(
                paper.opacity(0.82)
                    .background(.ultraThinMaterial)
                    .ignoresSafeArea(edges: .top)
            )
        }
        .sheet(item: $selected) { race in
            RaceDetailView(race: race)
        }
    }
}
