package sg.hazenow.data

import okhttp3.OkHttpClient
import okhttp3.Request
import sg.hazenow.BuildConfig
import sg.hazenow.core.sea.Fetcher
import sg.hazenow.core.sea.HttpStatusException
import sg.hazenow.core.sea.Net
import java.io.IOException
import java.util.concurrent.TimeUnit

/**
 * One HTTP client for every upstream (NEA, Air4Thai, the HazeNow proxy). Every call is bounded at ~8 s
 * ([Net.UPSTREAM_TIMEOUT_MS]): OkHttp's call timeout covers connect + TLS + body, and callers also wrap calls in
 * [Net.withTimeout], so a request can never hang the app (COPY §10: fall back fast, to another source or the cache).
 */
object Http {
    val client: OkHttpClient = OkHttpClient.Builder()
        .connectTimeout(Net.UPSTREAM_TIMEOUT_MS, TimeUnit.MILLISECONDS)
        .readTimeout(Net.UPSTREAM_TIMEOUT_MS, TimeUnit.MILLISECONDS)
        .callTimeout(Net.UPSTREAM_TIMEOUT_MS, TimeUnit.MILLISECONDS)
        .build()

    private val ua = "HazeNow-Android/${BuildConfig.VERSION_NAME}"

    /** GET → body. Non-2xx → [HttpStatusException] (with Retry-After when given); empty body → IOException. */
    val fetcher = Fetcher { url ->
        val req = Request.Builder().url(url).header("User-Agent", ua).header("Accept", "application/json").build()
        client.newCall(req).execute().use { resp ->
            val body = resp.body?.string().orEmpty()
            if (!resp.isSuccessful) throw HttpStatusException(resp.code, url, resp.header("Retry-After")?.toLongOrNull())
            if (body.isBlank()) throw IOException("Empty body for $url")
            body
        }
    }
}
