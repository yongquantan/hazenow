import Foundation

// Place catalogue (port of countries/places.ts) and the SPEC v2.1 country guess (port of countries/guess.ts).
// The guess reads only the device's time zone and preferred languages: no network, no prompt, never saved.

public enum SeaPlaces {
    /// Every place in the picker: the major cities, then the destinations.
    public static var all: [CityPlace] { SeaTables.shared.places }
    /// Radius for a destination: an official station within 25 km or sensors within 10 km, never farther.
    public static let destinationRadiusKm = 25.0
    /// Countries in picker order.
    public static var pickerCountries: [CountryCode] { SeaTables.shared.pickerCountries }

    public static func slugOf(_ name: String) -> String {
        let folded = String(String.UnicodeScalarView(name.lowercased().decomposedStringWithCanonicalMapping.unicodeScalars
            .filter { !(0x300...0x36F).contains($0.value) }))
        var out = ""
        var dash = false
        for ch in folded.unicodeScalars {
            let isAlnum = (ch.value >= 97 && ch.value <= 122) || (ch.value >= 48 && ch.value <= 57)
            if isAlnum {
                if dash, !out.isEmpty { out.append("-") }
                dash = false
                out.unicodeScalars.append(ch)
            } else { dash = true }
        }
        return out
    }

    /// Search key: lower case, accents and punctuation dropped, "koh" folded to "ko".
    public static func searchKey(_ s: String) -> String {
        slugOf(s).replacingOccurrences(of: "-", with: " ")
            .replacingOccurrences(of: #"\bkoh\b"#, with: "ko", options: .regularExpression)
            .trimmingCharacters(in: .whitespaces)
    }

    public static func cities(_ cc: CountryCode) -> [CityPlace] { all.filter { $0.country == cc } }

    /// The "Popular" subgroup (islands/areas kept together) and the other cities.
    public static func groups(_ cc: CountryCode) -> (popular: [CityPlace], others: [CityPlace]) {
        let list = cities(cc)
        let pop = list.filter(\.isPopular)
        let key = { (c: CityPlace) in (c.region ?? c.name).lowercased() }
        var order: [String] = []
        for c in pop where !order.contains(key(c)) { order.append(key(c)) }
        let popular = order.flatMap { k in pop.filter { key($0) == k } }
        return (popular, list.filter { !$0.isPopular })
    }

    /// A place by slug, name or alias, optionally within one country. Names win over aliases.
    public static func find(_ query: String, country: CountryCode? = nil) -> CityPlace? {
        let q = slugOf(query)
        guard !q.isEmpty else { return nil }
        let pool = all.filter { country == nil || $0.country == country }
        let flat = { (x: String) in x.replacingOccurrences(of: "-", with: "") }
        return pool.first { $0.id == q || flat($0.id) == flat(q) }
            ?? pool.first { c in (c.aliases ?? []).contains { slugOf($0) == q || flat(slugOf($0)) == flat(q) } }
    }

    public struct Match: Sendable, Hashable {
        public var place: CityPlace
        /// The alias or region that matched, when it wasn't the name ("Bali", "KL").
        public var matched: String?
    }

    /// Picker search across every country (SG areas are searched separately): exact name, exact alias/region,
    /// name prefix, alias prefix, then substring.
    public static func search(_ query: String, limit: Int = 12, country: CountryCode? = nil) -> [Match] {
        let q = searchKey(query)
        guard !q.isEmpty else { return [] }
        var scored: [(m: Match, score: Int, i: Int)] = []
        for (i, c) in all.enumerated() {
            if let country, c.country != country { continue }
            if c.country == .SG { continue }
            let name = searchKey(c.name)
            let alts = (c.aliases ?? []) + (c.region.map { [$0] } ?? [])
            var score = -1
            var matched: String?
            let exact = alts.first { searchKey($0) == q }
            let prefix = alts.first { searchKey($0).hasPrefix(q) }
            if name == q { score = 0 }
            else if let exact { score = 1; matched = exact }
            else if name.hasPrefix(q) { score = 2 }
            else if let prefix { score = 3; matched = prefix }
            else if q.count >= 3, name.contains(q) { score = 4 }
            if score >= 0 { scored.append((Match(place: c, matched: matched), score, i)) }
        }
        scored.sort { $0.score != $1.score ? $0.score < $1.score : $0.i < $1.i }
        return scored.prefix(limit).map(\.m)
    }

    /// Query for a picked place: its point, and for a destination the hard radius.
    public static func query(_ c: CityPlace) -> CountryQuery {
        c.isPopular ? CountryQuery(lat: c.lat, lon: c.lon, withinKm: destinationRadiusKm) : CountryQuery(lat: c.lat, lon: c.lon)
    }

    /// COVERAGE.md words for the picker's status chip.
    public static func coverageLabel(_ c: CityPlace) -> String {
        switch c.status {
        case .liveDirect: "Live now (direct)"
        case .needsProxy: c.crowdOnly == true ? "Community sensors only" : "Needs proxy"
        default: "Not available yet"
        }
    }

    public static func defaultCity(_ cc: CountryCode) -> CityPlace {
        let d = SeaRegistry.info(cc).defaultPlace
        return all.first { $0.country == cc && $0.name == d.name && $0.destination != true } ?? cities(cc)[0]
    }

    static func covered(_ c: CityPlace) -> Bool { c.status == .liveDirect || c.status == .needsProxy }

    /// Nearest covered major city (for a guessed country we don't cover yet).
    public static func nearestCoveredCity(lat: Double, lon: Double) -> CityPlace {
        let d2 = { (c: CityPlace) in pow(c.lat - lat, 2) + pow((c.lon - lon) * cos(lat * .pi / 180), 2) }
        let list = all.filter { $0.destination != true && covered($0) }
        return list.dropFirst().reduce(list[0]) { d2($1) < d2($0) ? $1 : $0 }
    }

    public struct StartPlace: Sendable, Hashable {
        public var place: CityPlace
        /// The guessed country isn't covered yet: `place` is the nearest covered city instead.
        public var notCoveredFrom: CountryCode?
        /// No SEA country guessed: `place` is Singapore.
        public var outside: Bool
        /// `place` is the time zone's suggestion (Asia/Makassar → Denpasar), not the country default.
        public var fromZone: Bool
    }

    /// SPEC v2.1 §3.
    public static func startPlace(_ g: CountryGuess) -> StartPlace {
        let sg = defaultCity(.SG)
        guard let cc = g.country else { return StartPlace(place: sg, notCoveredFrom: nil, outside: true, fromZone: false) }
        if let p = g.place, let s = find(p, country: cc), covered(s) {
            return StartPlace(place: s, notCoveredFrom: nil, outside: false, fromZone: g.placeFromZone)
        }
        let def = defaultCity(cc)
        if covered(def) { return StartPlace(place: def, notCoveredFrom: nil, outside: false, fromZone: false) }
        return StartPlace(place: nearestCoveredCity(lat: def.lat, lon: def.lon), notCoveredFrom: cc, outside: false, fromZone: false)
    }

    /// Calm "Not available yet" copy for needs-permission / not-feasible places.
    public static func notAvailable(_ c: CityPlace) -> (headline: String, reason: String, fix: String?) {
        let detail = c.status == .needsPermission ? SeaDisplay.needsPermissionDetail : SeaDisplay.notFeasibleDetail
        return (SeaDisplay.notAvailableHeadline, c.reason ?? detail, c.fix)
    }
}

// MARK: - Country guess (SPEC v2.1)

public enum GuessConfidence: String, Codable, Sendable { case high, medium, low }

public struct CountryGuess: Sendable, Hashable {
    public var country: CountryCode?
    public var confidence: GuessConfidence
    public var reason: String
    public var place: String?
    public var placeFromZone: Bool
}

public enum CountryGuesser {
    struct Zone { var cc: CountryCode; var place: String? = nil; var shared: [CountryCode]? = nil }

    static let zones: [String: Zone] = [
        "Asia/Singapore": Zone(cc: .SG), "Singapore": Zone(cc: .SG),
        "Asia/Bangkok": Zone(cc: .TH, shared: [.VN, .LA, .KH]),
        "Asia/Kuala_Lumpur": Zone(cc: .MY), "Asia/Kuching": Zone(cc: .MY, place: "kuching"),
        "Asia/Jakarta": Zone(cc: .ID), "Asia/Pontianak": Zone(cc: .ID, place: "pontianak"),
        "Asia/Makassar": Zone(cc: .ID, place: "denpasar"), "Asia/Ujung_Pandang": Zone(cc: .ID, place: "denpasar"),
        "Asia/Jayapura": Zone(cc: .ID),
        "Asia/Ho_Chi_Minh": Zone(cc: .VN), "Asia/Saigon": Zone(cc: .VN),
        "Asia/Manila": Zone(cc: .PH), "Asia/Vientiane": Zone(cc: .LA), "Asia/Phnom_Penh": Zone(cc: .KH),
        "Asia/Yangon": Zone(cc: .MM), "Asia/Rangoon": Zone(cc: .MM), "Asia/Brunei": Zone(cc: .BN), "Asia/Dili": Zone(cc: .TL),
    ]

    public static let defaultPlace: [CountryCode: String] = [
        .SG: "singapore", .TH: "bangkok", .MY: "kuala-lumpur", .ID: "jakarta", .VN: "hanoi", .PH: "metro-manila",
        .LA: "vientiane", .KH: "siem-reap", .MM: "yangon", .BN: "bandar-seri-begawan", .TL: "dili",
    ]

    static let languages: [String: CountryCode] = [
        "th": .TH, "vi": .VN, "id": .ID, "in": .ID, "ms": .MY, "fil": .PH, "tl": .PH, "lo": .LA, "km": .KH, "my": .MM, "tet": .TL,
    ]

    static let names: [CountryCode: String] = [
        .SG: "Singapore", .TH: "Thailand", .MY: "Malaysia", .ID: "Indonesia", .VN: "Vietnam", .PH: "the Philippines",
        .LA: "Laos", .KH: "Cambodia", .MM: "Myanmar", .BN: "Brunei", .TL: "Timor-Leste",
    ]

    /// The country a language tag points at: its SEA region subtag ("en-SG"), else the language ("th").
    public static func languageCountry(_ tag: String) -> CountryCode? {
        let parts = tag.trimmingCharacters(in: .whitespaces).replacingOccurrences(of: "_", with: "-").split(separator: "-", omittingEmptySubsequences: false).map(String.init)
        let lang = (parts.first ?? "").lowercased()
        let region = parts.dropFirst().first { $0.count == 2 && $0.allSatisfy { $0.isASCII && $0.isLetter } }?.uppercased()
        if let region, let cc = CountryCode(rawValue: region) { return cc }
        return languages[lang]
    }

    static func firstLanguage(_ list: [String]) -> (cc: CountryCode, tag: String)? {
        for tag in list { if let cc = languageCountry(tag) { return (cc, tag) } }
        return nil
    }

    static func isOtherZone(_ tz: String) -> Bool {
        tz.range(of: #"^(Africa|America|Antarctica|Asia|Atlantic|Australia|Europe|Indian|Pacific)/[A-Za-z_\-/+0-9]+$"#,
                 options: .regularExpression) != nil
    }

    static func make(_ country: CountryCode?, _ c: GuessConfidence, _ reason: String, _ zone: Zone? = nil) -> CountryGuess {
        let fromZone = country != nil && zone?.place != nil && zone?.cc == country
        return CountryGuess(country: country, confidence: c, reason: reason,
                            place: country.map { fromZone ? zone!.place! : defaultPlace[$0]! }, placeFromZone: fromZone)
    }

    /// Port of `guessCountry` (serverCountry is web-only; kept for parity and tests).
    public static func guess(timeZone: String?, languages langs: [String], serverCountry: String? = nil) -> CountryGuess {
        let tz = (timeZone ?? "").trimmingCharacters(in: .whitespaces)
        let zone = zones[tz]
        let lang = firstLanguage(langs)
        let raw = (serverCountry ?? "").trimmingCharacters(in: .whitespaces).uppercased()
        let server = raw.count == 2 && raw.allSatisfy({ $0.isASCII && $0.isLetter }) && raw != "XX" && raw != "T1" ? raw : nil
        let seaServer = server.flatMap(CountryCode.init(rawValue:))
        let n = { (c: CountryCode) in names[c]! }

        if let zone, let shared = zone.shared {
            let candidates = [zone.cc] + shared
            let list = "Thailand, Vietnam, Laos and Cambodia"
            if let s = seaServer, candidates.contains(s) {
                return make(s, .high, "\(tz) is used in \(list); the connection is in \(n(s)).", zone)
            }
            if let lang, candidates.contains(lang.cc) {
                return lang.cc == zone.cc
                    ? make(zone.cc, .high, "\(tz) with \(lang.tag) points at \(n(zone.cc)).", zone)
                    : make(lang.cc, .medium, "\(tz) is used in \(list); the language \(lang.tag) points at \(n(lang.cc)).", zone)
            }
            return make(zone.cc, .low, "\(tz) is also used in Vietnam, Laos and Cambodia, and no language settles it.", zone)
        }
        if let zone {
            let cc = zone.cc
            guard let lang, lang.cc != cc else {
                return make(cc, .high, "Time zone \(tz) is \(n(cc))\(lang.map { ", and \($0.tag) agrees" } ?? "").", zone)
            }
            if seaServer == cc { return make(cc, .high, "Time zone \(tz) and the connection agree on \(n(cc)).", zone) }
            if seaServer == lang.cc { return make(lang.cc, .high, "The language \(lang.tag) and the connection agree on \(n(lang.cc)).", zone) }
            return make(cc, .medium, "Time zone \(tz) says \(n(cc)), but the language \(lang.tag) says \(n(lang.cc)).", zone)
        }
        if !tz.isEmpty, isOtherZone(tz) {
            if let s = seaServer { return make(s, .medium, "Time zone \(tz) is outside Southeast Asia, but the connection is in \(n(s)).") }
            if let server { return make(nil, .high, "Time zone \(tz) and the connection (\(server)) are outside Southeast Asia.") }
            return make(nil, .medium, "Time zone \(tz) is outside Southeast Asia.")
        }
        if let s = seaServer { return make(s, .medium, "No usable time zone; the connection is in \(n(s)).") }
        if let server { return make(nil, .high, "No usable time zone; the connection (\(server)) is outside Southeast Asia.") }
        if let lang { return make(lang.cc, .low, "No usable time zone; only the language \(lang.tag) points at \(n(lang.cc)).") }
        return make(nil, .low, "No usable time zone or language.")
    }

    /// The device's own signals (SPEC v2.1 §6): `TimeZone.current` and `Locale.preferredLanguages`. No network.
    public static func device() -> CountryGuess {
        guess(timeZone: TimeZone.current.identifier, languages: Locale.preferredLanguages)
    }
}
