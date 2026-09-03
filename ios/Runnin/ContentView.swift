import SwiftUI

struct ContentView: View {
    @StateObject private var store = RaceStore()
    @StateObject private var auth = Auth()
    @State private var selected: Race?
    @State private var showFilters = false
    @State private var showLogin = false
    @State private var visProfil = false
    @State private var tab: Tab = .kort
    @FocusState private var searchFocused: Bool

    private let paper = Color(red: 0.96, green: 0.953, blue: 0.933)
    private let ink = Color(red: 0.22, green: 0.14, blue: 0.05)
    private let coral = Color(red: 0.75, green: 0.35, blue: 0.0)
    private let hairline = Color(red: 0.22, green: 0.14, blue: 0.05).opacity(0.12)

    var body: some View {
        ZStack(alignment: .bottom) {
            tabContent
                .frame(maxWidth: .infinity, maxHeight: .infinity)
                .background(
                    MapView(store: store, selected: $selected).ignoresSafeArea()
                )

            BottomNav(tab: $tab)
                .padding(.horizontal, 22)
                .padding(.bottom, 2)
        }
        .sheet(item: $selected) { RaceDetailView(race: $0) }
        .sheet(isPresented: $showFilters) { FilterSheet(store: store) }
        .sheet(isPresented: $showLogin) { LoginView(auth: auth) }
    }

    @ViewBuilder private var tabContent: some View {
        switch tab {
        case .kort:
            VStack(spacing: 10) {
                header
                searchBar
                Spacer()
                counter.padding(.bottom, 74)
            }
            .padding(.horizontal, 16)
            .padding(.top, 6)
        case .liste:
            ListeView(store: store, selected: $selected)
        case .top:
            KommerSnartView(titel: "Leaderboards", ikon: "trophy")
        case .mine:
            mineTab
        }
    }

    // MARK: - header m. logo + profil/login

    private var header: some View {
        HStack(spacing: 9) {
            if let logo = UIImage(named: "mark") {
                Image(uiImage: logo).resizable().scaledToFit().frame(width: 26, height: 26)
            }
            Text("RUNNIN").font(.system(size: 15, weight: .heavy)).kerning(2.5).foregroundColor(ink)
            Spacer()
            profilKnap
        }
        .padding(.top, 6)
    }

    @ViewBuilder private var profilKnap: some View {
        if let user = auth.user {
            Button { visProfil = true } label: {
                HStack(spacing: 7) {
                    ZStack {
                        Circle().fill(ink)
                        Text(user.initialer).font(.system(size: 11, weight: .bold)).foregroundColor(paper)
                    }
                    .frame(width: 30, height: 30)
                    Text(user.navn.split(separator: " ").first.map(String.init) ?? user.navn)
                        .font(.system(size: 13, weight: .semibold)).foregroundColor(ink).lineLimit(1)
                }
                .padding(.leading, 4).padding(.trailing, 13).padding(.vertical, 4)
                .background(paper).clipShape(Capsule())
                .overlay(Capsule().stroke(hairline)).shadow(color: .black.opacity(0.05), radius: 6, y: 2)
            }
            .confirmationDialog(user.navn, isPresented: $visProfil, titleVisibility: .visible) {
                Button("Log ud", role: .destructive) { auth.logout() }
            }
        } else {
            Button { showLogin = true } label: {
                Text("Log ind").font(.system(size: 13, weight: .semibold)).foregroundColor(ink)
                    .padding(.horizontal, 16).padding(.vertical, 9)
                    .background(paper).clipShape(Capsule())
                    .overlay(Capsule().stroke(hairline)).shadow(color: .black.opacity(0.05), radius: 6, y: 2)
            }
        }
    }

    // MARK: - søgebar

    private var searchBar: some View {
        HStack(spacing: 10) {
            Image(systemName: "magnifyingglass").font(.system(size: 15)).foregroundColor(.secondary)
            TextField("Søg løb eller by…", text: $store.search)
                .font(.system(size: 15)).foregroundColor(ink)
                .focused($searchFocused)
                .submitLabel(.search)
                .onSubmit { searchFocused = false }
            if !store.search.isEmpty {
                Button { store.search = "" } label: {
                    Image(systemName: "xmark.circle.fill").foregroundColor(Color.secondary.opacity(0.6))
                }
            }
            Button { searchFocused = false; showFilters = true } label: {
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
        .toolbar {
            ToolbarItemGroup(placement: .keyboard) {
                Spacer()
                Button("Færdig") { searchFocused = false }.fontWeight(.semibold)
            }
        }
    }

    private var counter: some View {
        HStack(spacing: 3) {
            CountingNumber(value: Double(store.filtered.count))
            Text("løb på kortet")
        }
        .animation(.easeOut(duration: 0.5), value: store.filtered.count)
        .font(.system(size: 12)).foregroundColor(.secondary)
        .padding(.vertical, 8).padding(.horizontal, 16)
        .background(paper.opacity(0.9))
        .background(.ultraThinMaterial)
        .clipShape(Capsule())
        .overlay(Capsule().stroke(hairline))
        .shadow(color: .black.opacity(0.05), radius: 8, y: 2)
    }

    // MARK: - Mine løb (kræver login)

    @ViewBuilder private var mineTab: some View {
        if auth.user != nil {
            KommerSnartView(titel: "Mine løb", ikon: "heart")
        } else {
            VStack(spacing: 16) {
                Image(systemName: "heart").font(.system(size: 40, weight: .light)).foregroundColor(ink.opacity(0.5))
                Text("Log ind for at gemme løb").font(.system(size: 20, weight: .bold)).foregroundColor(ink)
                Text("Så følger dine gemte løb dig på tværs af enheder.")
                    .multilineTextAlignment(.center).font(.system(size: 15)).foregroundColor(.secondary)
                    .padding(.horizontal, 40)
                Button { showLogin = true } label: {
                    Text("Log ind eller opret konto").font(.system(size: 15, weight: .semibold))
                        .foregroundColor(.white).padding(.vertical, 14).padding(.horizontal, 26)
                        .background(coral).clipShape(RoundedRectangle(cornerRadius: 14))
                }
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .background(paper.ignoresSafeArea())
        }
    }
}
