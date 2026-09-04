import SwiftUI
import MapLibre

extension UIColor {
    convenience init(hex: String) {
        var s = hex; if s.hasPrefix("#") { s.removeFirst() }
        var v: UInt64 = 0; Scanner(string: s).scanHexInt64(&v)
        self.init(red: CGFloat((v >> 16) & 0xFF) / 255, green: CGFloat((v >> 8) & 0xFF) / 255,
                  blue: CGFloat(v & 0xFF) / 255, alpha: 1)
    }
}

/// Native kort via MapLibre - samme OpenFreeMap Positron-tiles, klyngning og
/// brand-farver som web. Klyngning beregnes i Swift (grid pr. zoom); kilden
/// genskabes via features:-init ved hver genberegning, fordi source.shape-
/// opdatering ikke renderer i denne MapLibre-distributionsbuild.
struct MapView: UIViewRepresentable {
    @ObservedObject var store: RaceStore
    @Binding var selected: Race?
    @Binding var stak: [Race]?      // flere løb på samme punkt (tap → liste)

    func makeCoordinator() -> Coordinator { Coordinator(self) }

    func makeUIView(context: Context) -> MLNMapView {
        let mv = MLNMapView(frame: .zero)
        mv.styleURL = URL(string: "https://tiles.openfreemap.org/styles/positron")
        mv.setCenter(CLLocationCoordinate2D(latitude: 59.5, longitude: 13),
                     zoomLevel: 3.6, animated: false)
        mv.minimumZoomLevel = 0.8
        mv.delegate = context.coordinator
        mv.logoView.isHidden = true
        mv.tintColor = UIColor(red: 0.75, green: 0.35, blue: 0.0, alpha: 1)
        let tap = UITapGestureRecognizer(target: context.coordinator,
                                         action: #selector(Coordinator.handleTap(_:)))
        mv.addGestureRecognizer(tap)
        context.coordinator.mapView = mv
        return mv
    }

    func updateUIView(_ uiView: MLNMapView, context: Context) {
        // genklynge når filtre/søgning ændrer resultatet
        let sig = store.filterSignatur
        if sig != context.coordinator.lastFilterSig, let style = uiView.style {
            context.coordinator.lastFilterSig = sig
            context.coordinator.lastZoomBucket = -999 // tving genberegning
            context.coordinator.rebuildClusters(style: style)
        }
    }

    final class Coordinator: NSObject, MLNMapViewDelegate {
        let parent: MapView
        weak var mapView: MLNMapView?
        var lastZoomBucket: Int = -999
        var lastFilterSig = ""
        private var racesById: [Int: Race] = [:]
        private var lastDataVersion = -1
        private let ink = UIColor(red: 0.22, green: 0.14, blue: 0.05, alpha: 1)

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
            rebuildClusters(style: style)
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

        func mapView(_ mapView: MLNMapView, regionDidChangeAnimated animated: Bool) {
            let bucket = Int((mapView.zoomLevel * 2).rounded())
            if bucket != lastZoomBucket, let style = mapView.style {
                lastZoomBucket = bucket; rebuildClusters(style: style)
            }
        }

        // MARK: - klyngning + lag

        func rebuildClusters(style: MLNStyle) {
            guard let mv = mapView else { return }
            genopbygRacesById()
            let z = mv.zoomLevel

            // ryd gamle lag + kilder
            for id in ["clusters", "cluster-count", "race-dots", "dot-count"] {
                if let l = style.layer(withIdentifier: id) { style.removeLayer(l) }
            }
            for id in ["dots-src", "clusters-src"] {
                if let s = style.source(withIdentifier: id) { style.removeSource(s) }
            }

            let (dots, clusters) = buildFeatures(zoom: z)

            // TO separate, homogene kilder (én til prikker, én til klynger)
            let dotsSrc = MLNShapeSource(identifier: "dots-src", features: dots, options: nil)
            let clustersSrc = MLNShapeSource(identifier: "clusters-src", features: clusters, options: nil)
            style.addSource(clustersSrc)
            style.addSource(dotsSrc)

            let dotsLayer = MLNCircleStyleLayer(identifier: "race-dots", source: dotsSrc)
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
            let dotCount = MLNSymbolStyleLayer(identifier: "dot-count", source: dotsSrc)
            dotCount.predicate = NSPredicate(format: "antal > 1")
            dotCount.text = NSExpression(format: "CAST(antal, 'NSString')")
            dotCount.textColor = NSExpression(forConstantValue: UIColor.white)
            dotCount.textFontSize = NSExpression(forConstantValue: 10)
            dotCount.textFontNames = NSExpression(forConstantValue: ["Noto Sans Regular"])
            style.addLayer(dotCount)

            let clustersLayer = MLNCircleStyleLayer(identifier: "clusters", source: clustersSrc)
            clustersLayer.circleColor = NSExpression(forConstantValue: ink)
            clustersLayer.circleRadius = NSExpression(mglJSONObject: ["step", ["get", "antal"], 14, 15, 17, 60, 20, 250, 24])
            clustersLayer.circleStrokeWidth = NSExpression(forConstantValue: 3)
            clustersLayer.circleStrokeColor = NSExpression(forConstantValue: ink.withAlphaComponent(0.15))
            style.addLayer(clustersLayer)

            let count = MLNSymbolStyleLayer(identifier: "cluster-count", source: clustersSrc)
            count.text = NSExpression(forKeyPath: "label")
            count.textColor = NSExpression(forConstantValue: UIColor.white)
            count.textFontSize = NSExpression(forConstantValue: 12)
            count.textFontNames = NSExpression(forConstantValue: ["Noto Sans Regular"]) // Positron-glyf-sæt
            style.addLayer(count)
        }

        private func buildFeatures(zoom z: Double) -> (dots: [MLNPointFeature], clusters: [MLNPointFeature]) {
            func nøgle(_ r: Race) -> Int64 {
                Int64((r.la * 10000).rounded()) &* 4_000_000 &+ Int64((r.lo * 10000).rounded())
            }
            func dot(_ r: Race, antal: Int = 1) -> MLNPointFeature {
                let f = MLNPointFeature()
                f.coordinate = CLLocationCoordinate2D(latitude: r.la, longitude: r.lo)
                f.attributes = ["id": r.id, "t": r.t, "antal": antal]
                return f
            }
            let kilde = parent.store.filtered
            if z >= 11 {
                // gruppér løb på præcis samme punkt (ellers ligger de usynligt oven på hinanden)
                var stakke: [Int64: [Race]] = [:]
                for r in kilde { stakke[nøgle(r), default: []].append(r) }
                return (stakke.values.map { dot($0[0], antal: $0.count) }, [])
            }

            let degPerPixel = 360.0 / (256.0 * pow(2.0, z))
            let cell = max(60.0 * degPerPixel, 0.0001)
            var buckets: [Int64: [Race]] = [:]
            for r in kilde {
                let gx = Int64((r.lo / cell).rounded(.down))
                let gy = Int64((r.la / cell).rounded(.down))
                buckets[gx &* 1_000_003 &+ gy, default: []].append(r)
            }
            var dots: [MLNPointFeature] = []
            var clusters: [MLNPointFeature] = []
            for (_, group) in buckets {
                if group.count == 1 { dots.append(dot(group[0])); continue }
                // placér klyngen ved det løb der er tættest på centroidet - så den altid
                // sidder på land ved en rigtig løbs-position (ikke midt i Kattegat)
                let cLat = group.reduce(0.0) { $0 + $1.la } / Double(group.count)
                let cLon = group.reduce(0.0) { $0 + $1.lo } / Double(group.count)
                let midt = group.min {
                    hypot($0.la - cLat, $0.lo - cLon) < hypot($1.la - cLat, $1.lo - cLon)
                }!
                let f = MLNPointFeature()
                f.coordinate = CLLocationCoordinate2D(latitude: midt.la, longitude: midt.lo)
                f.attributes = ["antal": group.count, "label": String(group.count)]
                clusters.append(f)
            }
            return (dots, clusters)
        }

        // MARK: - tap

        @objc func handleTap(_ gr: UITapGestureRecognizer) {
            guard let mv = mapView else { return }
            let p = gr.location(in: mv)
            let rect = CGRect(x: p.x - 22, y: p.y - 22, width: 44, height: 44)

            let dots = mv.visibleFeatures(in: rect, styleLayerIdentifiers: ["race-dots"])
            if let f = dots.first, let idVal = (f.attribute(forKey: "id") as? NSNumber)?.intValue,
               let race = racesById[idVal] {
                // saml alle løb på præcis samme punkt (stak) - ellers kunne kun det øverste nås
                let key = { (r: Race) in "\(Int((r.la*10000).rounded()))_\(Int((r.lo*10000).rounded()))" }
                let stak = parent.store.filtered.filter { key($0) == key(race) }
                if stak.count > 1 { parent.stak = stak } else { parent.selected = race }
                return
            }
            let clusters = mv.visibleFeatures(in: rect, styleLayerIdentifiers: ["clusters"])
            if let cf = clusters.first as? MLNPointFeature {
                mv.setCenter(cf.coordinate, zoomLevel: min(mv.zoomLevel + 2.4, 14), animated: true)
            }
        }
    }
}
