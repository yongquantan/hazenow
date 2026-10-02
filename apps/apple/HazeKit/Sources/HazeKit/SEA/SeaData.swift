import Foundation

// The reference tables, loaded from `Resources/Data/sea-data.json`, which scripts/export-sea.ts generates from
// packages/core/src/countries (scales.ts, registry.ts, places.ts, borders-data.ts, verdicts.ts). The data is 1:1 with
// the TS by construction; the logic that reads it is ported in the other SEA/*.swift files.

public struct ScaleBand: Codable, Sendable, Hashable {
    public struct Advice: Codable, Sendable, Hashable { public var general: String; public var sensitive: String? }
    public var key: String
    public var labelEn: String
    public var labelLocal: String
    public var color: String
    public var shape: ChipShape
    /// nil = this category carries no HazeNow level (official-row-only scales).
    public var level: Int?
    /// Inclusive concentration range, µg/m³ (the upper bound may be +∞).
    public var pm25: [Double]?
    /// Inclusive index range.
    public var index: [Double]?
    public var advice: Advice?

    enum CodingKeys: String, CodingKey { case key, labelEn, labelLocal, color, shape, level, pm25, index, advice }
    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        key = try c.decode(String.self, forKey: .key)
        labelEn = try c.decode(String.self, forKey: .labelEn)
        labelLocal = try c.decode(String.self, forKey: .labelLocal)
        color = try c.decode(String.self, forKey: .color)
        shape = try c.decode(ChipShape.self, forKey: .shape)
        level = try c.decodeIfPresent(Int.self, forKey: .level)
        // JSON has no Infinity: the exporter writes null for the open upper bound.
        pm25 = try c.decodeIfPresent([Double?].self, forKey: .pm25)?.map { $0 ?? .infinity }
        index = try c.decodeIfPresent([Double?].self, forKey: .index)?.map { $0 ?? .infinity }
        advice = try c.decodeIfPresent(Advice.self, forKey: .advice)
    }
}

public struct BandScale: Codable, Sendable, Hashable {
    public var id: String
    public var country: String
    public var agency: String
    public var indexName: String?
    public var lang: String
    /// "chip" | "official_only" | "reference"
    public var role: String
    /// "pm25_1h" | "official_index"
    public var basis: String
    public var pm25Averaging: String?
    public var precision: Int
    public var bands: [ScaleBand]
}

public struct CountryInfo: Codable, Sendable, Hashable {
    public struct Place: Codable, Sendable, Hashable { public var name: String; public var lat: Double; public var lon: Double }
    public var code: CountryCode
    public var name: String
    public var utcOffset: Double
    public var languages: [String]
    public var status: CoverageStatus
    public var adapters: [String]
    public var chipScale: String?
    public var defaultPlace: Place
    public var nowNumber: String
}

public struct CityPlace: Codable, Sendable, Hashable, Identifiable {
    public var country: CountryCode
    /// URL slug: ?country=th&area=bangkok
    public var id: String
    public var name: String
    public var lat: Double
    public var lon: Double
    public var status: CoverageStatus
    public var reason: String?
    public var popular: Bool?
    public var aliases: [String]?
    public var region: String?
    public var crowdOnly: Bool?
    public var fix: String?
    public var note: String?
    /// From DESTINATIONS (not the major-city list).
    public var destination: Bool?

    public var isPopular: Bool { popular == true }
    public var key: String { "\(country.rawValue):\(id)" }
}

struct ThaiCell: Codable, Sendable, Hashable { var en: String; var short: String; var th: String; var shortTh: String; var strict: Int }
struct CategoryCell: Codable, Sendable, Hashable { var en: String; var short: String; var sev: Int }
struct Severity2: Codable, Sendable, Hashable { var general: Int; var sensitive: Int }
public struct WhoVerdictBand: Codable, Sendable, Hashable {
    public var max: Double
    public var key: String
    public var word: String
    public var en: String
    public var short: String
    public var sev: Int
    public var level: Int
    enum CodingKeys: String, CodingKey { case max, key, word, en, short, sev, level }
    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        max = try c.decodeIfPresent(Double.self, forKey: .max) ?? .infinity
        key = try c.decode(String.self, forKey: .key)
        word = try c.decode(String.self, forKey: .word)
        en = try c.decode(String.self, forKey: .en)
        short = try c.decode(String.self, forKey: .short)
        sev = try c.decode(Int.self, forKey: .sev)
        level = try c.decode(Int.self, forKey: .level)
    }
}

struct SeaTables: Decodable, Sendable {
    var scales: [String: BandScale]
    var chipScale: [String: String?]
    var countries: [String: CountryInfo]
    var pickerCountries: [CountryCode]
    var places: [CityPlace]
    var borders: [String: [[Double]]]
    var smallIslands: [[SmallIslandField]]
    var thaiVerdicts: [String: [String: ThaiCell]]
    var categoryVerdicts: [String: [String: [String: CategoryCell]]]
    var categorySeverity: [String: [String: Severity2]]
    var unhealthyFrom: [String: String]
    var whoVerdictBands: [WhoVerdictBand]
    var emergencyNumber: [String: String]

    enum SmallIslandField: Decodable, Sendable {
        case s(String), n(Double)
        init(from decoder: Decoder) throws {
            let c = try decoder.singleValueContainer()
            if let d = try? c.decode(Double.self) { self = .n(d) } else { self = .s(try c.decode(String.self)) }
        }
        var string: String { if case let .s(x) = self { x } else { "" } }
        var number: Double { if case let .n(x) = self { x } else { 0 } }
    }

    static let shared: SeaTables = {
        guard let url = Bundle.module.url(forResource: "sea-data", withExtension: "json", subdirectory: "Data"),
              let data = try? Data(contentsOf: url) else { fatalError("HazeKit: sea-data.json missing from the bundle") }
        do { return try JSONDecoder().decode(SeaTables.self, from: data) } catch {
            fatalError("HazeKit: sea-data.json unreadable: \(error)")
        }
    }()
}

// MARK: - Scales (port of countries/scales.ts)

public enum SeaScales {
    public static var all: [String: BandScale] { SeaTables.shared.scales }
    public static let who24hGuideline = 15.0

    /// Chip scale per jurisdiction. nil = no national scale: number + WHO line, no band.
    public static func chipScale(_ cc: CountryCode) -> String? { SeaTables.shared.chipScale[cc.rawValue] ?? nil }

    public static func scale(_ id: String) -> BandScale? { SeaTables.shared.scales[id] }

    private static func roundTo(_ x: Double, _ dp: Int) -> Double {
        if dp == 0 { return (x + 0.5).rounded(.down) }
        let f = pow(10, Double(dp))
        return ((x * f) + 0.5).rounded(.down) / f
    }

    /// Category of a concentration, rounded to the authority's precision first.
    public static func classifyPm25(_ scaleId: String, _ pm25: Double) -> ScaleBand? {
        guard let s = scale(scaleId), pm25.isFinite else { return nil }
        let with = s.bands.filter { $0.pm25 != nil }
        guard !with.isEmpty else { return nil }
        let v = roundTo(max(0, pm25), s.precision)
        return with.first { v <= $0.pm25![1] } ?? with.last
    }

    /// Category of a published index value.
    public static func classifyIndex(_ scaleId: String, _ value: Double) -> ScaleBand? {
        guard let s = scale(scaleId), value.isFinite else { return nil }
        let with = s.bands.filter { $0.index != nil }
        guard !with.isEmpty else { return nil }
        let v = (max(0, value) + 0.5).rounded(.down)
        return with.first { v <= $0.index![1] } ?? with.last
    }

    public static func toLocalBand(_ scaleId: String, _ b: ScaleBand) -> LocalBand? {
        guard let level = b.level, let s = scale(scaleId) else { return nil }
        return LocalBand(scaleId: scaleId, key: b.key, labelEn: b.labelEn, labelLocal: b.labelLocal, lang: s.lang,
                         color: b.color, shape: b.shape, level: level, agency: s.agency)
    }

    /// Shared SPEC band for an advice level (drives COPY.md verdicts/actions).
    public static func levelBand(_ level: Int?) -> Band? {
        switch level {
        case 0?: .normal
        case 1?: .elevated
        case 2?: .high
        case 3?: .veryHigh
        default: nil
        }
    }

    /// pm25 / 15 (WHO 2021 24-h AQG), 1 dp.
    public static func whoMultiple(_ pm25: Int?) -> Double? {
        guard let pm25 else { return nil }
        return jsRound(Double(pm25) / who24hGuideline * 10) / 10
    }

    /// Malaysia: invert a PM2.5-driven DOE API to the 24-h PM2.5 average it came from.
    public static func myApiToPm25(_ api: Double) -> Double? {
        let table: [(Double, Double, Double, Double)] = [
            (0, 50, 0, 12.0), (51, 100, 12.1, 50.4), (101, 150, 50.5, 55.4), (151, 200, 55.5, 150.4),
            (201, 300, 150.5, 250.4), (301, 400, 250.5, 350.4), (401, 500, 350.5, 500.4),
        ]
        guard api.isFinite, api >= 0 else { return nil }
        for (ilo, ihi, clo, chi) in table where api <= ihi {
            let c = clo + ((max(api, ilo) - ilo) * (chi - clo)) / (ihi - ilo)
            return jsRound(c * 10) / 10
        }
        return nil
    }
}

// MARK: - Registry (port of countries/registry.ts)

public enum SeaRegistry {
    public static func info(_ cc: CountryCode) -> CountryInfo { SeaTables.shared.countries[cc.rawValue]! }
    public static func name(_ cc: CountryCode) -> String { info(cc).name }
}

/// Great-circle distance, km (same formula as packages/core/src/math.ts).
public func seaHaversineKm(_ a: LatLon, _ b: LatLon) -> Double {
    let toRad = Double.pi / 180
    let dLat = (b.lat - a.lat) * toRad
    let dLon = (b.lon - a.lon) * toRad
    let h = pow(sin(dLat / 2), 2) + cos(a.lat * toRad) * cos(b.lat * toRad) * pow(sin(dLon / 2), 2)
    return 2 * 6371.0088 * asin(min(1, sqrt(h)))
}
