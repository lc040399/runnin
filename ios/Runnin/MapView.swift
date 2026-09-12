import SwiftUI
import MapLibre
import CoreLocation

extension UIColor {
    convenience init(hex: String) {
        var s = hex; if s.hasPrefix("#") { s.removeFirst() }
        var v: UInt64 = 0; Scanner(string: s).scanHexInt64(&v)
        self.init(red: CGFloat((v >> 16) & 0xFF) / 255, green: CGFloat((v >> 8) & 0xFF) / 255,
                  blue: CGFloat(v & 0xFF) / 255, alpha: 1)
    }
}

/// Native kort via MapLibre - samme OpenFreeMap Positron-tiles, klyngning og
/// brand-farver som web. Klyngning beregnes i Swift (grid pr. HELTALS-zoom, som
/// webbens supercluster) og præsenteres med samme flydende merge/split-animation:
/// zoom ud = børnene glider ind i forældre-cirklen, zoom ind = forælderen spalter
/// ud i børnene (260 ms cubic-out, CADisplayLink).
/// TO grupper med hver deres kilder: brune (alle løb) og grønne (afholdes i DAG) -
/// præcis som webbens races-/live-halo-lag, samme flydende fysik for begge.
/// Lag + kilder oprettes ÉN gang og opdateres via source.shape - det gamle
/// riv-ned-og-genbyg-mønster pr. 0,5 zoom var årsag til hak under pinch.
/// Lader SwiftUI-knappen "find mig" styre kortet uden at bryde UIViewRepresentable-mønstret.
final class MapController: ObservableObject {
    fileprivate weak var mapView: MLNMapView?
    /// centrér på brugerens placering. Er lokation ikke slået til (fx "Tillad én
    /// gang" udløbet), genaktiveres den her - et eksplicit tryk må gerne spørge igen.
    func centrérPåMig() {
        guard let mv = mapView else { return }
        if !mv.showsUserLocation { mv.showsUserLocation = true; return } // prompt + auto-centrering v. fix
        guard let loc = mv.userLocation?.location else { return }
        mv.setCenter(loc.coordinate, zoomLevel: max(mv.zoomLevel, 8), animated: true)
    }
}

struct MapView: UIViewRepresentable {
    @ObservedObject var store: RaceStore
    @Binding var selected: Race?
    @Binding var stak: [Race]?      // flere løb på samme punkt (tap → liste)
    var ctrl: MapController

    func makeCoordinator() -> Coordinator { Coordinator(self) }

    func makeUIView(context: Context) -> MLNMapView {
        let mv = MLNMapView(frame: .zero)
        mv.styleURL = URL(string: "https://tiles.openfreemap.org/styles/positron")
        // fallback-visning indtil brugerens placering lander (ved afvist tilladelse bliver den stående)
        mv.setCenter(CLLocationCoordinate2D(latitude: 59.5, longitude: 13),
                     zoomLevel: 3.6, animated: false)
        mv.minimumZoomLevel = 0.8
        mv.delegate = context.coordinator
        mv.logoView.isHidden = true
        // Lokation: spørg automatisk KUN første gang nogensinde. Vælger brugeren
        // "Tillad én gang"/afvis, plager vi ikke ved hver opstart - kun et eksplicit
        // tryk på "find mig" må udløse prompten igen.
        let status = CLLocationManager().authorizationStatus
        let harSpurgt = UserDefaults.standard.bool(forKey: "runnin-lokation-spurgt")
        if status == .authorizedWhenInUse || status == .authorizedAlways {
            mv.showsUserLocation = true
        } else if status == .notDetermined && !harSpurgt {
            UserDefaults.standard.set(true, forKey: "runnin-lokation-spurgt")
            mv.showsUserLocation = true   // udløser system-prompten (én gang)
        }
        mv.tintColor = UIColor(red: 0.75, green: 0.35, blue: 0.0, alpha: 1)
        let tap = UITapGestureRecognizer(target: context.coordinator,
                                         action: #selector(Coordinator.handleTap(_:)))
        mv.addGestureRecognizer(tap)
        context.coordinator.mapView = mv
        ctrl.mapView = mv
        // test-hook (kun m. env-var, fx simulator): kør et zoom-forløb automatisk,
        // så merge/split-animationen kan optages/verificeres uden touch-input
        if ProcessInfo.processInfo.environment["RUNNIN_ZOOM_DEMO"] != nil {
            let mål = CLLocationCoordinate2D(latitude: 51, longitude: 10)
            DispatchQueue.main.asyncAfter(deadline: .now() + 5) { [weak mv] in
                mv?.setCenter(mål, zoomLevel: 6.2, animated: true)
            }
            DispatchQueue.main.asyncAfter(deadline: .now() + 9) { [weak mv] in
                mv?.setCenter(mål, zoomLevel: 4.2, animated: true)
            }
        }
        return mv
    }

    func updateUIView(_ uiView: MLNMapView, context: Context) {
        // genklynge når filtre/søgning ændrer resultatet (hårdt skift - det ER et nyt datasæt)
        let sig = store.filterSignatur
        if sig != context.coordinator.lastFilterSig, uiView.style != nil {
            context.coordinator.lastFilterSig = sig
            context.coordinator.hårdOpdatering()
        }
    }

    final class Coordinator: NSObject, MLNMapViewDelegate {
        /// over dette zoom-niveau bygges kun features i det synlige udsnit
        private let CULL_ZOOM = 6.0
        /// over dette: rå prikker med stakke (ingen klynger) - matcher webbens clusterMaxZoom 11
        private let STAK_ZOOM = 11
        private let ANIM_S = 0.26
        /// flere features end dette i overgangen = hårdt skift (perf-vagt, som web)
        private let ANIM_LOFT = 700

        let parent: MapView
        weak var mapView: MLNMapView?
        var lastFilterSig = ""
        private var racesById: [Int: Race] = [:]
        private var lastDataVersion = -1
        private var harCentreretPåBruger = false
        private let ink = UIColor(red: 0.22, green: 0.14, blue: 0.05, alpha: 1)
        private let grøn = UIColor(hex: "#10B981")

        // haptik: klargjorte generatorer = ingen forsinkelse på første tap
        private let tapHaptik = UIImpactFeedbackGenerator(style: .light)
        private let zoomHaptik = UIImpactFeedbackGenerator(style: .soft)

        // let feature-repræsentation: MLNPointFeature bygges først ved tegn
        private struct Feat {
            var la: Double, lo: Double
            var attrs: [String: Any]
        }
        private struct FeatSæt {
            var dots: [Feat] = []
            var clusters: [Feat] = []
            var alle: [Feat] { dots + clusters }
        }
        private enum Gruppe { case brun, grøn }

        private var brunDotsSrc: MLNShapeSource?
        private var brunClustersSrc: MLNShapeSource?
        private var grønDotsSrc: MLNShapeSource?
        private var grønClustersSrc: MLNShapeSource?
        private var visteZ = -999                  // heltalszoom for det viste sæt
        private var visteBrun = FeatSæt()
        private var visteGrøn = FeatSæt()
        private var sidsteCullCenter = CLLocationCoordinate2D(latitude: 0, longitude: 0)

        init(_ parent: MapView) {
            self.parent = parent
            super.init()
            genopbygRacesById()
            lastFilterSig = parent.store.filterSignatur
        }

        /// genopbyg id→løb-opslag når data er skiftet (remote-refresh)
        private func genopbygRacesById() {
            guard parent.store.dataVersion != lastDataVersion else { return }
            racesById.removeAll(keepingCapacity: true)
            for r in parent.store.all { racesById[r.id] = r }
            lastDataVersion = parent.store.dataVersion
        }

        func mapView(_ mapView: MLNMapView, didFinishLoading style: MLNStyle) {
            warmify(style)
            opretLag(style)
            hårdOpdatering()
        }

        /// Varm toning af Positron-stilen - præcis samme farver som web (js/app.js warmify).
        private func warmify(_ style: MLNStyle) {
            let fills = [
                "water": "#B7CFD8", "park": "#D8E3C6", "landcover_wood": "#D3E0C3",
                "landuse_residential": "#ECE8DC", "landcover_ice_shelf": "#F2F5F2",
                "landcover_glacier": "#F2F5F2",
            ]
            for (id, hex) in fills {
                (style.layer(withIdentifier: id) as? MLNFillStyleLayer)?
                    .fillColor = NSExpression(forConstantValue: UIColor(hex: hex))
            }
            (style.layer(withIdentifier: "background") as? MLNBackgroundStyleLayer)?
                .backgroundColor = NSExpression(forConstantValue: UIColor(hex: "#F3EFE6"))
            (style.layer(withIdentifier: "waterway") as? MLNLineStyleLayer)?
                .lineColor = NSExpression(forConstantValue: UIColor(hex: "#B7CFD8"))
        }

        /// centrér kortet på brugeren ved første placerings-fix (kun én gang - så kan man panorere frit bagefter)
        func mapView(_ mapView: MLNMapView, didUpdate userLocation: MLNUserLocation?) {
            guard !harCentreretPåBruger, let loc = userLocation?.location,
                  CLLocationCoordinate2DIsValid(loc.coordinate),
                  !(loc.coordinate.latitude == 0 && loc.coordinate.longitude == 0) else { return }
            harCentreretPåBruger = true
            mapView.setCenter(loc.coordinate, zoomLevel: 8, animated: true)
        }

        /// LØBENDE mens brugeren zoomer/panorerer: heltals-kryds animeres, cull-pan gentegner
        func mapViewRegionIsChanging(_ mapView: MLNMapView) {
            reagérPåRegion(mapView)
        }

        func mapView(_ mapView: MLNMapView, regionDidChangeAnimated animated: Bool) {
            reagérPåRegion(mapView)
        }

        private func reagérPåRegion(_ mapView: MLNMapView) {
            guard brunDotsSrc != nil else { return }
            let z = Int(floor(mapView.zoomLevel))
            if z != visteZ {
                let gammel = visteZ
                // store spring eller "reducér bevægelse": hårdt skift, som web
                if abs(z - gammel) != 1 || UIAccessibility.isReduceMotionEnabled { hårdOpdatering(); return }
                animérTil(nyZ: z, gammelZ: gammel)
                return
            }
            // ved culling-zoom: gen-tegn også når man PANORERER ud af det byggede udsnit
            if mapView.zoomLevel >= CULL_ZOOM, tween == nil {
                let c = mapView.centerCoordinate
                let spanLa = mapView.visibleCoordinateBounds.ne.latitude - mapView.visibleCoordinateBounds.sw.latitude
                if abs(c.latitude - sidsteCullCenter.latitude) > spanLa * 0.5 ||
                   abs(c.longitude - sidsteCullCenter.longitude) > spanLa * 0.9 {
                    hårdOpdatering()
                }
            }
        }

        // MARK: - lag (oprettes ÉN gang; alt efterfølgende er shape-opdateringer)

        private func opretLag(_ style: MLNStyle) {
            stopTween()
            // idempotent v. style-reload: ryd evt. rester før genopbygning
            for id in ["clusters", "cluster-count", "race-dots", "dot-count",
                       "live-clusters", "live-cluster-count", "live-dots", "live-dot-count"] {
                if let l = style.layer(withIdentifier: id) { style.removeLayer(l) }
            }
            for id in ["dots-src", "clusters-src", "live-dots-src", "live-clusters-src"] {
                if let s = style.source(withIdentifier: id) { style.removeSource(s) }
            }

            let tomtSæt = MLNShapeCollectionFeature(shapes: [])
            let bd = MLNShapeSource(identifier: "dots-src", shape: tomtSæt, options: nil)
            let bc = MLNShapeSource(identifier: "clusters-src", shape: tomtSæt, options: nil)
            let gd = MLNShapeSource(identifier: "live-dots-src", shape: tomtSæt, options: nil)
            let gc = MLNShapeSource(identifier: "live-clusters-src", shape: tomtSæt, options: nil)
            for s in [bc, bd, gc, gd] { style.addSource(s) }
            brunDotsSrc = bd; brunClustersSrc = bc; grønDotsSrc = gd; grønClustersSrc = gc

            let dotsLayer = MLNCircleStyleLayer(identifier: "race-dots", source: bd)
            dotsLayer.circleColor = NSExpression(mglJSONObject: [
                "match", ["get", "t"],
                "kort", "#6B7280", "half", "#268C6B",
                "marathon", "#C05800", "ultra", "#8C388C", "#3373B3"
            ])
            dotsLayer.circleStrokeWidth = NSExpression(forConstantValue: 1.5)
            dotsLayer.circleStrokeColor = NSExpression(forConstantValue: UIColor.white)
            // stak-prikker (flere løb på samme punkt) lidt større, så tal-badge kan ses
            dotsLayer.circleRadius = NSExpression(mglJSONObject: ["case", [">", ["get", "antal"], 1], 9, 6])
            style.addLayer(dotsLayer)

            // tal på prikker der repræsenterer flere løb på samme punkt
            let dotCount = MLNSymbolStyleLayer(identifier: "dot-count", source: bd)
            dotCount.predicate = NSPredicate(format: "antal > 1")
            dotCount.text = NSExpression(format: "CAST(antal, 'NSString')")
            dotCount.textColor = NSExpression(forConstantValue: UIColor.white)
            dotCount.textFontSize = NSExpression(forConstantValue: 10)
            dotCount.textFontNames = NSExpression(forConstantValue: ["Noto Sans Regular"])
            style.addLayer(dotCount)

            let clustersLayer = MLNCircleStyleLayer(identifier: "clusters", source: bc)
            clustersLayer.circleColor = NSExpression(forConstantValue: ink)
            clustersLayer.circleRadius = NSExpression(mglJSONObject: ["step", ["get", "antal"], 14, 15, 17, 60, 20, 250, 24])
            clustersLayer.circleStrokeWidth = NSExpression(forConstantValue: 3)
            clustersLayer.circleStrokeColor = NSExpression(forConstantValue: ink.withAlphaComponent(0.15))
            style.addLayer(clustersLayer)

            let count = MLNSymbolStyleLayer(identifier: "cluster-count", source: bc)
            count.text = NSExpression(forKeyPath: "label")
            count.textColor = NSExpression(forConstantValue: UIColor.white)
            count.textFontSize = NSExpression(forConstantValue: 12)
            count.textFontNames = NSExpression(forConstantValue: ["Noto Sans Regular"]) // Positron-glyf-sæt
            style.addLayer(count)

            // GRØNNE lag øverst: løb der afholdes i DAG (webbens live-halo)
            let liveDots = MLNCircleStyleLayer(identifier: "live-dots", source: gd)
            liveDots.circleColor = NSExpression(forConstantValue: grøn)
            liveDots.circleRadius = NSExpression(mglJSONObject: ["case", [">", ["get", "antal"], 1], 9, 6])
            liveDots.circleStrokeWidth = NSExpression(forConstantValue: 1.5)
            liveDots.circleStrokeColor = NSExpression(forConstantValue: UIColor.white)
            style.addLayer(liveDots)

            let liveDotCount = MLNSymbolStyleLayer(identifier: "live-dot-count", source: gd)
            liveDotCount.predicate = NSPredicate(format: "antal > 1")
            liveDotCount.text = NSExpression(format: "CAST(antal, 'NSString')")
            liveDotCount.textColor = NSExpression(forConstantValue: UIColor.white)
            liveDotCount.textFontSize = NSExpression(forConstantValue: 10)
            liveDotCount.textFontNames = NSExpression(forConstantValue: ["Noto Sans Regular"])
            style.addLayer(liveDotCount)

            let liveClusters = MLNCircleStyleLayer(identifier: "live-clusters", source: gc)
            liveClusters.circleColor = NSExpression(forConstantValue: grøn)
            liveClusters.circleRadius = NSExpression(mglJSONObject: ["step", ["get", "antal"], 14, 15, 17, 60, 20, 250, 24])
            liveClusters.circleStrokeWidth = NSExpression(forConstantValue: 3)
            liveClusters.circleStrokeColor = NSExpression(forConstantValue: grøn.withAlphaComponent(0.25))
            style.addLayer(liveClusters)

            let liveCount = MLNSymbolStyleLayer(identifier: "live-cluster-count", source: gc)
            liveCount.text = NSExpression(forKeyPath: "label")
            liveCount.textColor = NSExpression(forConstantValue: UIColor.white)
            liveCount.textFontSize = NSExpression(forConstantValue: 12)
            liveCount.textFontNames = NSExpression(forConstantValue: ["Noto Sans Regular"])
            style.addLayer(liveCount)
        }

        private func tilMLN(_ f: Feat) -> MLNPointFeature {
            let p = MLNPointFeature()
            p.coordinate = CLLocationCoordinate2D(latitude: f.la, longitude: f.lo)
            p.attributes = f.attrs
            return p
        }

        private func sætShapes(brun: FeatSæt, grøn: FeatSæt) {
            brunDotsSrc?.shape = MLNShapeCollectionFeature(shapes: brun.dots.map(tilMLN))
            brunClustersSrc?.shape = MLNShapeCollectionFeature(shapes: brun.clusters.map(tilMLN))
            grønDotsSrc?.shape = MLNShapeCollectionFeature(shapes: grøn.dots.map(tilMLN))
            grønClustersSrc?.shape = MLNShapeCollectionFeature(shapes: grøn.clusters.map(tilMLN))
        }

        /// hårdt skift: genberegn ved aktuelt zoom uden animation (filtre, store spring, cull-pan)
        func hårdOpdatering() {
            guard let mv = mapView, brunDotsSrc != nil else { return }
            stopTween()
            genopbygRacesById()
            visteZ = Int(floor(mv.zoomLevel))
            let (b, g) = byg(zInt: visteZ)
            visteBrun = b; visteGrøn = g
            sætShapes(brun: b, grøn: g)
        }

        // MARK: - flydende merge/split (webbens klynger.js portet, pr. gruppe)

        private struct Bane {
            var fraLa, fraLo, tilLa, tilLo: Double
            var attrs: [String: Any]
            var erKlynge: Bool
            var gruppe: Gruppe
        }
        private final class Tween {
            var link: CADisplayLink?
            var start: CFTimeInterval = 0
            var baner: [Bane] = []
            var slutBrun = FeatSæt(), slutGrøn = FeatSæt()
        }
        private var tween: Tween?

        private func stopTween() {
            tween?.link?.invalidate()
            tween = nil
        }

        /// grid-celle ved heltals-zoom - SAMME formel som klyngningen, så
        /// forældre/barn-mapping er eksakt (webbens getChildren-ækvivalent)
        private func celle(_ la: Double, _ lo: Double, zInt: Int) -> Int64 {
            let degPerPixel = 360.0 / (256.0 * pow(2.0, Double(zInt)))
            let cell = max(60.0 * degPerPixel, 0.0001)
            let gx = Int64((lo / cell).rounded(.down))
            let gy = Int64((la / cell).rounded(.down))
            return gx &* 1_000_003 &+ gy
        }

        /// baner for én gruppe (gamle→mål ved zoom ud, forælder→nye ved zoom ind)
        private func gruppeBaner(gamle: FeatSæt, nye: FeatSæt, nyZ: Int, gammelZ: Int, gruppe: Gruppe) -> [Bane] {
            var baner: [Bane] = []
            if nyZ < gammelZ {
                // ZOOM UD: hvert gammelt feature glider hen i sit nye mål (klyngen/prikken i dets celle)
                var målPrCelle: [Int64: (Double, Double)] = [:]
                for f in nye.alle { målPrCelle[celle(f.la, f.lo, zInt: nyZ)] = (f.la, f.lo) }
                for (liste, erKlynge) in [(gamle.dots, false), (gamle.clusters, true)] {
                    for f in liste {
                        let m = målPrCelle[celle(f.la, f.lo, zInt: nyZ)] ?? (f.la, f.lo)
                        baner.append(Bane(fraLa: f.la, fraLo: f.lo, tilLa: m.0, tilLo: m.1,
                                          attrs: f.attrs, erKlynge: erKlynge, gruppe: gruppe))
                    }
                }
            } else {
                // ZOOM IND: nye features fødes i deres gamle forælders centrum og glider ud på plads
                var startPrCelle: [Int64: (Double, Double)] = [:]
                for f in gamle.clusters { startPrCelle[celle(f.la, f.lo, zInt: gammelZ)] = (f.la, f.lo) }
                for (liste, erKlynge) in [(nye.dots, false), (nye.clusters, true)] {
                    for f in liste {
                        let s = startPrCelle[celle(f.la, f.lo, zInt: gammelZ)] ?? (f.la, f.lo)
                        baner.append(Bane(fraLa: s.0, fraLo: s.1, tilLa: f.la, tilLo: f.lo,
                                          attrs: f.attrs, erKlynge: erKlynge, gruppe: gruppe))
                    }
                }
            }
            return baner
        }

        private func animérTil(nyZ: Int, gammelZ: Int) {
            guard mapView != nil else { return }
            stopTween()
            genopbygRacesById()
            visteZ = nyZ
            let (nyBrun, nyGrøn) = byg(zInt: nyZ)
            let antal = visteBrun.alle.count + visteGrøn.alle.count + nyBrun.alle.count + nyGrøn.alle.count
            if antal > ANIM_LOFT {
                visteBrun = nyBrun; visteGrøn = nyGrøn
                sætShapes(brun: nyBrun, grøn: nyGrøn)
                return
            }

            let baner = gruppeBaner(gamle: visteBrun, nye: nyBrun, nyZ: nyZ, gammelZ: gammelZ, gruppe: .brun)
                      + gruppeBaner(gamle: visteGrøn, nye: nyGrøn, nyZ: nyZ, gammelZ: gammelZ, gruppe: .grøn)
            visteBrun = nyBrun; visteGrøn = nyGrøn

            let bevæger = baner.contains { $0.fraLa != $0.tilLa || $0.fraLo != $0.tilLo }
            if !bevæger {
                sætShapes(brun: nyBrun, grøn: nyGrøn)
                return
            }

            let t = Tween()
            t.baner = baner
            t.slutBrun = nyBrun; t.slutGrøn = nyGrøn
            t.start = CACurrentMediaTime()
            let link = CADisplayLink(target: self, selector: #selector(tikTween))
            link.add(to: .main, forMode: .common)
            t.link = link
            tween = t
        }

        @objc private func tikTween() {
            guard let t = tween else { return }
            let p = min((CACurrentMediaTime() - t.start) / ANIM_S, 1)
            let e = 1 - pow(1 - p, 3)   // cubic-out, samme kurve som web
            var brun = FeatSæt(), grøn = FeatSæt()
            for b in t.baner {
                let f = Feat(la: b.fraLa + (b.tilLa - b.fraLa) * e,
                             lo: b.fraLo + (b.tilLo - b.fraLo) * e,
                             attrs: b.attrs)
                switch (b.gruppe, b.erKlynge) {
                case (.brun, false): brun.dots.append(f)
                case (.brun, true):  brun.clusters.append(f)
                case (.grøn, false): grøn.dots.append(f)
                case (.grøn, true):  grøn.clusters.append(f)
                }
            }
            sætShapes(brun: brun, grøn: grøn)
            if p >= 1 {
                let sb = t.slutBrun, sg = t.slutGrøn
                stopTween()
                sætShapes(brun: sb, grøn: sg)
            }
        }

        // MARK: - klyngning (grid pr. heltals-zoom, matcher webbens supercluster-semantik)

        /// kilde-split: grønne = afholdes i dag, brune = resten (som webbens toGeojson/isLive)
        private func kilder() -> (brun: [Race], grøn: [Race]) {
            let alle = parent.store.filtered
            var brun: [Race] = [], grøn: [Race] = []
            brun.reserveCapacity(alle.count)
            for r in alle { if r.erLive { grøn.append(r) } else { brun.append(r) } }
            return (brun, grøn)
        }

        private func byg(zInt: Int) -> (FeatSæt, FeatSæt) {
            let (brunKilde, grønKilde) = kilder()
            return (klyng(brunKilde, zInt: zInt, medType: true),
                    klyng(grønKilde, zInt: zInt, medType: false))
        }

        private func klyng(_ input: [Race], zInt: Int, medType: Bool) -> FeatSæt {
            func nøgle(_ r: Race) -> Int64 {
                Int64((r.la * 10000).rounded()) &* 4_000_000 &+ Int64((r.lo * 10000).rounded())
            }
            func dot(_ r: Race, antal: Int = 1) -> Feat {
                Feat(la: r.la, lo: r.lo,
                     attrs: medType ? ["id": r.id, "t": r.t, "antal": antal] : ["id": r.id, "antal": antal])
            }
            // viewport-culling: zoomet ind bygger vi kun features for det synlige
            // udsnit (+1 skærm i margin) - før byggede vi alle ~6.900 løb hver gang
            var kilde = input
            if Double(zInt) >= CULL_ZOOM, let mv = mapView {
                let b = mv.visibleCoordinateBounds
                let mLa = (b.ne.latitude - b.sw.latitude)
                let mLo = (b.ne.longitude - b.sw.longitude)
                let laMin = b.sw.latitude - mLa, laMax = b.ne.latitude + mLa
                let loMin = b.sw.longitude - mLo, loMax = b.ne.longitude + mLo
                kilde = kilde.filter { $0.la >= laMin && $0.la <= laMax && $0.lo >= loMin && $0.lo <= loMax }
                sidsteCullCenter = mv.centerCoordinate
            }
            var sæt = FeatSæt()
            if zInt >= STAK_ZOOM {
                // gruppér løb på præcis samme punkt (ellers ligger de usynligt oven på hinanden)
                var stakke: [Int64: [Race]] = [:]
                for r in kilde { stakke[nøgle(r), default: []].append(r) }
                sæt.dots = stakke.values.map { dot($0[0], antal: $0.count) }
                return sæt
            }

            var buckets: [Int64: [Race]] = [:]
            for r in kilde { buckets[celle(r.la, r.lo, zInt: zInt), default: []].append(r) }
            for (_, group) in buckets {
                if group.count == 1 { sæt.dots.append(dot(group[0])); continue }
                // placér klyngen ved det løb der er tættest på centroidet - så den altid
                // sidder på land ved en rigtig løbs-position (ikke midt i Kattegat)
                let cLat = group.reduce(0.0) { $0 + $1.la } / Double(group.count)
                let cLon = group.reduce(0.0) { $0 + $1.lo } / Double(group.count)
                let midt = group.min {
                    hypot($0.la - cLat, $0.lo - cLon) < hypot($1.la - cLat, $1.lo - cLon)
                }!
                sæt.clusters.append(Feat(la: midt.la, lo: midt.lo,
                                         attrs: ["antal": group.count, "label": String(group.count)]))
            }
            return sæt
        }

        // MARK: - tap

        /// zoom præcis dertil hvor klyngen spalter (webbens getClusterExpansionZoom)
        private func spalteZoom(for coord: CLLocationCoordinate2D, gruppe: Gruppe) -> Double {
            let (brunKilde, grønKilde) = kilder()
            let kilde = gruppe == .brun ? brunKilde : grønKilde
            let cellKey = celle(coord.latitude, coord.longitude, zInt: visteZ)
            let medlemmer = kilde.filter { celle($0.la, $0.lo, zInt: visteZ) == cellKey }
            guard medlemmer.count > 1 else { return Double(min(visteZ + 2, STAK_ZOOM)) }
            var zz = visteZ + 1
            while zz < STAK_ZOOM {
                if Set(medlemmer.map { celle($0.la, $0.lo, zInt: zz) }).count > 1 { break }
                zz += 1
            }
            return Double(zz) + 0.4
        }

        @objc func handleTap(_ gr: UITapGestureRecognizer) {
            guard let mv = mapView else { return }
            let p = gr.location(in: mv)
            let rect = CGRect(x: p.x - 22, y: p.y - 22, width: 44, height: 44)

            // grønne lag ligger øverst og skal derfor tjekkes først
            let alleDots = mv.visibleFeatures(in: rect, styleLayerIdentifiers: ["live-dots", "race-dots"])
            if let f = alleDots.first, let idVal = (f.attribute(forKey: "id") as? NSNumber)?.intValue,
               let race = racesById[idVal] {
                tapHaptik.impactOccurred()
                // saml alle løb på præcis samme punkt (stak) - ellers kunne kun det øverste nås
                let key = { (r: Race) in "\(Int((r.la*10000).rounded()))_\(Int((r.lo*10000).rounded()))" }
                let stak = parent.store.filtered.filter { key($0) == key(race) }
                if stak.count > 1 { parent.stak = stak } else { parent.selected = race }
                return
            }
            let grønne = mv.visibleFeatures(in: rect, styleLayerIdentifiers: ["live-clusters"])
            if let cf = grønne.first as? MLNPointFeature {
                zoomHaptik.impactOccurred()
                mv.setCenter(cf.coordinate, zoomLevel: spalteZoom(for: cf.coordinate, gruppe: .grøn), animated: true)
                return
            }
            let brune = mv.visibleFeatures(in: rect, styleLayerIdentifiers: ["clusters"])
            if let cf = brune.first as? MLNPointFeature {
                zoomHaptik.impactOccurred()
                mv.setCenter(cf.coordinate, zoomLevel: spalteZoom(for: cf.coordinate, gruppe: .brun), animated: true)
            }
        }
    }
}
