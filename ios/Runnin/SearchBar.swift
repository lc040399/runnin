import SwiftUI

/// Genbrugelig søgebar (Kort + Liste) med premium fokus-animation + filter-knap.
struct SearchBar: View {
    @ObservedObject var store: RaceStore
    @ObservedObject private var lang = Lang.shared
    @FocusState.Binding var focused: Bool
    var onFilter: () -> Void

    private let paper = Color(red: 0.96, green: 0.953, blue: 0.933)
    private let ink = Color(red: 0.22, green: 0.14, blue: 0.05)
    private let coral = Color(red: 0.75, green: 0.35, blue: 0.0)
    private let hairline = Color(red: 0.22, green: 0.14, blue: 0.05).opacity(0.12)

    var body: some View {
        HStack(spacing: 10) {
            Image(systemName: "magnifyingglass")
                .font(.system(size: 15, weight: focused ? .semibold : .regular))
                .foregroundColor(focused ? ink : .secondary)
            TextField(lang.t("Søg løb eller by…", "Search race or city…"), text: $store.search)
                .font(.system(size: 15)).foregroundColor(ink)
                .focused($focused)
                .submitLabel(.search)
                .onSubmit { focused = false }
            if !store.search.isEmpty {
                Button {
                    withAnimation(.spring(response: 0.3, dampingFraction: 0.7)) { store.search = "" }
                } label: {
                    Image(systemName: "xmark.circle.fill").foregroundColor(Color.secondary.opacity(0.55))
                }
                .transition(.scale.combined(with: .opacity))
            }
            Button { focused = false; onFilter() } label: { filterIkon }
                .buttonStyle(PressableStyle())
                .accessibilityLabel(lang.t("Filtre", "Filters"))
        }
        .padding(.leading, 16).padding(.trailing, 6).padding(.vertical, 7)
        .background(paper)
        .overlay(Capsule().stroke(focused ? ink : hairline, lineWidth: focused ? 1.6 : 1))
        .clipShape(Capsule())
        .shadow(color: .black.opacity(focused ? 0.13 : 0.06),
                radius: focused ? 16 : 10, y: focused ? 5 : 3)
        .animation(.spring(response: 0.34, dampingFraction: 0.8), value: focused)
        .animation(.spring(response: 0.3, dampingFraction: 0.7), value: store.search.isEmpty)
        .toolbar {
            ToolbarItemGroup(placement: .keyboard) {
                Spacer()
                Button(lang.t("Færdig", "Done")) { focused = false }.fontWeight(.semibold)
            }
        }
    }

    private var filterIkon: some View {
        Image(systemName: "line.3.horizontal.decrease")
            .font(.system(size: 15, weight: .semibold)).foregroundColor(.white)
            .frame(width: 34, height: 34)
            .background(store.aktiveFiltre > 0 ? coral : ink)
            .clipShape(Circle())
            .overlay(alignment: .topTrailing) {
                if store.aktiveFiltre > 0 {
                    Circle().fill(.white).frame(width: 9, height: 9)
                        .overlay(Circle().fill(coral).frame(width: 6, height: 6))
                        .offset(x: 1, y: -1)
                        .transition(.scale.combined(with: .opacity))
                }
            }
            .animation(.spring(response: 0.3, dampingFraction: 0.65), value: store.aktiveFiltre)
    }
}
