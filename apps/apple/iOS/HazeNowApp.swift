import ActivityKit
import HazeKit
import HazeUI
import SwiftUI
import UserNotifications
import WidgetKit

extension Notification.Name {
    static let hazeNowOpenShare = Notification.Name("HazeNowOpenShare")
}

/// Handles the notification "Share" action (SPEC v1.6).
final class AppDelegate: NSObject, UIApplicationDelegate, UNUserNotificationCenterDelegate {
    func application(_ application: UIApplication,
                     didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil) -> Bool {
        HazeNotifier.registerCategories()
        UNUserNotificationCenter.current().delegate = self
        return true
    }

    func userNotificationCenter(_ center: UNUserNotificationCenter, didReceive response: UNNotificationResponse) async {
        if response.actionIdentifier == HazeNotifier.shareAction || response.actionIdentifier == UNNotificationDefaultActionIdentifier {
            await MainActor.run { NotificationCenter.default.post(name: .hazeNowOpenShare, object: nil) }
        }
    }

    func userNotificationCenter(_ center: UNUserNotificationCenter, willPresent notification: UNNotification) async -> UNNotificationPresentationOptions {
        [.banner, .list]
    }
}

@main
struct HazeNowApp: App {
    @UIApplicationDelegateAdaptor(AppDelegate.self) private var appDelegate
    @State private var store = HazeStore()
    @State private var watch = HazeWatch()
    @Environment(\.scenePhase) private var phase

    init() { HazeFonts.register() }

    var body: some Scene {
        WindowGroup {
            ContentView(store: store, watch: watch)
                .onAppear {
                    store.onSnapshot = { snap in
                        WidgetCenter.shared.reloadAllTimelines()
                        Task { await watch.update(snap, store: store) }
                    }
                    store.start()
                }
                .onChange(of: phase) { _, p in
                    if p == .active { Task { await store.refresh() } }
                }
        }
    }
}

/// "Haze watch": a Live Activity kept current by local updates while the app refreshes.
@MainActor
@Observable
final class HazeWatch {
    private(set) var isOn = false
    private(set) var message: String?
    @ObservationIgnored private var activity: Activity<HazeActivityAttributes>?

    init() {
        activity = Activity<HazeActivityAttributes>.activities.first
        isOn = activity != nil
    }

    var isAvailable: Bool { ActivityAuthorizationInfo().areActivitiesEnabled }

    func toggle(store: HazeStore) async {
        isOn ? await stop() : start(store: store)
    }

    func start(store: HazeStore) {
        guard let s = store.snapshot else { message = "Waiting for the first reading…"; return }
        guard isAvailable else { message = "Live Activities are turned off in Settings."; return }
        let state = HazeActivityAttributes.ContentState(snapshot: s, profiles: store.profiles,
                                                        estimate: store.insight?.uncertainty.approx ?? false)
        do {
            activity = try Activity.request(
                attributes: HazeActivityAttributes(place: store.resolved.label),
                content: ActivityContent(state: state, staleDate: s.observedAt.addingTimeInterval(HazeCompute.staleAfter)),
                pushType: nil
            )
            isOn = true
            message = nil
        } catch {
            message = "Couldn't start Haze watch: \(error.localizedDescription)"
        }
    }

    func update(_ s: Snapshot, store: HazeStore) async {
        guard let activity else { return }
        let state = HazeActivityAttributes.ContentState(snapshot: s, profiles: store.profiles,
                                                        estimate: store.insight?.uncertainty.approx ?? false)
        await activity.update(ActivityContent(state: state, staleDate: s.observedAt.addingTimeInterval(HazeCompute.staleAfter)))
    }

    func stop() async {
        await activity?.end(nil, dismissalPolicy: .immediate)
        activity = nil
        isOn = false
    }
}
