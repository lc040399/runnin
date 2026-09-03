import SwiftUI
import MapLibre

/// Native kort via MapLibre - samme OpenFreeMap Positron-tiles + klyngning som web.
struct MapView: UIViewRepresentable {
    func makeCoordinator() -> Coordinator { Coordinator() }

    func makeUIView(context: Context) -> MLNMapView {
        let mv = MLNMapView(frame: .zero)
        mv.styleURL = URL(string: "https://tiles.openfreemap.org/styles/positron")
        mv.setCenter(CLLocationCoordinate2D(latitude: 59.5, longitude: 13),
                     zoomLevel: 3.6, animated: false)
        mv.minimumZoomLevel = 1.2
        mv.delegate = context.coordinator
        mv.logoView.isHidden = true          // OSM-attribution beholdes via attributionButton
        mv.tintColor = UIColor(red: 0.75, green: 0.35, blue: 0.0, alpha: 1)
        return mv
    }

    func updateUIView(_ uiView: MLNMapView, context: Context) {}

    final class Coordinator: NSObject, MLNMapViewDelegate {
        func mapView(_ mapView: MLNMapView, didFinishLoading style: MLNStyle) {
            guard let url = Bundle.main.url(forResource: "races", withExtension: "json"),
                  let data = try? Data(contentsOf: url) else { NSLog("Runnin: races.json mangler"); return }
            let races: [Race]
            do { races = try JSONDecoder().decode([Race].self, from: data) }
            catch { NSLog("Runnin: races decode-fejl \(error)"); return }

            let features: [MLNPointFeature] = races.map { r in
                let f = MLNPointFeature()
                f.coordinate = CLLocationCoordinate2D(latitude: r.la, longitude: r.lo)
                f.attributes = ["id": r.id, "t": r.t]
                return f
            }

            let source = MLNShapeSource(identifier: "races", features: features, options: nil)
            style.addSource(source)

            // enkeltløb farvet pr. type (matcher web's TYPE_COLOR) via web-expression-format
            let dots = MLNCircleStyleLayer(identifier: "race-dots", source: source)
            dots.circleColor = NSExpression(mglJSONObject: [
                "match", ["get", "t"],
                "kort", "#6B7280",
                "half", "#268C6B",
                "marathon", "#C05800",
                "ultra", "#8C388C",
                "#3373B3"
            ])
            dots.circleRadius = NSExpression(forConstantValue: 4)
            dots.circleStrokeWidth = NSExpression(forConstantValue: 1.2)
            dots.circleStrokeColor = NSExpression(forConstantValue: UIColor.white)
            style.addLayer(dots)
        }
    }
}
