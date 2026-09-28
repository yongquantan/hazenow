import Foundation
import Testing
@testable import HazeKit

/// Mirrors packages/core/test/core.test.ts › "share system (SPEC v1.6)" — same inputs, same expected outputs.
@Suite("Share system (v1.6)")
struct ShareTests {
    static let end = HazeFormat.parseISO8601("2026-09-28T16:00:00+08:00")!

    /// Synthetic day: hourly PM2.5 (all regions = v) ending 16:00 SGT; 24-hr PSI 70; 24-hr avg PM2.5 per hour (default 30).
    static func snap(_ values: [Int], avg: [Int]? = nil, region: String = "west") -> Snapshot {
        let n = values.count
        var pm: [HourlyReading] = [], psi: [HourlyReading] = [], av: [HourlyReading] = []
        for (i, v) in values.enumerated() {
            let t = end.addingTimeInterval(-Double(n - 1 - i) * 3600)
            let all = { (x: Double) in Dictionary(uniqueKeysWithValues: HazeRegions.canonicalOrder.map { ($0, x) }) }
            pm.append(HourlyReading(time: t, published: t.addingTimeInterval(60), values: all(Double(v))))
            psi.append(HourlyReading(time: t, published: t, values: all(70)))
            av.append(HourlyReading(time: t, published: t, values: all(Double(avg?[i] ?? 30))))
        }
        let d = HazeData(readings: pm, psiHistory: psi, avg24History: av, regions: HazeRegions.fallback)
        let loc: LocationInput = region == "island" ? .island : .region(region)
        return HazeCompute.snapshot(data: d, location: loc, now: end.addingTimeInterval(35 * 60))!
    }

    static func flat(_ v: Int, _ n: Int = 24) -> [Int] { Array(repeating: v, count: n) }
    static let episode = flat(30, 14) + [80, 120, 162, 140, 90, 60, 50, 40, 30, 22]

    @Test func rule1AllClear() {
        let p = HazeShare.pickShareCard(Self.snap(Self.episode), profile: [.general])
        #expect(p.card == .clear)
        #expect(p.alternates == [.now, .clocks])
        #expect(HazeShare.pickShareCard(Self.snap([90] + Self.flat(30, 23))).card == .now) // 13+ h ago doesn't count
    }

    @Test func rule2GroupPersonaPriority() {
        let s = Self.snap(Self.flat(100))
        #expect(HazeShare.pickShareCard(s, profile: [.kids, .elderly]) == SharePick(card: .group, persona: .kids, alternates: [.now, .clocks]))
        #expect(HazeShare.pickShareCard(s, profile: [.elderly, .exercising]).persona == .elderly)
        #expect(HazeShare.pickShareCard(s, profile: [.pregnant, .heartLung]).persona == .heartLung)
        #expect(HazeShare.pickShareCard(s, profile: [.exercising, .outdoorWorker]).persona == .exercising)
        #expect(HazeShare.pickShareCard(s, profile: [.outdoorWorker]).persona == .outdoorWorker)
    }

    @Test func rule1BeatsRule2() {
        let s = Self.snap(Self.flat(30, 20) + [90, 60, 40, 30])
        #expect(HazeShare.pickShareCard(s, profile: [.kids]) == SharePick(card: .clear, persona: .kids, alternates: [.now, .clocks, .group]))
    }

    @Test func rule3Now() {
        let p = HazeShare.pickShareCard(Self.snap(Self.flat(170)), profile: [.general])
        #expect(p.card == .now)
        #expect(p.alternates == [.clocks])
    }

    @Test func rule4Clocks() {
        #expect(HazeShare.pickShareCard(Self.snap(Self.flat(50), avg: Self.flat(90))).card == .clocks)
        #expect(HazeShare.pickShareCard(Self.snap(Self.flat(50), avg: Self.flat(89))).card == .now)
        #expect(HazeShare.pickShareCard(Self.snap(Self.flat(20), avg: Self.flat(30)), context: ShareContext(fromWhyTwoNumbers: true)).card == .clocks)
    }

    @Test func rule5Now() {
        #expect(HazeShare.pickShareCard(Self.snap(Self.flat(20), avg: Self.flat(22))) == SharePick(card: .now, persona: nil, alternates: [.clocks]))
    }

    @Test func episodeStats() {
        let ep = HazeShare.episodeStats(Self.snap(Self.episode).history)!
        #expect(ep.worst.pm25 == 162)
        #expect(HazeFormat.hour(ep.worst.time) == "9am")
        #expect(ep.hoursAbove == 6)
        #expect(!ep.truncated)
        #expect(HazeShare.episodeStats(Self.snap(Self.flat(20)).history) == nil)
        #expect(HazeShare.episodeStats(Self.snap(Self.flat(90)).history)!.truncated)
    }

    @Test func nowCardWords() {
        let s = Self.snap(Self.flat(90, 22) + [100, 136])
        let c = ShareCardContent(.now, s, profile: [.general], context: ShareContext(placeName: "Tampines"))
        #expect(c.hook == "Air near Tampines · Mon 28 Sep, 4pm")
        #expect(c.headline == "Elevated, and rising fast.")
        #expect(c.pmDetail == "µg/m³ 1-hr PM2.5 · up 46 in 2 hours")
        #expect([c.adviceMost, c.adviceVulnerable] == ["Reduce strenuous outdoor activity.", "Avoid strenuous outdoor activity."])
        #expect(c.psiLine.contains("The 24-hr PSI (70) averages the whole day."))
        let n = Self.snap(Self.flat(20))
        #expect(HazeShare.nowHeadline(band: n.band, history: n.history) == "Normal, and steady.")
    }

    @Test func groupClocksClearPreviewWords() {
        let g = ShareCardContent(.group, Self.snap(Self.flat(71)), profile: [.kids])
        #expect(g.chip == "For the kids · Recess check")
        #expect(g.headline == "Calm play only, for now.")
        #expect(g.statsRest == "µg/m³ · Elevated · steady")
        #expect(g.actions.last == "Next check at 5pm.")
        #expect(!g.actions.joined(separator: " ").contains("N95"))
        #expect(ShareCardContent(.group, Self.snap(Self.flat(200)), profile: [.elderly]).headline == "Stay indoors for now.")
        let k = ShareCardContent(.clocks, Self.snap(Self.flat(134), avg: Self.flat(43)))
        #expect(k.pm25 == 134 && k.avg == 43 && k.psi == 70 && k.bars.count == 24)
        let cl = ShareCardContent(.clear, Self.snap(Self.episode))
        #expect(cl.stats == "Worst hour this episode: 162 at 9am. 6 hours above Normal.")
        let pv = ShareCardContent(.preview, Self.snap(Self.flat(100)))
        #expect(pv.pm25 == 100 && pv.direction == .steady && pv.psi == 70)
    }

    @Test func shareTextPerCard() {
        let s = Self.snap(Self.flat(90, 22) + [100, 136])
        let ctx = ShareContext(placeName: "Tampines")
        let all = ShareCardKind.allCases.map { HazeShare.shareCardText($0, s, profile: [.kids], context: ctx) }
        #expect(all[0] == "Air near Tampines at 4pm: Elevated (PM2.5 136), rising fast. NEA 24-hr PSI: 70 (Moderate). Data: NEA via data.gov.sg. hazenow.pages.dev")
        #expect(all[1].hasPrefix("Same NEA data, two clocks. Tampines at 4pm: last hour PM2.5 136, 24-hr average 30."))
        #expect(all[2].hasPrefix("For the kids · Recess check, Tampines at 4pm: "))
        for t in all {
            #expect(t.hasSuffix("hazenow.pages.dev"))
            for bad in ["~", "Instant", "real number", "lagging", "Unhealthy"] { #expect(!t.contains(bad)) }
        }
    }

    @Test func fileNamesAndDates() {
        #expect(HazeShare.shareFileName(place: "Choa Chu Kang", observedAt: HazeFormat.parseISO8601("2026-09-28T17:00:00+08:00")!)
            == "hazenow-choa-chu-kang-2026-09-28-1700.png")
        #expect(HazeShare.shareFileName(place: "West", observedAt: HazeFormat.parseISO8601("2026-09-28T09:00:00+08:00")!, card: "clocks")
            == "hazenow-west-2026-09-28-0900-clocks.png")
        #expect(HazeShare.formatCardWhen(HazeFormat.parseISO8601("2026-09-29T07:00:00+08:00")!) == "Tue 29 Sep, 7am")
    }

    @Test func placeNaming() {
        #expect(SGAreas.nearest(lat: 1.35, lon: 103.95)?.name == "Tampines")
        let t = HazeFormat.parseISO8601("2026-09-28T16:00:00+08:00")!
        let d = HazeData(readings: [HourlyReading(time: t, published: t, values: ["north": 49, "south": 105, "west": 117, "east": 83, "central": 105])],
                         psi24h: [:], regions: HazeRegions.fallback)
        let g = HazeCompute.snapshot(data: d, location: .gps(lat: 1.35, lon: 103.95), now: t)!
        let pl = HazeShare.sharePlace(g, ShareContext(placeName: "Tampines", point: LatLonPoint(lat: 1.35, lon: 103.95)))
        #expect(pl.station.range(of: #"^NEA East station · \d\.\d km away$"#, options: .regularExpression) != nil)
        #expect(HazeShare.sharePlace(HazeCompute.snapshot(data: d, location: .island, now: t)!).hook == "Air across Singapore")
        #expect(HazeShare.sharePlace(Self.snap(Self.flat(20))).hook == "Air in the West")
    }

    @Test func payloadLinkAndFilename() {
        let c = ShareCardContent(card: .now, Self.snap(Self.flat(100)), context: ShareContext(placeName: "Choa Chu Kang"))
        #expect(c.url.absoluteString == "https://hazenow.pages.dev/?area=choa-chu-kang&s=now")
        #expect(c.filename == "hazenow-choa-chu-kang-2026-09-28-1600.png")
        #expect(c.shareText.hasSuffix("hazenow.pages.dev"))
    }
}

@Suite("v1.7 parity")
struct V17Tests {
    @Test func clementiRangeContainsEstimate() {
        let t = HazeFormat.parseISO8601("2026-09-28T16:00:00+08:00")!
        let values: [String: Double] = ["south": 137, "central": 140, "west": 100, "north": 40, "east": 40]
        let d = HazeData(readings: [HourlyReading(time: t, published: t, values: values)], psi24h: [:], regions: HazeRegions.fallback)
        let clementi = (lat: 1.315, lon: 103.765)
        let s = HazeCompute.snapshot(data: d, location: .gps(lat: clementi.lat, lon: clementi.lon), now: t)!
        let u = Uncertainty(snapshot: s, point: clementi)
        let r = try! #require(u.range)
        #expect(r.contains(s.pm25))
        #expect(r != 137...140)
        let line = HazeInsight(snapshot: s, location: .gps(lat: clementi.lat, lon: clementi.lon), placeName: "Clementi", now: t).uncertaintyLine
        #expect(line.hasPrefix("Estimate for Clementi · range "))
        #expect(!line.contains("137–140"))
    }

    @Test func staleShareNeverSaysNow() {
        var s = ShareTests.snap(ShareTests.flat(100))
        s.stale = true
        let now = ShareCardContent(card: .now, s, context: ShareContext(placeName: "Tampines"))
        #expect(now.headline == "Latest NEA reading is delayed.")
        #expect(now.hook == "Tampines · reading from Mon 28 Sep, 4pm (latest available)")
        let g = ShareCardContent(card: .group, s, profile: [.kids], context: ShareContext(placeName: "Tampines"))
        #expect(g.headline == "Latest NEA reading is delayed.")
        #expect(g.placeLine == "Tampines · reading from Mon 28 Sep, 4pm (latest available)")
        #expect(ShareCardContent(card: .clocks, s).headline == "Same NEA data.\nTwo clocks.")
        s.stale = false
        #expect(ShareCardContent(card: .now, s, context: ShareContext(placeName: "Tampines")).placeLine == "Tampines · Mon 28 Sep, 4pm")
    }

    @Test func staleHidesTrendEverywhere() {
        var s = ShareTests.snap(ShareTests.flat(90, 22) + [100, 136])
        s.stale = true
        let ctx = ShareContext(placeName: "Tampines")
        #expect(ShareCardContent(card: .now, s, context: ctx).pmDetail == "µg/m³ 1-hr PM2.5")
        #expect(ShareCardContent(card: .group, s, profile: [.kids], context: ctx).statsRest == "µg/m³ · Elevated")
        #expect(ShareCardContent(.preview, s, context: ctx).direction == nil)
        let text = HazeShare.shareCardText(.now, s, context: ctx)
        #expect(text == "Air near Tampines at 4pm: Elevated (PM2.5 136). NEA 24-hr PSI: 70 (Moderate). Data: NEA via data.gov.sg. hazenow.pages.dev")
        for word in ["rising", "easing", "steady", "clearing"] { #expect(!text.contains(word)) }
        // Fresh reading keeps it.
        s.stale = false
        #expect(ShareCardContent(card: .now, s, context: ctx).pmDetail == "µg/m³ 1-hr PM2.5 · up 46 in 2 hours")
        #expect(ShareCardContent(.preview, s, context: ctx).direction == .up)
    }

    @Test func staleClocksAxisEndsAtReadingHour() {
        var s = ShareTests.snap(ShareTests.flat(50), avg: ShareTests.flat(90))
        #expect(ShareCardContent(card: .clocks, s).axisEnd == "Now")
        s.stale = true
        #expect(ShareCardContent(card: .clocks, s).axisEnd == "4pm")
    }

    @Test func staleWordingNeverImpliesNow() {
        var s = ShareTests.snap(ShareTests.flat(90, 22) + [100, 136])
        s.stale = true
        let ctx = ShareContext(placeName: "Tampines")
        let now = ShareCardContent(card: .now, s, context: ctx)
        #expect(now.adviceLabel == "NEA’s advice for that hour")
        #expect(now.psiLine == "The 24-hr PSI (70) averages the whole day. This reading is for the 4pm hour.")
        let clocks = ShareCardContent(card: .clocks, s, context: ctx)
        #expect(clocks.lastHourLabel == "The 4pm hour")
        #expect(clocks.shareText.hasPrefix("Same NEA data, two clocks. Tampines at 4pm: the 4pm hour PM2.5 136, 24-hr average 30."))
        for card in ShareCardKind.allCases {
            let c = ShareCardContent(card: card, s, profile: [.kids], context: ctx)
            let all = [c.hook, c.headline, c.pmDetail, c.adviceLabel, c.psiLine, c.placeLine, c.statsRest, c.lastHourLabel,
                       c.caption, c.shareText] + c.actions
            for t in all {
                for bad in ["right now", "this hour", "the last hour", "The last hour", "next hour", "last hour PM2.5"] {
                    #expect(!t.contains(bad), "\(card): \(t)")
                }
            }
        }
        let g = ShareCardContent(card: .group, s, profile: [.kids], context: ctx)
        #expect(g.actions.last == "Check hazenow.pages.dev for NEA's next update.")
        #expect(!g.actions.contains { $0.hasPrefix("Next check") })
        // Fresh wording unchanged.
        s.stale = false
        #expect(ShareCardContent(card: .group, s, profile: [.kids], context: ctx).actions.last == "Next check at 5pm.")
        #expect(ShareCardContent(card: .now, s, context: ctx).adviceLabel == "NEA’s advice for the next hour")
        #expect(ShareCardContent(card: .clocks, s, context: ctx).lastHourLabel == "The last hour")
    }
}
