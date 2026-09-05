import Foundation

/// Remote-data-lag: henter data-filer fra runnin.org så løb, koordinater og
/// leaderboards kan opdateres uden App Review ("OTA" for DATA - ikke kode).
///
/// Rækkefølge ved opstart:
///   1. `loadLocal` returnerer straks seneste hentede kopi (cache), ellers den
///      bundlede fil (offline-fallback) - appen viser aldrig en tom skærm.
///   2. `refresh` henter den friske version fra runnin.org i baggrunden; ved et
///      gyldigt svar gemmes den i cache og callback fyres på main-tråden.
///
/// Kode-ændringer (skærme, knapper, features) kan STADIG kun opdateres via nyt
/// build + App Review - Apple forbyder download af eksekverbar kode.
enum RemoteData {
    static let base = "https://runnin.org/data/"

    private static var cacheDir: URL {
        FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask)[0]
    }

    /// Øjeblikkelig indlæsning: cache hvis den findes, ellers den bundlede fil.
    static func loadLocal(_ navn: String) -> Data? {
        let cached = cacheDir.appendingPathComponent(navn)
        if let d = try? Data(contentsOf: cached), d.count > 0 { return d }
        let base = (navn as NSString).deletingPathExtension
        let ext = (navn as NSString).pathExtension
        if let url = Bundle.main.url(forResource: base, withExtension: ext),
           let d = try? Data(contentsOf: url) { return d }
        return nil
    }

    /// Henter `navn` fra runnin.org i baggrunden. ETag-betinget: er indholdet uændret
    /// svarer CDN'en 304 og vi springer download over (sparer ~1,7 MB pr. app-åbning).
    /// Ved HTTP 200 + mindst `minBytes` (krympe-vagt) gemmes svar + ETag, og `done`
    /// kaldes PÅ BAGGRUNDSTRÅD (kalderen dekoder dér og publicerer selv på main).
    /// Kalder aldrig `done` ved fejl/offline/304 - appen beholder den lokale kopi.
    static func refresh(_ navn: String, minBytes: Int, done: @escaping (Data) -> Void) {
        guard let url = URL(string: base + navn) else { return }
        var req = URLRequest(url: url)
        req.cachePolicy = .reloadIgnoringLocalCacheData
        req.timeoutInterval = 20
        let etagNøgle = "runnin-etag-\(navn)"
        // send kun If-None-Match når cachen faktisk findes (ellers 304 uden data at falde tilbage på)
        if FileManager.default.fileExists(atPath: cacheDir.appendingPathComponent(navn).path),
           let etag = UserDefaults.standard.string(forKey: etagNøgle) {
            req.setValue(etag, forHTTPHeaderField: "If-None-Match")
        }
        URLSession.shared.dataTask(with: req) { data, resp, _ in
            guard let http = resp as? HTTPURLResponse else { return }
            if http.statusCode == 304 { return }   // uændret - lokal kopi er aktuel
            guard http.statusCode == 200, let data, data.count >= minBytes else { return }
            try? data.write(to: cacheDir.appendingPathComponent(navn), options: .atomic)
            if let etag = http.value(forHTTPHeaderField: "Etag") {
                UserDefaults.standard.set(etag, forKey: etagNøgle)
            }
            done(data)
        }.resume()
    }
}
