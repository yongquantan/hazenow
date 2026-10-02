package sg.hazenow.core.sea

import org.junit.Test
import sg.hazenow.core.Profile
import sg.hazenow.core.sea.SeaTestUtil.NOW
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNotNull
import kotlin.test.assertNull
import kotlin.test.assertTrue

/**
 * Port of packages/core/test/headlines.test.ts. SPEC principle 1: the headline always answers "is it OK to be out?".
 * Caveats ("No official reading near here", "There's no official air-quality scale here", "official data isn't
 * responding") go under the number, never in it.
 */
class SeaHeadlineTest {
    private val profiles: List<Set<Profile>> = listOf(
        setOf(Profile.GENERAL), setOf(Profile.KIDS), setOf(Profile.ELDERLY), setOf(Profile.EXERCISING), setOf(Profile.OUTDOOR_WORK),
        setOf(Profile.KIDS, Profile.ELDERLY),
    )
    private val forbidden = listOf(Verdicts.NO_OFFICIAL_HEADLINE, Verdicts.NO_SCALE_HEADLINE)

    private val snaps: List<Pair<String, CountrySnapshot>> by lazy {
        buildList {
            for (cc in listOf("th", "my", "id", "vn", "ph", "la", "kh")) {
                val set = SeaTestUtil.preview(cc)
                for (p in SeaPlaces.PLACES.filter { it.country.name == cc.uppercase() && CountryUi.cityLive(it, true) }) {
                    runCatching { CountryBuilder.build(set, SeaPlaces.placeQuery(p), NOW) }.onSuccess { add(p.name to it) }
                }
            }
        }
    }

    private fun snap(name: String) = snaps.first { it.first == name }.second

    @Test
    fun noHeadlineIsACaveat() {
        assertTrue(snaps.size > 50)
        for ((name, s) in snaps) for (p in profiles) {
            val v = Verdicts.countryVerdict(s, p)
            assertFalse(v.headline in forbidden, "$name: ${v.headline}")
            assertFalse(v.headline.contains("isn't responding"), name)
        }
    }

    @Test
    fun aSnapshotWithNoNumberStillDoesntUseThem() {
        val empty = snaps[0].second.copy(pm25 = null, band = null, level = null, localBand = null, bandBasis = "none", official = null, pm25Kind = null, bandFromEstimate = false)
        for (cc in listOf(CountryCode.TH, CountryCode.LA)) {
            val h = Verdicts.countryVerdict(empty.copy(country = cc)).headline
            assertFalse(h in forbidden, h)
            assertEquals("Can't say for here right now.", h)
        }
    }

    @Test
    fun caveatsAppearOnlyUnderTheNumber() {
        val subs = snaps.map { CountryUi.countryDisplay(it.second).numberSub }
        assertTrue(subs.any { it.startsWith("No official reading near here ·") }) // Pai
        assertTrue(subs.any { it.startsWith("There's no official air-quality scale here ·") }) // Vientiane, Siem Reap
    }

    @Test
    fun estimatesFollowTheAuthoritysCategory() {
        var n = 0
        for ((name, s) in snaps) {
            if (!s.bandFromEstimate) continue
            n++
            assertEquals("crowd_estimate", s.pm25Kind, name)
            val b = Scales.classifyPm25(s.localBand!!.scaleId, s.pm25!!.toDouble())!!
            assertEquals(b.key, s.localBand!!.key, name)
            for (p in profiles) {
                val v = Verdicts.countryVerdict(s, p)
                assertTrue(v.estimate)
                val plain = Verdicts.countryVerdict(s.copy(bandFromEstimate = false), p)
                assertEquals(Verdicts.ESTIMATE_PREFIX + plain.headline.first().lowercase() + plain.headline.drop(1), v.headline, name)
                assertTrue(v.short.startsWith(Verdicts.ESTIMATE_PREFIX_SHORT))
            }
            val d = CountryUi.countryDisplay(s)
            assertEquals(true, d.chip?.estimate)
            assertEquals("Community sensors · estimate", d.kindLabel)
        }
        assertTrue(n >= 10, "only $n estimates")
    }

    @Test
    fun paiGetsPcdsCategoryAndBothCaveatsUnderneath() {
        val pai = snap("Pai")
        assertEquals("th_aqi", pai.localBand?.scaleId)
        assertTrue(Verdicts.countryVerdict(pai).headline.startsWith("Estimate: fine"))
        val d = CountryUi.countryDisplay(pai)
        assertEquals("No official reading near here · community sensors estimate", d.numberSub)
        assertEquals("PCD category, applied to the community-sensor estimate", d.chip?.basisNote)
        assertTrue(d.notices[0].contains("no official station within 25 km"))
    }

    @Test
    fun anOfficialNumberIsNeverPrefixed() {
        for ((_, s) in snaps) if (s.pm25Kind == "official_1h") assertFalse(Verdicts.countryVerdict(s).headline.startsWith(Verdicts.ESTIMATE_PREFIX))
    }

    @Test
    fun whoBandsBoundaries() {
        fun at(v: Double) = Verdicts.whoVerdictBand(v).en
        assertEquals("Likely fine to be out.", at(0.0))
        assertEquals("Likely fine to be out.", at(24.9))
        assertEquals("Likely OK. Sensitive people, go easy.", at(25.0))
        assertEquals("Likely OK. Sensitive people, go easy.", at(49.9))
        assertEquals("Go easy outdoors for now.", at(50.0))
        assertEquals("Go easy outdoors for now.", at(99.9))
        assertEquals("Limit time outside for now.", at(100.0))
        assertEquals("Limit time outside for now.", at(800.0))
        assertEquals(listOf(0, 1, 2, 3), Verdicts.WHO_VERDICT_BANDS.map { it.sev })
    }

    @Test
    fun noScaleCountriesGetWhoVerdictsAndChip() {
        for (name in listOf("Siem Reap", "Vientiane", "Luang Prabang")) {
            val s = snap(name)
            assertNull(Scales.CHIP_SCALE[s.country])
            val v = Verdicts.countryVerdict(s)
            assertTrue(v.whoBased, name)
            assertEquals(Verdicts.whoVerdictBand(s.pm25!!).en, v.headline)
            val d = CountryUi.countryDisplay(s)
            assertEquals("WHO guide: ${Verdicts.whoVerdictBand(s.pm25!!).word}", d.chip?.en)
            assertNotNull(d.whoLine)
            assertTrue(d.whoLine!!.contains("× the WHO daily guideline"))
            assertEquals("There's no official air-quality scale here · community sensors estimate", d.numberSub)
        }
    }

    @Test
    fun specScaleVectors() {
        assertEquals("sedang", Scales.classifyPm25("id_ispu", 55.4)!!.key)
        assertEquals("tidak_sehat", Scales.classifyPm25("id_ispu", 55.5)!!.key)
        assertEquals("ดีมาก", Scales.classifyPm25("th_aqi", 15.0)!!.labelLocal)
        assertEquals("ดี", Scales.classifyPm25("th_aqi", 15.1)!!.labelLocal)
        assertEquals(2, Scales.classifyPm25("th_aqi", 37.6)!!.level)
        assertEquals(2, Scales.classifyIndex("th_aqi", 101.0)!!.level)
        assertEquals("Sederhana", Scales.classifyIndex("my_api", 100.0)!!.labelLocal)
        assertEquals("Tidak Sihat", Scales.classifyIndex("my_api", 101.0)!!.labelLocal)
        assertEquals("Xấu", Scales.classifyIndex("vn_aqi", 151.0)!!.labelLocal)
        assertEquals("usg", Scales.classifyPm25("ph_dao_2020_14", 35.1)!!.key)
        assertEquals(46.5, Scales.myApiToPm25(95.0))
        assertEquals(47.3, Scales.myApiToPm25(96.0))
        assertEquals(27.7, Scales.myApiToPm25(71.0))
        assertEquals(37.9, Scales.myApiToPm25(84.0))
        assertEquals(110.8, Crowd.epaExtended(140.0, 58.0), 0.05)
        assertEquals(11.95, Crowd.epaExtended(25.0, 80.0), 0.01)
    }
}
