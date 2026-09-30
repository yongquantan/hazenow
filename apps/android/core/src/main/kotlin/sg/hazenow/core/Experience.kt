package sg.hazenow.core

import java.time.Duration
import java.time.Instant
import java.util.Locale
import kotlin.math.abs

/**
 * SPEC v1.1 + v1.2 presentation layer. All user-facing strings come verbatim from docs/COPY.md,
 * including the "I work outdoors" profile (COPY §17).
 */
enum class Profile(
    val id: String,
    val pickerLabel: String,
    /** "For …" label when it's the only profile. */
    val forLabel: String,
    /** Fragment used when combined ("For you + kids"). */
    val fragment: String,
    val sensitive: Boolean,
) {
    GENERAL("general", "Just me, generally healthy", "For you", "you", false),
    KIDS("kids", "Kids", "For kids", "kids", true),
    ELDERLY("elderly", "Older adults (65+)", "For older adults", "older adults", true),
    PREGNANT("pregnant", "Pregnant", "For pregnancy", "pregnancy", true),
    HEART_LUNG("heart_lung", "Asthma, COPD or a heart condition", "For asthma, COPD & heart", "asthma, COPD & heart", true),
    EXERCISING("exercising", "I exercise outdoors", "For your workout", "your workout", false),
    OUTDOOR_WORK("outdoor_work", "I work outdoors", "For outdoor work", "outdoor work", false);

    companion object {
        fun fromId(id: String): Profile? = entries.firstOrNull { it.id == id }

        /** Tie-break order from COPY.md §1 (outdoor_work slotted before general). */
        val PRECEDENCE = listOf(HEART_LUNG, KIDS, PREGNANT, ELDERLY, EXERCISING, OUTDOOR_WORK, GENERAL)

        /** COPY §1: "Just me, generally healthy" can't be combined with a sensitive option. */
        fun toggle(current: Set<Profile>, p: Profile): Set<Profile> {
            val next = if (p in current) current - p else current + p
            return when {
                p in next && p.sensitive -> next - GENERAL
                p == GENERAL && p in next -> next.filterNot { it.sensitive }.toSet()
                else -> next
            }
        }

        fun normalize(p: Set<Profile>): Set<Profile> = if (p.isEmpty()) setOf(GENERAL) else p
    }
}

data class Verdict(
    /** Main-screen headline, e.g. "OK to be out. Go easy on hard exercise." */
    val long: String,
    /** ≤28 chars, no full stop: widgets, notification titles. */
    val short: String,
    /** "For you + kids" */
    val forLabel: String,
    /** The profile whose wording was used. */
    val profile: Profile,
)

data class Insight(
    val verdict: Verdict,
    /** Optional second line under the headline (COPY §2). */
    val secondLine: String?,
    /** Ordered, most useful first. The main screen shows the first 3; the rest go in "More tips". */
    val actions: List<String>,
    /** Normal-band calm line in place of actions. */
    val calmLine: String?,
    /** Always a clean integer, "108" (SPEC v1.5: no "~"). */
    val display: String,
    /** True when the value is estimated from several stations rather than read at one. */
    val estimate: Boolean,
    /** Two nearest stations when uncertain. */
    val range: IntRange?,
    /**
     * Small line under the number (SPEC v1.5): "Estimate for Tampines · range 83–117",
     * or "Measured at East station" for a direct station reading.
     */
    val sourceLine: String,
    /** "Rising: up 14 in the last hour" */
    val trendWords: String,
    /** "rising" / "steady" / …; null when there's no previous hour. */
    val trendWord: String?,
    /** "Elevated band (56–150). High starts at 151." */
    val anchor: String,
    /** "NEA West station · measured 4pm · 35 min ago" */
    val provenance: String,
    /** State/detail note in words (offline station, late data, …). */
    val note: String?,
    /** "NEA 24-hr PSI: 81 (Moderate)" */
    val officialPsiLabel: String,
    /** Headline block label for TalkBack. */
    val accessibility: String,
    /** "PM2.5 105, Elevated, rising, measured 4pm" */
    val compactAccessibility: String,
    val stale: Boolean,
) {
    /** "105 · range 83–117" (SPEC v1.2 §9). */
    val displayWithRange: String get() = if (range == null) display else "$display · range ${range.first}–${range.last}"

    companion object {
        const val WHY_TWO_NUMBERS = "NEA's 24-hr PSI is an average of the last 24 hours, so it changes slowly and is best for planning tomorrow. The 1-hr PM2.5 shows the last hour, and NEA recommends it for deciding what to do right now."
        const val WHY_TWO_NUMBERS_LINK = "Why two numbers?"
        const val WHY_SHORT = "Both are from NEA: the PSI averages 24 hours, PM2.5 shows the last hour."
        const val PSI_CAPTION = "24-hour average"
        val MORE_TIPS = listOf(
            "Indoors is a good shield. Windows shut helps a bit. A purifier running helps a lot.",
            "Surgical masks aren't made to filter haze. N95 masks are, when they fit well.",
            "Sore throat or itchy eyes usually get better once you're out of the haze.",
            "Planning for tomorrow? Use NEA's 24-hr PSI forecast. Schools and events plan with it.",
        )
        const val FOOTER = "Data: NEA via data.gov.sg · Free & open source · No ads, no tracking, no account"
        const val PRIVACY = "Your location stays on your device. We never send it anywhere."
        const val PROFILE_STORAGE = "Saved on this device only."
    }
}

object Chart {
    const val TITLE = "Last 24 hours"
    const val LEGEND_BARS = "Bars: hourly PM2.5 at your spot"
    // COPY §8 says "Line: NEA 24-hr PSI", but SPEC v1.2 §2 makes the line NEA's 24-hr *PM2.5* average
    // (µg/m³). Labelling it PSI would be inaccurate, so this string deviates until COPY is updated.
    const val LEGEND_LINE = "Line: NEA 24-hr average PM2.5"
    const val CAPTION = "The line moves slowly because it averages a whole day. The bars show each hour."
    const val GUIDE_HIGH = "High 151"
    const val GUIDE_ELEVATED = "Elevated 56"

    fun accessibility(bars: List<HistoryPoint>, line: List<HistoryPoint>): String {
        if (bars.isEmpty()) return "Chart. No readings yet."
        val peak = bars.maxBy { it.pm25 }
        val base = "Chart. Over the last 24 hours PM2.5 went from ${bars.first().pm25} to ${bars.last().pm25}, " +
            "peaking at ${peak.pm25} at ${Format.clock(peak.time)}."
        return if (line.isEmpty()) base else "$base NEA 24-hr average PM2.5 went from ${line.first().pm25} to ${line.last().pm25}."
    }
}

object Experience {
    const val UNCERTAIN_KM = 5.0
    const val DISAGREE_UG = 30
    const val NEAR_FACTOR = 1.5
    const val FAST = 20

    fun isSensitive(profiles: Set<Profile>) = profiles.any { it.sensitive }

    // ---------- verdict (COPY §2) ----------

    private fun long(band: Band, p: Profile): String = when (band) {
        Band.NORMAL -> when (p) {
            Profile.KIDS -> "Fine for outdoor play."
            Profile.EXERCISING -> "Fine to exercise outside."
            else -> "Fine to be out."
        }
        Band.ELEVATED -> when (p) {
            Profile.GENERAL -> "OK to be out. Go easy on hard exercise."
            Profile.KIDS -> "Calm play outside is OK. Skip running games for now."
            Profile.ELDERLY -> "A gentle walk is OK. Skip hard exercise for now."
            Profile.PREGNANT, Profile.HEART_LUNG -> "Gentle activity is OK. Skip hard exercise for now."
            Profile.EXERCISING -> "Keep your workout light, or move it indoors."
            Profile.OUTDOOR_WORK -> "OK to work outside. Take breaks indoors if you can."
        }
        Band.HIGH -> when (p) {
            Profile.GENERAL -> "Short trips out are OK. Exercise indoors."
            Profile.KIDS -> "Indoor play for now. Keep trips out short."
            Profile.ELDERLY, Profile.PREGNANT, Profile.HEART_LUNG -> "Stay indoors for now if you can."
            Profile.EXERCISING -> "Move your workout indoors."
            Profile.OUTDOOR_WORK -> "Take regular breaks indoors. Ask about lighter outdoor tasks."
        }
        Band.VERY_HIGH -> when (p) {
            Profile.GENERAL -> "Stay indoors for now. Go out only if you need to."
            Profile.KIDS -> "Keep kids indoors for now."
            Profile.ELDERLY, Profile.PREGNANT, Profile.HEART_LUNG -> "Stay indoors for now."
            Profile.EXERCISING -> "Skip outdoor exercise for now."
            Profile.OUTDOOR_WORK -> "Limit time outside for now. Ask about indoor work."
        }
    }

    fun shortVerdict(band: Band, p: Profile = Profile.GENERAL): String = when (band) {
        Band.NORMAL -> when (p) {
            Profile.KIDS -> "Fine for outdoor play"
            Profile.EXERCISING -> "Fine to exercise outside"
            else -> "Fine to be out"
        }
        Band.ELEVATED -> when (p) {
            Profile.GENERAL -> "Go easy outdoors"
            Profile.KIDS -> "Calm play only"
            Profile.ELDERLY, Profile.PREGNANT, Profile.HEART_LUNG -> "Gentle activity only"
            Profile.EXERCISING -> "Light workout or go indoors"
            Profile.OUTDOOR_WORK -> "Take breaks indoors"
        }
        Band.HIGH -> when (p) {
            Profile.GENERAL -> "No outdoor exercise"
            Profile.KIDS -> "Indoor play for now"
            Profile.ELDERLY, Profile.PREGNANT, Profile.HEART_LUNG -> "Stay indoors for now"
            Profile.EXERCISING -> "Work out indoors"
            Profile.OUTDOOR_WORK -> "Take regular indoor breaks"
        }
        Band.VERY_HIGH -> when (p) {
            Profile.GENERAL -> "Stay indoors for now"
            Profile.KIDS -> "Kids indoors for now"
            Profile.ELDERLY, Profile.PREGNANT, Profile.HEART_LUNG -> "Stay indoors for now"
            Profile.EXERCISING -> "No outdoor exercise"
            Profile.OUTDOOR_WORK -> "Limit time outside"
        }
    }

    /** How restrictive a cell is; the strictest applicable wins, ties broken by [Profile.PRECEDENCE]. */
    private fun strictness(band: Band, p: Profile): Int = when (band) {
        Band.NORMAL -> 0
        Band.ELEVATED -> when { p.sensitive -> 3; p == Profile.EXERCISING -> 2; else -> 1 }
        Band.HIGH -> when (p) {
            Profile.ELDERLY, Profile.PREGNANT, Profile.HEART_LUNG -> 3
            Profile.KIDS, Profile.OUTDOOR_WORK -> 2
            else -> 1
        }
        Band.VERY_HIGH -> when { p.sensitive -> 3; p == Profile.EXERCISING -> 1; else -> 2 }
    }

    fun governing(band: Band, profiles: Set<Profile>): Profile {
        val ps = Profile.normalize(profiles)
        val max = ps.maxOf { strictness(band, it) }
        return Profile.PRECEDENCE.first { it in ps && strictness(band, it) == max }
    }

    fun forLabel(profiles: Set<Profile>): String {
        val ps = Profile.entries.filter { it in Profile.normalize(profiles) }
        return when (ps.size) {
            1 -> ps[0].forLabel
            2 -> "For " + ps.joinToString(" + ") { it.fragment }
            else -> "For your household"
        }
    }

    fun verdict(band: Band, profiles: Set<Profile>): Verdict {
        val g = governing(band, profiles)
        return Verdict(long(band, g), shortVerdict(band, g), forLabel(profiles), g)
    }

    // ---------- second line (COPY §2) ----------

    fun secondLine(s: Snapshot): String? {
        val h = s.history
        val delta = if (h.size >= 2) s.trend.delta else 0
        val elevatedPlus = s.band != Band.NORMAL
        if (s.stale) return "Reading is from ${Format.clock(s.observedAt)}. It may not match the air now."
        if (delta >= FAST) return if (elevatedPlus) "Getting worse. Check again in an hour." else "Rising quickly. Check again in an hour."
        if (delta <= -FAST && elevatedPlus) return "Getting better. Check again in an hour."
        if (elevatedPlus && h.size >= 3 && h[h.size - 1].pm25 < h[h.size - 2].pm25 && h[h.size - 2].pm25 < h[h.size - 3].pm25) {
            var i = h.size - 3
            while (i > 0 && h[i - 1].pm25 > h[i].pm25) i--
            return "Easing since ${Format.clock(h[i].time)}."
        }
        return null
    }

    // ---------- actions (COPY §5) ----------

    private const val A_INHALER_ELEV = "Asthma or COPD? Keep your inhaler with you."
    private const val A_RUN_ELEV = "Shorten or slow your run, or move it indoors."
    private const val A_KIDS_ELEV = "Swap running games for calm play for now."
    private const val A_WINDOWS_ELEV = "At home? Close the windows. Use a fan or aircon to keep cool."
    private const val A_GENERAL_ELEV = "Haze isn't always easy to see. Check here before a long run."
    private const val A_WORK_ELEV = "Take breaks in the shade or indoors, and drink water."
    private const val A_WINDOWS = "Close windows. Use aircon or a fan to keep cool."
    private const val A_PURIFIER = "Run a purifier in the room you're in, if you have one."
    private const val A_EXERCISE = "Move exercise indoors, or try later."
    private const val A_MEDS = "Keep your inhaler or medicine close. Follow your doctor's plan."
    private const val A_KIDS = "Plan indoor play. Keep trips out short."
    private const val A_WORK = "Ask your supervisor about indoor breaks and lighter tasks."
    private const val A_N95 = "Out for hours? An N95 mask helps. Not needed for short trips."
    private const val A_N95_KIDS = "N95 masks aren't made for children. Keeping kids indoors works better."
    private const val A_N95_PREGNANT = "Pregnant? Wear an N95 only for short periods, and take it off if it feels hard to breathe."
    private const val A_N95_HEART = "Heart or lung condition? Ask your doctor before using an N95."
    private const val A_FAMILY = "Check on older family and neighbours."
    private const val A_UNWELL = "Feeling unwell? See a doctor. Chest pain or can't breathe: call 995."

    /** The mask line that fits the profile (MOH: never for kids; caution for pregnancy / heart-lung). */
    private fun maskAction(ps: Set<Profile>): String = when {
        Profile.HEART_LUNG in ps -> A_N95_HEART
        Profile.PREGNANT in ps -> A_N95_PREGNANT
        ps == setOf(Profile.KIDS) -> A_N95_KIDS
        else -> A_N95
    }

    /**
     * All applicable actions for the band and profile, most useful first. The main screen shows the first 3.
     * Masks are never first.
     */
    fun actions(band: Band, profiles: Set<Profile>): List<String> {
        val ps = Profile.normalize(profiles)
        val generalish = Profile.GENERAL in ps || Profile.OUTDOOR_WORK in ps
        return when (band) {
            Band.NORMAL -> emptyList()
            Band.ELEVATED -> buildList {
                if (Profile.HEART_LUNG in ps) add(A_INHALER_ELEV)
                if (Profile.EXERCISING in ps) add(A_RUN_ELEV)
                if (Profile.KIDS in ps) add(A_KIDS_ELEV)
                if (isSensitive(ps)) add(A_WINDOWS_ELEV)
                if (Profile.OUTDOOR_WORK in ps) { add(A_WORK_ELEV); add(A_WORK) }
                if (generalish) add(A_GENERAL_ELEV)
                if (isEmpty()) add(A_WINDOWS_ELEV)
            }.distinct()
            Band.HIGH -> high(ps)
            Band.VERY_HIGH -> {
                val h = high(ps)
                // Keep the two indoor levers first, then the safety line, then the rest.
                (h.take(2) + A_UNWELL + A_FAMILY + h.drop(2)).distinct()
            }
        }
    }

    private fun high(ps: Set<Profile>): List<String> = buildList {
        add(A_WINDOWS)
        add(A_PURIFIER)
        if (Profile.OUTDOOR_WORK in ps) { add(A_WORK); add(maskAction(ps)) }
        if (Profile.EXERCISING in ps || Profile.GENERAL in ps) add(A_EXERCISE)
        if (Profile.HEART_LUNG in ps) add(A_MEDS)
        if (Profile.KIDS in ps) add(A_KIDS)
        add(maskAction(ps))
    }.distinct()

    /** Normal band: "Enjoy the fresh air." or, within 3 h after an episode, the open-windows line. */
    fun calmLine(s: Snapshot): String? {
        if (s.band != Band.NORMAL) return null
        val recent = s.history.dropLast(1).takeLast(3)
        return if (recent.any { HazeCore.band(it.pm25) != Band.NORMAL }) {
            "Air's cleared. Good time to open the windows."
        } else {
            "Enjoy the fresh air."
        }
    }

    // ---------- anchor (COPY §3) ----------

    fun anchor(band: Band): String = when (band) {
        Band.NORMAL -> "Normal is up to 55."
        Band.ELEVATED -> "Elevated band (56–150). High starts at 151."
        Band.HIGH -> "High band (151–250). Very High starts at 251."
        Band.VERY_HIGH -> "Very High band (251 and above)."
    }

    // ---------- trend (COPY §4) ----------

    data class TrendText(val words: String, val a11y: String?)

    /** Point exactly [hours] before the latest one (by timestamp), as in packages/core/src/experience.ts. */
    private fun hourBefore(history: List<HistoryPoint>, hours: Long): HistoryPoint? {
        val last = HazeCore.parseInstant(history.last().time) ?: return null
        val t = last.minusSeconds(hours * 3600)
        return history.firstOrNull { HazeCore.parseInstant(it.time) == t }
    }

    private fun wordFor(d: Int): String = when {
        d >= FAST -> "rising fast"
        d >= 5 -> "rising"
        d <= -FAST -> "clearing fast"
        d <= -5 -> "easing"
        else -> "steady"
    }

    /**
     * COPY §4 trend phrase, an exact port of TS `trendWords` / `trendWord` (golden: packages/core/fixtures/golden/trend.json).
     * Previous hours are matched by timestamp (a missing hour means no trend). The 2-hour variant is used when the
     * 2-h change is bigger and in the same direction; a steady last hour is always "Steady over the last hour".
     * [TrendText.a11y] is the 1-hour word (TS `trendWord`), or null when there's no previous hour.
     */
    fun trend(history: List<HistoryPoint>): TrendText {
        if (history.size < 2) return TrendText("Trend not available yet", null)
        val latest = history.last()
        val h1 = hourBefore(history, 1) ?: return TrendText("Trend not available yet", null)
        val d1 = latest.pm25 - h1.pm25
        val w1 = wordFor(d1)
        if (w1 == "steady") return TrendText("Steady over the last hour", w1)
        val d2 = hourBefore(history, 2)?.let { latest.pm25 - it.pm25 }
        var d = d1
        var span = "in the last hour"
        if (d2 != null && Integer.signum(d2) == Integer.signum(d1) && abs(d2) > abs(d1)) {
            d = d2
            span = "in 2 hours"
        }
        val label = when (wordFor(d)) {
            "rising" -> "Rising"
            "rising fast" -> "Rising fast"
            "easing" -> "Easing"
            "clearing fast" -> "Clearing fast"
            else -> "Steady"
        }
        return TrendText(if (d > 0) "$label: up $d $span" else "$label: down ${abs(d)} $span", w1)
    }

    /** Kept for call sites that still pass the snapshot delta; the delta is derived from [history] as in TS. */
    @Suppress("UNUSED_PARAMETER")
    fun trend(history: List<HistoryPoint>, delta1h: Int): TrendText = trend(history)

    // ---------- provenance, uncertainty, states (COPY §6, §10) ----------

    fun age(from: Instant, now: Instant): String {
        val min = Duration.between(from, now).toMinutes().coerceAtLeast(0)
        return when {
            min < 5 -> "just now"
            min < 60 -> "$min min ago"
            min % 60 == 0L -> "${min / 60} h ago"
            else -> "${min / 60} h ${min % 60} min ago"
        }
    }

    fun km(d: Double): String = String.format(Locale.US, "%.1f", d)

    fun officialPsiLabel(psi: Int?): String =
        if (psi == null) "NEA 24-hr PSI: not available right now" else "NEA 24-hr PSI: $psi (${HazeCore.psiLabel(psi)})"

    /** Rough Singapore bounding box; outside it we show the closest station (COPY §10). */
    fun inSingapore(lat: Double, lon: Double) = lat in 1.13..1.49 && lon in 103.58..104.10

    fun insight(
        s: Snapshot,
        profiles: Set<Profile>,
        userLat: Double? = null,
        userLon: Double? = null,
        now: Instant = Instant.now(),
        /** The region the user picked (region/island mode), for the "two nearest stations" range. */
        selectedRegion: String? = null,
        /** Named place for GPS-mode maths on a picked area / saved place ("Tampines", "Home (Tampines)"). */
        placeName: String? = null,
        /** Newest hour present in NEA's feed, valid or not ([HazeCore.latestHour]); detects "all stations offline". */
        latestHourAt: String? = null,
    ): Insight {
        val observed = HazeCore.parseInstant(s.observedAt) ?: now
        val obs = Format.clock(s.observedAt)
        val ageSuffix = " · ${age(observed, now)}"
        val valid = s.regions.filterValues { it.pm25 != null }
        val region = Format.regionName(s.nearestRegion)
        var blended = false
        var note: String? = null
        val provenance: String

        // Reference point for "two nearest stations".
        val refLat: Double?
        val refLon: Double?
        when (s.locationMode) {
            LocationMode.GPS -> {
                refLat = userLat ?: s.regions[s.nearestRegion]?.lat
                refLon = userLon ?: s.regions[s.nearestRegion]?.lon
            }
            else -> {
                val ref = s.regions[selectedRegion ?: s.nearestRegion] ?: s.regions[s.nearestRegion]
                refLat = ref?.lat
                refLon = ref?.lon
            }
        }
        val byDist = if (refLat == null || refLon == null) emptyList() else
            valid.entries.map { it to HazeCore.haversineKm(refLat, refLon, it.value.lat, it.value.lon) }.sortedBy { it.second }
        val nearestD = byDist.firstOrNull()?.second ?: 0.0

        when (s.locationMode) {
            LocationMode.GPS -> {
                blended = nearestD >= HazeCore.SNAP_KM
                // SPEC v1.4 §4: "Near you · West station 3.2 km" / "Tampines · East station 1.1 km".
                provenance = "${placeName ?: "Near you"} · $region station ${km(nearestD)} km · measured $obs$ageSuffix"
                val closestAny = if (refLat == null || refLon == null) null else
                    s.regions.entries.minByOrNull { HazeCore.haversineKm(refLat, refLon, it.value.lat, it.value.lon) }
                if (closestAny != null && closestAny.value.pm25 == null) {
                    note = "${Format.regionName(closestAny.key)} station is offline. Using nearby stations."
                }
            }
            LocationMode.REGION -> provenance = "NEA $region station · measured $obs$ageSuffix"
            LocationMode.ISLAND -> {
                blended = true
                provenance = if (selectedRegion != null && s.regions[selectedRegion]?.pm25 == null) {
                    "${Format.regionName(selectedRegion)} station is offline. Showing the average of NEA's other stations.$ageSuffix"
                } else {
                    "Singapore (island average) · measured $obs$ageSuffix"
                }
            }
        }

        var range: IntRange? = null
        if (blended && byDist.size >= 2) {
            // Stations that meaningfully shape the estimate: the two nearest plus any within 1.5× the nearest
            // distance. The range is widened to always contain the estimate, so it never looks contradictory.
            val near = byDist.filterIndexed { i, (_, d) -> i < 2 || d <= nearestD * NEAR_FACTOR }.map { it.first.value.pm25!! }
            val lo = minOf(near.min(), s.pm25)
            val hi = maxOf(near.max(), s.pm25)
            if (nearestD > UNCERTAIN_KM || hi - lo > DISAGREE_UG) range = lo..hi
        }

        val ageMin = Duration.between(observed, now).toMinutes()
        if (s.stale) {
            // COPY §10: if NEA published newer hours with every station offline, say so; otherwise the feed is late.
            val newer = latestHourAt?.let { HazeCore.parseInstant(it) }?.let { it > observed } ?: false
            note = if (newer || ageMin <= HazeCore.STALE_AFTER.toMinutes()) {
                "NEA's stations haven't reported since $obs."
            } else {
                "Newer readings from NEA are late. We'll keep checking."
            }
        } else if (ageMin > 75 && note == null) {
            note = "NEA usually posts each hour at about half past. Next update soon."
        }

        val v = verdict(s.band, profiles)
        val t = trend(s.history)
        val display = s.pm25.toString()
        val estimateFor = when {
            s.locationMode == LocationMode.GPS -> placeName ?: "your spot"
            selectedRegion != null -> Format.regionName(selectedRegion)
            else -> "Singapore"
        }
        val sourceLine = if (!blended) {
            "Measured at $region station"
        } else {
            "Estimate for $estimateFor" + (range?.let { " · range ${it.first}–${it.last}" } ?: "")
        }
        val numberA11y = buildString {
            append("PM2.5 ")
            if (blended) append("about ")
            append(s.pm25)
            if (range != null) append(", nearby stations read ${range.first} to ${range.last}")
            append(", ${s.band.label}")
            if (t.a11y != null) append(", ${t.a11y}")
        }
        return Insight(
            verdict = v,
            secondLine = secondLine(s),
            actions = actions(s.band, profiles),
            calmLine = calmLine(s),
            display = display,
            estimate = blended,
            range = range,
            sourceLine = sourceLine,
            trendWords = t.words,
            trendWord = t.a11y,
            anchor = anchor(s.band),
            provenance = provenance,
            note = note,
            officialPsiLabel = officialPsiLabel(s.officialPsi24h),
            accessibility = "${v.long} ${v.forLabel}. $numberA11y.",
            compactAccessibility = "PM2.5 ${s.pm25}, ${s.band.label}${t.a11y?.let { ", $it" } ?: ""}, measured $obs",
            stale = s.stale,
        )
    }
}
