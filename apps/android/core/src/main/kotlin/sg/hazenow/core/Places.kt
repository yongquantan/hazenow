package sg.hazenow.core

import kotlinx.serialization.Serializable
import kotlinx.serialization.builtins.ListSerializer
import java.util.Locale
import kotlin.math.round

/** SPEC v1.4 §6: one entry of packages/core/data/sg-areas.json (URA planning area + estate aliases). */
@Serializable
data class Area(
    val name: String,
    val aliases: List<String> = emptyList(),
    val lat: Double,
    val lon: Double,
)

/** A saved or picked place ("Home", "Work/School", "Tampines"). Coordinates are always rounded to 2 dp. */
@Serializable
data class Place(
    /** "Home", "Work/School", "Other", or the area name for a one-off pick. */
    val label: String,
    /** What it points at: an area name ("Tampines") or "Near you" for a location fix. */
    val name: String,
    val lat: Double,
    val lon: Double,
) {
    val selection: Selection get() = Selection.Gps(lat, lon)

    /** Provenance / title prefix: "Home (Tampines)", or just "Tampines". */
    val display: String get() = if (label == name) name else "$label ($name)"

    companion object {
        fun of(label: String, name: String, lat: Double, lon: Double) =
            Place(label, name, Areas.round2(lat), Areas.round2(lon))
    }
}

object Areas {
    /** SPEC v1.4 §5: round any stored coordinate to 2 decimals (~1 km) before persisting. */
    fun round2(x: Double): Double = round(x * 100.0) / 100.0

    fun parse(json: String): List<Area> =
        HazeApi.json.decodeFromString(ListSerializer(Area.serializer()), json)
            .filter { it.name.isNotBlank() && Experience.inSingapore(it.lat, it.lon) }

    private fun norm(s: String) = s.lowercase(Locale.ROOT).replace(Regex("[^a-z0-9]+"), " ").trim()

    /**
     * Offline search (nothing leaves the device). Ranking: exact name/alias, then prefix of the name or of any
     * word, then substring. Ties keep alphabetical order. Returns the [Area] and the alias that matched, if any.
     */
    fun search(areas: List<Area>, query: String, limit: Int = 50): List<Pair<Area, String?>> {
        val q = norm(query)
        val sorted = areas.sortedBy { it.name }
        if (q.isEmpty()) return sorted.take(limit).map { it to null }
        fun score(s: String): Int {
            val n = norm(s)
            return when {
                n == q -> 0
                n.startsWith(q) -> 1
                n.split(' ').any { it.startsWith(q) } -> 2
                n.contains(q) -> 3
                else -> 9
            }
        }
        return sorted.mapNotNull { a ->
            val best = (listOf(a.name to null as String?) + a.aliases.map { it to it }).minBy { score(it.first) }
            val sc = score(best.first)
            if (sc == 9) null else Triple(a, best.second, sc)
        }.sortedBy { it.third }.take(limit).map { it.first to it.second }
    }
}
