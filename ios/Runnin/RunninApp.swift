import SwiftUI

@main
struct RunninApp: App {
    @UIApplicationDelegateAdaptor(AppDelegate.self) private var appDelegate
    init() { CrashVagt.start() }

    var body: some Scene {
        WindowGroup {
            ContentView()
                .preferredColorScheme(.light)
        }
    }
}
