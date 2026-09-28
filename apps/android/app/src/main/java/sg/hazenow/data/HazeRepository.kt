package sg.hazenow.data

import android.content.Context
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.async
import kotlinx.coroutines.awaitAll
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withContext
import kotlinx.serialization.Serializable
import okhttp3.OkHttpClient
import okhttp3.Request
import sg.hazenow.BuildConfig
import sg.hazenow.core.ApiResponse
import sg.hazenow.core.Experience
import sg.hazenow.core.Format
import sg.hazenow.core.Freshness
import sg.hazenow.core.HazeApi
import sg.hazenow.core.HazeCore
import sg.hazenow.core.HistoryPoint
import sg.hazenow.core.Insight
import sg.hazenow.core.Selection
import sg.hazenow.core.Snapshot
import java.io.File
import java.io.IOException
import java.time.Duration
import java.time.Instant
import java.time.LocalDate
import java.util.concurrent.TimeUnit

/** Everything a surface needs to render. */
data class HazeData(
    val snapshot: Snapshot,
    val insight: Insight,
    /** NEA's 24-hr average PM2.5 (µg/m³) at your spot per hour, oldest→newest: the chart line. */
    val avgLine: List<HistoryPoint>,
    val fetchedAt: Long,
    /** GPS fix was outside Singapore; showing the closest station instead (COPY §10). */
    val outsideSingapore: Boolean = false,
    /** Debug QA scenario in use, if any ("MOCK DATA" badge). */
    val mock: String? = null,
)

class RateLimitedException(val retryAfter: Duration?) : IOException("data.gov.sg rate limit (HTTP 429)")

/** Raw NEA response bodies cached on disk so any surface (app, widget, tile, worker) can recompute offline. */
@Serializable
private data class RawCache(
    /** "v1:pm25:latest", "v1:pm25:2026-09-28", "v2:psi:2026-09-28", … → raw body. */
    val bodies: Map<String, String> = emptyMap(),
    val fetchedAt: Long = 0,
    /** Per-URL last call (epoch ms): never more than 1 request/min per endpoint. */
    val lastCall: Map<String, Long> = emptyMap(),
    /** Per-source consecutive failures and backoff deadline ("v1"/"v2"). */
    val failures: Map<String, Int> = emptyMap(),
    val blockedUntil: Map<String, Long> = emptyMap(),
)

/**
 * SPEC v1.3 data layer. v1 (`api.data.gov.sg/v1/environment/…`) is the primary fresh source (first-publish
 * stamp ~1 min after the hour, no observed rate limit); v2 back-fills gaps and is rate limited
 * (HTTP 429 `{"code":24}`). Both are merged per hour and region by [HazeCore.mergeSources].
 */
class HazeRepository private constructor(private val context: Context) {

    private val file = File(context.filesDir, "nea-cache-v2.json")
    private val http = OkHttpClient.Builder()
        .connectTimeout(15, TimeUnit.SECONDS)
        .readTimeout(20, TimeUnit.SECONDS)
        .build()
    private val lock = Mutex()

    @Volatile private var cache: RawCache? = null
    @Volatile private var parsed: Pair<Map<String, String>, Parsed>? = null

    private class Parsed(val pm25: ApiResponse, val psi: ApiResponse)

    private fun load(): RawCache = cache ?: runCatching {
        HazeApi.json.decodeFromString(RawCache.serializer(), file.readText())
    }.getOrDefault(RawCache()).also { cache = it }

    private fun save(c: RawCache) {
        cache = c
        val tmp = File(file.path + ".tmp")
        tmp.writeText(HazeApi.json.encodeToString(RawCache.serializer(), c))
        tmp.renameTo(file)
    }

    private fun httpGet(url: String): String {
        val req = Request.Builder().url(url).header("User-Agent", "HazeNow-Android/${BuildConfig.VERSION_NAME}").build()
        http.newCall(req).execute().use { resp ->
            val body = resp.body?.string().orEmpty()
            if (resp.code == 429 || body.contains("\"code\":${HazeApi.RATE_LIMITED_CODE}")) {
                throw RateLimitedException(resp.header("Retry-After")?.toLongOrNull()?.let(Duration::ofSeconds))
            }
            if (!resp.isSuccessful) throw IOException("HTTP ${resp.code} for $url")
            if (body.isBlank()) throw IOException("Empty body for $url")
            return body
        }
    }

    private data class Job(val key: String, val url: String, val v1: Boolean)

    /** Remaining backoff for the primary (v1) source, for the foreground poller. */
    fun backoffRemaining(now: Long = System.currentTimeMillis()): Duration =
        Duration.ofMillis(((load().blockedUntil["v1"] ?: 0L) - now).coerceAtLeast(0))

    /**
     * Fetch per the SPEC v1.3 plan. [v1] fetches the latest v1 readings (plus day history when needed);
     * [v2] fetches v2's dated feeds to catch back-fills. Enforces ≤1 req/min per URL and per-source backoff.
     * @return true if the newest published hour changed.
     * @throws IOException if every attempted request failed and there is nothing cached.
     */
    suspend fun fetch(v1: Boolean = true, v2: Boolean = false, force: Boolean = false): Boolean = lock.withLock {
        withContext(Dispatchers.IO) {
            val old = load()
            val now = System.currentTimeMillis()
            val today = LocalDate.now(HazeCore.SG_ZONE)
            val days = listOf(today, today.minusDays(1)).map { it.toString() }
            val beforeLatest = latestObserved(old)

            val jobs = mutableListOf<Job>()
            val v1Ok = (old.blockedUntil["v1"] ?: 0) <= now
            val v2Ok = (old.blockedUntil["v2"] ?: 0) <= now
            if (v1 && v1Ok) {
                jobs += Job("v1:pm25:latest", HazeApi.V1_PM25_URL, true)
                jobs += Job("v1:psi:latest", HazeApi.V1_PSI_URL, true)
                val stale = now - (old.lastCall[HazeApi.v1Pm25ForDate(days[0])] ?: 0) > TimeUnit.MINUTES.toMillis(30)
                for (d in days) {
                    if (old.bodies["v1:pm25:$d"] == null || (d == days[0] && (stale || force))) {
                        jobs += Job("v1:pm25:$d", HazeApi.v1Pm25ForDate(d), true)
                        jobs += Job("v1:psi:$d", HazeApi.v1PsiForDate(d), true)
                    }
                }
            }
            // v2 fallback when v1 is failing/blocked, or when asked for a back-fill pass.
            val v1Failing = (old.failures["v1"] ?: 0) > 0 || !v1Ok
            if ((v2 || v1Failing || force) && v2Ok) {
                for (d in days) {
                    if (d == days[0] || old.bodies["v2:pm25:$d"] == null) {
                        jobs += Job("v2:pm25:$d", HazeApi.pm25ForDate(d), false)
                        jobs += Job("v2:psi:$d", HazeApi.psiForDate(d), false)
                    }
                }
            }
            val due = jobs.filter { now - (old.lastCall[it.url] ?: 0) >= TimeUnit.SECONDS.toMillis(60) }
            if (due.isEmpty()) return@withContext false

            // v2 is rate limited (~4 rapid calls): run its jobs sequentially; v1 in parallel.
            val results = coroutineScope {
                val v1Results = due.filter { it.v1 }.map { j -> async { j to runCatching { httpGet(j.url) } } }
                val v2Results = mutableListOf<Pair<Job, Result<String>>>()
                for (j in due.filter { !it.v1 }) {
                    val r = runCatching { httpGet(j.url) }
                    v2Results += j to r
                    if (r.exceptionOrNull() is RateLimitedException) break
                }
                v1Results.awaitAll() + v2Results
            }

            val bodies = old.bodies.toMutableMap()
            val lastCall = old.lastCall.toMutableMap()
            val failures = old.failures.toMutableMap()
            val blocked = old.blockedUntil.toMutableMap()
            for ((job, r) in results) {
                lastCall[job.url] = now
                r.getOrNull()?.let { body ->
                    val ok = runCatching { if (job.v1) HazeApi.parseV1(body) else HazeApi.parse(body) }.isSuccess
                    if (ok) bodies[job.key] = body
                }
            }
            for (src in listOf("v1", "v2")) {
                val mine = results.filter { it.first.v1 == (src == "v1") }
                if (mine.isEmpty()) continue
                val errors = mine.mapNotNull { it.second.exceptionOrNull() }
                if (errors.isEmpty() || errors.size < mine.size && errors.none { it is RateLimitedException }) {
                    failures[src] = 0; blocked.remove(src)
                } else {
                    val n = (failures[src] ?: 0) + 1
                    failures[src] = n
                    val retry = (errors.firstOrNull { it is RateLimitedException } as? RateLimitedException)?.retryAfter
                    blocked[src] = now + Freshness.backoff(n, retry).toMillis()
                }
            }
            // Keep only today's and yesterday's dated bodies.
            bodies.keys.removeAll { k -> k.count { it == ':' } == 2 && !k.endsWith(":latest") && days.none { k.endsWith(it) } }
            lastCall.entries.removeAll { now - it.value > TimeUnit.DAYS.toMillis(2) }
            val anySuccess = results.any { it.second.isSuccess }
            val next = RawCache(bodies, if (anySuccess) now else old.fetchedAt, lastCall, failures, blocked)
            save(next)
            if (!anySuccess && old.bodies.isEmpty()) throw results.first().second.exceptionOrNull() ?: IOException("No data")
            latestObserved(next) != beforeLatest
        }
    }

    private fun latestObserved(c: RawCache): Instant? =
        parse(c)?.pm25?.data?.items?.firstOrNull()?.let { HazeCore.parseInstant(it.timestamp) }

    /** Newest hour we hold (for the poll plan). */
    fun latestObserved(): Instant? = latestObserved(load())

    private fun parse(c: RawCache): Parsed? {
        parsed?.let { (b, p) -> if (b === c.bodies) return p }
        fun list(prefix: String, v1: Boolean) = c.bodies.filterKeys { it.startsWith(prefix) }.values.mapNotNull {
            runCatching { if (v1) HazeApi.parseV1(it) else HazeApi.parse(it) }.getOrNull()
        }
        val pmV1 = list("v1:pm25:", true)
        val pmV2 = list("v2:pm25:", false)
        if (pmV1.isEmpty() && pmV2.isEmpty()) return null
        val result = Parsed(
            pm25 = HazeCore.mergeSources(pmV2, pmV1),
            psi = HazeCore.mergeSources(list("v2:psi:", false), list("v1:psi:", true)),
        )
        parsed = c.bodies to result
        return result
    }

    private fun mockParsed(scenario: String, now: Instant): Parsed? = runCatching {
        val m = MockData.load(context, scenario, now)
        Parsed(m.pm25, m.psi)
    }.getOrNull()

    /** Compute for the given settings from whatever is cached. Cheap; safe to call from any surface. */
    fun compute(settings: Settings, now: Instant = Instant.now()): HazeData? {
        val p = (if (settings.mock != null) mockParsed(settings.mock, now) else parse(load())) ?: return null
        var selection = settings.selection
        val gps = selection as? Selection.Gps
        val outside = gps != null && !Experience.inSingapore(gps.lat, gps.lon)
        if (gps != null && outside) {
            val nearest = HazeCore.mergeCoords(p.pm25).minBy { (_, c) ->
                HazeCore.haversineKm(gps.lat, gps.lon, c.latitude, c.longitude)
            }.key
            selection = Selection.Region(nearest)
        }
        val snap = HazeCore.snapshot(listOf(p.pm25), p.psi, selection, now) ?: return null
        val sel = selection
        val insight = Experience.insight(
            snap,
            settings.profiles,
            userLat = (sel as? Selection.Gps)?.lat,
            userLon = (sel as? Selection.Gps)?.lon,
            now = now,
            selectedRegion = (sel as? Selection.Region)?.name,
            placeName = if (outside) null else settings.placeName,
            latestHourAt = HazeCore.latestHour(listOf(p.pm25)),
        ).let {
            if (outside) it.copy(note = "You seem to be outside Singapore. Showing NEA's ${Format.regionName(snap.nearestRegion)} station, the closest.") else it
        }
        val avgLine = HazeCore.psiSeries(listOf(p.psi), selection)
        return HazeData(snap, insight, avgLine, load().fetchedAt, outside, settings.mock)
    }

    companion object {
        @Volatile private var instance: HazeRepository? = null
        fun get(context: Context): HazeRepository =
            instance ?: synchronized(this) { instance ?: HazeRepository(context.applicationContext).also { instance = it } }
    }
}
