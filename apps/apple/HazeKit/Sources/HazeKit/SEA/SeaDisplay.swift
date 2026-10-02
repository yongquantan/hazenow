import Foundation

// Display model for a CountrySnapshot (SPEC v2.0 §4–§6, §9), a port of packages/core/src/countries/ui.ts.
// Singapore keeps its v1 UI (COPY.md); this is used for the other countries. UI language is English; the authority's
// own word is carried beside the English (small), never instead of it.

public struct ChipModel: Sendable, Hashable {
    public var en: String
    public var local: String?
    public var lang: String
    public var agency: String
    public var color: String
    public var shape: ChipShape
    public var basisNote: String
    /// Community estimate (or WHO guidance): show a small "estimate" tag.
    public var estimate: Bool
}

public struct OfficialRowModel: Sendable, Hashable {
    public var label: String
    public var value: Double
    public var en: String?
    public var local: String?
    public var lang: String
    public var text: String
}

public struct CountryDisplay: Sendable, Hashable {
    public var chip: ChipModel?
    /// The small line directly under the big number (the only place the caveats may appear).
    public var numberSub: String
    public var kindLabel: String?
    public var provenance: String?
    public var official: OfficialRowModel?
    public var officialExplainer: String?
    public var noNumber: (title: String, line: String)? {
        get { noNumberTitle.map { ($0, noNumberLine ?? "") } }
        set { noNumberTitle = newValue?.title; noNumberLine = newValue?.line }
    }
    public var noNumberTitle: String?
    public var noNumberLine: String?
    public var whoLine: String?
    public var sensorLine: String?
    public var notices: [String]
    public var attribution: [(text: String, url: String)] {
        zip(attributionText, attributionURL).map { ($0, $1) }
    }
    var attributionText: [String]
    var attributionURL: [String]
}

public enum SeaDisplay {
    /// WHO-guide chip tones, low → very high (calm neutral blues; none is an authority's colour).
    public static let whoChipColor = ["#6690AE", "#5B84B1", "#5873AE", "#6268A9"]

    public static let noticeCopy = (
        noAnchor: "There's no official station within 25 km to check these sensors against, so this is an estimate, not a measurement.",
        implausible: "A station reading looked wrong and was left out.",
        offline: "A nearby station hasn't reported for over a day, so it was left out."
    )

    public static let notAvailableHeadline = "Not available yet"
    public static let needsPermissionDetail = "The data exists, but we need the publisher's permission (or a feed we can read) before we can show it."
    public static let notFeasibleDetail = "There isn't a reliable public source here yet."

    // MARK: Time

    public static func zoneLabel(_ off: Double, _ cc: CountryCode) -> String {
        if cc == .ID { return off == 7 ? "WIB" : off == 8 ? "WITA" : off == 9 ? "WIT" : "UTC+\(jsNumber(off))" }
        let byCc: [CountryCode: (Double, String)] = [
            .SG: (8, "SGT"), .TH: (7, "ICT"), .VN: (7, "ICT"), .LA: (7, "ICT"), .KH: (7, "ICT"), .MY: (8, "MYT"),
            .PH: (8, "PHT"), .BN: (8, "BNT"), .MM: (6.5, "MMT"), .TL: (9, "TLT"),
        ]
        if let z = byCc[cc], z.0 == off { return z.1 }
        let h = Int(off.rounded(.towardZero))
        let m = Int((abs(off - Double(h)) * 60).rounded())
        return "UTC\(off >= 0 ? "+" : "-")\(abs(h))\(m != 0 ? ":\(m < 10 ? "0" : "")\(m)" : "")"
    }

    /// Local UTC offset for a place (Indonesia has three zones).
    public static func localOffsetHours(_ cc: CountryCode, lon: Double? = nil) -> Double {
        if cc == .ID, let lon { return lon < 114.5 ? 7 : lon < 127 ? 8 : 9 }
        return SeaRegistry.info(cc).utcOffset
    }

    /// Crowd sensors report in UTC ("…Z"): re-express in the place's local time. Officials keep their own offset.
    public static func toLocalIso(_ iso: String, _ cc: CountryCode, lon: Double? = nil) -> String {
        let off = SeaTime.offsetHours(iso)
        if let off, off != 0 { return iso }
        guard let t = SeaTime.parse(iso) else { return iso }
        return SeaTime.toIso(t, offsetHours: localOffsetHours(cc, lon: lon))
    }

    /// "5pm" in the station's own local time, with its zone when it differs from the viewer's ("5pm ICT").
    public static func stationTime(_ iso: String, _ cc: CountryCode, viewerOffsetHours: Double? = nil, lon: Double? = nil) -> String {
        let local = toLocalIso(iso, cc, lon: lon)
        let off = SeaTime.offsetHours(local)
        let tt = (off == 8 && cc == .SG) ? SeaTime.parse(local).map { HazeFormat.hour(Date(timeIntervalSince1970: $0)) } ?? SeaTime.formatLocalTime(local)
            : SeaTime.formatLocalTime(local)
        guard let off, let viewerOffsetHours, off != viewerOffsetHours else { return tt }
        return "\(tt) \(zoneLabel(off, cc))"
    }

    /// The device's UTC offset in hours (for "5pm ICT" when the zones differ).
    public static var deviceOffsetHours: Double { Double(TimeZone.current.secondsFromGMT()) / 3600 }

    // MARK: Copy helpers

    /// "Thailand's official data", "the Philippines' official data".
    public static func officialDataOf(_ cc: CountryCode) -> String {
        let n = cc == .PH ? "the Philippines" : SeaRegistry.name(cc)
        return "\(n.hasSuffix("s") ? "\(n)'" : "\(n)'s") official data"
    }

    public static func ageText(minutes min: Int) -> String {
        min < 60 ? "\(min) min ago" : min < 48 * 60 ? "\(min / 60) hr\(min / 60 == 1 ? "" : "s") ago" : "\(min / 1440) days ago"
    }

    /// COPY §10 "official source down" rows: the calm title/line, and the cached line with the reading's time and age.
    public static func officialDownCopy(_ cc: CountryCode, cachedObservedAt: String? = nil, now: TimeInterval = Date().timeIntervalSince1970,
                                        viewerOffsetHours: Double? = nil) -> (title: String, line: String, cachedLine: String?) {
        let title = "Can't reach \(officialDataOf(cc)) right now"
        var cached: String?
        if let obs = cachedObservedAt, let t = SeaTime.parse(obs) {
            let min = max(0, Int(jsRound((now - t) / 60)))
            cached = "\(title). Showing the last reading we got, from \(stationTime(obs, cc, viewerOffsetHours: viewerOffsetHours)) (\(ageText(minutes: min)))."
        }
        return (title, "We'll try again in a few minutes.", cached)
    }

    public static func notices(_ s: CountrySnapshot) -> [String] {
        var out: [String] = []
        if s.isCrowdEstimate, !s.notes.contains("official_unavailable"),
           !s.stations.contains(where: { $0.grade == "reference" && ($0.distanceKm ?? .infinity) <= 25 }) {
            out.append(noticeCopy.noAnchor)
        }
        if s.notes.contains("implausible_dropped") { out.append(noticeCopy.implausible) }
        if s.notes.contains("offline_dropped") { out.append(noticeCopy.offline) }
        return out
    }

    static func avg(_ a: String) -> String { a == "24h" ? "24-hr" : a == "nowcast" ? "hourly" : "1-hr" }

    static func km(_ d: Double) -> String { d < 10 ? String(format: "%.1f", d) : String(Int(jsRound(d))) }

    public static func officialRow(_ s: CountrySnapshot) -> OfficialRowModel? {
        guard let o = s.official else { return nil }
        var en: String?, local: String?, lang = "en"
        if s.bandBasis == "official_index", let b = s.localBand {
            en = b.labelEn
            local = b.labelLocal
            lang = b.lang
        } else {
            let b = SeaScales.classifyIndex(o.scaleId, o.value)
            if let sc = SeaScales.scale(o.scaleId) { lang = sc.lang }
            if let b, o.category == nil || o.category == b.labelLocal || o.category == b.labelEn {
                en = b.labelEn
                local = b.labelLocal
            } else if let c = o.category { local = c }
        }
        if let l = local, let e = en, l == e { local = nil }
        let label = "\(o.agency) \(o.name) (\(avg(o.averaging)))"
        let word = en ?? local
        return OfficialRowModel(label: label, value: o.value, en: en, local: local, lang: lang,
                                text: "\(label): \(jsNumber(o.value))\(word.map { " · \($0)" } ?? "")")
    }

    /// The small line directly under the big number (the only place the caveats appear).
    public static func numberSub(_ s: CountrySnapshot) -> String {
        guard s.isCrowdEstimate else { return "PM2.5 · last hour" }
        let tail = "community sensors estimate"
        if s.notes.contains("official_unavailable") {
            let d = officialDataOf(s.country)
            return "\(d.prefix(1).uppercased() + String(d.dropFirst())) isn't responding right now · \(tail)"
        }
        if SeaScales.chipScale(s.country) == nil { return "There's no official air-quality scale here · \(tail)" }
        if !s.stations.contains(where: { $0.grade == "reference" && ($0.distanceKm ?? .infinity) <= 25 }) { return "No official reading near here · \(tail)" }
        return "PM2.5 · community sensors"
    }

    public static let sensorLineKm = 20.0

    public static func nearbySensorLine(_ s: CountrySnapshot) -> String? {
        guard s.pm25 == nil, let b = s.localBand, s.bandBasis == "official_index" else { return nil }
        let worse = s.stations.filter { x in
            guard x.grade == "lowcost", let v = x.pm25_1h, let d = x.distanceKm, d <= sensorLineKm,
                  let cat = SeaScales.classifyPm25(b.scaleId, v), let lvl = cat.level else { return false }
            return lvl > b.level
        }
        guard !worse.isEmpty else { return nil }
        let top = Int(jsRound(worse.compactMap(\.pm25_1h).max()!))
        return worse.count == 1 ? "A community sensor nearby reads \(top) µg/m³ right now." : "Community sensors nearby read up to \(top) µg/m³ right now."
    }

    /// Main agency ("PCD", "DOE Malaysia", "community sensors").
    public static func mainAgency(_ s: CountrySnapshot) -> String {
        s.localBand?.agency ?? s.official?.agency ?? (s.isCrowdEstimate ? "community sensors" : SeaRegistry.name(s.country))
    }

    public static func display(_ s: CountrySnapshot, placeName: String? = nil, viewerOffsetHours: Double? = nil, lon: Double? = nil) -> CountryDisplay {
        var chip: ChipModel?
        if let b = s.localBand {
            let basisNote: String
            if s.bandBasis == "official_index", let o = s.official { basisNote = "\(b.agency) category for the \(avg(o.averaging)) \(o.name)" }
            else if s.bandFromEstimate { basisNote = "\(b.agency) category, applied to the community-sensor estimate" }
            else { basisNote = "\(SeaScales.scale(b.scaleId)?.indexName ?? b.agency) category for this hour's PM2.5" }
            chip = ChipModel(en: b.labelEn, local: b.labelLocal != b.labelEn && !b.labelLocal.isEmpty ? b.labelLocal : nil, lang: b.lang,
                             agency: b.agency, color: b.color, shape: b.shape, basisNote: basisNote, estimate: s.bandFromEstimate)
        } else if let pm25 = s.pm25, SeaScales.chipScale(s.country) == nil {
            let w = SeaVerdicts.whoVerdictBand(Double(pm25))
            chip = ChipModel(en: "WHO guide: \(w.word)", local: nil, lang: "en", agency: "WHO 2021", color: whoChipColor[w.level],
                             shape: [ChipShape.circle, .half, .triangle, .octagon][w.level],
                             basisNote: "WHO 2021 guidance, applied to this hour's estimate. There's no national scale here.",
                             estimate: s.isCrowdEstimate)
        }
        let time = stationTime(s.observedAt, s.country, viewerOffsetHours: viewerOffsetHours, lon: lon)
        var provenance: String?, kindLabel: String?
        let range = s.range.map { " · range \($0[0])–\($0[1])" } ?? ""
        if s.pm25Kind == "official_1h", let n = s.nearest {
            kindLabel = "Official reading"
            provenance = s.range != nil
                ? "Estimate for \(placeName ?? "your spot") from official stations\(range) · \(time)"
                : "Measured at \(n.name) station\(n.distanceKm.map { " · \(km($0)) km" } ?? "") · \(time)"
        } else if s.isCrowdEstimate {
            kindLabel = "Community sensors · estimate"
            let n = max(1, s.stations.filter { $0.grade == "lowcost" && ($0.distanceKm ?? 99) <= 10 }.count)
            provenance = "\(SeaVerdicts.crowdProvenance(min(n, 8)))\(range) · \(time)"
        } else if let n = s.nearest {
            let agency = s.official?.agency ?? s.localBand?.agency ?? ""
            provenance = "Nearest \(agency.isEmpty ? "" : "\(agency) ")station: \(n.name)\(n.distanceKm.map { " · \(km($0)) km" } ?? "") · \(time)"
        }
        let official = officialRow(s)
        let explainer = official != nil && s.official?.averaging == "24h" && s.pm25 != nil
            ? "The 24-hr index averages the last 24 hours. The number above is the latest hour." : nil
        var nnTitle: String?, nnLine: String?
        if s.pm25 == nil {
            if let o = s.official {
                nnTitle = "No official hourly reading here"
                nnLine = "\(o.agency) publishes a \(avg(o.averaging)) index for this area, so that's what we show. It moves slowly: it averages the last \(o.averaging == "24h" ? "24 hours" : "hours")."
            } else {
                nnTitle = "No reading near here right now"
                nnLine = "There's no official station or community sensor close enough for an honest number."
            }
        }
        return CountryDisplay(
            chip: chip, numberSub: numberSub(s), kindLabel: kindLabel, provenance: provenance, official: official,
            officialExplainer: explainer, noNumberTitle: nnTitle, noNumberLine: nnLine,
            whoLine: s.localBand == nil ? s.whoMultiple.map(SeaVerdicts.whoLine) : nil,
            sensorLine: nearbySensorLine(s), notices: notices(s),
            attributionText: s.attribution.map(\.text), attributionURL: s.attribution.map(\.url)
        )
    }

    /// Share text (SPEC v2.0 §9): names the scale and the authority, never mixes scales.
    public static func shareText(_ s: CountrySnapshot, placeName: String, site: String = "hazenow.pages.dev", lon: Double? = nil) -> String {
        let when = stationTime(s.observedAt, s.country, viewerOffsetHours: -99, lon: lon)
        var parts: [String] = []
        if s.stale { parts.append("Latest reading is delayed.") }
        if let pm25 = s.pm25 {
            parts.append("PM2.5 \(pm25) µg/m³\(s.isCrowdEstimate ? " (community-sensor estimate)" : "") in \(placeName) at \(when)")
        } else { parts.append("\(placeName) at \(when)") }
        if let b = s.localBand, s.bandBasis == "pm25_1h" {
            let scaleName = SeaScales.scale(b.scaleId)?.indexName ?? b.scaleId
            parts.append("\(b.labelLocal)\(b.labelLocal != b.labelEn ? " (\(b.labelEn))" : ""), \(scaleName) category, \(b.agency) hourly")
        } else if let o = officialRow(s) { parts.append(o.text) }
        if s.localBand == nil, let w = s.whoMultiple { parts.append(String(SeaVerdicts.whoLine(w).dropLast())) }
        if !s.stale, s.pm25 != nil, let w = HazeCompute.trendWord(history: s.historyPoints) { parts.append(w.rawValue) }
        let data = "Data: " + s.attribution.map { $0.text.replacingOccurrences(of: "^Data: ", with: "", options: .regularExpression) }.joined(separator: ", ")
        return "\(parts.joined(separator: " · ")) · \(data) · via HazeNow \(site)"
    }
}
