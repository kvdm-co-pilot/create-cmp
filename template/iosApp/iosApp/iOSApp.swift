import SwiftUI
import ComposeApp
// >>> cmp:feature firebase
import FirebaseCore
// <<< cmp:feature firebase

@main
struct iOSApp: App {

    @UIApplicationDelegateAdaptor(AppDelegate.self) var delegate

    var body: some Scene {
        WindowGroup {
            ContentView()
        }
    }
}

class AppDelegate: NSObject, UIApplicationDelegate {
    func application(
        _ application: UIApplication,
        didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil
    ) -> Bool {
        // >>> cmp:feature firebase
        // Firebase native init (GitLive wraps the native SDK; reads GoogleService-Info.plist).
        // MUST run before doInitKoin(), which wires the GitLive emulators.
        FirebaseApp.configure()
        // <<< cmp:feature firebase
        // Koin initialisation for iOS.
        KoinHelperKt.doInitKoin()
        return true
    }
}
