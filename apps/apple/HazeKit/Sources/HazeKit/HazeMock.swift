import Foundation

/// Deterministic QA scenarios (bundled copies of packages/core/fixtures/scenarios/*.json, raw NEA shape).
///
/// Activate with the launch argument `-HazeMock <scenario>` (read through the UserDefaults argument domain,
/// so `xcrun simctl launch booted sg.hazenow.ios -HazeMock high` works). The app copies it into the shared
/// App Group defaults so widgets render the same scenario. `-HazeMock off` clears it.
public enum HazeMock {
    public static let argumentKey = "HazeMock"
    public static let scenarios = ["normal", "elevated", "high", "very_high", "south_offline",
                                   "all_offline_stale", "rising_fast", "network_error"]

    public struct Loaded: Sendable {
        public var data: HazeData
        /// The scenario's fixed clock ("now"), so staleness/ages are deterministic.
        public var now: Date
    }

    private struct Meta: Decodable {
        let scenario: String
        let now: String
        let simulate: String?
    }

    /// The scenario named on the command line (`-HazeMock x`), if any. "off"/"none" → "" (clear).
    public static var launchArgument: String? {
        guard let v = UserDefaults.standard.string(forKey: argumentKey) else { return nil }
        let name = v.lowercased()
        return ["off", "none", ""].contains(name) ? "" : name
    }

    public static func url(for scenario: String) -> URL? {
        Bundle.module.url(forResource: scenario, withExtension: "json", subdirectory: "Scenarios")
    }

    /// Load a scenario. `network_error` throws `HazeClientError.offline` like a real failed fetch.
    public static func load(_ scenario: String) throws -> Loaded {
        guard let url = url(for: scenario) else { throw HazeClientError.api("Unknown mock scenario \(scenario)") }
        let raw = try Data(contentsOf: url)
        guard let obj = try JSONSerialization.jsonObject(with: raw) as? [String: Any] else { throw HazeClientError.noData }
        let metaData = try JSONSerialization.data(withJSONObject: obj["_meta"] ?? [:])
        let meta = try JSONDecoder().decode(Meta.self, from: metaData)
        let now = HazeFormat.parseISO8601(meta.now) ?? Date()
        if meta.simulate == "network_error" { throw HazeClientError.offline }
        func part(_ key: String) -> Data? {
            obj[key].flatMap { try? JSONSerialization.data(withJSONObject: $0) }
        }
        let data = try HazeParser.build(
            pm25V1: [], pm25V2: [part("pm25"), part("pm25Yesterday")].compactMap { $0 },
            psiV1: [], psiV2: [part("psi"), part("psiYesterday")].compactMap { $0 }
        )
        return Loaded(data: data, now: now)
    }
}

/// Loads either the active mock scenario or live data — the one entry point apps and widgets use.
public enum HazeSource {
    public struct Loaded: Sendable {
        public var data: HazeData
        /// Clock to compute with (the scenario's fixed "now" in mock mode).
        public var now: Date
        public var mockScenario: String?
    }

    public static func load(settings: HazeSettings = .shared, client: HazeClient, includeV2: Bool = true,
                            now: Date = Date()) async throws -> Loaded {
        if let scenario = settings.mockScenario {
            let m = try HazeMock.load(scenario)
            return Loaded(data: m.data, now: m.now, mockScenario: scenario)
        }
        return Loaded(data: try await client.fetch(now: now, includeV2: includeV2), now: now, mockScenario: nil)
    }
}
