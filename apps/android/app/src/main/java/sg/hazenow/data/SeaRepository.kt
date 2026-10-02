package sg.hazenow.data

import android.content.Context
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withContext
import kotlinx.serialization.builtins.MapSerializer
import kotlinx.serialization.builtins.serializer
import sg.hazenow.BuildConfig
import sg.hazenow.core.HazeApi
import sg.hazenow.core.sea.CityPlace
import sg.hazenow.core.sea.CountryBuilder
import sg.hazenow.core.sea.CountryCode
import sg.hazenow.core.sea.CountryQuery
import sg.hazenow.core.sea.CountrySnapshot
import sg.hazenow.core.sea.CountryUi
import sg.hazenow.core.sea.NoCountryDataException
import sg.hazenow.core.sea.OfficialUnavailableException
import sg.hazenow.core.sea.ProxyException
import sg.hazenow.core.sea.Registry
import sg.hazenow.core.sea.SeaAdapters
import sg.hazenow.core.sea.SeaPlaces
import java.io.File

/**
 * A place outside Singapore: a catalogue city, or a GPS point resolved to its country (SPEC v2.0 §3).
 * [guessed] = shown from the SPEC v2.1 country guess, never saved.
 */
data class CityWhere(
    val country: CountryCode,
    /** Catalogue slug, or "" for a GPS point. */
    val id: String,
    val name: String,
    val lat: Double,
    val lon: Double,
    val gps: Boolean = false,
    val guessed: Boolean = false,
) {
    val key: String get() = if (gps) "gps:${country.name}" else "${country.name}:$id"

    /** The catalogue entry that decides coverage: itself, or (GPS) the nearest city in its country. */
    val city: CityPlace
        get() = (if (id.isNotEmpty()) SeaPlaces.findCity(id, country) else null) ?: nearestCity(country, lat, lon)

    val query: CountryQuery
        get() {
            val picked = if (!gps && id.isNotEmpty()) SeaPlaces.findCity(id, country) else null
            return picked?.let { SeaPlaces.placeQuery(it).copy(lat = lat, lon = lon) } ?: CountryQuery(lat, lon)
        }

    companion object {
        fun of(c: CityPlace, guessed: Boolean = false) = CityWhere(c.country, c.id, c.name, c.lat, c.lon, guessed = guessed)

        fun nearestCity(cc: CountryCode, lat: Double, lon: Double): CityPlace = SeaPlaces.citiesOf(cc).minBy {
            val dx = (it.lon - lon) * Math.cos(Math.toRadians(lat))
            (it.lat - lat) * (it.lat - lat) + dx * dx
        }
    }
}

/** COPY §10 states for a country. OFFICIAL = the official source failed or timed out (with no sensor in range). */
enum class CountryProblem { NONE, OFFLINE, OFFICIAL, API, NO_DATA }

sealed interface CountryResult {
    /** Needs permission / not feasible, or a proxied place while this build has no proxy: never fake data. */
    data class Unavailable(val city: CityPlace, val proxyMissing: Boolean) : CountryResult
    data class Data(val snap: CountrySnapshot, val fromCache: Boolean, val problem: CountryProblem) : CountryResult
    data class Failed(val problem: CountryProblem) : CountryResult
}

/**
 * SPEC v2.0 data for places outside Singapore. Thailand comes straight from Air4Thai (plus community sensors through
 * the proxy where configured); MY/ID/VN/PH/LA/KH through the proxy's `/v1/{cc}/observations` (no location sent).
 * The snapshot is built on the device. When a call fails or times out (~8 s), the last snapshot for that place is
 * shown with its real age, else a calm "can't reach" state. Singapore never comes through here.
 */
class SeaRepository private constructor(context: Context) {
    private val file = File(context.filesDir, "sea-cache-v1.json")
    private val lock = Mutex()
    private val ser = MapSerializer(String.serializer(), CountrySnapshot.serializer())
    @Volatile private var cache: Map<String, CountrySnapshot>? = null

    private fun load(): Map<String, CountrySnapshot> = cache ?: runCatching {
        HazeApi.json.decodeFromString(ser, file.readText())
    }.getOrDefault(emptyMap()).also { cache = it }

    private fun save(key: String, s: CountrySnapshot) {
        val next = load() + (key to s)
        cache = next
        runCatching {
            val tmp = File(file.path + ".tmp")
            tmp.writeText(HazeApi.json.encodeToString(ser, next))
            tmp.renameTo(file)
        }
    }

    fun cached(w: CityWhere, now: Long = System.currentTimeMillis()): CountrySnapshot? =
        load()[w.key]?.let { CountryBuilder.cached(it, now) }

    suspend fun load(w: CityWhere, edge: String?, online: Boolean): CountryResult = lock.withLock {
        withContext(Dispatchers.IO) {
            val city = w.city
            if (!CountryUi.cityLive(city, !edge.isNullOrBlank())) {
                return@withContext CountryResult.Unavailable(city, proxyMissing = city.status == sg.hazenow.core.sea.Coverage.NEEDS_PROXY)
            }
            val now = System.currentTimeMillis()
            try {
                val snap = SeaAdapters.snapshot(w.country, w.query, Http.fetcher, edge?.takeIf { it.isNotBlank() }, now)
                save(w.key, snap)
                CountryResult.Data(snap, fromCache = false, problem = CountryProblem.NONE)
            } catch (e: Exception) {
                val problem = when {
                    !online -> CountryProblem.OFFLINE
                    e is NoCountryDataException -> CountryProblem.NO_DATA
                    e is OfficialUnavailableException -> CountryProblem.OFFICIAL
                    w.country == CountryCode.TH && e !is ProxyException -> CountryProblem.OFFICIAL
                    else -> CountryProblem.API
                }
                val c = cached(w, now)
                if (c != null) CountryResult.Data(c, fromCache = true, problem = problem) else CountryResult.Failed(problem)
            }
        }
    }

    companion object {
        /** The proxy URL for this build (HAZENOW_EDGE), or a debug-only override. Null when unset. */
        fun edge(settings: Settings): String? = (settings.edgeOverride ?: BuildConfig.HAZENOW_EDGE).takeIf { it.isNotBlank() }

        /** Next poll (SPEC v2.0 §8). TH: from hh:02 ICT every 2 min until the new hour lands (stop at hh:30); proxied: 5 min. */
        fun nextPollMs(cc: CountryCode, observedAt: String?, now: Long = System.currentTimeMillis()): Long {
            if (cc != CountryCode.TH) return 5 * 60_000L
            val off = (Registry.of(cc).utcOffset * 3_600_000).toLong()
            val local = now + off
            val min = (local % 3_600_000) / 60_000
            val hourStart = local - local % 3_600_000 - off
            val have = observedAt?.let { sg.hazenow.core.sea.SeaTime.parseMs(it) }?.let { it >= hourStart } ?: false
            if (!have && min in 2..29) return 2 * 60_000L
            return maxOf(60_000L, hourStart + 3_600_000 + 2 * 60_000 - now)
        }

        @Volatile private var instance: SeaRepository? = null
        fun get(context: Context): SeaRepository =
            instance ?: synchronized(this) { instance ?: SeaRepository(context.applicationContext).also { instance = it } }
    }
}
