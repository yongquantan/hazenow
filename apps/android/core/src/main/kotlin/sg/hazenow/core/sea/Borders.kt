package sg.hazenow.core.sea

import kotlinx.serialization.builtins.ListSerializer
import kotlinx.serialization.builtins.MapSerializer
import kotlinx.serialization.builtins.serializer
import sg.hazenow.core.HazeApi
import kotlin.math.hypot
import kotlin.math.max
import kotlin.math.min

/**
 * Which jurisdiction is a point in? Point-in-polygon over simplified Natural Earth land polygons, then a coastal snap
 * (0.1°). Port of countries/borders.ts; the polygons are extracted at build time from borders-data.ts.
 */
object Borders {
    const val SNAP_DEG = 0.1

    private class Ring(val cc: CountryCode, val pts: DoubleArray, val minX: Double, val minY: Double, val maxX: Double, val maxY: Double)

    private val rings: List<Ring> by lazy {
        val text = Borders::class.java.getResourceAsStream("/sea/borders.json")!!.bufferedReader().use { it.readText() }
        val data = HazeApi.json.decodeFromString(
            MapSerializer(String.serializer(), ListSerializer(ListSerializer(Double.serializer()))), text,
        )
        data.flatMap { (cc, list) ->
            val code = CountryCode.valueOf(cc)
            list.map { l ->
                val p = l.toDoubleArray()
                var minX = Double.POSITIVE_INFINITY; var minY = Double.POSITIVE_INFINITY
                var maxX = Double.NEGATIVE_INFINITY; var maxY = Double.NEGATIVE_INFINITY
                var i = 0
                while (i < p.size) {
                    minX = min(minX, p[i]); maxX = max(maxX, p[i]); minY = min(minY, p[i + 1]); maxY = max(maxY, p[i + 1]); i += 2
                }
                Ring(code, p, minX, minY, maxX, maxY)
            }
        }
    }

    private fun inside(x: Double, y: Double, p: DoubleArray): Boolean {
        var c = false
        val n = p.size / 2
        var j = n - 1
        for (i in 0 until n) {
            val xi = p[2 * i]; val yi = p[2 * i + 1]; val xj = p[2 * j]; val yj = p[2 * j + 1]
            if ((yi > y) != (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) c = !c
            j = i
        }
        return c
    }

    private fun segDist(px: Double, py: Double, ax: Double, ay: Double, bx: Double, by: Double): Double {
        val dx = bx - ax; val dy = by - ay
        val l = dx * dx + dy * dy
        val t = if (l == 0.0) 0.0 else max(0.0, min(1.0, ((px - ax) * dx + (py - ay) * dy) / l))
        return hypot(px - ax - t * dx, py - ay - t * dy)
    }

    /** Small islands the simplified polygons leave out: [cc, lat, lon, radius°]. */
    private val SMALL_ISLANDS = listOf(
        Triple(CountryCode.TH, 7.74 to 98.77, 0.06), // Ko Phi Phi (Krabi)
        Triple(CountryCode.TH, 10.09 to 99.835, 0.05), // Ko Tao (Surat Thani)
    )

    /** Country for a point, or null outside ASEAN + Timor-Leste (and beyond the coastal snap). */
    fun countryAt(lat: Double, lon: Double): CountryCode? {
        if (!lat.isFinite() || !lon.isFinite()) return null
        for (r in rings) {
            if (lon < r.minX || lon > r.maxX || lat < r.minY || lat > r.maxY) continue
            if (inside(lon, lat, r.pts)) return r.cc
        }
        for ((cc, p, rad) in SMALL_ISLANDS) if (hypot(lat - p.first, lon - p.second) <= rad) return cc
        var best = SNAP_DEG
        var bestCc: CountryCode? = null
        for (r in rings) {
            if (lon < r.minX - SNAP_DEG || lon > r.maxX + SNAP_DEG || lat < r.minY - SNAP_DEG || lat > r.maxY + SNAP_DEG) continue
            val p = r.pts
            var i = 0
            while (i + 3 < p.size) {
                val d = segDist(lon, lat, p[i], p[i + 1], p[i + 2], p[i + 3])
                if (d < best) { best = d; bestCc = r.cc }
                i += 2
            }
        }
        return bestCc
    }
}
