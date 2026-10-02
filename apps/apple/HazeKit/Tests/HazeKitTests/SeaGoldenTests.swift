import Foundation
import Testing
@testable import HazeKit

/// Cross-platform parity for SPEC v2.0/v2.1: `Fixtures/sea/golden-*.json` are TS outputs (scripts/export-sea.ts) for
/// every recorded place × profile, the country guess table and the place search. The Swift port must match exactly.
@Suite("Golden: Southeast Asia (TS parity)")
struct SeaGoldenTests {
    static func fx(_ name: String) throws -> Data {
        let url = try #require(Bundle.module.url(forResource: name, withExtension: "json", subdirectory: "Fixtures/sea"))
        return try Data(contentsOf: url)
    }

    static func preview(_ cc: String) throws -> ObservationSet {
        let url = try #require(Bundle.module.url(forResource: cc, withExtension: "json", subdirectory: "Fixtures/sea/preview"))
        return try JSONDecoder().decode(ObservationSet.self, from: Data(contentsOf: url))
    }

    static let now = SeaTime.parse("2026-09-28T10:30:00Z")!

    static func profiles(_ raw: [String]) -> [Profile] { raw.compactMap(Profile.init(rawValue:)) }

    static func num(_ x: Any?) -> Double? { (x as? NSNumber)?.doubleValue }

    @Test func everyPreviewPlaceMatchesTheTypeScriptBuilderDisplayAndVerdicts() throws {
        let root = try #require(try JSONSerialization.jsonObject(with: Self.fx("golden-places")) as? [String: Any])
        let places = try #require(root["places"] as? [[String: Any]])
        #expect(places.count > 100)
        var sets: [String: ObservationSet] = [:]
        var checked = 0
        for g in places {
            let id = g["id"] as! String, cc = g["country"] as! String, variant = g["variant"] as! String
            let tag = "\(cc):\(id):\(variant)"
            var set = try sets[cc] ?? Self.preview(cc.lowercased())
            sets[cc] = set
            if variant == "down" {
                set.observations = set.observations.filter { $0.grade == "lowcost" }
                set.officialUnavailable = "Official source"
            }
            let place = try #require(SeaPlaces.find(id, country: CountryCode(rawValue: cc)), "\(tag) not in the catalogue")
            let result = Result { try SeaBuild.snapshot(set, query: SeaPlaces.query(place), now: Self.now) }
            if let err = g["error"] as? String {
                switch result {
                case .success: Issue.record("\(tag): expected \(err)")
                case let .failure(e):
                    #expect((err == "OfficialUnavailableError") == (e is OfficialUnavailableError), "\(tag): \(e)")
                }
                continue
            }
            let s = try result.get()
            let x = g["snapshot"] as! [String: Any]
            #expect(s.pm25.map(Double.init) == Self.num(x["pm25"]), "\(tag) pm25")
            #expect(s.band?.rawValue == x["band"] as? String, "\(tag) band")
            #expect(s.localBand?.key == x["localBandKey"] as? String, "\(tag) chip key")
            #expect(s.bandBasis == x["bandBasis"] as? String, "\(tag) bandBasis")
            #expect(s.bandFromEstimate == (x["bandFromEstimate"] as? Bool), "\(tag) bandFromEstimate")
            #expect(s.pm25Kind == x["pm25Kind"] as? String, "\(tag) pm25Kind")
            #expect(s.official?.value == Self.num(x["officialValue"]), "\(tag) official")
            #expect(s.pm25_24h == Self.num(x["pm25_24h"]), "\(tag) pm25_24h")
            #expect(s.range == (x["range"] as? [Int]), "\(tag) range")
            #expect(s.whoMultiple == Self.num(x["whoMultiple"]), "\(tag) whoMultiple")
            #expect(s.notes == (x["notes"] as? [String]), "\(tag) notes")
            #expect(s.observedAt == x["observedAt"] as? String, "\(tag) observedAt")
            #expect(s.stale == (x["stale"] as? Bool), "\(tag) stale")
            #expect(s.nearest?.stationId == x["nearest"] as? String, "\(tag) nearest")
            #expect(s.stations.map(\.stationId) == (x["stations"] as? [String]), "\(tag) stations")
            #expect(s.attribution.map(\.id) == (x["attribution"] as? [String]), "\(tag) attribution")
            let hist = (x["history"] as? [[Any]]) ?? []
            #expect(s.history.map(\.time) == hist.map { $0[0] as! String }, "\(tag) history times")
            #expect(s.history.map { Double($0.pm25) } == hist.map { Self.num($0[1])! }, "\(tag) history values")
            #expect(s.history.map(\.pm25Avg24h) == hist.map { Self.num($0[2]) }, "\(tag) history line")
            let tr = x["trend"] as! [String: Any]
            #expect(Double(s.trend.delta) == Self.num(tr["delta"]) && s.trend.direction.rawValue == tr["direction"] as? String, "\(tag) trend")

            let dx = g["display"] as! [String: Any]
            let d = SeaDisplay.display(s, placeName: place.name, lon: place.lon)
            #expect(d.numberSub == dx["numberSub"] as? String, "\(tag) numberSub")
            #expect(d.kindLabel == dx["kindLabel"] as? String, "\(tag) kindLabel")
            #expect(d.provenance == dx["provenance"] as? String, "\(tag) provenance")
            #expect(d.official?.text == dx["official"] as? String, "\(tag) official row")
            #expect(d.officialExplainer == dx["officialExplainer"] as? String, "\(tag) explainer")
            #expect(d.whoLine == dx["whoLine"] as? String, "\(tag) whoLine")
            #expect(d.sensorLine == dx["sensorLine"] as? String, "\(tag) sensorLine")
            #expect(d.notices == (dx["notices"] as? [String]), "\(tag) notices")
            let nn = dx["noNumber"] as? [String: Any]
            #expect(d.noNumberTitle == nn?["title"] as? String && d.noNumberLine == nn?["line"] as? String, "\(tag) noNumber")
            let chip = dx["chip"] as? [String: Any]
            #expect(d.chip?.en == chip?["en"] as? String, "\(tag) chip en")
            #expect(d.chip?.local == chip?["local"] as? String, "\(tag) chip local")
            #expect(d.chip?.basisNote == chip?["basisNote"] as? String, "\(tag) chip note")
            #expect(d.chip?.color == chip?["color"] as? String, "\(tag) chip colour")
            #expect(d.chip?.estimate == chip?["estimate"] as? Bool, "\(tag) chip estimate")
            #expect(SeaVerdicts.adviceBand(s)?.rawValue == g["adviceBand"] as? String, "\(tag) adviceBand")

            for v in g["verdicts"] as! [[String: Any]] {
                let p = Self.profiles(v["profiles"] as! [String])
                let cv = SeaVerdicts.verdict(s, profiles: p)
                let t = "\(tag) \(p.map(\.rawValue))"
                #expect(cv.headline == v["headline"] as? String, "\(t) headline")
                #expect(cv.short == v["short"] as? String, "\(t) short")
                #expect(cv.secondLine == v["secondLine"] as? String, "\(t) secondLine")
                #expect(cv.headlineLocal == v["headlineLocal"] as? String, "\(t) headlineLocal")
                #expect(cv.estimate == (v["estimate"] as? Bool) && cv.whoBased == (v["whoBased"] as? Bool) && cv.hedged == (v["hedged"] as? Bool), "\(t) flags")
                #expect(SeaVerdicts.actions(s, profiles: p) == (v["actions"] as? [String]), "\(t) actions")
            }
            checked += 1
        }
        #expect(checked > 60)
    }

    @Test func countryGuessMatchesTheTypeScriptTable() throws {
        let rows = try #require(try JSONSerialization.jsonObject(with: Self.fx("golden-guess")) as? [[Any]])
        #expect(rows.count > 3000)
        for r in rows {
            let tz = r[0] as? String, langs = r[1] as! [String], server = r[2] as? String
            let g = CountryGuesser.guess(timeZone: tz, languages: langs, serverCountry: server)
            let tag = "\(tz ?? "nil") \(langs) \(server ?? "-")"
            #expect(g.country?.rawValue == r[3] as? String, "\(tag) country")
            #expect(g.confidence.rawValue == r[4] as? String, "\(tag) confidence")
            #expect(g.reason == r[5] as? String, "\(tag) reason")
            #expect(g.place == r[6] as? String, "\(tag) place")
            #expect(g.placeFromZone == (r[7] as? Bool), "\(tag) placeFromZone")
            let st = SeaPlaces.startPlace(g)
            #expect(st.place.key == r[8] as? String, "\(tag) start place")
            #expect(st.notCoveredFrom?.rawValue == r[9] as? String, "\(tag) notCoveredFrom")
            #expect(st.outside == (r[10] as? Bool) && st.fromZone == (r[11] as? Bool), "\(tag) start flags")
        }
    }

    @Test func placeSearchGroupsAndBordersMatch() throws {
        let root = try #require(try JSONSerialization.jsonObject(with: Self.fx("golden-search")) as? [String: Any])
        for c in root["search"] as! [[String: Any]] {
            let q = c["q"] as! String
            let got = SeaPlaces.search(q).map { "\($0.place.country.rawValue):\($0.place.id):\($0.matched ?? "")" }
            #expect(got == (c["ids"] as? [String]), "search \(q)")
        }
        for c in root["find"] as! [[String: Any]] {
            #expect(SeaPlaces.find(c["q"] as! String)?.id == c["id"] as? String, "find \(c["q"]!)")
        }
        for c in root["groups"] as! [[String: Any]] {
            let g = SeaPlaces.groups(CountryCode(rawValue: c["cc"] as! String)!)
            #expect(g.popular.map(\.id) == (c["popular"] as? [String]), "popular \(c["cc"]!)")
            #expect(g.others.map(\.id) == (c["others"] as? [String]), "others \(c["cc"]!)")
        }
        for c in root["borders"] as! [[String: Any]] {
            let lat = Self.num(c["lat"])!, lon = Self.num(c["lon"])!
            #expect(SeaBorders.countryAt(lat: lat, lon: lon)?.rawValue == c["cc"] as? String, "border \(lat),\(lon)")
        }
    }

    @Test func specVectors() {
        #expect(SeaScales.classifyPm25("id_ispu", 55.4)?.key == "sedang")
        #expect(SeaScales.classifyPm25("id_ispu", 55.5)?.key == "tidak_sehat")
        #expect(SeaScales.classifyPm25("th_aqi", 15.0)?.labelLocal == "ดีมาก")
        #expect(SeaScales.classifyPm25("th_aqi", 15.1)?.labelLocal == "ดี")
        #expect(SeaScales.classifyPm25("th_aqi", 37.6)?.level == 2)
        #expect(SeaScales.classifyIndex("th_aqi", 101)?.level == 2)
        #expect(SeaScales.classifyIndex("my_api", 100)?.labelLocal == "Sederhana")
        #expect(SeaScales.classifyIndex("my_api", 101)?.labelLocal == "Tidak Sihat")
        #expect(SeaScales.classifyIndex("vn_aqi", 151)?.labelLocal == "Xấu")
        #expect(SeaScales.classifyPm25("ph_dao_2020_14", 35.1)?.key == "usg")
        #expect(SeaScales.myApiToPm25(95) == 46.5 && SeaScales.myApiToPm25(96) == 47.3)
        #expect(SeaScales.myApiToPm25(71) == 27.7 && SeaScales.myApiToPm25(84) == 37.9)
    }
}
