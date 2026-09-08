import UIKit
import WebKit
import AVFoundation

/// Deler et løb som en animeret Instagram Story-video: den roterende Runnin-globe
/// lander på løbets by, pin dropper ind, tekst/stats reveal'er. Genbruger præcis
/// den D3-globe fra web (bundtet lokalt i StoryAssets/), drevet frame-for-frame af
/// `renderAt(ms)` i en offscreen WKWebView og optaget til mp4 med AVAssetWriter.

// MARK: - Kort-specifikation

struct StoryCardSpec {
    enum Mode { case kommende, gennemført }
    var mode: Mode
    var mørk: Bool
    var lon: Double
    var lat: Double
    var titel: String
    var bruger: String
    var attribution: URL

    // kommende
    var meta: String = ""
    // gennemført (stats)
    var kicker: String = ""
    var s1v: String = ""; var s1l: String = ""
    var s2v: String = ""; var s2l: String = ""
    var s3v: String? = nil; var s3l: String = ""

    var varighedMs: Int { mode == .gennemført ? 5400 : 4700 }

    /// JSON til window.initStory(...)
    func paramsJSON() -> String {
        var d: [String: Any] = [
            "done": mode == .gennemført,
            "theme": mørk ? "morke" : "lys",
            "lon": lon, "lat": lat,
            "title": titel,
            "user": bruger,
            "url": "RUNNIN.ORG"
        ]
        if mode == .gennemført {
            d["kicker"] = kicker.isEmpty ? "GENNEMFØRT" : kicker
            d["s1v"] = s1v; d["s1l"] = s1l
            d["s2v"] = s2v; d["s2l"] = s2l
            if let s3 = s3v, !s3.isEmpty { d["s3v"] = s3; d["s3l"] = s3l }
        } else {
            d["kicker"] = kicker.isEmpty ? (Lang.shared.erDansk ? "JEG SKAL LØBE" : "I'M RUNNING") : kicker
            d["meta"] = meta
        }
        let data = try? JSONSerialization.data(withJSONObject: d)
        return data.flatMap { String(data: $0, encoding: .utf8) } ?? "{}"
    }
}

enum StoryFejl: Error { case assetMangler, webTimeout, skrivFejl }

// MARK: - Video-renderer

@MainActor
final class StoryVideoRenderer: NSObject {
    private let size = CGSize(width: 1080, height: 1920)
    private let fps: Int32 = 30
    private var web: WKWebView?

    /// Bygger og returnerer en mp4 af det animerede kort. `frem` kaldes 0…1 undervejs.
    func renderVideo(_ spec: StoryCardSpec, frem: @escaping (Double) -> Void) async throws -> URL {
        let web = try await klargørWeb(spec)
        defer { ryd() }

        let url = FileManager.default.temporaryDirectory
            .appendingPathComponent("runnin-story-\(UUID().uuidString).mp4")
        let writer = try AVAssetWriter(outputURL: url, fileType: .mp4)
        let settings: [String: Any] = [
            AVVideoCodecKey: AVVideoCodecType.h264,
            AVVideoWidthKey: 1080, AVVideoHeightKey: 1920,
            AVVideoCompressionPropertiesKey: [
                AVVideoAverageBitRateKey: 10_000_000,
                AVVideoProfileLevelKey: AVVideoProfileLevelH264HighAutoLevel,
                AVVideoMaxKeyFrameIntervalKey: 30
            ]
        ]
        let input = AVAssetWriterInput(mediaType: .video, outputSettings: settings)
        input.expectsMediaDataInRealTime = false
        let adaptor = AVAssetWriterInputPixelBufferAdaptor(
            assetWriterInput: input,
            sourcePixelBufferAttributes: [
                kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_32BGRA,
                kCVPixelBufferWidthKey as String: 1080,
                kCVPixelBufferHeightKey as String: 1920
            ])
        guard writer.canAdd(input) else { throw StoryFejl.skrivFejl }
        writer.add(input)
        guard writer.startWriting() else { throw writer.error ?? StoryFejl.skrivFejl }
        writer.startSession(atSourceTime: .zero)

        let frames = Int(Double(spec.varighedMs) / 1000.0 * Double(fps))
        let snapCfg = WKSnapshotConfiguration()
        snapCfg.snapshotWidth = NSNumber(value: Float(size.width))

        for i in 0..<frames {
            let ms = Double(i) / Double(fps) * 1000.0
            _ = try? await web.evaluateJavaScript("window.renderAt(\(ms)); true")
            let img = try await snapshot(web, cfg: snapCfg)
            guard let buf = pixelBuffer(img) else { throw StoryFejl.skrivFejl }
            var vent = 0
            while !input.isReadyForMoreMediaData && vent < 200 {
                try await Task.sleep(nanoseconds: 8_000_000); vent += 1
            }
            adaptor.append(buf, withPresentationTime: CMTime(value: Int64(i), timescale: fps))
            frem(Double(i + 1) / Double(frames))
        }
        input.markAsFinished()
        await writer.finishWriting()
        guard writer.status == .completed else { throw writer.error ?? StoryFejl.skrivFejl }
        return url
    }

    /// Enkelt still-frame (slut-kompositionen) til forhåndsvisning i del-arket.
    func poster(_ spec: StoryCardSpec) async throws -> UIImage {
        let web = try await klargørWeb(spec)
        defer { ryd() }
        _ = try? await web.evaluateJavaScript("window.renderAt(\(spec.varighedMs)); true")
        try? await Task.sleep(nanoseconds: 60_000_000)
        let cfg = WKSnapshotConfiguration()
        cfg.snapshotWidth = NSNumber(value: Float(size.width))
        return try await snapshot(web, cfg: cfg)
    }

    // MARK: intern

    private func klargørWeb(_ spec: StoryCardSpec) async throws -> WKWebView {
        guard let html = Bundle.main.url(forResource: "story", withExtension: "html", subdirectory: "StoryAssets") else {
            throw StoryFejl.assetMangler
        }
        let cfg = WKWebViewConfiguration()
        cfg.suppressesIncrementalRendering = false
        let w = WKWebView(frame: CGRect(origin: .zero, size: size), configuration: cfg)
        w.isOpaque = true
        w.scrollView.isScrollEnabled = false
        w.alpha = 0.02  // renderer, men usynlig (dækkes af del-arket)
        w.isUserInteractionEnabled = false
        vindue()?.addSubview(w)
        vindue()?.sendSubviewToBack(w)
        self.web = w

        w.loadFileURL(html, allowingReadAccessTo: html.deletingLastPathComponent())
        try await vent(w, "window.__loaded === true", sek: 8)
        _ = try? await w.evaluateJavaScript("window.initStory(\(spec.paramsJSON())); true")
        try await vent(w, "window.__klar === true", sek: 8)
        try? await Task.sleep(nanoseconds: 250_000_000)  // font + layout falder på plads
        return w
    }

    private func ryd() { web?.removeFromSuperview(); web = nil }

    private func vindue() -> UIWindow? {
        UIApplication.shared.connectedScenes
            .compactMap { $0 as? UIWindowScene }
            .flatMap { $0.windows }
            .first { $0.isKeyWindow } ??
        (UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }.first?.windows.first)
    }

    /// poll et JS-udtryk til det bliver true (eller timeout)
    private func vent(_ w: WKWebView, _ udtryk: String, sek: Double) async throws {
        let deadline = Date().addingTimeInterval(sek)
        while Date() < deadline {
            if let r = try? await w.evaluateJavaScript(udtryk), (r as? Bool) == true { return }
            try? await Task.sleep(nanoseconds: 40_000_000)
        }
        throw StoryFejl.webTimeout
    }

    private func snapshot(_ w: WKWebView, cfg: WKSnapshotConfiguration) async throws -> UIImage {
        try await withCheckedThrowingContinuation { cont in
            w.takeSnapshot(with: cfg) { img, err in
                if let img { cont.resume(returning: img) }
                else { cont.resume(throwing: err ?? StoryFejl.skrivFejl) }
            }
        }
    }

    /// UIImage → 1080×1920 BGRA pixel buffer (nedskalerer skarpt, retvendt).
    private func pixelBuffer(_ image: UIImage) -> CVPixelBuffer? {
        let attrs: CFDictionary = [
            kCVPixelBufferCGImageCompatibilityKey: true,
            kCVPixelBufferCGBitmapContextCompatibilityKey: true
        ] as CFDictionary
        var pb: CVPixelBuffer?
        CVPixelBufferCreate(kCFAllocatorDefault, 1080, 1920, kCVPixelFormatType_32BGRA, attrs, &pb)
        guard let buffer = pb else { return nil }
        CVPixelBufferLockBaseAddress(buffer, [])
        defer { CVPixelBufferUnlockBaseAddress(buffer, []) }
        guard let ctx = CGContext(
            data: CVPixelBufferGetBaseAddress(buffer),
            width: 1080, height: 1920, bitsPerComponent: 8,
            bytesPerRow: CVPixelBufferGetBytesPerRow(buffer),
            space: CGColorSpaceCreateDeviceRGB(),
            bitmapInfo: CGImageAlphaInfo.premultipliedFirst.rawValue | CGBitmapInfo.byteOrder32Little.rawValue
        ) else { return nil }
        ctx.interpolationQuality = .high
        // flip til UIKit-orientering, så billedet vender rigtigt
        ctx.translateBy(x: 0, y: 1920); ctx.scaleBy(x: 1, y: -1)
        UIGraphicsPushContext(ctx)
        image.draw(in: CGRect(x: 0, y: 0, width: 1080, height: 1920))
        UIGraphicsPopContext()
        return buffer
    }
}

// MARK: - Deling

enum StoryShare {
    /// Facebook App ID til direkte Instagram Story-deling (source_application).
    /// Udfyld fra Meta-dashboardet (samme app som Facebook-login) → tænder "Del til Instagram".
    /// Tom = spring IG-direkte over og brug system-arket (gem/del video).
    static let fbAppID = ""

    static func harInstagram() -> Bool {
        guard !fbAppID.isEmpty, let u = URL(string: "instagram-stories://share") else { return false }
        return UIApplication.shared.canOpenURL(u)
    }

    /// Læg video på klippebordet + åbn Instagram Stories med den som baggrund.
    @MainActor @discardableResult
    static func tilInstagram(video: URL, attribution: URL) -> Bool {
        guard harInstagram(), let data = try? Data(contentsOf: video) else { return false }
        let sticker: [String: Any] = [
            "com.instagram.sharedSticker.backgroundVideo": data,
            "com.instagram.sharedSticker.contentURL": attribution.absoluteString
        ]
        UIPasteboard.general.setItems([sticker],
            options: [.expirationDate: Date().addingTimeInterval(60 * 5)])
        guard let u = URL(string: "instagram-stories://share?source_application=\(fbAppID)") else { return false }
        UIApplication.shared.open(u)
        return true
    }

    /// System-delearket (gem til Kamerarulle, AirDrop, beskeder, hvilken som helst app).
    @MainActor
    static func system(video: URL, fra vc: UIViewController) {
        let av = UIActivityViewController(activityItems: [video], applicationActivities: nil)
        av.popoverPresentationController?.sourceView = vc.view
        av.popoverPresentationController?.sourceRect = CGRect(
            x: vc.view.bounds.midX, y: vc.view.bounds.maxY - 40, width: 0, height: 0)
        vc.present(av, animated: true)
    }
}
