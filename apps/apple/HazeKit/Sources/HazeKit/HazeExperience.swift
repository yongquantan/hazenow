import Foundation

// SPEC v1.1/v1.2 "Experience & trust": verdicts, actions, anchors, uncertainty, provenance, trend words.
// A faithful port of packages/core/src/experience.ts. Strings are verbatim from docs/COPY.md.
// The `outdoor_worker` profile (SPEC v1.2 §6) isn't in COPY.md yet; its wording matches the TS reference.

// MARK: - Profiles (COPY §1)

public enum Profile: String, Codable, Sendable, CaseIterable, Identifiable {
    case general
    case kids
    case elderly
    case pregnant
    case heartLung = "heart_lung"
    case exercising
    case outdoorWorker = "outdoor_worker"

    public var id: String { rawValue }

    /// Picker label.
    public var label: String {
        switch self {
        case .general: "Just me, generally healthy"
        case .kids: "Kids"
        case .elderly: "Older adults (65+)"
        case .pregnant: "Pregnant"
        case .heartLung: "Asthma, COPD or a heart condition"
        case .exercising: "I exercise outdoors"
        case .outdoorWorker: "I work outdoors"
        }
    }

    /// "For …" label under the headline.
    public var forLabel: String {
        switch self {
        case .general: "For you"
        case .kids: "For kids"
        case .elderly: "For older adults"
        case .pregnant: "For pregnancy"
        case .heartLung: "For asthma, COPD & heart"
        case .exercising: "For your workout"
        case .outdoorWorker: "For outdoor work"
        }
    }

    /// Form used when combined: "you", "kids", "your workout".
    public var combined: String {
        switch self {
        case .general: "you"
        case .kids: "kids"
        case .elderly: "older adults"
        case .pregnant: "pregnancy"
        case .heartLung: "asthma, COPD & heart"
        case .exercising: "your workout"
        case .outdoorWorker: "outdoor work"
        }
    }

    public var symbolName: String {
        switch self {
        case .general: "person"
        case .kids: "figure.and.child.holdinghands"
        case .elderly: "figure.walk"
        case .pregnant: "heart.circle"
        case .heartLung: "lungs"
        case .exercising: "figure.run"
        case .outdoorWorker: "hammer"
        }
    }

    /// NEA's "vulnerable persons".
    public var isSensitive: Bool {
        switch self {
        case .kids, .elderly, .pregnant, .heartLung: true
        default: false
        }
    }

    /// Tie-break priority for mixed profiles (COPY §1).
    static let tieBreak: [Profile] = [.heartLung, .kids, .pregnant, .elderly, .exercising, .outdoorWorker, .general]

    public static func isSensitive(_ profiles: some Sequence<Profile>) -> Bool { profiles.contains { $0.isSensitive } }

    /// Empty → general; "general" can't be combined with a sensitive option. Returned in picker order.
    public static func normalise(_ profiles: some Sequence<Profile>) -> [Profile] {
        var set = Set(profiles)
        if isSensitive(set) { set.remove(.general) }
        if set.isEmpty { set = [.general] }
        return Profile.allCases.filter(set.contains)
    }

    /// "For you", "For you + kids", "For older adults + your workout", "For your household".
    public static func forWhom(_ profiles: some Sequence<Profile>) -> String {
        let ids = normalise(profiles)
        if ids.count >= 3 { return "For your household" }
        if ids.count == 1 { return ids[0].forLabel }
        return "For " + ids.map(\.combined).joined(separator: " + ")
    }
}

// MARK: - Verdicts (COPY §2)

public struct Verdict: Sendable, Hashable {
    /// Main-screen headline (long form).
    public var headline: String
    /// ≤ 28 chars, no full stop: widgets, notification titles, watch.
    public var short: String
    /// Optional second line under the headline.
    public var secondLine: String?
    /// "For you + kids"
    public var forWhom: String
    /// Which profile's wording was used.
    public var profile: Profile
    public var sensitive: Bool
}

extension HazeCompute {
    struct Cell { let long: String; let short: String; let level: Int }

    static func cell(_ band: Band, _ p: Profile) -> Cell {
        switch (band, p) {
        case (.normal, .kids): Cell(long: "Fine for outdoor play.", short: "Fine for outdoor play", level: 0)
        case (.normal, .exercising): Cell(long: "Fine to exercise outside.", short: "Fine to exercise outside", level: 0)
        case (.normal, _): Cell(long: "Fine to be out.", short: "Fine to be out", level: 0)

        case (.elevated, .general): Cell(long: "OK to be out. Go easy on hard exercise.", short: "Go easy outdoors", level: 1)
        case (.elevated, .kids): Cell(long: "Calm play outside is OK. Skip running games for now.", short: "Calm play only", level: 2)
        case (.elevated, .elderly): Cell(long: "A gentle walk is OK. Skip hard exercise for now.", short: "Gentle activity only", level: 2)
        case (.elevated, .pregnant), (.elevated, .heartLung):
            Cell(long: "Gentle activity is OK. Skip hard exercise for now.", short: "Gentle activity only", level: 2)
        case (.elevated, .exercising): Cell(long: "Keep your workout light, or move it indoors.", short: "Light workout or go indoors", level: 2)
        case (.elevated, .outdoorWorker): Cell(long: "OK to work outside. Take breaks indoors if you can.", short: "Take breaks indoors", level: 1)

        case (.high, .general): Cell(long: "Short trips out are OK. Exercise indoors.", short: "No outdoor exercise", level: 2)
        case (.high, .kids): Cell(long: "Indoor play for now. Keep trips out short.", short: "Indoor play for now", level: 3)
        case (.high, .elderly), (.high, .pregnant), (.high, .heartLung):
            Cell(long: "Stay indoors for now if you can.", short: "Stay indoors for now", level: 3)
        case (.high, .exercising): Cell(long: "Move your workout indoors.", short: "Work out indoors", level: 2)
        case (.high, .outdoorWorker): Cell(long: "Take regular breaks indoors. Ask about lighter outdoor tasks.", short: "Take regular indoor breaks", level: 2)

        case (.veryHigh, .general): Cell(long: "Stay indoors for now. Go out only if you need to.", short: "Stay indoors for now", level: 3)
        case (.veryHigh, .kids): Cell(long: "Keep kids indoors for now.", short: "Kids indoors for now", level: 4)
        case (.veryHigh, .elderly), (.veryHigh, .pregnant), (.veryHigh, .heartLung):
            Cell(long: "Stay indoors for now.", short: "Stay indoors for now", level: 4)
        case (.veryHigh, .exercising): Cell(long: "Skip outdoor exercise for now.", short: "No outdoor exercise", level: 3)
        case (.veryHigh, .outdoorWorker): Cell(long: "Limit time outside for now. Ask about indoor work.", short: "Limit time outside", level: 3)
        }
    }

    /// Verdict for a band and (multi-select) profile. Mixed profile → strictest row; ties by COPY priority.
    public static func verdict(band: Band, profiles: some Sequence<Profile> = [Profile.general], trend: Trend? = nil,
                               stale: Bool = false, observedAt: Date? = nil, history: [HistoryPoint]? = nil) -> Verdict {
        let ids = Profile.normalise(profiles)
        var pick = ids[0]
        for p in Profile.tieBreak where ids.contains(p) {
            let a = cell(band, p).level, b = cell(band, pick).level
            let rank = { (x: Profile) in Profile.tieBreak.firstIndex(of: x) ?? 99 }
            if a > b || (a == b && rank(p) < rank(pick)) { pick = p }
        }
        let c = cell(band, pick)
        return Verdict(
            headline: c.long, short: c.short,
            secondLine: secondLine(band: band, trend: trend, stale: stale, observedAt: observedAt, history: history),
            forWhom: Profile.forWhom(ids), profile: pick, sensitive: Profile.isSensitive(ids)
        )
    }

    public static func verdict(for s: Snapshot, profiles: some Sequence<Profile> = [Profile.general]) -> Verdict {
        verdict(band: s.band, profiles: profiles, trend: s.trend, stale: s.stale, observedAt: s.observedAt, history: s.history)
    }

    /// COPY §2 "Second line": first rule that applies, else nil.
    public static func secondLine(band: Band, trend: Trend?, stale: Bool = false, observedAt: Date? = nil,
                                  history: [HistoryPoint]? = nil) -> String? {
        if stale {
            return "Reading is from \(observedAt.map(HazeFormat.hour) ?? "earlier"). It may not match the air now."
        }
        let elevatedPlus = band != .normal
        if let trend, trend.delta >= 20 {
            return elevatedPlus ? "Getting worse. Check again in an hour." : "Rising quickly. Check again in an hour."
        }
        if let trend, trend.delta <= -20, elevatedPlus { return "Getting better. Check again in an hour." }
        if elevatedPlus, let history, let peak = easingPeak(history) {
            return "Easing since \(HazeFormat.hour(peak))."
        }
        return nil
    }

    /// If the last 2+ consecutive hourly steps were falling, the time of the peak they fell from.
    public static func easingPeak(_ history: [HistoryPoint]) -> Date? {
        let n = history.count
        guard n >= 3 else { return nil }
        var i = n - 1, falls = 0
        while i > 0, history[i].time.timeIntervalSince(history[i - 1].time) == 3600, history[i].pm25 < history[i - 1].pm25 {
            falls += 1
            i -= 1
        }
        return falls >= 2 ? history[i].time : nil
    }

    // MARK: Band anchor (COPY §3) — replaces "N× a typical day"

    public static func bandAnchor(_ band: Band) -> String {
        switch band {
        case .normal: "Normal is up to 55."
        case .elevated: "Elevated band (56–150). High starts at 151."
        case .high: "High band (151–250). Very High starts at 251."
        case .veryHigh: "Very High band (251 and above)."
        }
    }

    /// Typical clear-day PM2.5: median of ≥168 hourly points, else 20. Detail sheet only.
    public static func typicalText(history: [HistoryPoint] = []) -> String {
        var typical = 20
        if history.count >= 168 {
            let s = history.map(\.pm25).sorted()
            let m = s.count / 2
            typical = max(1, roundHalfUp(s.count.isMultiple(of: 2) ? Double(s[m - 1] + s[m]) / 2 : Double(s[m])))
        }
        return "A usual clear day in Singapore is around \(typical)."
    }

    // MARK: Actions (COPY §5)

    enum A {
        static let inhaler = "Asthma or COPD? Keep your inhaler with you."
        static let run = "Shorten or slow your run, or move it indoors."
        static let calmPlay = "Swap running games for calm play for now."
        static let closeSensitive = "At home? Close the windows. Use a fan or aircon to keep cool."
        static let checkHere = "Haze isn't always easy to see. Check here before a long run."
        static let closeWindows = "Close windows. Use aircon or a fan to keep cool."
        static let purifier = "Run a purifier in the room you're in, if you have one."
        static let exerciseIndoors = "Move exercise indoors, or try later."
        static let medicine = "Keep your inhaler or medicine close. Follow your doctor's plan."
        static let indoorPlay = "Plan indoor play. Keep trips out short."
        static let n95 = "Out for hours? An N95 mask helps. Not needed for short trips."
        static let n95Kids = "N95 masks aren't made for children. Keeping kids indoors works better."
        static let n95Pregnant = "Pregnant? Wear an N95 only for short periods, and take it off if it feels hard to breathe."
        static let n95HeartLung = "Heart or lung condition? Ask your doctor before using an N95."
        static let checkOlder = "Check on older family and neighbours."
        static let unwell = "Feeling unwell? See a doctor. Chest pain or can't breathe: call 995."
        static let workerBreaks = "Take breaks in the shade or indoors, and drink water."
        static let workerAsk = "Ask your supervisor about indoor breaks and lighter tasks."
    }

    static func maskLine(_ ids: [Profile]) -> String {
        if ids.contains(.kids) { return A.n95Kids }
        if ids.contains(.heartLung) { return A.n95HeartLung }
        if ids.contains(.pregnant) { return A.n95Pregnant }
        return A.n95
    }

    /// Actions for a band, filtered by profile, most useful first. Normal → [] (show the calm line).
    /// Masks are never first; kids never get an N95 suggestion. Very High always ends with the 995 line.
    public static func actions(band: Band, profiles: some Sequence<Profile> = [Profile.general], max: Int = 3) -> [String] {
        let ids = Profile.normalise(profiles)
        let has = { (p: Profile) in ids.contains(p) }
        var list: [String] = []
        switch band {
        case .normal:
            return []
        case .elevated:
            if has(.heartLung) { list.append(A.inhaler) }
            if has(.exercising) { list.append(A.run) }
            if has(.kids) { list.append(A.calmPlay) }
            if has(.outdoorWorker) { list.append(A.workerBreaks) }
            if Profile.isSensitive(ids) { list.append(A.closeSensitive) }
            if has(.general) { list.append(A.checkHere) }
            if list.isEmpty { list.append(A.closeSensitive) }
            return Array(list.prefix(max))
        case .high, .veryHigh:
            var specific: [String] = []
            if has(.exercising) || has(.general) { specific.append(A.exerciseIndoors) }
            if has(.heartLung) { specific.append(A.medicine) }
            if has(.kids) { specific.append(A.indoorPlay) }
            if has(.outdoorWorker) { specific.append(A.workerAsk) }
            let mask = maskLine(ids)
            if band == .high {
                list = [A.closeWindows, A.purifier] + specific + [mask]
                return Array(dedupe(list).prefix(max))
            }
            list = [A.closeWindows] + specific + [A.purifier, A.checkOlder, mask]
            return Array(dedupe(list).prefix(Swift.max(0, max - 1))) + [A.unwell]
        }
    }

    private static func dedupe(_ xs: [String]) -> [String] {
        var seen = Set<String>()
        return xs.filter { seen.insert($0).inserted }
    }

    /// Normal-band line: "Air's cleared…" within 3 h of an episode, else "Enjoy the fresh air."
    public static func calmLine(history: [HistoryPoint]) -> String {
        guard history.count >= 2, let last = history.last, last.pm25 <= 55 else { return HazeCopy.calmLine }
        let recent = history.filter {
            let dt = last.time.timeIntervalSince($0.time)
            return dt > 0 && dt <= 3 * 3600
        }
        return recent.contains { $0.pm25 > 55 } ? HazeCopy.clearedLine : HazeCopy.calmLine
    }

    // MARK: Trend (COPY §4)

    public enum TrendWord: String, Sendable { case steady, rising, risingFast = "rising fast", easing, clearingFast = "clearing fast" }

    static func wordFor(_ d: Int) -> TrendWord {
        if d >= 20 { return .risingFast }
        if d >= 5 { return .rising }
        if d <= -20 { return .clearingFast }
        if d <= -5 { return .easing }
        return .steady
    }

    private static func hourBefore(_ history: [HistoryPoint], _ hours: Double) -> HistoryPoint? {
        guard let last = history.last else { return nil }
        let t = last.time.addingTimeInterval(-hours * 3600)
        return history.first { $0.time == t }
    }

    /// Accessibility trend word, or nil when there is no previous hour.
    public static func trendWord(history: [HistoryPoint]) -> TrendWord? {
        guard history.count >= 2, let last = history.last, let h1 = hourBefore(history, 1) else { return nil }
        return wordFor(last.pm25 - h1.pm25)
    }

    /// "Steady over the last hour", "Rising: up 8 in the last hour", "Rising fast: up 38 in 2 hours", …
    public static func trendWords(history: [HistoryPoint]) -> String {
        guard history.count >= 2, let last = history.last, let h1 = hourBefore(history, 1) else {
            return "Trend not available yet"
        }
        let d1 = last.pm25 - h1.pm25
        if wordFor(d1) == .steady { return "Steady over the last hour" }
        var d = d1, span = "in the last hour"
        if let h2 = hourBefore(history, 2) {
            let d2 = last.pm25 - h2.pm25
            if d2.signum() == d1.signum(), abs(d2) > abs(d1) { d = d2; span = "in 2 hours" }
        }
        let label = switch wordFor(d) {
        case .rising: "Rising"
        case .risingFast: "Rising fast"
        case .easing: "Easing"
        case .clearingFast: "Clearing fast"
        case .steady: "Steady"
        }
        return d > 0 ? "\(label): up \(d) \(span)" : "\(label): down \(abs(d)) \(span)"
    }

    // MARK: Accessibility

    /// "OK to be out. Go easy on hard exercise. For you. PM2.5 105, Elevated, rising."
    public static func headlineLabel(_ s: Snapshot, profiles: some Sequence<Profile> = [Profile.general]) -> String {
        let v = verdict(band: s.band, profiles: profiles, trend: s.trend)
        let w = trendWord(history: s.history).map { ", \($0.rawValue)" } ?? ""
        return "\(v.headline) \(v.forWhom). PM2.5 \(s.pm25), \(s.band.label)\(w)."
    }

    /// Compact: "PM2.5 105, Elevated, rising, measured 4pm".
    public static func accessibleLabel(_ s: Snapshot) -> String {
        let w: String? = s.history.isEmpty
            ? ["up": "rising", "down": "easing", "steady": "steady"][s.trend.direction.rawValue]
            : trendWord(history: s.history)?.rawValue
        return "PM2.5 \(s.pm25), \(s.band.label)\(w.map { ", \($0)" } ?? ""), measured \(HazeFormat.hour(s.observedAt))"
    }

    /// COPY §8 accessibility summary for the chart.
    public static func chartSummary(_ history: [HistoryPoint]) -> String {
        guard let first = history.first, let last = history.last else { return "Chart. No readings yet." }
        let max = history.reduce(first) { $1.pm25 > $0.pm25 ? $1 : $0 }
        // COPY §8: the plotted line is NEA's 24-hr average PM2.5 (µg/m³), not the PSI index.
        let line = history.compactMap(\.pm25Avg24h)
        let avg = line.count >= 2 ? " NEA's 24-hr average PM2.5 went from \(line.first!) to \(line.last!)." : ""
        return "Chart. Over the last 24 hours PM2.5 went from \(first.pm25) to \(last.pm25), peaking at \(max.pm25) at \(HazeFormat.hour(max.time)).\(avg)"
    }

    /// COPY §15 share text (no verdict, no Instant PSI).
    public static func shareText(_ s: Snapshot, shareURL: String = "hazenow.pages.dev") -> String {
        let area: String = switch s.locationMode {
        case .gps: "near me"
        case .island: "in Singapore"
        case .region: s.nearestRegion == "central" ? "in Central" : "in the \(HazeFormat.regionName(s.nearestRegion))"
        }
        let w = trendWord(history: s.history).map { ", \($0.rawValue)" } ?? ""
        let psi = s.officialPsi24h.map { " NEA 24-hr PSI: \($0)." } ?? ""
        return "Air \(area) right now: \(s.band.label) (PM2.5 \(s.pm25))\(w).\(psi) Data: NEA via data.gov.sg. \(shareURL)"
    }
}

// MARK: - Uncertainty (COPY §6)

public struct Uncertainty: Sendable, Hashable {
    /// Blended value: prefix with "~".
    public var approx: Bool
    public var range: ClosedRange<Int>?
    /// "Nearby stations read 83–117."
    public var text: String?
    /// "about 105, nearby stations read 83 to 117"
    public var a11y: String

    public static let uncertainKm = 5.0
    public static let disagreeUgm3 = 30

    /// - region mode: exact. - island fallback: "~", range = min–max of online stations.
    /// - gps: exact if snapped (<0.5 km); else "~", plus the range of the two nearest valid stations when the
    ///   nearest is > 5 km away or they differ by more than 30.
    public init(snapshot s: Snapshot, point: (lat: Double, lon: Double)?) {
        let valid = s.regions.compactMap { name, r in r.pm25.map { (name: name, v: $0, lat: r.lat, lon: r.lon) } }
        func approx(_ r: ClosedRange<Int>?) -> Uncertainty {
            let range = (r?.lowerBound == r?.upperBound) ? nil : r
            return Uncertainty(approx: true, range: range,
                               text: range.map { "Nearby stations read \($0.lowerBound)–\($0.upperBound)." },
                               a11y: "about \(s.pm25)" + (range.map { ", nearby stations read \($0.lowerBound) to \($0.upperBound)" } ?? ""))
        }
        let exact = Uncertainty(approx: false, range: nil, text: nil, a11y: String(s.pm25))
        if s.locationMode == .region { self = exact; return }
        guard s.locationMode == .gps, let point else {
            let vs = valid.map(\.v)
            self = vs.isEmpty ? approx(nil) : approx(min(vs.min()!, s.pm25)...max(vs.max()!, s.pm25))
            return
        }
        let near = valid
            .map { (v: $0.v, d: HazeCompute.haversineKm(lat1: point.lat, lon1: point.lon, lat2: $0.lat, lon2: $0.lon)) }
            .sorted { $0.d < $1.d }
        guard let a = near.first else { self = approx(nil); return }
        if a.d < HazeCompute.snapKm { self = exact; return }
        let b = near.count > 1 ? near[1] : nil
        let far = a.d > Self.uncertainKm
        let disagree = b.map { abs(a.v - $0.v) > Self.disagreeUgm3 } ?? false
        guard far || disagree else { self = approx(nil); return }
        // SPEC v1.7: stations within 1.5× the nearest distance (at least the two nearest),
        // then widened so the range always contains the estimate.
        let cutoff = a.d * 1.5
        var vals = near.enumerated().filter { $0.offset < 2 || $0.element.d <= cutoff }.map(\.element.v)
        vals.append(s.pm25)
        self = approx(vals.min()!...vals.max()!)
    }

    init(approx: Bool, range: ClosedRange<Int>?, text: String?, a11y: String) {
        self.approx = approx
        self.range = range
        self.text = text
        self.a11y = a11y
    }

    /// "~105" / "105"
    /// TS parity only (`formatWithUncertainty`). UI must not use it: SPEC v1.5 drops "~" from the hero number.
    public func format(_ value: Int) -> String { (approx ? "~" : "") + "\(value)" }
}

// MARK: - Provenance (COPY §6)

public struct Provenance: Sendable, Hashable {
    /// "NEA West station · measured 4pm"
    public var text: String
    /// "35 min ago"
    public var age: String
    /// text + " · " + age
    public var full: String
    public var distanceKm: Double?
    public var minutesAgo: Int
    /// "West station is offline. Using nearby stations."
    public var note: String?
    /// "Measured 4pm · posted by NEA 4:30pm"
    public var detail: String

    /// "just now" (<5 min), "{n} min ago", "1 h 10 min ago".
    public static func formatAge(minutes: Int) -> String {
        if minutes < 5 { return "just now" }
        if minutes < 60 { return "\(minutes) min ago" }
        let h = minutes / 60, m = minutes % 60
        if h < 48 { return m > 0 ? "\(h) h \(m) min ago" : "\(h) h ago" }
        return "\(h / 24) days ago"
    }

    /// - Parameters:
    ///   - point: the coordinate used for the estimate (GPS fix, area centroid or saved place).
    ///   - placeName: "Tampines" / "Home" when the point is a picked area or saved place; nil for "my location".
    public init(snapshot s: Snapshot, point: (lat: Double, lon: Double)?, placeName: String? = nil, now: Date = Date()) {
        let mins = max(0, Int((now.timeIntervalSince(s.observedAt) / 60).rounded()))
        age = Self.formatAge(minutes: mins)
        minutesAgo = mins
        let obs = HazeFormat.hour(s.observedAt)
        let region = HazeFormat.regionName(s.nearestRegion)
        detail = "Measured \(obs) · posted by NEA \(HazeFormat.time(s.publishedAt))"
        note = nil
        distanceKm = nil

        if s.locationMode == .gps, let point {
            if let r = s.regions[s.nearestRegion] {
                distanceKm = HazeCompute.haversineKm(lat1: point.lat, lon1: point.lon, lat2: r.lat, lon2: r.lon)
            }
            let dist = distanceKm.map { $0 < 10 ? String(format: "%.1f km", $0) : "\(Int($0.rounded())) km" } ?? ""
            // SPEC v1.4 §4: "Near you · West station 3.2 km" / "Tampines · East station 1.1 km".
            text = "\(placeName ?? "Near you") · \(region) station \(dist) · measured \(obs)"
            let closest = s.regions.min { a, b in
                HazeCompute.haversineKm(lat1: point.lat, lon1: point.lon, lat2: a.value.lat, lon2: a.value.lon)
                    < HazeCompute.haversineKm(lat1: point.lat, lon1: point.lon, lat2: b.value.lat, lon2: b.value.lon)
            }
            if let closest, closest.key != s.nearestRegion, closest.value.pm25 == nil {
                note = "\(HazeFormat.regionName(closest.key)) station is offline. Using nearby stations."
            }
        } else if s.locationMode == .island {
            text = s.nearestRegion.isEmpty
                ? "Singapore (island average) · measured \(obs)"
                : "\(region) station is offline. Showing the average of NEA's other stations."
        } else {
            text = "NEA \(region) station · measured \(obs)"
        }
        full = "\(text) · \(age)"
    }
}

// MARK: - Insight: everything a full surface needs, in one value

extension HazeInsight {
    static func uncertaintyLine(_ s: Snapshot, uncertainty u: Uncertainty, placeName: String?) -> String {
        let range = u.range.map { " · range \($0.lowerBound)–\($0.upperBound)" } ?? ""
        switch s.locationMode {
        case .region:
            return "Measured at \(HazeFormat.regionName(s.nearestRegion)) station"
        case .gps where !u.approx:
            return "Measured at \(HazeFormat.regionName(s.nearestRegion)) station"
        case .gps:
            return "Estimate for \(placeName ?? "your spot")\(range)"
        case .island:
            return "\(s.nearestRegion.isEmpty ? "Island average" : "Average of other stations")\(range)"
        }
    }
}

public struct HazeInsight: Sendable, Hashable {
    public var verdict: Verdict
    public var actions: [String]
    /// Shown instead of actions in Normal.
    public var calmLine: String?
    public var trendWords: String
    public var anchor: String
    public var uncertainty: Uncertainty
    public var provenance: Provenance
    /// The hero number: always a clean integer, never "~" (SPEC v1.5 §1).
    public var numberText: String
    /// Small line under the number carrying the uncertainty (SPEC v1.5 §1):
    /// "Estimate for Tampines · range 83–117" / "Measured at East station".
    public var uncertaintyLine: String
    /// VoiceOver for the headline block.
    public var headlineLabel: String
    /// VoiceOver for compact surfaces.
    public var compactLabel: String

    public init(snapshot s: Snapshot, location: LocationInput, placeName: String? = nil,
                profiles: some Sequence<Profile> = [Profile.general], now: Date = Date()) {
        let ids = Profile.normalise(profiles)
        verdict = HazeCompute.verdict(for: s, profiles: ids)
        actions = HazeCompute.actions(band: s.band, profiles: ids)
        calmLine = s.band == .normal ? HazeCompute.calmLine(history: s.history) : nil
        trendWords = HazeCompute.trendWords(history: s.history)
        anchor = HazeCompute.bandAnchor(s.band)
        uncertainty = Uncertainty(snapshot: s, point: location.coordinate)
        provenance = Provenance(snapshot: s, point: location.coordinate, placeName: placeName, now: now)
        numberText = "\(s.pm25)"
        uncertaintyLine = Self.uncertaintyLine(s, uncertainty: uncertainty, placeName: placeName)
        let base = HazeCompute.headlineLabel(s, profiles: ids)
        headlineLabel = uncertainty.approx ? base.replacingOccurrences(of: "PM2.5 \(s.pm25),", with: "PM2.5 \(uncertainty.a11y),") : base
        compactLabel = HazeCompute.accessibleLabel(s)
    }
}
