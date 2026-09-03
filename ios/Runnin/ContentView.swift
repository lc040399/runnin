import SwiftUI

struct ContentView: View {
    @StateObject private var store = RaceStore()
    @State private var selected: Race?
    @State private var showFilters = false
    @FocusState private var searchFocused: Bool

    private let paper = Color(red: 0.96, green: 0.953, blue: 0.933)
    private let ink = Color(red: 0.22, green: 0.14, blue: 0.05)
    private let coral = Color(red: 0.75, green: 0.35, blue: 0.0)
    private let hairline = Color(red: 0.22, green: 0.14, blue: 0.05).opacity(0.12)

    var body: some View {
        VStack(spacing: 10) {
            header
            searchBar
            Spacer()
            counter
                .padding(.bottom, 14)
        }
        .padding(.horizontal, 16)
        .padding(.top, 6)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(
            MapView(store: store, selected: $selected).ignoresSafeArea()
        )
        .sheet(item: $selected) { RaceDetailView(race: $0) }
        .sheet(isPresented: $showFilters) { FilterSheet(store: store) }
    }

    private var header: some View {
        HStack(spacing: 9) {
            if let logo = UIImage(named: "mark") {
                Image(uiImage: logo).resizable().scaledToFit().frame(width: 26, height: 26)
            }
            Text("RUNNIN").font(.system(size: 15, weight: .heavy)).kerning(2.5).foregroundColor(ink)
            Spacer()
        }
        .padding(.top, 6)
    }

    private var searchBar: some View {
        HStack(spacing: 10) {
            Image(systemName: "magnifyingglass").font(.system(size: 15)).foregroundColor(.secondary)
            TextField("Søg løb eller by…", text: $store.search)
                .font(.system(size: 15)).foregroundColor(ink)
                .focused($searchFocused)
                .submitLabel(.search)
            if !store.search.isEmpty {
                Button { store.search = "" } label: {
                    Image(systemName: "xmark.circle.fill").foregroundColor(.secondary.opacity(0.6))
                }
            }
            Button { searchFocused = false; showFilters = true } label: {
                ZStack(alignment: .topTrailing) {
                    Image(systemName: "line.3.horizontal.decrease")
                        .font(.system(size: 15, weight: .semibold)).foregroundColor(.white)
                        .frame(width: 34, height: 34)
                        .background(store.aktiveFiltre > 0 ? coral : ink)
                        .clipShape(Circle())
                    if store.aktiveFiltre > 0 {
                        Circle().fill(.white).frame(width: 9, height: 9)
                            .overlay(Circle().fill(coral).frame(width: 6, height: 6))
                            .offset(x: 2, y: -2)
                    }
                }
            }
        }
        .padding(.leading, 16).padding(.trailing, 6).padding(.vertical, 6)
        .background(paper)
        .overlay(Capsule().stroke(searchFocused ? ink : hairline, lineWidth: searchFocused ? 1.5 : 1))
        .clipShape(Capsule())
        .shadow(color: .black.opacity(0.06), radius: 10, y: 3)
        .animation(.easeOut(duration: 0.18), value: searchFocused)
    }

    private var counter: some View {
        Text("\(store.filtered.count.formatted(.number.grouping(.automatic))) løb på kortet")
            .font(.system(size: 12)).foregroundColor(.secondary)
            .padding(.vertical, 8).padding(.horizontal, 16)
            .background(paper.opacity(0.9))
            .background(.ultraThinMaterial)
            .clipShape(Capsule())
            .overlay(Capsule().stroke(hairline))
            .shadow(color: .black.opacity(0.05), radius: 8, y: 2)
    }
}
