package sg.hazenow.debug

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.util.Log
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import sg.hazenow.Refresher
import sg.hazenow.data.MockData
import sg.hazenow.data.SettingsRepo
import sg.hazenow.work.RefreshWorker

/**
 * Debug-only QA hooks (not in release builds):
 *   adb shell am broadcast -a sg.hazenow.DEBUG_REFRESH -p sg.hazenow
 *   adb shell am broadcast -a sg.hazenow.DEBUG_MOCK -p sg.hazenow --es mock high   (or "off")
 * Both refresh immediately in-process (widgets, tile, Haze watch, alerts) and also enqueue the
 * WorkManager one-shot job, so the worker path is exercised too.
 */
class DebugReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        val pending = goAsync()
        val app = context.applicationContext
        CoroutineScope(Dispatchers.IO).launch {
            try {
                if (intent.action == "sg.hazenow.DEBUG_MOCK") {
                    val m = intent.getStringExtra("mock")
                    SettingsRepo(app).setMock(if (m == null || m == "off" || m !in MockData.SCENARIOS) null else m)
                }
                val data = runCatching { Refresher.refresh(app, force = true) }
                Log.i(TAG, "refresh: ${data.getOrNull()?.snapshot?.let { "pm25=${it.pm25} band=${it.band.id}" } ?: data.exceptionOrNull()}")
                RefreshWorker.runOnce(app)
            } finally {
                pending.finish()
            }
        }
    }

    companion object {
        const val TAG = "HazeNowDebug"
    }
}
