import Foundation

// Verdict copy per jurisdiction (SPEC v2.0 §7, COPY.md §20), a port of packages/core/src/countries/verdicts.ts.
// The headline always answers "is it OK to be out?" (principle 1): a community estimate in a country with a scale gets
// that authority's category verdict prefixed "Estimate: "; a country with no scale gets a WHO-2021-guidance verdict.
// "No official reading near here." / "There's no official air-quality scale here." are only ever the line under the
// number (`SeaDisplay.numberSub`), never a headline.

public struct CountryVerdict: Sendable, Hashable {
    public var headline: String
    public var short: String
    public var secondLine: String?
    public var forWhom: String
    public var profile: Profile
    public var sensitive: Bool
    /// Headline hedged on a 24-hr index (no official 1-hr number here).
    public var hedged = false
    /// Draft copy awaiting native review.
    public var needsReview = false
    /// From a community estimate mapped to the authority's category ("Estimate: …").
    public var estimate = false
    /// No national scale: WHO 2021 guidance bands. Shown in ink, never a band tint.
    public var whoBased = false
    public var headlineLocal: String?
    public var shortLocal: String?
    public var secondLineLocal: String?
}

public enum SeaVerdicts {
    public static let estimatePrefix = (en: "Estimate: ", short: "Est. ", th: "ค่าประมาณ: ")
    public static let hedge24h = "Based on the 24-hr index: "
    public static let noOfficial = (headline: "No official reading near here.", short: "No official reading")
    public static let noScale = (headline: "There's no official air-quality scale here.", short: "No official scale")
    public static let noReading = (headline: "Can't say for here right now.", short: "No reading nearby")

    public static func whoLine(_ x: Double) -> String { "\(jsNumber(x))× the WHO daily guideline." }
    public static func crowdProvenance(_ n: Int) -> String {
        "Estimate from \(n) community sensor\(n == 1 ? "" : "s") · not a government reading"
    }

    public static var whoBands: [WhoVerdictBand] { SeaTables.shared.whoVerdictBands }

    /// WHO band for an hourly estimate: under 25, 25–50, 50–100, 100 and up.
    public static func whoVerdictBand(_ pm25: Double) -> WhoVerdictBand {
        whoBands.first { pm25 < $0.max } ?? whoBands.last!
    }

    // MARK: Thailand

    static let thTie = ["sensitive", "kids", "exercising", "outdoor_worker", "general"]

    static func thGroup(_ p: Profile) -> String {
        switch p {
        case .elderly, .pregnant, .heartLung: "sensitive"
        default: p.rawValue
        }
    }

    /// 1-hr at least 1.5× (and 15 above) the 24-h average.
    public static func hourAboveDay(_ pm25: Int?, _ avg: Double?) -> Bool {
        guard let pm25, let avg else { return false }
        return Double(pm25) >= max(1.5 * avg, avg + 15)
    }

    static func thaiSecondLine(_ s: CountrySnapshot) -> (en: String, th: String)? {
        if s.stale {
            return ("Reading is from \(SeaTime.formatLocalTime(s.observedAt)). It may not match the air now.",
                    "ค่าที่แสดงเป็นของเวลา \(SeaTime.formatThaiTime(s.observedAt)) อาจไม่ตรงกับอากาศตอนนี้")
        }
        let lvl = s.level ?? 0
        if s.trend.delta >= 20 {
            return lvl >= 1
                ? ("Getting worse. Check again in an hour.", "ค่าฝุ่นกำลังสูงขึ้น ตรวจสอบอีกครั้งในอีกหนึ่งชั่วโมง")
                : ("Rising quickly. Check again in an hour.", "ค่าฝุ่นเพิ่มขึ้นเร็ว ตรวจสอบอีกครั้งในอีกหนึ่งชั่วโมง")
        }
        if hourAboveDay(s.pm25, s.pm25_24h) {
            return ("The last hour is higher than the 24-hour average. Check again in an hour.",
                    "ค่าชั่วโมงล่าสุดสูงกว่าค่าเฉลี่ย 24 ชั่วโมง ตรวจสอบอีกครั้งในอีกหนึ่งชั่วโมง")
        }
        if s.trend.delta <= -20, lvl >= 1 {
            return ("Getting better. Check again in an hour.", "ค่าฝุ่นกำลังลดลง ตรวจสอบอีกครั้งในอีกหนึ่งชั่วโมง")
        }
        return nil
    }

    static func thaiVerdict(_ s: CountrySnapshot, _ ids: [Profile]) -> CountryVerdict? {
        guard let b = s.localBand, b.scaleId == "th_aqi", let row = SeaTables.shared.thaiVerdicts[b.key] else { return nil }
        var pick = thGroup(ids[0]), pickProfile = ids[0]
        for p in ids {
            let g = thGroup(p)
            let a = row[g]!.strict, c = row[pick]!.strict
            if a > c || (a == c && thTie.firstIndex(of: g)! < thTie.firstIndex(of: pick)!) {
                pick = g
                pickProfile = p
            }
        }
        let cell = row[pick]!
        let second = thaiSecondLine(s)
        return CountryVerdict(headline: cell.en, short: cell.short, secondLine: second?.en, forWhom: Profile.forWhom(ids),
                              profile: pickProfile, sensitive: Profile.isSensitive(ids),
                              headlineLocal: cell.th, shortLocal: cell.shortTh, secondLineLocal: second?.th)
    }

    // MARK: Category verdicts (MY, ID, VN, PH)

    static func categoryVerdictCell(_ scaleId: String, _ key: String, _ ids: [Profile]) -> (cell: CategoryCell, profile: Profile)? {
        guard let row = SeaTables.shared.categoryVerdicts[scaleId]?[key] else { return nil }
        var pick = thGroup(ids[0]), pickProfile = ids[0]
        for p in ids {
            let g = thGroup(p)
            let a = row[g]!.sev, c = row[pick]!.sev
            if a > c || (a == c && thTie.firstIndex(of: g)! < thTie.firstIndex(of: pick)!) {
                pick = g
                pickProfile = p
            }
        }
        return (row[pick]!, pickProfile)
    }

    /// Public form for tests: the category's own verdict headline for a profile set.
    public static func categoryHeadline(scaleId: String, key: String, profiles: [Profile]) -> String? {
        categoryVerdictCell(scaleId, key, Profile.normalise(profiles))?.cell.en
    }

    /// Thai verdict headlines for a category (every group), for tests.
    public static func thaiHeadlines(key: String) -> [String] { SeaTables.shared.thaiVerdicts[key]?.values.map(\.en) ?? [] }

    /// "Based on the 24-hr index: …" when the only official figure is a slow 24-hr index.
    public static func hedgedOn24h(_ s: CountrySnapshot) -> Bool {
        s.bandBasis == "official_index" && s.official?.averaging == "24h" && s.pm25Kind != "official_1h"
    }

    static func hedge(_ h: String) -> String { hedge24h + h.prefix(1).lowercased() + String(h.dropFirst()) }

    static func lcFirst(_ x: String) -> String {
        x.range(of: "^[A-Z][a-z]", options: .regularExpression) != nil ? x.prefix(1).lowercased() + String(x.dropFirst()) : x
    }

    // MARK: Headline for any snapshot

    public static func verdict(_ s: CountrySnapshot, profiles: some Sequence<Profile> = [Profile.general]) -> CountryVerdict {
        var v = base(s, Profile.normalise(profiles))
        guard s.bandFromEstimate else { return v }
        v.headline = estimatePrefix.en + lcFirst(v.headline)
        v.short = estimatePrefix.short + lcFirst(v.short)
        if let l = v.headlineLocal { v.headlineLocal = estimatePrefix.th + l }
        v.estimate = true
        return v
    }

    static func staleLine(_ s: CountrySnapshot) -> String {
        "Reading is from \(SeaTime.formatLocalTime(s.observedAt)). It may not match the air now."
    }

    static func base(_ s: CountrySnapshot, _ ids: [Profile]) -> CountryVerdict {
        let hedged = hedgedOn24h(s)
        if s.country == .TH, var v = thaiVerdict(s, ids) {
            if hedged { v.headline = hedge(v.headline); v.hedged = true }
            v.needsReview = true
            return v
        }
        if s.country != .SG, let b = s.localBand, let cat = categoryVerdictCell(b.scaleId, b.key, ids) {
            var secondLine: String?
            if s.stale { secondLine = staleLine(s) }
            else if s.trend.delta >= 20, s.pm25 != nil { secondLine = "Rising quickly. Check again in an hour." }
            else if s.bandBasis == "official_index", hourAboveDay(s.pm25, s.pm25_24h) {
                secondLine = s.isCrowdEstimate
                    ? "Nearby sensors read higher than the 24-hour average. Check again in an hour."
                    : "The last hour is higher than the 24-hour average. Check again in an hour."
            } else if s.trend.delta <= -20, s.pm25 != nil, cat.cell.sev >= 1 { secondLine = "Getting better. Check again in an hour." }
            return CountryVerdict(headline: hedged ? hedge(cat.cell.en) : cat.cell.en, short: cat.cell.short, secondLine: secondLine,
                                  forWhom: Profile.forWhom(ids), profile: cat.profile, sensitive: Profile.isSensitive(ids),
                                  hedged: hedged, needsReview: true)
        }
        if let band = s.band {
            let v = HazeCompute.verdict(band: band, profiles: ids, trend: s.trend, stale: s.stale, observedAt: s.observedDate,
                                        history: s.historyPoints)
            var second = v.secondLine
            if s.country != .SG, s.stale { second = staleLine(s) }
            else if s.country != .SG, second == nil, s.bandBasis == "official_index", hourAboveDay(s.pm25, s.pm25_24h) {
                second = s.isCrowdEstimate
                    ? "Nearby sensors read higher than the 24-hour average. Check again in an hour."
                    : "The last hour is higher than the 24-hour average. Check again in an hour."
            }
            return CountryVerdict(headline: v.headline, short: v.short, secondLine: second, forWhom: v.forWhom,
                                  profile: v.profile, sensitive: v.sensitive)
        }
        if SeaScales.chipScale(s.country) == nil, let pm25 = s.pm25 {
            let w = whoVerdictBand(Double(pm25))
            return CountryVerdict(headline: w.en, short: w.short,
                                  secondLine: s.stale ? staleLine(s) : whoLine(s.whoMultiple ?? 0),
                                  forWhom: Profile.forWhom(ids), profile: ids[0], sensitive: Profile.isSensitive(ids), whoBased: true)
        }
        // No number and nothing official to band: never the caveat strings here.
        return CountryVerdict(headline: noReading.headline, short: noReading.short, secondLine: s.whoMultiple.map(whoLine),
                              forWhom: Profile.forWhom(ids), profile: ids[0], sensitive: Profile.isSensitive(ids))
    }

    // MARK: Actions (COPY §20 tips)

    static func severityBand(_ sev: Int) -> Band { sev == 0 ? .normal : sev <= 2 ? .elevated : sev == 3 ? .high : .veryHigh }

    static func atOrAboveUnhealthy(_ scaleId: String, _ key: String) -> Bool {
        guard let from = SeaTables.shared.unhealthyFrom[scaleId], let bands = SeaScales.scale(scaleId)?.bands,
              let i = bands.firstIndex(where: { $0.key == key }), let f = bands.firstIndex(where: { $0.key == from }) else { return false }
        return i >= f
    }

    /// Band driving "What helps now" and notifications outside SG: by the authority's advice severity.
    public static func adviceBand(_ s: CountrySnapshot) -> Band? {
        if s.country == .SG { return s.band }
        guard let b = s.localBand, let sev = SeaTables.shared.categorySeverity[b.scaleId]?[b.key] else { return s.band }
        var band = severityBand(max(sev.general, sev.sensitive >= 3 ? 2 : 0))
        if atOrAboveUnhealthy(b.scaleId, b.key), band < .high { band = .high }
        return band
    }

    public static func emergencyNumber(_ cc: CountryCode) -> String { SeaTables.shared.emergencyNumber[cc.rawValue] ?? "112" }

    /// COPY §5 actions for `adviceBand`, with the local emergency number.
    public static func actions(_ s: CountrySnapshot, profiles: some Sequence<Profile> = [Profile.general], max: Int = 3) -> [String] {
        guard let band = adviceBand(s) else { return [] }
        let list = HazeCompute.actions(band: band, profiles: profiles, max: max)
        if s.country == .SG { return list }
        return list.map { $0.replacingOccurrences(of: #"call 995\b"#, with: "call \(emergencyNumber(s.country))", options: .regularExpression) }
    }
}
