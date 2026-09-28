import Foundation

// Band-crossing notifications (SPEC v1.1 §10, v1.2 §7, COPY §11). Pure state machine; the app delivers.
//
// - Only on band crossings, confirmed by hysteresis (2 consecutive hours across, or ≥10 µg/m³ past the edge).
// - Defaults: crossings to High+ for everyone; to Elevated only for sensitive / exercise / outdoor-work
//   profiles (General-only is opt-in).
// - At most 3 notifications a day; the all-clear always gets through.
// - Quiet hours 22:00–07:00: nothing is sent; if something happened, a morning catch-up is sent after.

public struct HazeAlert: Sendable, Hashable {
    public enum Kind: String, Sendable { case rising, easing, allClear, morning }
    public var kind: Kind
    public var title: String
    public var body: String
}

public struct AlertPreferences: Sendable, Hashable {
    public var enabled: Bool
    /// Opt-in: Elevated crossings for a General-only profile.
    public var elevatedForGeneral: Bool
    public var quietStartHour: Int
    public var quietEndHour: Int
    public var maxPerDay: Int

    public init(enabled: Bool = true, elevatedForGeneral: Bool = false, quietStartHour: Int = 22,
                quietEndHour: Int = 7, maxPerDay: Int = 3) {
        self.enabled = enabled
        self.elevatedForGeneral = elevatedForGeneral
        self.quietStartHour = quietStartHour
        self.quietEndHour = quietEndHour
        self.maxPerDay = maxPerDay
    }
}

public struct AlertState: Codable, Sendable, Hashable {
    public var confirmedBand: Band?
    /// SGT day ("YYYY-MM-DD") that `sentToday` counts.
    public var day: String = ""
    public var sentToday: Int = 0
    /// Highest band reached while notifications were held back during quiet hours.
    public var quietPeak: Band?

    public init(confirmedBand: Band? = nil) { self.confirmedBand = confirmedBand }
}

public enum BandAlerts {
    static func upperEdge(_ band: Band) -> Int {
        switch band {
        case .normal: 55
        case .elevated: 150
        case .high: 250
        case .veryHigh: Int.max
        }
    }

    /// Confirms a band change only if the new band held for 2 consecutive hours, or the latest value is
    /// ≥10 µg/m³ past the boundary. `recent` = hourly values, oldest → newest.
    public static func confirmedBand(previous: Band, recent: [Int]) -> Band {
        guard let last = recent.last else { return previous }
        let candidate = HazeCompute.band(pm25: last)
        guard candidate != previous else { return previous }
        if recent.count >= 2, HazeCompute.band(pm25: recent[recent.count - 2]) == candidate { return candidate }
        if candidate > previous {
            if last >= candidate.lowerBound - 1 + 10 { return candidate }
        } else {
            if last <= upperEdge(candidate) - 10 { return candidate }
        }
        return previous
    }

    /// Quiet hours (SGT). Handles windows that wrap midnight.
    public static func isQuietHour(_ date: Date, startHour: Int = 22, endHour: Int = 7) -> Bool {
        let h = HazeFormat.sgtCalendar.component(.hour, from: date)
        if startHour == endHour { return false }
        return startHour < endHour ? (h >= startHour && h < endHour) : (h >= startHour || h < endHour)
    }

    /// Would a crossing *into* `band` be announced for these profiles by default?
    public static func announces(_ band: Band, profiles: [Profile], prefs: AlertPreferences) -> Bool {
        switch band {
        case .normal: return true // all-clear
        case .high, .veryHigh: return true
        case .elevated:
            let ids = Profile.normalise(profiles)
            return prefs.elevatedForGeneral || Profile.isSensitive(ids) || ids.contains(.exercising) || ids.contains(.outdoorWorker)
        }
    }

    /// Advance the state machine with a new snapshot. Returns the new state and at most one alert.
    public static func evaluate(state: AlertState, snapshot s: Snapshot, profiles: [Profile],
                                prefs: AlertPreferences = AlertPreferences(), now: Date = Date()) -> (AlertState, HazeAlert?) {
        var st = state
        let today = HazeFormat.sgtDay(now)
        if st.day != today { st.day = today; st.sentToday = 0 }
        guard !s.stale else { return (st, nil) }
        guard let previous = st.confirmedBand else {
            st.confirmedBand = s.band
            return (st, nil)
        }
        let recent = s.history.map(\.pm25)
        let confirmed = confirmedBand(previous: previous, recent: recent.isEmpty ? [s.pm25] : recent)
        st.confirmedBand = confirmed
        let quiet = isQuietHour(now, startHour: prefs.quietStartHour, endHour: prefs.quietEndHour)
        let ids = Profile.normalise(profiles)

        // Morning catch-up: first evaluation after quiet hours, if something happened overnight.
        if !quiet, let peak = st.quietPeak {
            st.quietPeak = nil
            guard prefs.enabled else { return (st, nil) }
            let v = HazeCompute.verdict(band: s.band, profiles: ids)
            let word = HazeCompute.trendWord(history: s.history)?.rawValue ?? "steady"
            return (st, HazeAlert(kind: .morning, title: "Overnight air update",
                                  body: "The haze reached \(peak.label) overnight. Now: \(s.band.label), PM2.5 \(s.pm25), \(word). \(v.headline)"))
        }

        guard confirmed != previous, prefs.enabled else { return (st, nil) }
        let kind: HazeAlert.Kind = confirmed == .normal ? .allClear : (confirmed > previous ? .rising : .easing)
        if kind == .rising, !announces(confirmed, profiles: ids, prefs: prefs) { return (st, nil) }

        if quiet {
            st.quietPeak = max(st.quietPeak ?? confirmed, max(confirmed, previous))
            return (st, nil)
        }
        if kind != .allClear {
            guard st.sentToday < prefs.maxPerDay else { return (st, nil) }
            st.sentToday += 1
        }
        return (st, alert(kind: kind, snapshot: s, band: confirmed, profiles: ids))
    }

    /// COPY §11 wording.
    public static func alert(kind: HazeAlert.Kind, snapshot s: Snapshot, band: Band, profiles: [Profile]) -> HazeAlert {
        let area = s.placePhrase
        let v = HazeCompute.verdict(band: band, profiles: profiles).headline
        switch kind {
        case .allClear:
            let tail: String = if profiles.contains(.kids) {
                "Fine for outdoor play again."
            } else if profiles.contains(.exercising) {
                "Fine for your run."
            } else {
                "Fine to be out. Good time to open the windows."
            }
            return HazeAlert(kind: .allClear, title: "All clear \(area)", body: "Air's back to Normal (PM2.5 \(s.pm25)). \(tail)")
        case .easing:
            return HazeAlert(kind: .easing, title: "Haze easing \(area)", body: "Down to \(band.label) (PM2.5 \(s.pm25)). \(v)")
        case .rising, .morning:
            switch band {
            case .elevated:
                return HazeAlert(kind: .rising, title: "Haze rising \(area)", body: "Now Elevated (PM2.5 \(s.pm25)). \(v)")
            case .high:
                return HazeAlert(kind: .rising, title: "Haze now High \(area)",
                                 body: "PM2.5 \(s.pm25). \(v) Close windows and keep cool with aircon or a fan.")
            default:
                return HazeAlert(kind: .rising, title: "Haze now Very High \(area)",
                                 body: "PM2.5 \(s.pm25). \(v) Check on older family.")
            }
        }
    }
}
