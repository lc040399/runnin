import SwiftUI

@main
struct RunninApp: App {
    init() { CrashVagt.start() }

    var body: some Scene {
        WindowGroup {
            ContentView()
                .preferredColorScheme(.light)
        }
    }
}
