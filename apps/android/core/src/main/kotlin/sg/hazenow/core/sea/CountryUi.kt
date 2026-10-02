package sg.hazenow.core.sea

import sg.hazenow.core.Format
import sg.hazenow.core.sea.CountryCode.ID
import sg.hazenow.core.sea.CountryCode.PH
import sg.hazenow.core.sea.CountryCode.SG
import java.util.Locale
import kotlin.math.abs
import kotlin.math.roundToInt
import kotlin.math.roundToLong

data class ChipModel(
    val en: String,
    val local: String?,
    val lang: String,
    val agency: String,
    val color: String,
    val shape: String,
    val basisNote: String,
    /** Show a small "estimate" tag (community estimate or WHO guidance). */
    val estimate: Boolean,
    /** 0–3, for the shape and the tint. */
    val level: Int,
)

data class OfficialRowModel(val label: String, val value: String, val en: String?, val local: String?, val lang: String, val text: String)

data class CountryDisplay(
    val chip: ChipModel?,
    /** The small line under the number (the only place the "no official …" caveats may appear). */
    val numberSub: String,
    val kindLabel: String?,
    val provenance: String?,
    val official: OfficialRowModel?,
    val officialExplainer: String?,
    val noNumber: Pair<String, String>?,
    val whoLine: String?,
    val sensorLine: String?,
    val notices: List<String>,
    val attribution: List<Attribution>,
)

data class OfficialDownCopy(val title: String, val line: String, val cachedLine: String?, val statusLine: String)

/** Display model for a CountrySnapshot outside Singapore (port of countries/ui.ts). English UI, local words beside. */
object CountryUi {
    /** "live" | "unavailable". Android never shows recorded preview data: a proxied place with no proxy is unavailable. */
    fun cityLive(c: CityPlace, proxyConfigured: Boolean): Boolean =
        c.status == Coverage.LIVE_DIRECT || (c.status == Coverage.NEEDS_PROXY && proxyConfigured)

    /* ------------------------------------------------------------ time */

    fun zoneLabel(offsetHours: Double, cc: CountryCode): String {
        if (cc == ID) return when (offsetHours) { 7.0 -> "WIB"; 8.0 -> "WITA"; 9.0 -> "WIT"; else -> "UTC+${Verdicts.fmt1(offsetHours)}" }
        val byCc = mapOf(
            SG to (8.0 to "SGT"), CountryCode.TH to (7.0 to "ICT"), CountryCode.VN to (7.0 to "ICT"), CountryCode.LA to (7.0 to "ICT"),
            CountryCode.KH to (7.0 to "ICT"), CountryCode.MY to (8.0 to "MYT"), PH to (8.0 to "PHT"), CountryCode.BN to (8.0 to "BNT"),
            CountryCode.MM to (6.5 to "MMT"), CountryCode.TL to (9.0 to "TLT"),
        )
        byCc[cc]?.let { if (it.first == offsetHours) return it.second }
        val h = offsetHours.toInt()
        val m = (abs(offsetHours - h) * 60).roundToInt()
        return "UTC${if (offsetHours >= 0) "+" else "-"}${abs(h)}${if (m != 0) ":${m.toString().padStart(2, '0')}" else ""}"
    }

    fun localOffsetHours(cc: CountryCode, lon: Double? = null): Double {
        if (cc == ID && lon != null) return if (lon < 114.5) 7.0 else if (lon < 127) 8.0 else 9.0
        return Registry.of(cc).utcOffset
    }

    private val OFF = Regex("""([+-])(\d{2}):(\d{2})$""")
    fun isoOffsetHours(iso: String): Double? {
        val m = OFF.find(iso) ?: return if (iso.endsWith("Z")) 0.0 else null
        return (if (m.groupValues[1] == "-") -1 else 1) * (m.groupValues[2].toDouble() + m.groupValues[3].toDouble() / 60)
    }

    fun toLocalIso(iso: String, cc: CountryCode, lon: Double? = null): String {
        val off = isoOffsetHours(iso)
        if (off != null && off != 0.0) return iso
        val ms = SeaTime.parseMs(iso) ?: return iso
        return SeaTime.msToIso(ms, localOffsetHours(cc, lon))
    }

    /** "5pm" in the station's local time, plus its zone when it differs from the viewer's ("5pm ICT"). */
    fun stationTime(iso: String, cc: CountryCode, viewerOffsetHours: Double? = null, lon: Double? = null): String {
        val local = toLocalIso(iso, cc, lon)
        val off = isoOffsetHours(local)
        val t = if (off == 8.0 && cc == SG) Format.clock(local) else Verdicts.formatLocalTime(local)
        if (off == null || viewerOffsetHours == null || off == viewerOffsetHours) return t
        return "$t ${zoneLabel(off, cc)}"
    }

    /* ------------------------------------------------------------ official down */

    /** "Thailand's official data", "the Philippines' official data". */
    fun officialDataOf(cc: CountryCode): String {
        val n = if (cc == PH) "the Philippines" else Registry.of(cc).name
        return "${if (n.endsWith("s")) "$n'" else "$n's"} official data"
    }

    /** COPY §10 "API error / timeout", per country; `cachedLine` when a cached reading is shown with its age. */
    fun officialDownCopy(cc: CountryCode, cachedObservedAt: String? = null, now: Long = System.currentTimeMillis(), viewerOffsetHours: Double? = null): OfficialDownCopy {
        val title = "Can't reach ${officialDataOf(cc)} right now"
        var cachedLine: String? = null
        val t = cachedObservedAt?.let(SeaTime::parseMs)
        if (cachedObservedAt != null && t != null) {
            val min = maxOf(0L, ((now - t) / 60_000.0).roundToLong())
            val age = when {
                min < 60 -> "$min min ago"
                min < 48 * 60 -> "${min / 60} hr${if (min / 60 == 1L) "" else "s"} ago"
                else -> "${min / 1440} days ago"
            }
            cachedLine = "$title. Showing the last reading we got, from ${stationTime(cachedObservedAt, cc, viewerOffsetHours)} ($age)."
        }
        return OfficialDownCopy(title, "We'll try again in a few minutes.", cachedLine, "$title. We'll try again in a few minutes.")
    }

    const val NOTICE_NO_ANCHOR = "There's no official station within 25 km to check these sensors against, so this is an estimate, not a measurement."
    const val NOTICE_IMPLAUSIBLE = "A station reading looked wrong and was left out."
    const val NOTICE_OFFLINE = "A nearby station hasn't reported for over a day, so it was left out."

    private fun officialWithin25(s: CountrySnapshot) =
        s.stations.any { it.grade == "reference" && it.distanceKm != null && it.distanceKm <= 25 }

    fun snapshotNotices(s: CountrySnapshot): List<String> = buildList {
        if (s.pm25Kind == "crowd_estimate" && "official_unavailable" !in s.notes && !officialWithin25(s)) add(NOTICE_NO_ANCHOR)
        if ("implausible_dropped" in s.notes) add(NOTICE_IMPLAUSIBLE)
        if ("offline_dropped" in s.notes) add(NOTICE_OFFLINE)
    }

    private fun avg(a: String) = when (a) { "24h" -> "24-hr"; "nowcast" -> "hourly"; else -> "1-hr" }
    private fun km(d: Double) = if (d < 10) String.format(Locale.US, "%.1f", d) else d.roundToLong().toString()

    fun officialRow(s: CountrySnapshot): OfficialRowModel? {
        val o = s.official ?: return null
        var en: String? = null
        var local: String? = null
        var lang = "en"
        val lb = s.localBand
        if (s.bandBasis == "official_index" && lb != null) {
            en = lb.labelEn; local = lb.labelLocal; lang = lb.lang
        } else {
            val b = runCatching { Scales.classifyIndex(o.scaleId, o.value).also { lang = Scales.getScale(o.scaleId).lang } }.getOrNull()
            if (b != null && (o.category == null || o.category == b.labelLocal || o.category == b.labelEn)) {
                en = b.labelEn; local = b.labelLocal
            } else if (o.category != null) local = o.category
        }
        if (local != null && en != null && local == en) local = null
        val label = "${o.agency} ${o.name} (${avg(o.averaging)})"
        val word = en ?: local
        return OfficialRowModel(label, o.valueText, en, local, lang, "$label: ${o.valueText}${if (word != null) " · $word" else ""}")
    }

    /** WHO-guide chip tones, low → very high (neutral blues, never an authority's colour). */
    val WHO_CHIP_COLOR = listOf("#6690AE", "#5B84B1", "#5873AE", "#6268A9")
    private val SHAPES = listOf("circle", "half", "triangle", "octagon")

    fun countryDisplay(s: CountrySnapshot, placeName: String? = null, viewerOffsetHours: Double? = null, lon: Double? = null): CountryDisplay {
        val b = s.localBand
        var chip: ChipModel? = null
        if (b != null) {
            val basisNote = when {
                s.bandBasis == "official_index" && s.official != null -> "${b.agency} category for the ${avg(s.official.averaging)} ${s.official.name}"
                s.bandFromEstimate -> "${b.agency} category, applied to the community-sensor estimate"
                else -> "${Scales.getScale(b.scaleId).indexName ?: b.agency} category for this hour's PM2.5"
            }
            chip = ChipModel(b.labelEn, b.labelLocal.takeIf { it.isNotEmpty() && it != b.labelEn }, b.lang, b.agency, b.color, b.shape, basisNote, s.bandFromEstimate, b.level)
        } else if (s.pm25 != null && Scales.CHIP_SCALE[s.country] == null) {
            val w = Verdicts.whoVerdictBand(s.pm25)
            chip = ChipModel(
                "WHO guide: ${w.word}", null, "en", "WHO 2021", WHO_CHIP_COLOR[w.level], SHAPES[w.level],
                "WHO 2021 guidance, applied to this hour's estimate. There's no national scale here.", s.pm25Kind == "crowd_estimate", w.level,
            )
        }
        val time = stationTime(s.observedAt, s.country, viewerOffsetHours, lon)
        var provenance: String? = null
        var kindLabel: String? = null
        val range = s.range?.let { " · range ${it[0]}–${it[1]}" } ?: ""
        val nearest = s.nearest
        if (s.pm25Kind == "official_1h" && nearest != null) {
            kindLabel = "Official reading"
            provenance = if (s.range != null) "Estimate for ${placeName ?: "your spot"} from official stations$range · $time"
            else "Measured at ${nearest.name} station${nearest.distanceKm?.let { " · ${km(it)} km" } ?: ""} · $time"
        } else if (s.pm25Kind == "crowd_estimate") {
            kindLabel = "Community sensors · estimate"
            val n = maxOf(1, s.stations.count { it.grade == "lowcost" && (it.distanceKm ?: 99.0) <= 10 })
            provenance = "${Verdicts.crowdProvenance(minOf(n, 8))}$range · $time"
        } else if (nearest != null) {
            val agency = s.official?.agency ?: b?.agency ?: ""
            provenance = "Nearest ${if (agency.isNotEmpty()) "$agency " else ""}station: ${nearest.name}${nearest.distanceKm?.let { " · ${km(it)} km" } ?: ""} · $time"
        }
        val official = officialRow(s)
        val explainer = if (official != null && s.official?.averaging == "24h" && s.pm25 != null)
            "The 24-hr index averages the last 24 hours. The number above is the latest hour." else null
        val noNumber = if (s.pm25 == null) {
            val o = s.official
            if (o != null) "No official hourly reading here" to
                "${o.agency} publishes a ${avg(o.averaging)} index for this area, so that's what we show. It moves slowly: it averages the last ${if (o.averaging == "24h") "24 hours" else "hours"}."
            else "No reading near here right now" to "There's no official station or community sensor close enough for an honest number."
        } else null
        return CountryDisplay(
            chip = chip,
            numberSub = numberSub(s),
            kindLabel = kindLabel,
            provenance = provenance,
            official = official,
            officialExplainer = explainer,
            noNumber = noNumber,
            whoLine = if (b == null && s.whoMultiple != null) Verdicts.whoLine(s.whoMultiple) else null,
            sensorLine = nearbySensorLine(s),
            notices = snapshotNotices(s),
            attribution = s.attribution,
        )
    }

    /** The small line directly under the big number. */
    fun numberSub(s: CountrySnapshot): String {
        if (s.pm25Kind != "crowd_estimate") return "PM2.5 · last hour"
        val tail = "community sensors estimate"
        if ("official_unavailable" in s.notes) return "${officialDataOf(s.country).replaceFirstChar { it.uppercase() }} isn't responding right now · $tail"
        if (Scales.CHIP_SCALE[s.country] == null) return "There's no official air-quality scale here · $tail"
        if (!officialWithin25(s)) return "No official reading near here · $tail"
        return "PM2.5 · community sensors"
    }

    const val SENSOR_LINE_KM = 20.0

    fun nearbySensorLine(s: CountrySnapshot): String? {
        val b = s.localBand
        if (s.pm25 != null || b == null || s.bandBasis != "official_index") return null
        val worse = s.stations.filter { x ->
            if (x.grade != "lowcost" || x.pm25_1h == null || x.distanceKm == null || x.distanceKm > SENSOR_LINE_KM) return@filter false
            val cat = Scales.classifyPm25(b.scaleId, x.pm25_1h)
            cat?.level != null && cat.level > b.level
        }
        if (worse.isEmpty()) return null
        val top = worse.maxOf { it.pm25_1h!! }.roundToLong()
        return if (worse.size == 1) "A community sensor nearby reads $top µg/m³ right now." else "Community sensors nearby read up to $top µg/m³ right now."
    }

    fun mainAgency(s: CountrySnapshot): String =
        s.localBand?.agency ?: s.official?.agency ?: if (s.pm25Kind == "crowd_estimate") "community sensors" else Registry.of(s.country).name

    private fun trendWord(d: Int): String = when {
        d >= 20 -> "rising fast"; d >= 5 -> "rising"; d <= -20 -> "clearing fast"; d <= -5 -> "easing"; else -> "steady"
    }

    /** Share text (SPEC v2.0 §9): names the scale and the authority, never mixes scales. */
    fun countryShareText(s: CountrySnapshot, placeName: String, site: String = "hazenow.pages.dev", lon: Double? = null): String {
        val `when` = stationTime(s.observedAt, s.country, -99.0, lon)
        val parts = mutableListOf<String>()
        if (s.stale) parts += "Latest reading is delayed."
        parts += if (s.pm25 != null) "PM2.5 ${s.pm25} µg/m³${if (s.pm25Kind == "crowd_estimate") " (community-sensor estimate)" else ""} in $placeName at $`when`"
        else "$placeName at $`when`"
        val b = s.localBand
        if (b != null && s.bandBasis == "pm25_1h") {
            val scaleName = Scales.getScale(b.scaleId).indexName ?: b.scaleId
            parts += "${b.labelLocal}${if (b.labelLocal != b.labelEn) " (${b.labelEn})" else ""}, $scaleName category, ${b.agency} hourly"
        } else officialRow(s)?.let { parts += it.text }
        if (b == null && s.whoMultiple != null) parts += Verdicts.whoLine(s.whoMultiple).removeSuffix(".")
        val h = s.history
        if (!s.stale && s.pm25 != null && h.size >= 2) {
            val last = SeaTime.parseMs(h.last().time)
            val prev = last?.let { t -> h.firstOrNull { SeaTime.parseMs(it.time) == t - SeaTime.HOUR_MS } }
            if (prev != null) parts += trendWord(h.last().pm25 - prev.pm25)
        }
        val data = "Data: " + s.attribution.joinToString(", ") { it.text.removePrefix("Data: ") }
        return "${parts.joinToString(" · ")} · $data · via HazeNow $site"
    }
}
