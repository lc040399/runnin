import WidgetKit
import SwiftUI

/// Hjemmeskærms-widget: nedtælling til dit næste gemte løb.
/// Appen skriver snapshotet (WidgetDeling) når gemte løb/data ændrer sig;
/// tidslinjen har én entry pr. midnat, så "X dage" tæller selv ned uden app-åbning.
struct NæsteLøbEntry: TimelineEntry {
    let date: Date
    let løb: WidgetDeling.NæsteLøb?
}

struct NæsteLøbProvider: TimelineProvider {
    private var eksempel: WidgetDeling.NæsteLøb {
        .init(navn: "Copenhagen Marathon", by: "København", flag: "🇩🇰", dato: "2027-05-16")
    }

    func placeholder(in context: Context) -> NæsteLøbEntry {
        NæsteLøbEntry(date: Date(), løb: eksempel)
    }

    func getSnapshot(in context: Context, completion: @escaping (NæsteLøbEntry) -> Void) {
        completion(NæsteLøbEntry(date: Date(), løb: WidgetDeling.læs() ?? (context.isPreview ? eksempel : nil)))
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<NæsteLøbEntry>) -> Void) {
        let løb = WidgetDeling.læs()
        let cal = Calendar.current
        var entries = [NæsteLøbEntry(date: Date(), løb: løb)]
        // én entry pr. midnat 30 dage frem - nedtællingen opdaterer sig selv
        for d in 1...30 {
            if let midnat = cal.date(byAdding: .day, value: d, to: cal.startOfDay(for: Date())) {
                entries.append(NæsteLøbEntry(date: midnat, løb: løb))
            }
        }
        completion(Timeline(entries: entries, policy: .atEnd))
    }
}

struct NæsteLøbView: View {
    var entry: NæsteLøbEntry
    @Environment(\.widgetFamily) private var family

    private let paper = Color(red: 0.96, green: 0.953, blue: 0.933)
    private let ink = Color(red: 0.22, green: 0.14, blue: 0.05)
    private let coral = Color(red: 0.75, green: 0.35, blue: 0.0)
    private let muted = Color(red: 0.49, green: 0.42, blue: 0.31)

    private var erDansk: Bool { Locale.current.identifier.hasPrefix("da") }

    var body: some View {
        Group {
            if let løb = entry.løb, let dage = WidgetDeling.dageTil(løb.dato, fra: entry.date), dage >= 0 {
                nedtælling(løb, dage: dage)
            } else {
                tom
            }
        }
        .widgetBaggrund(paper)
    }

    private func nedtælling(_ løb: WidgetDeling.NæsteLøb, dage: Int) -> some View {
        VStack(alignment: .leading, spacing: family == .systemSmall ? 4 : 6) {
            HStack(spacing: 5) {
                Circle().fill(dage == 0 ? Color(red: 0.063, green: 0.725, blue: 0.506) : coral)
                    .frame(width: 7, height: 7)
                Text(dage == 0 ? (erDansk ? "I DAG" : "TODAY") : (erDansk ? "DIT NÆSTE LØB" : "YOUR NEXT RACE"))
                    .font(.system(size: 10, weight: .heavy)).kerning(1).foregroundColor(muted)
            }
            Spacer(minLength: 0)
            if dage > 0 {
                HStack(alignment: .firstTextBaseline, spacing: 4) {
                    Text("\(dage)")
                        .font(.system(size: family == .systemSmall ? 34 : 40, weight: .heavy, design: .rounded))
                        .foregroundColor(ink)
                    Text(erDansk ? (dage == 1 ? "dag" : "dage") : (dage == 1 ? "day" : "days"))
                        .font(.system(size: 14, weight: .semibold)).foregroundColor(muted)
                }
            } else {
                Text(erDansk ? "Godt løb! 🏃" : "Good race! 🏃")
                    .font(.system(size: family == .systemSmall ? 20 : 26, weight: .heavy, design: .rounded))
                    .foregroundColor(ink)
            }
            Text(løb.navn)
                .font(.system(size: family == .systemSmall ? 12 : 14, weight: .bold))
                .foregroundColor(ink).lineLimit(family == .systemSmall ? 2 : 1)
            if family != .systemSmall {
                Text("\(løb.by) \(løb.flag) · \(datoLabel(løb.dato))")
                    .font(.system(size: 12)).foregroundColor(muted).lineLimit(1)
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
    }

    private var tom: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text("RUNNIN").font(.system(size: 11, weight: .heavy)).kerning(2).foregroundColor(coral)
            Spacer(minLength: 0)
            Text(erDansk ? "Gem et løb,\nså tæller vi ned." : "Save a race\nand we'll count down.")
                .font(.system(size: 13, weight: .semibold)).foregroundColor(ink)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
    }

    private func datoLabel(_ iso: String) -> String {
        let mdr = erDansk
            ? ["", "jan", "feb", "mar", "apr", "maj", "jun", "jul", "aug", "sep", "okt", "nov", "dec"]
            : ["", "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
        guard iso.count == 10, let mm = Int(iso.dropFirst(5).prefix(2)), let dd = Int(iso.suffix(2)) else { return iso }
        return erDansk ? "\(dd). \(mdr[mm])." : "\(mdr[mm]) \(dd)"
    }
}

private extension View {
    /// containerBackground er iOS 17+; på 16 er en almindelig baggrund det rigtige
    @ViewBuilder func widgetBaggrund(_ farve: Color) -> some View {
        if #available(iOSApplicationExtension 17.0, *) {
            containerBackground(farve, for: .widget)
        } else {
            background(farve)
        }
    }
}

struct RunninWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "RunninNaesteLoeb", provider: NæsteLøbProvider()) { entry in
            NæsteLøbView(entry: entry)
        }
        .configurationDisplayName(Locale.current.identifier.hasPrefix("da") ? "Dit næste løb" : "Your next race")
        .description(Locale.current.identifier.hasPrefix("da")
                     ? "Nedtælling til dit næste gemte løb."
                     : "Countdown to your next saved race.")
        .supportedFamilies([.systemSmall, .systemMedium])
    }
}

@main
struct RunninWidgetBundle: WidgetBundle {
    var body: some Widget {
        RunninWidget()
    }
}
