import Foundation
import Testing
@testable import HazeKit

/// Parse the captured data.gov.sg responses (shared with packages/core) end to end.
@Suite("Fixtures")
struct FixtureTests {
    static func fixture(_ name: String) throws -> Data {
        let url = try #require(Bundle.module.url(forResource: name, withExtension: "json", subdirectory: "Fixtures"))
        return try Data(contentsOf: url)
    }

    static func loadData() throws -> HazeData {
        try HazeParser.build(
            pm25V1: [],
            pm25V2: [fixture("pm25-latest"), fixture("pm25-2026-09-28"), fixture("pm25-2026-09-27")],
            psiV1: [],
            psiV2: [fixture("psi-latest"), fixture("psi-2026-09-28"), fixture("psi-2026-09-27")]
        )
    }

    static let now = HazeFormat.parseISO8601("2026-09-28T16:40:00+08:00")!

    @Test func parsesRegionMetadata() throws {
        let page = try HazeParser.parsePM25(Self.fixture("pm25-latest"))
        #expect(page.regions.count == 5)
        let west = try #require(page.regions.first { $0.name == "west" })
        #expect(west.lat == 1.35735 && west.lon == 103.7)
        #expect(page.hours.first?.values["west"] == 117)
    }

    @Test func mergesHistoryWithoutDuplicates() throws {
        let d = try Self.loadData()
        let times = d.readings.map(\.time)
        #expect(Set(times).count == times.count)
        #expect(times == times.sorted())
        #expect(d.readings.count >= 12)
    }

    @Test func liveExampleSnapshot() throws {
        let d = try Self.loadData()
        let s = try #require(HazeCompute.snapshot(data: d, location: .region("west"), now: Self.now))
        #expect(s.pm25 == 117)
        #expect(s.instantPsi == 165)
        #expect(s.officialPsi24h == 81)
        #expect(s.history.count == HazeCompute.historyLength)
        #expect(s.history.last?.pm25 == 117)
        #expect(s.history.first!.time < s.history.last!.time)
        #expect(s.regions.count == 5)
        #expect(s.regions["south"]?.psi24h == 84)
        #expect(s.source == "NEA via data.gov.sg")
        #expect(s.asOfText == "Measured 4pm · posted by NEA 4:30pm")
        #expect(s.history.last?.pm25Avg24h == 38)
        #expect(s.history.last?.psi24h == 81)
        #expect(!s.stale)
    }

    @Test func jsonShapeMatchesSpec() throws {
        let d = try Self.loadData()
        let s = try #require(HazeCompute.snapshot(data: d, location: .gps(lat: 1.29587, lon: 103.82), now: Self.now))
        let json = try Snapshot.jsonEncoder().encode(s)
        let obj = try #require(try JSONSerialization.jsonObject(with: json) as? [String: Any])
        let expectedKeys: Set = ["pm25", "band", "instantPsi", "instantPsiLabel", "officialPsi24h", "trend", "history",
                                 "regions", "nearestRegion", "locationMode", "observedAt", "publishedAt", "stale", "source"]
        #expect(Set(obj.keys) == expectedKeys)
        #expect(obj["observedAt"] as? String == "2026-09-28T16:00:00+08:00")
        #expect(obj["locationMode"] as? String == "gps")
        #expect(obj["nearestRegion"] as? String == "south")
        let trend = try #require(obj["trend"] as? [String: Any])
        #expect(Set(trend.keys) == ["delta", "direction"])

        // Round-trip.
        let back = try Snapshot.jsonDecoder().decode(Snapshot.self, from: json)
        #expect(back == s)
    }

    @Test func officialPsiNullEncodesAsNull() throws {
        var s = Snapshot.sample
        s.officialPsi24h = nil
        s.regions["east"]?.pm25 = nil
        let json = String(data: try Snapshot.jsonEncoder().encode(s), encoding: .utf8)!
        #expect(json.contains("\"officialPsi24h\":null"))
        #expect(json.contains("\"pm25\":null"))
    }

    @Test func apiErrorCodeThrows() {
        let body = Data(#"{"code":17,"data":null,"errorMsg":"Invalid date"}"#.utf8)
        #expect(throws: HazeClientError.self) { try HazeParser.parsePM25(body) }
    }

    @Test func lenientValues() throws {
        let body = Data(#"""
        {"code":0,"data":{"regionMetadata":[],"items":[{"timestamp":"2026-09-28T16:00:00+08:00",
        "updatedTimestamp":"2026-09-28T16:30:40+08:00",
        "readings":{"pm25_one_hourly":{"north":null,"south":"105","west":-1,"East":83}}}]},"errorMsg":""}
        """#.utf8)
        let page = try HazeParser.parsePM25(body)
        #expect(page.hours.first?.values == ["south": 105, "east": 83])
        // Empty metadata → fallback coordinates are used.
        let d = HazeData(readings: page.hours, psi24h: [:], regions: page.regions)
        #expect(d.regions.count == 5)
    }

    @Test func backfillWinsOnDuplicateHour() {
        let t = HazeFormat.parseISO8601("2026-09-28T16:00:00+08:00")!
        let early = HourlyReading(time: t, published: t.addingTimeInterval(1800), rawValues: ["south": -1, "north": 40])
        let late = HourlyReading(time: t, published: t.addingTimeInterval(3000), rawValues: ["south": 90, "north": 40])
        let d = HazeData(readings: [early, late], psi24h: [:], regions: HazeRegions.fallback)
        #expect(d.readings.count == 1)
        #expect(d.readings[0].values["south"] == 90)
    }
}
