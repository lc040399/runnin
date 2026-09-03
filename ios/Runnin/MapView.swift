import SwiftUI
import MapLibre

/// Native kort via MapLibre - samme OpenFreeMap Positron-tiles, klyngning og
/// brand-farver som web. Klyngning beregnes i Swift (grid pr. zoom); kilden
/// genskabes via features:-init ved hver genberegning, fordi source.shape-
/// opdatering ikke renderer i denne MapLibre-distributionsbuild.
struct MapView: UIViewRepresentable {
    @ObservedObject var store: RaceStore
    @Binding var selected: Race?

    func makeCoordinator() -> Coordinator { Coordinator(self) }

    func makeUIView(context: Context) -> MLNMapView {
        let mv = MLNMapView(frame: .zero)
        mv.styleURL = URL(string: "https://tiles.openfreemap.org/styles/positron")
        mv.setCenter(CLLocationCoordinate2D(latitude: 59.5, longitude: 13),
                     zoomLevel: 3.6, animated: false)
        mv.minimumZoomLevel = 1.2
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
        private let ink = UIColor(red: 0.22, green: 0.14, blue: 0.05, alpha: 1)

        init(_ parent: MapView) {
            self.parent = parent
            super.init()
            for r in parent.store.all { racesById[r.id] = r }
            lastFilterSig = parent.store.filterSignatur
        }

        func mapView(_ mapView: MLNMapView, didFinishLoading style: MLNStyle) {
            rebuildClusters(style: style)
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
            let z = mv.zoomLevel

            // ryd gamle lag + kilder
            for id in ["clusters", "cluster-count", "race-dots"] {
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
            dotsLayer.circleRadius = NSExpression(forConstantValue: 6)
            dotsLayer.circleStrokeWidth = NSExpression(forConstantValue: 1.5)
            dotsLayer.circleStrokeColor = NSExpression(forConstantValue: UIColor.white)
            style.addLayer(dotsLayer)

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
            func dot(_ r: Race) -> MLNPointFeature {
                let f = MLNPointFeature()
                f.coordinate = CLLocationCoordinate2D(latitude: r.la, longitude: r.lo)
                f.attributes = ["id": r.id, "t": r.t]
                return f
            }
            let kilde = parent.store.filtered
            if z >= 11 { return (kilde.map(dot), []) }

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
                let lat = group.reduce(0.0) { $0 + $1.la } / Double(group.count)
                let lon = group.reduce(0.0) { $0 + $1.lo } / Double(group.count)
                let f = MLNPointFeature()
                f.coordinate = CLLocationCoordinate2D(latitude: lat, longitude: lon)
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
                parent.selected = race
                return
            }
            let clusters = mv.visibleFeatures(in: rect, styleLayerIdentifiers: ["clusters"])
            if let cf = clusters.first as? MLNPointFeature {
                mv.setCenter(cf.coordinate, zoomLevel: min(mv.zoomLevel + 2.4, 14), animated: true)
            }
        }
    }
}
