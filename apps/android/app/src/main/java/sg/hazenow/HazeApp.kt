package sg.hazenow

import android.app.Application
import android.content.ComponentCallbacks
import android.content.res.Configuration
import androidx.glance.appwidget.updateAll
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch
import sg.hazenow.notify.Notifier
import sg.hazenow.widget.MediumWidget
import sg.hazenow.widget.SmallWidget
import sg.hazenow.widget.onFontScaleChanged
import sg.hazenow.work.RefreshWorker

class HazeApp : Application() {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Default)
    private var fontScale = 1f

    override fun onCreate() {
        super.onCreate()
        Notifier.createChannels(this)
        RefreshWorker.schedule(this)
        fontScale = resources.configuration.fontScale
        // Widgets size their text in dp from the font scale at render time; if our process is alive when the
        // user changes font size, re-render them now rather than at the next refresh.
        registerComponentCallbacks(object : ComponentCallbacks {
            override fun onConfigurationChanged(newConfig: Configuration) {
                if (newConfig.fontScale == fontScale) return
                fontScale = newConfig.fontScale
                onFontScaleChanged()
                scope.launch {
                    runCatching { SmallWidget().updateAll(this@HazeApp) }
                    runCatching { MediumWidget().updateAll(this@HazeApp) }
                }
            }
            @Deprecated("Deprecated in Java")
            override fun onLowMemory() = Unit
        })
    }
}
