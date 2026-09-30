package sg.hazenow.core

import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.int
import java.time.Instant
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNotNull
import kotlin.test.assertNull
import kotlin.test.assertTrue

class HazeCoreTest {
    private fun fixture(name: String): String =
        requireNotNull(javaClass.classLoader.getResource(name)) { "missing fixture $name" }.readText()

    private val latest = HazeApi.parse(fixture("pm25-latest.json"))
    private val today = HazeApi.parse(fixture("pm25-2026-09-28.json"))
    private val yesterday = HazeApi.parse(fixture("pm25-2026-09-27.json"))
    private val psi = HazeApi.parse(fixture("psi-latest.json"))
    private val now: Instant = Instant.parse("2026-09-28T08:35:00Z") // 16:35 SGT

    private fun snap(sel: Selection, pm: List<ApiResponse> = listOf(latest, today, yesterday), p: ApiResponse? = psi) =
        assertNotNull(HazeCore.snapshot(pm, p, sel, now))

    /** Build a single-hour pm25 response from a raw readings JSON fragment. */
    private fun single(readings: String, ts: String = "2026-09-28T16:00:00+08:00") = HazeApi.parse(
        """{"code":0,"data":{"regionMetadata":[],"items":[{"date":"2026-09-28",
           "updatedTimestamp":"2026-09-28T16:30:40+08:00","timestamp":"$ts",
           "readings":{"pm25_one_hourly":$readings}}]},"errorMsg":""}""",
    )

    // ---- SPEC test vectors ----

    @Test fun regionSouth() {
        val s = snap(Selection.Region("south"))
        assertEquals(105, s.pm25); assertEquals(Band.ELEVATED, s.band); assertEquals(153, s.instantPsi)
        assertEquals(LocationMode.REGION, s.locationMode); assertEquals("south", s.nearestRegion)
        assertEquals("Unhealthy", s.instantPsiLabel)
        assertEquals(84, s.officialPsi24h)
    }

    @Test fun regionWest() {
        val s = snap(Selection.Region("west"))
        assertEquals(117, s.pm25); assertEquals(Band.ELEVATED, s.band); assertEquals(165, s.instantPsi)
    }

    @Test fun regionNorth() {
        val s = snap(Selection.Region("north"))
        assertEquals(49, s.pm25); assertEquals(Band.NORMAL, s.band); assertEquals(93, s.instantPsi)
        assertEquals("Moderate", s.instantPsiLabel)
    }

    @Test fun defaultRegionIsCentral() {
        val s = snap(Selection.Region())
        assertEquals(105, s.pm25); assertEquals("central", s.nearestRegion)
    }

    @Test fun southOfflineFallsBackToIslandMean() {
        val r = single("""{"north":49,"south":-1,"west":117,"east":83,"central":105}""")
        val s = snap(Selection.Region("south"), listOf(r), null)
        assertEquals(89, s.pm25) // (49+117+83+105)/4 = 88.5 -> 89
        assertEquals(LocationMode.ISLAND, s.locationMode) // flagged
        assertNull(s.regions.getValue("south").pm25) // never display -1
        assertNull(s.officialPsi24h)
    }

    @Test fun nullAndMissingAndNegativeAreExcluded() {
        val r = single("""{"north":null,"south":-5,"west":117,"central":"n/a"}""")
        val s = snap(Selection.Region("north"), listOf(r), null)
        assertEquals(117, s.pm25)
        assertEquals(LocationMode.ISLAND, s.locationMode)
        assertEquals("west", s.nearestRegion)
        s.regions.values.forEach { v -> assertTrue(v.pm25 == null || v.pm25!! >= 0) }
    }

    @Test fun gpsAtSouthIsExactlySouth() {
        val s = snap(Selection.Gps(1.29587, 103.82))
        assertEquals(105, s.pm25); assertEquals("south", s.nearestRegion); assertEquals(LocationMode.GPS, s.locationMode)
    }

    @Test fun gpsIdwBetweenRegions() {
        // Midpoint between west (117) and central (105), equidistant -> but north/south/east also contribute.
        val s = snap(Selection.Gps(1.35735, 103.76))
        val d = { lat: Double, lon: Double -> HazeCore.haversineKm(1.35735, 103.76, lat, lon) }
        val pts = listOf(49 to d(1.41803, 103.82), 105 to d(1.29587, 103.82), 117 to d(1.35735, 103.70),
            83 to d(1.35735, 103.94), 105 to d(1.35735, 103.82))
        val expected = pts.sumOf { it.first / (it.second * it.second) } / pts.sumOf { 1 / (it.second * it.second) }
        assertEquals(HazeCore.roundHalfUp(expected), s.pm25)
    }

    @Test fun gpsSkipsOfflineRegions() {
        val r = single("""{"north":49,"south":-1,"west":117,"east":83,"central":105}""")
        val s = snap(Selection.Gps(1.29587, 103.82), listOf(r), null)
        assertTrue(s.nearestRegion != "south")
    }

    @Test fun breakpoints() {
        mapOf(0 to 0, 12 to 50, 55 to 100, 150 to 200, 250 to 300, 350 to 400, 500 to 500, 600 to 500,
            105 to 153, 117 to 165, 49 to 93).forEach { (c, i) -> assertEquals(i, HazeCore.instantPsi(c), "C=$c") }
    }

    @Test fun bands() {
        assertEquals(Band.NORMAL, HazeCore.band(55)); assertEquals(Band.ELEVATED, HazeCore.band(56))
        assertEquals(Band.ELEVATED, HazeCore.band(150)); assertEquals(Band.HIGH, HazeCore.band(151))
        assertEquals(Band.HIGH, HazeCore.band(250)); assertEquals(Band.VERY_HIGH, HazeCore.band(251))
    }

    @Test fun psiLabels() {
        assertEquals("Good", HazeCore.psiLabel(50)); assertEquals("Moderate", HazeCore.psiLabel(51))
        assertEquals("Moderate", HazeCore.psiLabel(100)); assertEquals("Unhealthy", HazeCore.psiLabel(101))
        assertEquals("Very Unhealthy", HazeCore.psiLabel(201)); assertEquals("Hazardous", HazeCore.psiLabel(301))
    }

    @Test fun roundHalfUp() {
        assertEquals(89, HazeCore.roundHalfUp(88.5)); assertEquals(88, HazeCore.roundHalfUp(88.49))
    }

    @Test fun trendArrows() {
        assertEquals(TrendDirection.UP, HazeCore.trendOf(5).direction)
        assertEquals(TrendDirection.DOWN, HazeCore.trendOf(-5).direction)
        assertEquals(TrendDirection.STEADY, HazeCore.trendOf(4).direction)
        assertEquals(TrendDirection.STEADY, HazeCore.trendOf(-4).direction)
        // Fixture: west 103 -> 117 (+14), south 106 -> 105 (-1).
        assertEquals(Trend(14, TrendDirection.UP), snap(Selection.Region("west")).trend)
        assertEquals(Trend(-1, TrendDirection.STEADY), snap(Selection.Region("south")).trend)
    }

    @Test fun historyIsOldestToNewestAndCapped() {
        val s = snap(Selection.Region("south"))
        assertTrue(s.history.size in 12..24, "size=${s.history.size}")
        assertEquals("2026-09-28T16:00:00+08:00", s.history.last().time)
        assertEquals(105, s.history.last().pm25)
        val times = s.history.map { Instant.parse(java.time.OffsetDateTime.parse(it.time).toInstant().toString()) }
        assertEquals(times.sorted(), times)
    }

    @Test fun staleAfterTwoHoursFifteen() {
        assertFalse(snap(Selection.Region("south")).stale)
        val late = HazeCore.snapshot(listOf(latest), psi, Selection.Region("south"), Instant.parse("2026-09-28T10:16:00Z"))!!
        assertTrue(late.stale)
    }

    @Test fun walksBackWhenLatestHourAllInvalid() {
        val allBad = single("""{"north":-1,"south":-1,"west":-1,"east":-1,"central":-1}""", "2026-09-28T17:00:00+08:00")
        val s = assertNotNull(HazeCore.snapshot(listOf(allBad, latest), null, Selection.Region("south"), now))
        assertEquals(105, s.pm25)
        assertEquals("2026-09-28T16:00:00+08:00", s.observedAt)
        assertTrue(s.stale)
    }

    @Test fun noDataAtAll() {
        assertNull(HazeCore.snapshot(listOf(single("""{"north":-1}""")), null, Selection.Region(), now))
    }

    @Test fun regionsBreakdownAndCoordsFromMetadata() {
        val s = snap(Selection.Region("central"))
        assertEquals(setOf("north", "south", "east", "west", "central"), s.regions.keys)
        assertEquals(RegionReading(117, 81, 1.35735, 103.7), s.regions["west"])
    }

    @Test fun snapshotJsonFieldNames() {
        val s = snap(Selection.Region("south"))
        val obj = HazeApi.json.parseToJsonElement(HazeApi.json.encodeToString(Snapshot.serializer(), s)).jsonObject
        assertEquals(
            setOf("pm25", "band", "instantPsi", "instantPsiLabel", "officialPsi24h", "trend", "history", "regions",
                "nearestRegion", "locationMode", "observedAt", "publishedAt", "stale", "source"),
            obj.keys,
        )
        assertEquals("elevated", obj["band"]!!.jsonPrimitive.content)
        assertEquals("region", obj["locationMode"]!!.jsonPrimitive.content)
        assertEquals("NEA via data.gov.sg", obj["source"]!!.jsonPrimitive.content)
        assertEquals(105, obj["pm25"]!!.jsonPrimitive.int)
        // Round-trip
        assertEquals(s, HazeApi.json.decodeFromString(Snapshot.serializer(), HazeApi.json.encodeToString(Snapshot.serializer(), s)))
    }

    @Test fun formatting() {
        val s = snap(Selection.Region("south"))
        assertEquals("Measured 4pm · posted by NEA 4:30pm", Format.asOf(s))
        assertEquals("● 105 ▶", Format.compact(s))
        assertEquals(
            "Air near me right now: Elevated (PM2.5 105), steady. NEA 24-hr PSI: 84. Data: NEA via data.gov.sg.",
            Format.shareText(s),
        )
        val w = snap(Selection.Region("west"))
        assertTrue(Format.shareText(w, "https://x.test").endsWith("rising. NEA 24-hr PSI: 81. Data: NEA via data.gov.sg. https://x.test"))
        // SPEC v1.2 §1: no Instant PSI, no "lagging" in user-facing text.
        assertFalse("Instant" in Format.shareText(s) || "lagging" in Format.shareText(s) || "Unhealthy" in Format.shareText(s))
    }
}
