package sg.hazenow.core

import java.time.Duration
import java.time.Instant
import java.time.temporal.ChronoUnit
import kotlin.math.min

/**
 * SPEC v1.3 §3 polling plan. NEA publishes each hour ~1 min after the hour (v1 stamps :00:39–:03:05).
 *  - From hh:00:30, poll v1 every 60 s until the new hour appears (give up fast polling at hh:10).
 *  - Then one v2 call at ~hh:35 and ~hh:50 to catch back-fills.
 *  - Idle otherwise. Never more than 1 req/min per endpoint.
 *  - On 429 / network error: exponential backoff 30 s → 10 min, honouring Retry-After.
 */
object Freshness {
    enum class Source { V1, V2 }

    data class Plan(val delay: Duration, val source: Source, val at: Instant)

    val FAST_START: Duration = Duration.ofSeconds(30)
    val FAST_END: Duration = Duration.ofMinutes(10)
    val FAST_EVERY: Duration = Duration.ofSeconds(60)
    val BACKFILL = listOf(Duration.ofMinutes(35), Duration.ofMinutes(50))

    /** Does [latestObserved] already cover the hour that [now] is in? */
    fun hasCurrentHour(latestObserved: Instant?, now: Instant): Boolean =
        latestObserved != null && !latestObserved.isBefore(hourStart(now))

    fun hourStart(now: Instant): Instant = now.atZone(HazeCore.SG_ZONE).truncatedTo(ChronoUnit.HOURS).toInstant()

    /** Next poll after [now], given the newest observed hour we already have. Stateless and deterministic. */
    fun plan(now: Instant, latestObserved: Instant?): Plan {
        val h = hourStart(now)
        val fastStart = h.plus(FAST_START)
        val fastEnd = h.plus(FAST_END)
        if (!hasCurrentHour(latestObserved, now) && now.isBefore(fastEnd)) {
            val at = if (now.isBefore(fastStart)) fastStart else now.plus(FAST_EVERY)
            return Plan(Duration.between(now, at), Source.V1, at)
        }
        val candidates = BACKFILL.map { h.plus(it) to Source.V2 } + (h.plus(Duration.ofHours(1)).plus(FAST_START) to Source.V1)
        val (at, src) = candidates.first { it.first.isAfter(now) }
        return Plan(Duration.between(now, at), src, at)
    }

    /** Next hh:02 (the background one-off target). */
    fun nextBackgroundRun(now: Instant): Instant {
        val t = hourStart(now).plus(Duration.ofMinutes(2))
        return if (t.isAfter(now)) t else t.plus(Duration.ofHours(1))
    }

    /** Backoff after [failures] consecutive failures (1 → 30 s, 2 → 60 s, … capped at 10 min), honouring Retry-After. */
    fun backoff(failures: Int, retryAfter: Duration? = null): Duration {
        if (failures <= 0) return Duration.ZERO
        val exp = Duration.ofSeconds(30L shl min(failures - 1, 10)).let { if (it > MAX_BACKOFF) MAX_BACKOFF else it }
        return if (retryAfter != null && retryAfter > exp) minOf(retryAfter, MAX_BACKOFF) else exp
    }

    val MAX_BACKOFF: Duration = Duration.ofMinutes(10)
}
