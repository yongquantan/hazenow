import Foundation
#if canImport(FoundationNetworking)
import FoundationNetworking
#endif

// MARK: - Raw data.gov.sg response shapes (v1 snake_case and v2 camelCase)

/// A JSON number that may be missing, null, a string, or garbage. Anything unusable → nil.
struct LenientNumber: Decodable, Sendable {
    let value: Double?
    init(from decoder: Decoder) throws {
        let c = try decoder.singleValueContainer()
        if c.decodeNil() { value = nil }
        else if let d = try? c.decode(Double.self) { value = d }
        else if let s = try? c.decode(String.self), let d = Double(s) { value = d }
        else { value = nil }
    }
}

struct APIRegionMeta: Decodable {
    struct LabelLocation: Decodable { let latitude: Double?; let longitude: Double? }
    let name: String
    let labelLocation: LabelLocation?

    enum CodingKeys: String, CodingKey { case name, labelLocation, label_location }
    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        name = try c.decode(String.self, forKey: .name)
        labelLocation = try c.decodeIfPresent(LabelLocation.self, forKey: .labelLocation)
            ?? c.decodeIfPresent(LabelLocation.self, forKey: .label_location)
    }
}

struct APIItem: Decodable {
    let timestamp: String
    let published: String?
    let readings: [String: [String: LenientNumber]]

    enum CodingKeys: String, CodingKey { case timestamp, updatedTimestamp, update_timestamp, readings }
    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        timestamp = try c.decode(String.self, forKey: .timestamp)
        // v1's update_timestamp is the stable first-publish stamp; v2's updatedTimestamp is "last revised".
        published = try c.decodeIfPresent(String.self, forKey: .update_timestamp)
            ?? c.decodeIfPresent(String.self, forKey: .updatedTimestamp)
        readings = (try? c.decode([String: [String: LenientNumber]].self, forKey: .readings)) ?? [:]
    }
}

/// Both shapes: v2 `{code, data: {regionMetadata, items}, errorMsg}`; v1 `{region_metadata, items, api_info}`.
struct APIResponse: Decodable {
    let code: Int?
    let errorMsg: String?
    let regionMetadata: [APIRegionMeta]
    let items: [APIItem]

    struct V2Data: Decodable {
        let regionMetadata: [APIRegionMeta]?
        let items: [APIItem]?
    }

    enum CodingKeys: String, CodingKey { case code, errorMsg, data, region_metadata, items }
    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        code = try? c.decodeIfPresent(Int.self, forKey: .code)
        errorMsg = try? c.decodeIfPresent(String.self, forKey: .errorMsg)
        if let data = try? c.decodeIfPresent(V2Data.self, forKey: .data) {
            regionMetadata = data.regionMetadata ?? []
            items = data.items ?? []
        } else {
            regionMetadata = (try? c.decodeIfPresent([APIRegionMeta].self, forKey: .region_metadata)) ?? []
            items = (try? c.decodeIfPresent([APIItem].self, forKey: .items)) ?? []
        }
    }
}

public enum HazeClientError: Error, LocalizedError, Sendable, Equatable {
    case badStatus(Int)
    /// HTTP 429 (v2 `{"code":24}`), with the server's Retry-After if given.
    case rateLimited(retryAfter: TimeInterval?)
    case offline
    case api(String)
    case noData

    public var errorDescription: String? {
        switch self {
        case let .badStatus(code): "data.gov.sg returned HTTP \(code)"
        case .rateLimited: "data.gov.sg is busy (rate limited)"
        case .offline: "You're offline"
        case let .api(msg): "data.gov.sg error: \(msg)"
        case .noData: "No PM2.5 readings available right now"
        }
    }

    public var retryAfter: TimeInterval? {
        if case let .rateLimited(r) = self { return r }
        return nil
    }
}

public enum ReadingKey {
    public static let pm25 = "pm25_one_hourly"
    public static let psi24h = "psi_twenty_four_hourly"
    public static let pm25Avg24h = "pm25_twenty_four_hourly"
}

/// Parsing is separate from networking so it can be unit-tested against fixtures.
public enum HazeParser {
    public struct Page: Sendable {
        public var regions: [RegionPoint]
        public var hours: [HourlyReading]
    }

    /// Parse a v1 or v2 response and extract hourly readings for one reading key.
    public static func parse(_ data: Data, key: String) throws -> Page {
        let r = try JSONDecoder().decode(APIResponse.self, from: data)
        if let code = r.code, code != 0 {
            if code == 24 { throw HazeClientError.rateLimited(retryAfter: nil) }
            throw HazeClientError.api(r.errorMsg ?? "code \(code)")
        }
        let regions = r.regionMetadata.compactMap { meta -> RegionPoint? in
            guard let lat = meta.labelLocation?.latitude, let lon = meta.labelLocation?.longitude,
                  lat.isFinite, lon.isFinite, !(lat == 0 && lon == 0) else { return nil }
            return RegionPoint(name: meta.name.lowercased(), lat: lat, lon: lon)
        }
        let hours = r.items.compactMap { item -> HourlyReading? in
            guard let time = HazeFormat.parseISO8601(item.timestamp), let raw = item.readings[key] else { return nil }
            let published = item.published.flatMap(HazeFormat.parseISO8601) ?? time
            var values: [String: Double?] = [:]
            for (k, v) in raw { values[k.lowercased()] = v.value }
            return HourlyReading(time: time, published: published, rawValues: values)
        }
        return Page(regions: regions, hours: hours)
    }

    public static func parsePM25(_ data: Data) throws -> Page { try parse(data, key: ReadingKey.pm25) }

    /// Build HazeData from raw v1/v2 responses (any may be nil). pm25/psi lists are merged with the v1.3 rule.
    public static func build(pm25V1: [Data], pm25V2: [Data], psiV1: [Data], psiV2: [Data]) throws -> HazeData {
        var regions: [RegionPoint] = []
        func hours(_ list: [Data], _ key: String) -> [HourlyReading] {
            list.flatMap { d -> [HourlyReading] in
                guard let page = try? parse(d, key: key) else { return [] }
                if regions.isEmpty { regions = page.regions }
                return page.hours
            }
        }
        let pm25 = HazeData.mergeSources(v1: hours(pm25V1, ReadingKey.pm25), v2: hours(pm25V2, ReadingKey.pm25))
        guard pm25.contains(where: \.hasAnyValid) || !pm25.isEmpty else { throw HazeClientError.noData }
        let psi = HazeData.mergeSources(v1: hours(psiV1, ReadingKey.psi24h), v2: hours(psiV2, ReadingKey.psi24h))
        let avg = HazeData.mergeSources(v1: hours(psiV1, ReadingKey.pm25Avg24h), v2: hours(psiV2, ReadingKey.pm25Avg24h))
        return HazeData(readings: pm25, psiHistory: psi, avg24History: avg, regions: regions)
    }
}

// MARK: - Client

/// Async client for data.gov.sg (public, no key). v1 is the fresh primary; v2 back-fills (rate-limited).
public final class HazeClient: @unchecked Sendable {
    public static let v1Base = URL(string: "https://api.data.gov.sg/v1/environment")!
    public static let v2Base = URL(string: "https://api-open.data.gov.sg/v2/real-time/api")!

    public let session: URLSession
    private let lock = NSLock()
    /// Yesterday's responses barely change: cache them for an hour.
    private var cache: [URL: (at: Date, data: Data)] = [:]

    public init(session: URLSession = .shared) {
        self.session = session
    }

    private func get(_ base: URL, _ path: String, date: String? = nil, cacheFor ttl: TimeInterval = 0) async throws -> Data {
        var comps = URLComponents(url: base.appendingPathComponent(path), resolvingAgainstBaseURL: false)!
        if let date { comps.queryItems = [URLQueryItem(name: "date", value: date)] }
        let url = comps.url!
        if ttl > 0, let hit = lock.withLock({ cache[url] }), Date().timeIntervalSince(hit.at) < ttl { return hit.data }

        var req = URLRequest(url: url)
        req.timeoutInterval = 20
        req.cachePolicy = .reloadIgnoringLocalCacheData
        req.setValue("application/json", forHTTPHeaderField: "Accept")
        let data: Data, response: URLResponse
        do {
            (data, response) = try await session.data(for: req)
        } catch let e as URLError where [.notConnectedToInternet, .networkConnectionLost, .dataNotAllowed].contains(e.code) {
            throw HazeClientError.offline
        }
        if let http = response as? HTTPURLResponse, !(200..<300).contains(http.statusCode) {
            if http.statusCode == 429 {
                let ra = (http.value(forHTTPHeaderField: "Retry-After")).flatMap(TimeInterval.init)
                throw HazeClientError.rateLimited(retryAfter: ra)
            }
            throw HazeClientError.badStatus(http.statusCode)
        }
        if ttl > 0 { lock.withLock { cache[url] = (Date(), data) } }
        return data
    }

    /// Fetch today + yesterday (history and the chart line) from v1, plus v2 for back-fills when `includeV2`.
    /// v1 failures fall back to v2. Throws only if no PM2.5 data at all could be read.
    public func fetch(now: Date = Date(), includeV2: Bool = true) async throws -> HazeData {
        let today = HazeFormat.sgtDay(now)
        let yesterday = HazeFormat.sgtDay(now.addingTimeInterval(-86_400))
        let v1 = Self.v1Base, v2 = Self.v2Base

        async let pmToday = result { try await self.get(v1, "pm25", date: today) }
        async let pmYday = result { try await self.get(v1, "pm25", date: yesterday, cacheFor: 3600) }
        async let psiToday = result { try await self.get(v1, "psi", date: today) }
        async let psiYday = result { try await self.get(v1, "psi", date: yesterday, cacheFor: 3600) }
        let v1Results = await (pmToday, pmYday, psiToday, psiYday)

        var pmV2: [Data] = [], psiV2: [Data] = []
        var firstError: Error? = [v1Results.0, v1Results.1].compactMap(\.failure).first
        let v1PmFailed = v1Results.0.success == nil
        if includeV2 || v1PmFailed {
            // v2 rate-limits after ~4 rapid calls: at most two here, sequentially.
            switch await result({ try await self.get(v2, "pm25", date: today) }) {
            case let .success(d): pmV2.append(d)
            case let .failure(e): firstError = firstError ?? e
            }
            if includeV2 || v1Results.2.success == nil,
               case let .success(d) = await result({ try await self.get(v2, "psi", date: today) }) {
                psiV2.append(d)
            }
        }
        let pmV1 = [v1Results.0.success, v1Results.1.success].compactMap { $0 }
        let psiV1 = [v1Results.2.success, v1Results.3.success].compactMap { $0 }
        guard let data = try? HazeParser.build(pm25V1: pmV1, pm25V2: pmV2, psiV1: psiV1, psiV2: psiV2),
              data.readings.contains(where: \.hasAnyValid) else {
            if pmV1.isEmpty && pmV2.isEmpty, let firstError {
                throw (firstError as? HazeClientError) ?? .offline
            }
            throw HazeClientError.noData
        }
        return data
    }

    /// Convenience: fetch and compute in one go.
    public func snapshot(location: LocationInput = .default, now: Date = Date()) async throws -> Snapshot {
        let data = try await fetch(now: now)
        guard let snap = HazeCompute.snapshot(data: data, location: location, now: now) else {
            throw HazeClientError.noData
        }
        return snap
    }
}

private func result<T: Sendable>(_ body: @Sendable () async throws -> T) async -> Result<T, Error> {
    do { return .success(try await body()) } catch { return .failure(error) }
}

extension Result {
    var success: Success? { if case let .success(s) = self { s } else { nil } }
    var failure: Failure? { if case let .failure(f) = self { f } else { nil } }
}
