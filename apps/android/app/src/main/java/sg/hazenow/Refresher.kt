package sg.hazenow

import android.content.ComponentName
import android.content.Context
import android.service.quicksettings.TileService
import androidx.glance.appwidget.updateAll
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import sg.hazenow.core.Alerts
import sg.hazenow.data.HazeData
import sg.hazenow.data.HazeRepository
import sg.hazenow.data.LocationHelper
import sg.hazenow.data.MockData
import sg.hazenow.data.SettingsRepo
import sg.hazenow.notify.Notifier
import sg.hazenow.tile.HazeTileService
import sg.hazenow.widget.MediumWidget
import sg.hazenow.widget.SmallWidget
import java.time.Instant

/** One entry point that fetches and pushes the result to every surface. */
object Refresher {
    private val mutex = Mutex()
    @Volatile private var lastRenderKey: String? = null

    /** @throws Exception if the network fetch failed and there's no cache at all. */
    /**
     * @param v1 fetch the primary fresh source (v1).
     * @param v2 also do a v2 back-fill pass (rate limited; SPEC v1.3 ~hh:35 / ~hh:50).
     */
    suspend fun refresh(context: Context, force: Boolean = false, v1: Boolean = true, v2: Boolean = force): HazeData? = mutex.withLock {
        val app = context.applicationContext
        val repo = HazeRepository.get(app)
        val settingsRepo = SettingsRepo(app)
        var settings = settingsRepo.current()
        val fetch = when (settings.mock) {
            null -> runCatching { repo.fetch(v1 = v1, v2 = v2, force = force) }
            MockData.NETWORK_ERROR -> Result.failure(java.io.IOException("Mock: network_error"))
            else -> Result.success(true)
        }

        // Background: refresh the cached location cheaply (last known only; never wakes GPS).
        if (settings.mode == sg.hazenow.data.PlaceMode.GPS) {
            LocationHelper.lastKnown(app)?.let {
                settingsRepo.setLocation(it.latitude, it.longitude, switchToGps = false)
                settings = settingsRepo.current()
            }
        }
        val data = repo.compute(settings)
        if (data == null) {
            fetch.exceptionOrNull()?.let { throw it }
            return@withLock null
        }
        publish(app, data, force)

        // SPEC v2.0 §3: alerts use each place's own scale, and crossing a border never fires one. Band alerts stay
        // NEA-based, so they only run while the app is showing a Singapore place.
        if (settings.bandAlerts && !settings.outsideSingapore) {
            val outcome = Alerts.evaluate(settings.alertState, data.snapshot, settings.alertPrefs, Instant.now())
            if (outcome.state != settings.alertState) settingsRepo.setAlertState(outcome.state)
            outcome.alert?.let { Notifier.showAlert(app, it, data) }
        }
        data
    }

    /** Push [data] to widgets, notification and tile, skipping work when nothing visible changed. */
    suspend fun publish(context: Context, data: HazeData, force: Boolean = false) {
        val settings = SettingsRepo(context).current()
        val key = listOf(
            data.snapshot.publishedAt, data.snapshot.pm25, settings.selection, settings.profiles,
            data.snapshot.stale, settings.hazeWatch, settings.mock,
            // Widgets size their text from the font scale when rendered, so re-render when it changes.
            context.resources.configuration.fontScale,
        ).toString()
        if (!force && key == lastRenderKey) return
        lastRenderKey = key
        runCatching { SmallWidget().updateAll(context) }
        runCatching { MediumWidget().updateAll(context) }
        if (settings.hazeWatch) Notifier.showWatch(context, data) else Notifier.cancelWatch(context)
        runCatching { TileService.requestListeningState(context, ComponentName(context, HazeTileService::class.java)) }
    }
}
