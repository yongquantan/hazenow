import Foundation
import Testing
@testable import HazeKit

/// SPEC v1.1/v1.2 + docs/COPY.md. Mirrors packages/core/test/core.test.ts so every client says the same thing.
@Suite("Experience & trust (COPY.md)")
struct ExperienceTests {
    static let t16 = HazeFormat.parseISO8601("2026-09-28T16:00:00+08:00")!
    static let p16 = HazeFormat.parseISO8601("2026-09-28T16:30:40+08:00")!
    static let now = HazeFormat.parseISO8601("2026-09-28T16:35:00+08:00")!
    static let latest: [String: Double] = ["north": 49, "south": 105, "west": 117, "east": 83, "central": 105]

    static func snap(_ loc: LocationInput) -> Snapshot { snap(latest, loc) }

    static func snap(_ values: [String: Double], _ loc: LocationInput, now: Date = now) -> Snapshot {
        let d = HazeData(readings: [HourlyReading(time: t16, published: p16, values: values)], psi24h: [:], regions: HazeRegions.fallback)
        return HazeCompute.snapshot(data: d, location: loc, now: now)!
    }

    static func h(_ vals: [Int]) -> [HistoryPoint] {
        let base = HazeFormat.parseISO8601("2026-09-28T10:00:00+08:00")!
        return vals.enumerated().map { HistoryPoint(time: base.addingTimeInterval(Double($0.offset) * 3600), pm25: $0.element) }
    }

    // MARK: Verdicts

    @Test func verdictMatrix() {
        func v(_ b: Band, _ p: [Profile] = [.general]) -> String { HazeCompute.verdict(band: b, profiles: p).headline }
        #expect(v(.normal) == "Fine to be out.")
        #expect(v(.normal, [.kids]) == "Fine for outdoor play.")
        #expect(v(.elevated) == "OK to be out. Go easy on hard exercise.")
        #expect(v(.elevated, [.kids]) == "Calm play outside is OK. Skip running games for now.")
        #expect(v(.elevated, [.elderly]) == "A gentle walk is OK. Skip hard exercise for now.")
        #expect(v(.high) == "Short trips out are OK. Exercise indoors.")
        #expect(v(.high, [.pregnant]) == "Stay indoors for now if you can.")
        #expect(v(.veryHigh) == "Stay indoors for now. Go out only if you need to.")
        #expect(v(.veryHigh, [.kids]) == "Keep kids indoors for now.")
        #expect(v(.high, [.exercising]) == "Move your workout indoors.")
    }

    @Test func verdictsNeverSayTodayAndShortFormsFit() {
        for b in Band.allCases {
            for p in Profile.allCases {
                let v = HazeCompute.verdict(band: b, profiles: [p])
                #expect(!v.headline.lowercased().contains("today"))
                #expect(v.short.count <= 28)
                #expect(!v.short.hasSuffix("."))
            }
        }
    }

    @Test func mixedProfilesStrictestWithTieBreak() {
        #expect(HazeCompute.verdict(band: .elevated, profiles: [.general, .exercising]).headline == "Keep your workout light, or move it indoors.")
        #expect(HazeCompute.verdict(band: .elevated, profiles: [.exercising, .heartLung]).profile == .heartLung)
        #expect(HazeCompute.verdict(band: .high, profiles: [.kids, .elderly]).headline == "Indoor play for now. Keep trips out short.")
        #expect(HazeCompute.verdict(band: .veryHigh, profiles: [.general, .exercising]).profile == .exercising)
    }

    @Test func outdoorWorker() {
        #expect(HazeCompute.verdict(band: .elevated, profiles: [.outdoorWorker]).headline == "OK to work outside. Take breaks indoors if you can.")
        #expect(HazeCompute.verdict(band: .high, profiles: [.outdoorWorker]).forWhom == "For outdoor work")
        #expect(HazeCompute.actions(band: .elevated, profiles: [.outdoorWorker])[0].contains("breaks in the shade"))
        #expect(Profile.outdoorWorker.rawValue == "outdoor_worker")
    }

    @Test func profilesNormaliseAndForLabels() {
        #expect(Profile.normalise([]) == [.general])
        #expect(Profile.normalise([.general, .kids]) == [.kids])
        #expect(Profile.normalise([.exercising, .general]) == [.general, .exercising])
        #expect(Profile.forWhom([.general]) == "For you")
        #expect(Profile.forWhom([.general, .exercising]) == "For you + your workout")
        #expect(Profile.forWhom([.elderly, .exercising]) == "For older adults + your workout")
        #expect(Profile.forWhom([.kids, .elderly, .exercising]) == "For your household")
    }

    @Test func secondLineRules() {
        let up = Trend(delta: 25), down = Trend(delta: -25)
        let obs = HazeFormat.parseISO8601("2026-09-28T13:00:00+08:00")!
        #expect(HazeCompute.secondLine(band: .elevated, trend: nil, stale: true, observedAt: obs) == "Reading is from 1pm. It may not match the air now.")
        #expect(HazeCompute.secondLine(band: .elevated, trend: up) == "Getting worse. Check again in an hour.")
        #expect(HazeCompute.secondLine(band: .normal, trend: up) == "Rising quickly. Check again in an hour.")
        #expect(HazeCompute.secondLine(band: .high, trend: down) == "Getting better. Check again in an hour.")
        #expect(HazeCompute.secondLine(band: .normal, trend: down) == nil)
        #expect(HazeCompute.easingPeak(Self.h([90, 140, 130, 120])) == Self.h([0, 0])[1].time)
        #expect(HazeCompute.secondLine(band: .elevated, trend: Trend(delta: -10), history: Self.h([90, 140, 130, 120])) == "Easing since 11am.")
    }

    // MARK: Actions

    @Test func actionsFilteredByProfile() {
        #expect(HazeCompute.actions(band: .normal).isEmpty)
        #expect(HazeCompute.actions(band: .elevated) == ["Haze isn't always easy to see. Check here before a long run."])
        #expect(HazeCompute.actions(band: .elevated, profiles: [.heartLung])[0] == "Asthma or COPD? Keep your inhaler with you.")
        #expect(HazeCompute.actions(band: .elevated, profiles: [.kids]) == [
            "Swap running games for calm play for now.",
            "At home? Close the windows. Use a fan or aircon to keep cool.",
        ])
        #expect(HazeCompute.actions(band: .high) == [
            "Close windows. Use aircon or a fan to keep cool.",
            "Run a purifier in the room you're in, if you have one.",
            "Move exercise indoors, or try later.",
        ])
        for b in [Band.elevated, .high, .veryHigh] {
            for p: [Profile] in [[.general], [.kids], [.heartLung], [.pregnant, .kids], [.exercising]] {
                let list = HazeCompute.actions(band: b, profiles: p, max: 10)
                #expect(!list.isEmpty)
                #expect(!list[0].contains("mask") && !list[0].contains("N95"))
                if p.contains(.kids) {
                    #expect(!list.contains { $0.contains("An N95 mask helps") || $0.contains("Wear an N95") })
                }
            }
        }
        #expect(HazeCompute.actions(band: .high, profiles: [.kids], max: 10).contains("N95 masks aren't made for children. Keeping kids indoors works better."))
        #expect(HazeCompute.actions(band: .high, profiles: [.pregnant], max: 10).last!.hasPrefix("Pregnant? Wear an N95 only for short periods"))
        let vh = HazeCompute.actions(band: .veryHigh)
        #expect(vh.count == 3)
        #expect(vh.last == "Feeling unwell? See a doctor. Chest pain or can't breathe: call 995.")
        #expect(HazeCompute.actions(band: .veryHigh, profiles: [.general], max: 10).contains("Check on older family and neighbours."))
    }

    @Test func calmLineAfterEpisode() {
        #expect(HazeCompute.calmLine(history: Self.h([20, 22])) == "Enjoy the fresh air.")
        #expect(HazeCompute.calmLine(history: Self.h([80, 50, 40])) == "Air's cleared. Good time to open the windows.")
        #expect(HazeCompute.calmLine(history: Self.h([80, 50, 40, 30, 30, 30])) == "Enjoy the fresh air.")
    }

    @Test func bandAnchorReplacesTypicalMultiple() {
        #expect(HazeCompute.bandAnchor(.elevated) == "Elevated band (56–150). High starts at 151.")
        #expect(HazeCompute.bandAnchor(.normal) == "Normal is up to 55.")
        #expect(HazeCompute.typicalText() == "A usual clear day in Singapore is around 20.")
    }

    // MARK: Uncertainty & provenance

    @Test func uncertainty() {
        #expect(Uncertainty(snapshot: Self.snap(.region("south")), point: nil).approx == false)
        let p1 = (lat: 1.345, lon: 103.8) // central (105) and south (105) agree, both close
        let u1 = Uncertainty(snapshot: Self.snap(.gps(lat: p1.lat, lon: p1.lon)), point: p1)
        #expect(u1.approx && u1.range == nil)
        let p2 = (lat: 1.395, lon: 103.82) // north (49) vs central (105) differ by 56
        let g2 = Self.snap(.gps(lat: p2.lat, lon: p2.lon))
        let u2 = Uncertainty(snapshot: g2, point: p2)
        #expect(u2.range == 49...105)
        #expect(u2.text == "Nearby stations read 49–105.")
        #expect(u2.a11y == "about \(g2.pm25), nearby stations read 49 to 105")
        #expect(u2.format(g2.pm25) == "~\(g2.pm25)")
        let east = (lat: 1.35735, lon: 103.94)
        #expect(Uncertainty(snapshot: Self.snap(.gps(lat: east.lat, lon: east.lon)), point: east).approx == false)
        var v = Self.latest; v["south"] = 135 // exactly 30 apart is not "more than 30"
        #expect(Uncertainty(snapshot: Self.snap(v, .gps(lat: p1.lat, lon: p1.lon)), point: p1).range == nil)
        var off = Self.latest; off["south"] = -1
        #expect(Uncertainty(snapshot: Self.snap(off, .region("south")), point: nil).range == 49...117)
    }

    @Test func provenanceLines() {
        let s = Self.snap(.region("west"))
        let pr = Provenance(snapshot: s, point: nil, now: HazeFormat.parseISO8601("2026-09-28T16:47:00+08:00")!)
        #expect(pr.full == "NEA West station · measured 4pm · 47 min ago")
        #expect(pr.detail == "Measured 4pm · posted by NEA 4:30pm")
        #expect(Provenance(snapshot: s, point: nil, now: HazeFormat.parseISO8601("2026-09-28T16:03:00+08:00")!).age == "just now")
        #expect(Provenance(snapshot: s, point: nil, now: HazeFormat.parseISO8601("2026-09-28T17:10:00+08:00")!).age == "1 h 10 min ago")
        let p = (lat: 1.33, lon: 103.72)
        #expect(Provenance(snapshot: Self.snap(.gps(lat: p.lat, lon: p.lon)), point: p, now: Self.now).text
            == "Near you · West station 3.8 km · measured 4pm")
        #expect(Provenance(snapshot: Self.snap(.gps(lat: p.lat, lon: p.lon)), point: p, placeName: "Jurong West", now: Self.now).text
            == "Jurong West · West station 3.8 km · measured 4pm")
        #expect(Provenance(snapshot: Self.snap(.island), point: nil, now: Self.now).text == "Singapore (island average) · measured 4pm")
        let e = (lat: 1.35735, lon: 103.94)
        #expect(Provenance(snapshot: Self.snap(.gps(lat: e.lat, lon: e.lon)), point: e, now: Self.now).text
            == "Near you · East station 0.0 km · measured 4pm")
        var w = Self.latest; w["west"] = -1
        #expect(Provenance(snapshot: Self.snap(w, .gps(lat: p.lat, lon: p.lon)), point: p, now: Self.now).note
            == "West station is offline. Using nearby stations.")
        var so = Self.latest; so["south"] = -1
        #expect(Provenance(snapshot: Self.snap(so, .region("south")), point: nil, now: Self.now).text
            == "South station is offline. Showing the average of NEA's other stations.")
    }

    // MARK: Trend words

    @Test func trendWords() {
        #expect(HazeCompute.trendWords(history: Self.h([79, 103, 117])) == "Rising fast: up 38 in 2 hours")
        #expect(HazeCompute.trendWords(history: Self.h([100, 108])) == "Rising: up 8 in the last hour")
        #expect(HazeCompute.trendWords(history: Self.h([100, 130])) == "Rising fast: up 30 in the last hour")
        #expect(HazeCompute.trendWords(history: Self.h([100, 90])) == "Easing: down 10 in the last hour")
        #expect(HazeCompute.trendWords(history: Self.h([130, 100])) == "Clearing fast: down 30 in the last hour")
        #expect(HazeCompute.trendWords(history: Self.h([100, 102])) == "Steady over the last hour")
        #expect(HazeCompute.trendWords(history: Self.h([100])) == "Trend not available yet")
        #expect(HazeCompute.trendWord(history: Self.h([100, 125])) == .risingFast)
        #expect(HazeCompute.trendWord(history: Self.h([100])) == nil)
    }

    @Test func accessibilityAndOfficialLabels() {
        var s = Self.snap(.region("south"))
        s.history = [HistoryPoint(time: Self.t16.addingTimeInterval(-3600), pm25: 106), HistoryPoint(time: Self.t16, pm25: 105)]
        #expect(HazeCompute.headlineLabel(s) == "OK to be out. Go easy on hard exercise. For you. PM2.5 105, Elevated, steady.")
        #expect(HazeCompute.accessibleLabel(s) == "PM2.5 105, Elevated, steady, measured 4pm")
        #expect(HazeCopy.officialPsiLabel(84) == "NEA 24-hr PSI: 84 (Moderate)")
        #expect(HazeCopy.officialPsiLabel(nil) == "NEA 24-hr PSI: not available right now")
        s.officialPsi24h = 84
        #expect(HazeCompute.shareText(s) == "Air in the South right now: Elevated (PM2.5 105), steady. NEA 24-hr PSI: 84. Data: NEA via data.gov.sg. hazenow.sg")
    }

    @Test func noInstantPsiOrLaggingInUserCopy() {
        let s = Snapshot.sample
        let i = HazeInsight(snapshot: s, location: .region("central"), profiles: [.general], now: Self.now)
        let all = [i.verdict.headline, i.verdict.short, i.verdict.secondLine ?? "", i.trendWords, i.anchor, i.provenance.full,
                   HazeCompute.shareText(s), HazeCopy.officialPsiLabel(81), HazeCopy.whyTwoNumbers] + i.actions
        for text in all {
            #expect(!text.contains("Instant PSI"))
            #expect(!text.lowercased().contains("lagging"))
            #expect(!text.contains("!"))
        }
    }
}

@Suite("Band alerts (COPY §11)")
struct AlertTests {
    static func snap(_ values: [Int], band: Band? = nil, region: String = "west") -> Snapshot {
        var s = Snapshot.sample
        s.history = ExperienceTests.h(values)
        s.pm25 = values.last!
        s.band = band ?? HazeCompute.band(pm25: values.last!)
        s.locationMode = .region
        s.nearestRegion = region
        s.stale = false
        return s
    }

    static func at(_ hm: String) -> Date { HazeFormat.parseISO8601("2026-09-28T\(hm):00+08:00")! }

    @Test func hysteresis() {
        #expect(BandAlerts.confirmedBand(previous: .normal, recent: [50, 58]) == .normal)
        #expect(BandAlerts.confirmedBand(previous: .normal, recent: [57, 58]) == .elevated)
        #expect(BandAlerts.confirmedBand(previous: .normal, recent: [40, 65]) == .elevated)
        #expect(BandAlerts.confirmedBand(previous: .elevated, recent: [60, 50]) == .elevated)
        #expect(BandAlerts.confirmedBand(previous: .elevated, recent: [60, 45]) == .normal)
    }

    @Test func elevatedIsOptInForGeneralOnly() {
        let s = Self.snap([90, 105])
        let general = BandAlerts.evaluate(state: AlertState(confirmedBand: .normal), snapshot: s, profiles: [.general], now: Self.at("16:40"))
        #expect(general.1 == nil)
        #expect(general.0.confirmedBand == .elevated)
        let kids = BandAlerts.evaluate(state: AlertState(confirmedBand: .normal), snapshot: s, profiles: [.kids], now: Self.at("16:40"))
        #expect(kids.1?.title == "Haze rising in the West")
        #expect(kids.1?.body == "Now Elevated (PM2.5 105). Calm play outside is OK. Skip running games for now.")
        let optIn = BandAlerts.evaluate(state: AlertState(confirmedBand: .normal), snapshot: s, profiles: [.general],
                                        prefs: AlertPreferences(elevatedForGeneral: true), now: Self.at("16:40"))
        #expect(optIn.1?.body == "Now Elevated (PM2.5 105). OK to be out. Go easy on hard exercise.")
    }

    @Test func highCopyAndDailyCap() {
        var state = AlertState(confirmedBand: .elevated)
        var sent = 0
        for i in 0..<4 {
            state.confirmedBand = i.isMultiple(of: 2) ? .elevated : .normal
            let r = BandAlerts.evaluate(state: state, snapshot: Self.snap([170, 172]), profiles: [.kids], now: Self.at("16:40"))
            state = r.0
            if let a = r.1 {
                sent += 1
                #expect(a.title == "Haze now High in the West")
                #expect(a.body == "PM2.5 172. Indoor play for now. Keep trips out short. Close windows and keep cool with aircon or a fan.")
            }
        }
        #expect(sent == 3)
        // The all-clear always gets through.
        let clear = BandAlerts.evaluate(state: state, snapshot: Self.snap([30, 25]), profiles: [.kids], now: Self.at("17:40"))
        #expect(clear.1?.kind == .allClear)
        #expect(clear.1?.title == "All clear in the West")
        #expect(clear.1?.body == "Air's back to Normal (PM2.5 25). Fine for outdoor play again.")
    }

    @Test func quietHoursThenMorningCatchUp() {
        let night = BandAlerts.evaluate(state: AlertState(confirmedBand: .normal), snapshot: Self.snap([170, 172]),
                                        profiles: [.general], now: Self.at("23:00"))
        #expect(night.1 == nil)
        #expect(night.0.quietPeak == .high)
        let morning = BandAlerts.evaluate(state: night.0, snapshot: Self.snap([100, 98]), profiles: [.general],
                                          now: HazeFormat.parseISO8601("2026-09-29T07:05:00+08:00")!)
        #expect(morning.1?.title == "Overnight air update")
        #expect(morning.1?.body == "The haze reached High overnight. Now: Elevated, PM2.5 98, steady. OK to be out. Go easy on hard exercise.")
        #expect(morning.0.quietPeak == nil)
        #expect(BandAlerts.isQuietHour(Self.at("22:00")) && BandAlerts.isQuietHour(Self.at("03:00")))
        #expect(!BandAlerts.isQuietHour(Self.at("07:00")))
    }

    @Test func firstRunAndStaleNeverAlert() {
        #expect(BandAlerts.evaluate(state: AlertState(), snapshot: Self.snap([170, 172]), profiles: [.general]).1 == nil)
        var s = Self.snap([170, 172]); s.stale = true
        #expect(BandAlerts.evaluate(state: AlertState(confirmedBand: .normal), snapshot: s, profiles: [.general]).1 == nil)
    }
}
