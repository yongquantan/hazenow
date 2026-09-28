import Foundation
import Testing
@testable import HazeKit

/// Every test vector from SPEC.md, plus -1 / missing-data handling.
@Suite("SPEC test vectors")
struct SpecVectorTests {
    static let t16 = HazeFormat.parseISO8601("2026-09-28T16:00:00+08:00")!
    static let p16 = HazeFormat.parseISO8601("2026-09-28T16:30:40+08:00")!
    static let now = HazeFormat.parseISO8601("2026-09-28T16:35:00+08:00")!

    static let latest: [String: Double] = ["north": 49, "south": 105, "west": 117, "east": 83, "central": 105]

    static func data(_ latest: [String: Double?], previous: [String: Double?]? = nil, psi: [String: Double] = [:]) -> HazeData {
        var readings = [HourlyReading(time: t16, published: p16, rawValues: latest)]
        if let previous {
            readings.append(HourlyReading(time: t16.addingTimeInterval(-3600), published: p16.addingTimeInterval(-3600), rawValues: previous))
        }
        return HazeData(readings: readings, psi24h: psi, regions: HazeRegions.fallback)
    }

    static func snap(_ location: LocationInput, _ d: HazeData = data(latest.mapValues { $0 })) -> Snapshot {
        HazeCompute.snapshot(data: d, location: location, now: now)!
    }

    // MARK: Regions

    @Test func southRegion() {
        let s = Self.snap(.region("south"))
        #expect(s.pm25 == 105)
        #expect(s.band == .elevated)
        #expect(s.instantPsi == 153)
        #expect(s.instantPsiLabel == .unhealthy)
        #expect(s.locationMode == .region)
        #expect(s.nearestRegion == "south")
        #expect(s.stale == false)
    }

    @Test(arguments: [("west", 117, Band.elevated, 165), ("north", 49, Band.normal, 93), ("central", 105, Band.elevated, 153)])
    func regionVectors(region: String, pm25: Int, band: Band, psi: Int) {
        let s = Self.snap(.region(region))
        #expect(s.pm25 == pm25)
        #expect(s.band == band)
        #expect(s.instantPsi == psi)
    }

    @Test func defaultIsCentral() {
        let s = Self.snap(.default)
        #expect(s.pm25 == 105)
        #expect(s.nearestRegion == "central")
    }

    // MARK: -1 handling

    @Test func offlineSouthFallsBackToIslandMean() {
        var raw = Self.latest.mapValues { Optional($0) }
        raw["south"] = -1
        let s = Self.snap(.region("south"), Self.data(raw))
        // (49 + 117 + 83 + 105) / 4 = 88.5 → 89 (round half up)
        #expect(s.pm25 == 89)
        #expect(s.locationMode == .island)
        #expect(s.band == .elevated)
        // -1 is never exposed: the region reads null.
        #expect(s.regions["south"]?.pm25 == nil)
        #expect(s.regions["west"]?.pm25 == 117)
    }

    @Test func nullAndMissingAreOffline() {
        let raw: [String: Double?] = ["north": nil, "south": 105, "west": -1, "east": 83]
        let s = Self.snap(.region("north"), Self.data(raw))
        #expect(s.locationMode == .island)
        #expect(s.pm25 == HazeCompute.roundHalfUp((105.0 + 83.0) / 2)) // 94
        #expect(s.regions["central"]?.pm25 == nil)
        #expect(s.regions["north"]?.pm25 == nil)
        #expect(s.regions["west"]?.pm25 == nil)
    }

    @Test func noNegativeValuesEverSurface() throws {
        let raw: [String: Double?] = ["north": -1, "south": -1, "west": 20, "east": -1, "central": -1]
        let s = Self.snap(.gps(lat: 1.29587, lon: 103.82), Self.data(raw))
        #expect(s.pm25 == 20)
        #expect(s.nearestRegion == "west") // nearest *valid* region
        let json = String(data: try Snapshot.jsonEncoder().encode(s), encoding: .utf8)!
        #expect(!json.contains("-1"))
    }

    @Test func allInvalidWalksBackAndMarksStale() {
        let offline: [String: Double?] = ["north": -1, "south": -1, "west": -1, "east": -1, "central": -1]
        let d = Self.data(offline, previous: ["north": 53, "south": 106, "west": 103, "east": 63, "central": 80])
        let s = HazeCompute.snapshot(data: d, location: .region("central"), now: Self.now)!
        #expect(s.pm25 == 80)
        #expect(s.stale)
        #expect(s.observedAt == Self.t16.addingTimeInterval(-3600))
    }

    @Test func nothingValidAtAllReturnsNil() {
        let offline: [String: Double?] = ["north": -1, "south": nil]
        #expect(HazeCompute.snapshot(data: Self.data(offline), now: Self.now) == nil)
    }

    @Test func staleAfterTwoHoursFifteen() {
        let d = Self.data(Self.latest.mapValues { $0 })
        let fresh = HazeCompute.snapshot(data: d, now: Self.t16.addingTimeInterval(2 * 3600 + 14 * 60))!
        let old = HazeCompute.snapshot(data: d, now: Self.t16.addingTimeInterval(2 * 3600 + 16 * 60))!
        #expect(!fresh.stale)
        #expect(old.stale)
    }

    // MARK: GPS / IDW

    @Test func gpsExactlyOnSouth() {
        let s = Self.snap(.gps(lat: 1.29587, lon: 103.82))
        #expect(s.pm25 == 105)
        #expect(s.nearestRegion == "south")
        #expect(s.locationMode == .gps)
    }

    @Test func gpsWithinHalfKmSnapsToRegion() {
        // ~0.3 km north of the west label location
        let s = Self.snap(.gps(lat: 1.36005, lon: 103.70))
        #expect(s.pm25 == 117)
        #expect(s.nearestRegion == "west")
    }

    @Test func gpsIDWBetweenRegions() {
        // Somewhere between central and west: IDW must fall between the valid extremes,
        // weighted towards the nearer region, and match a hand calculation.
        let lat = 1.35735, lon = 103.76
        let s = Self.snap(.gps(lat: lat, lon: lon))
        var num = 0.0, den = 0.0
        for r in HazeRegions.fallback {
            let d = HazeCompute.haversineKm(lat1: lat, lon1: lon, lat2: r.lat, lon2: r.lon)
            num += Self.latest[r.name]! / (d * d)
            den += 1 / (d * d)
        }
        #expect(s.pm25 == HazeCompute.roundHalfUp(num / den))
        #expect((49...117).contains(s.pm25))
        #expect(s.locationMode == .gps)
    }

    @Test func haversineSanity() {
        #expect(HazeCompute.haversineKm(lat1: 1.29587, lon1: 103.82, lat2: 1.29587, lon2: 103.82) == 0)
        let d = HazeCompute.haversineKm(lat1: 1.35735, lon1: 103.70, lat2: 1.35735, lon2: 103.94)
        #expect(abs(d - 26.7) < 0.2)
    }

    // MARK: Breakpoints / bands / labels

    @Test(arguments: [(0.0, 0), (12, 50), (55, 100), (150, 200), (250, 300), (500, 500), (600, 500),
                      (105, 153), (117, 165), (49, 93), (350, 400)])
    func breakpoints(c: Double, expected: Int) {
        #expect(HazeCompute.instantPsi(pm25: c) == expected)
    }

    @Test func instantPsiInvalidInput() {
        #expect(HazeCompute.instantPsi(pm25: -1.0) == nil)
        #expect(HazeCompute.instantPsi(pm25: .nan) == nil)
    }

    @Test(arguments: [(0, Band.normal), (55, .normal), (56, .elevated), (150, .elevated),
                      (151, .high), (250, .high), (251, .veryHigh), (900, .veryHigh)])
    func bands(pm25: Int, band: Band) {
        #expect(HazeCompute.band(pm25: pm25) == band)
    }

    @Test(arguments: [(0, PsiLabel.good), (50, .good), (51, .moderate), (100, .moderate), (101, .unhealthy),
                      (200, .unhealthy), (201, .veryUnhealthy), (300, .veryUnhealthy), (301, .hazardous)])
    func psiLabels(psi: Int, label: PsiLabel) {
        #expect(HazeCompute.psiLabel(psi) == label)
    }

    @Test func bandColorsAndAdvice() {
        #expect(Band.normal.hex == "#2E9E5B")
        #expect(Band.elevated.hex == "#E8A317")
        #expect(Band.high.hex == "#E4572E")
        #expect(Band.veryHigh.hex == "#7B2D8E")
        #expect(Band.normal.advice == "Normal activities.")
        #expect(Band.veryHigh.rawValue == "very_high")
    }

    // MARK: Trend

    @Test(arguments: [(5, TrendDirection.up), (4, .steady), (0, .steady), (-4, .steady), (-5, .down), (25, .up)])
    func trendThresholds(delta: Int, direction: TrendDirection) {
        #expect(HazeCompute.trendDirection(delta: delta) == direction)
    }

    @Test func trendUsesPreviousHourSameMethod() {
        let d = Self.data(Self.latest.mapValues { $0 }, previous: ["north": 53, "south": 106, "west": 103, "east": 63, "central": 80])
        let central = HazeCompute.snapshot(data: d, location: .region("central"), now: Self.now)!
        #expect(central.trend == Trend(delta: 25, direction: .up))
        #expect(central.compactText == "● 105 ▲")
        let south = HazeCompute.snapshot(data: d, location: .region("south"), now: Self.now)!
        #expect(south.trend.direction == .steady)
        #expect(south.trend.delta == -1)
        #expect(central.history.map(\.pm25) == [80, 105])
    }

    // MARK: Poll cadence (SPEC v1.3)

    @Test func pollCadence() {
        func at(_ hms: String) -> Date { HazeFormat.parseISO8601("2026-09-28T\(hms)+08:00")! }
        let prevHour = at("15:00:00"), thisHour = at("16:00:00")
        // Before hh:00:30 without the new hour → wait until :00:30.
        #expect(PollSchedule.next(now: at("16:00:10"), latestObserved: prevHour) == .init(delay: 20, includeV2: false))
        // hh:00:30–hh:10 without the new hour → every 60 s, v1 only.
        #expect(PollSchedule.next(now: at("16:03:00"), latestObserved: prevHour) == .init(delay: 60, includeV2: false))
        // New hour arrived → idle until the :35 v2 back-fill call.
        #expect(PollSchedule.next(now: at("16:03:00"), latestObserved: thisHour) == .init(delay: 32.0 * 60, includeV2: true))
        // Past hh:10 and still missing → stop the 60 s loop, next is :35 (v2).
        #expect(PollSchedule.next(now: at("16:12:00"), latestObserved: prevHour).delay == 23.0 * 60)
        #expect(PollSchedule.next(now: at("16:40:00"), latestObserved: thisHour) == .init(delay: 10.0 * 60, includeV2: true))
        // After :50 → next hour's :00:30, v1.
        #expect(PollSchedule.next(now: at("16:55:00"), latestObserved: thisHour) == .init(delay: 5.0 * 60 + 30, includeV2: false))
        // Backoff 30 s → 10 min, honouring Retry-After.
        #expect(PollSchedule.next(now: at("16:03:00"), latestObserved: nil, failures: 1).delay == 30)
        #expect(PollSchedule.next(now: at("16:03:00"), latestObserved: nil, failures: 3).delay == 120)
        #expect(PollSchedule.next(now: at("16:03:00"), latestObserved: nil, failures: 9).delay == 600)
        #expect(PollSchedule.next(now: at("16:03:00"), latestObserved: nil, failures: 1, retryAfter: 90).delay == 90)
        // Widgets: next hh:02.
        #expect(PollSchedule.widgetNextRefresh(after: at("16:01:00")) == at("16:02:00"))
        #expect(PollSchedule.widgetNextRefresh(after: at("16:02:00")) == at("17:02:00"))
    }
}
