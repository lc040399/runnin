import SwiftUI

enum Tab: String, CaseIterable {
    case kort = "Kort"
    case liste = "Liste"
    case top = "Leaderboards"
    case mine = "Mine løb"

    var icon: String {
        switch self {
        case .kort:  return "map.fill"
        case .liste: return "list.bullet"
        case .top:   return "trophy.fill"
        case .mine:  return "heart.fill"
        }
    }

    var label: String {
        switch self {
        case .kort:  return T("Kort", "Map")
        case .liste: return T("Liste", "List")
        case .top:   return "Leaderboards"
        case .mine:  return T("Mine løb", "My races")
        }
    }
}

/// Farverig bund-nav: chokolade-bar, caramel aktiv-fane (matcher web's mørke chrome).
struct BottomNav: View {
    @Binding var tab: Tab
    var badges: [Tab: Int] = [:]
    @ObservedObject private var lang = Lang.shared
    @Namespace private var ns

    private let ink = Color(red: 0.22, green: 0.14, blue: 0.05)
    private let coral = Color(red: 0.75, green: 0.35, blue: 0.0)
    private let cream = Color(red: 0.96, green: 0.953, blue: 0.933)

    var body: some View {
        HStack(spacing: 4) {
            ForEach(Tab.allCases, id: \.self) { t in
                let on = t == tab
                Button {
                    withAnimation(.spring(response: 0.32, dampingFraction: 0.74)) { tab = t }
                } label: {
                    VStack(spacing: 3) {
                        ZStack(alignment: .topTrailing) {
                            Image(systemName: t.icon).font(.system(size: 15, weight: .semibold))
                            if let n = badges[t], n > 0 {
                                Text(n > 99 ? "99+" : "\(n)")
                                    .font(.system(size: 9, weight: .bold)).foregroundColor(.white)
                                    .padding(.horizontal, 4).frame(minWidth: 15, minHeight: 15)
                                    .background(Color(red: 0.85, green: 0.2, blue: 0.2))
                                    .clipShape(Capsule())
                                    .overlay(Capsule().stroke(ink, lineWidth: 1.5))
                                    .offset(x: 13, y: -8)
                            }
                        }
                        Text(t.label).font(.system(size: 9.5, weight: .semibold))
                            .lineLimit(1).minimumScaleFactor(0.8)
                    }
                    .foregroundColor(on ? .white : cream.opacity(0.6))
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 8)
                    .background {
                        if on {
                            RoundedRectangle(cornerRadius: 13, style: .continuous)
                                .fill(coral)
                                .matchedGeometryEffect(id: "aktiv", in: ns)
                        }
                    }
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
            }
        }
        .padding(5)
        .background(
            RoundedRectangle(cornerRadius: 20, style: .continuous)
                .fill(ink)
                .shadow(color: ink.opacity(0.3), radius: 16, y: 6)
        )
    }
}
