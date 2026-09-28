package sg.hazenow.core

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.doubleOrNull

/** Raw data.gov.sg v2 real-time response DTOs (pm25 + psi share the same envelope). */
@Serializable
data class ApiResponse(
    val code: Int = 0,
    val data: ApiData = ApiData(),
    val errorMsg: String? = null,
)

@Serializable
data class ApiData(
    val regionMetadata: List<RegionMeta> = emptyList(),
    val items: List<ApiItem> = emptyList(),
)

@Serializable
data class RegionMeta(val name: String, val labelLocation: LatLon)

@Serializable
data class LatLon(val latitude: Double, val longitude: Double)

@Serializable
data class ApiItem(
    val date: String? = null,
    val updatedTimestamp: String,
    val timestamp: String,
    /** Metric name -> region -> value. Values may be -1, null, or missing. */
    val readings: Map<String, Map<String, JsonElement>> = emptyMap(),
) {
    /** Region -> value for one metric, with invalid values (-1/null/negative/non-numeric) removed. */
    fun valid(metric: String): Map<String, Double> =
        readings[metric].orEmpty().mapNotNull { (k, v) ->
            val d = (v as? JsonPrimitive)?.takeIf { v !is JsonNull }?.doubleOrNull
            if (d == null || d < 0 || d.isNaN()) null else k to d
        }.toMap()
}

/** data.gov.sg v1 (legacy) shape: snake_case, no `code`/`data` wrapper. Primary for freshness (SPEC v1.3). */
@Serializable
data class V1Response(
    @SerialName("region_metadata") val regionMetadata: List<V1RegionMeta> = emptyList(),
    val items: List<V1Item> = emptyList(),
    @SerialName("api_info") val apiInfo: V1ApiInfo? = null,
) {
    /** Convert to the v2 shape so the rest of the pipeline is shared. */
    fun toApiResponse() = ApiResponse(
        code = 0,
        data = ApiData(
            regionMetadata = regionMetadata.map { RegionMeta(it.name, LatLon(it.labelLocation.latitude, it.labelLocation.longitude)) },
            items = items.map { ApiItem(it.timestamp.take(10), it.updateTimestamp, it.timestamp, it.readings) },
        ),
    )
}

@Serializable
data class V1RegionMeta(val name: String, @SerialName("label_location") val labelLocation: LatLon)

@Serializable
data class V1Item(
    val timestamp: String,
    @SerialName("update_timestamp") val updateTimestamp: String,
    val readings: Map<String, Map<String, JsonElement>> = emptyMap(),
)

@Serializable
data class V1ApiInfo(val status: String? = null)

object HazeApi {
    const val V1_BASE = "https://api.data.gov.sg/v1/environment"
    const val V1_PM25_URL = "$V1_BASE/pm25"
    const val V1_PSI_URL = "$V1_BASE/psi"
    fun v1Pm25ForDate(date: String) = "$V1_PM25_URL?date=$date"
    fun v1PsiForDate(date: String) = "$V1_PSI_URL?date=$date"

    /** v2 "TOO_MANY_REQUESTS" body code (sent with HTTP 429 and `data: null`). */
    const val RATE_LIMITED_CODE = 24

    const val BASE = "https://api-open.data.gov.sg/v2/real-time/api"
    const val PM25_URL = "$BASE/pm25"
    const val PSI_URL = "$BASE/psi"
    fun pm25ForDate(date: String) = "$PM25_URL?date=$date"

    const val PM25_KEY = "pm25_one_hourly"
    const val PSI24_KEY = "psi_twenty_four_hourly"
    const val PM25_24H_KEY = "pm25_twenty_four_hourly"
    fun psiForDate(date: String) = "$PSI_URL?date=$date"

    val json = Json {
        ignoreUnknownKeys = true
        isLenient = true
        explicitNulls = false
        encodeDefaults = true
        coerceInputValues = true // v2 429 bodies carry `"data": null`
    }

    fun parse(body: String): ApiResponse = json.decodeFromString(ApiResponse.serializer(), body)

    fun parseV1(body: String): ApiResponse = json.decodeFromString(V1Response.serializer(), body).toApiResponse()
}
