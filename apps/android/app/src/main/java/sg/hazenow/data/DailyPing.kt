package sg.hazenow.data

import android.content.Context
import okhttp3.Call
import okhttp3.Callback
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import okhttp3.Response
import sg.hazenow.BuildConfig
import sg.hazenow.core.DailyCount
import java.io.IOException
import java.util.concurrent.TimeUnit

/**
 * The anonymous daily "+1" (docs/PRIVACY.md, [DailyCount]). At most one POST per UTC day per install, decided by a
 * local "counted on" flag; it carries only surface=android, new|returning and the selected place's country. No id,
 * no version (a bare client with OkHttp's default user agent), no coordinates. Fire-and-forget: one try, failures
 * ignored, never on the main thread. Off in debug builds and in mock mode.
 */
object DailyPing {
    private const val PREFS = "daily_count"
    private const val LAST_DAY = "counted_on"
    private const val FIRST_SEEN = "first_seen"

    private val client by lazy {
        OkHttpClient.Builder().callTimeout(5, TimeUnit.SECONDS).retryOnConnectionFailure(false).build()
    }

    fun maybeSend(context: Context, settings: Settings, nowMs: Long = System.currentTimeMillis()) {
        if (BuildConfig.DEBUG || settings.mock != null || BuildConfig.HAZENOW_EDGE.isBlank()) return
        runCatching {
            val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            val d = DailyCount.decide(nowMs, prefs.getString(LAST_DAY, null), prefs.getBoolean(FIRST_SEEN, false), existingInstall = settings.firstRunDone)
                ?: return
            prefs.edit().putString(LAST_DAY, d.day).putBoolean(FIRST_SEEN, true).apply()
            val req = Request.Builder()
                .url(DailyCount.url(BuildConfig.HAZENOW_EDGE, "android", d.seen, placeCountry(settings)))
                .post(ByteArray(0).toRequestBody())
                .build()
            client.newCall(req).enqueue(object : Callback {
                override fun onFailure(call: Call, e: IOException) = Unit
                override fun onResponse(call: Call, response: Response) = response.close()
            })
        }
    }

    /** The country of the place being shown (never the device's location). */
    private fun placeCountry(s: Settings): String = when {
        s.mode == PlaceMode.CITY -> s.cityCountry ?: "SG"
        else -> s.gpsCountry?.name ?: "SG"
    }
}
