import SwiftUI

/// gør [Race] Identifiable så stak-arket kan bruge .sheet(item:)
private struct StakBox: Identifiable {
    let løb: [Race]
    var id: String { løb.first.map { "\($0.la),\($0.lo)" } ?? "-" }
}

struct ContentView: View {
    @StateObject private var store = RaceStore()
    @StateObject private var auth = Auth()
    @StateObject private var saved = Saved()
    @StateObject private var mapCtrl = MapController()
    @ObservedObject private var lang = Lang.shared
    @State private var selected: Race?
    @State private var stak: [Race]?
    @State private var showFilters = false
    @State private var showLogin = false
    @State private var visProfil = false
    @State private var visSprog = false
    @State private var bekræftSlet = false
    @State private var tab: Tab = .kort
    @State private var didSetup = false
    @State private var ventendeSlug: String?
    @FocusState private var searchFocused: Bool

    private let paper = Color(red: 0.96, green: 0.953, blue: 0.933)
    private let ink = Color(red: 0.22, green: 0.14, blue: 0.05)
    private let coral = Color(red: 0.75, green: 0.35, blue: 0.0)
    private let hairline = Color(red: 0.22, green: 0.14, blue: 0.05).opacity(0.12)

    private var mineKilde: [Race] { store.all.filter { saved.erGemt($0.n) } }

    /// (gen)planlæg lokale påmindelser for de gemte løb
    private func planlægNotifikationer() { Notifikationer.shared.planlæg(for: mineKilde) }

    /// runnin.org/#slug eller /lob/slug/ → åbn løbets detalje (venter på data hvis nødvendigt)
    private func håndtérLink(_ url: URL) {
        var slug = url.fragment ?? ""
        if slug.isEmpty, url.path.hasPrefix("/lob/") {
            slug = url.path.replacingOccurrences(of: "/lob/", with: "").trimmingCharacters(in: CharacterSet(charactersIn: "/"))
        }
        guard !slug.isEmpty else { return }
        ventendeSlug = slug
        løsVentendeSlug()
    }

    private func løsVentendeSlug() {
        guard let slug = ventendeSlug, !store.all.isEmpty else { return }
        if let r = store.all.first(where: { $0.slug == slug }) {
            ventendeSlug = nil
            tab = .kort
            selected = r
        }
    }

    var body: some View {
        ZStack(alignment: .bottom) {
            tabContent
                .frame(maxWidth: .infinity, maxHeight: .infinity)
                .background(MapView(store: store, selected: $selected, stak: $stak, ctrl: mapCtrl).ignoresSafeArea())

            if tab == .kort && store.search.trimmingCharacters(in: .whitespaces).isEmpty {
                findMigKnap
                    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .bottomTrailing)
                    .padding(.trailing, 18).padding(.bottom, 150)
            }

            BottomNav(tab: $tab, badges: saved.navne.isEmpty ? [:] : [.mine: saved.navne.count])
                .padding(.horizontal, 22)
                .padding(.bottom, 2)
        }
        .sheet(item: $selected) { race in
            RaceDetailView(race: race, saved: saved, auth: auth,
                           efterGem: { Notifikationer.shared.bedOmLov(så: planlægNotifikationer) })
        }
        .sheet(item: Binding(get: { stak.map(StakBox.init) }, set: { stak = $0?.løb })) { box in
            StakSheet(løb: box.løb) { r in stak = nil; selected = r }
        }
        .sheet(isPresented: $showFilters) { FilterSheet(store: store) }
        .sheet(isPresented: $showLogin) { LoginView(auth: auth) }
        .onChange(of: auth.user?.id) { id in
            if id != nil { Task { await saved.syncMedSky(auth: auth) } } else { saved.ryd() }
        }
        .onChange(of: saved.navne) { _ in planlægNotifikationer() }     // gem/fjern → opdatér påmindelser
        .onChange(of: store.dataVersion) { _ in
            planlægNotifikationer()   // nye datoer via remote → opdatér
            løsVentendeSlug()
        }
        // universal links: runnin.org/#slug og runnin.org/lob/slug/ åbner løbet direkte
        .onContinueUserActivity(NSUserActivityTypeBrowsingWeb) { activity in
            guard let url = activity.webpageURL else { return }
            håndtérLink(url)
        }
        .onOpenURL { håndtérLink($0) }
        .alert(lang.t("Slet din konto?", "Delete your account?"), isPresented: $bekræftSlet) {
            Button(lang.t("Slet permanent", "Delete permanently"), role: .destructive) {
                Task { try? await auth.deleteAccount(); saved.ryd() }
            }
            Button(lang.t("Annullér", "Cancel"), role: .cancel) {}
        } message: {
            Text(lang.t("Din konto og alle gemte løb slettes permanent og kan ikke gendannes.",
                        "Your account and all saved races will be permanently deleted and cannot be recovered."))
        }
        .confirmationDialog(lang.t("Sprog", "Language"), isPresented: $visSprog, titleVisibility: .visible) {
            Button("Dansk") { lang.code = "da" }
            Button("English") { lang.code = "en" }
        }
        .onAppear {
            guard !didSetup else { return }; didSetup = true
            #if DEBUG
            // Kun til udvikling/screenshots (fjernes i Release-builds) - forudfyld søgning
            // eller spring til en bestemt skærm via miljøvariabler.
            if let q = ProcessInfo.processInfo.environment["SEARCH"] { store.search = q; tab = .kort }
            switch ProcessInfo.processInfo.environment["SCREEN"] {
            case "liste": tab = .liste
            case "top": tab = .top
            case "mine": tab = .mine
            case "detail":
                // data loader async - prøv igen til den er der (kun DEBUG/screenshots)
                func vælgDetail(_ forsøg: Int = 0) {
                    if let r = store.all.first(where: { $0.n == "Copenhagen Marathon" }) ?? store.all.first {
                        selected = r
                    } else if forsøg < 20 {
                        DispatchQueue.main.asyncAfter(deadline: .now() + 0.3) { vælgDetail(forsøg + 1) }
                    }
                }
                vælgDetail()
            case "login": showLogin = true
            default: break
            }
            #endif
        }
    }

    @ViewBuilder private var tabContent: some View {
        switch tab {
        case .kort:
            VStack(spacing: 10) {
                header
                SearchBar(store: store, focused: $searchFocused) { searchFocused = false; showFilters = true }
                if !store.search.trimmingCharacters(in: .whitespaces).isEmpty {
                    søgeResultater
                } else {
                    Spacer()
                    counter.padding(.bottom, 74)
                }
            }
            .padding(.horizontal, 16).padding(.top, 6)
        case .liste:
            VStack(spacing: 10) {
                header
                SearchBar(store: store, focused: $searchFocused) { searchFocused = false; showFilters = true }
                ListeView(store: store, saved: saved, selected: $selected)
            }
            .padding(.horizontal, 16).padding(.top, 6)
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .background(paper.ignoresSafeArea())
        case .top:
            LeaderboardsView()
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
            sprogKnap
            profilKnap
        }
        .padding(.top, 6)
    }

    private var sprogKnap: some View {
        Button { visSprog = true } label: {
            HStack(spacing: 4) {
                Image(systemName: "globe").font(.system(size: 12, weight: .semibold))
                Text(lang.code.uppercased()).font(.system(size: 12, weight: .bold))
            }
            .foregroundColor(ink)
            .padding(.horizontal, 11).padding(.vertical, 8)
            .background(paper).clipShape(Capsule())
            .overlay(Capsule().stroke(hairline)).shadow(color: .black.opacity(0.05), radius: 6, y: 2)
        }
        .accessibilityLabel(lang.t("Skift sprog", "Change language"))
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
                Button(lang.t("Log ud", "Sign out")) { auth.logout() }
                Button(lang.t("Slet konto", "Delete account"), role: .destructive) { bekræftSlet = true }
            }
        } else {
            Button { showLogin = true } label: {
                Text(lang.t("Log ind", "Sign in")).font(.system(size: 13, weight: .semibold)).foregroundColor(ink)
                    .padding(.horizontal, 16).padding(.vertical, 9)
                    .background(paper).clipShape(Capsule())
                    .overlay(Capsule().stroke(hairline)).shadow(color: .black.opacity(0.05), radius: 6, y: 2)
            }
        }
    }

    // MARK: - søge-resultater (kompakt liste under søgefeltet)

    private var søgeResultater: some View {
        let hits = store.filtered.sorted { ($0.dt ?? $0.m ?? "9999") < ($1.dt ?? $1.m ?? "9999") }
        return VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 4) {
                Text("\(hits.count)").font(.system(size: 13, weight: .bold)).foregroundColor(ink)
                Text(lang.t(hits.count == 1 ? "resultat" : "resultater", hits.count == 1 ? "result" : "results"))
                    .font(.system(size: 13)).foregroundColor(.secondary)
            }
            .padding(.horizontal, 4)
            if hits.isEmpty {
                Text(lang.t("Ingen løb matcher.", "No races match."))
                    .font(.system(size: 14)).foregroundColor(.secondary)
                    .frame(maxWidth: .infinity, alignment: .center).padding(.top, 30)
            } else {
                KompaktListe(løb: Array(hits.prefix(60))) { r in searchFocused = false; selected = r }
            }
            Spacer(minLength: 0)
        }
        .padding(.bottom, 74)
    }

    /// "find mig" - centrér kortet på brugerens placering
    private var findMigKnap: some View {
        Button { mapCtrl.centrérPåMig() } label: {
            Image(systemName: "location.fill")
                .font(.system(size: 16, weight: .semibold)).foregroundColor(ink)
                .frame(width: 44, height: 44)
                .background(paper).clipShape(Circle())
                .overlay(Circle().stroke(hairline))
                .shadow(color: .black.opacity(0.12), radius: 8, y: 3)
        }
        .buttonStyle(PressableStyle())
        .accessibilityLabel(lang.t("Find min placering", "Find my location"))
    }

    private var counter: some View {
        HStack(spacing: 3) {
            CountingNumber(value: Double(store.filtered.count))
            Text(lang.t("løb på kortet", "races on the map"))
        }
        .animation(.easeOut(duration: 0.5), value: store.filtered.count)
        .font(.system(size: 12)).foregroundColor(.secondary)
        .padding(.vertical, 8).padding(.horizontal, 16)
        .background(paper.opacity(0.9)).background(.ultraThinMaterial)
        .clipShape(Capsule()).overlay(Capsule().stroke(hairline))
        .shadow(color: .black.opacity(0.05), radius: 8, y: 2)
    }

    // MARK: - Mine løb (gemte)

    @ViewBuilder private var mineTab: some View {
        VStack(spacing: 10) {
            header
            ListeView(store: store, saved: saved, selected: $selected,
                      kilde: mineKilde, titel: lang.t("Mine løb", "My races"),
                      tomTekst: lang.t("Ingen gemte løb endnu.\nTryk hjertet på et løb for at gemme det.",
                                       "No saved races yet.\nTap the heart on a race to save it."))
            if auth.user == nil {
                Button { showLogin = true } label: {
                    Text(lang.t("Log ind for at synke på tværs af enheder", "Sign in to sync across devices"))
                        .font(.system(size: 13, weight: .semibold)).foregroundColor(coral)
                }
                .padding(.bottom, 82)
            }
        }
        .padding(.horizontal, 16).padding(.top, 6)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(paper.ignoresSafeArea())
    }
}
