import UserNotifications

/// Lokale påmindelser om gemte løb - planlægges på enheden (ingen server, ingen APNs,
/// ingen GDPR). Tre pr. løb: 2 uger før, 3 dage før og selve løbsdagen (kl. 08 lokal).
final class Notifikationer {
    static let shared = Notifikationer()
    private let center = UNUserNotificationCenter.current()

    /// Bed om lov (kaldes når brugeren gemmer sit første løb) og planlæg bagefter.
    func bedOmLov(så planlæg: @escaping () -> Void) {
        center.requestAuthorization(options: [.alert, .sound, .badge]) { _, _ in
            DispatchQueue.main.async { planlæg() }
        }
    }

    /// (Gen)planlæg påmindelser for de gemte løb. Gør intet uden brugerens tilladelse.
    func planlæg(for løb: [Race]) {
        // kommende gemte løb med kendt dato, tidligst først (iOS-loft = 64 ventende → maks 20 løb)
        let kommende = løb
            .filter { ($0.dt?.count ?? 0) == 10 && ($0.dt ?? "") >= Race.iDagISO }
            .sorted { ($0.dt ?? "") < ($1.dt ?? "") }
            .prefix(20)
        #if DEBUG
        print("Notifikationer: \(kommende.count) kommende gemte løb med dato")
        #endif

        center.getNotificationSettings { [weak self] s in
            guard let self,
                  s.authorizationStatus == .authorized || s.authorizationStatus == .provisional else { return }
            self.center.removeAllPendingNotificationRequests()

            let trin: [(dageFør: Int, tekst: String)] = [
                (14, T("Om 2 uger 🏃", "In 2 weeks 🏃")),
                (3,  T("Om 3 dage 🏃", "In 3 days 🏃")),
                (0,  T("Er i dag 🏃", "Is today 🏃")),
            ]
            // Calendar.current = enhedens lokale tidszone → alt regnes i brugerens lokaltid
            let cal = Calendar.current
            for r in kommende {
                guard let løbsdag = Self.dato(r.dt!) else { continue }
                for t in trin {
                    guard let fyr = cal.date(byAdding: .day, value: -t.dageFør, to: løbsdag),
                          fyr > Date() else { continue }   // spring forbi-passerede tidspunkter over
                    let c = UNMutableNotificationContent()
                    c.title = r.n
                    c.body = "\(t.tekst) · \(r.c)"
                    c.sound = .default
                    // dato-komponenter UDEN fast tidszone → iOS fyrer kl. 08 i brugerens
                    // tidszone på fyringstidspunktet (tilpasser sig hvis brugeren rejser)
                    let comps = cal.dateComponents([.year, .month, .day, .hour, .minute], from: fyr)
                    let trig = UNCalendarNotificationTrigger(dateMatching: comps, repeats: false)
                    self.center.add(UNNotificationRequest(identifier: "\(r.id)-\(t.dageFør)",
                                                          content: c, trigger: trig))
                }
            }
        }
    }

    /// YYYY-MM-DD → Date kl. 08:00 lokal tid
    private static func dato(_ iso: String) -> Date? {
        var c = DateComponents()
        c.year = Int(iso.prefix(4)); c.month = Int(iso.dropFirst(5).prefix(2)); c.day = Int(iso.suffix(2))
        c.hour = 8; c.minute = 0
        return Calendar.current.date(from: c)
    }
}
