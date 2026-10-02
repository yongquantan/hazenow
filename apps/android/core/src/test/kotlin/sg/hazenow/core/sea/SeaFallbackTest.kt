package sg.hazenow.core.sea

import org.junit.Test
import sg.hazenow.core.HazeApi
import sg.hazenow.core.sea.SeaTestUtil.NOW
import java.io.IOException
import java.util.Collections
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertFalse
import kotlin.test.assertNull
import kotlin.test.assertTrue

/**
 * Port of packages/core/test/timeouts.test.ts: upstream timeouts and official-source fallbacks. Air4Thai is made to
 * fail two ways, a call that throws and one that never answers (and ignores interruption as long as it can).
 */
class SeaFallbackTest {
    private val preview = SeaTestUtil.preview("th")
    private val crowdBody = HazeApi.json.encodeToString(
        ObservationSet.serializer(),
        preview.copy(observations = preview.observations.filter { it.grade == "lowcost" }, attribution = preview.attribution.drop(1)),
    )
    private val aqi = SeaTestUtil.text("sea/th-air4thai-aqi-2026-09-28T17ICT.json")
    private val hist = SeaTestUtil.text("sea/th-air4thai-history-2026-09-28T17ICT.json")
    private val bangkok = SeaPlaces.findCity("bangkok", CountryCode.TH)!!
    private val proxy = "https://edge.example"

    private enum class Mode { OK, REJECT, HANG }

    private class Fake(val air4thai: Mode, val history: Mode = Mode.OK, val proxy: Mode = Mode.OK, val bodies: (String) -> String) : Fetcher {
        val calls: MutableList<String> = Collections.synchronizedList(mutableListOf())
        override fun get(url: String): String {
            calls += url
            val mode = when {
                "getAQI_JSON" in url -> air4thai
                "getHistoryData" in url -> history
                else -> proxy
            }
            when (mode) {
                Mode.REJECT -> throw IOException("certificate has expired")
                Mode.HANG -> { val end = System.currentTimeMillis() + 60_000; while (System.currentTimeMillis() < end) runCatching { Thread.sleep(60_000) } }
                Mode.OK -> {}
            }
            return bodies(url)
        }
    }

    private fun fake(a: Mode, history: Mode = Mode.OK, p: Mode = Mode.OK) = Fake(a, history, p) { url ->
        when {
            "getAQI_JSON" in url -> aqi
            "getHistoryData" in url -> hist
            else -> crowdBody
        }
    }

    private fun th(f: Fetcher, place: CityPlace = bangkok, proxyBase: String? = proxy, timeout: Long = 40) =
        SeaAdapters.snapshot(CountryCode.TH, SeaPlaces.placeQuery(place), f, proxyBase, NOW, timeout)

    private fun quickly(maxMs: Long = 2000, block: () -> Unit) {
        val t0 = System.currentTimeMillis()
        block()
        val took = System.currentTimeMillis() - t0
        assertTrue(took < maxMs, "took $took ms")
    }

    @Test
    fun defaultTimeoutIsAbout8s() = assertEquals(8_000L, Net.UPSTREAM_TIMEOUT_MS)

    @Test
    fun aHangingCallTimesOutQuickly() = quickly(1000) {
        assertFailsWith<UpstreamTimeoutException> { Net.withTimeout(fake(Mode.HANG), 30).get("https://x.example/getAQI_JSON.php") }
    }

    @Test
    fun answersAndErrorsPassThrough() {
        assertEquals("42", Net.withTimeout({ "42" }, 50).get("u"))
        val e = assertFailsWith<IOException> { Net.withTimeout({ throw IOException("boom") }, 50).get("u") }
        assertEquals("boom", e.message)
    }

    @Test
    fun air4thaiFailsBangkokFallsBackToCommunitySensorsLabelled() {
        for (mode in listOf(Mode.REJECT, Mode.HANG)) quickly {
            val s = th(fake(mode))
            assertEquals("crowd_estimate", s.pm25Kind, "$mode")
            assertTrue("official_unavailable" in s.notes)
            assertTrue(s.stations.all { it.grade == "lowcost" && it.distanceKm!! <= 25 })
            assertTrue(s.nearest!!.distanceKm!! <= 10)
            assertEquals(emptyList(), CountryUi.countryDisplay(s).notices)
            val d = CountryUi.countryDisplay(s, "Bangkok")
            assertEquals("Community sensors · estimate", d.kindLabel)
            assertEquals("Thailand's official data isn't responding right now · community sensors estimate", d.numberSub)
            assertTrue(s.bandFromEstimate)
            assertTrue(Verdicts.countryVerdict(s).headline.startsWith("Estimate: "))
            assertEquals(true, d.chip?.estimate)
        }
    }

    @Test
    fun noSensorInRangeThrowsOfficialUnavailableNeverAFarSensor() {
        val k = SeaPlaces.findCity("kanchanaburi", CountryCode.TH)!!
        val e = assertFailsWith<OfficialUnavailableException> { th(fake(Mode.REJECT), k) }
        assertEquals("PCD Air4Thai", e.source)
    }

    @Test
    fun noProxyOrAHangingProxyGivesOfficialUnavailableWithinTheTimeout() {
        quickly { assertFailsWith<OfficialUnavailableException> { th(fake(Mode.HANG), proxyBase = null) } }
        quickly { assertFailsWith<OfficialUnavailableException> { th(fake(Mode.REJECT, p = Mode.HANG)) } }
    }

    @Test
    fun historyHangsSensorsFillInAndTheThaiAqiRowStays() = quickly {
        val s = th(fake(Mode.OK, history = Mode.HANG))
        assertEquals("crowd_estimate", s.pm25Kind)
        assertTrue("official_unavailable" in s.notes)
        assertEquals("PCD", s.official?.agency)
    }

    @Test
    fun air4thaiHealthyOfficialWinsInBangkok() {
        val s = th(fake(Mode.OK), timeout = 5000)
        assertEquals("official_1h", s.pm25Kind)
        assertFalse("official_unavailable" in s.notes)
        assertEquals("Official reading", CountryUi.countryDisplay(s).kindLabel)
        // SPEC v2.0 §11 live fixture: Bangkok 17:00 ICT → pm25 14, Thai AQI 19 ดีมาก, 24 hourly points, 24-h line 11.5.
        assertEquals(14, s.pm25)
        assertEquals("19", s.official?.valueText)
        assertEquals("ดีมาก", s.localBand?.labelLocal)
        assertEquals(24, s.history.size)
        assertEquals(11.5, s.history.last().pm25Avg24h)
        // Only the 6 nearest stations' history is requested, and no location is ever sent to the proxy.
        assertTrue(fake(Mode.OK).let { f -> th(f, timeout = 5000); f.calls.none { "lat" in it || "lon" in it } })
    }

    @Test
    fun aProxiedSetFlaggedOfficialUnavailable() {
        val my = SeaTestUtil.preview("my")
        val crowdOnly = my.copy(observations = my.observations.filter { it.grade == "lowcost" }, officialUnavailable = "DOE Malaysia")
        val kl = CountryBuilder.build(crowdOnly, SeaPlaces.placeQuery(SeaPlaces.findCity("kuala-lumpur", CountryCode.MY)!!), NOW)
        assertEquals("crowd_estimate", kl.pm25Kind)
        assertEquals("Malaysia's official data isn't responding right now · community sensors estimate", CountryUi.countryDisplay(kl).numberSub)
        assertTrue(Verdicts.countryVerdict(kl).headline.startsWith("Estimate: "))
        assertFailsWith<OfficialUnavailableException> {
            CountryBuilder.build(crowdOnly, SeaPlaces.placeQuery(SeaPlaces.findCity("ipoh", CountryCode.MY)!!), NOW)
        }
    }

    @Test
    fun theProxyItselfHangs() = quickly(1000) {
        assertFailsWith<UpstreamTimeoutException> { SeaAdapters.proxied(CountryCode.MY, fake(Mode.OK, p = Mode.HANG), proxy, 40) }
    }

    @Test
    fun proxyUnsetIsAClearErrorNeverFakeData() {
        val e = assertFailsWith<ProxyException> { SeaAdapters.proxied(CountryCode.MY, fake(Mode.OK), null) }
        assertTrue(e.message!!.contains("not configured"))
        assertFalse(CountryUi.cityLive(SeaPlaces.findCity("kuala-lumpur", CountryCode.MY)!!, proxyConfigured = false))
        assertTrue(CountryUi.cityLive(bangkok, proxyConfigured = false))
    }

    @Test
    fun cachedSnapshotIsRejudgedForStaleness() {
        val cached = CountryBuilder.build(preview, SeaPlaces.placeQuery(bangkok), NOW)
        assertFalse(cached.stale)
        assertFalse(CountryBuilder.cached(cached, NOW + 30 * 60_000).stale)
        assertTrue(CountryBuilder.cached(cached, NOW + 3 * 3_600_000).stale)
        assertEquals(cached.pm25, CountryBuilder.cached(cached, NOW).pm25)
    }

    @Test
    fun copyForTheCantReachStateAndTheCachedLine() {
        val none = CountryUi.officialDownCopy(CountryCode.TH)
        assertEquals("Can't reach Thailand's official data right now", none.title)
        assertEquals("We'll try again in a few minutes.", none.line)
        assertNull(none.cachedLine)
        val cached = CountryBuilder.build(preview, SeaPlaces.placeQuery(bangkok), NOW)
        val c = CountryUi.officialDownCopy(CountryCode.TH, cached.observedAt, SeaTime.parseMs(cached.observedAt)!! + 95 * 60_000, 7.0)
        assertEquals("Can't reach Thailand's official data right now. Showing the last reading we got, from 5pm (1 hr ago).", c.cachedLine)
        assertEquals("Can't reach the Philippines' official data right now", CountryUi.officialDownCopy(CountryCode.PH).title)
    }

    @Test
    fun theSnapshotSurvivesTheDiskCache() {
        val s = CountryBuilder.build(preview, SeaPlaces.placeQuery(bangkok), NOW)
        val back = HazeApi.json.decodeFromString(CountrySnapshot.serializer(), HazeApi.json.encodeToString(CountrySnapshot.serializer(), s))
        assertEquals(s, back)
    }
}
