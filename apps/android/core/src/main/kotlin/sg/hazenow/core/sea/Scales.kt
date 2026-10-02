package sg.hazenow.core.sea

import sg.hazenow.core.Band
import sg.hazenow.core.HazeCore
import kotlin.math.max
import kotlin.math.pow
import kotlin.math.roundToLong

/**
 * Band-scale registry (REGIONAL §3.3, option E: "one unit, local words"). Port of countries/scales.ts, verbatim words.
 * `level` (0–3) follows the authority's advice; it only selects COPY.md's shared verdict/action logic.
 * We never compute a local index number.
 */
data class ScaleBand(
    val key: String,
    val labelEn: String,
    val labelLocal: String,
    val color: String,
    val shape: String,
    val level: Int?,
    val pm25: ClosedFloatingPointRange<Double>? = null,
    val index: ClosedFloatingPointRange<Double>? = null,
)

data class BandScale(
    val id: String,
    val agency: String,
    val indexName: String?,
    val lang: String,
    /** "chip" | "official_only" | "reference" */
    val role: String,
    /** "pm25_1h" | "official_index" */
    val basis: String,
    val precision: Int,
    val bands: List<ScaleBand>,
)

object Scales {
    private const val INF = Double.POSITIVE_INFINITY
    private fun b(key: String, en: String, local: String, color: String, shape: String, level: Int?, pm25: ClosedFloatingPointRange<Double>? = null, index: ClosedFloatingPointRange<Double>? = null) =
        ScaleBand(key, en, local, color, shape, level, pm25, index)

    val SCALES: Map<String, BandScale> = listOf(
        BandScale("sg_nea_1h", "NEA", null, "en", "chip", "pm25_1h", 0, listOf(
            b("normal", "Normal", "Normal", "#2E9E5B", "circle", 0, 0.0..55.0),
            b("elevated", "Elevated", "Elevated", "#E8A317", "half", 1, 56.0..150.0),
            b("high", "High", "High", "#E4572E", "triangle", 2, 151.0..250.0),
            b("very_high", "Very High", "Very High", "#7B2D8E", "octagon", 3, 251.0..INF),
        )),
        BandScale("sg_psi", "NEA", "24-hr PSI", "en", "official_only", "official_index", 0, listOf(
            b("good", "Good", "Good", "#2E9E5B", "circle", null, index = 0.0..50.0),
            b("moderate", "Moderate", "Moderate", "#2E6FB7", "circle", null, index = 51.0..100.0),
            b("unhealthy", "Unhealthy", "Unhealthy", "#E8A317", "half", null, index = 101.0..200.0),
            b("very_unhealthy", "Very Unhealthy", "Very Unhealthy", "#E4572E", "triangle", null, index = 201.0..300.0),
            b("hazardous", "Hazardous", "Hazardous", "#7B2D8E", "octagon", null, index = 301.0..INF),
        )),
        BandScale("th_aqi", "PCD", "Thai AQI", "th", "chip", "official_index", 1, listOf(
            b("very_good", "Excellent", "ดีมาก", "#00BFF3", "circle", 0, 0.0..15.0, 0.0..25.0),
            b("good", "Satisfactory", "ดี", "#00A651", "circle", 0, 15.1..25.0, 26.0..50.0),
            b("moderate", "Moderate", "ปานกลาง", "#FDC04E", "half", 1, 25.1..37.5, 51.0..100.0),
            b("starting_to_affect", "Starting to affect health", "เริ่มมีผลกระทบต่อสุขภาพ", "#F26522", "triangle", 2, 37.6..75.0, 101.0..200.0),
            b("affects_health", "Affects health", "มีผลกระทบต่อสุขภาพ", "#CD0000", "octagon", 3, 75.1..INF, 201.0..INF),
        )),
        BandScale("my_api", "DOE Malaysia", "API", "ms", "chip", "official_index", 1, listOf(
            b("good", "Good", "Baik", "#3D8AF7", "circle", 0, 0.0..12.0, 0.0..50.0),
            b("moderate", "Moderate", "Sederhana", "#7CDE6B", "circle", 0, 12.1..50.4, 51.0..100.0),
            b("unhealthy", "Unhealthy", "Tidak Sihat", "#FFFF00", "half", 1, 50.5..150.4, 101.0..200.0),
            b("very_unhealthy", "Very Unhealthy", "Sangat Tidak Sihat", "#FFA500", "triangle", 2, 150.5..250.4, 201.0..300.0),
            b("hazardous", "Hazardous", "Merbahaya", "#FF0000", "octagon", 3, 250.5..500.4, 301.0..500.0),
            b("emergency", "Emergency", "Kecemasan", "#7E0023", "octagon", 3, 500.5..INF, 501.0..INF),
        )),
        BandScale("id_ispu", "KLH / BMKG", "ISPU", "id", "chip", "pm25_1h", 1, listOf(
            b("baik", "Good", "Baik", "#00CC00", "circle", 0, 0.0..15.5, 0.0..50.0),
            b("sedang", "Moderate", "Sedang", "#0000CC", "circle", 0, 15.6..55.4, 51.0..100.0),
            b("tidak_sehat", "Unhealthy", "Tidak Sehat", "#CCCC00", "half", 1, 55.5..150.4, 101.0..200.0),
            b("sangat_tidak_sehat", "Very Unhealthy", "Sangat Tidak Sehat", "#CC0000", "triangle", 2, 150.5..250.4, 201.0..300.0),
            b("berbahaya", "Hazardous", "Berbahaya", "#000000", "octagon", 3, 250.5..INF, 301.0..INF),
        )),
        BandScale("vn_aqi", "VEA / CEM", "VN_AQI", "vi", "chip", "official_index", 1, listOf(
            b("tot", "Good", "Tốt", "#00E400", "circle", 0, 0.0..25.0, 0.0..50.0),
            b("trung_binh", "Moderate", "Trung bình", "#FFFF00", "circle", 0, 25.1..50.0, 51.0..100.0),
            b("kem", "Poor", "Kém", "#FF7E00", "half", 1, 50.1..80.0, 101.0..150.0),
            b("xau", "Bad", "Xấu", "#FF0000", "triangle", 2, 80.1..150.0, 151.0..200.0),
            b("rat_xau", "Very bad", "Rất xấu", "#8F3F97", "octagon", 3, 150.1..250.0, 201.0..300.0),
            b("nguy_hai", "Hazardous", "Nguy hại", "#7E0023", "octagon", 3, 250.1..INF, 301.0..INF),
        )),
        BandScale("ph_dao_2020_14", "DENR-EMB", null, "en", "chip", "pm25_1h", 1, listOf(
            b("good", "Good", "Good", "#00E400", "circle", 0, 0.0..25.0),
            b("fair", "Fair", "Fair", "#FFFF00", "circle", 0, 25.1..35.0),
            b("usg", "Unhealthy for sensitive groups", "Unhealthy for sensitive groups", "#FF7E00", "half", 1, 35.1..45.0),
            b("very_unhealthy", "Very Unhealthy", "Very Unhealthy", "#FF0000", "triangle", 2, 45.1..55.0),
            b("acutely_unhealthy", "Acutely unhealthy", "Acutely unhealthy", "#8F3F97", "triangle", 2, 55.1..90.0),
            b("emergency", "Emergency", "Emergency", "#7E0023", "octagon", 3, 90.1..INF),
        )),
        BandScale("bn_jastre_psi", "JASTRe", "PSI", "ms", "official_only", "official_index", 0, listOf(
            b("baik", "Good", "Tahap Baik", "#2E9E5B", "circle", null, index = 0.0..50.0),
            b("sederhana", "Moderate", "Tahap Sederhana", "#2E6FB7", "circle", null, index = 51.0..100.0),
            b("tidak_sihat", "Unhealthy", "Tahap Tidak Sihat", "#E8A317", "half", null, index = 101.0..200.0),
            b("sangat_tidak_sihat", "Very Unhealthy", "Tahap Sangat Tidak Sihat", "#E4572E", "triangle", null, index = 201.0..300.0),
            b("merbahaya", "Hazardous", "Tahap Merbahaya", "#7B2D8E", "octagon", null, index = 301.0..INF),
        )),
        BandScale("who_2021", "WHO", null, "en", "reference", "pm25_1h", 1, listOf(
            b("aqg", "AQG 15", "AQG 15", "#9AA5B1", "circle", null, 0.0..15.0),
            b("it4", "IT-4 25", "IT-4 25", "#9AA5B1", "circle", null, 15.1..25.0),
            b("it3", "IT-3 37.5", "IT-3 37.5", "#9AA5B1", "circle", null, 25.1..37.5),
            b("it2", "IT-2 50", "IT-2 50", "#9AA5B1", "circle", null, 37.6..50.0),
            b("it1", "IT-1 75", "IT-1 75", "#9AA5B1", "circle", null, 50.1..INF),
        )),
    ).associateBy { it.id }

    /** Chip scale per jurisdiction. null = no national scale: number + WHO line (REGIONAL §3.3 rule 2). */
    val CHIP_SCALE: Map<CountryCode, String?> = mapOf(
        CountryCode.SG to "sg_nea_1h", CountryCode.TH to "th_aqi", CountryCode.MY to "my_api", CountryCode.ID to "id_ispu",
        CountryCode.VN to "vn_aqi", CountryCode.PH to "ph_dao_2020_14", CountryCode.BN to "bn_jastre_psi",
        CountryCode.LA to null, CountryCode.KH to null, CountryCode.MM to null, CountryCode.TL to null,
    )

    const val WHO_24H_GUIDELINE = 15.0

    fun getScale(id: String): BandScale = SCALES[id] ?: throw IllegalArgumentException("Unknown band scale: $id")

    private fun roundTo(x: Double, dp: Int): Double {
        if (dp == 0) return HazeCore.roundHalfUp(x).toDouble()
        val f = 10.0.pow(dp)
        return HazeCore.roundHalfUp(x * f) / f
    }

    /** Category of a concentration (µg/m³), rounded to the authority's precision first. */
    fun classifyPm25(scaleId: String, pm25: Double): ScaleBand? {
        val s = getScale(scaleId)
        val with = s.bands.filter { it.pm25 != null }
        if (with.isEmpty() || !pm25.isFinite()) return null
        val v = roundTo(max(0.0, pm25), s.precision)
        return with.firstOrNull { v <= it.pm25!!.endInclusive } ?: with.last()
    }

    /** Category of a published index value. */
    fun classifyIndex(scaleId: String, value: Double): ScaleBand? {
        val s = getScale(scaleId)
        val with = s.bands.filter { it.index != null }
        if (with.isEmpty() || !value.isFinite()) return null
        val v = HazeCore.roundHalfUp(max(0.0, value)).toDouble()
        return with.firstOrNull { v <= it.index!!.endInclusive } ?: with.last()
    }

    fun toLocalBand(scaleId: String, b: ScaleBand): LocalBand? {
        val level = b.level ?: return null
        val s = getScale(scaleId)
        return LocalBand(scaleId, b.key, b.labelEn, b.labelLocal, s.lang, b.color, b.shape, level, s.agency)
    }

    fun levelBand(level: Int?): Band? = when (level) {
        0 -> Band.NORMAL; 1 -> Band.ELEVATED; 2 -> Band.HIGH; 3 -> Band.VERY_HIGH; else -> null
    }

    /** pm25 / 15 (WHO 2021 24-h AQG), 1 dp. */
    fun whoMultiple(pm25: Number?): Double? {
        val v = pm25?.toDouble() ?: return null
        if (!v.isFinite()) return null
        return (v / WHO_24H_GUIDELINE * 10).roundToLong() / 10.0
    }

    private val MY_API_PM25 = listOf(
        doubleArrayOf(0.0, 50.0, 0.0, 12.0),
        doubleArrayOf(51.0, 100.0, 12.1, 50.4),
        doubleArrayOf(101.0, 150.0, 50.5, 55.4),
        doubleArrayOf(151.0, 200.0, 55.5, 150.4),
        doubleArrayOf(201.0, 300.0, 150.5, 250.4),
        doubleArrayOf(301.0, 400.0, 250.5, 350.4),
        doubleArrayOf(401.0, 500.0, 350.5, 500.4),
    )

    /** Malaysia: invert a PM2.5-driven DOE API to its 24-h PM2.5 average. */
    fun myApiToPm25(api: Double): Double? {
        if (!api.isFinite() || api < 0) return null
        for ((ilo, ihi, clo, chi) in MY_API_PM25.map { it.toList() }) {
            if (api <= ihi) {
                val c = clo + ((max(api, ilo) - ilo) * (chi - clo)) / (ihi - ilo)
                return (c * 10).roundToLong() / 10.0
            }
        }
        return null
    }
}
