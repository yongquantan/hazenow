import Foundation
#if os(macOS)
import Security
#endif

/// Settings + last snapshot shared between an app and its widgets / Live Activity.
///
/// Uses the App Group `group.sg.hazenow` when the build is signed with that entitlement;
/// otherwise (unsigned dev builds) falls back to the process's standard defaults, so the
/// app still works — widgets simply fetch on their own.
public final class HazeSettings: @unchecked Sendable {
    public static let appGroup = "group.sg.hazenow"
    public static let shared = HazeSettings()

    public let defaults: UserDefaults

    public init(defaults: UserDefaults? = nil) {
        if let defaults {
            self.defaults = defaults
        } else if HazeSettings.appGroupAvailable, let group = UserDefaults(suiteName: HazeSettings.appGroup) {
            self.defaults = group
        } else {
            self.defaults = .standard
        }
    }

    /// True only if the container for the app group exists (i.e. entitlement is present).
    public static var appGroupAvailable: Bool {
        #if os(macOS)
        // On macOS containerURL(...) returns a path even without the entitlement, and touching
        // an un-entitled group container can trigger a privacy prompt. Check the entitlement.
        guard let task = SecTaskCreateFromSelf(nil),
              let value = SecTaskCopyValueForEntitlement(task, "com.apple.security.application-groups" as CFString, nil),
              let groups = value as? [String] else { return false }
        return groups.contains(appGroup)
        #else
        return FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: appGroup) != nil
        #endif
    }

    private enum Key {
        static let region = "hazenow.region"
        static let useLocation = "hazenow.useLocation"
        static let lastLat = "hazenow.lastLat"
        static let lastLon = "hazenow.lastLon"
        static let lastSnapshot = "hazenow.lastSnapshot"
        static let notifyOnRise = "hazenow.notifyOnRise"
        static let showNotch = "hazenow.showNotch"
        static let profiles = "hazenow.profiles"
        static let alertState = "hazenow.alertState"
        static let elevatedForGeneral = "hazenow.elevatedForGeneral"
        static let notifyAsked = "hazenow.notifyAsked"
        static let mock = "hazenow.mock"
        static let placeMode = "hazenow.placeMode"
        static let savedPlaces = "hazenow.savedPlaces"
        static let onboarded = "hazenow.onboarded"
        static let quietStart = "hazenow.quietStart"
        static let quietEnd = "hazenow.quietEnd"
    }

    public var selectedRegion: String {
        get { defaults.string(forKey: Key.region) ?? "central" }
        set { defaults.set(newValue, forKey: Key.region) }
    }

    public var useLocation: Bool {
        get { defaults.bool(forKey: Key.useLocation) }
        set { defaults.set(newValue, forKey: Key.useLocation) }
    }

    public var notifyOnRise: Bool {
        get { defaults.object(forKey: Key.notifyOnRise) as? Bool ?? true }
        set { defaults.set(newValue, forKey: Key.notifyOnRise) }
    }

    public var showNotch: Bool {
        get { defaults.object(forKey: Key.showNotch) as? Bool ?? true }
        set { defaults.set(newValue, forKey: Key.showNotch) }
    }

    /// "Who are you checking for?" — on-device only. Defaults to [.general].
    public var profiles: Set<Profile> {
        get {
            let raw = defaults.stringArray(forKey: Key.profiles) ?? []
            return Set(Profile.normalise(raw.compactMap(Profile.init(rawValue:))))
        }
        set { defaults.set(Profile.normalise(newValue).map(\.rawValue), forKey: Key.profiles) }
    }

    /// Band-alert state machine (confirmed band, daily count, overnight peak).
    public var alertState: AlertState {
        get {
            defaults.data(forKey: Key.alertState).flatMap { try? JSONDecoder().decode(AlertState.self, from: $0) } ?? AlertState()
        }
        set { defaults.set(try? JSONEncoder().encode(newValue), forKey: Key.alertState) }
    }

    /// Opt-in: Elevated alerts for a General-only profile (off by default, COPY §11).
    public var elevatedForGeneral: Bool {
        get { defaults.bool(forKey: Key.elevatedForGeneral) }
        set { defaults.set(newValue, forKey: Key.elevatedForGeneral) }
    }

    /// Whether we've shown the notification permission ask (after the first Elevated+ view).
    public var notifyAsked: Bool {
        get { defaults.bool(forKey: Key.notifyAsked) }
        set { defaults.set(newValue, forKey: Key.notifyAsked) }
    }

    /// What to show (SPEC v1.4). Migrates the older useLocation/selectedRegion pair.
    public var placeMode: PlaceMode {
        get {
            if let d = defaults.data(forKey: Key.placeMode), let m = try? JSONDecoder().decode(PlaceMode.self, from: d) { return m }
            if useLocation { return .myLocation }
            return defaults.string(forKey: Key.region).map { .region($0) } ?? .region("central")
        }
        set { defaults.set(try? JSONEncoder().encode(newValue), forKey: Key.placeMode) }
    }

    /// Home / Work-School / one more. Coordinates are rounded on creation.
    public var savedPlaces: [SavedPlace] {
        get { defaults.data(forKey: Key.savedPlaces).flatMap { try? JSONDecoder().decode([SavedPlace].self, from: $0) } ?? [] }
        set { defaults.set(try? JSONEncoder().encode(newValue), forKey: Key.savedPlaces) }
    }

    /// First-run choice made ("Use my location" / "Pick my area").
    public var onboarded: Bool {
        get { defaults.bool(forKey: Key.onboarded) }
        set { defaults.set(newValue, forKey: Key.onboarded) }
    }

    /// Resolve the current mode for widgets/background work (uses the last stored, rounded fix).
    public var resolvedPlace: ResolvedPlace {
        ResolvedPlace.resolve(placeMode, gps: lastCoordinate, saved: savedPlaces)
    }

    /// Active QA mock scenario (see `HazeMock`), shared with widgets. nil = live data.
    /// Mock mode is available only in DEBUG builds; release builds ignore the flag and the stored key.
    public static var mockAllowed: Bool {
        #if DEBUG
        true
        #else
        false
        #endif
    }

    public var mockScenario: String? {
        get {
            guard Self.mockAllowed else { return nil }
            return defaults.string(forKey: Key.mock).flatMap { $0.isEmpty ? nil : $0 }
        }
        set {
            if let newValue, !newValue.isEmpty, Self.mockAllowed {
                defaults.set(newValue, forKey: Key.mock)
            } else {
                defaults.removeObject(forKey: Key.mock)
            }
        }
    }

    /// Apply `-HazeMock <scenario>` at app launch. Mock is **session-scoped**: launching without the flag
    /// clears any scenario a previous QA launch left behind, in these defaults (the App Group the widgets
    /// read) and in the app's own standard defaults. Widgets never call this; they only read.
    public func applyMockLaunchArgument() {
        applyMock(launchValue: HazeMock.launchArgument, allowed: Self.mockAllowed, alsoClear: [.standard])
    }

    /// Testable core. `launchValue`: nil = no flag, "" = `-HazeMock off`, else a scenario.
    public func applyMock(launchValue: String?, allowed: Bool, alsoClear: [UserDefaults] = []) {
        let scenario = allowed ? launchValue.flatMap { $0.isEmpty ? nil : $0 } : nil
        if let scenario {
            defaults.set(scenario, forKey: Key.mock)
        } else {
            defaults.removeObject(forKey: Key.mock)
            for d in alsoClear where d !== defaults { d.removeObject(forKey: Key.mock) }
        }
    }

    /// Raw stored value (for tests / diagnostics), ignoring the DEBUG gate.
    public var storedMockValue: String? { defaults.string(forKey: Key.mock) }

    public var alertPreferences: AlertPreferences {
        AlertPreferences(enabled: notifyOnRise, elevatedForGeneral: elevatedForGeneral,
                         quietStartHour: quietStartHour, quietEndHour: quietEndHour)
    }

    /// Quiet hours, SGT (default 22:00–07:00).
    public var quietStartHour: Int {
        get { defaults.object(forKey: Key.quietStart) as? Int ?? 22 }
        set { defaults.set(newValue, forKey: Key.quietStart) }
    }

    public var quietEndHour: Int {
        get { defaults.object(forKey: Key.quietEnd) as? Int ?? 7 }
        set { defaults.set(newValue, forKey: Key.quietEnd) }
    }

    /// Last known GPS fix (set by the app, used by widgets which can't prompt for location).
    public var lastCoordinate: (lat: Double, lon: Double)? {
        get {
            guard defaults.object(forKey: Key.lastLat) != nil else { return nil }
            return (defaults.double(forKey: Key.lastLat), defaults.double(forKey: Key.lastLon))
        }
        set {
            if let newValue {
                defaults.set(roundCoordinate(newValue.lat), forKey: Key.lastLat)
                defaults.set(roundCoordinate(newValue.lon), forKey: Key.lastLon)
            } else {
                defaults.removeObject(forKey: Key.lastLat)
                defaults.removeObject(forKey: Key.lastLon)
            }
        }
    }

    /// The location input implied by current settings.
    public var locationInput: LocationInput { resolvedPlace.input }

    public var lastSnapshot: Snapshot? {
        get {
            guard let data = defaults.data(forKey: Key.lastSnapshot) else { return nil }
            return try? Snapshot.jsonDecoder().decode(Snapshot.self, from: data)
        }
        set {
            if let newValue, let data = try? Snapshot.jsonEncoder().encode(newValue) {
                defaults.set(data, forKey: Key.lastSnapshot)
            } else {
                defaults.removeObject(forKey: Key.lastSnapshot)
            }
        }
    }
}
