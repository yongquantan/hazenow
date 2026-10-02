import Foundation
import Testing
@testable import HazeKit

// Ports of packages/core/test/headlines.test.ts and timeouts.test.ts.

private let NOW = SeaGoldenTests.now
private let PROFILES: [[Profile]] = [[.general], [.kids], [.elderly], [.exercising], [.outdoorWorker], [.kids, .elderly]]
private let FORBIDDEN = [SeaVerdicts.noOfficial.headline, SeaVerdicts.noScale.headline]

/// Every place with a recorded set, built as the app builds it.
private func allSnapshots() throws -> [(name: String, s: CountrySnapshot)] {
    var out: [(String, CountrySnapshot)] = []
    for cc in ["th", "my", "id", "vn", "ph", "la", "kh"] {
        let set = try SeaGoldenTests.preview(cc)
        for p in SeaPlaces.all where p.country.rawValue == cc.uppercased() && (p.status == .liveDirect || p.status == .needsProxy) {
            if let s = try? SeaBuild.snapshot(set, query: SeaPlaces.query(p), now: NOW) { out.append((p.name, s)) }
        }
    }
    return out
}

@Suite("Headlines (SPEC principle 1, COPY §10/§20)")
struct SeaHeadlineTests {
    @Test func noHeadlineForAnyPlaceOrProfileIsACaveat() throws {
        let snaps = try allSnapshots()
        #expect(snaps.count > 50)
        for (name, s) in snaps {
            for p in PROFILES {
                let v = SeaVerdicts.verdict(s, profiles: p)
                #expect(!FORBIDDEN.contains(v.headline), "\(name)")
                #expect(!v.headline.contains("isn't responding"), "\(name)")
            }
        }
    }

    @Test func aSnapshotWithNoNumberStillDoesntUseThem() throws {
        var empty = try #require(try allSnapshots().first).s
        empty.pm25 = nil; empty.band = nil; empty.level = nil; empty.localBand = nil
        empty.bandBasis = "none"; empty.official = nil; empty.pm25Kind = nil; empty.bandFromEstimate = false; empty.whoMultiple = nil
        for cc in [CountryCode.TH, .LA] {
            empty.country = cc
            let v = SeaVerdicts.verdict(empty)
            #expect(!FORBIDDEN.contains(v.headline))
            #expect(v.headline == SeaVerdicts.noReading.headline)
        }
    }

    @Test func theCaveatsAppearOnlyAsTheLineUnderTheNumber() throws {
        let subs = try allSnapshots().map { SeaDisplay.numberSub($0.s) }
        #expect(subs.contains { $0.hasPrefix("No official reading near here ·") }) // Pai
        #expect(subs.contains { $0.hasPrefix("There's no official air-quality scale here ·") }) // Vientiane, Siem Reap
    }

    @Test func everyEstimateHeadlineIsEstimatePlusThatCategorysVerdict() throws {
        var n = 0
        for (name, s) in try allSnapshots() where s.bandFromEstimate {
            n += 1
            #expect(s.pm25Kind == "crowd_estimate")
            let b = try #require(SeaScales.classifyPm25(s.localBand!.scaleId, Double(s.pm25!)))
            #expect(s.localBand!.key == b.key, "\(name)")
            for p in PROFILES {
                let v = SeaVerdicts.verdict(s, profiles: p)
                #expect(v.estimate)
                var plainS = s
                plainS.bandFromEstimate = false
                let plain = SeaVerdicts.verdict(plainS, profiles: p)
                #expect(v.headline == "Estimate: " + plain.headline.prefix(1).lowercased() + plain.headline.dropFirst(), "\(name)")
                #expect(v.short.hasPrefix("Est. "))
                if s.localBand!.scaleId == "th_aqi" {
                    #expect(SeaVerdicts.thaiHeadlines(key: b.key).contains(plain.headline), "\(name)")
                } else {
                    #expect(plain.headline == SeaVerdicts.categoryHeadline(scaleId: s.localBand!.scaleId, key: b.key, profiles: p), "\(name)")
                }
            }
            let d = SeaDisplay.display(s)
            #expect(d.chip?.estimate == true)
            #expect(d.kindLabel == "Community sensors · estimate")
        }
        #expect(n >= 10)
    }

    @Test func paiGetsPCDsCategoryTheEstimateTagAndBothCaveatsUnderneath() throws {
        let pai = try #require(try allSnapshots().first { $0.name == "Pai" }).s
        #expect(pai.localBand?.scaleId == "th_aqi")
        #expect(SeaVerdicts.verdict(pai).headline.hasPrefix("Estimate: fine"))
        let d = SeaDisplay.display(pai)
        #expect(d.numberSub == "No official reading near here · community sensors estimate")
        #expect(d.chip?.basisNote == "PCD category, applied to the community-sensor estimate")
        #expect(d.notices.first?.contains("no official station within 25 km") == true)
    }

    @Test func anOfficialNumberIsNeverPrefixed() throws {
        for (_, s) in try allSnapshots() where s.pm25Kind == "official_1h" {
            #expect(!SeaVerdicts.verdict(s).headline.hasPrefix("Estimate: "))
        }
    }
}

@Suite("No national scale: WHO 2021 guidance verdicts")
struct SeaWhoTests {
    @Test func fourBandsWithTheSpecifiedBoundaries() {
        let at = { (v: Double) in SeaVerdicts.whoVerdictBand(v).en }
        #expect(at(0) == "Likely fine to be out.")
        #expect(at(24.9) == "Likely fine to be out.")
        #expect(at(25) == "Likely OK. Sensitive people, go easy.")
        #expect(at(49.9) == "Likely OK. Sensitive people, go easy.")
        #expect(at(50) == "Go easy outdoors for now.")
        #expect(at(99.9) == "Go easy outdoors for now.")
        #expect(at(100) == "Limit time outside for now.")
        #expect(at(800) == "Limit time outside for now.")
        #expect(SeaVerdicts.whoBands.map(\.sev) == [0, 1, 2, 3])
        #expect(SeaVerdicts.whoBands.map(\.short) == ["Likely fine", "Likely OK", "Go easy outdoors", "Limit time outside"])
    }

    @Test func siemReapAndVientianeGetTheWhoVerdictChipAndLine() throws {
        let snaps = try allSnapshots()
        for name in ["Siem Reap", "Vientiane", "Luang Prabang"] {
            let s = try #require(snaps.first { $0.name == name }).s
            #expect(SeaScales.chipScale(s.country) == nil)
            let v = SeaVerdicts.verdict(s)
            #expect(v.whoBased)
            let w = SeaVerdicts.whoVerdictBand(Double(s.pm25!))
            #expect(v.headline == w.en)
            let d = SeaDisplay.display(s)
            #expect(d.chip?.en == "WHO guide: \(w.word)")
            #expect(d.chip?.estimate == true)
            #expect(d.whoLine?.contains("× the WHO daily guideline") == true)
            #expect(d.numberSub == "There's no official air-quality scale here · community sensors estimate")
        }
    }
}

// MARK: - Timeouts and fallbacks

/// Fake upstreams: Air4Thai (station list, history) and the proxy, each answering, failing or hanging.
private enum Mode: Sendable { case ok, reject, hang }

private struct FakeUpstream: Sendable {
    var air4thai: Mode = .ok
    var history: Mode = .ok
    var proxy: Mode = .ok

    static let aqi = try! SeaGoldenTests.fx("th-aqi")
    static let hist = try! SeaGoldenTests.fx("th-history")
    static let crowd: Data = {
        var set = try! SeaGoldenTests.preview("th")
        set.observations = set.observations.filter { $0.grade == "lowcost" }
        set.attribution = Array(set.attribution.dropFirst())
        return try! JSONEncoder().encode(set)
    }()

    var fetch: FetchFunction {
        let me = self
        return { url in
            let u = url.absoluteString
            let mode = u.contains("getAQI_JSON") ? me.air4thai : u.contains("getHistoryData") ? me.history : me.proxy
            switch mode {
            case .reject: throw URLError(.serverCertificateUntrusted)
            case .hang:
                // Never answers, and ignores cancellation (the worst case).
                await withCheckedContinuation { (_: CheckedContinuation<Void, Never>) in }
                throw URLError(.timedOut)
            case .ok:
                return FetchResponse(status: 200, data: u.contains("getAQI_JSON") ? Self.aqi : u.contains("getHistoryData") ? Self.hist : Self.crowd)
            }
        }
    }
}

private let PROXY = "https://edge.example"
private let bangkok = SeaPlaces.find("bangkok", country: .TH)!

private func th(_ up: FakeUpstream, proxy: String? = PROXY, timeout: TimeInterval = 0.05) async throws -> CountrySnapshot {
    try await SeaAdapters.snapshot(.TH, query: SeaPlaces.query(bangkok),
                                   ctx: SeaContext(fetch: up.fetch, now: NOW, proxyBase: proxy, timeout: timeout))
}

@Suite("Upstream timeouts and fallbacks")
struct SeaTimeoutTests {
    @Test func defaultIsAboutEightSeconds() { #expect(upstreamTimeout == 8) }

    @Test func aHangingOperationEvenOneIgnoringCancellationTimesOutQuickly() async {
        let t0 = Date()
        await #expect(throws: UpstreamTimeoutError.self) {
            try await withUpstreamTimeout(0.03, url: "https://x.example/") {
                await withCheckedContinuation { (_: CheckedContinuation<Void, Never>) in }
                return 1
            }
        }
        #expect(Date().timeIntervalSince(t0) < 1)
    }

    @Test func answersAndErrorsPassStraightThrough() async throws {
        #expect(try await withUpstreamTimeout(1) { 42 } == 42)
        await #expect(throws: URLError.self) { try await withUpstreamTimeout(1) { () async throws -> Int in throw URLError(.badURL) } }
    }

    @Test func aCallersOwnCancellationStillWins() async {
        let task = Task { try await withUpstreamTimeout(5) { try await Task.sleep(nanoseconds: 3_000_000_000); return 1 } }
        task.cancel()
        let t0 = Date()
        let r = await task.result
        #expect(Date().timeIntervalSince(t0) < 1)
        #expect(throws: CancellationError.self) { try r.get() }
    }

    @Test(arguments: [Mode.reject, Mode.hang])
    fileprivate func air4ThaiFailsSoBangkokFallsBackToLabelledCommunitySensors(_ mode: Mode) async throws {
        let t0 = Date()
        let s = try await th(FakeUpstream(air4thai: mode))
        #expect(Date().timeIntervalSince(t0) < 2)
        #expect(s.pm25Kind == "crowd_estimate")
        #expect(s.notes.contains("official_unavailable"))
        #expect(s.stations.allSatisfy { $0.grade == "lowcost" && $0.distanceKm! <= 25 })
        #expect(s.nearest!.distanceKm! <= 10)
        #expect(SeaDisplay.notices(s).isEmpty) // they exist, they just aren't answering
        let d = SeaDisplay.display(s, placeName: "Bangkok")
        #expect(d.kindLabel == "Community sensors · estimate")
        #expect(d.numberSub == "Thailand's official data isn't responding right now · community sensors estimate")
        #expect(s.bandFromEstimate)
        #expect(SeaVerdicts.verdict(s).headline.hasPrefix("Estimate: "))
        #expect(d.chip?.estimate == true)
    }

    @Test func noCommunitySensorInRangeThrowsOfficialUnavailableNeverAFarSensor() async throws {
        let k = try #require(SeaPlaces.find("kanchanaburi", country: .TH))
        do {
            _ = try await SeaAdapters.snapshot(.TH, query: SeaPlaces.query(k),
                                               ctx: SeaContext(fetch: FakeUpstream(air4thai: .reject).fetch, now: NOW, proxyBase: PROXY, timeout: 0.05))
            Issue.record("expected OfficialUnavailableError")
        } catch let e as OfficialUnavailableError {
            #expect(e.source == "PCD Air4Thai")
        }
    }

    @Test func noProxyOrTheProxyAlsoHangingThrowsWithinTheTimeout() async {
        for (up, proxy) in [(FakeUpstream(air4thai: .hang), nil as String?), (FakeUpstream(air4thai: .reject, proxy: .hang), PROXY)] {
            let t0 = Date()
            await #expect(throws: OfficialUnavailableError.self) { _ = try await th(up, proxy: proxy) }
            #expect(Date().timeIntervalSince(t0) < 2)
        }
    }

    @Test func historyHangsSensorsFillInAndTheThaiAqiRowStays() async throws {
        let s = try await th(FakeUpstream(history: .hang))
        #expect(s.pm25Kind == "crowd_estimate")
        #expect(s.notes.contains("official_unavailable"))
        #expect(s.official?.agency == "PCD")
    }

    @Test func air4ThaiHealthyOfficialWinsInBangkok() async throws {
        let s = try await th(FakeUpstream(), timeout: 5)
        #expect(s.pm25Kind == "official_1h")
        #expect(!s.notes.contains("official_unavailable"))
        #expect(SeaDisplay.display(s).kindLabel == "Official reading")
    }

    @Test func aProxiedSetFlaggedOfficialUnavailable() throws {
        var my = try SeaGoldenTests.preview("my")
        my.observations = my.observations.filter { $0.grade == "lowcost" }
        my.officialUnavailable = "DOE Malaysia"
        let kl = try SeaBuild.snapshot(my, query: SeaPlaces.query(SeaPlaces.find("kuala-lumpur", country: .MY)!), now: NOW)
        #expect(kl.pm25Kind == "crowd_estimate")
        #expect(SeaDisplay.numberSub(kl) == "Malaysia's official data isn't responding right now · community sensors estimate")
        #expect(SeaVerdicts.verdict(kl).headline.hasPrefix("Estimate: "))
        #expect(throws: OfficialUnavailableError.self) {
            try SeaBuild.snapshot(my, query: SeaPlaces.query(SeaPlaces.find("ipoh", country: .MY)!), now: NOW)
        }
    }

    @Test func theProxyItselfHangingGivesUpWithinTheTimeout() async {
        let t0 = Date()
        await #expect(throws: UpstreamTimeoutError.self) {
            _ = try await SeaAdapters.proxiedObservations(.MY, SeaContext(fetch: FakeUpstream(proxy: .hang).fetch, now: NOW, proxyBase: PROXY, timeout: 0.05))
        }
        #expect(Date().timeIntervalSince(t0) < 1)
    }

    @Test func noProxyConfiguredIsAPlainProxyErrorAndThePlaceholderCountsAsUnset() async {
        #expect(HazeEdge.usable(HazeEdge.placeholder) == nil)
        #expect(HazeEdge.usable("") == nil)
        #expect(HazeEdge.usable("https://edge.example/") == "https://edge.example")
        #expect(!SeaAdapters.available(.MY, proxyBase: nil))
        #expect(SeaAdapters.available(.TH, proxyBase: nil))
        await #expect(throws: ProxyError.self) { _ = try await SeaAdapters.proxiedObservations(.MY, SeaContext(proxyBase: nil)) }
    }

    @Test func singaporeNEAHangingGivesAQuickTimeoutNotA30sWait() async {
        let config = URLSessionConfiguration.ephemeral
        config.protocolClasses = [HangingProtocol.self]
        let client = HazeClient(session: URLSession(configuration: config), timeout: 0.05)
        let t0 = Date()
        await #expect(throws: HazeClientError.self) { _ = try await client.fetch(now: Date(timeIntervalSince1970: NOW)) }
        #expect(Date().timeIntervalSince(t0) < 3)
    }
}

@Suite("Stale cache: what the client shows when the live fetch fails")
struct SeaCacheTests {
    @Test func aCachedSnapshotIsRejudgedForStaleness() throws {
        let cached = try SeaBuild.snapshot(SeaGoldenTests.preview("th"), query: SeaPlaces.query(bangkok), now: NOW)
        #expect(!cached.stale)
        #expect(!SeaBuild.cached(cached, now: NOW + 30 * 60).stale)
        #expect(SeaBuild.cached(cached, now: NOW + 3 * 3600).stale)
        #expect(SeaBuild.cached(cached, now: NOW).pm25 == cached.pm25)
    }

    @Test func copyTheCalmCantReachStateAndTheCachedLine() throws {
        let cached = try SeaBuild.snapshot(SeaGoldenTests.preview("th"), query: SeaPlaces.query(bangkok), now: NOW)
        let none = SeaDisplay.officialDownCopy(.TH)
        #expect(none.title == "Can't reach Thailand's official data right now")
        #expect(none.line == "We'll try again in a few minutes.")
        #expect(none.cachedLine == nil)
        let c = SeaDisplay.officialDownCopy(.TH, cachedObservedAt: cached.observedAt, now: SeaTime.parse(cached.observedAt)! + 95 * 60, viewerOffsetHours: 7)
        #expect(c.cachedLine == "Can't reach Thailand's official data right now. Showing the last reading we got, from 5pm (1 hr ago).")
        #expect(SeaDisplay.officialDownCopy(.PH).title == "Can't reach the Philippines' official data right now")
    }

    @Test func snapshotsRoundTripThroughTheCache() throws {
        let s = try SeaBuild.snapshot(SeaGoldenTests.preview("th"), query: SeaPlaces.query(bangkok), now: NOW)
        let back = try JSONDecoder().decode(CountrySnapshot.self, from: JSONEncoder().encode(s))
        #expect(back == s)
    }
}

/// A URLProtocol that never answers (for the SG timeout test).
final class HangingProtocol: URLProtocol, @unchecked Sendable {
    override class func canInit(with request: URLRequest) -> Bool { true }
    override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }
    override func startLoading() {}
    override func stopLoading() {}
}
