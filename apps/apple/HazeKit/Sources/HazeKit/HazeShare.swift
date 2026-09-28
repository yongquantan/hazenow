import Foundation

// SPEC v1.6 — share system. A line-by-line port of packages/core/src/share.ts (same names, same outputs):
// pickShareCard, episodeStats, dayAverage, sharePlace, shareCardContent, shareCardText, shareFileName.
// Card views live in HazeUI (ShareCards.swift) and only lay these strings out.

public enum ShareCardKind: String, Codable, Sendable, CaseIterable, Identifiable {
    case now, clocks, group, clear
    public var id: String { rawValue }

    public var title: String {
        switch self {
        case .now: "Now"
        case .clocks: "Two clocks"
        case .group: "For our group"
        case .clear: "All clear"
        }
    }
}

public enum ShareCredit {
    public static let name = "Yong Quan Tan"   // TS: CREDIT
    public static let site = "hazenow.pages.dev"      // TS: SHARE_SITE
    public static let siteURL = URL(string: "https://hazenow.pages.dev")!
    public static let linkedIn = URL(string: "https://www.linkedin.com/in/yong-quan-tan")!
    public static let kairosLabs = URL(string: "https://kairoslabs.sg")!
    public static let gitHub = URL(string: "https://github.com/yongquantan/hazenow")!
}

public struct LatLonPoint: Sendable, Hashable {
    public var lat: Double
    public var lon: Double
    public init(lat: Double, lon: Double) { self.lat = lat; self.lon = lon }
}

/// TS: ShareContext
public struct ShareContext: Sendable, Hashable {
    /// Area or place name to print ("Tampines"). Defaults to the region / "Singapore".
    public var placeName: String?
    /// The user's point (GPS or area centroid), for the station distance line.
    public var point: LatLonPoint?
    /// Opened from "Why two numbers?" → Two clocks (rule 4).
    public var fromWhyTwoNumbers: Bool

    public init(placeName: String? = nil, point: LatLonPoint? = nil, fromWhyTwoNumbers: Bool = false) {
        self.placeName = placeName
        self.point = point
        self.fromWhyTwoNumbers = fromWhyTwoNumbers
    }
}

// MARK: - Personas (TS: PERSONAS, personaFor)

public extension Profile {
    /// Priority kids > elderly > heart_lung > pregnant > exercising > outdoor_worker.
    static let sharePersonaPriority: [Profile] = [.kids, .elderly, .heartLung, .pregnant, .exercising, .outdoorWorker]

    /// TS: PERSONAS[].chip
    var shareGroupTitle: String? {
        switch self {
        case .kids: "For the kids · Recess check"
        case .elderly: "For Mum and Dad"
        case .heartLung: "For heart and lung health"
        case .pregnant: "For mums-to-be"
        case .exercising: "Run check"
        case .outdoorWorker: "Site check"
        case .general: nil
        }
    }
}

// MARK: - Pick

/// TS: SharePick
public struct SharePick: Sendable, Hashable {
    public var card: ShareCardKind
    /// Persona for the "For our group" card (set whenever the profile has one).
    public var persona: Profile?
    /// Other eligible cards, in display order (never includes `card`).
    public var alternates: [ShareCardKind]
    /// `card` followed by `alternates` (for the preview row).
    public var all: [ShareCardKind] { [card] + alternates }
}

/// TS: EpisodeStats
public struct EpisodeStats: Sendable, Hashable {
    public struct Worst: Sendable, Hashable { public var pm25: Int; public var time: Date }
    public var worst: Worst
    /// Consecutive hourly readings above Normal (> 55) in the most recent episode.
    public var hoursAbove: Int
    public var start: Date
    public var end: Date
    /// True if the episode may be longer than the history we have.
    public var truncated: Bool
}

public enum HazeShare {
    public static let clocksGap = 40                 // TS: CLOCKS_GAP
    /// COPY §19: replaces the verdict headline on a stale card.
    public static let staleHeadline = "Latest NEA reading is delayed."
    public static let allClearLookbackHours = 12.0   // TS: ALL_CLEAR_LOOKBACK_H

    /// TS: personaFor
    public static func personaFor(_ profile: some Sequence<Profile>) -> Profile? {
        let ids = Profile.normalise(profile)
        return Profile.sharePersonaPriority.first(where: ids.contains)
    }

    /// TS: dayAverage — latest NEA 24-hr average PM2.5 at the spot, else the mean of the hourly history.
    public static func dayAverage(_ history: [HistoryPoint]) -> Int? {
        if let last = history.last, let a = last.pm25Avg24h, a >= 0 { return a }
        let vals = history.map(\.pm25).filter { $0 >= 0 }
        guard !vals.isEmpty else { return nil }
        return Int((Double(vals.reduce(0, +)) / Double(vals.count)).rounded())
    }

    static func wasElevatedRecently(_ history: [HistoryPoint], observedAt: Date) -> Bool {
        history.contains { h in
            h.time < observedAt && observedAt.timeIntervalSince(h.time) <= allClearLookbackHours * 3600 && h.pm25 > 55
        }
    }

    /// TS: pickShareCard. First match wins:
    /// 1 Normal now and ≥ Elevated within 12 h → clear · 2 persona and ≥ Elevated → group · 3 ≥ Elevated → now
    /// 4 |1-hr − 24-hr avg| ≥ 40 or opened from "Why two numbers?" → clocks · 5 → now.
    /// Alternates: now, clocks, group (if a persona), clear (only if rule 1 applies).
    public static func pickShareCard(_ s: Snapshot, profile: some Sequence<Profile> = [Profile.general],
                                     context: ShareContext = ShareContext()) -> SharePick {
        let persona = personaFor(profile)
        let clearEligible = s.band == .normal && wasElevatedRecently(s.history, observedAt: s.observedAt)
        let avg = dayAverage(s.history)
        let card: ShareCardKind
        if clearEligible { card = .clear }
        else if persona != nil, s.band != .normal { card = .group }
        else if s.band != .normal { card = .now }
        else if context.fromWhyTwoNumbers || avg.map({ abs(s.pm25 - $0) >= clocksGap }) == true { card = .clocks }
        else { card = .now }
        var eligible: [ShareCardKind] = [.now, .clocks]
        if persona != nil { eligible.append(.group) }
        if clearEligible { eligible.append(.clear) }
        return SharePick(card: card, persona: persona, alternates: eligible.filter { $0 != card })
    }

    /// TS: episodeStats — the most recent run of hours above Normal; a missing hour ends the run.
    public static func episodeStats(_ history: [HistoryPoint]) -> EpisodeStats? {
        guard let end = history.lastIndex(where: { $0.pm25 > 55 }) else { return nil }
        var start = end
        while start > 0, history[start - 1].pm25 > 55,
              history[start].time.timeIntervalSince(history[start - 1].time) == 3600 { start -= 1 }
        var worst = history[start]
        for i in start...end where history[i].pm25 > worst.pm25 { worst = history[i] }
        return EpisodeStats(worst: .init(pm25: worst.pm25, time: worst.time), hoursAbove: end - start + 1,
                            start: history[start].time, end: history[end].time, truncated: start == 0)
    }

    // MARK: Card words

    static let days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]
    static let months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]

    /// TS: formatCardWhen — "Mon 28 Sep, 5pm" (SGT). Absolute time only on images.
    public static func formatCardWhen(_ d: Date) -> String {
        let c = HazeFormat.sgtCalendar.dateComponents([.weekday, .day, .month], from: d)
        return "\(days[(c.weekday ?? 1) - 1]) \(c.day ?? 1) \(months[(c.month ?? 1) - 1]), \(HazeFormat.hour(d))"
    }

    /// Place slug: lowercase, runs of non-alphanumerics → "-", default "singapore".
    public static func slug(_ place: String) -> String {
        var slug = ""
        for ch in place.lowercased() {
            if ("a"..."z").contains(ch) || ("0"..."9").contains(ch) { slug.append(ch) }
            else if !slug.isEmpty, !slug.hasSuffix("-") { slug.append("-") }
        }
        while slug.hasSuffix("-") { slug.removeLast() }
        return slug.isEmpty ? "singapore" : slug
    }

    /// TS: shareFileName — "hazenow-tampines-2026-09-28-1700.png" (+ "-clocks" etc. for non-Now cards).
    public static func shareFileName(place: String, observedAt: Date, card: String = "now") -> String {
        let c = HazeFormat.sgtCalendar.dateComponents([.year, .month, .day, .hour, .minute], from: observedAt)
        let stamp = String(format: "%04d-%02d-%02d-%02d%02d", c.year!, c.month!, c.day!, c.hour!, c.minute!)
        return "hazenow-\(slug(place))-\(stamp)\(card == "now" ? "" : "-\(card)").png"
    }

    /// TS: NEA_ADVICE — NEA's own 1-hr PM2.5 advice split, per band.
    public static func neaAdvice(_ band: Band) -> (most: String, vulnerable: String) {
        switch band {
        case .normal: ("Continue normal activities.", "Continue normal activities.")
        case .elevated: ("Reduce strenuous outdoor activity.", "Avoid strenuous outdoor activity.")
        case .high: ("Avoid strenuous outdoor activity.", "Avoid all outdoor activity.")
        case .veryHigh: ("Minimise all outdoor activity.", "Avoid all outdoor activity.")
        }
    }

    /// TS: nowHeadline — "Elevated, and rising." / "Normal right now."
    public static func nowHeadline(band: Band, history: [HistoryPoint]) -> String {
        guard let w = HazeCompute.trendWord(history: history) else { return "\(band.label) right now." }
        return "\(band.label), and \(w == .clearingFast ? "clearing" : w.rawValue)."
    }

    /// TS: trendDetail — "up 36 in 2 hours" / "steady over the last hour" / "".
    public static func trendDetail(_ history: [HistoryPoint]) -> String {
        guard HazeCompute.trendWord(history: history) != nil else { return "" }
        let t = HazeCompute.trendWords(history: history)
        var out = t.range(of: ": ").map { String(t[$0.upperBound...]) } ?? t
        if out.hasPrefix("Steady") { out = "steady" + out.dropFirst("Steady".count) }
        return out
    }

    /// TS: Place
    public struct Place: Sendable, Hashable {
        public var name: String
        /// "Air near Tampines" / "Air in the West" / "Air across Singapore"
        public var hook: String
        /// "NEA East station · 2.2 km away" / "NEA East station" / "Average of NEA stations"
        public var station: String
        /// "East station"
        public var stationShort: String
        /// "near Tampines" / "in the West" / "near me" / "across Singapore"
        public var phrase: String
    }

    /// TS: sharePlace
    public static func sharePlace(_ s: Snapshot, _ ctx: ShareContext = ShareContext()) -> Place {
        let r = s.nearestRegion.isEmpty ? "" : HazeFormat.regionName(s.nearestRegion)
        if s.locationMode == .island {
            let name = ctx.placeName ?? "Singapore"
            let hook = s.nearestRegion.isEmpty ? "Air across Singapore" : "Air near \(ctx.placeName ?? r)"
            return Place(name: ctx.placeName ?? (s.nearestRegion.isEmpty ? "Singapore" : r), hook: hook,
                         station: "Average of NEA stations", stationShort: "NEA stations",
                         phrase: s.nearestRegion.isEmpty ? "across Singapore" : "near \(name)")
        }
        var station = "NEA \(r) station"
        if s.locationMode == .gps, let p = ctx.point, let reg = s.regions[s.nearestRegion] {
            let d = HazeCompute.haversineKm(lat1: p.lat, lon1: p.lon, lat2: reg.lat, lon2: reg.lon)
            station += " · \(d < 10 ? String(format: "%.1f", d) : String(Int(d.rounded()))) km away"
        }
        let name = ctx.placeName ?? r
        let phrase: String = if let pn = ctx.placeName { "near \(pn)" }
            else if s.locationMode == .gps { "near me" }
            else if s.nearestRegion == "central" { "in Central" }
            else { "in the \(r)" }
        let hook = (ctx.placeName != nil || s.locationMode == .gps) ? "Air near \(name)" : "Air \(phrase)"
        return Place(name: name, hook: hook, station: station, stationShort: "\(r) station", phrase: phrase)
    }

    static func nextCheck(_ observedAt: Date) -> String { HazeFormat.hour(observedAt.addingTimeInterval(3600)) }

    /// TS: shareCardText — per card, always ends with the site.
    public static func shareCardText(_ card: ShareCardKind, _ s: Snapshot, profile: some Sequence<Profile> = [Profile.general],
                                     context ctx: ShareContext = ShareContext(), site: String = ShareCredit.site) -> String {
        let place = sharePlace(s, ctx)
        let label = s.band.label
        let t = HazeFormat.hour(s.observedAt)
        let psi = s.officialPsi24h.map { " NEA 24-hr PSI: \($0) (\(HazeCompute.psiLabel($0).rawValue))." } ?? ""
        let credit = "Data: NEA via data.gov.sg."
        let ids = Profile.normalise(profile)
        switch card {
        case .now:
            let w = s.stale ? "" : (HazeCompute.trendWord(history: s.history).map { ", \($0.rawValue)" } ?? "")
            return "Air \(place.phrase) at \(t): \(label) (PM2.5 \(s.pm25))\(w).\(psi) \(credit) \(site)"
        case .clocks:
            let avg = dayAverage(s.history).map { ", 24-hr average \($0)" } ?? ""
            let which = s.stale ? "the \(t) hour" : "last hour"
            return "Same NEA data, two clocks. \(place.name) at \(t): \(which) PM2.5 \(s.pm25)\(avg).\(psi) \(credit) \(site)"
        case .group:
            let c = ShareCardContent(.group, s, profile: ids, context: ctx)
            return "\(c.chip ?? "For our group"), \(place.name) at \(t): \(c.headline) PM2.5 \(s.pm25) (\(label)). \(credit) \(site)"
        case .clear:
            let c = ShareCardContent(.clear, s, profile: ids, context: ctx)
            let stats = c.stats.isEmpty ? "" : " " + c.stats.replacingOccurrences(of: "’", with: "'")
            return "Air's back to Normal \(place.phrase) (PM2.5 \(s.pm25) at \(t)). Fine to be out.\(stats) \(credit) \(site)"
        }
    }
}

// MARK: - Card content (TS: NowCard | ClocksCard | GroupCard | ClearCard | PreviewCard, flattened)

public struct ShareCardContent: Sendable, Hashable {
    /// Which card; `preview` = card 6 (link preview / OG, 1200×630).
    public enum Kind: String, Sendable, Hashable { case now, clocks, group, clear, preview }
    public var kind: Kind
    public var when: String
    public var place: String
    public var pm25: Int
    public var band: Band
    /// Place/time line: "Tampines · Mon 28 Sep, 5pm", or when stale (COPY §19)
    /// "Tampines · reading from Mon 28 Sep, 1pm (latest available)".
    public var placeLine: String = ""
    public var stale: Bool = false
    public var credit: String = ShareCredit.name
    public var site: String = ShareCredit.site
    // now / preview
    public var hook: String = ""
    public var headline: String = ""
    public var pmDetail: String = ""
    public var adviceLabel: String = ""
    public var adviceMost: String = ""
    public var adviceVulnerable: String = ""
    public var psiLine: String = ""
    public var station: String = ""
    public var direction: TrendDirection?
    public var psi: Int?
    // clocks
    public var headlineLines: [String] = []
    public var avg: Int?
    public var bars: [Int] = []
    public var caption: String = ""
    /// Two clocks left panel label: "The last hour", or "The 3pm hour" when stale (COPY §19).
    public var lastHourLabel: String = "The last hour"
    /// Right end of the chart axis: "Now", or the reading's hour when stale ("3pm", COPY §19).
    public var axisEnd: String = "Now"
    // group
    public var chip: String?
    public var statsRest: String = ""
    public var actions: [String] = []
    // clear
    public var bodyLines: [String] = []
    public var stats: String = ""
    // payload (TS: shareCardText + shareFileName; link carries ?area= so the link preview matches)
    public var shareText: String = ""
    public var url: URL = ShareCredit.siteURL
    public var filename: String = ""

    /// TS: shareCardContent(card, s, profile, ctx)
    public init(_ kind: Kind, _ s: Snapshot, profile: some Sequence<Profile> = [Profile.general],
                context ctx: ShareContext = ShareContext()) {
        let place = HazeShare.sharePlace(s, ctx)
        self.kind = kind
        when = HazeShare.formatCardWhen(s.observedAt)
        self.place = place.name
        pm25 = s.pm25
        band = s.band
        let label = s.band.label
        stale = s.stale
        placeLine = s.stale ? "\(place.name) · reading from \(when) (latest available)" : "\(place.name) · \(when)"
        defer {
            // COPY §19: never present stale data as "now".
            if s.stale {
                if kind == .now || kind == .preview { hook = placeLine }
                if kind != .clocks { headline = HazeShare.staleHeadline }
                // Parity (web/Android): no trend on a stale reading.
                if kind == .now {
                    pmDetail = "µg/m³ 1-hr PM2.5"
                    // COPY §19: never "next hour" / "the last hour" for an old reading.
                    adviceLabel = "NEA’s advice for that hour"
                    let hourText = "This reading is for the \(HazeFormat.hour(s.observedAt)) hour."
                    psiLine = s.officialPsi24h.map { "The 24-hr PSI (\($0)) averages the whole day. \(hourText)" }
                        ?? "The 24-hr PSI averages the whole day. \(hourText)"
                }
                lastHourLabel = "The \(HazeFormat.hour(s.observedAt)) hour"
                if kind == .group {
                    statsRest = "µg/m³ · \(label)"
                    // COPY §19: no "next check" time off an old reading.
                    if !actions.isEmpty { actions[actions.count - 1] = "Check hazenow.pages.dev for NEA's next update." }
                }
                if kind == .preview { direction = nil }
                if kind == .clocks { axisEnd = HazeFormat.hour(s.observedAt) }
            }
        }
        switch kind {
        case .now:
            let detail = HazeShare.trendDetail(s.history)
            hook = "\(place.hook) · \(when)"
            headline = HazeShare.nowHeadline(band: s.band, history: s.history)
            pmDetail = "µg/m³ 1-hr PM2.5\(detail.isEmpty ? "" : " · \(detail)")"
            adviceLabel = "NEA’s advice for the next hour"
            (adviceMost, adviceVulnerable) = HazeShare.neaAdvice(s.band)
            psiLine = s.officialPsi24h.map {
                "The 24-hr PSI (\($0)) averages the whole day. This is the last hour. Same NEA data, different clock."
            } ?? "The 24-hr PSI averages the whole day. This is the last hour. Same NEA data, different clock."
            station = place.station
        case .clocks:
            headlineLines = ["Same NEA data.", "Two clocks."]
            headline = headlineLines.joined(separator: "\n")
            avg = HazeShare.dayAverage(s.history)
            psi = s.officialPsi24h
            bars = s.history.suffix(24).map(\.pm25)
            let falling = avg.map { s.pm25 < $0 } ?? false
            caption = falling
                ? "The daily number catches up slowly, both ways: the air has cleared, but the 24-hr average stays high for a while."
                : "The daily number catches up slowly, both ways: when haze clears, it stays high for a while too."
        case .group:
            chip = HazeShare.personaFor(profile)?.shareGroupTitle ?? "For our group"
            let v = HazeCompute.verdict(band: s.band, profiles: profile, trend: s.trend)
            headline = s.band == .normal ? v.headline
                : (v.short.range(of: "for now", options: .caseInsensitive) != nil ? "\(v.short)." : "\(v.short), for now.")
            let acts = HazeCompute.actions(band: s.band, profiles: profile, max: 2)
            let w = HazeCompute.trendWord(history: s.history)
            statsRest = "µg/m³ · \(label)\(w.map { " · \($0.rawValue)" } ?? "")"
            actions = (acts.isEmpty ? [HazeCopy.calmLine] : acts) + ["Next check at \(HazeShare.nextCheck(s.observedAt))."]
            station = place.stationShort
        case .clear:
            headline = "Air’s back to Normal."
            bodyLines = ["PM2.5 \(s.pm25) µg/m³. Fine to be out.", "Open the windows."]
            if let ep = HazeShare.episodeStats(s.history) {
                let cal = HazeFormat.sgtCalendar
                let sameDay = cal.component(.day, from: ep.worst.time) == cal.component(.day, from: s.observedAt)
                let wd = HazeShare.days[cal.component(.weekday, from: ep.worst.time) - 1]
                let at = HazeFormat.hour(ep.worst.time) + (sameDay ? "" : " \(wd)")
                let hrs = "\(ep.truncated ? "At least " : "")\(ep.hoursAbove) hour\(ep.hoursAbove == 1 ? "" : "s") above Normal."
                stats = "Worst hour this episode: \(ep.worst.pm25) at \(at). \(hrs)"
            }
        case .preview:
            hook = "\(place.hook) · \(when)"
            headline = HazeShare.nowHeadline(band: s.band, history: s.history)
            direction = HazeCompute.trendWord(history: s.history) != nil ? s.trend.direction : nil
            psi = s.officialPsi24h
        }
    }

    /// Content plus the share payload (text, `?area=` link, time-stamped filename).
    public init(card: ShareCardKind, _ s: Snapshot, profile: some Sequence<Profile> = [Profile.general],
                context ctx: ShareContext = ShareContext()) {
        let ids = Profile.normalise(profile)
        self.init(Kind(rawValue: card.rawValue)!, s, profile: ids, context: ctx)
        shareText = HazeShare.shareCardText(card, s, profile: ids, context: ctx)
        var comps = URLComponents(string: "https://hazenow.pages.dev/")!
        comps.queryItems = [URLQueryItem(name: "area", value: HazeShare.slug(place)), URLQueryItem(name: "s", value: card.rawValue)]
        url = comps.url!
        filename = HazeShare.shareFileName(place: place, observedAt: s.observedAt, card: card.rawValue)
    }

    public var shareCard: ShareCardKind? { ShareCardKind(rawValue: kind.rawValue) }
}

public extension SGAreas {
    /// Nearest planning-area centroid (the UI uses it to name a GPS spot on cards).
    static func nearest(lat: Double, lon: Double) -> SGArea? {
        all.min { a, b in
            HazeCompute.haversineKm(lat1: lat, lon1: lon, lat2: a.lat, lon2: a.lon)
                < HazeCompute.haversineKm(lat1: lat, lon1: lon, lat2: b.lat, lon2: b.lon)
        }
    }
}
