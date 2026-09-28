package sg.hazenow.tile

import android.annotation.SuppressLint
import android.app.PendingIntent
import android.content.Intent
import android.graphics.drawable.Icon
import android.os.Build
import android.service.quicksettings.Tile
import android.service.quicksettings.TileService
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import android.content.ComponentName
import sg.hazenow.R
import sg.hazenow.Refresher
import sg.hazenow.data.HazeRepository
import sg.hazenow.data.SettingsRepo
import sg.hazenow.ui.MainActivity

/** Quick Settings tile: brand small mark as the icon, "PM2.5 105" + "Elevated ▲". Tap opens the app. */
class HazeTileService : TileService() {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main)

    override fun onTileAdded() {
        super.onTileAdded()
        requestListeningState(this, ComponentName(this, HazeTileService::class.java))
        render()
    }

    override fun onStartListening() {
        super.onStartListening()
        render()
    }

    /**
     * Show the cached reading straight away (QA C-tile: never "Unavailable" while data exists). If nothing is
     * cached yet, fetch once and render again.
     */
    private fun render() {
        scope.launch {
            val app = applicationContext
            var data = withContext(Dispatchers.IO) { HazeRepository.get(app).compute(SettingsRepo(app).current()) }
            if (data == null) data = withContext(Dispatchers.IO) { runCatching { Refresher.refresh(app) }.getOrNull() }
            val tile = qsTile ?: return@launch
            if (data == null) {
                tile.label = "Haze now"
                tile.icon = Icon.createWithResource(this@HazeTileService, R.drawable.ic_stat_haze)
                tile.state = Tile.STATE_INACTIVE
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) tile.subtitle = "Tap to open"
            } else {
                val s = data.snapshot
                tile.icon = Icon.createWithResource(this@HazeTileService, R.drawable.ic_stat_haze) // brand small mark
                tile.label = "PM2.5 ${data.insight.display}"
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) tile.subtitle = "${s.band.label}${if (s.stale) " (old)" else ""} ${s.trend.direction.arrow}"
                tile.contentDescription = data.insight.compactAccessibility
                tile.state = Tile.STATE_ACTIVE
            }
            tile.updateTile()
        }
    }

    @SuppressLint("StartActivityAndCollapseDeprecated")
    override fun onClick() {
        super.onClick()
        val intent = Intent(this, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        if (Build.VERSION.SDK_INT >= 34) {
            startActivityAndCollapse(PendingIntent.getActivity(this, 0, intent, PendingIntent.FLAG_IMMUTABLE))
        } else {
            @Suppress("DEPRECATION")
            startActivityAndCollapse(intent)
        }
    }

    override fun onDestroy() {
        scope.cancel()
        super.onDestroy()
    }
}
