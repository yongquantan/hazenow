package sg.hazenow.core.sea

import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.doubleOrNull
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import org.junit.Test
import sg.hazenow.core.HazeApi
import sg.hazenow.core.sea.SeaTestUtil.NOW
import kotlin.test.assertEquals

/**
 * Parity with the TS reference: core/src/test/resources/sea-golden.json is generated from packages/core/src/countries
 * by tools/gen_sea_golden.ts (every catalogue place built from the recorded preview sets, the guess grid, search,
 * picker groups and borders). Every value must match.
 */
class SeaGoldenTest {
    private val golden = HazeApi.json.parseToJsonElement(SeaTestUtil.text("sea-golden.json")).jsonObject

    private fun JsonElement?.s(): String? = (this as? JsonPrimitive)?.takeIf { it !is JsonNull }?.content
    private fun JsonElement?.d(): Double? = (this as? JsonPrimitive)?.doubleOrNull
    private fun JsonElement?.b(): Boolean? = (this as? JsonPrimitive)?.booleanOrNull
    private fun JsonElement?.strings(): List<String>? = (this as? JsonArray)?.map { it.jsonPrimitive.content }

    @Test
    fun everyPlaceMatchesTheReference() {
        val sets = listOf("th", "my", "id", "vn", "ph", "la", "kh").associateWith { SeaTestUtil.preview(it) }
        var checked = 0
        for (e in golden["places"]!!.jsonArray) {
            val g = e.jsonObject
            val cc = CountryCode.valueOf(g["country"].s()!!)
            val id = g["id"].s()!!
            val where = "$cc/$id"
            val place = SeaPlaces.findCity(id, cc)!!
            val set = sets.getValue(cc.name.lowercase())
            val s = runCatching { CountryBuilder.build(set, SeaPlaces.placeQuery(place), NOW) }
            if (g["error"] != null) {
                val name = when (s.exceptionOrNull()) {
                    is OfficialUnavailableException -> "OfficialUnavailableError"
                    is NoCountryDataException -> "NoCountryDataError"
                    else -> "none"
                }
                assertEquals(g["error"].s(), name, where)
                continue
            }
            val snap = s.getOrThrow()
            assertEquals(g["pm25"].d()?.toInt(), snap.pm25, "$where pm25")
            assertEquals(g["band"].s(), snap.band?.id, "$where band")
            assertEquals(g["pm25Kind"].s(), snap.pm25Kind, "$where kind")
            assertEquals(g["bandBasis"].s(), snap.bandBasis, "$where basis")
            assertEquals(g["bandFromEstimate"].b(), snap.bandFromEstimate, "$where fromEstimate")
            assertEquals(g["localBand"].s(), snap.localBand?.key, "$where localBand")
            assertEquals(g["observedAt"].s(), snap.observedAt, "$where observedAt")
            assertEquals(g["stale"].b(), snap.stale, "$where stale")
            assertEquals((g["range"] as? JsonArray)?.map { it.jsonPrimitive.content.toDouble().toInt() }, snap.range, "$where range")
            assertEquals(g["whoMultiple"].d(), snap.whoMultiple, "$where who")
            assertEquals(g["trendDelta"].d()?.toInt(), snap.trend.delta, "$where trend")
            assertEquals(g["historyLen"].d()?.toInt(), snap.history.size, "$where history")
            (g["historyLast"] as? JsonObject)?.let { h ->
                assertEquals(h["time"].s(), snap.history.last().time, "$where history time")
                assertEquals(h["pm25"].d()?.toInt(), snap.history.last().pm25, "$where history pm25")
                assertEquals(h["pm25Avg24h"].d(), snap.history.last().pm25Avg24h, "$where history line")
            }
            assertEquals(g["nearest"].s(), snap.nearest?.stationId, "$where nearest")
            assertEquals(g["stations"].strings(), snap.stations.map { it.stationId }, "$where stations")
            assertEquals(g["official"].s(), snap.official?.let { "${it.agency} ${it.valueText}" }, "$where official")
            assertEquals(g["pm25_24h"].d(), snap.pm25_24h, "$where 24h")
            assertEquals(g["notes"].strings(), snap.notes, "$where notes")
            assertEquals(g["attribution"].strings(), snap.attribution.map { it.id }, "$where attribution")

            for (v in g["verdicts"]!!.jsonArray) {
                val vo = v.jsonObject
                val profiles = vo["profile"].strings()!!.map(SeaTestUtil::profile).toSet()
                val cv = Verdicts.countryVerdict(snap, profiles)
                val w = "$where ${vo["profile"]}"
                assertEquals(vo["headline"].s(), cv.headline, "$w headline")
                assertEquals(vo["short"].s(), cv.short, "$w short")
                assertEquals(vo["secondLine"].s(), cv.secondLine, "$w secondLine")
                assertEquals(vo["forWhom"].s(), cv.forWhom, "$w forWhom")
                assertEquals(vo["headlineLocal"].s(), cv.headlineLocal, "$w headlineLocal")
            }
            assertEquals(g["actions"].strings(), Verdicts.countryActions(snap, setOf(SeaTestUtil.profile("general"))).take(3), "$where actions")
            assertEquals(g["actionsKids"].strings(), Verdicts.countryActions(snap, setOf(SeaTestUtil.profile("kids"))).take(3), "$where actions kids")

            val d = CountryUi.countryDisplay(snap, place.name, 8.0, place.lon)
            val gd = g["display"]!!.jsonObject
            assertEquals(gd["numberSub"].s(), d.numberSub, "$where numberSub")
            assertEquals(gd["kindLabel"].s(), d.kindLabel, "$where kindLabel")
            assertEquals(gd["provenance"].s(), d.provenance, "$where provenance")
            assertEquals(gd["official"].s(), d.official?.text, "$where official row")
            assertEquals(gd["explainer"].s(), d.officialExplainer, "$where explainer")
            assertEquals((gd["noNumber"] as? JsonObject)?.let { it["title"].s() to it["line"].s() }, d.noNumber, "$where noNumber")
            assertEquals(gd["whoLine"].s(), d.whoLine, "$where whoLine")
            assertEquals(gd["sensorLine"].s(), d.sensorLine, "$where sensorLine")
            assertEquals(gd["notices"].strings(), d.notices, "$where notices")
            val gc = gd["chip"] as? JsonObject
            assertEquals(gc?.get("en").s(), d.chip?.en, "$where chip")
            assertEquals(gc?.get("local").s(), d.chip?.local, "$where chip local")
            assertEquals(gc?.get("basisNote").s(), d.chip?.basisNote, "$where chip note")
            assertEquals(gc?.get("estimate").b(), d.chip?.estimate, "$where chip estimate")
            assertEquals(gc?.get("color").s(), d.chip?.color, "$where chip color")
            assertEquals(g["share"].s(), CountryUi.countryShareText(snap, place.name, lon = place.lon), "$where share")
            checked++
        }
        assert(checked > 60) { "only $checked places checked" }
    }

    @Test
    fun countryGuessGridMatchesTheReference() {
        for (e in golden["guesses"]!!.jsonArray) {
            val g = e.jsonObject
            val w = "${g["tz"]} ${g["langs"]} ${g["server"]}"
            val r = Guess.guessCountry(g["tz"].s(), g["langs"].strings(), g["server"].s())
            assertEquals(g["country"].s(), r.country?.name, "$w country")
            assertEquals(g["confidence"].s(), r.confidence, "$w confidence")
            assertEquals(g["place"].s(), r.place, "$w place")
            assertEquals(g["placeFromZone"].b(), r.placeFromZone, "$w fromZone")
            val sp = SeaPlaces.startPlace(r)
            assertEquals(g["start"].s(), sp.place.id, "$w start")
            assertEquals(g["startCountry"].s(), sp.place.country.name, "$w start country")
            assertEquals(g["notCoveredFrom"].s(), sp.notCoveredFrom?.name, "$w notCovered")
            assertEquals(g["outside"].b(), sp.outside, "$w outside")
            assertEquals(g["fromZone"].b(), sp.fromZone, "$w start fromZone")
        }
    }

    @Test
    fun searchGroupsAndBordersMatchTheReference() {
        for (e in golden["searches"]!!.jsonArray) {
            val g = e.jsonObject
            val q = g["q"].s()!!
            assertEquals(g["hits"].strings(), SeaPlaces.searchPlaces(q, 12).map { "${it.place.country}:${it.place.id}:${it.matched ?: ""}" }, "search $q")
        }
        for (e in golden["groups"]!!.jsonArray) {
            val g = e.jsonObject
            val (pop, others) = SeaPlaces.placeGroups(CountryCode.valueOf(g["cc"].s()!!))
            assertEquals(g["popular"].strings(), pop.map { it.id }, "popular ${g["cc"]}")
            assertEquals(g["others"].strings(), others.map { it.id }, "others ${g["cc"]}")
        }
        for (e in golden["borders"]!!.jsonArray) {
            val g = e.jsonObject
            assertEquals(g["cc"].s(), Borders.countryAt(g["lat"].d()!!, g["lon"].d()!!)?.name, "border ${g["lat"]},${g["lon"]}")
        }
    }
}
