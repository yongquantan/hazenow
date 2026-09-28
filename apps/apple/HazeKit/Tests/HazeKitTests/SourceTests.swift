import Foundation
import Testing
@testable import HazeKit

/// SPEC v1.3: v1 (snake_case) parsing, the v1/v2 merge rule, and the mock scenarios.
@Suite("Data sources (v1.3) and mock scenarios")
struct SourceTests {
    // Real v1 shape, captured 2026-09-28 17:00 SGT (south missing at 15:00 to exercise the merge).
    static let v1PM25 = Data(#"""
    {"region_metadata":[{"name":"south","label_location":{"latitude":1.29587,"longitude":103.82}},
      {"name":"central","label_location":{"longitude":103.82,"latitude":1.35735}},
      {"name":"west","label_location":{"longitude":103.7,"latitude":1.35735}},
      {"name":"north","label_location":{"latitude":1.41803,"longitude":103.82}},
      {"name":"east","label_location":{"latitude":1.35735,"longitude":103.94}}],
     "items":[
      {"timestamp":"2026-09-28T17:00:00+08:00","update_timestamp":"2026-09-28T17:00:59+08:00",
       "readings":{"pm25_one_hourly":{"south":140,"west":107,"north":55,"east":108,"central":137}}},
      {"timestamp":"2026-09-28T15:00:00+08:00","update_timestamp":"2026-09-28T15:01:02+08:00",
       "readings":{"pm25_one_hourly":{"west":103,"north":53,"east":63,"central":80}}}],
     "api_info":{"status":"healthy"}}
    """#.utf8)

    static let v2PM25 = Data(#"""
    {"code":0,"data":{"regionMetadata":[],"items":[
      {"date":"2026-09-28","updatedTimestamp":"2026-09-28T15:45:10+08:00","timestamp":"2026-09-28T15:00:00+08:00",
       "readings":{"pm25_one_hourly":{"north":53,"south":106,"west":-1,"east":63,"central":80}}}]},"errorMsg":""}
    """#.utf8)

    static let v1PSI = Data(#"""
    {"region_metadata":[],"items":[{"timestamp":"2026-09-28T17:00:00+08:00","update_timestamp":"2026-09-28T17:00:59+08:00",
     "readings":{"pm25_twenty_four_hourly":{"north":25,"south":46,"east":35,"central":43,"west":42},
                 "psi_twenty_four_hourly":{"east":77,"south":90,"west":85,"north":66,"central":86}}}],"api_info":{"status":"healthy"}}
    """#.utf8)

    @Test func parsesV1SnakeCase() throws {
        let page = try HazeParser.parse(Self.v1PM25, key: ReadingKey.pm25)
        #expect(page.regions.count == 5)
        #expect(page.regions.first { $0.name == "west" }?.lon == 103.7)
        let h17 = try #require(page.hours.first { $0.values["south"] == 140 })
        #expect(h17.published == HazeFormat.parseISO8601("2026-09-28T17:00:59+08:00"))
        let psi = try HazeParser.parse(Self.v1PSI, key: ReadingKey.psi24h)
        #expect(psi.hours.first?.values["south"] == 90)
        let avg = try HazeParser.parse(Self.v1PSI, key: ReadingKey.pm25Avg24h)
        #expect(avg.hours.first?.values["central"] == 43)
    }

    @Test func mergeRuleV2ValidElseV1() throws {
        let data = try HazeParser.build(pm25V1: [Self.v1PM25], pm25V2: [Self.v2PM25], psiV1: [Self.v1PSI], psiV2: [])
        let h15 = try #require(data.readings.first { $0.time == HazeFormat.parseISO8601("2026-09-28T15:00:00+08:00") })
        #expect(h15.values["south"] == 106)  // v1 missing → v2 back-fill
        #expect(h15.values["west"] == 103)   // v2 -1 → v1 value
        #expect(h15.values["north"] == 53)
        // publishedAt = v1 update_timestamp (first publish), not v2's later "last revised".
        #expect(h15.published == HazeFormat.parseISO8601("2026-09-28T15:01:02+08:00"))

        let s = try #require(HazeCompute.snapshot(data: data, location: .region("south"),
                                                  now: HazeFormat.parseISO8601("2026-09-28T17:02:00+08:00")!))
        #expect(s.pm25 == 140)
        #expect(s.officialPsi24h == 90)
        #expect(s.history.last?.pm25Avg24h == 46)
        #expect(s.publishedAt == HazeFormat.parseISO8601("2026-09-28T17:00:59+08:00"))
    }

    @Test func mergeSourcesUnit() {
        let t = Date(timeIntervalSince1970: 0)
        let v1 = [HourlyReading(time: t, published: t.addingTimeInterval(60), rawValues: ["a": 1, "b": nil, "c": -1])]
        let v2 = [HourlyReading(time: t, published: t.addingTimeInterval(2700), rawValues: ["a": 9, "b": 2, "c": -1])]
        let m = HazeData.mergeSources(v1: v1, v2: v2)
        #expect(m.count == 1)
        #expect(m[0].values == ["a": 9, "b": 2])
        #expect(m[0].published == t.addingTimeInterval(60))
        // v2-only hour keeps v2's stamp.
        let only2 = HazeData.mergeSources(v1: [], v2: v2)
        #expect(only2[0].published == t.addingTimeInterval(2700))
    }

    @Test func v2RateLimitBodyIsRecognised() {
        let body = Data(#"{"code":24,"data":null,"errorMsg":"Too many requests"}"#.utf8)
        #expect(throws: HazeClientError.rateLimited(retryAfter: nil)) { try HazeParser.parsePM25(body) }
    }

    // MARK: Mock scenarios

    @Test(arguments: [("normal", Band.normal), ("elevated", .elevated), ("high", .high), ("very_high", .veryHigh)])
    func bandScenarios(name: String, band: Band) throws {
        let m = try HazeMock.load(name)
        let s = try #require(HazeCompute.snapshot(data: m.data, location: .region("central"), now: m.now))
        #expect(s.band == band)
        #expect(!s.stale)
    }

    @Test func southOfflineScenario() throws {
        let m = try HazeMock.load("south_offline")
        let s = try #require(HazeCompute.snapshot(data: m.data, location: .region("south"), now: m.now))
        #expect(s.pm25 == 89)
        #expect(s.locationMode == .island)
        #expect(s.regions["south"]?.pm25 == nil)
    }

    @Test func allOfflineStaleScenario() throws {
        let m = try HazeMock.load("all_offline_stale")
        let s = try #require(HazeCompute.snapshot(data: m.data, location: .region("central"), now: m.now))
        #expect(s.stale)
        #expect(s.observedAt < HazeFormat.parseISO8601("2026-09-28T16:00:00+08:00")!)
    }

    @Test func risingFastScenario() throws {
        let m = try HazeMock.load("rising_fast")
        let s = try #require(HazeCompute.snapshot(data: m.data, location: .region("central"), now: m.now))
        #expect(s.trend.delta >= 20)
        #expect(s.trend.direction == .up)
    }

    @Test func networkErrorScenarioThrows() {
        #expect(throws: HazeClientError.offline) { try HazeMock.load("network_error") }
    }

    @Test func allScenariosBundled() {
        for name in HazeMock.scenarios { #expect(HazeMock.url(for: name) != nil) }
    }
}

@Suite("Places (v1.4)")
struct PlacesTests {
    @Test func areasBundledAndSearchable() {
        #expect(SGAreas.all.count == 55)
        #expect(SGAreas.search("tamp").first?.name == "Tampines")
        #expect(SGAreas.named("AMK")?.name == "Ang Mo Kio")
        #expect(SGAreas.search("").count == 55)
    }

    @Test func savedPlacesRoundCoordinates() {
        let p = SavedPlace(kind: .home, lat: 1.345678, lon: 103.876543)
        #expect(p.lat == 1.35 && p.lon == 103.88)
        #expect(p.label == "Home")
        #expect(roundCoordinate(1.294999) == 1.29)
    }

    @Test func resolveModes() {
        let home = SavedPlace(kind: .home, area: SGAreas.named("Tampines")!)
        #expect(ResolvedPlace.resolve(.saved(.home), gps: nil, saved: [home]).name == "Home")
        #expect(ResolvedPlace.resolve(.area("Tampines"), gps: nil, saved: []).input.coordinate != nil)
        // Location denied / unavailable → island view, quietly.
        #expect(ResolvedPlace.resolve(.myLocation, gps: nil, saved: []).input == .island)
        #expect(ResolvedPlace.resolve(.saved(.work), gps: nil, saved: [home]).input == .island)
        #expect(ResolvedPlace.resolve(.region("west"), gps: nil, saved: []).input == .region("west"))
    }

    @Test func islandInput() {
        let t = HazeFormat.parseISO8601("2026-09-28T16:00:00+08:00")!
        let d = HazeData(readings: [HourlyReading(time: t, published: t, values: ["north": 49, "south": 105, "west": 117, "east": 83, "central": 105])],
                         psi24h: [:], regions: HazeRegions.fallback)
        let s = HazeCompute.snapshot(data: d, location: .island, now: t)!
        #expect(s.pm25 == 92) // (49+105+117+83+105)/5 = 91.8
        #expect(s.locationMode == .island)
        #expect(s.nearestRegion == "")
    }
}

@Suite("Mock mode is session-scoped")
struct MockPersistenceTests {
    static func fresh() -> (HazeSettings, UserDefaults, UserDefaults) {
        let a = UserDefaults(suiteName: "hazenow.test.\(UUID().uuidString)")!
        let b = UserDefaults(suiteName: "hazenow.test.\(UUID().uuidString)")!
        return (HazeSettings(defaults: a), a, b)
    }

    @Test func launchWithoutFlagClearsPersistedMock() {
        let (settings, group, standard) = Self.fresh()
        settings.applyMock(launchValue: "south_offline", allowed: true)
        #expect(settings.storedMockValue == "south_offline")
        standard.set("south_offline", forKey: "hazenow.mock") // left behind in the app's own defaults too
        settings.applyMock(launchValue: nil, allowed: true, alsoClear: [standard])
        #expect(settings.storedMockValue == nil)
        #expect(group.string(forKey: "hazenow.mock") == nil)
        #expect(standard.string(forKey: "hazenow.mock") == nil)
        #expect(settings.mockScenario == nil)
    }

    @Test func offClearsAndFlagSets() {
        let (settings, _, _) = Self.fresh()
        settings.applyMock(launchValue: "high", allowed: true)
        #expect(settings.storedMockValue == "high")
        #expect(settings.mockScenario == (HazeSettings.mockAllowed ? "high" : nil)) // release never reads it
        settings.applyMock(launchValue: "", allowed: true)
        #expect(settings.storedMockValue == nil)
    }

    @Test func releaseIgnoresFlagAndClearsKey() {
        let (settings, group, _) = Self.fresh()
        group.set("very_high", forKey: "hazenow.mock")
        settings.applyMock(launchValue: "high", allowed: false)
        #expect(settings.storedMockValue == nil)
        #expect(settings.mockScenario == nil)
    }

    @Test func debugGateMatchesBuildConfiguration() {
        #if DEBUG
        #expect(HazeSettings.mockAllowed)
        #else
        #expect(!HazeSettings.mockAllowed)
        #endif
    }
}
