import Foundation

// MARK: - Enums (raw values match SPEC.md §7 exactly)

/// NEA 1-hr PM2.5 band (SPEC §2).
public enum Band: String, Codable, Sendable, CaseIterable, Comparable {
    case normal
    case elevated
    case high
    case veryHigh = "very_high"

    /// Roman numeral used by NEA.
    public var numeral: String {
        switch self {
        case .normal: "I"
        case .elevated: "II"
        case .high: "III"
        case .veryHigh: "IV"
        }
    }

    public var label: String {
        switch self {
        case .normal: "Normal"
        case .elevated: "Elevated"
        case .high: "High"
        case .veryHigh: "Very High"
        }
    }

    /// Band color as a hex string (SPEC §2).
    public var hex: String {
        switch self {
        case .normal: "#2E9E5B"
        case .elevated: "#E8A317"
        case .high: "#E4572E"
        case .veryHigh: "#7B2D8E"
        }
    }

    /// Text/icon variant with ≥4.5:1 contrast on white (light mode).
    public var lightTextHex: String {
        switch self {
        case .normal: "#27854C"
        case .elevated: "#996C0F"
        case .high: "#C94D28"
        case .veryHigh: "#7B2D8E"
        }
    }

    /// Text/icon variant with ≥4.5:1 contrast on near-black (dark mode, #1C1C1E).
    public var darkTextHex: String {
        switch self {
        case .normal: "#2E9E5B"
        case .elevated: "#E8A317"
        case .high: "#E4572E"
        case .veryHigh: "#A772B3"
        }
    }

    public static func rgb(hex: String) -> (red: Double, green: Double, blue: Double) {
        let v = UInt32(hex.dropFirst(), radix: 16) ?? 0
        return (Double((v >> 16) & 0xFF) / 255, Double((v >> 8) & 0xFF) / 255, Double(v & 0xFF) / 255)
    }

    /// 0xRRGGBB for UI layers.
    public var rgb: (red: Double, green: Double, blue: Double) {
        let v = UInt32(hex.dropFirst(), radix: 16) ?? 0
        return (Double((v >> 16) & 0xFF) / 255, Double((v >> 8) & 0xFF) / 255, Double(v & 0xFF) / 255)
    }

    /// Short NEA 1-hr guidance (SPEC §5).
    public var advice: String {
        switch self {
        case .normal:
            "Normal activities."
        case .elevated:
            "Consider reducing prolonged or strenuous outdoor exertion. Elderly, kids, heart/lung conditions: minimise outdoor exertion."
        case .high:
            "Reduce outdoor exertion. Sensitive groups: avoid it. Close windows."
        case .veryHigh:
            "Avoid outdoor activity. Stay indoors, windows shut, use an air purifier."
        }
    }

    /// Lower bound of this band in µg/m³ (for gauges).
    public var lowerBound: Int {
        switch self {
        case .normal: 0
        case .elevated: 56
        case .high: 151
        case .veryHigh: 251
        }
    }

    private var order: Int { Band.allCases.firstIndex(of: self) ?? 0 }
    public static func < (lhs: Band, rhs: Band) -> Bool { lhs.order < rhs.order }
}

/// PSI descriptor (SPEC §3).
public enum PsiLabel: String, Codable, Sendable, CaseIterable {
    case good = "Good"
    case moderate = "Moderate"
    case unhealthy = "Unhealthy"
    case veryUnhealthy = "Very Unhealthy"
    case hazardous = "Hazardous"
}

public enum TrendDirection: String, Codable, Sendable {
    case up, down, steady

    /// Arrow glyph used on every compact surface (SPEC §4/§6).
    public var arrow: String {
        switch self {
        case .up: "▲"
        case .down: "▼"
        case .steady: "▶"
        }
    }

    /// SF Symbol equivalent.
    public var symbolName: String {
        switch self {
        case .up: "arrow.up"
        case .down: "arrow.down"
        case .steady: "arrow.right"
        }
    }
}

public enum LocationMode: String, Codable, Sendable {
    case gps, region, island
}

// MARK: - Snapshot (SPEC §7)

public struct Trend: Codable, Sendable, Hashable {
    public var delta: Int
    public var direction: TrendDirection

    public init(delta: Int, direction: TrendDirection) {
        self.delta = delta
        self.direction = direction
    }

    public init(delta: Int) {
        self.delta = delta
        self.direction = HazeCompute.trendDirection(delta: delta)
    }
}

public struct HistoryPoint: Codable, Sendable, Hashable, Identifiable {
    public var time: Date
    public var pm25: Int
    /// Official 24-hr PSI for that hour at the same spot (optional extension, shared with TS).
    public var psi24h: Int?
    /// NEA's 24-hr average PM2.5 (µg/m³, `pm25_twenty_four_hourly`) for that hour at the same spot — the chart line.
    public var pm25Avg24h: Int?
    public var id: Date { time }

    public init(time: Date, pm25: Int, psi24h: Int? = nil, pm25Avg24h: Int? = nil) {
        self.time = time
        self.pm25 = pm25
        self.psi24h = psi24h
        self.pm25Avg24h = pm25Avg24h
    }

    enum CodingKeys: String, CodingKey { case time, pm25, psi24h, pm25Avg24h }
    public func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: CodingKeys.self)
        try c.encode(time, forKey: .time)
        try c.encode(pm25, forKey: .pm25)
        try c.encode(psi24h, forKey: .psi24h)
        try c.encode(pm25Avg24h, forKey: .pm25Avg24h)
    }
}

public struct RegionReading: Codable, Sendable, Hashable {
    public var pm25: Int?
    public var psi24h: Int?
    public var lat: Double
    public var lon: Double

    public init(pm25: Int?, psi24h: Int?, lat: Double, lon: Double) {
        self.pm25 = pm25
        self.psi24h = psi24h
        self.lat = lat
        self.lon = lon
    }

    // Encode nil as JSON null (SPEC: `number|null`), not an omitted key.
    enum CodingKeys: String, CodingKey { case pm25, psi24h, lat, lon }
    public func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: CodingKeys.self)
        try c.encode(pm25, forKey: .pm25)
        try c.encode(psi24h, forKey: .psi24h)
        try c.encode(lat, forKey: .lat)
        try c.encode(lon, forKey: .lon)
    }
}

public struct Snapshot: Codable, Sendable, Hashable {
    public var pm25: Int
    public var band: Band
    public var instantPsi: Int
    public var instantPsiLabel: PsiLabel
    public var officialPsi24h: Int?
    public var trend: Trend
    public var history: [HistoryPoint]
    public var regions: [String: RegionReading]
    public var nearestRegion: String
    public var locationMode: LocationMode
    public var observedAt: Date
    public var publishedAt: Date
    public var stale: Bool
    public var source: String

    public static let sourceAttribution = "NEA via data.gov.sg"

    public init(
        pm25: Int, band: Band, instantPsi: Int, instantPsiLabel: PsiLabel, officialPsi24h: Int?,
        trend: Trend, history: [HistoryPoint], regions: [String: RegionReading], nearestRegion: String,
        locationMode: LocationMode, observedAt: Date, publishedAt: Date, stale: Bool,
        source: String = Snapshot.sourceAttribution
    ) {
        self.pm25 = pm25
        self.band = band
        self.instantPsi = instantPsi
        self.instantPsiLabel = instantPsiLabel
        self.officialPsi24h = officialPsi24h
        self.trend = trend
        self.history = history
        self.regions = regions
        self.nearestRegion = nearestRegion
        self.locationMode = locationMode
        self.observedAt = observedAt
        self.publishedAt = publishedAt
        self.stale = stale
        self.source = source
    }

    enum CodingKeys: String, CodingKey {
        case pm25, band, instantPsi, instantPsiLabel, officialPsi24h, trend, history, regions
        case nearestRegion, locationMode, observedAt, publishedAt, stale, source
    }

    public func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: CodingKeys.self)
        try c.encode(pm25, forKey: .pm25)
        try c.encode(band, forKey: .band)
        try c.encode(instantPsi, forKey: .instantPsi)
        try c.encode(instantPsiLabel, forKey: .instantPsiLabel)
        try c.encode(officialPsi24h, forKey: .officialPsi24h) // null when unknown
        try c.encode(trend, forKey: .trend)
        try c.encode(history, forKey: .history)
        try c.encode(regions, forKey: .regions)
        try c.encode(nearestRegion, forKey: .nearestRegion)
        try c.encode(locationMode, forKey: .locationMode)
        try c.encode(observedAt, forKey: .observedAt)
        try c.encode(publishedAt, forKey: .publishedAt)
        try c.encode(stale, forKey: .stale)
        try c.encode(source, forKey: .source)
    }

    // MARK: Conveniences (not part of the JSON contract)

    public var advice: String { band.advice }

    /// Compact form for menu bar / lock screen / complication: `● 105 ▲` (SPEC §6).
    public var compactText: String { "● \(pm25) \(trend.direction.arrow)" }

    /// Same, without the dot (for surfaces that draw a tinted dot themselves).
    public var compactValueText: String { "\(pm25) \(trend.direction.arrow)" }

    /// The macOS menu bar text after the tinted dot: `105 ▲`, or `105 ▲ · MOCK` in QA mock mode so mock data is never
    /// mistakable for real data. One string on purpose: `MenuBarExtra` labels show an image plus the first `Text`
    /// only, so a separate "· MOCK" view is dropped from the real menu bar.
    public func menuBarText(mock: Bool) -> String { compactValueText + (mock ? " · MOCK" : "") }

    /// "Measured 4pm · posted by NEA 4:01pm" (COPY §6 detail line)
    public var asOfText: String {
        "Measured \(HazeFormat.hour(observedAt)) · posted by NEA \(HazeFormat.time(publishedAt))"
    }

    /// Short place label: "Central", "Near West" (gps), "Island avg".
    public var placeText: String {
        switch locationMode {
        case .gps: "Near \(HazeFormat.regionName(nearestRegion))"
        case .region: HazeFormat.regionName(nearestRegion)
        case .island: "Island avg"
        }
    }

    /// Phrase for sentences: "in the West", "in Central", "near you", "across Singapore".
    public var placePhrase: String {
        switch locationMode {
        case .gps: "near you"
        case .island: "across Singapore"
        case .region: nearestRegion == "central" ? "in Central" : "in the \(HazeFormat.regionName(nearestRegion))"
        }
    }

    /// Regions in canonical display order.
    /// The region card that is the user's (COPY §14): the nearest station for GPS, the chosen station otherwise —
    /// including a chosen station that is offline, whose reading falls back to the island average. nil for the
    /// island view.
    public var markedRegion: String? {
        guard !nearestRegion.isEmpty, let r = regions[nearestRegion] else { return nil }
        if locationMode == .island { return r.pm25 == nil ? nearestRegion : nil }
        return nearestRegion
    }

    /// COPY §14 "Your row gets: (nearest) or (your area)".
    public var markedRegionLabel: String { locationMode == .gps ? "(nearest)" : "(your area)" }

    public var orderedRegions: [(name: String, reading: RegionReading)] {
        HazeRegions.displayOrder(regions.keys).compactMap { name in
            regions[name].map { (name, $0) }
        }
    }

    // MARK: JSON with SGT ISO-8601 timestamps

    public static func jsonEncoder(pretty: Bool = false) -> JSONEncoder {
        let e = JSONEncoder()
        e.dateEncodingStrategy = .custom { date, encoder in
            var c = encoder.singleValueContainer()
            try c.encode(HazeFormat.iso8601(date))
        }
        e.outputFormatting = pretty ? [.prettyPrinted, .sortedKeys] : [.sortedKeys]
        return e
    }

    public static func jsonDecoder() -> JSONDecoder {
        let d = JSONDecoder()
        d.dateDecodingStrategy = .custom { decoder in
            let c = try decoder.singleValueContainer()
            let s = try c.decode(String.self)
            guard let date = HazeFormat.parseISO8601(s) else {
                throw DecodingError.dataCorruptedError(in: c, debugDescription: "Bad ISO-8601 date: \(s)")
            }
            return date
        }
        return d
    }
}

// MARK: - Sample data (previews, widget placeholders, tests)

extension Snapshot {
    /// The SPEC's live example (2026-09-28 16:00 SGT, region = central).
    public static let sample: Snapshot = {
        let observed = HazeFormat.parseISO8601("2026-09-28T16:00:00+08:00")!
        let published = HazeFormat.parseISO8601("2026-09-28T16:30:40+08:00")!
        let values = [18, 20, 22, 26, 31, 38, 44, 51, 62, 84, 80, 105]
        let history = values.enumerated().map { i, v in
            HistoryPoint(time: observed.addingTimeInterval(Double(i - values.count + 1) * 3600), pm25: v)
        }
        return Snapshot(
            pm25: 105, band: .elevated, instantPsi: 153, instantPsiLabel: .unhealthy, officialPsi24h: 81,
            trend: Trend(delta: 25), history: history,
            regions: [
                "north": RegionReading(pm25: 49, psi24h: 64, lat: 1.41803, lon: 103.82),
                "south": RegionReading(pm25: 105, psi24h: 84, lat: 1.29587, lon: 103.82),
                "east": RegionReading(pm25: 83, psi24h: 73, lat: 1.35735, lon: 103.94),
                "west": RegionReading(pm25: 117, psi24h: 81, lat: 1.35735, lon: 103.70),
                "central": RegionReading(pm25: 105, psi24h: 81, lat: 1.35735, lon: 103.82),
            ],
            nearestRegion: "central", locationMode: .region,
            observedAt: observed, publishedAt: published, stale: false
        )
    }()
}
