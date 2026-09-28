package sg.hazenow.core

import java.time.Duration
import java.time.Instant
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

class FreshnessTest {
    /** 2026-09-28 HH:MM:SS SGT */
    private fun sgt(hms: String) = Instant.parse("2026-09-28T${hms}+08:00".let { java.time.OffsetDateTime.parse(it).toInstant().toString() })

    private val v1Latest = """{"region_metadata":[{"name":"south","label_location":{"latitude":1.29587,"longitude":103.82}},
        {"name":"central","label_location":{"longitude":103.82,"latitude":1.35735}},{"name":"west","label_location":{"longitude":103.7,"latitude":1.35735}},
        {"name":"north","label_location":{"latitude":1.41803,"longitude":103.82}},{"name":"east","label_location":{"latitude":1.35735,"longitude":103.94}}],
        "items":[{"timestamp":"2026-09-28T17:00:00+08:00","update_timestamp":"2026-09-28T17:00:59+08:00",
        "readings":{"pm25_one_hourly":{"south":140,"west":107,"north":55,"east":108,"central":137}}}],"api_info":{"status":"healthy"}}"""

    // v1 has 15:00 without south (v1's "offline" signal) and a fresh 17:00; v2 back-filled south at 15:00,
    // has west -1 at 16:00 (v1 has it), and lacks 17:00 entirely.
    private val v1Day = """{"region_metadata":[],"items":[
        {"timestamp":"2026-09-28T15:00:00+08:00","update_timestamp":"2026-09-28T15:01:58+08:00","readings":{"pm25_one_hourly":{"north":53,"west":103,"east":63,"central":80}}},
        {"timestamp":"2026-09-28T16:00:00+08:00","update_timestamp":"2026-09-28T16:00:42+08:00","readings":{"pm25_one_hourly":{"north":49,"south":105,"west":117,"east":83,"central":105}}},
        {"timestamp":"2026-09-28T17:00:00+08:00","update_timestamp":"2026-09-28T17:00:59+08:00","readings":{"pm25_one_hourly":{"south":140,"west":107,"north":55,"east":108,"central":137}}}],
        "api_info":{"status":"healthy"}}"""
    private val v2Day = """{"code":0,"data":{"regionMetadata":[],"items":[
        {"date":"2026-09-28","updatedTimestamp":"2026-09-28T16:45:57+08:00","timestamp":"2026-09-28T16:00:00+08:00","readings":{"pm25_one_hourly":{"north":49,"south":105,"west":-1,"east":83,"central":null}}},
        {"date":"2026-09-28","updatedTimestamp":"2026-09-28T15:46:02+08:00","timestamp":"2026-09-28T15:00:00+08:00","readings":{"pm25_one_hourly":{"north":53,"south":106,"west":103,"east":63,"central":80}}}]},"errorMsg":""}"""

    @Test fun parsesV1SnakeCase() {
        val r = HazeApi.parseV1(v1Latest)
        assertEquals(5, r.data.regionMetadata.size)
        assertEquals(LatLon(1.29587, 103.82), r.data.regionMetadata.first { it.name == "south" }.labelLocation)
        val item = r.data.items.single()
        assertEquals("2026-09-28T17:00:00+08:00", item.timestamp)
        assertEquals("2026-09-28T17:00:59+08:00", item.updatedTimestamp)
        assertEquals("2026-09-28", item.date)
        assertEquals(140.0, item.valid(HazeApi.PM25_KEY)["south"])
        val s = HazeCore.snapshot(listOf(r), null, Selection.Region("south"), sgt("17:02:00"))!!
        assertEquals(140, s.pm25)
        assertEquals("2026-09-28T17:00:59+08:00", s.publishedAt)
    }

    @Test fun mergeRuleV2ThenV1ThenInvalid() {
        val m = HazeCore.mergeSources(listOf(HazeApi.parse(v2Day)), listOf(HazeApi.parseV1(v1Day)))
        val byHour = m.data.items.associateBy { it.timestamp.substring(11, 13) }
        assertEquals(listOf("17", "16", "15"), m.data.items.map { it.timestamp.substring(11, 13) }) // newest first
        // 15:00: v1 lacked south; v2 back-filled 106.
        assertEquals(106.0, byHour.getValue("15").valid(HazeApi.PM25_KEY)["south"])
        // 16:00: v2 west -1 and central null -> v1 values.
        assertEquals(117.0, byHour.getValue("16").valid(HazeApi.PM25_KEY)["west"])
        assertEquals(105.0, byHour.getValue("16").valid(HazeApi.PM25_KEY)["central"])
        // 17:00 only in v1.
        assertEquals(140.0, byHour.getValue("17").valid(HazeApi.PM25_KEY)["south"])
        // publishedAt = v1 update_timestamp (first publish), not v2's re-stamp.
        assertEquals("2026-09-28T16:00:42+08:00", byHour.getValue("16").updatedTimestamp)
        assertEquals("2026-09-28T15:01:58+08:00", byHour.getValue("15").updatedTimestamp)
    }

    @Test fun mergeKeepsInvalidWhenBothInvalid() {
        val v2 = HazeApi.parse("""{"data":{"items":[{"updatedTimestamp":"2026-09-28T16:30:40+08:00","timestamp":"2026-09-28T16:00:00+08:00","readings":{"pm25_one_hourly":{"south":-1,"north":49}}}]}}""")
        val v1 = HazeApi.parseV1("""{"items":[{"timestamp":"2026-09-28T16:00:00+08:00","update_timestamp":"2026-09-28T16:00:42+08:00","readings":{"pm25_one_hourly":{"north":50}}}]}""")
        val item = HazeCore.mergeSources(listOf(v2), listOf(v1)).data.items.single()
        assertEquals(mapOf("north" to 49.0), item.valid(HazeApi.PM25_KEY)) // v2 wins; south invalid in both
        val s = HazeCore.snapshot(listOf(HazeCore.mergeSources(listOf(v2), listOf(v1))), null, Selection.Region("south"), sgt("16:05:00"))!!
        assertEquals(LocationMode.ISLAND, s.locationMode)
        assertEquals(null, s.regions.getValue("south").pm25)
    }

    @Test fun mergesPsiMetricsAndDropsNational() {
        val v1 = HazeApi.parseV1("""{"region_metadata":[{"name":"national","label_location":{"latitude":0,"longitude":0}}],
            "items":[{"timestamp":"2026-09-28T17:00:00+08:00","update_timestamp":"2026-09-28T17:00:59+08:00",
            "readings":{"psi_twenty_four_hourly":{"national":90,"south":88},"pm25_twenty_four_hourly":{"national":45,"south":44}}}]}""")
        val merged = HazeCore.mergeSources(emptyList(), listOf(v1))
        assertTrue(merged.data.regionMetadata.none { it.name == "national" })
        assertEquals(mapOf("south" to 44.0), merged.data.items.single().valid(HazeApi.PM25_24H_KEY))
        assertEquals(listOf(44), HazeCore.psiSeries(listOf(merged), Selection.Region("south")).map { it.pm25 })
    }

    @Test fun rateLimitedBodyParses() {
        val r = HazeApi.parse("""{"code":24,"name":"TOO_MANY_REQUESTS","data":null,"errorMsg":"Rate limit exceeded."}""")
        assertEquals(HazeApi.RATE_LIMITED_CODE, r.code)
        assertTrue(r.data.items.isEmpty())
    }

    // ---- polling plan ----

    private val h16 = sgt("16:00:00")

    @Test fun fastPollFromHalfMinuteUntilNewHourAppears() {
        // Before hh:00:30 -> wait for it.
        assertEquals(Freshness.Plan(Duration.ofSeconds(20), Freshness.Source.V1, sgt("17:00:30")), Freshness.plan(sgt("17:00:10"), h16))
        // Inside the window without 17:00 -> every 60 s on v1.
        assertEquals(Duration.ofSeconds(60), Freshness.plan(sgt("17:01:00"), h16).delay)
        assertEquals(Freshness.Source.V1, Freshness.plan(sgt("17:09:00"), h16).source)
        // Got 17:00 -> next is the v2 back-fill check at 17:35.
        val p = Freshness.plan(sgt("17:02:00"), sgt("17:00:00"))
        assertEquals(Freshness.Source.V2, p.source); assertEquals(sgt("17:35:00"), p.at)
    }

    @Test fun giveUpFastPollAtTenPastThenBackfillThenNextHour() {
        assertEquals(sgt("17:35:00"), Freshness.plan(sgt("17:10:00"), h16).at)
        assertEquals(sgt("17:50:00"), Freshness.plan(sgt("17:35:00"), sgt("17:00:00")).at)
        val next = Freshness.plan(sgt("17:50:00"), sgt("17:00:00"))
        assertEquals(sgt("18:00:30"), next.at); assertEquals(Freshness.Source.V1, next.source)
    }

    @Test fun backgroundAtTwoPast() {
        assertEquals(sgt("17:02:00"), Freshness.nextBackgroundRun(sgt("16:59:00")))
        assertEquals(sgt("18:02:00"), Freshness.nextBackgroundRun(sgt("17:02:00")))
    }

    @Test fun backoff30sTo10min() {
        assertEquals(Duration.ZERO, Freshness.backoff(0))
        assertEquals(Duration.ofSeconds(30), Freshness.backoff(1))
        assertEquals(Duration.ofSeconds(60), Freshness.backoff(2))
        assertEquals(Duration.ofSeconds(480), Freshness.backoff(5))
        assertEquals(Duration.ofMinutes(10), Freshness.backoff(6))
        assertEquals(Duration.ofMinutes(10), Freshness.backoff(50))
        assertEquals(Duration.ofSeconds(90), Freshness.backoff(1, Duration.ofSeconds(90))) // Retry-After honoured
        assertEquals(Duration.ofMinutes(10), Freshness.backoff(1, Duration.ofHours(1)))
    }
}
