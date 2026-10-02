package sg.hazenow.core.sea

import sg.hazenow.core.HazeCore
import sg.hazenow.core.LocationMode
import sg.hazenow.core.RegionReading
import sg.hazenow.core.Trend
import sg.hazenow.core.TrendDirection
import kotlin.math.abs
import kotlin.math.max
import kotlin.math.min
import kotlin.math.roundToLong

/** The official source failed and nothing else is in range: the client shows its cache, or a calm "can't reach" state. */
class OfficialUnavailableException(val country: CountryCode, val source: String) :
    Exception("$source isn't responding and no community sensor is in range")

class NoCountryDataException(message: String = "No usable observations for this location") : Exception(message)

/**
 * ObservationSet + location → CountrySnapshot. Pure and deterministic; a line-by-line port of countries/build.ts
 * (SPEC v2.0 §4: official ≤ 25 km, else community sensors ≤ 10 km, else official ≤ 60 km, else no number).
 */
object CountryBuilder {
    const val OFFICIAL_PREFERRED_KM = 25.0
    const val OFFICIAL_MAX_KM = 60.0
    const val CROWD_RADIUS_KM = 10.0
    const val SNAP_KM = 0.5
    const val HOTSPOT_RADIUS_KM = 100.0
    val STALE_AFTER_MS: Long = HazeCore.STALE_AFTER.toMillis()
    private const val HOUR = SeaTime.HOUR_MS

    private data class Ranked(val o: Observation, val d: Double)
    private data class Used(val v: Double, val d: Double, val o: Observation)

    private fun valid(v: Double?) = v != null && v.isFinite() && v >= 0
    private fun valueOf(o: Observation): Double? = (o.pm25_1h ?: o.pm25_now)?.takeIf { valid(it) }
    private fun ms(iso: String): Long = SeaTime.parseMs(iso) ?: Long.MIN_VALUE / 4

    private fun round1(d: Double) = (d * 10).roundToLong() / 10.0

    private fun summary(r: Ranked) = StationSummary(
        r.o.stationId, r.o.name, round1(r.d), r.o.grade, r.o.pm25_1h ?: r.o.pm25_now, r.o.official, r.o.periodEnd,
    )

    private fun valueAt(o: Observation, t: Long): Double? {
        val h = o.history?.firstOrNull { SeaTime.parseMs(it.time) == t }
        if (h != null) return h.pm25?.takeIf { valid(it) }
        if (SeaTime.parseMs(o.periodEnd) == t) return valueOf(o)
        return null
    }

    private fun idw(pts: List<Pair<Double, Double>>): Double {
        if (pts[0].second < SNAP_KM) return pts[0].first
        var num = 0.0
        var den = 0.0
        for ((v, d) in pts) {
            val w = 1 / (d * d)
            num += w * v
            den += w
        }
        return num / den
    }

    private fun rangeOf(pool: List<Used>, estimate: Int): List<Int>? {
        if (pool.isEmpty()) return null
        val limit = pool[0].d * 1.5
        val vals = pool.filterIndexed { i, p -> i < 2 || p.d <= limit }.map { HazeCore.roundHalfUp(it.v) } + estimate
        val r = listOf(vals.min(), vals.max())
        return if (r[0] == r[1]) null else r
    }

    private val OFFSET = Regex("""([+-])(\d{2}):(\d{2})$""")
    private fun sameOffset(t: Long, sample: String): String {
        val m = OFFSET.find(sample) ?: return SeaTime.isoUtc(t)
        val off = (if (m.groupValues[1] == "-") -1 else 1) * (m.groupValues[2].toDouble() + m.groupValues[3].toDouble() / 60)
        return SeaTime.msToIso(t, off)
    }

    private fun hourKey(t: Long): Long = Math.round(t.toDouble() / HOUR) * HOUR

    fun build(set: ObservationSet, query: CountryQuery = CountryQuery(), now: Long = System.currentTimeMillis()): CountrySnapshot {
        val t = now
        val cc = set.country
        val meta = Registry.of(cc)
        val notes = mutableListOf<String>()
        if (set.officialUnavailable != null) notes += "official_unavailable"
        val own = set.observations.filter { it.country == cc }
        if (own.size != set.observations.size) notes += "other_country_dropped"
        val screened = Quality.screen(own, t)
        val obs = screened.kept

        val pinned = query.station?.let { s -> obs.firstOrNull { it.stationId == s } }
        val pLat: Double
        val pLon: Double
        var locationMode = LocationMode.GPS
        if (query.lat != null && query.lon != null && query.lat.isFinite() && query.lon.isFinite()) {
            pLat = query.lat; pLon = query.lon
        } else if (pinned != null) {
            pLat = pinned.lat; pLon = pinned.lon; locationMode = LocationMode.REGION
        } else {
            pLat = meta.defaultPlace.lat; pLon = meta.defaultPlace.lon; locationMode = LocationMode.REGION
            notes += "default_place"
        }
        fun dist(lat: Double, lon: Double) = HazeCore.haversineKm(pLat, pLon, lat, lon)
        fun dist(o: Observation) = dist(o.lat, o.lon)

        val nearestKept = obs.filter { it.grade == "reference" }.minOfOrNull { dist(it) } ?: Double.POSITIVE_INFINITY
        if (screened.offline.any { it.grade == "reference" && dist(it) <= min(OFFICIAL_PREFERRED_KM, nearestKept) }) notes += "offline_dropped"
        if (screened.implausible.any { dist(it) <= OFFICIAL_MAX_KM }) notes += "implausible_dropped"

        fun ranked(list: List<Observation>): List<Ranked> =
            list.map { Ranked(it, dist(it)) }.sortedWith(compareBy<Ranked> { it.d }.thenBy { it.o.stationId })
        fun fresh(o: Observation) = t - ms(o.periodEnd) <= STALE_AFTER_MS
        fun preferFresh(list: List<Observation>): List<Observation> {
            val f = list.filter(::fresh)
            if (f.isNotEmpty() && f.size < list.size) notes += "stale_stations_dropped"
            return f.ifEmpty { list }
        }

        val within = query.withinKm?.takeIf { it > 0 } ?: Double.POSITIVE_INFINITY
        fun near(list: List<Observation>) = if (within.isInfinite()) list else list.filter { dist(it) <= within }
        if (!within.isInfinite()) notes += "within_radius"

        val official1h = ranked(preferFresh(near(obs.filter { it.grade == "reference" && valid(it.pm25_1h) })))
        val crowd = ranked(obs.filter { Crowd.usable(it) && valueOf(it) != null && fresh(it) }).filter { it.d <= min(CROWD_RADIUS_KM, within) }

        // 2. Big number source.
        var kind: String? = null
        var pool: List<Ranked> = emptyList()
        val n0 = official1h.firstOrNull()
        if (n0 != null && n0.d <= OFFICIAL_PREFERRED_KM) kind = "official_1h"
        else if (crowd.isNotEmpty()) kind = "crowd_estimate"
        else if (n0 != null && n0.d <= OFFICIAL_MAX_KM) {
            kind = "official_1h"; notes += "nearest_far"
        } else notes += if (official1h.isNotEmpty() || obs.any { it.grade == "reference" }) "no_reading_nearby" else "no_official_1h"
        if (official1h.isEmpty() && obs.any { it.official != null }) notes += "no_official_1h"

        if (kind == "official_1h") {
            val limit = max(n0!!.d * 1.5, SNAP_KM)
            pool = official1h.filterIndexed { i, r -> (i == 0 || r.d <= limit) && r.d <= OFFICIAL_MAX_KM }.take(5)
            if (pinned != null && pinned.grade == "reference" && valid(pinned.pm25_1h)) pool = listOf(Ranked(pinned, 0.0))
        } else if (kind == "crowd_estimate") {
            pool = crowd.take(8)
            notes += "crowd_only"
        }

        var pm25: Int? = null
        var observedAt: String
        var publishedAt: String
        var used: List<Used> = emptyList()
        if (kind == "official_1h") {
            val h = hourKey(ms(pool[0].o.periodEnd))
            used = pool.mapNotNull { r -> valueAt(r.o, h)?.let { Used(it, r.d, r.o) } }
            if (used.isEmpty()) used = listOf(Used(valueOf(pool[0].o)!!, pool[0].d, pool[0].o))
            pm25 = HazeCore.roundHalfUp(idw(used.map { it.v to it.d }))
            observedAt = pool[0].o.periodEnd
            publishedAt = pool[0].o.publishedAt ?: observedAt
        } else if (kind == "crowd_estimate") {
            used = pool.map { Used(valueOf(it.o)!!, it.d, it.o) }
            pm25 = HazeCore.roundHalfUp(idw(used.map { it.v to it.d }))
            val newest = pool.reduce { a, b -> if (ms(b.o.periodEnd) > ms(a.o.periodEnd)) b else a }
            observedAt = newest.o.periodEnd
            publishedAt = newest.o.publishedAt ?: observedAt
        } else {
            val any = ranked(preferFresh(near(obs))).firstOrNull() ?: ranked(preferFresh(obs)).firstOrNull()
            if (any == null && set.officialUnavailable != null) throw OfficialUnavailableException(cc, set.officialUnavailable)
            if (any == null) throw NoCountryDataException("No observations for $cc")
            observedAt = any.o.periodEnd
            publishedAt = any.o.publishedAt ?: observedAt
        }

        // 3. Official index row: nearest station publishing one, verbatim.
        val withIndex = ranked(preferFresh(near(obs.filter { it.official != null && it.grade == "reference" })))
        var officialStation: Ranked? = null
        if (pinned?.official != null) officialStation = Ranked(pinned, 0.0)
        else if (withIndex.isNotEmpty() && withIndex[0].d <= OFFICIAL_MAX_KM) officialStation = withIndex[0]
        else if (withIndex.isNotEmpty()) notes += "official_far"
        val official = officialStation?.o?.official
        if (kind == null && officialStation == null && set.officialUnavailable != null) throw OfficialUnavailableException(cc, set.officialUnavailable)
        if (officialStation != null && kind == null) {
            observedAt = officialStation.o.periodEnd
            publishedAt = officialStation.o.publishedAt ?: observedAt
        }
        val pm25_24h = officialStation?.o?.pm25_24h ?: if (kind == "official_1h") pool[0].o.pm25_24h else null

        // 4. Chip.
        val scaleId = Scales.CHIP_SCALE[cc]
        var localBand: LocalBand? = null
        var bandBasis = "none"
        if (scaleId != null && Scales.getScale(scaleId).role == "chip") {
            val scale = Scales.getScale(scaleId)
            if (scale.basis == "pm25_1h" && pm25 != null) {
                Scales.classifyPm25(scaleId, pm25.toDouble())?.let { localBand = Scales.toLocalBand(scaleId, it); bandBasis = "pm25_1h" }
            }
            if (localBand == null && official != null && official.scaleId == scaleId) {
                Scales.classifyIndex(scaleId, official.value)?.let { localBand = Scales.toLocalBand(scaleId, it); bandBasis = "official_index" }
            }
            // A community estimate with no official index to band it: the authority's category for the estimate.
            if (localBand == null && kind == "crowd_estimate" && pm25 != null) {
                Scales.classifyPm25(scaleId, pm25.toDouble())?.let { localBand = Scales.toLocalBand(scaleId, it); bandBasis = "pm25_1h" }
            }
        }
        val bandFromEstimate = localBand != null && bandBasis == "pm25_1h" && kind == "crowd_estimate"
        val level = localBand?.level

        // History at the spot (same stations, same method), plus the authority's 24-h line where it exists.
        val history = mutableListOf<CHistoryPoint>()
        if (kind != null) {
            val times = sortedSetOf<Long>()
            for (r in pool) for (h in r.o.history.orEmpty()) SeaTime.parseMs(h.time)?.let { times += hourKey(it) }
            val end = hourKey(ms(observedAt))
            if (kind == "official_1h") times += end
            val lineSrc = if (officialStation?.o?.history?.any { it.pm25Avg24h != null } == true) officialStation.o else pool[0].o
            for (tt in times.filter { it <= end && it > end - 24 * HOUR }) {
                val pts = pool.mapNotNull { r -> valueAt(r.o, tt)?.let { it to r.d } }
                if (pts.isEmpty()) continue
                val v = if (tt == end && pm25 != null && kind == "official_1h") pm25 else HazeCore.roundHalfUp(idw(pts))
                val line = lineSrc.history?.firstOrNull { h -> SeaTime.parseMs(h.time)?.let { hourKey(it) } == tt }?.pm25Avg24h
                history += CHistoryPoint(sameOffset(tt, observedAt), v, line)
            }
            if (kind == "crowd_estimate" && pm25 != null && history.isEmpty()) history += CHistoryPoint(observedAt, pm25)
        }
        val prev = history.firstOrNull { SeaTime.parseMs(it.time) == hourKey(ms(observedAt)) - HOUR }
        val tr = if (pm25 != null && prev != null) HazeCore.trendOf(pm25 - prev.pm25) else Trend(0, TrendDirection.STEADY)

        // Range (SPEC v1.7): exact when snapped/pinned official; always for crowd.
        var range: List<Int>? = null
        if (pm25 != null && used.isNotEmpty()) {
            val sorted = used.sortedBy { it.d }
            val exact = kind == "official_1h" && (sorted[0].d < SNAP_KM || locationMode == LocationMode.REGION)
            val far = sorted[0].d > 5
            val disagree = sorted.size > 1 && abs(sorted[0].v - sorted[1].v) > 30
            if (!exact && (kind == "crowd_estimate" || far || disagree)) range = rangeOf(sorted, pm25)
        }

        val stationsRanked = ranked(near(obs.filter { it.grade == "reference" || Crowd.usable(it) })).take(10)
        val regions = LinkedHashMap<String, RegionReading>()
        for (r in stationsRanked) {
            regions[r.o.stationId] = RegionReading(
                pm25 = (r.o.pm25_1h ?: r.o.pm25_now)?.let { HazeCore.roundHalfUp(it) },
                psi24h = r.o.official?.value?.let { HazeCore.roundHalfUp(it) },
                lat = r.o.lat, lon = r.o.lon,
            )
        }
        val nearestUsed = if (kind != null) pool[0] else officialStation ?: stationsRanked.firstOrNull()

        var hotspots: HotspotContext? = null
        if (set.hotspots != null && set.hotspotSource != null) {
            val count = set.hotspots.count { dist(it.lat, it.lon) <= HOTSPOT_RADIUS_KM }
            hotspots = HotspotContext(count, HOTSPOT_RADIUS_KM, 24, "high", set.hotspotSource)
        }

        val usedAttr = mutableSetOf<String>()
        used.forEach { usedAttr += it.o.attributionId }
        officialStation?.let { usedAttr += it.o.attributionId }
        if (hotspots != null) set.attribution.filter { it.text.startsWith("Hotspots") }.forEach { usedAttr += it.id }
        val attribution = set.attribution.filter { it.id in usedAttr }

        val stale = t - ms(observedAt) > STALE_AFTER_MS
        return CountrySnapshot(
            pm25 = pm25,
            band = Scales.levelBand(level),
            officialPsi24h = null,
            trend = tr,
            history = history,
            regions = regions,
            nearestRegion = nearestUsed?.o?.stationId ?: "",
            locationMode = locationMode,
            observedAt = observedAt,
            publishedAt = publishedAt,
            stale = stale,
            source = attribution.joinToString(" · ") { it.text.replace(Regex("^(Data|Community sensors|Hotspots): "), "") },
            country = cc,
            status = meta.status,
            level = level,
            localBand = localBand,
            bandBasis = bandBasis,
            bandFromEstimate = bandFromEstimate,
            official = official,
            pm25Kind = kind,
            pm25_24h = pm25_24h,
            nearest = nearestUsed?.let(::summary),
            stations = stationsRanked.map(::summary),
            range = range,
            whoMultiple = Scales.whoMultiple(pm25),
            hotspots = hotspots,
            attribution = attribution,
            notes = notes.distinct(),
        )
    }

    /** A cached snapshot re-judged for staleness at `now`. */
    fun cached(s: CountrySnapshot, now: Long): CountrySnapshot = s.copy(stale = now - ms(s.observedAt) > STALE_AFTER_MS)
}
