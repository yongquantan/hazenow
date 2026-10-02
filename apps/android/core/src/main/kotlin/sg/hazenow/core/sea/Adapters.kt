package sg.hazenow.core.sea

import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.doubleOrNull
import sg.hazenow.core.HazeApi
import sg.hazenow.core.HazeCore
import java.net.URLEncoder
import java.time.Instant
import kotlin.math.roundToLong

/**
 * Thailand, PCD Air4Thai (port of sources/air4thai.ts). CORS `*`, keyless, called directly by the app.
 *  - getAQI_JSON: station list + official 24-hr Thai AQI (`AQILast.PM25.value` is the 24-hr mean, never the 1-hr value).
 *  - getHistoryData: hour-ending 1-hr PM2.5 (ICT, no offset in the string). A null newest row means "not yet".
 */
object Air4Thai {
    const val ICT = 7.0
    const val BASE = "https://air4thai.pcd.go.th/forweb"
    const val SOURCE = "PCD Air4Thai"
    const val HISTORY_STATIONS = 6

    val ATTRIBUTION = Attribution(
        id = "th.pcd",
        text = "Data: Pollution Control Department (PCD) Air4Thai, Thailand",
        url = "https://air4thai.pcd.go.th/",
        licence = "Thai government public data; redistribution terms unconfirmed (licence request pending)",
    )

    data class Station(
        val id: String, val nameEN: String?, val nameTH: String?, val lat: Double, val lon: Double,
        val date: String?, val time: String?, val pm25Value: Double?, val aqi: Double?, val aqiParam: String?,
    )

    data class Row(val time: String, val pm25: Double?)

    fun aqiUrl(base: String = BASE) = "$base/getAQI_JSON.php"

    fun historyUrl(ids: List<String>, now: Long, base: String = BASE): String {
        val d = SeaTime.localDate(now, ICT)
        val y = SeaTime.localDate(now - 24 * SeaTime.HOUR_MS, ICT)
        val list = ids.joinToString(",") { URLEncoder.encode(it, "UTF-8") }
        return "$base/getHistoryData.php?stationID=$list&param=PM25&type=hr&sdate=$y&edate=$d&stime=00&etime=23"
    }

    private fun JsonElement?.obj() = this as? JsonObject
    private fun JsonElement?.str(): String? = (this as? JsonPrimitive)?.takeIf { it !is JsonNull }?.content
    private fun JsonElement?.numOrNull(): Double? = when (this) {
        null, is JsonNull -> null
        is JsonPrimitive -> SeaTime.num(if (isString) content else doubleOrNull)
        else -> null
    }

    fun parseStations(body: String): List<Station> {
        val root = HazeApi.json.parseToJsonElement(body).obj() ?: return emptyList()
        val list = root["stations"] as? JsonArray ?: return emptyList()
        return list.mapNotNull { e ->
            val s = e.obj() ?: return@mapNotNull null
            val id = s["stationID"].str() ?: return@mapNotNull null
            val lat = s["lat"].numOrNull() ?: return@mapNotNull null
            val lon = s["long"].numOrNull() ?: return@mapNotNull null
            val last = s["AQILast"].obj()
            Station(
                id, s["nameEN"].str(), s["nameTH"].str(), lat, lon,
                last?.get("date").str(), last?.get("time").str(),
                last?.get("PM25").obj()?.get("value").numOrNull(),
                last?.get("AQI").obj()?.get("aqi").numOrNull(),
                last?.get("AQI").obj()?.get("param").str(),
            )
        }
    }

    fun parseHistory(body: String): Map<String, List<Row>> {
        val out = LinkedHashMap<String, List<Row>>()
        val root = HazeApi.json.parseToJsonElement(body).obj() ?: return out
        val stations = root["stations"] as? JsonArray ?: return out
        for (e in stations) {
            val st = e.obj() ?: continue
            val id = st["stationID"].str() ?: continue
            val data = st["data"] as? JsonArray ?: continue
            val rows = data.mapNotNull { d ->
                val o = d.obj() ?: return@mapNotNull null
                val t = o["DATETIMEDATA"].str()?.let { SeaTime.wallToIso(it, ICT) } ?: return@mapNotNull null
                Row(t, o["PM25"].numOrNull())
            }.sortedBy { SeaTime.parseMs(it.time) }
            out[id] = rows
        }
        return out
    }

    /** PCD's rolling 24-h mean over the available hours ending at index i (≥ 12 hours). */
    private fun rolling24(rows: List<Row>, i: Int): Double? {
        val end = SeaTime.parseMs(rows[i].time) ?: return null
        val vals = rows.filter { r -> SeaTime.parseMs(r.time)?.let { it <= end && it > end - 24 * SeaTime.HOUR_MS } == true && r.pm25 != null }.map { it.pm25!! }
        if (vals.size < 12) return null
        return (vals.sum() / vals.size * 10).roundToLong() / 10.0
    }

    fun observations(stations: List<Station>, history: Map<String, List<Row>> = emptyMap(), keepHours: Int = 26): List<Observation> {
        val out = mutableListOf<Observation>()
        for (s in stations) {
            val lastTime = if (s.date != null && s.time != null) SeaTime.wallToIso("${s.date} ${s.time}", ICT) else null
            val official = s.aqi?.let {
                OfficialIndex("th_aqi", "Thai AQI", it, Scales.classifyIndex("th_aqi", it)?.labelLocal, "24h",
                    s.aqiParam?.takeIf { p -> p != "-1" }, "PCD")
            }
            val rows = history[s.id].orEmpty()
            var hist = rows.mapIndexed { i, r -> ObservationHour(r.time, r.pm25, rolling24(rows, i)) }.takeLast(keepHours)
            if (lastTime != null && s.pm25Value != null) {
                val lt = SeaTime.parseMs(lastTime)
                hist = hist.map { if (SeaTime.parseMs(it.time) == lt) it.copy(pm25Avg24h = s.pm25Value) else it }
            }
            val lastValid = rows.lastOrNull { it.pm25 != null }
            val periodEnd = lastValid?.time ?: lastTime ?: continue
            out += Observation(
                stationId = "th.pcd:${s.id}",
                name = (s.nameEN ?: s.nameTH ?: s.id).trim(),
                country = CountryCode.TH,
                lat = s.lat, lon = s.lon,
                grade = "reference",
                pm25_1h = lastValid?.pm25,
                pm25_24h = s.pm25Value,
                official = official,
                periodEnd = periodEnd,
                history = hist.ifEmpty { null },
                corrected = "none",
                attributionId = ATTRIBUTION.id,
            )
        }
        return out
    }
}

class ProxyException(message: String, val status: Int? = null) : java.io.IOException(message)

/**
 * Country adapters for the app (port of adapters/th.ts and adapters/proxied.ts). Location never leaves the device:
 * Air4Thai returns every station, the proxy's `/v1/{cc}/observations` takes no location, and the snapshot is built here.
 */
object SeaAdapters {
    fun proxyUrl(proxyBase: String, cc: CountryCode, lowcostOnly: Boolean = false) =
        "${proxyBase.trimEnd('/')}/v1/${cc.name.lowercase()}/observations${if (lowcostOnly) "?grade=lowcost" else ""}"

    fun parseObservationSet(body: String, cc: CountryCode): ObservationSet? = runCatching {
        HazeApi.json.decodeFromString(ObservationSet.serializer(), body)
    }.getOrNull()?.takeIf { s -> s.country == cc && s.observations.all { it.lat.isFinite() && it.lon.isFinite() } }

    /** A proxied country's observations. Throws [ProxyException] (unset proxy, HTTP error, bad body) or a timeout. */
    fun proxied(cc: CountryCode, fetch: Fetcher, proxyBase: String?, timeoutMs: Long = Net.UPSTREAM_TIMEOUT_MS): ObservationSet {
        if (proxyBase.isNullOrBlank()) throw ProxyException("${cc.name.lowercase()}.proxy: proxyBase (HAZENOW_EDGE) is not configured")
        val url = proxyUrl(proxyBase, cc)
        val body = try {
            Net.withTimeout(fetch, timeoutMs).get(url)
        } catch (e: HttpStatusException) {
            throw ProxyException("HTTP ${e.status} for $url", e.status)
        }
        return parseObservationSet(body, cc) ?: throw ProxyException("Unexpected response for $url")
    }

    private fun thCrowd(fetch: Fetcher, proxyBase: String): Pair<List<Observation>, List<Attribution>> {
        val url = proxyUrl(proxyBase, CountryCode.TH, lowcostOnly = true)
        val set = parseObservationSet(fetch.get(url), CountryCode.TH) ?: throw ProxyException("Unexpected response for $url")
        val obs = set.observations.filter { it.grade == "lowcost" && it.country == CountryCode.TH }
        val ids = obs.map { it.attributionId }.toSet()
        return obs to set.attribution.filter { it.id in ids }
    }

    /**
     * Thailand: Air4Thai direct, plus its community sensors from the proxy (used only where no PCD station is within
     * 25 km, e.g. Pai). If Air4Thai fails or times out, in-country community sensors stand in (labelled); with none,
     * [OfficialUnavailableException] so the app shows its cache or a calm "can't reach" state.
     */
    fun thailand(fetch: Fetcher, now: Long, proxyBase: String?, near: LatLonPoint?, timeoutMs: Long = Net.UPSTREAM_TIMEOUT_MS, base: String = Air4Thai.BASE): ObservationSet {
        val f = Net.withTimeout(fetch, timeoutMs)
        val crowdP = if (!proxyBase.isNullOrBlank()) Net.async { runCatching { thCrowd(f, proxyBase) } } else null
        fun crowd() = crowdP?.let { Net.await(it) }
        val warnings = mutableListOf<String>()
        val stations = try {
            Air4Thai.parseStations(f.get(Air4Thai.aqiUrl(base))).also { if (it.isEmpty()) throw java.io.IOException("Air4Thai: no stations in getAQI_JSON") }
        } catch (e: Exception) {
            val c = crowd()?.getOrNull()
            if (c == null || c.first.isEmpty()) throw OfficialUnavailableException(CountryCode.TH, Air4Thai.SOURCE)
            return ObservationSet(
                CountryCode.TH, listOf("crowd.proxy"), Instant.ofEpochMilli(now).toString(), c.first, c.second,
                warnings = listOf("th.air4thai: ${e.message}; PCD stations unavailable"), officialUnavailable = Air4Thai.SOURCE,
            )
        }
        var ids = stations.map { it.id }
        if (near != null) {
            ids = stations.sortedBy { HazeCore.haversineKm(near.lat, near.lon, it.lat, it.lon) }.take(Air4Thai.HISTORY_STATIONS).map { it.id }
        }
        var history: Map<String, List<Air4Thai.Row>> = emptyMap()
        var historyDown = false
        try {
            history = Air4Thai.parseHistory(f.get(Air4Thai.historyUrl(ids, now, base)))
        } catch (e: Exception) {
            historyDown = true
            warnings += "th.air4thai history: ${e.message}; 1-hr values unavailable"
        }
        val c = crowd()
        c?.exceptionOrNull()?.let { warnings += "th.crowd: ${it.message}; community sensors unavailable" }
        val extra = c?.getOrNull()
        return ObservationSet(
            country = CountryCode.TH,
            adapters = listOf("th.air4thai") + if (extra?.first?.isNotEmpty() == true) listOf("crowd.proxy") else emptyList(),
            fetchedAt = Instant.ofEpochMilli(now).toString(),
            observations = Air4Thai.observations(stations, history) + extra?.first.orEmpty(),
            attribution = listOf(Air4Thai.ATTRIBUTION) + extra?.second.orEmpty(),
            warnings = warnings.ifEmpty { null },
            officialUnavailable = if (historyDown) Air4Thai.SOURCE else null,
        )
    }

    /** Fetch + build for a place outside Singapore. SG never comes through here (its v1 path is unchanged). */
    fun snapshot(cc: CountryCode, query: CountryQuery, fetch: Fetcher, proxyBase: String?, now: Long = System.currentTimeMillis(), timeoutMs: Long = Net.UPSTREAM_TIMEOUT_MS): CountrySnapshot {
        val near = if (query.lat != null && query.lon != null) LatLonPoint(query.lat, query.lon) else null
        val set = if (cc == CountryCode.TH) thailand(fetch, now, proxyBase, near, timeoutMs) else proxied(cc, fetch, proxyBase, timeoutMs)
        return CountryBuilder.build(set, query, now)
    }
}
