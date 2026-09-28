package sg.hazenow.core

import java.time.Duration
import java.time.OffsetDateTime
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNotNull
import kotlin.test.assertNull
import kotlin.test.assertTrue

/** Mirrors packages/core/test/core.test.ts "share system (SPEC v1.6)" vector for vector. */
class ShareTest {
    private val end: OffsetDateTime = OffsetDateTime.parse("2026-09-28T16:00:00+08:00")
    private fun iso(t: OffsetDateTime) = t.toString().let { if (it.length == 22) it.substring(0, 16) + ":00" + it.substring(16) else it }

    private data class Fx(val s: Snapshot, val avg: Int?)

    /** Synthetic day: hourly PM2.5 values (same at every station) ending 16:00 SGT, optional 24-hr averages. */
    private fun snap(values: List<Int>, avg: List<Int>? = null, region: String = "west"): Fx {
        val n = values.size
        val pmItems = values.mapIndexed { i, v ->
            val t = end.minusHours((n - 1 - i).toLong())
            """{"timestamp":"${iso(t)}","updatedTimestamp":"${iso(t.plusMinutes(1))}","readings":{"pm25_one_hourly":{"north":$v,"south":$v,"east":$v,"west":$v,"central":$v}}}"""
        }
        val psiItems = values.indices.map { i ->
            val t = end.minusHours((n - 1 - i).toLong())
            val a = avg?.get(i) ?: 30
            """{"timestamp":"${iso(t)}","updatedTimestamp":"${iso(t)}","readings":{"psi_twenty_four_hourly":{"north":70,"south":70,"east":70,"west":70,"central":70},"pm25_twenty_four_hourly":{"north":$a,"south":$a,"east":$a,"west":$a,"central":$a}}}"""
        }
        val pm = HazeApi.parse("""{"code":0,"data":{"items":[${pmItems.joinToString(",")}]}}""")
        val psi = HazeApi.parse("""{"code":0,"data":{"items":[${psiItems.joinToString(",")}]}}""")
        val sel = Selection.Region(region)
        val s = HazeCore.snapshot(listOf(pm), psi, sel, end.plusMinutes(35).toInstant())!!
        return Fx(s, HazeCore.psiSeries(listOf(psi), sel).lastOrNull()?.pm25)
    }

    private fun flat(v: Int, n: Int = 24) = List(n) { v }
    private val general = setOf(Profile.GENERAL)
    private fun pick(f: Fx, p: Set<Profile> = general, ctx: ShareContext = ShareContext()) =
        ShareCards.pickShareCard(f.s, p, context = ctx, avg24h = f.avg)

    private val episodeDay = flat(30, 14) + listOf(80, 120, 162, 140, 90, 60, 50, 40, 30, 22)

    @Test fun rule1AllClear() {
        val p = pick(snap(episodeDay))
        assertEquals(ShareCard.ALL_CLEAR, p.card)
        assertEquals(listOf(ShareCard.NOW, ShareCard.TWO_CLOCKS), p.alternates)
        // Elevated 13+ hours ago doesn't count.
        assertEquals(ShareCard.NOW, pick(snap(listOf(90) + flat(30, 23))).card)
    }

    @Test fun rule2GroupPersonaPriority() {
        val f = snap(flat(100))
        assertEquals(SharePick(ShareCard.GROUP, SharePersona.KIDS, listOf(ShareCard.NOW, ShareCard.TWO_CLOCKS)), pick(f, setOf(Profile.KIDS, Profile.ELDERLY)))
        assertEquals(SharePersona.ELDERLY, pick(f, setOf(Profile.ELDERLY, Profile.EXERCISING)).persona)
        assertEquals(SharePersona.HEART_LUNG, pick(f, setOf(Profile.PREGNANT, Profile.HEART_LUNG)).persona)
        assertEquals(SharePersona.EXERCISING, pick(f, setOf(Profile.EXERCISING, Profile.OUTDOOR_WORK)).persona)
        assertEquals(SharePersona.OUTDOOR_WORKER, pick(f, setOf(Profile.OUTDOOR_WORK)).persona)
        assertEquals(
            listOf("For the kids · Recess check", "For Mum and Dad", "For heart and lung health", "For mums-to-be", "Run check", "Site check"),
            SharePersona.entries.map { it.chip },
        )
        assertEquals(listOf("kids", "elderly", "heart_lung", "pregnant", "exercising", "outdoor_worker"), SharePersona.entries.map { it.id })
    }

    @Test fun rule1BeatsRule2() {
        val f = snap(flat(30, 20) + listOf(90, 60, 40, 30))
        assertEquals(SharePick(ShareCard.ALL_CLEAR, SharePersona.KIDS, listOf(ShareCard.NOW, ShareCard.TWO_CLOCKS, ShareCard.GROUP)), pick(f, setOf(Profile.KIDS)))
    }

    @Test fun rule3NowWithoutPersona() {
        val p = pick(snap(flat(170)))
        assertEquals(ShareCard.NOW, p.card)
        assertEquals(listOf(ShareCard.TWO_CLOCKS), p.alternates)
    }

    @Test fun rule4ClocksOnGapEitherWayOrWhy() {
        assertEquals(ShareCard.TWO_CLOCKS, pick(snap(flat(50), flat(90))).card) // 40 below the average
        assertEquals(ShareCard.NOW, pick(snap(flat(50), flat(89))).card) // 39: not enough
        assertEquals(ShareCard.TWO_CLOCKS, pick(snap(flat(20), flat(30)), ctx = ShareContext(fromWhyTwoNumbers = true)).card)
        assertEquals(ShareCard.TWO_CLOCKS, ShareCards.pickShareCard(snap(flat(20)).s, avg24h = 60).card) // above either way
    }

    @Test fun rule5Otherwise() {
        assertEquals(SharePick(ShareCard.NOW, null, listOf(ShareCard.TWO_CLOCKS)), pick(snap(flat(20), flat(22))))
    }

    @Test fun dayAverageFallsBackToHistoryMean() {
        assertEquals(43, ShareCards.dayAverage(emptyList(), 43))
        assertEquals(20, ShareCards.dayAverage(listOf(HistoryPoint("a", 10), HistoryPoint("b", 30)), null))
        assertNull(ShareCards.dayAverage(emptyList(), null))
    }

    @Test fun episodeStats() {
        val ep = assertNotNull(ShareCards.episodeStats(snap(episodeDay).s.history))
        assertEquals(162, ep.worst.pm25)
        assertEquals("9am", Format.clock(ep.worst.time))
        assertEquals(6, ep.hoursAbove)
        assertFalse(ep.truncated)
        assertNull(ShareCards.episodeStats(snap(flat(20)).s.history))
        assertTrue(ShareCards.episodeStats(snap(flat(90)).s.history)!!.truncated)
        // A missing hour ends the run.
        val gap = listOf(HistoryPoint("2026-09-28T10:00:00+08:00", 90), HistoryPoint("2026-09-28T12:00:00+08:00", 100))
        assertEquals(1, ShareCards.episodeStats(gap)!!.hoursAbove)
    }

    @Test fun nowCardWords() {
        val f = snap(flat(90, 22) + listOf(100, 136))
        val c = ShareCards.shareCardContent("now", f.s, general, ShareContext(placeName = "Tampines")) as ShareCardContent.Now
        assertEquals("Air near Tampines · Mon 28 Sep, 4pm", c.hook)
        assertEquals("Elevated, and rising fast.", c.headline)
        assertEquals("µg/m³ 1-hr PM2.5 · up 46 in 2 hours", c.pmDetail)
        assertEquals("Reduce strenuous outdoor activity." to "Avoid strenuous outdoor activity.", c.adviceMost to c.adviceVulnerable)
        assertTrue("The 24-hr PSI (70) averages the whole day." in c.psiLine)
        assertEquals("Normal, and steady.", ShareCards.nowHeadline(snap(flat(20)).s))
    }

    @Test fun groupClocksClearPreviewWords() {
        val g = ShareCards.shareCardContent("group", snap(flat(71)).s, setOf(Profile.KIDS)) as ShareCardContent.Group
        assertEquals("For the kids · Recess check", g.chip)
        assertEquals("Calm play only, for now.", g.headline)
        assertEquals("µg/m³ · Elevated · steady", g.statsRest)
        assertEquals("Next check at 5pm.", g.actions.last())
        assertFalse(g.actions.joinToString(" ").contains("N95"))
        assertEquals("Stay indoors for now.", (ShareCards.shareCardContent("group", snap(flat(200)).s, setOf(Profile.ELDERLY)) as ShareCardContent.Group).headline)
        val kf = snap(flat(134), flat(43))
        val k = ShareCards.shareCardContent("clocks", kf.s, avg24h = kf.avg) as ShareCardContent.Clocks
        assertEquals(listOf(134, 43, 70, 24), listOf(k.pm25, k.avg, k.psi, k.bars.size))
        val cl = ShareCards.shareCardContent("clear", snap(episodeDay).s) as ShareCardContent.Clear
        assertEquals("Worst hour this episode: 162 at 9am. 6 hours above Normal.", cl.stats)
        val pv = ShareCards.shareCardContent("preview", snap(flat(100)).s) as ShareCardContent.Preview
        assertEquals(Triple(100, TrendDirection.STEADY, 70), Triple(pv.pm25, pv.direction, pv.psi))
    }

    @Test fun shareTextPerCard() {
        val f = snap(flat(90, 22) + listOf(100, 136))
        val ctx = ShareContext(placeName = "Tampines")
        val all = ShareCard.entries.map { ShareCards.shareCardText(it, f.s, setOf(Profile.KIDS), ctx, avg24h = f.avg) }
        assertEquals("Air near Tampines at 4pm: Elevated (PM2.5 136), rising fast. NEA 24-hr PSI: 70 (Moderate). Data: NEA via data.gov.sg. hazenow.sg", all[0])
        assertTrue(all[1].startsWith("Same NEA data, two clocks. Tampines at 4pm: last hour PM2.5 136, 24-hr average 30."), all[1])
        assertTrue(all[2].startsWith("For the kids · Recess check, Tampines at 4pm: "), all[2])
        for (t in all) {
            assertTrue(t.endsWith("hazenow.sg"), t)
            for (bad in listOf("~", "Instant", "real number", "lagging", "Unhealthy")) assertFalse(bad in t, "$bad in $t")
        }
        assertEquals("https://hazenow.sg/?area=choa-chu-kang", ShareCards.shareLink("Choa Chu Kang"))
    }

    @Test fun staleShareCopy19() {
        val f = snap(flat(90, 22) + listOf(100, 136))
        val stale = f.s.copy(stale = true)
        val ctx = ShareContext(placeName = "Tampines")
        val now = ShareCards.shareCardContent("now", stale, general, ctx) as ShareCardContent.Now
        assertEquals("Tampines · reading from Mon 28 Sep, 4pm (latest available)", now.hook)
        assertEquals("Latest NEA reading is delayed.", now.headline)
        val g = ShareCards.shareCardContent("group", stale, setOf(Profile.KIDS), ctx) as ShareCardContent.Group
        assertEquals("Latest NEA reading is delayed.", g.headline)
        assertEquals("reading from Mon 28 Sep, 4pm (latest available)", g.`when`)
        assertEquals("4pm", (ShareCards.shareCardContent("clocks", stale, general, ctx) as ShareCardContent.Clocks).endLabel)
        assertEquals("Now", (ShareCards.shareCardContent("clocks", f.s, general, ctx) as ShareCardContent.Clocks).endLabel)
        val pv = ShareCards.shareCardContent("preview", stale, general, ctx) as ShareCardContent.Preview
        assertEquals("Latest NEA reading is delayed.", pv.headline)
        for (c in ShareCard.entries) {
            val t = ShareCards.shareCardText(c, stale, general, ctx)
            assertTrue(t.startsWith("Latest NEA reading is delayed. Tampines · reading from Mon 28 Sep, 4pm (latest available): Elevated (PM2.5 136)."), t)
            assertFalse("rising" in t || "now" in t.lowercase().replace("hazenow", ""), t)
        }
        // COPY §19 stale wording: no "next hour" / "last hour" / "right now" on stale cards.
        assertEquals("NEA’s advice for that hour", now.adviceLabel)
        assertEquals("The 24-hr PSI (70) averages the whole day. This reading is for the 4pm hour.", now.psiLine)
        val sk = ShareCards.shareCardContent("clocks", stale, general, ctx) as ShareCardContent.Clocks
        assertEquals("The 4pm hour", sk.lastHourLabel)
        assertEquals("Check hazenow.sg for NEA’s next update.", g.actions.last())
        assertFalse(g.actions.any { it.startsWith("Next check at") })
        val staleWords = listOf(now.hook, now.headline, now.pmDetail, now.adviceLabel, now.psiLine, g.headline, g.statsRest) +
            g.actions + listOf(sk.lastHourLabel, sk.endLabel, pv.hook, pv.headline)
        for (t in staleWords) for (bad in listOf("next hour", "last hour", "right now", "this hour", "Now")) assertFalse(bad in t, "'$bad' in '$t'")
        val noPsi = ShareCards.shareCardContent("now", stale.copy(officialPsi24h = null), general, ctx) as ShareCardContent.Now
        assertEquals("The 24-hr PSI averages the whole day. This reading is for the 4pm hour.", noPsi.psiLine)
        // Fresh wording is unchanged.
        val fresh = ShareCards.shareCardContent("now", f.s, general, ctx) as ShareCardContent.Now
        assertEquals("NEA’s advice for the next hour", fresh.adviceLabel)
        assertTrue(fresh.psiLine.endsWith("This is the last hour. Same NEA data, different clock."))
        assertEquals("The last hour", (ShareCards.shareCardContent("clocks", f.s, general, ctx) as ShareCardContent.Clocks).lastHourLabel)

        // Stale: no trend anywhere (an old trend could mislead).
        assertEquals("µg/m³ 1-hr PM2.5", now.pmDetail)
        assertEquals("µg/m³ · Elevated", g.statsRest)
        assertNull(pv.direction)
        for (c in ShareCard.entries) {
            val t = ShareCards.shareCardText(c, stale, setOf(Profile.KIDS), ctx)
            for (w in listOf("rising", "easing", "steady", "clearing", "up 46", "in 2 hours")) assertFalse(w in t, "$w in $t")
        }
        // Fresh data is unaffected.
        assertEquals("µg/m³ 1-hr PM2.5 · up 46 in 2 hours", (ShareCards.shareCardContent("now", f.s, general, ctx) as ShareCardContent.Now).pmDetail)
        assertEquals("Elevated, and rising fast.", (ShareCards.shareCardContent("now", f.s, general, ctx) as ShareCardContent.Now).headline)
    }

    @Test fun fileNamesAndDates() {
        assertEquals("hazenow-choa-chu-kang-2026-09-28-1700.png", ShareCards.shareFileName("Choa Chu Kang", "2026-09-28T17:00:00+08:00"))
        assertEquals("hazenow-west-2026-09-28-0900-clocks.png", ShareCards.shareFileName("West", "2026-09-28T09:00:00+08:00", "clocks"))
        assertEquals("Tue 29 Sep, 7am", ShareCards.formatCardWhen("2026-09-29T07:00:00+08:00"))
    }

    @Test fun placeNaming() {
        val pm = HazeApi.parse(javaClass.classLoader.getResource("pm25-latest.json")!!.readText())
        val p = LatLon(1.35, 103.95)
        val s = HazeCore.snapshot(listOf(pm), null, Selection.Gps(p.latitude, p.longitude), end.plusMinutes(35).toInstant())!!
        val pl = ShareCards.sharePlace(s, ShareContext(placeName = "Tampines", point = p))
        assertTrue(Regex("^NEA East station · \\d\\.\\d km away$").matches(pl.station), pl.station)
        assertEquals("near Tampines", pl.phrase)
        assertEquals("near me", ShareCards.sharePlace(s).phrase)
        val w = snap(flat(20)).s
        assertEquals("in the West", ShareCards.sharePlace(w).phrase)
        assertEquals("West station", ShareCards.sharePlace(w).stationShort)
        assertTrue(Duration.ofHours(12) == Duration.ofHours(ShareCards.ALL_CLEAR_LOOKBACK_H))
    }
}
