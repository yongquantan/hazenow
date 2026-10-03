import Foundation

// SPEC v2.0 (Southeast Asia) data model, a port of packages/core/src/countries/types.ts. Additive: nothing here
// changes the SG v1 `Snapshot`. Field names follow the TS (and the proxy's JSON) exactly, so an `ObservationSet`
// from `GET {edge}/v1/{cc}/observations` decodes as-is and the snapshot is built on the device.
//
// Timestamps stay ISO 8601 strings with the station's own offset (as in TS): the clock time shown is the
// station's local time (SPEC v2.0 §3.4), which a `Date` would lose.

// Not `Identifiable`: the case `ID` (Indonesia) collides with the protocol's `ID` associated type, which
// Release (whole-module) builds reject. Lists use `id: \.self`.
public enum CountryCode: String, Codable, Sendable, CaseIterable, Hashable {
    case SG, MY, ID, TH, VN, PH, LA, KH, MM, BN, TL
    public var id: String { rawValue }
}

public enum CoverageStatus: String, Codable, Sendable {
    case liveDirect = "live_direct"
    case needsProxy = "needs_proxy"
    case needsPermission = "needs_permission"
    case notFeasible = "not_feasible"
}

public struct Attribution: Codable, Sendable, Hashable {
    public var id: String
    /// Text clients must render, e.g. "Data: PCD Air4Thai (Thailand)".
    public var text: String
    public var url: String
    public var licence: String
    public var shareAlike: Bool?
}

/// An authority's own index, verbatim. Never computed by HazeNow.
public struct OfficialIndex: Codable, Sendable, Hashable {
    public var scaleId: String
    public var name: String
    public var value: Double
    public var category: String?
    /// "24h" | "1h" | "nowcast"
    public var averaging: String
    public var param: String?
    public var agency: String
}

public struct ObservationHour: Codable, Sendable, Hashable {
    public var time: String
    public var pm25: Double?
    public var pm25Avg24h: Double?
}

/// One station or sensor, normalised (REGIONAL §4.2).
public struct SeaObservation: Codable, Sendable, Hashable {
    public var stationId: String
    public var name: String
    public var country: CountryCode
    public var lat: Double
    public var lon: Double
    /// "reference" | "lowcost"
    public var grade: String
    public var indoor: Bool?
    public var pm25_1h: Double?
    public var pm25_now: Double?
    public var pm25_24h: Double?
    public var official: OfficialIndex?
    public var periodEnd: String
    public var publishedAt: String?
    public var history: [ObservationHour]?
    public var corrected: String?
    public var k: Double?
    public var qc: String?
    public var attributionId: String

    public var isReference: Bool { grade == "reference" }
}

public struct LatLon: Codable, Sendable, Hashable {
    public var lat: Double
    public var lon: Double
    public init(lat: Double, lon: Double) {
        self.lat = lat
        self.lon = lon
    }
}

public struct ObservationSet: Codable, Sendable, Hashable {
    public var country: CountryCode
    public var adapters: [String]
    public var fetchedAt: String
    public var observations: [SeaObservation]
    public var attribution: [Attribution]
    public var hotspots: [LatLon]?
    public var hotspotSource: String?
    public var warnings: [String]?
    /// The country's official source failed or timed out ("PCD Air4Thai"); the set carries what still answered.
    public var officialUnavailable: String?
}

public enum ChipShape: String, Codable, Sendable {
    case circle, half, triangle, octagon
}

public struct LocalBand: Codable, Sendable, Hashable {
    public var scaleId: String
    public var key: String
    public var labelEn: String
    public var labelLocal: String
    public var lang: String
    public var color: String
    public var shape: ChipShape
    public var level: Int
    public var agency: String
}

public struct StationSummary: Codable, Sendable, Hashable {
    public var stationId: String
    public var name: String
    public var distanceKm: Double?
    public var grade: String
    public var pm25_1h: Double?
    public var official: OfficialIndex?
    public var periodEnd: String
}

public struct SeaHistoryPoint: Codable, Sendable, Hashable {
    public var time: String
    public var pm25: Int
    public var pm25Avg24h: Double?
}

public struct HotspotContext: Codable, Sendable, Hashable {
    public var count: Int
    public var radiusKm: Double
    public var hours: Int
    public var confidence: String
    public var source: String
}

/// The v2.0 snapshot: the SPEC §7 fields (pm25/band nullable outside SG) plus the regional fields.
public struct CountrySnapshot: Codable, Sendable, Hashable {
    public var pm25: Int?
    public var band: Band?
    public var trend: Trend
    public var history: [SeaHistoryPoint]
    public var nearestRegion: String
    public var locationMode: LocationMode
    public var observedAt: String
    public var publishedAt: String
    public var stale: Bool
    public var source: String

    public var country: CountryCode
    public var status: CoverageStatus
    public var level: Int?
    public var localBand: LocalBand?
    /// "pm25_1h" | "official_index" | "none"
    public var bandBasis: String
    public var bandFromEstimate: Bool
    public var official: OfficialIndex?
    /// "official_1h" | "crowd_estimate" | nil
    public var pm25Kind: String?
    public var pm25_24h: Double?
    public var nearest: StationSummary?
    public var stations: [StationSummary]
    public var range: [Int]?
    public var whoMultiple: Double?
    public var hotspots: HotspotContext?
    public var attribution: [Attribution]
    public var notes: [String]

    public var isCrowdEstimate: Bool { pm25Kind == "crowd_estimate" }
    public var observedDate: Date? { SeaTime.parse(observedAt).map { Date(timeIntervalSince1970: $0) } }

    /// History as SG `HistoryPoint`s (trend words, chart).
    public var historyPoints: [HistoryPoint] {
        history.compactMap { h in
            SeaTime.parse(h.time).map {
                HistoryPoint(time: Date(timeIntervalSince1970: $0), pm25: h.pm25, psi24h: nil,
                             pm25Avg24h: h.pm25Avg24h.map { Int(($0).rounded()) })
            }
        }
    }
}

public struct CountryQuery: Sendable, Hashable {
    public var lat: Double?
    public var lon: Double?
    public var station: String?
    /// Hard radius (km) for a catalogue destination: nothing farther away is used.
    public var withinKm: Double?
    public init(lat: Double? = nil, lon: Double? = nil, station: String? = nil, withinKm: Double? = nil) {
        self.lat = lat
        self.lon = lon
        self.station = station
        self.withinKm = withinKm
    }
}

// MARK: - Errors

/// The official source failed and nothing else is in range: show the last cached reading, or the calm "can't reach" state.
public struct OfficialUnavailableError: Error, LocalizedError, Sendable, Equatable {
    public var country: CountryCode
    public var source: String
    public var errorDescription: String? { "\(source) isn't responding and no community sensor is in range" }
}

public struct NoCountryDataError: Error, LocalizedError, Sendable, Equatable {
    public var message: String
    public var errorDescription: String? { message }
}

public struct ProxyError: Error, LocalizedError, Sendable, Equatable {
    public var message: String
    public var status: Int?
    public var retryAfter: TimeInterval?
    public var errorDescription: String? { message }
}

// MARK: - Time (fixed-offset zones; no DST anywhere in SEA). Port of countries/time.ts.

public enum SeaTime {
    /// ISO 8601 → seconds since 1970. Accepts "2026-09-28T17:00:00+07:00", "…Z", fractional seconds, and a
    /// missing offset (read as UTC, like `Date.parse` for date-time strings with "Z").
    public static func parse(_ s: String) -> TimeInterval? {
        let u = Array(s.utf8)
        func num(_ a: Int, _ n: Int) -> Int? {
            guard a + n <= u.count else { return nil }
            var v = 0
            for i in a..<(a + n) {
                let c = u[i]
                guard c >= 48, c <= 57 else { return nil }
                v = v * 10 + Int(c - 48)
            }
            return v
        }
        guard let y = num(0, 4), u.count >= 16, u[4] == 45, let mo = num(5, 2), u[7] == 45, let d = num(8, 2),
              u[10] == 84 || u[10] == 32, let h = num(11, 2), u[13] == 58, let mi = num(14, 2) else { return nil }
        var i = 16
        var sec = 0.0
        if i < u.count, u[i] == 58, let ss = num(17, 2) {
            sec = Double(ss)
            i = 19
            if i < u.count, u[i] == 46 {
                i += 1
                var frac = 0.0, scale = 0.1
                while i < u.count, u[i] >= 48, u[i] <= 57 {
                    frac += Double(u[i] - 48) * scale
                    scale /= 10
                    i += 1
                }
                sec += frac
            }
        }
        var offset = 0.0
        if i < u.count {
            if u[i] == 90 { offset = 0 } else if u[i] == 43 || u[i] == 45 {
                guard let oh = num(i + 1, 2) else { return nil }
                let om = (i + 3 < u.count && u[i + 3] == 58) ? num(i + 4, 2) : num(i + 3, 2)
                offset = (u[i] == 45 ? -1 : 1) * (Double(oh) + Double(om ?? 0) / 60)
            } else { return nil }
        }
        // Days from civil (Howard Hinnant).
        let yy = mo <= 2 ? y - 1 : y
        let era = (yy >= 0 ? yy : yy - 399) / 400
        let yoe = yy - era * 400
        let mp = (mo + 9) % 12
        let doy = (153 * mp + 2) / 5 + d - 1
        let doe = yoe * 365 + yoe / 4 - yoe / 100 + doy
        let days = era * 146_097 + doe - 719_468
        return Double(days) * 86400 + Double(h) * 3600 + Double(mi) * 60 + sec - offset * 3600
    }

    private static func pad(_ n: Int) -> String { n < 10 ? "0\(n)" : "\(n)" }

    public static func offsetLabel(_ hours: Double) -> String {
        let a = abs(hours)
        return "\(hours >= 0 ? "+" : "-")\(pad(Int(a.rounded(.down)))):\(pad(Int((a.truncatingRemainder(dividingBy: 1) * 60).rounded())))"
    }

    /// Civil fields of an instant shifted by `offsetHours`.
    public static func fields(_ t: TimeInterval, _ offsetHours: Double) -> (y: Int, mo: Int, d: Int, h: Int, mi: Int, s: Int, weekday: Int) {
        let local = t + offsetHours * 3600
        let days = Int((local / 86400).rounded(.down))
        let rem = Int(local - Double(days) * 86400)
        let z = days + 719_468
        let era = (z >= 0 ? z : z - 146_096) / 146_097
        let doe = z - era * 146_097
        let yoe = (doe - doe / 1460 + doe / 36524 - doe / 146_096) / 365
        let doy = doe - (365 * yoe + yoe / 4 - yoe / 100)
        let mp = (5 * doy + 2) / 153
        let d = doy - (153 * mp + 2) / 5 + 1
        let m = mp < 10 ? mp + 3 : mp - 9
        let y = yoe + era * 400 + (m <= 2 ? 1 : 0)
        let wd = ((days % 7) + 11) % 7 // 1970-01-01 was a Thursday (4)
        return (y, m, d, rem / 3600, (rem % 3600) / 60, rem % 60, wd)
    }

    /// Instant → local ISO with offset, seconds precision ("2026-09-28T17:00:00+07:00").
    public static func toIso(_ t: TimeInterval, offsetHours: Double) -> String {
        let f = fields(t, offsetHours)
        return "\(f.y)-\(pad(f.mo))-\(pad(f.d))T\(pad(f.h)):\(pad(f.mi)):\(pad(f.s))\(offsetLabel(offsetHours))"
    }

    /// JS `Date.toISOString()` ("2026-09-28T10:00:00.000Z").
    public static func toUtcIso(_ t: TimeInterval) -> String {
        let f = fields(t, 0)
        let ms = Int(((t - t.rounded(.down)) * 1000).rounded())
        let msS = ms < 10 ? "00\(ms)" : ms < 100 ? "0\(ms)" : "\(ms)"
        return "\(f.y)-\(pad(f.mo))-\(pad(f.d))T\(pad(f.h)):\(pad(f.mi)):\(pad(f.s)).\(msS)Z"
    }

    /// "2026-09-28 16:00[:00]" (local wall time) + offset → "2026-09-28T16:00:00+07:00".
    public static func wallToIso(_ wall: String, offsetHours: Double) -> String? {
        let w = wall.trimmingCharacters(in: .whitespaces)
        guard let re = try? NSRegularExpression(pattern: #"^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?"#),
              let m = re.firstMatch(in: w, range: NSRange(w.startIndex..., in: w)) else { return nil }
        func g(_ i: Int) -> String? { Range(m.range(at: i), in: w).map { String(w[$0]) } }
        return "\(g(1)!)-\(g(2)!)-\(g(3)!)T\(g(4)!):\(g(5)!):\(g(6) ?? "00")\(offsetLabel(offsetHours))"
    }

    /// Local calendar date "YYYY-MM-DD".
    public static func localDate(_ t: TimeInterval, offsetHours: Double) -> String {
        String(toIso(t, offsetHours: offsetHours).prefix(10))
    }

    /// Offset (hours) written in an ISO timestamp: "+07:00" → 7, "Z" → 0, none → nil.
    public static func offsetHours(_ iso: String) -> Double? {
        guard let re = try? NSRegularExpression(pattern: #"([+-])(\d{2}):(\d{2})$"#),
              let m = re.firstMatch(in: iso, range: NSRange(iso.startIndex..., in: iso)),
              let a = Range(m.range(at: 1), in: iso), let b = Range(m.range(at: 2), in: iso), let c = Range(m.range(at: 3), in: iso)
        else { return iso.hasSuffix("Z") ? 0 : nil }
        return (iso[a] == "-" ? -1 : 1) * (Double(iso[b])! + Double(iso[c])! / 60)
    }

    /// "4pm" / "4:30pm" in the timestamp's own zone.
    public static func formatLocalTime(_ iso: String) -> String {
        guard let r = iso.range(of: #"T(\d{2}):(\d{2})"#, options: .regularExpression) else { return iso }
        let s = iso[r]
        let h24 = Int(s.dropFirst().prefix(2))!, min = Int(s.suffix(2))!
        let h12 = h24 % 12 == 0 ? 12 : h24 % 12
        return "\(h12)\(min != 0 ? ":\(pad(min))" : "")\(h24 < 12 ? "am" : "pm")"
    }

    /// "16:00 น." (Thai style, 24-h clock).
    public static func formatThaiTime(_ iso: String) -> String {
        guard let r = iso.range(of: #"T(\d{2}):(\d{2})"#, options: .regularExpression) else { return iso }
        let s = iso[r]
        return "\(s.dropFirst().prefix(2)):\(s.suffix(2)) น."
    }
}

/// JS-style number text: integers without ".0", others in the shortest form ("46.5").
public func jsNumber(_ x: Double) -> String {
    if x.isFinite, x == x.rounded(), abs(x) < 1e15 { return String(Int(x)) }
    return "\(x)"
}

/// JS `Math.round` (half up, towards +∞).
@inline(__always) func jsRound(_ x: Double) -> Double { (x + 0.5).rounded(.down) }
