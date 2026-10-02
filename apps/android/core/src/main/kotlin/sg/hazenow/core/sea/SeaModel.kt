package sg.hazenow.core.sea

import kotlinx.serialization.Serializable
import sg.hazenow.core.Band
import sg.hazenow.core.HistoryPoint
import sg.hazenow.core.LocationMode
import sg.hazenow.core.RegionReading
import sg.hazenow.core.Trend

/**
 * SPEC v2.0 (Southeast Asia) data model, a 1:1 port of packages/core/src/countries/types.ts.
 * Field names match the TS JSON exactly, so the proxy's `/v1/{cc}/observations` body decodes straight into
 * [ObservationSet]. Nothing here changes the SG v1 [sg.hazenow.core.Snapshot].
 */
@Serializable
enum class CountryCode { SG, MY, ID, TH, VN, PH, LA, KH, MM, BN, TL }

object Coverage {
    const val LIVE_DIRECT = "live_direct"
    const val NEEDS_PROXY = "needs_proxy"
    const val NEEDS_PERMISSION = "needs_permission"
    const val NOT_FEASIBLE = "not_feasible"
}

@Serializable
data class Attribution(
    val id: String,
    val text: String,
    val url: String,
    val licence: String = "",
    val shareAlike: Boolean? = null,
)

/** An authority's own index, verbatim. Never computed by HazeNow. */
@Serializable
data class OfficialIndex(
    val scaleId: String,
    val name: String,
    val value: Double,
    val category: String? = null,
    /** "24h" | "1h" | "nowcast" */
    val averaging: String,
    val param: String? = null,
    val agency: String,
) {
    /** Published index values are integers; print them without ".0". */
    val valueText: String get() = if (value % 1.0 == 0.0) value.toLong().toString() else value.toString()
}

@Serializable
data class ObservationHour(
    val time: String,
    val pm25: Double? = null,
    val pm25Avg24h: Double? = null,
)

/** One station or sensor, normalised (REGIONAL §4.2). */
@Serializable
data class Observation(
    val stationId: String,
    val name: String,
    val country: CountryCode,
    val lat: Double,
    val lon: Double,
    /** "reference" | "lowcost" */
    val grade: String,
    val indoor: Boolean? = null,
    val pm25_1h: Double? = null,
    val pm25_now: Double? = null,
    val pm25_24h: Double? = null,
    val official: OfficialIndex? = null,
    val periodEnd: String,
    val publishedAt: String? = null,
    val history: List<ObservationHour>? = null,
    val corrected: String? = null,
    val k: Double? = null,
    val qc: String? = null,
    val attributionId: String,
)

@Serializable
data class LatLonPoint(val lat: Double, val lon: Double)

@Serializable
data class ObservationSet(
    val country: CountryCode,
    val adapters: List<String> = emptyList(),
    val fetchedAt: String = "",
    val observations: List<Observation>,
    val attribution: List<Attribution>,
    val hotspots: List<LatLonPoint>? = null,
    val hotspotSource: String? = null,
    val warnings: List<String>? = null,
    /** The country's official source failed or timed out ("PCD Air4Thai"). */
    val officialUnavailable: String? = null,
)

@Serializable
data class LocalBand(
    val scaleId: String,
    val key: String,
    val labelEn: String,
    val labelLocal: String,
    val lang: String,
    val color: String,
    /** "circle" | "half" | "triangle" | "octagon" */
    val shape: String,
    val level: Int,
    val agency: String,
)

@Serializable
data class StationSummary(
    val stationId: String,
    val name: String,
    val distanceKm: Double?,
    val grade: String,
    val pm25_1h: Double?,
    val official: OfficialIndex?,
    val periodEnd: String,
)

@Serializable
data class HotspotContext(val count: Int, val radiusKm: Double, val hours: Int, val confidence: String, val source: String)

/** A chart point at your spot, plus the authority's 24-h line where it exists. */
@Serializable
data class CHistoryPoint(val time: String, val pm25: Int, val pm25Avg24h: Double? = null) {
    fun toHistoryPoint() = HistoryPoint(time, pm25)
}

/** The v2.0 snapshot: every SPEC §7 field with the same name, `pm25`/`band` nullable, plus the v2.0 fields. */
@Serializable
data class CountrySnapshot(
    val pm25: Int?,
    val band: Band?,
    val officialPsi24h: Int? = null,
    val trend: Trend,
    val history: List<CHistoryPoint>,
    val regions: Map<String, RegionReading>,
    val nearestRegion: String,
    val locationMode: LocationMode,
    val observedAt: String,
    val publishedAt: String,
    val stale: Boolean,
    val source: String,
    val country: CountryCode,
    val status: String,
    val level: Int?,
    val localBand: LocalBand?,
    /** "pm25_1h" | "official_index" | "none" */
    val bandBasis: String,
    val bandFromEstimate: Boolean = false,
    val official: OfficialIndex?,
    /** "official_1h" | "crowd_estimate" | null */
    val pm25Kind: String?,
    val pm25_24h: Double?,
    val nearest: StationSummary?,
    val stations: List<StationSummary>,
    val range: List<Int>?,
    val whoMultiple: Double?,
    val hotspots: HotspotContext? = null,
    val attribution: List<Attribution>,
    val notes: List<String>,
) {
    val sgHistory: List<HistoryPoint> get() = history.map { it.toHistoryPoint() }
}

data class CountryQuery(
    val lat: Double? = null,
    val lon: Double? = null,
    val station: String? = null,
    /** Hard radius (km) for a catalogue destination: nothing farther away is used. */
    val withinKm: Double? = null,
)
