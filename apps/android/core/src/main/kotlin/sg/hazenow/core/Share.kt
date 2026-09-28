package sg.hazenow.core

import java.time.Duration
import java.time.OffsetDateTime
import java.util.Locale
import kotlin.math.abs
import kotlin.math.roundToInt

/**
 * Share system (SPEC v1.6, docs/SHARING.md, docs/share-cards/). A port of packages/core/src/share.ts: same card
 * ids, rules, persona chips and strings. Pure: renderers only lay these strings out.
 * No Instant PSI, no "~", no anti-NEA framing. (Card 5, the Haze receipt, is not in this build.)
 */
enum class ShareCard(val id: String) {
    NOW("now"),
    TWO_CLOCKS("clocks"),
    GROUP("group"),
    ALL_CLEAR("clear");

    companion object {
        fun fromId(id: String) = entries.firstOrNull { it.id == id }
    }
}

/** Persona priority and chip labels (SPEC v1.6 rule 2); ids match TS `Persona`. */
enum class SharePersona(val id: String, val profile: Profile, val chip: String) {
    KIDS("kids", Profile.KIDS, "For the kids · Recess check"),
    ELDERLY("elderly", Profile.ELDERLY, "For Mum and Dad"),
    HEART_LUNG("heart_lung", Profile.HEART_LUNG, "For heart and lung health"),
    PREGNANT("pregnant", Profile.PREGNANT, "For mums-to-be"),
    EXERCISING("exercising", Profile.EXERCISING, "Run check"),
    OUTDOOR_WORKER("outdoor_worker", Profile.OUTDOOR_WORK, "Site check");
}

data class ShareContext(
    /** Area or place name to print ("Tampines"). Defaults to the region / "Singapore". */
    val placeName: String? = null,
    /** The user's point (GPS or area centroid), for the station distance line. */
    val point: LatLon? = null,
    /** Opened from "Why two numbers?" → Two clocks (rule 4). */
    val fromWhyTwoNumbers: Boolean = false,
)

data class SharePick(
    val card: ShareCard,
    /** Persona for the "For our group" card (set whenever the profile has one). */
    val persona: SharePersona?,
    /** Other eligible cards, in display order (never includes [card]). */
    val alternates: List<ShareCard>,
) {
    /** Picked card first, then the alternates: the swipe row. */
    val cards: List<ShareCard> get() = listOf(card) + alternates
}

data class EpisodeStats(
    val worst: HistoryPoint,
    /** Consecutive hourly readings above Normal (> 55) in the most recent episode. */
    val hoursAbove: Int,
    /** First and last hour above Normal. */
    val start: String,
    val end: String,
    /** True if the episode may be longer than the history we have. */
    val truncated: Boolean,
)

data class SharePlace(
    /** printed place name */
    val name: String,
    /** "Air near Tampines" / "Air across Singapore" */
    val hook: String,
    /** "NEA East station · 2.2 km away" / "NEA East station" / "Average of NEA stations" */
    val station: String,
    /** short station for tight footers: "East station" */
    val stationShort: String,
    /** "near Tampines" / "in the West" / "across Singapore", for share text */
    val phrase: String,
)

/** The words for one card (TS `ShareCardContent`). */
sealed interface ShareCardContent {
    val `when`: String
    val place: String
    val pm25: Int
    val band: Band
    val credit: String

    data class Now(
        override val `when`: String, override val place: String, override val pm25: Int, override val band: Band,
        override val credit: String,
        val hook: String, val headline: String, val pmDetail: String, val adviceLabel: String,
        val adviceMost: String, val adviceVulnerable: String, val psiLine: String, val station: String,
    ) : ShareCardContent

    data class Clocks(
        override val `when`: String, override val place: String, override val pm25: Int, override val band: Band,
        override val credit: String,
        val headlineLines: Pair<String, String>, val avg: Int?, val psi: Int?, val bars: List<Int>, val caption: String,
        /** Chart end label: "Now", or the reading's hour when stale (COPY §19). */
        val endLabel: String = "Now",
        /** Stale reading: renderers put the long place/time line on its own row. */
        val stale: Boolean = false,
        /** Left box title: "The last hour", or "The 3pm hour" when stale (COPY §19). */
        val lastHourLabel: String = "The last hour",
    ) : ShareCardContent

    data class Group(
        override val `when`: String, override val place: String, override val pm25: Int, override val band: Band,
        override val credit: String,
        val chip: String, val headline: String, val statsRest: String, val actions: List<String>, val station: String,
    ) : ShareCardContent

    data class Clear(
        override val `when`: String, override val place: String, override val pm25: Int, override val band: Band,
        override val credit: String,
        val headline: String, val bodyLines: Pair<String, String>, val stats: String,
    ) : ShareCardContent

    data class Preview(
        override val `when`: String, override val place: String, override val pm25: Int, override val band: Band,
        override val credit: String,
        val hook: String, val headline: String, val direction: TrendDirection?, val psi: Int?,
    ) : ShareCardContent
}

object ShareCards {
    const val CREDIT = "Yong Quan Tan"
    const val SITE = "hazenow.pages.dev"
    /** 1-hr vs 24-hr gap (µg/m³) that makes the Two clocks card the pick (rule 4). */
    const val CLOCKS_GAP = 40
    /** All-clear looks back this far for an Elevated+ hour (rule 1). */
    const val ALL_CLEAR_LOOKBACK_H = 12L
    /** COPY §19: replaces the verdict headline when the reading is stale. */
    const val STALE_HEADLINE = "Latest NEA reading is delayed."

    /** COPY §19 place/time line value: "reading from Mon 28 Sep, 3pm (latest available)". */
    fun staleWhen(observedAt: String) = "reading from ${formatCardWhen(observedAt)} (latest available)"

    private val DAYS = listOf("Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun") // ISO order
    private val MONTHS = listOf("Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec")

    private fun sgt(iso: String) = OffsetDateTime.parse(iso).atZoneSameInstant(HazeCore.SG_ZONE)
    private fun elevatedPlus(b: Band) = b != Band.NORMAL

    fun personaFor(profiles: Set<Profile>): SharePersona? = SharePersona.entries.firstOrNull { it.profile in profiles }

    /** Latest NEA 24-hr average PM2.5 at the spot, falling back to the mean of the hourly history. */
    fun dayAverage(history: List<HistoryPoint>, avg24h: Int?): Int? {
        if (avg24h != null && avg24h >= 0) return avg24h
        val v = history.map { it.pm25 }.filter { it >= 0 }
        return if (v.isEmpty()) null else (v.sum().toDouble() / v.size).roundToInt()
    }

    private fun wasElevatedRecently(history: List<HistoryPoint>, observedAt: String): Boolean {
        val t = HazeCore.parseInstant(observedAt) ?: return false
        return history.any { h ->
            val ht = HazeCore.parseInstant(h.time) ?: return@any false
            ht < t && Duration.between(ht, t) <= Duration.ofHours(ALL_CLEAR_LOOKBACK_H) && h.pm25 > 55
        }
    }

    /**
     * Auto-pick (SPEC v1.6, first match wins):
     * 1 Normal now and ≥ Elevated within 12 h → clear
     * 2 persona in profile and band ≥ Elevated → group
     * 3 band ≥ Elevated → now
     * 4 |1-hr − 24-hr avg| ≥ 40, or opened from "Why two numbers?" → clocks
     * 5 otherwise → now
     * Alternates: now, clocks, group (if a persona), clear (only if rule 1 applies).
     */
    fun pickShareCard(
        s: Snapshot,
        profiles: Set<Profile> = setOf(Profile.GENERAL),
        history: List<HistoryPoint> = s.history,
        context: ShareContext = ShareContext(),
        avg24h: Int? = null,
    ): SharePick {
        val persona = personaFor(profiles)
        val clearEligible = s.band == Band.NORMAL && wasElevatedRecently(history, s.observedAt)
        val avg = dayAverage(history, avg24h)
        val card = when {
            clearEligible -> ShareCard.ALL_CLEAR
            persona != null && elevatedPlus(s.band) -> ShareCard.GROUP
            elevatedPlus(s.band) -> ShareCard.NOW
            context.fromWhyTwoNumbers || (avg != null && abs(s.pm25 - avg) >= CLOCKS_GAP) -> ShareCard.TWO_CLOCKS
            else -> ShareCard.NOW
        }
        val eligible = buildList {
            add(ShareCard.NOW); add(ShareCard.TWO_CLOCKS)
            if (persona != null) add(ShareCard.GROUP)
            if (clearEligible) add(ShareCard.ALL_CLEAR)
        }
        return SharePick(card, persona, eligible.filter { it != card })
    }

    // ---------------------------------------------------------------- episode stats (All clear)

    /**
     * The most recent run of hours above Normal before now: worst hour and length.
     * Consecutive = 1 hour apart; a missing hour ends the run. Null if there was none.
     */
    fun episodeStats(history: List<HistoryPoint>): EpisodeStats? {
        val end = history.indexOfLast { it.pm25 > 55 }
        if (end < 0) return null
        var start = end
        while (start > 0 && history[start - 1].pm25 > 55 && gapIsOneHour(history[start - 1].time, history[start].time)) start--
        var worst = history[start]
        for (i in start..end) if (history[i].pm25 > worst.pm25) worst = history[i]
        return EpisodeStats(worst, end - start + 1, history[start].time, history[end].time, truncated = start == 0)
    }

    private fun gapIsOneHour(a: String, b: String): Boolean {
        val ta = HazeCore.parseInstant(a) ?: return false
        val tb = HazeCore.parseInstant(b) ?: return false
        return Duration.between(ta, tb) == Duration.ofHours(1)
    }

    // ---------------------------------------------------------------- card words

    /** "Mon 28 Sep, 5pm" (Singapore time). Absolute time only on images (SHARING §4.1). */
    fun formatCardWhen(iso: String): String = try {
        val d = sgt(iso)
        "${DAYS[d.dayOfWeek.value - 1]} ${d.dayOfMonth} ${MONTHS[d.monthValue - 1]}, ${Format.clock(iso)}"
    } catch (e: Exception) {
        iso
    }

    fun slug(place: String): String =
        place.lowercase(Locale.ROOT).replace(Regex("[^a-z0-9]+"), "-").trim('-').ifEmpty { "singapore" }

    /** Filename with the time in it: "hazenow-tampines-2026-09-28-1700.png" (non-now cards get a suffix). */
    fun shareFileName(place: String, observedAt: String, card: String = "now"): String {
        val d = sgt(observedAt)
        val stamp = String.format(Locale.US, "%04d-%02d-%02d-%02d%02d", d.year, d.monthValue, d.dayOfMonth, d.hour, d.minute)
        return "hazenow-${slug(place)}-$stamp${if (card == "now") "" else "-$card"}.png"
    }

    /** NEA's own 1-hr PM2.5 advice split (healthy / vulnerable), per band. */
    fun neaAdvice(band: Band): Pair<String, String> = when (band) {
        Band.NORMAL -> "Continue normal activities." to "Continue normal activities."
        Band.ELEVATED -> "Reduce strenuous outdoor activity." to "Avoid strenuous outdoor activity."
        Band.HIGH -> "Avoid strenuous outdoor activity." to "Avoid all outdoor activity."
        Band.VERY_HIGH -> "Minimise all outdoor activity." to "Avoid all outdoor activity."
    }

    private fun trendWord(s: Snapshot) = Experience.trend(s.history, s.trend.delta).a11y

    /** "Elevated, and rising." / "Normal right now." */
    fun nowHeadline(s: Snapshot): String {
        val w = trendWord(s) ?: return "${s.band.label} right now."
        return "${s.band.label}, and ${if (w == "clearing fast") "clearing" else w}."
    }

    /** "up 36 in 2 hours" / "steady over the last hour" / "" */
    fun trendDetail(s: Snapshot): String {
        val t = Experience.trend(s.history, s.trend.delta)
        if (t.a11y == null) return ""
        val i = t.words.indexOf(": ")
        return (if (i >= 0) t.words.substring(i + 2) else t.words).replaceFirst(Regex("^Steady"), "steady")
    }

    fun sharePlace(s: Snapshot, ctx: ShareContext = ShareContext()): SharePlace {
        val r = if (s.nearestRegion.isNotEmpty()) Format.regionName(s.nearestRegion) else ""
        if (s.locationMode == LocationMode.ISLAND) {
            val name = ctx.placeName ?: "Singapore"
            val hook = if (r.isNotEmpty()) "Air near ${ctx.placeName ?: r}" else "Air across Singapore"
            return SharePlace(
                ctx.placeName ?: (if (r.isNotEmpty()) r else "Singapore"), hook, "Average of NEA stations", "NEA stations",
                if (r.isNotEmpty()) "near $name" else "across Singapore",
            )
        }
        var station = "NEA $r station"
        val p = ctx.point
        if (s.locationMode == LocationMode.GPS && p != null) {
            s.regions[s.nearestRegion]?.let { reg ->
                val d = HazeCore.haversineKm(p.latitude, p.longitude, reg.lat, reg.lon)
                station += " · ${if (d < 10) String.format(Locale.US, "%.1f", d) else d.roundToInt().toString()} km away"
            }
        }
        val name = ctx.placeName ?: r
        val phrase = when {
            ctx.placeName != null -> "near ${ctx.placeName}"
            s.locationMode == LocationMode.GPS -> "near me"
            s.nearestRegion == "central" -> "in Central"
            else -> "in the $r"
        }
        return SharePlace(name, "Air near $name", station, "$r station", phrase)
    }

    private fun nextCheck(observedAt: String): String =
        HazeCore.parseInstant(observedAt)?.plusSeconds(3600)?.let { Format.clock(it.atZone(HazeCore.SG_ZONE).toOffsetDateTime().toString()) } ?: ""

    /** The words for one card ("preview" = the 1200×630 link preview). */
    fun shareCardContent(
        card: String,
        s: Snapshot,
        profiles: Set<Profile> = setOf(Profile.GENERAL),
        ctx: ShareContext = ShareContext(),
        avg24h: Int? = null,
    ): ShareCardContent {
        val place = sharePlace(s, ctx)
        // COPY §19: never present stale data as "now".
        val w = if (s.stale) staleWhen(s.observedAt) else formatCardWhen(s.observedAt)
        val hookLine = if (s.stale) "${place.name} · $w" else "${place.hook} · $w"
        fun headline(normal: String) = if (s.stale) STALE_HEADLINE else normal
        val hourName = "the ${Format.clock(s.observedAt)} hour" // "the 3pm hour" (stale phrasing)
        val label = s.band.label
        return when (card) {
            "now" -> {
                // Stale: no trend (an old trend could mislead).
                val detail = if (s.stale) "" else trendDetail(s)
                val (most, vulnerable) = neaAdvice(s.band)
                ShareCardContent.Now(
                    w, place.name, s.pm25, s.band, CREDIT,
                    hook = hookLine,
                    headline = headline(nowHeadline(s)),
                    pmDetail = "µg/m³ 1-hr PM2.5${if (detail.isNotEmpty()) " · $detail" else ""}",
                    adviceLabel = if (s.stale) "NEA’s advice for that hour" else "NEA’s advice for the next hour",
                    adviceMost = most, adviceVulnerable = vulnerable,
                    psiLine = when {
                        s.stale && s.officialPsi24h == null -> "The 24-hr PSI averages the whole day. This reading is for $hourName."
                        s.stale -> "The 24-hr PSI (${s.officialPsi24h}) averages the whole day. This reading is for $hourName."
                        s.officialPsi24h == null -> "The 24-hr PSI averages the whole day. This is the last hour. Same NEA data, different clock."
                        else -> "The 24-hr PSI (${s.officialPsi24h}) averages the whole day. This is the last hour. Same NEA data, different clock."
                    },
                    station = place.station,
                )
            }
            "clocks" -> {
                val avg = dayAverage(s.history, avg24h)
                val falling = avg != null && s.pm25 < avg
                ShareCardContent.Clocks(
                    w, place.name, s.pm25, s.band, CREDIT,
                    headlineLines = "Same NEA data." to "Two clocks.",
                    avg = avg, psi = s.officialPsi24h,
                    bars = s.history.takeLast(24).map { it.pm25 },
                    caption = if (falling) {
                        "The daily number catches up slowly, both ways: the air has cleared, but the 24-hr average stays high for a while."
                    } else {
                        "The daily number catches up slowly, both ways: when haze clears, it stays high for a while too."
                    },
                    endLabel = if (s.stale) Format.clock(s.observedAt) else "Now",
                    stale = s.stale,
                    lastHourLabel = if (s.stale) hourName.replaceFirstChar { it.uppercase() } else "The last hour",
                )
            }
            "group" -> {
                val persona = personaFor(profiles)
                val v = Experience.verdict(s.band, profiles)
                val headline = when {
                    s.band == Band.NORMAL -> v.long
                    v.short.contains("for now", ignoreCase = true) -> "${v.short}."
                    else -> "${v.short}, for now."
                }
                val acts = Experience.actions(s.band, profiles).take(2)
                val tw = if (s.stale) null else trendWord(s)
                ShareCardContent.Group(
                    w, place.name, s.pm25, s.band, CREDIT,
                    chip = persona?.chip ?: "For our group",
                    headline = headline(headline),
                    statsRest = "µg/m³ · $label${if (tw != null) " · $tw" else ""}",
                    // Stale: a "next check" time would already be in the past.
                    actions = acts.ifEmpty { listOf("Enjoy the fresh air.") } +
                        (if (s.stale) "Check hazenow.pages.dev for NEA’s next update." else "Next check at ${nextCheck(s.observedAt)}."),
                    station = place.stationShort,
                )
            }
            "clear" -> {
                val ep = episodeStats(s.history)
                val stats = if (ep == null) "" else {
                    val sameDay = sgt(ep.worst.time).dayOfMonth == sgt(s.observedAt).dayOfMonth
                    val at = Format.clock(ep.worst.time) + if (sameDay) "" else " ${DAYS[sgt(ep.worst.time).dayOfWeek.value - 1]}"
                    val hrs = "${if (ep.truncated) "At least " else ""}${ep.hoursAbove} hour${if (ep.hoursAbove == 1) "" else "s"} above Normal."
                    "Worst hour this episode: ${ep.worst.pm25} at $at. $hrs"
                }
                ShareCardContent.Clear(
                    w, place.name, s.pm25, s.band, CREDIT,
                    headline = headline("Air’s back to Normal."),
                    bodyLines = "PM2.5 ${s.pm25} µg/m³. Fine to be out." to "Open the windows.",
                    stats = stats,
                )
            }
            else -> ShareCardContent.Preview(
                w, place.name, s.pm25, s.band, CREDIT,
                hook = hookLine,
                headline = headline(nowHeadline(s)),
                direction = if (!s.stale && trendWord(s) != null) s.trend.direction else null,
                psi = s.officialPsi24h,
            )
        }
    }

    /** Share text per card (COPY §15 style, headline-matched), always ending with the site / link. */
    fun shareCardText(
        card: ShareCard,
        s: Snapshot,
        profiles: Set<Profile> = setOf(Profile.GENERAL),
        ctx: ShareContext = ShareContext(),
        site: String = SITE,
        avg24h: Int? = null,
    ): String {
        val place = sharePlace(s, ctx)
        val label = s.band.label
        val t = Format.clock(s.observedAt)
        val psi = if (s.officialPsi24h == null) "" else " NEA 24-hr PSI: ${s.officialPsi24h} (${HazeCore.psiLabel(s.officialPsi24h)})."
        val credit = "Data: NEA via data.gov.sg."
        if (s.stale) {
            return "$STALE_HEADLINE ${place.name} · ${staleWhen(s.observedAt)}: $label (PM2.5 ${s.pm25}).$psi $credit $site"
        }
        return when (card) {
            ShareCard.NOW -> {
                val w = trendWord(s)
                "Air ${place.phrase} at $t: $label (PM2.5 ${s.pm25})${if (w != null) ", $w" else ""}.$psi $credit $site"
            }
            ShareCard.TWO_CLOCKS -> {
                val avg = dayAverage(s.history, avg24h)
                "Same NEA data, two clocks. ${place.name} at $t: last hour PM2.5 ${s.pm25}${if (avg != null) ", 24-hr average $avg" else ""}.$psi $credit $site"
            }
            ShareCard.GROUP -> {
                val c = shareCardContent("group", s, profiles, ctx) as ShareCardContent.Group
                "${c.chip}, ${place.name} at $t: ${c.headline} PM2.5 ${s.pm25} ($label). $credit $site"
            }
            ShareCard.ALL_CLEAR -> {
                val c = shareCardContent("clear", s, profiles, ctx) as ShareCardContent.Clear
                "Air's back to Normal ${place.phrase} (PM2.5 ${s.pm25} at $t). Fine to be out.${if (c.stats.isNotEmpty()) " ${c.stats.replace("’", "'")}" else ""} $credit $site"
            }
        }
    }

    /** Share link carrying `?area=` so the server-rendered link preview (card 6) matches. */
    fun shareLink(place: String): String = "https://$SITE/?area=${slug(place)}"
}
