package sg.hazenow.core

import java.time.Duration
import java.time.Instant
import java.time.OffsetDateTime
import java.time.ZoneId
import kotlin.math.asin
import kotlin.math.cos
import kotlin.math.floor
import kotlin.math.pow
import kotlin.math.sin
import kotlin.math.sqrt

/** Where the user wants the reading for. */
sealed interface Selection {
    data class Gps(val lat: Double, val lon: Double) : Selection
    data class Region(val name: String = DEFAULT_REGION) : Selection

    /** Island average of all valid stations (SPEC v1.4 §3 last-resort fallback). */
    data object Island : Selection

    companion object {
        const val DEFAULT_REGION = "central"
    }
}

/** A value resolved "at your spot" (SPEC section 1), before rounding. */
data class Located(val value: Double, val mode: LocationMode, val nearestRegion: String)

object HazeCore {
    val REGIONS = listOf("north", "south", "east", "west", "central")

    /** Fallback coordinates only; always prefer `regionMetadata`. */
    val FALLBACK_COORDS: Map<String, LatLon> = mapOf(
        "north" to LatLon(1.41803, 103.82),
        "south" to LatLon(1.29587, 103.82),
        "east" to LatLon(1.35735, 103.94),
        "west" to LatLon(1.35735, 103.70),
        "central" to LatLon(1.35735, 103.82),
    )

    val SG_ZONE: ZoneId = ZoneId.of("Asia/Singapore")
    val STALE_AFTER: Duration = Duration.ofMinutes(135) // 2h15m
    const val SNAP_KM = 0.5
    const val TREND_THRESHOLD = 5
    const val HISTORY_HOURS = 24

    // ---------- primitives ----------

    /** Round half up (88.5 -> 89), identical to JS Math.round for non-negative numbers. */
    fun roundHalfUp(x: Double): Int = floor(x + 0.5).toInt()

    fun haversineKm(lat1: Double, lon1: Double, lat2: Double, lon2: Double): Double {
        val r = 6371.0
        val dLat = Math.toRadians(lat2 - lat1)
        val dLon = Math.toRadians(lon2 - lon1)
        val a = sin(dLat / 2).pow(2) +
            cos(Math.toRadians(lat1)) * cos(Math.toRadians(lat2)) * sin(dLon / 2).pow(2)
        return 2 * r * asin(sqrt(a.coerceIn(0.0, 1.0)))
    }

    /** SPEC section 2. Uses the integer (rounded) PM2.5 value. */
    fun band(pm25: Number): Band {
        val v = roundHalfUp(pm25.toDouble())
        return when {
            v <= 55 -> Band.NORMAL
            v <= 150 -> Band.ELEVATED
            v <= 250 -> Band.HIGH
            else -> Band.VERY_HIGH
        }
    }

    private val BREAKPOINTS = listOf(
        doubleArrayOf(0.0, 12.0, 0.0, 50.0),
        doubleArrayOf(12.0, 55.0, 50.0, 100.0),
        doubleArrayOf(55.0, 150.0, 100.0, 200.0),
        doubleArrayOf(150.0, 250.0, 200.0, 300.0),
        doubleArrayOf(250.0, 350.0, 300.0, 400.0),
        doubleArrayOf(350.0, 500.0, 400.0, 500.0),
    )

    /** SPEC section 3: NEA PM2.5 sub-index breakpoints applied to the 1-hr concentration. */
    fun instantPsi(c: Number): Int {
        val x = c.toDouble()
        if (x.isNaN() || x <= 0) return 0
        if (x >= 500) return 500
        val bp = BREAKPOINTS.first { x <= it[1] }
        val (cLo, cHi, iLo, iHi) = bp.toList()
        return minOf(500, roundHalfUp(iLo + (x - cLo) * (iHi - iLo) / (cHi - cLo)))
    }

    fun psiLabel(psi: Int): String = when {
        psi <= 50 -> "Good"
        psi <= 100 -> "Moderate"
        psi <= 200 -> "Unhealthy"
        psi <= 300 -> "Very Unhealthy"
        else -> "Hazardous"
    }

    fun trendOf(delta: Int): Trend = Trend(
        delta,
        when {
            delta >= TREND_THRESHOLD -> TrendDirection.UP
            delta <= -TREND_THRESHOLD -> TrendDirection.DOWN
            else -> TrendDirection.STEADY
        },
    )

    /** SPEC section 5. */
    fun advice(band: Band): String = when (band) {
        Band.NORMAL -> "Normal activities."
        Band.ELEVATED -> "Consider reducing prolonged or strenuous outdoor exertion. Elderly, kids, heart/lung conditions: minimise outdoor exertion."
        Band.HIGH -> "Reduce outdoor exertion. Sensitive groups: avoid it. Close windows."
        Band.VERY_HIGH -> "Avoid outdoor activity. Stay indoors, windows shut, use an air purifier."
    }

    // ---------- location (SPEC section 1) ----------

    /**
     * Resolve a value at the user's spot from region -> value (already filtered to valid values).
     * Returns null if no valid values at all.
     */
    fun locate(values: Map<String, Double>, coords: Map<String, LatLon>, selection: Selection): Located? {
        if (values.isEmpty()) return null
        return when (selection) {
            is Selection.Gps -> {
                val dists = values.keys.mapNotNull { name ->
                    val c = coords[name] ?: FALLBACK_COORDS[name] ?: return@mapNotNull null
                    name to haversineKm(selection.lat, selection.lon, c.latitude, c.longitude)
                }
                if (dists.isEmpty()) return islandMean(values, values.keys.first())
                val (nearest, nearestD) = dists.minBy { it.second }
                if (nearestD < SNAP_KM) {
                    Located(values.getValue(nearest), LocationMode.GPS, nearest)
                } else {
                    var num = 0.0
                    var den = 0.0
                    for ((name, d) in dists) {
                        val w = 1.0 / (d * d)
                        num += w * values.getValue(name)
                        den += w
                    }
                    Located(num / den, LocationMode.GPS, nearest)
                }
            }
            Selection.Island -> islandMean(values, values.keys.minOrNull() ?: "central")
            is Selection.Region -> {
                val v = values[selection.name]
                if (v != null) {
                    Located(v, LocationMode.REGION, selection.name)
                } else {
                    // Selected region offline: island mean; nearest = closest valid region to it.
                    val here = coords[selection.name] ?: FALLBACK_COORDS[selection.name]
                    val nearest = if (here == null) values.keys.first() else values.keys.minBy { n ->
                        val c = coords[n] ?: FALLBACK_COORDS[n] ?: return@minBy Double.MAX_VALUE
                        haversineKm(here.latitude, here.longitude, c.latitude, c.longitude)
                    }
                    islandMean(values, nearest)
                }
            }
        }
    }

    private fun islandMean(values: Map<String, Double>, nearest: String) =
        Located(values.values.average(), LocationMode.ISLAND, nearest)

    // ---------- snapshot ----------

    /** Pseudo-regions some feeds include (e.g. v1 PSI "national"); never a station. */
    private val NOT_A_REGION = setOf("national")

    fun mergeCoords(vararg responses: ApiResponse?): Map<String, LatLon> {
        val out = LinkedHashMap(FALLBACK_COORDS)
        responses.filterNotNull().forEach { r ->
            r.data.regionMetadata.forEach { if (it.name !in NOT_A_REGION) out[it.name] = it.labelLocation }
        }
        return out
    }

    /**
     * SPEC v1.3 merge of v2 and v1 per hour and region, for every metric: the v2 value if valid, else the
     * v1 value if valid, else invalid (-1). `updatedTimestamp` becomes v1's `update_timestamp` (true first
     * publish) when v1 has that hour; v2's re-stamps are "last revised", not "published".
     */
    fun mergeSources(v2: List<ApiResponse>, v1: List<ApiResponse>): ApiResponse {
        val a = mergeItems(*v2.toTypedArray()).associateBy { parseInstant(it.timestamp) }
        val b = mergeItems(*v1.toTypedArray()).associateBy { parseInstant(it.timestamp) }
        val hours = (a.keys + b.keys).filterNotNull().sortedDescending()
        val items = hours.map { h ->
            val x = a[h]
            val y = b[h]
            val metrics = (x?.readings?.keys.orEmpty() + y?.readings?.keys.orEmpty())
            val readings = metrics.associateWith { m ->
                val vx = x?.valid(m).orEmpty()
                val vy = y?.valid(m).orEmpty()
                val regions = (x?.readings?.get(m)?.keys.orEmpty() + y?.readings?.get(m)?.keys.orEmpty()) - NOT_A_REGION
                regions.associateWith { r ->
                    val v = vx[r] ?: vy[r]
                    kotlinx.serialization.json.JsonPrimitive(v ?: -1.0)
                }
            }
            val base = x ?: y!!
            ApiItem(
                date = base.date ?: base.timestamp.take(10),
                updatedTimestamp = y?.updatedTimestamp ?: x!!.updatedTimestamp,
                timestamp = base.timestamp,
                readings = readings,
            )
        }
        val meta = LinkedHashMap<String, RegionMeta>()
        (v1 + v2).forEach { r -> r.data.regionMetadata.forEach { if (it.name !in NOT_A_REGION) meta[it.name] = it } }
        return ApiResponse(0, ApiData(meta.values.toList(), items), "")
    }

    /** Merge pm25 items from several responses (latest + today + yesterday), dedupe by hour, newest first. */
    fun mergeItems(vararg responses: ApiResponse?): List<ApiItem> {
        val byHour = LinkedHashMap<Instant, ApiItem>()
        responses.filterNotNull().flatMap { it.data.items }.forEach { item ->
            val t = parseInstant(item.timestamp) ?: return@forEach
            val prev = byHour[t]
            // Prefer the most recently published copy (values can be back-filled).
            if (prev == null || (parseInstant(item.updatedTimestamp) ?: Instant.MIN) >=
                (parseInstant(prev.updatedTimestamp) ?: Instant.MIN)
            ) byHour[t] = item
        }
        return byHour.entries.sortedByDescending { it.key }.map { it.value }
    }

    fun parseInstant(iso: String?): Instant? = try {
        if (iso == null) null else OffsetDateTime.parse(iso).toInstant()
    } catch (e: Exception) {
        null
    }

    /**
     * Build a [Snapshot] from pm25 responses (latest and/or per-date history) and an optional psi response.
     * Returns null only if no hour has any valid PM2.5 data.
     */
    fun snapshot(
        pm25: List<ApiResponse>,
        psi: ApiResponse?,
        selection: Selection,
        now: Instant = Instant.now(),
    ): Snapshot? {
        val coords = mergeCoords(*pm25.toTypedArray(), psi)
        val items = mergeItems(*pm25.toTypedArray())
        val idx = items.indexOfFirst { it.valid(HazeApi.PM25_KEY).isNotEmpty() }
        if (idx < 0) return null
        val item = items[idx]
        val values = item.valid(HazeApi.PM25_KEY)
        val here = locate(values, coords, selection)!!
        val pm = roundHalfUp(here.value)

        // Trend: same location method against the previous hour that has data.
        val prev = items.drop(idx + 1).firstNotNullOfOrNull { locate(it.valid(HazeApi.PM25_KEY), coords, selection) }
        val trend = trendOf(if (prev == null) 0 else pm - roundHalfUp(prev.value))

        val history = items.drop(idx).take(HISTORY_HOURS).mapNotNull { it2 ->
            locate(it2.valid(HazeApi.PM25_KEY), coords, selection)?.let { HistoryPoint(it2.timestamp, roundHalfUp(it.value)) }
        }.reversed()

        val psiItem = psi?.data?.items?.let { list ->
            list.sortedByDescending { parseInstant(it.timestamp) }.firstOrNull { it.valid(HazeApi.PSI24_KEY).isNotEmpty() }
        }
        val psiValues = psiItem?.valid(HazeApi.PSI24_KEY).orEmpty()
        val officialPsi = locate(psiValues, coords, selection)?.let { roundHalfUp(it.value) }

        val names = (REGIONS + coords.keys + values.keys).distinct().filter { coords[it] != null && it !in NOT_A_REGION }
        val regions = names.associateWith { n ->
            val c = coords.getValue(n)
            RegionReading(
                pm25 = values[n]?.let(::roundHalfUp),
                psi24h = psiValues[n]?.let(::roundHalfUp),
                lat = c.latitude,
                lon = c.longitude,
            )
        }

        val observed = parseInstant(item.timestamp)
        val stale = idx > 0 || observed == null || Duration.between(observed, now) > STALE_AFTER
        val ipsi = instantPsi(pm)
        return Snapshot(
            pm25 = pm,
            band = band(pm),
            instantPsi = ipsi,
            instantPsiLabel = psiLabel(ipsi),
            officialPsi24h = officialPsi,
            trend = trend,
            history = history,
            regions = regions,
            nearestRegion = here.nearestRegion,
            locationMode = here.mode,
            observedAt = item.timestamp,
            publishedAt = item.updatedTimestamp,
            stale = stale,
        )
    }

    /**
     * A per-hour series at your spot from the /psi endpoint (oldest→newest), same location method.
     * Default metric is NEA's 24-hr PM2.5 average (µg/m³) — the chart line in SPEC v1.2 §2.
     * Not part of [Snapshot], which keeps the cross-language model identical.
     */
    fun psiSeries(
        psi: List<ApiResponse>,
        selection: Selection,
        metric: String = HazeApi.PM25_24H_KEY,
        hours: Int = HISTORY_HOURS,
    ): List<HistoryPoint> {
        val coords = mergeCoords(*psi.toTypedArray())
        return mergeItems(*psi.toTypedArray()).take(hours).mapNotNull { item ->
            locate(item.valid(metric), coords, selection)?.let { HistoryPoint(item.timestamp, roundHalfUp(it.value)) }
        }.reversed()
    }
}
