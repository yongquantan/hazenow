package sg.hazenow.core

import java.time.Instant
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNotNull
import kotlin.test.assertNull
import kotlin.test.assertTrue

class ExperienceTest {
    private val general = setOf(Profile.GENERAL)

    private fun fixture(name: String) = HazeApi.parse(javaClass.classLoader.getResource(name)!!.readText())
    private val pm = listOf(fixture("pm25-latest.json"), fixture("pm25-2026-09-28.json"), fixture("pm25-2026-09-27.json"))
    private val psi = fixture("psi-latest.json")
    private val now = Instant.parse("2026-09-28T08:35:00Z") // 16:35 SGT

    private fun snap(sel: Selection) = HazeCore.snapshot(pm, psi, sel, now)!!

    // ---- verdict matrix (COPY §2) ----

    @Test fun verdictMatrixVerbatim() {
        fun v(b: Band, vararg p: Profile) = Experience.verdict(b, p.toSet())
        assertEquals("Fine to be out.", v(Band.NORMAL, Profile.GENERAL).long)
        assertEquals("Fine for outdoor play.", v(Band.NORMAL, Profile.KIDS).long)
        assertEquals("Fine to exercise outside.", v(Band.NORMAL, Profile.EXERCISING).long)
        assertEquals("OK to be out. Go easy on hard exercise.", v(Band.ELEVATED, Profile.GENERAL).long)
        assertEquals("Calm play outside is OK. Skip running games for now.", v(Band.ELEVATED, Profile.KIDS).long)
        assertEquals("A gentle walk is OK. Skip hard exercise for now.", v(Band.ELEVATED, Profile.ELDERLY).long)
        assertEquals("Gentle activity is OK. Skip hard exercise for now.", v(Band.ELEVATED, Profile.HEART_LUNG).long)
        assertEquals("Keep your workout light, or move it indoors.", v(Band.ELEVATED, Profile.EXERCISING).long)
        assertEquals("Short trips out are OK. Exercise indoors.", v(Band.HIGH, Profile.GENERAL).long)
        assertEquals("Indoor play for now. Keep trips out short.", v(Band.HIGH, Profile.KIDS).long)
        assertEquals("Stay indoors for now if you can.", v(Band.HIGH, Profile.PREGNANT).long)
        assertEquals("Move your workout indoors.", v(Band.HIGH, Profile.EXERCISING).long)
        assertEquals("Stay indoors for now. Go out only if you need to.", v(Band.VERY_HIGH, Profile.GENERAL).long)
        assertEquals("Keep kids indoors for now.", v(Band.VERY_HIGH, Profile.KIDS).long)
        assertEquals("Skip outdoor exercise for now.", v(Band.VERY_HIGH, Profile.EXERCISING).long)
        assertEquals("Go easy outdoors", v(Band.ELEVATED, Profile.GENERAL).short)
        assertEquals("Light workout or go indoors", v(Band.ELEVATED, Profile.EXERCISING).short)
    }

    @Test fun neverSaysTodayAndShortFormsFit() {
        for (b in Band.entries) for (p in Profile.entries) {
            val v = Experience.verdict(b, setOf(p))
            assertFalse("today" in v.long, v.long)
            assertTrue(v.short.length <= 28 && !v.short.endsWith("."), v.short)
        }
    }

    @Test fun strictestWinsWithPrecedence() {
        // kids + heart_lung at High: heart_lung is stricter ("Stay indoors…")
        assertEquals("Stay indoors for now if you can.", Experience.verdict(Band.HIGH, setOf(Profile.KIDS, Profile.HEART_LUNG)).long)
        // At Elevated all sensitive rows tie: heart_lung wording first.
        assertEquals(Profile.HEART_LUNG, Experience.verdict(Band.ELEVATED, setOf(Profile.ELDERLY, Profile.HEART_LUNG)).profile)
        // general + exercising at Elevated: exercising is stricter.
        assertEquals("Keep your workout light, or move it indoors.", Experience.verdict(Band.ELEVATED, setOf(Profile.GENERAL, Profile.EXERCISING)).long)
        // Normal: kids wording wins by precedence over general.
        assertEquals("Fine for outdoor play.", Experience.verdict(Band.NORMAL, setOf(Profile.GENERAL, Profile.KIDS)).long)
    }

    @Test fun forLabels() {
        assertEquals("For you", Experience.forLabel(emptySet()))
        assertEquals("For kids", Experience.forLabel(setOf(Profile.KIDS)))
        assertEquals("For you + your workout", Experience.forLabel(setOf(Profile.GENERAL, Profile.EXERCISING)))
        assertEquals("For older adults + your workout", Experience.forLabel(setOf(Profile.ELDERLY, Profile.EXERCISING)))
        assertEquals("For your household", Experience.forLabel(setOf(Profile.KIDS, Profile.ELDERLY, Profile.EXERCISING)))
    }

    @Test fun profileToggleRules() {
        assertEquals(setOf(Profile.KIDS), Profile.toggle(setOf(Profile.GENERAL), Profile.KIDS))
        assertEquals(setOf(Profile.GENERAL, Profile.EXERCISING), Profile.toggle(setOf(Profile.GENERAL), Profile.EXERCISING))
        assertEquals(setOf(Profile.GENERAL, Profile.OUTDOOR_WORK), Profile.toggle(setOf(Profile.KIDS, Profile.OUTDOOR_WORK), Profile.GENERAL))
        assertTrue(Profile.entries.any { it.pickerLabel == "I work outdoors" })
    }

    // ---- actions (COPY §5, SPEC v1.2 §4) ----

    @Test fun actionsFilteredByProfileAndMasksNeverLead() {
        for (b in Band.entries) for (p in Profile.entries) {
            val a = Experience.actions(b, setOf(p))
            if (b == Band.NORMAL) assertTrue(a.isEmpty()) else assertTrue(a.isNotEmpty())
            a.firstOrNull()?.let { assertFalse("N95" in it || "mask" in it, "$b $p leads with a mask") }
        }
        val kidsHigh = Experience.actions(Band.HIGH, setOf(Profile.KIDS))
        assertTrue(kidsHigh.none { it == "Out for hours? An N95 mask helps. Not needed for short trips." })
        assertTrue("N95 masks aren't made for children. Keeping kids indoors works better." in kidsHigh)
        assertTrue(Experience.actions(Band.HIGH, setOf(Profile.PREGNANT)).any { it.startsWith("Pregnant? Wear an N95 only") })
        assertTrue(Experience.actions(Band.HIGH, setOf(Profile.HEART_LUNG)).any { it.startsWith("Heart or lung condition? Ask your doctor") })
        assertEquals(
            listOf("Close windows. Use aircon or a fan to keep cool.", "Run a purifier in the room you're in, if you have one.", "Move exercise indoors, or try later."),
            Experience.actions(Band.HIGH, general).take(3),
        )
        assertEquals("Asthma or COPD? Keep your inhaler with you.", Experience.actions(Band.ELEVATED, setOf(Profile.HEART_LUNG)).first())
        assertEquals(listOf("Haze isn't always easy to see. Check here before a long run."), Experience.actions(Band.ELEVATED, general))
        val vh = Experience.actions(Band.VERY_HIGH, general)
        assertTrue("Check on older family and neighbours." in vh && vh.any { "995" in it })
        assertTrue(vh.take(3).any { "995" in it })
    }

    @Test fun calmLineAfterEpisode() {
        val s = snap(Selection.Region("north"))
        assertEquals("Enjoy the fresh air.", Experience.calmLine(s))
        val after = s.copy(history = listOf(HistoryPoint("a", 80), HistoryPoint("b", 60), HistoryPoint("c", 40)), pm25 = 40)
        assertEquals("Air's cleared. Good time to open the windows.", Experience.calmLine(after))
    }

    // ---- anchor / trend / second line ----

    @Test fun anchors() {
        assertEquals("Normal is up to 55.", Experience.anchor(Band.NORMAL))
        assertEquals("Elevated band (56–150). High starts at 151.", Experience.anchor(Band.ELEVATED))
        assertEquals("High band (151–250). Very High starts at 251.", Experience.anchor(Band.HIGH))
        assertEquals("Very High band (251 and above).", Experience.anchor(Band.VERY_HIGH))
    }

    @Test fun trendPhrases() {
        fun h(vararg v: Int) = v.mapIndexed { i, x -> HistoryPoint("t$i", x) }
        fun t(d: Int, vararg v: Int) = Experience.trend(h(*v), d)
        assertEquals(Experience.TrendText("Steady over the last hour", "steady"), t(4, 100, 104))
        assertEquals(Experience.TrendText("Rising: up 5 in the last hour", "rising"), t(5, 100, 105))
        assertEquals(Experience.TrendText("Rising fast: up 20 in the last hour", "rising fast"), t(20, 100, 120))
        assertEquals(Experience.TrendText("Easing: down 19 in the last hour", "easing"), t(-19, 119, 100))
        assertEquals(Experience.TrendText("Clearing fast: down 20 in the last hour", "clearing fast"), t(-20, 120, 100))
        assertEquals(Experience.TrendText("Rising fast: up 38 in 2 hours", "rising fast"), t(14, 79, 103, 117))
        assertEquals(Experience.TrendText("Trend not available yet", null), t(0, 100))
    }

    @Test fun secondLines() {
        assertEquals("Getting worse. Check again in an hour.", Experience.secondLine(snap(Selection.Region("central"))))
        assertEquals("Easing since 2pm.", Experience.secondLine(snap(Selection.Region("south"))))
        assertNull(Experience.secondLine(snap(Selection.Region("west"))))
        val stale = HazeCore.snapshot(pm, psi, Selection.Region("west"), Instant.parse("2026-09-28T11:00:00Z"))!!
        assertEquals("Reading is from 4pm. It may not match the air now.", Experience.secondLine(stale))
    }

    // ---- insight ----

    @Test fun insightRegionMode() {
        val i = Experience.insight(snap(Selection.Region("west")), setOf(Profile.GENERAL, Profile.KIDS), now = now)
        assertEquals("117", i.display)
        assertNull(i.range)
        assertEquals("Measured at West station", i.sourceLine)
        assertEquals("NEA West station · measured 4pm · 35 min ago", i.provenance)
        assertEquals("NEA 24-hr PSI: 81 (Moderate)", i.officialPsiLabel)
        assertEquals("Rising fast: up 38 in 2 hours", i.trendWords)
        assertEquals(
            "Calm play outside is OK. Skip running games for now. For you + kids. PM2.5 117, Elevated, rising fast.",
            i.accessibility,
        )
        assertEquals("PM2.5 117, Elevated, rising fast, measured 4pm", i.compactAccessibility)
    }

    @Test fun insightGpsBlendedShowsNumericRange() {
        val s = snap(Selection.Gps(1.35735, 103.76))
        val i = Experience.insight(s, general, 1.35735, 103.76, now)
        assertFalse(i.display.startsWith("~")) // SPEC v1.5
        assertTrue(i.estimate)
        // West & Central ~6.7 km, North ~9.4 km (< 1.5× nearest) all shape the estimate.
        assertEquals(49..117, i.range)
        assertTrue(s.pm25 in i.range!!)
        assertEquals("Estimate for your spot · range 49–117", i.sourceLine)
        assertEquals("Estimate for Clementi · range 49–117",
            Experience.insight(s, general, 1.35735, 103.76, now, placeName = "Clementi").sourceLine)
        assertEquals("${i.display} · range 49–117", i.displayWithRange)
        assertTrue(i.provenance.matches(Regex("Near you · (West|Central) station 6\\.\\d km · measured 4pm · 35 min ago")), i.provenance)
        assertTrue(Experience.insight(s, general, 1.35735, 103.76, now, placeName = "Home (Clementi)").provenance.startsWith("Home (Clementi) · "))
        assertTrue("nearby stations read 49 to 117" in i.accessibility)
    }

    @Test fun rangeAlwaysContainsTheEstimate() {
        // Clementi-like spot: South 140 and Central 137 are nearest, but West 107 is almost as close.
        val r = HazeApi.parse(
            """{"data":{"items":[{"updatedTimestamp":"2026-09-28T17:00:59+08:00","timestamp":"2026-09-28T17:00:00+08:00",
            "readings":{"pm25_one_hourly":{"north":55,"south":140,"west":107,"east":108,"central":137}}}]}}""",
        )
        val t = Instant.parse("2026-09-28T09:10:00Z")
        val s = HazeCore.snapshot(listOf(r), null, Selection.Gps(1.31, 103.76), t)!!
        val i = Experience.insight(s, general, 1.31, 103.76, t, placeName = "Clementi")
        assertTrue(s.pm25 in i.range!!, "${s.pm25} not in ${i.range}")
        assertEquals(107, i.range!!.first)
    }

    @Test fun insightGpsAtStation() {
        val i = Experience.insight(snap(Selection.Gps(1.29587, 103.82)), general, 1.29587, 103.82, now)
        assertEquals("105", i.display)
        assertEquals("Measured at South station", i.sourceLine)
        assertEquals("Near you · South station 0.0 km · measured 4pm · 35 min ago", i.provenance)
    }

    @Test fun offlineStatesInWords() {
        val r = HazeApi.parse(
            """{"data":{"items":[{"updatedTimestamp":"2026-09-28T16:30:40+08:00","timestamp":"2026-09-28T16:00:00+08:00",
            "readings":{"pm25_one_hourly":{"north":49,"south":-1,"west":117,"east":83,"central":105}}}]}}""",
        )
        val s = HazeCore.snapshot(listOf(r), null, Selection.Region("south"), now)!!
        val i = Experience.insight(s, general, now = now, selectedRegion = "south")
        assertEquals("89", i.display)
        assertEquals("Estimate for South · range 49–105", i.sourceLine)
        assertEquals("South station is offline. Showing the average of NEA's other stations. · 35 min ago", i.provenance)
        assertEquals(49..105, i.range)
        assertEquals("NEA 24-hr PSI: not available right now", i.officialPsiLabel)
        // Island view (no picked region): v1.4 wording.
        assertEquals("Singapore (island average) · measured 4pm · 35 min ago", Experience.insight(s, general, now = now).provenance)
        val close = HazeApi.parse(
            """{"data":{"items":[{"updatedTimestamp":"2026-09-28T16:30:40+08:00","timestamp":"2026-09-28T16:00:00+08:00",
            "readings":{"pm25_one_hourly":{"north":92,"south":-1,"west":112,"east":98,"central":104}}}]}}""",
        )
        val cs = HazeCore.snapshot(listOf(close), null, Selection.Region("south"), now)!!
        assertNull(Experience.insight(cs, general, now = now).range) // from Central: 0 km, agree
        assertEquals(92..104, Experience.insight(cs, general, now = now, selectedRegion = "south").range) // >5 km away
        assertTrue("-1" !in i.display + i.provenance)

        val g = HazeCore.snapshot(listOf(r), null, Selection.Gps(1.29, 103.82), now)!!
        assertEquals("South station is offline. Using nearby stations.", Experience.insight(g, general, 1.29, 103.82, now).note)
    }

    @Test fun lateAndStaleNotes() {
        val late = HazeCore.snapshot(pm, psi, Selection.Region("west"), Instant.parse("2026-09-28T09:20:00Z"))!!
        assertEquals("NEA usually posts each hour at about half past. Next update soon.", Experience.insight(late, general, now = Instant.parse("2026-09-28T09:20:00Z")).note)
        val t = Instant.parse("2026-09-28T11:00:00Z")
        val stale = HazeCore.snapshot(pm, psi, Selection.Region("west"), t)!!
        assertEquals("Newer readings from NEA are late. We'll keep checking.", Experience.insight(stale, general, now = t).note)
    }

    @Test fun allStationsOfflineUsesCopy10() {
        // Newest hours published with every station offline -> walk back, stale, "haven't reported since".
        val bad = (17..18).map { h ->
            HazeApi.parse(
                """{"data":{"items":[{"updatedTimestamp":"2026-09-28T$h:01:00+08:00","timestamp":"2026-09-28T$h:00:00+08:00",
                "readings":{"pm25_one_hourly":{"north":-1,"south":-1,"west":-1,"east":-1,"central":-1}}}]}}""",
            )
        }
        val t = Instant.parse("2026-09-28T11:30:00Z") // 19:30 SGT; last valid hour 16:00
        val feed = bad + pm
        val s = HazeCore.snapshot(feed, psi, Selection.Region("south"), t)!!
        assertTrue(s.stale)
        assertEquals("2026-09-28T18:00:00+08:00", HazeCore.latestHour(feed))
        assertEquals("NEA's stations haven't reported since 4pm.", Experience.insight(s, general, now = t, latestHourAt = HazeCore.latestHour(feed)).note)
        // Without newer (empty) hours it's just late.
        assertEquals("Newer readings from NEA are late. We'll keep checking.", Experience.insight(s, general, now = t, latestHourAt = s.observedAt).note)
    }

    @Test fun noBannedWordsOrInstantPsiAnywhere() {
        val banned = listOf("danger", "toxic", "deadly", "hazardous", "alarming", "lagging", "Instant PSI", "Unhealthy", "!", "today")
        val strings = Band.entries.flatMap { b ->
            Profile.entries.flatMap { p -> Experience.actions(b, setOf(p)) + Experience.verdict(b, setOf(p)).long } + Experience.anchor(b)
        } + Insight.MORE_TIPS + Chart.CAPTION + Chart.LEGEND_LINE + Insight.WHY_TWO_NUMBERS
        for (s in strings) for (w in banned) assertFalse(w.lowercase() in s.lowercase(), "'$w' in '$s'")
    }

    @Test fun pm25AverageSeriesForChartLine() {
        val h = HazeCore.psiSeries(listOf(psi), Selection.Region("south"))
        assertEquals(listOf(HistoryPoint("2026-09-28T16:00:00+08:00", 41)), h) // pm25_twenty_four_hourly, µg/m³
        assertEquals(84, HazeCore.psiSeries(listOf(psi), Selection.Region("south"), HazeApi.PSI24_KEY).single().pm25)
        assertTrue(Chart.accessibility(snap(Selection.Region("south")).history, h).contains("NEA 24-hr average PM2.5 went from 41 to 41"))
    }

    @Test fun contrast() {
        val white = 0xFFFFFFFF
        val black = 0xFF000000
        assertEquals(21.0, Contrast.ratio(white, black), 0.01)
        val light = 0xFFFAFAF7
        val dark = 0xFF121412
        for (b in Band.entries) {
            assertTrue(Contrast.ratio(Contrast.ensure(b.argb, light, Contrast.TEXT), light) >= 4.5, "$b text on light")
            assertTrue(Contrast.ratio(Contrast.ensure(b.argb, dark, Contrast.TEXT), dark) >= 4.5, "$b text on dark")
            assertTrue(Contrast.ratio(Contrast.ensure(b.argb, light, Contrast.ICON), light) >= 3.0, "$b icon on light")
        }
        // Amber on light fails raw, so it must have been adjusted.
        assertTrue(Contrast.ratio(Band.ELEVATED.argb, light) < 3.0)
    }
}

class AlertsTest {
    private val day = Instant.parse("2026-09-28T04:00:00Z") // 12:00 SGT
    private val night = Instant.parse("2026-09-28T15:00:00Z") // 23:00 SGT
    private val morning = Instant.parse("2026-09-28T23:30:00Z") // 07:30 SGT next day

    private fun s(vararg v: Int, mode: LocationMode = LocationMode.REGION): Snapshot {
        val hist = v.mapIndexed { i, x -> HistoryPoint("2026-09-28T%02d:00:00+08:00".format(i), x) }
        val pm = v.last()
        val prev = v.getOrNull(v.size - 2) ?: pm
        return Snapshot(
            pm25 = pm, band = HazeCore.band(pm), instantPsi = HazeCore.instantPsi(pm), instantPsiLabel = "",
            officialPsi24h = 80, trend = HazeCore.trendOf(pm - prev), history = hist, regions = emptyMap(),
            nearestRegion = "west", locationMode = mode, observedAt = hist.last().time, publishedAt = hist.last().time, stale = false,
        )
    }

    private val sensitive = AlertPrefs(profiles = setOf(Profile.KIDS))
    private val general = AlertPrefs(profiles = setOf(Profile.GENERAL))

    @Test fun firstRunAdoptsSilently() {
        val o = Alerts.evaluate(AlertState(), s(100), general, day)
        assertEquals(Band.ELEVATED, o.state.band); assertNull(o.alert)
    }

    @Test fun hysteresis() {
        val st = AlertState(band = Band.NORMAL)
        assertNull(Alerts.evaluate(st, s(40, 58), sensitive, day).alert) // 3 over, one hour
        assertNotNull(Alerts.evaluate(st, s(40, 57, 58), sensitive, day).alert) // 2 hours in a row
        assertNotNull(Alerts.evaluate(st, s(40, 65), sensitive, day).alert) // ≥10 over
    }

    @Test fun elevatedOffByDefaultForGeneralOnly() {
        val st = AlertState(band = Band.NORMAL)
        val o = Alerts.evaluate(st, s(40, 80), general, day)
        assertNull(o.alert); assertEquals(Band.ELEVATED, o.state.band)
        assertFalse(general.elevatedEnabled)
        assertTrue(AlertPrefs(profiles = setOf(Profile.EXERCISING)).elevatedEnabled)
        assertNotNull(Alerts.evaluate(st, s(40, 80), general.copy(elevatedAlerts = true), day).alert)
        // High always alerts.
        val high = Alerts.evaluate(o.state, s(80, 170), general, day).alert!!
        assertEquals("Haze now High in the West", high.title)
        assertEquals("PM2.5 170. Short trips out are OK. Exercise indoors. Close windows and keep cool with aircon or a fan.", high.text)
    }

    @Test fun copyVerbatimRisingAndAllClear() {
        val o = Alerts.evaluate(AlertState(band = Band.NORMAL), s(40, 105), general.copy(elevatedAlerts = true), day)
        assertEquals("Haze rising in the West", o.alert!!.title)
        assertEquals("Now Elevated (PM2.5 105). OK to be out. Go easy on hard exercise.", o.alert!!.text)
        val kidsHigh = Alerts.evaluate(AlertState(band = Band.ELEVATED), s(100, 172, mode = LocationMode.GPS), sensitive, day).alert!!
        assertEquals("Haze now High near you", kidsHigh.title)
        assertEquals("PM2.5 172. Indoor play for now. Keep trips out short. Close windows and keep cool with aircon or a fan.", kidsHigh.text)

        assertEquals("Haze rising in Tampines", Alerts.evaluate(AlertState(band = Band.NORMAL), s(40, 105, mode = LocationMode.GPS),
            general.copy(elevatedAlerts = true, placeName = "Tampines"), day).alert!!.title)
        val clear = Alerts.evaluate(o.state, s(105, 40), general, day)
        assertEquals("All clear in the West", clear.alert!!.title)
        assertEquals("Air's back to Normal (PM2.5 40). Fine to be out. Good time to open the windows.", clear.alert!!.text)
        assertTrue(clear.alert!!.allClear)
        assertFalse(clear.state.episodeAlerted)
    }

    @Test fun noAllClearIfNothingWasSent() {
        val o = Alerts.evaluate(AlertState(band = Band.ELEVATED), s(80, 40), general, day)
        assertNull(o.alert); assertEquals(Band.NORMAL, o.state.band)
    }

    @Test fun dailyCapButAllClearGetsThrough() {
        val capped = AlertState(band = Band.ELEVATED, episodeAlerted = true, day = "2026-09-28", sentToday = 3)
        assertNull(Alerts.evaluate(capped, s(100, 180), sensitive, day).alert)
        val clear = Alerts.evaluate(capped, s(100, 30), sensitive, day).alert!!
        assertEquals("Air's back to Normal (PM2.5 30). Fine for outdoor play again.", clear.text)
        // New day resets the cap.
        val nextDay = Instant.parse("2026-09-29T04:00:00Z")
        assertNotNull(Alerts.evaluate(capped, s(100, 180), sensitive, nextDay).alert)
    }

    @Test fun quietHoursThenMorningCatchUp() {
        assertTrue(Alerts.inQuietHours(night)); assertFalse(Alerts.inQuietHours(day)); assertFalse(Alerts.inQuietHours(morning))
        val o = Alerts.evaluate(AlertState(band = Band.NORMAL, day = "2026-09-28"), s(40, 170), sensitive, night)
        assertNull(o.alert)
        assertEquals(Band.HIGH, o.state.overnightPeak)
        val m = Alerts.evaluate(o.state, s(130, 120), sensitive, morning)
        val a = m.alert!!
        assertEquals("Overnight air update", a.title)
        assertEquals("The haze reached High overnight. Now: Elevated, PM2.5 120, easing. Calm play outside is OK. Skip running games for now.", a.text)
        assertNull(m.state.overnightPeak)
    }
}
