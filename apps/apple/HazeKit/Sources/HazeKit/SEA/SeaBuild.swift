import Foundation

// ObservationSet + location → CountrySnapshot. Pure and deterministic: a line-by-line port of
// packages/core/src/countries/build.ts (with quality.ts and the crowd usability rule). The location never leaves
// the device. Golden outputs from the TS (Tests/…/sea/golden-places.json) pin the two together.

public enum SeaBuild {
    public static let officialPreferredKm = 25.0
    public static let officialMaxKm = 60.0
    public static let crowdRadiusKm = 10.0
    public static let snapKm = 0.5
    public static let hotspotRadiusKm = 100.0
    static let hour = 3600.0
    /// Same as SG: 2 h 15 min.
    public static let staleAfter: TimeInterval = (2 * 60 + 15) * 60

    // MARK: Quality screens (quality.ts)

    public static let plausibleMax = 1000.0
    public static let maxJump1h = 400.0
    public static let offlineAfter: TimeInterval = 24 * 3600

    static func outOfRange(_ v: Double?) -> Bool {
        guard let v else { return false }
        return !v.isFinite || v < 0 || v > plausibleMax
    }

    /// Why a station's reading looks wrong ("out_of_range" / "jump"), or nil.
    public static func plausibility(_ o: SeaObservation) -> String? {
        if outOfRange(o.pm25_1h) || outOfRange(o.pm25_now) || outOfRange(o.pm25_24h) { return "out_of_range" }
        if let v = o.pm25_1h, let hist = o.history, !hist.isEmpty, let end = SeaTime.parse(o.periodEnd) {
            let prev = hist.first { h in SeaTime.parse(h.time).map { abs($0 - (end - hour)) < 60 } ?? false }?.pm25
            if let prev, !outOfRange(prev), v - prev > maxJump1h { return "jump" }
        }
        return nil
    }

    public static func isOffline(_ o: SeaObservation, now: TimeInterval) -> Bool {
        guard let t = SeaTime.parse(o.periodEnd) else { return true }
        return now - t > offlineAfter
    }

    struct Screened { var kept: [SeaObservation] = []; var implausible: [SeaObservation] = []; var offline: [SeaObservation] = [] }

    static func screen(_ obs: [SeaObservation], now: TimeInterval) -> Screened {
        var out = Screened()
        for o in obs {
            if isOffline(o, now: now) { out.offline.append(o); continue }
            if plausibility(o) != nil { out.implausible.append(o); continue }
            var k = o
            if let h = o.history, h.contains(where: { outOfRange($0.pm25) || outOfRange($0.pm25Avg24h) }) {
                k.history = h.map { x in
                    ObservationHour(time: x.time, pm25: outOfRange(x.pm25) ? nil : x.pm25,
                                    pm25Avg24h: outOfRange(x.pm25Avg24h) ? nil : x.pm25Avg24h)
                }
            }
            out.kept.append(k)
        }
        return out
    }

    /// crowd.ts `usableCrowd`.
    public static func usableCrowd(_ o: SeaObservation) -> Bool {
        o.grade == "lowcost" && (o.qc == nil || o.qc == "ok" || o.qc == "uncalibrated")
    }

    // MARK: Builder

    struct Ranked { var o: SeaObservation; var d: Double }

    static func valid(_ v: Double?) -> Double? {
        guard let v, v.isFinite, v >= 0 else { return nil }
        return v
    }

    static func valueOf(_ o: SeaObservation) -> Double? { valid(o.pm25_1h ?? o.pm25_now) }

    static func t(_ iso: String) -> TimeInterval { SeaTime.parse(iso) ?? .nan }

    static func summary(_ r: Ranked) -> StationSummary {
        StationSummary(stationId: r.o.stationId, name: r.o.name, distanceKm: jsRound(r.d * 10) / 10, grade: r.o.grade,
                       pm25_1h: r.o.pm25_1h ?? r.o.pm25_now, official: r.o.official, periodEnd: r.o.periodEnd)
    }

    static func valueAt(_ o: SeaObservation, _ time: TimeInterval) -> Double? {
        if let h = o.history?.first(where: { t($0.time) == time }) { return valid(h.pm25) }
        if t(o.periodEnd) == time { return valueOf(o) }
        return nil
    }

    static func idw(_ pts: [(v: Double, d: Double)]) -> Double {
        if pts[0].d < snapKm { return pts[0].v }
        var num = 0.0, den = 0.0
        for p in pts {
            let w = 1 / (p.d * p.d)
            num += w * p.v
            den += w
        }
        return num / den
    }

    static func rangeOf(_ pool: [(v: Double, d: Double)], _ estimate: Int) -> [Int]? {
        guard !pool.isEmpty else { return nil }
        let limit = pool[0].d * 1.5
        let vals = pool.enumerated().filter { $0.offset < 2 || $0.element.d <= limit }.map { HazeCompute.roundHalfUp($0.element.v) }
        let r = [min(vals.min() ?? estimate, estimate), max(vals.max() ?? estimate, estimate)]
        return r[0] == r[1] ? nil : r
    }

    static func sameOffset(_ time: TimeInterval, _ sample: String) -> String {
        guard sample.range(of: #"[+-]\d{2}:\d{2}$"#, options: .regularExpression) != nil, let off = SeaTime.offsetHours(sample)
        else { return SeaTime.toUtcIso(time) }
        return SeaTime.toIso(time, offsetHours: off)
    }

    static func hourKey(_ x: TimeInterval) -> TimeInterval { jsRound(x / hour) * hour }

    static func roundHalfUp(_ x: Double) -> Int { HazeCompute.roundHalfUp(x) }

    public static func snapshot(_ set: ObservationSet, query: CountryQuery = CountryQuery(),
                                now: TimeInterval = Date().timeIntervalSince1970) throws -> CountrySnapshot {
        let cc = set.country
        let meta = SeaRegistry.info(cc)
        var notes: [String] = []
        if set.officialUnavailable != nil { notes.append("official_unavailable") }
        let own = set.observations.filter { $0.country == cc }
        if own.count != set.observations.count { notes.append("other_country_dropped") }
        let screened = screen(own, now: now)
        let obs = screened.kept

        // Where are we?
        var point: LatLon
        var locationMode: LocationMode = .gps
        let pinned = query.station.flatMap { id in obs.first { $0.stationId == id } }
        if let lat = query.lat, let lon = query.lon, lat.isFinite, lon.isFinite {
            point = LatLon(lat: lat, lon: lon)
        } else if let pinned {
            point = LatLon(lat: pinned.lat, lon: pinned.lon)
            locationMode = .region
        } else {
            point = LatLon(lat: meta.defaultPlace.lat, lon: meta.defaultPlace.lon)
            locationMode = .region
            notes.append("default_place")
        }
        let dist = { (o: SeaObservation) in seaHaversineKm(point, LatLon(lat: o.lat, lon: o.lon)) }

        let nearestKept = obs.filter(\.isReference).map(dist).min() ?? .infinity
        if screened.offline.contains(where: { $0.isReference && dist($0) <= min(officialPreferredKm, nearestKept) }) { notes.append("offline_dropped") }
        if screened.implausible.contains(where: { dist($0) <= officialMaxKm }) { notes.append("implausible_dropped") }

        func ranked(_ list: [SeaObservation]) -> [Ranked] {
            list.map { Ranked(o: $0, d: dist($0)) }.sorted { a, b in a.d != b.d ? a.d < b.d : a.o.stationId < b.o.stationId }
        }
        let fresh = { (o: SeaObservation) in now - t(o.periodEnd) <= staleAfter }
        func preferFresh(_ list: [SeaObservation]) -> [SeaObservation] {
            let f = list.filter(fresh)
            if !f.isEmpty, f.count < list.count { notes.append("stale_stations_dropped") }
            return f.isEmpty ? list : f
        }

        let within = (query.withinKm ?? 0) > 0 ? query.withinKm! : .infinity
        func near(_ list: [SeaObservation]) -> [SeaObservation] { within == .infinity ? list : list.filter { dist($0) <= within } }
        if within != .infinity { notes.append("within_radius") }

        let official1h = ranked(preferFresh(near(obs.filter { $0.isReference && valid($0.pm25_1h) != nil })))
        let crowd = ranked(obs.filter { usableCrowd($0) && valueOf($0) != nil && fresh($0) }).filter { $0.d <= min(crowdRadiusKm, within) }

        // 2. Big number source.
        var kind: String?
        var pool: [Ranked] = []
        let n0 = official1h.first
        if let n0, n0.d <= officialPreferredKm { kind = "official_1h" }
        else if !crowd.isEmpty { kind = "crowd_estimate" }
        else if let n0, n0.d <= officialMaxKm {
            kind = "official_1h"
            notes.append("nearest_far")
        } else {
            notes.append(!official1h.isEmpty || obs.contains(where: \.isReference) ? "no_reading_nearby" : "no_official_1h")
        }
        if official1h.isEmpty, obs.contains(where: { $0.official != nil }) { notes.append("no_official_1h") }

        if kind == "official_1h", let n0 {
            let limit = max(n0.d * 1.5, snapKm)
            pool = Array(official1h.enumerated().filter { ($0.offset == 0 || $0.element.d <= limit) && $0.element.d <= officialMaxKm }.map(\.element).prefix(5))
            if let pinned, pinned.isReference, valid(pinned.pm25_1h) != nil { pool = [Ranked(o: pinned, d: 0)] }
        } else if kind == "crowd_estimate" {
            pool = Array(crowd.prefix(8))
            notes.append("crowd_only")
        }

        var pm25: Int?
        var observedAt: String
        var publishedAt: String
        var used: [(v: Double, d: Double, o: SeaObservation)] = []
        if kind == "official_1h" {
            let H = hourKey(t(pool[0].o.periodEnd))
            used = pool.compactMap { r in valueAt(r.o, H).map { (v: $0, d: r.d, o: r.o) } }
            if used.isEmpty { used = [(v: valueOf(pool[0].o)!, d: pool[0].d, o: pool[0].o)] }
            pm25 = roundHalfUp(idw(used.map { (v: $0.v, d: $0.d) }))
            observedAt = pool[0].o.periodEnd
            publishedAt = pool[0].o.publishedAt ?? observedAt
        } else if kind == "crowd_estimate" {
            used = pool.map { (v: valueOf($0.o)!, d: $0.d, o: $0.o) }
            pm25 = roundHalfUp(idw(used.map { (v: $0.v, d: $0.d) }))
            let newest = pool.dropFirst().reduce(pool[0]) { a, b in t(b.o.periodEnd) > t(a.o.periodEnd) ? b : a }
            observedAt = newest.o.periodEnd
            publishedAt = newest.o.publishedAt ?? observedAt
        } else {
            var anyR = ranked(preferFresh(near(obs))).first
            if anyR == nil { anyR = ranked(preferFresh(obs)).first }
            guard let any = anyR else {
                if let src = set.officialUnavailable { throw OfficialUnavailableError(country: cc, source: src) }
                throw NoCountryDataError(message: "No observations for \(cc.rawValue)")
            }
            observedAt = any.o.periodEnd
            publishedAt = any.o.publishedAt ?? observedAt
        }

        // 3. Official index row: nearest station publishing one, verbatim.
        let withIndex = ranked(preferFresh(near(obs.filter { $0.official != nil && $0.isReference })))
        var officialStation: Ranked?
        if let pinned, pinned.official != nil { officialStation = Ranked(o: pinned, d: 0) }
        else if let w0 = withIndex.first, w0.d <= officialMaxKm { officialStation = w0 }
        else if withIndex.first != nil { notes.append("official_far") }
        let official = officialStation?.o.official
        if kind == nil, officialStation == nil, let src = set.officialUnavailable { throw OfficialUnavailableError(country: cc, source: src) }
        if let os = officialStation, kind == nil {
            observedAt = os.o.periodEnd
            publishedAt = os.o.publishedAt ?? observedAt
        }
        let pm25_24h = officialStation?.o.pm25_24h ?? (kind == "official_1h" ? pool[0].o.pm25_24h : nil)

        // 4. Chip.
        var localBand: LocalBand?
        var bandBasis = "none"
        if let scaleId = SeaScales.chipScale(cc), let scale = SeaScales.scale(scaleId), scale.role == "chip" {
            if scale.basis == "pm25_1h", let pm25, let b = SeaScales.classifyPm25(scaleId, Double(pm25)) {
                localBand = SeaScales.toLocalBand(scaleId, b)
                bandBasis = "pm25_1h"
            }
            if localBand == nil, let official, official.scaleId == scaleId, let b = SeaScales.classifyIndex(scaleId, official.value) {
                localBand = SeaScales.toLocalBand(scaleId, b)
                bandBasis = "official_index"
            }
            // A community estimate with no official index to band it: the authority's category for the estimate.
            if localBand == nil, kind == "crowd_estimate", let pm25, let b = SeaScales.classifyPm25(scaleId, Double(pm25)) {
                localBand = SeaScales.toLocalBand(scaleId, b)
                bandBasis = "pm25_1h"
            }
        }
        let bandFromEstimate = localBand != nil && bandBasis == "pm25_1h" && kind == "crowd_estimate"
        let level = localBand?.level

        // History at the spot (same stations, same method), plus the authority's 24-h line where it exists.
        var history: [SeaHistoryPoint] = []
        if let kind {
            var times = Set<TimeInterval>()
            for r in pool { for h in r.o.history ?? [] { times.insert(hourKey(t(h.time))) } }
            let end = hourKey(t(observedAt))
            if kind == "official_1h" { times.insert(end) }
            let lineSrc = (officialStation?.o.history?.contains { $0.pm25Avg24h != nil } ?? false) ? officialStation!.o : pool[0].o
            for tt in times.filter({ $0 <= end && $0 > end - 24 * hour }).sorted() {
                let pts = pool.compactMap { r in valueAt(r.o, tt).map { (v: $0, d: r.d) } }
                if pts.isEmpty { continue }
                let v = (tt == end && pm25 != nil && kind == "official_1h") ? pm25! : roundHalfUp(idw(pts))
                let line = lineSrc.history?.first { hourKey(t($0.time)) == tt }?.pm25Avg24h
                history.append(SeaHistoryPoint(time: sameOffset(tt, observedAt), pm25: v, pm25Avg24h: line))
            }
            if kind == "crowd_estimate", let pm25, history.isEmpty { history.append(SeaHistoryPoint(time: observedAt, pm25: pm25, pm25Avg24h: nil)) }
        }
        let prev = history.first { t($0.time) == hourKey(t(observedAt)) - hour }
        let trend: Trend = {
            guard let pm25, let p = prev?.pm25 else { return Trend(delta: 0, direction: .steady) }
            return Trend(delta: pm25 - p, direction: HazeCompute.trendDirection(delta: pm25 - p))
        }()

        // Range (SPEC v1.7): exact when snapped/pinned official; always for crowd.
        var range: [Int]?
        if let pm25, !used.isEmpty {
            let sorted = used.enumerated().sorted { $0.element.d != $1.element.d ? $0.element.d < $1.element.d : $0.offset < $1.offset }.map(\.element)
            let exact = kind == "official_1h" && (sorted[0].d < snapKm || locationMode == .region)
            let far = sorted[0].d > 5
            let disagree = sorted.count > 1 && abs(sorted[0].v - sorted[1].v) > 30
            if !exact, kind == "crowd_estimate" || far || disagree { range = rangeOf(sorted.map { (v: $0.v, d: $0.d) }, pm25) }
        }

        let stationsRanked = Array(ranked(near(obs.filter { $0.isReference || usableCrowd($0) })).prefix(10))
        let nearestUsed: Ranked? = kind != nil ? pool[0] : (officialStation ?? stationsRanked.first)

        var hotspots: HotspotContext?
        if let hs = set.hotspots, let src = set.hotspotSource {
            let count = hs.filter { seaHaversineKm(point, $0) <= hotspotRadiusKm }.count
            hotspots = HotspotContext(count: count, radiusKm: hotspotRadiusKm, hours: 24, confidence: "high", source: src)
        }

        var usedAttr = Set(used.map(\.o.attributionId))
        if let os = officialStation { usedAttr.insert(os.o.attributionId) }
        if hotspots != nil { for a in set.attribution where a.text.hasPrefix("Hotspots") { usedAttr.insert(a.id) } }
        let attribution = set.attribution.filter { usedAttr.contains($0.id) }

        var seen = Set<String>()
        let dedupedNotes = notes.filter { seen.insert($0).inserted }
        return CountrySnapshot(
            pm25: pm25, band: SeaScales.levelBand(level), trend: trend, history: history,
            nearestRegion: nearestUsed?.o.stationId ?? "", locationMode: locationMode,
            observedAt: observedAt, publishedAt: publishedAt, stale: now - t(observedAt) > staleAfter,
            source: attribution.map { $0.text.replacingOccurrences(of: #"^(Data|Community sensors|Hotspots): "#, with: "", options: .regularExpression) }.joined(separator: " · "),
            country: cc, status: meta.status, level: level, localBand: localBand, bandBasis: bandBasis,
            bandFromEstimate: bandFromEstimate, official: official, pm25Kind: kind, pm25_24h: pm25_24h,
            nearest: nearestUsed.map(summary), stations: stationsRanked.map(summary), range: range,
            whoMultiple: SeaScales.whoMultiple(pm25), hotspots: hotspots, attribution: attribution, notes: dedupedNotes
        )
    }

    /// A cached snapshot re-judged for staleness at `now` (a reading cached an hour ago may be stale by now).
    public static func cached(_ s: CountrySnapshot, now: TimeInterval) -> CountrySnapshot {
        var c = s
        c.stale = now - t(s.observedAt) > staleAfter
        return c
    }
}

// MARK: - Borders (port of countries/borders.ts)

public enum SeaBorders {
    public static let snapDeg = 0.1

    struct Ring { var cc: CountryCode; var pts: [Double]; var minX, minY, maxX, maxY: Double }

    static let rings: [Ring] = {
        var out: [Ring] = []
        // Keep the TS object order (JSON object order is not preserved by Foundation): sort the same way TS
        // iterates, which is insertion order in borders-data.ts. Polygons don't overlap, so order only matters
        // for the coastal-snap tie, which is resolved by the strict "<" below exactly like the TS.
        for (key, list) in SeaTables.shared.borders.sorted(by: { $0.key < $1.key }) {
            guard let cc = CountryCode(rawValue: key) else { continue }
            for pts in list {
                var minX = Double.infinity, minY = Double.infinity, maxX = -Double.infinity, maxY = -Double.infinity
                var i = 0
                while i + 1 < pts.count {
                    minX = min(minX, pts[i]); maxX = max(maxX, pts[i])
                    minY = min(minY, pts[i + 1]); maxY = max(maxY, pts[i + 1])
                    i += 2
                }
                out.append(Ring(cc: cc, pts: pts, minX: minX, minY: minY, maxX: maxX, maxY: maxY))
            }
        }
        return out
    }()

    static func inside(_ x: Double, _ y: Double, _ p: [Double]) -> Bool {
        var c = false
        let n = p.count / 2
        var j = n - 1
        for i in 0..<n {
            let xi = p[2 * i], yi = p[2 * i + 1], xj = p[2 * j], yj = p[2 * j + 1]
            if (yi > y) != (yj > y), x < (xj - xi) * (y - yi) / (yj - yi) + xi { c.toggle() }
            j = i
        }
        return c
    }

    static func segDist(_ px: Double, _ py: Double, _ ax: Double, _ ay: Double, _ bx: Double, _ by: Double) -> Double {
        let dx = bx - ax, dy = by - ay
        let L = dx * dx + dy * dy
        let t = L == 0 ? 0 : max(0, min(1, ((px - ax) * dx + (py - ay) * dy) / L))
        return hypot(px - ax - t * dx, py - ay - t * dy)
    }

    /// Country for a point, or nil outside ASEAN + Timor-Leste (and beyond the coastal snap).
    public static func countryAt(lat: Double, lon: Double) -> CountryCode? {
        guard lat.isFinite, lon.isFinite else { return nil }
        for r in rings where !(lon < r.minX || lon > r.maxX || lat < r.minY || lat > r.maxY) {
            if inside(lon, lat, r.pts) { return r.cc }
        }
        for isl in SeaTables.shared.smallIslands {
            guard isl.count == 4, let cc = CountryCode(rawValue: isl[0].string) else { continue }
            if hypot(lat - isl[1].number, lon - isl[2].number) <= isl[3].number { return cc }
        }
        var best = snapDeg
        var bestCc: CountryCode?
        for r in rings where !(lon < r.minX - snapDeg || lon > r.maxX + snapDeg || lat < r.minY - snapDeg || lat > r.maxY + snapDeg) {
            let p = r.pts
            var i = 0
            while i + 3 < p.count {
                let d = segDist(lon, lat, p[i], p[i + 1], p[i + 2], p[i + 3])
                if d < best {
                    best = d
                    bestCc = r.cc
                }
                i += 2
            }
        }
        return bestCc
    }
}
