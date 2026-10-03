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
                // A place change with an identical reading produces no new snapshot; refresh the label anyway.
                .onChange(of: store.resolved.label) { _, _ in
                    if let s = store.snapshot { Task { await watch.update(s, store: store) } }
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
        do {
            activity = try Activity.request(
                attributes: HazeActivityAttributes(place: store.resolved.label),
                content: Self.content(s, store: store),
                pushType: nil
            )
            isOn = true
            message = nil
        } catch {
            message = "Couldn't start Haze watch: \(error.localizedDescription)"
        }
    }

    /// Push the new reading, and the place it is for, to the running activity. The place is part of the content
    /// state, so after a region change the Lock Screen and Dynamic Island say the new place with the new number.
    func update(_ s: Snapshot, store: HazeStore) async {
        guard let activity else { return }
        await activity.update(Self.content(s, store: store))
    }

    private static func content(_ s: Snapshot, store: HazeStore) -> ActivityContent<HazeActivityAttributes.ContentState> {
        let state = HazeActivityAttributes.ContentState(snapshot: s, place: store.resolved.label, profiles: store.profiles,
                                                        estimate: store.insight?.uncertainty.approx ?? false)
        return ActivityContent(state: state, staleDate: s.observedAt.addingTimeInterval(HazeCompute.staleAfter))
    }

    func stop() async {
        await activity?.end(nil, dismissalPolicy: .immediate)
        activity = nil
        isOn = false
    }
}
