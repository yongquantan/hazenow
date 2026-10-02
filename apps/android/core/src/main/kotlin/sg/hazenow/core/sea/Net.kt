package sg.hazenow.core.sea

import java.io.IOException
import java.util.concurrent.Callable
import java.util.concurrent.ExecutionException
import java.util.concurrent.ExecutorService
import java.util.concurrent.Executors
import java.util.concurrent.Future
import java.util.concurrent.TimeUnit
import java.util.concurrent.TimeoutException
import java.util.concurrent.atomic.AtomicInteger

/** A blocking GET that returns the body, or throws ([HttpStatusException] for a non-2xx answer). */
fun interface Fetcher {
    fun get(url: String): String
}

class HttpStatusException(val status: Int, val url: String, val retryAfterSeconds: Long? = null) : IOException("HTTP $status for $url")

class UpstreamTimeoutException(val url: String, val ms: Long) : IOException("Timed out after ${ms / 100 / 10.0} s: $url")

/**
 * Upstream timeouts (port of net.ts). Every upstream call (NEA, Air4Thai, the HazeNow proxy) is bounded at ~8 s: the
 * app's OkHttp client has an 8 s call timeout, and [withTimeout] adds a hard race on top, so even a call that ignores
 * its own timeout can't hang the app (Air4Thai's certificate renewal, 30 Sep 2026, left requests hanging ~30 s).
 */
object Net {
    const val UPSTREAM_TIMEOUT_MS = 8_000L

    private val counter = AtomicInteger()
    val pool: ExecutorService = Executors.newCachedThreadPool { r ->
        Thread(r, "hazenow-net-${counter.incrementAndGet()}").apply { isDaemon = true }
    }

    /** Wrap a fetcher so each call fails with [UpstreamTimeoutException] after [ms] (and interrupts the call). */
    fun withTimeout(f: Fetcher, ms: Long = UPSTREAM_TIMEOUT_MS): Fetcher {
        if (ms <= 0) return f
        return Fetcher { url ->
            val fut = pool.submit(Callable { f.get(url) })
            await(fut, url, ms)
        }
    }

    fun <T> async(block: () -> T): Future<T> = pool.submit(Callable { block() })

    /** Result of a background call, with its exception unwrapped. */
    fun <T> await(fut: Future<T>, url: String = "", ms: Long? = null): T = try {
        if (ms == null) fut.get() else fut.get(ms, TimeUnit.MILLISECONDS)
    } catch (e: TimeoutException) {
        fut.cancel(true)
        throw UpstreamTimeoutException(url, ms ?: 0)
    } catch (e: ExecutionException) {
        throw e.cause ?: e
    }
}
