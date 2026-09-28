package sg.hazenow.core

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

/** NEA 1-hr PM2.5 band (SPEC section 2). */
@Serializable
enum class Band(val label: String, val colorHex: String, val argb: Long) {
    @SerialName("normal") NORMAL("Normal", "#2E9E5B", 0xFF2E9E5B),
    @SerialName("elevated") ELEVATED("Elevated", "#E8A317", 0xFFE8A317),
    @SerialName("high") HIGH("High", "#E4572E", 0xFFE4572E),
    @SerialName("very_high") VERY_HIGH("Very High", "#7B2D8E", 0xFF7B2D8E);

    /** JSON wire name, identical to TS/Swift. */
    val id: String
        get() = when (this) {
            NORMAL -> "normal"; ELEVATED -> "elevated"; HIGH -> "high"; VERY_HIGH -> "very_high"
        }
}

@Serializable
enum class TrendDirection(val arrow: String) {
    @SerialName("up") UP("▲"),
    @SerialName("down") DOWN("▼"),
    @SerialName("steady") STEADY("▶"),
}

@Serializable
enum class LocationMode {
    @SerialName("gps") GPS,
    @SerialName("region") REGION,
    @SerialName("island") ISLAND,
}

@Serializable
data class Trend(val delta: Int, val direction: TrendDirection)

@Serializable
data class HistoryPoint(val time: String, val pm25: Int)

@Serializable
data class RegionReading(
    val pm25: Int? = null,
    val psi24h: Int? = null,
    val lat: Double,
    val lon: Double,
)

/** SPEC section 7 output model. Field names are identical across TS / Swift / Kotlin. */
@Serializable
data class Snapshot(
    val pm25: Int,
    val band: Band,
    val instantPsi: Int,
    val instantPsiLabel: String,
    val officialPsi24h: Int?,
    val trend: Trend,
    val history: List<HistoryPoint>,
    val regions: Map<String, RegionReading>,
    val nearestRegion: String,
    val locationMode: LocationMode,
    val observedAt: String,
    val publishedAt: String,
    val stale: Boolean,
    val source: String = SOURCE,
) {
    companion object {
        const val SOURCE = "NEA via data.gov.sg"
    }
}
