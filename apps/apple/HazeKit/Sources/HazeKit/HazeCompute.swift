import Foundation

// MARK: - Inputs

/// A region's label location (always read from `regionMetadata`; see `HazeRegions.fallback`).
public struct RegionPoint: Sendable, Hashable, Codable {
    public var name: String
    public var lat: Double
    public var lon: Double

    public init(name: String, lat: Double, lon: Double) {
        self.name = name
        self.lat = lat
        self.lon = lon
    }
}

/// One hourly publication for one reading key. `values` holds ONLY valid readings (offline / -1 / null removed).
public struct HourlyReading: Sendable, Hashable {
    public var time: Date        // item.timestamp (the hour)
    public var published: Date   // v1 update_timestamp (first publish) or v2 updatedTimestamp (last revised)
    public var values: [String: Double]

    public init(time: Date, published: Date, values: [String: Double]) {
        self.time = time
        self.published = published
        self.values = values.filter { HazeCompute.isValid($0.value) }
    }

    /// Build from raw values where nil / negative / NaN mean "station offline".
    public init(time: Date, published: Date, rawValues: [String: Double?]) {
        var clean: [String: Double] = [:]
        for (k, v) in rawValues { if let v, HazeCompute.isValid(v) { clean[k] = v } }
        self.init(time: time, published: published, values: clean)
    }

    public var hasAnyValid: Bool { !values.isEmpty }
}

/// Where the user is, for "reading at your spot" (SPEC §1).
public enum LocationInput: Sendable, Hashable, Codable {
    case gps(lat: Double, lon: Double)
    case region(String)
    /// No location and no area: the island average (SPEC v1.4 §3 fallback).
    case island

    public static let `default` = LocationInput.region("central")

    public var coordinate: (lat: Double, lon: Double)? {
        if case let .gps(lat, lon) = self { return (lat, lon) }
        return nil
    }
}

/// Everything fetched from data.gov.sg that a Snapshot is computed from.
/// Cache this and recompute when the user's location changes.
public struct HazeData: Sendable, Hashable {
    /// 1-hr PM2.5, oldest → newest, unique by `time`.
    public var readings: [HourlyReading]
    /// Official 24-hr PSI (`psi_twenty_four_hourly`), hourly.
    public var psiHistory: [HourlyReading]
    /// NEA's 24-hr average PM2.5 in µg/m³ (`pm25_twenty_four_hourly`), hourly — the chart line.
    public var avg24History: [HourlyReading]
    public var regions: [RegionPoint]

    public init(readings: [HourlyReading], psiHistory: [HourlyReading] = [], avg24History: [HourlyReading] = [],
                regions: [RegionPoint]) {
        self.readings = HazeData.normalize(readings)
        self.psiHistory = HazeData.normalize(psiHistory)
        self.avg24History = HazeData.normalize(avg24History)
        self.regions = regions.isEmpty ? HazeRegions.fallback : regions
    }

    /// Convenience: a single "latest" official 24-hr PSI, stamped at the newest PM2.5 hour.
    public init(readings: [HourlyReading], psi24h: [String: Double], regions: [RegionPoint]) {
        let norm = HazeData.normalize(readings)
        let psi = norm.last.map { [HourlyReading(time: $0.time, published: $0.published, values: psi24h)] } ?? []
        self.init(readings: norm, psiHistory: psi, regions: regions)
    }

    /// De-duplicate by hour (oldest → newest). The later-published copy wins, but a valid value is never
    /// replaced by a missing one (values can be back-filled).
    public static func normalize(_ readings: [HourlyReading]) -> [HourlyReading] {
        var byTime: [Date: HourlyReading] = [:]
        for r in readings {
            guard let prev = byTime[r.time] else { byTime[r.time] = r; continue }
            let (newer, older) = r.published >= prev.published ? (r, prev) : (prev, r)
            byTime[r.time] = HourlyReading(time: r.time, published: newer.published,
                                           values: older.values.merging(newer.values) { _, new in new })
        }
        return byTime.values.sorted { $0.time < $1.time }
    }

    /// SPEC v1.3 merge rule, per hour and region: v2 value if valid, else v1 value if valid, else invalid.
    /// `published` = v1 `update_timestamp` when available (the stable first-publish stamp).
    public static func mergeSources(v1: [HourlyReading], v2: [HourlyReading]) -> [HourlyReading] {
        let a = Dictionary(normalize(v1).map { ($0.time, $0) }, uniquingKeysWith: { $1 })
        let b = Dictionary(normalize(v2).map { ($0.time, $0) }, uniquingKeysWith: { $1 })
        return Set(a.keys).union(b.keys).sorted().map { t in
            let one = a[t], two = b[t]
            let values = (one?.values ?? [:]).merging(two?.values ?? [:]) { _, v2 in v2 }
            return HourlyReading(time: t, published: one?.published ?? two!.published, values: values)
        }
    }

    /// Newest publish stamp — use to skip re-rendering when unchanged.
    public var latestPublished: Date? { readings.last?.published }
    /// Newest observed hour.
    public var latestObserved: Date? { readings.last(where: { $0.hasAnyValid })?.time }
}

// MARK: - Computation (SPEC §1–§5)

public enum HazeCompute {
    /// A reading is valid unless it is missing, null, negative (e.g. -1) or not finite.
    public static func isValid(_ v: Double?) -> Bool {
        guard let v else { return false }
        return v.isFinite && v >= 0
    }

    /// Round half up (88.5 → 89). Inputs are non-negative concentrations.
    public static func roundHalfUp(_ x: Double) -> Int {
        Int((x + 0.5).rounded(.down))
    }

    // MARK: §2 Band

    public static func band(pm25: Int) -> Band {
        switch pm25 {
        case ...55: .normal
        case 56...150: .elevated
        case 151...250: .high
        default: .veryHigh
        }
    }

    // MARK: §3 Instant PSI (data model only — not shown in UI per SPEC v1.2 §1)

    /// NEA PM2.5 sub-index breakpoints: (Clo, Chi, Ilo, Ihi).
    public static let breakpoints: [(cLo: Double, cHi: Double, iLo: Double, iHi: Double)] = [
        (0, 12, 0, 50),
        (12, 55, 50, 100),
        (55, 150, 100, 200),
        (150, 250, 200, 300),
        (250, 350, 300, 400),
        (350, 500, 400, 500),
    ]

    /// Instant PSI estimate from a 1-hr PM2.5 concentration. Capped at 500. `nil` for invalid input.
    public static func instantPsi(pm25 c: Double) -> Int? {
        guard isValid(c) else { return nil }
        if c >= 500 { return 500 }
        for bp in breakpoints where c <= bp.cHi {
            let index = bp.iLo + (c - bp.cLo) * (bp.iHi - bp.iLo) / (bp.cHi - bp.cLo)
            return min(500, roundHalfUp(index))
        }
        return 500
    }

    public static func instantPsi(forPM25 pm25: Int) -> Int {
        instantPsi(pm25: Double(pm25)) ?? 0
    }

    /// NEA 24-hr PSI descriptor.
    public static func psiLabel(_ psi: Int) -> PsiLabel {
        switch psi {
        case ...50: .good
        case 51...100: .moderate
        case 101...200: .unhealthy
        case 201...300: .veryUnhealthy
        default: .hazardous
        }
    }

    // MARK: §4 Trend

    public static func trendDirection(delta: Int) -> TrendDirection {
        if delta >= 5 { return .up }
        if delta <= -5 { return .down }
        return .steady
    }

    // MARK: §1 Location

    /// Great-circle distance in km.
    public static func haversineKm(lat1: Double, lon1: Double, lat2: Double, lon2: Double) -> Double {
        let r = 6371.0088
        let toRad = Double.pi / 180
        let dLat = (lat2 - lat1) * toRad
        let dLon = (lon2 - lon1) * toRad
        let a = sin(dLat / 2) * sin(dLat / 2)
            + cos(lat1 * toRad) * cos(lat2 * toRad) * sin(dLon / 2) * sin(dLon / 2)
        return 2 * r * atan2(sqrt(a), sqrt(1 - a))
    }

    public static let snapKm = 0.5

    public struct SpotValue: Sendable, Hashable {
        public var value: Double
        public var mode: LocationMode
        public var nearestRegion: String
    }

    /// The (unrounded) value "at your spot" for one set of valid regional values.
    /// Returns nil when no region has a valid value.
    public static func valueAt(
        _ values: [String: Double],
        regions: [RegionPoint],
        location: LocationInput
    ) -> SpotValue? {
        let valid = values.filter { isValid($0.value) }
        guard !valid.isEmpty else { return nil }

        switch location {
        case let .gps(lat, lon):
            let points = regions.filter { valid[$0.name] != nil }
            guard !points.isEmpty else {
                return SpotValue(value: mean(valid), mode: .island, nearestRegion: nearestName(valid.keys))
            }
            typealias Dist = (point: RegionPoint, km: Double)
            let unsorted: [Dist] = points.map { p in
                (point: p, km: haversineKm(lat1: lat, lon1: lon, lat2: p.lat, lon2: p.lon))
            }
            let distances = unsorted.sorted { (a: Dist, b: Dist) -> Bool in
                if a.km != b.km { return a.km < b.km }
                return a.point.name < b.point.name
            }
            let nearest = distances[0]
            if nearest.km < snapKm {
                return SpotValue(value: valid[nearest.point.name]!, mode: .gps, nearestRegion: nearest.point.name)
            }
            var num = 0.0, den = 0.0
            for d in distances {
                let w = 1 / (d.km * d.km)
                num += w * valid[d.point.name]!
                den += w
            }
            return SpotValue(value: num / den, mode: .gps, nearestRegion: nearest.point.name)

        case .island:
            return SpotValue(value: mean(valid), mode: .island, nearestRegion: "")

        case let .region(name):
            let key = name.lowercased()
            if let v = valid[key] {
                return SpotValue(value: v, mode: .region, nearestRegion: key)
            }
            return SpotValue(value: mean(valid), mode: .island, nearestRegion: key)
        }
    }

    private static func mean(_ values: [String: Double]) -> Double {
        values.values.reduce(0, +) / Double(values.count)
    }

    private static func nearestName(_ keys: some Collection<String>) -> String {
        HazeRegions.displayOrder(keys).first ?? "central"
    }

    // MARK: Snapshot

    /// Readings older than this are "stale" (SPEC §7).
    public static let staleAfter: TimeInterval = 2 * 3600 + 15 * 60
    /// Number of hourly points exposed for sparklines / the chart.
    public static let historyLength = 24

    /// Compute the canonical Snapshot. Returns nil only if there is no valid data at all.
    public static func snapshot(data: HazeData, location: LocationInput = .default, now: Date = Date()) -> Snapshot? {
        let readings = data.readings
        guard let latestIndex = readings.lastIndex(where: { $0.hasAnyValid }) else { return nil }
        let latest = readings[latestIndex]
        let walkedBack = latestIndex != readings.count - 1

        guard let spot = valueAt(latest.values, regions: data.regions, location: location) else { return nil }
        let pm25 = roundHalfUp(spot.value)
        let psi = instantPsi(forPM25: pm25)

        // Trend: vs the reading exactly one hour earlier, same location method (else steady/0).
        var delta = 0
        let previousHour = latest.time.addingTimeInterval(-3600)
        if let previous = readings.first(where: { $0.time == previousHour }),
           let prevSpot = valueAt(previous.values, regions: data.regions, location: location) {
            delta = pm25 - roundHalfUp(prevSpot.value)
        }

        func at(_ hours: [HourlyReading], _ time: Date) -> Int? {
            guard let h = hours.first(where: { $0.time == time }) else { return nil }
            return valueAt(h.values, regions: data.regions, location: location).map { roundHalfUp($0.value) }
        }

        // History at the same spot, oldest → newest, the last 24 hours up to the observed hour.
        let minTime = latest.time.addingTimeInterval(-Double(historyLength - 1) * 3600)
        let history: [HistoryPoint] = readings[...latestIndex]
            .filter { $0.time >= minTime }
            .compactMap { r in
                let v = r.time == latest.time ? pm25 : valueAt(r.values, regions: data.regions, location: location).map { roundHalfUp($0.value) }
                return v.map { HistoryPoint(time: r.time, pm25: $0, psi24h: at(data.psiHistory, r.time), pm25Avg24h: at(data.avg24History, r.time)) }
            }

        // Official 24-hr PSI now: the item for the same hour, else the newest.
        let psiHour = data.psiHistory.first(where: { $0.time == latest.time }) ?? data.psiHistory.last
        let psiValues = psiHour?.values ?? [:]
        let official = valueAt(psiValues, regions: data.regions, location: location).map { roundHalfUp($0.value) }

        var regions: [String: RegionReading] = [:]
        for point in data.regions {
            regions[point.name] = RegionReading(
                pm25: latest.values[point.name].map(roundHalfUp),
                psi24h: psiValues[point.name].map(roundHalfUp),
                lat: point.lat, lon: point.lon
            )
        }

        let stale = walkedBack || now.timeIntervalSince(latest.time) > staleAfter

        return Snapshot(
            pm25: pm25,
            band: band(pm25: pm25),
            instantPsi: psi,
            instantPsiLabel: psiLabel(psi),
            officialPsi24h: official,
            trend: Trend(delta: delta),
            history: history,
            regions: regions,
            nearestRegion: spot.nearestRegion,
            locationMode: spot.mode,
            observedAt: latest.time,
            publishedAt: latest.published,
            stale: stale
        )
    }
}

// MARK: - Regions

public enum HazeRegions {
    /// Fallback only — real coordinates come from `regionMetadata`.
    public static let fallback: [RegionPoint] = [
        RegionPoint(name: "north", lat: 1.41803, lon: 103.82),
        RegionPoint(name: "south", lat: 1.29587, lon: 103.82),
        RegionPoint(name: "east", lat: 1.35735, lon: 103.94),
        RegionPoint(name: "west", lat: 1.35735, lon: 103.70),
        RegionPoint(name: "central", lat: 1.35735, lon: 103.82),
    ]

    /// Display order (roughly spatial), shared with the TS/Kotlin clients.
    public static let canonicalOrder = ["north", "west", "central", "east", "south"]

    /// Canonical order first, then any unknown regions alphabetically.
    public static func displayOrder(_ names: some Collection<String>) -> [String] {
        let set = Set(names)
        let known = canonicalOrder.filter(set.contains)
        let unknown = set.subtracting(canonicalOrder).sorted()
        return known + unknown
    }
}

// MARK: - Poll cadence (SPEC v1.3 §3)

public enum PollSchedule {
    public struct Plan: Sendable, Equatable {
        /// Seconds from now until the next fetch.
        public var delay: TimeInterval
        /// Also call v2 (rate-limited) on this fetch, to catch back-fills.
        public var includeV2: Bool
    }

    /// Next poll:
    /// - from hh:00:30, every 60 s (v1 only) until the new hour appears, stopping at hh:10;
    /// - one v2 call at ~hh:35 and ~hh:50 to catch back-fills;
    /// - idle otherwise (next hh:00:30);
    /// - after failures / 429: exponential backoff 30 s → 10 min, honouring Retry-After.
    public static func next(now: Date = Date(), latestObserved: Date?, failures: Int = 0,
                            retryAfter: TimeInterval? = nil) -> Plan {
        if failures > 0 {
            let backoff = min(600, 30 * pow(2, Double(failures - 1)))
            return Plan(delay: max(backoff, min(600, retryAfter ?? 0)), includeV2: false)
        }
        let cal = HazeFormat.sgtCalendar
        let hourStart = cal.dateInterval(of: .hour, for: now)?.start ?? now
        let secs = now.timeIntervalSince(hourStart)
        let haveCurrentHour = (latestObserved ?? .distantPast) >= hourStart

        if !haveCurrentHour {
            if secs < 30 { return Plan(delay: 30 - secs, includeV2: false) }
            if secs < 600 { return Plan(delay: 60, includeV2: false) }
        }
        let events: [(TimeInterval, Bool)] = [(35 * 60, true), (50 * 60, true), (3600 + 30, false)]
        for (offset, v2) in events where offset > secs + 1 {
            return Plan(delay: offset - secs, includeV2: v2)
        }
        return Plan(delay: 3600 + 30 - secs, includeV2: false)
    }

    /// Widgets / timelines: request the next refresh at hh:02 (the OS may delay it).
    public static func widgetNextRefresh(after now: Date = Date()) -> Date {
        let cal = HazeFormat.sgtCalendar
        let hourStart = cal.dateInterval(of: .hour, for: now)?.start ?? now
        let thisHour = hourStart.addingTimeInterval(120)
        return thisHour > now ? thisHour : thisHour.addingTimeInterval(3600)
    }
}
