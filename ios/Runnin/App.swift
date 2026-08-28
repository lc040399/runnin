import UIKit
import WebKit

final class VC: UIViewController, WKNavigationDelegate {
  override func viewDidLoad() {
    super.viewDidLoad()
    view.backgroundColor = UIColor(red: 0.96, green: 0.95, blue: 0.93, alpha: 1)
    let cfg = WKWebViewConfiguration()
    cfg.allowsInlineMediaPlayback = true
    let web = WKWebView(frame: view.bounds, configuration: cfg)
    web.autoresizingMask = [.flexibleWidth, .flexibleHeight]
    web.scrollView.contentInsetAdjustmentBehavior = .never
    web.navigationDelegate = self
    web.load(URLRequest(url: URL(string: "https://runnin.pages.dev")!))
    view.addSubview(web)
  }
}

@main
final class AppDelegate: UIResponder, UIApplicationDelegate {
  var window: UIWindow?
  func application(_ application: UIApplication,
                   didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
    window = UIWindow(frame: UIScreen.main.bounds)
    window?.rootViewController = VC()
    window?.makeKeyAndVisible()
    return true
  }
}
