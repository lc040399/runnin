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

    /// Henter `navn` fra runnin.org i baggrunden. Ved HTTP 200 + mindst `minBytes`
    /// (krympe-vagt mod afkortede svar) gemmes svaret i cache og `done` kaldes på main.
    /// Kalder aldrig `done` ved fejl/offline - så beholder appen den lokale kopi.
    static func refresh(_ navn: String, minBytes: Int, done: @escaping (Data) -> Void) {
        guard let url = URL(string: base + navn) else { return }
        var req = URLRequest(url: url)
        req.cachePolicy = .reloadIgnoringLocalCacheData
        req.timeoutInterval = 20
        URLSession.shared.dataTask(with: req) { data, resp, _ in
            guard let data,
                  let http = resp as? HTTPURLResponse, http.statusCode == 200,
                  data.count >= minBytes else { return }
            try? data.write(to: cacheDir.appendingPathComponent(navn), options: .atomic)
            DispatchQueue.main.async { done(data) }
        }.resume()
    }
}
