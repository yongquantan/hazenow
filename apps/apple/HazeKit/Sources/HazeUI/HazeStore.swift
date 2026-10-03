import CoreLocation
#if os(macOS)
import AppKit
#elseif os(iOS)
import UIKit
#endif
import Foundation
import HazeKit
import Observation
import OSLog
import SwiftUI
import UserNotifications

// MARK: - Location

/// Wraps CoreLocation with graceful fallback: any failure/denial leaves the app in region mode.
@MainActor
public final class LocationProvider: NSObject, CLLocationManagerDelegate {
    public enum Status: Equatable, Sendable {
        case off, requesting, denied, unavailable, active
    }

    private let manager = CLLocationManager()
    public private(set) var status: Status = .off
    public var onUpdate: ((Status, CLLocationCoordinate2D?) -> Void)?

    override public init() {
        super.init()
        manager.delegate = self
        manager.desiredAccuracy = kCLLocationAccuracyKilometer
        manager.distanceFilter = 500
    }

    public func start() {
        guard CLLocationManager.locationServicesEnabled() else { return set(.unavailable) }
        switch manager.authorizationStatus {
        case .notDetermined:
            set(.requesting)
            manager.requestWhenInUseAuthorization()
        case .denied, .restricted:
            set(.denied)
        default:
            set(.requesting)
            manager.requestLocation()
        }
    }

    public func stop() {
        manager.stopUpdatingLocation()
        set(.off)
    }

    private func set(_ s: Status, _ coord: CLLocationCoordinate2D? = nil) {
        status = s
        onUpdate?(s, coord)
    }

    nonisolated public func locationManagerDidChangeAuthorization(_ manager: CLLocationManager) {
        let auth = manager.authorizationStatus
        Task { @MainActor in
            guard self.status != .off else { return }
            switch auth {
            case .denied, .restricted: self.set(.denied)
            case .notDetermined: break
            default: self.manager.requestLocation()
            }
        }
    }

    nonisolated public func locationManager(_ manager: CLLocationManager, didUpdateLocations locations: [CLLocation]) {
        guard let c = locations.last?.coordinate else { return }
        Task { @MainActor in
            guard self.status != .off else { return }
            self.set(.active, c)
        }
    }

    nonisolated public func locationManager(_ manager: CLLocationManager, didFailWithError error: Error) {
        let denied = (error as? CLError)?.code == .denied
        Task { @MainActor in
            guard self.status != .off, self.status != .active else { return }
            self.set(denied ? .denied : .unavailable)
        }
    }
}

// MARK: - Notifications

/// Delivers band-crossing alerts computed by `BandAlerts` (hysteresis, caps, quiet hours, all-clear).
public enum HazeNotifier {
    public static let category = "hazenow.band"
    public static let shareAction = "hazenow.share"

    /// Band notifications carry a "Share" action that opens the share sheet.
    public static func registerCategories() {
        let share = UNNotificationAction(identifier: shareAction, title: "Share", options: [.foreground])
        let cat = UNNotificationCategory(identifier: category, actions: [share], intentIdentifiers: [])
        UNUserNotificationCenter.current().setNotificationCategories([cat])
    }

    public static func requestAuthorization() async -> Bool {
        (try? await UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .sound])) ?? false
    }

    /// Request permission and report exactly what happened (the error is kept, not swallowed).
    public static func requestAuthorizationResult() async -> NotifyStatus {
        do {
            let ok = try await UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .sound])
            return ok ? .granted : .denied
        } catch {
            // Kept for diagnosis (Console, subsystem sg.hazenow); the UI shows friendly copy only.
            Logger(subsystem: "sg.hazenow", category: "notifications")
                .error("requestAuthorization failed: \(String(describing: error), privacy: .public)")
            return .error(error.localizedDescription)
        }
    }

    /// Current system setting.
    public static func currentStatus() async -> NotifyStatus {
        let settings = await UNUserNotificationCenter.current().notificationSettings()
        switch settings.authorizationStatus {
        case .authorized, .provisional, .ephemeral: return .granted
        case .denied: return .denied
        case .notDetermined: return .notDetermined
        @unknown default: return .notDetermined
        }
    }

    /// One confirmation notification after the user opts in.
    public static func sendConfirmation() {
        let content = UNMutableNotificationContent()
        content.title = "HazeNow notifications are on"
        content.body = "We'll message when the band changes near you, and when it's clear. Never at night."
        content.threadIdentifier = "hazenow.band"
        UNUserNotificationCenter.current().add(UNNotificationRequest(identifier: "hazenow.confirm", content: content, trigger: nil))
    }

    /// Deep link to this app's notification settings.
    @MainActor
    public static func openSystemSettings() {
        #if os(macOS)
        if let url = URL(string: "x-apple.systempreferences:com.apple.Notifications-Settings.extension") {
            NSWorkspace.shared.open(url)
        }
        #elseif os(iOS)
        if let url = URL(string: UIApplication.openNotificationSettingsURLString) {
            UIApplication.shared.open(url)
        }
        #endif
    }

    @MainActor
    public static func handle(_ snapshot: Snapshot, profiles: Set<Profile>, settings: HazeSettings = .shared, now: Date = Date()) {
        let (state, alert) = BandAlerts.evaluate(state: settings.alertState, snapshot: snapshot, profiles: Array(profiles),
                                                 prefs: settings.alertPreferences, now: now)
        settings.alertState = state
        guard let alert, settings.mockScenario == nil else { return }
        let content = UNMutableNotificationContent()
        content.title = alert.title
        content.body = alert.body
        content.threadIdentifier = "hazenow.band"
        content.categoryIdentifier = category
        let id = "hazenow.\(alert.kind.rawValue).\(Int(snapshot.observedAt.timeIntervalSince1970))"
        UNUserNotificationCenter.current().add(UNNotificationRequest(identifier: id, content: content, trigger: nil))
    }
}

public enum NotifyStatus: Equatable, Sendable {
    case notDetermined, requesting, granted, denied
    case error(String)
}

// MARK: - Store

/// App-wide state: fetches on the SPEC v1.3 cadence, recomputes on location/region/profile changes.
@MainActor
@Observable
public final class HazeStore {
    public enum LoadError: Equatable, Sendable { case offline, api, noData }

    public private(set) var data: HazeData?
    public private(set) var snapshot: Snapshot?
    public private(set) var insight: HazeInsight?
    public private(set) var loadError: LoadError?
    public internal(set) var isLoading = false
    public internal(set) var lastChecked: Date?
    public private(set) var locationStatus: LocationProvider.Status = .off
    public private(set) var coordinate: CLLocationCoordinate2D?
    /// Active QA scenario (`-HazeMock`), shown as a "MOCK DATA" badge.
    public private(set) var mockScenario: String?
    /// Clock used for computing (a mock scenario's fixed "now", else the real time).
    public private(set) var referenceNow = Date()

    /// What to show (SPEC v1.4): my location, a picked area, a saved place, an NEA region, or the island.
    public var placeMode: PlaceMode {
        didSet {
            guard placeMode != oldValue else { return }
            // Remember the Singapore place shown before "my location", so a denied or unavailable fix keeps showing it
            // (COPY §10 "Showing {Region}") instead of jumping to the island average.
            if case .myLocation = placeMode, oldValue.isLocationFallback, transientPlace || settings.hasStoredPlaceMode {
                locationFallback = oldValue
                if !transientPlace { settings.locationFallback = oldValue }
            }
            // Only the user's own pick is saved (SPEC v2.1): deep links and the country guess are transient.
            if !transientPlace {
                settings.placeMode = placeMode
                guessBanner = nil
            }
            if case .myLocation = placeMode { location.start() } else { location.stop() }
            placeChanged()
        }
    }

    /// The place shown while "my location" has no fix (see `ResolvedPlace.resolve(_:gps:saved:fallback:)`).
    public private(set) var locationFallback: PlaceMode?

    /// SPEC v2.1: the device's country guess (time zone + languages, no network), and the calm line it shows.
    public private(set) var guess: CountryGuess = CountryGuesser.device()
    public var guessBanner: GuessBanner?
    /// The place outside Singapore being shown (nil = the Singapore view).
    public internal(set) var country: CountryViewState?
    @ObservationIgnored var transientPlace = false
    @ObservationIgnored var countryTask: Task<Void, Never>?
    @ObservationIgnored public var edge: String? = HazeEdge.configured()

    public var savedPlaces: [SavedPlace] {
        didSet { settings.savedPlaces = savedPlaces; recompute() }
    }

    /// First-run choice made.
    public var onboarded: Bool {
        didSet { settings.onboarded = onboarded }
    }

    public var profiles: Set<Profile> {
        didSet {
            let norm = Set(Profile.normalise(profiles))
            if norm != profiles { profiles = norm; return }
            guard profiles != oldValue else { return }
            settings.profiles = profiles
            recompute()
        }
    }

    public var notifyOnRise: Bool {
        didSet {
            settings.notifyOnRise = notifyOnRise
            // Turning it on from Settings also asks (and reflects the real result).
            if notifyOnRise, !oldValue, notifyStatus != .granted { Task { await requestNotifications(confirm: false) } }
        }
    }

    /// Whether the in-app ask has been answered (observed so the card disappears immediately).
    public var notifyAsked: Bool {
        didSet { settings.notifyAsked = notifyAsked }
    }

    /// Real system permission state (checked at launch, updated after asking).
    public private(set) var notifyStatus: NotifyStatus = .notDetermined

    /// Result of the in-app ask, shown inline in place of the card until dismissed.
    public private(set) var notifyAskResult: NotifyStatus?

    public func refreshNotifyStatus() async {
        notifyStatus = await HazeNotifier.currentStatus()
    }

    /// Ask the system. On macOS the (LSUIElement) app is activated first so the prompt comes to the front.
    public func requestNotifications(confirm: Bool) async {
        notifyStatus = .requesting
        #if os(macOS)
        NSApp.activate(ignoringOtherApps: true)
        #endif
        var result = await HazeNotifier.requestAuthorizationResult()
        // If the prompt was answered earlier, requestAuthorization returns the stored answer; re-read to be sure.
        if case .denied = result, await HazeNotifier.currentStatus() == .granted { result = .granted }
        notifyStatus = result
        if result == .granted, confirm { HazeNotifier.sendConfirmation() }
    }

    public func dismissNotifyResult() { notifyAskResult = nil }

    public var elevatedForGeneral: Bool {
        didSet { settings.elevatedForGeneral = elevatedForGeneral }
    }

    /// Show the notification ask after the first Elevated+ view, not on first launch (COPY §11).
    public var shouldAskNotify: Bool {
        guard let snapshot, !notifyAsked, notifyStatus != .granted else { return false }
        return snapshot.band >= .elevated
    }

    /// Answer the in-app ask. "Yes" awaits the real authorization and shows the result inline.
    public func answerNotifyAsk(_ yes: Bool) async {
        notifyAsked = true
        guard yes else {
            notifyOnRise = false
            return
        }
        notifyAskResult = .requesting
        settings.notifyOnRise = true
        await requestNotifications(confirm: true)
        notifyOnRise = notifyStatus == .granted
        notifyAskResult = notifyStatus
    }

    /// Called whenever a *new* snapshot is produced (for widget reloads, Live Activities, etc).
    @ObservationIgnored public var onSnapshot: ((Snapshot) -> Void)?

    @ObservationIgnored public let settings: HazeSettings
    @ObservationIgnored private let client: HazeClient
    @ObservationIgnored private let location = LocationProvider()
    @ObservationIgnored private var pollTask: Task<Void, Never>?
    @ObservationIgnored private var failures = 0
    @ObservationIgnored private var retryAfter: TimeInterval?

    public init(settings: HazeSettings = .shared, client: HazeClient = HazeClient()) {
        self.settings = settings
        self.client = client
        settings.applyMockLaunchArgument()
        mockScenario = settings.mockScenario
        placeMode = settings.placeMode
        locationFallback = settings.locationFallback
        savedPlaces = settings.savedPlaces
        // QA mock runs skip the first-run choice so scenarios render deterministically.
        onboarded = settings.onboarded || settings.mockScenario != nil
        profiles = settings.profiles
        notifyOnRise = settings.notifyOnRise
        notifyAsked = settings.notifyAsked
        elevatedForGeneral = settings.elevatedForGeneral
        if mockScenario == nil { snapshot = settings.lastSnapshot } // instant paint from cache
        if let c = settings.lastCoordinate { coordinate = CLLocationCoordinate2D(latitude: c.lat, longitude: c.lon) }
        if let snapshot { insight = HazeInsight(snapshot: snapshot, location: locationInput, placeName: resolved.name, profiles: profiles) }
        applyStartPlace()
        location.onUpdate = { [weak self] status, coord in
            guard let self else { return }
            self.locationStatus = status
            if let coord {
                // Round to 2 decimals (~1 km) before storing (SPEC v1.4).
                let lat = (coord.latitude * 100).rounded() / 100, lon = (coord.longitude * 100).rounded() / 100
                self.coordinate = CLLocationCoordinate2D(latitude: lat, longitude: lon)
                self.settings.lastCoordinate = (lat, lon)
            }
            self.placeChanged()
        }
    }

    /// The resolved place. "My location" falls back quietly to the island view while no fix is available.
    public var resolved: ResolvedPlace {
        let fix: (lat: Double, lon: Double)? = {
            guard case .myLocation = placeMode, let c = coordinate,
                  locationStatus == .active || locationStatus == .requesting else { return nil }
            return (c.latitude, c.longitude)
        }()
        return ResolvedPlace.resolve(placeMode, gps: fix, saved: savedPlaces, fallback: locationFallback)
    }

    public var locationInput: LocationInput { resolved.input }

    /// The user tapped "Use my location": the only path that triggers the OS prompt (never automatic).
    public func useMyLocation() {
        onboarded = true
        if case .myLocation = placeMode { location.start() } else { placeMode = .myLocation }
    }

    /// Save the current place (location fix or picked area) as Home / Work-School / other.
    public func save(_ kind: SavedPlace.Kind, area: SGArea? = nil) {
        let place: SavedPlace
        if let area {
            place = SavedPlace(kind: kind, area: area)
        } else if let c = resolved.input.coordinate {
            place = SavedPlace(kind: kind, area: resolved.name.flatMap { SGAreas.named($0)?.name }, lat: c.lat, lon: c.lon)
        } else { return }
        savedPlaces = savedPlaces.filter { $0.kind != kind } + [place]
    }

    public var isMyLocation: Bool { if case .myLocation = placeMode { true } else { false } }

    /// COPY §10 location states.
    public var locationNote: String? {
        guard isMyLocation else { return nil }
        switch locationStatus {
        case .denied, .unavailable: return HazeCopy.locationDenied(resolved.label)
        case .requesting where coordinate == nil: return HazeCopy.locationLoading
        default: return nil
        }
    }

    /// OS-denied: show the quiet "Use my location" chip that deep-links to Settings.
    public var locationDenied: Bool { isMyLocation && locationStatus == .denied }

    /// COPY §10 detail line for the current data state (offline with cache, late hour, stale…), if any.
    public var statusDetail: String? {
        guard let s = snapshot else { return nil }
        let obs = HazeFormat.hour(s.observedAt)
        if loadError == .offline { return HazeCopy.offlineCached(obs) }
        // Timeout / API error with a cached reading: say so, with the reading's time and age (COPY §10).
        if loadError == .api {
            let min = max(0, Int(referenceNow.timeIntervalSince(s.observedAt) / 60))
            return "\(HazeCopy.apiErrorTitle). Showing the last reading we got, from \(obs) (\(Provenance.formatAge(minutes: min)))."
        }
        if s.stale {
            let latest = data?.readings.last
            if let latest, !latest.hasAnyValid { return HazeCopy.allOffline(obs) }
            return HazeCopy.staleDetail
        }
        if referenceNow.timeIntervalSince(s.observedAt) > 75 * 60 { return HazeCopy.nextUpdateSoon }
        return nil
    }

    public func start() {
        guard pollTask == nil else { return }
        if isMyLocation { location.start() }
        Task { await refreshNotifyStatus() }
        pollTask = Task { [weak self] in
            var includeV2 = true
            while !Task.isCancelled {
                guard let self else { return }
                let delay: TimeInterval
                if let target = self.countryTarget {
                    await self.refreshCountry(target)
                    delay = self.countryPollDelay(target)
                } else {
                    await self.refresh(includeV2: includeV2)
                    let plan = PollSchedule.next(now: Date(), latestObserved: self.data?.latestObserved,
                                                 failures: self.failures, retryAfter: self.retryAfter)
                    includeV2 = plan.includeV2
                    delay = plan.delay
                }
                // A place change wakes the loop early (see placeChanged()).
                self.pollWake = false
                var waited: TimeInterval = 0
                while waited < max(5, delay), !self.pollWake, !Task.isCancelled {
                    try? await Task.sleep(for: .seconds(1))
                    waited += 1
                }
            }
        }
    }

    @ObservationIgnored var pollWake = false

    public func stop() {
        pollTask?.cancel()
        pollTask = nil
    }

    public func refresh(includeV2: Bool = true) async {
        if let target = countryTarget {
            await refreshCountry(target)
            return
        }
        isLoading = true
        defer { isLoading = false }
        do {
            let loaded = try await HazeSource.load(settings: settings, client: client, includeV2: includeV2)
            mockScenario = loaded.mockScenario
            referenceNow = loaded.now
            lastChecked = Date()
            loadError = nil
            failures = 0
            retryAfter = nil
            // Don't re-render if nothing changed.
            if let data, data == loaded.data {
                recompute()
                return
            }
            data = loaded.data
            recompute(newData: true)
        } catch {
            lastChecked = Date()
            mockScenario = settings.mockScenario
            failures += 1
            let e = error as? HazeClientError
            retryAfter = e?.retryAfter
            switch e {
            case .offline?: loadError = .offline
            case .noData?: loadError = .noData
            default: loadError = .api
            }
            if mockScenario != nil { data = nil; snapshot = nil; insight = nil }
        }
    }

    public func recompute(newData: Bool = false) {
        if mockScenario == nil { referenceNow = max(referenceNow, Date()) }
        guard let data else {
            if let snapshot { insight = HazeInsight(snapshot: snapshot, location: locationInput, placeName: resolved.name, profiles: profiles, now: referenceNow) }
            return
        }
        let input = locationInput
        guard let snap = HazeCompute.snapshot(data: data, location: input, now: referenceNow) else { return }
        let changed = snap != snapshot
        snapshot = snap
        insight = HazeInsight(snapshot: snap, location: input, placeName: resolved.name, profiles: profiles, now: referenceNow)
        if changed || newData {
            if mockScenario == nil { settings.lastSnapshot = snap }
            if newData { HazeNotifier.handle(snap, profiles: profiles, settings: settings, now: referenceNow) }
            onSnapshot?(snap)
        }
    }
}
