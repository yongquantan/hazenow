package sg.hazenow.ui

import android.app.StatusBarManager
import android.appwidget.AppWidgetManager
import android.content.ComponentName
import android.content.Context
import android.graphics.drawable.Icon
import android.os.Build
import android.widget.Toast
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.FilledTonalButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import sg.hazenow.R
import sg.hazenow.tile.HazeTileService
import sg.hazenow.widget.MediumWidgetReceiver
import sg.hazenow.widget.SmallWidgetReceiver

/**
 * The home-screen widget and the Quick Settings tile, offered from inside the app: once after the first verdict
 * ([HomeOfferCard]) and for good in [HomeShortcutsCard]. One system prompt per tap, never re-offered automatically.
 */
object HomeShortcuts {
    const val OFFER_TITLE = "See the air without opening the app"
    const val OFFER_BODY = "Add the widget to your Home Screen, or a tile to Quick Settings."
    const val ADD_WIDGET = "Add the widget"
    const val ADD_TILE = "Add the Quick Settings tile"
    const val NOT_NOW = "Not now"
    const val CARD_TITLE = "Widget and tile"
    /** The tile's label is `@string/tile_label` ("Haze now"). */
    const val TILE_HINT = "To add the tile: swipe down twice, tap the pencil, then drag “Haze now” into your tiles."
    const val WIDGET_FALLBACK = "This launcher can't add widgets from apps. Long-press the Home Screen, tap Widgets, then pick HazeNow."
    const val TILE_ALREADY = "The tile is already in Quick Settings."
    const val TILE_FAILED = "Couldn't add the tile just now. $TILE_HINT"

    /** System prompt to add the tile exists from Android 13 (API 33). */
    val canRequestTile: Boolean get() = Build.VERSION.SDK_INT >= 33

    /** Asks the launcher to pin a widget ("small" or "medium"); falls back to a calm how-to Toast. */
    fun pinWidget(ctx: Context, which: String) {
        val mgr = ctx.getSystemService(AppWidgetManager::class.java)
        val cls = if (which == "medium") MediumWidgetReceiver::class.java else SmallWidgetReceiver::class.java
        val asked = mgr != null && mgr.isRequestPinAppWidgetSupported &&
            runCatching { mgr.requestPinAppWidget(ComponentName(ctx, cls), null, null) }.getOrDefault(false)
        if (!asked) Toast.makeText(ctx, WIDGET_FALLBACK, Toast.LENGTH_LONG).show()
    }

    /** Asks System UI to add the tile (Android 13+); otherwise, or on failure, explains how to add it by hand. */
    fun addTile(ctx: Context) {
        if (Build.VERSION.SDK_INT < 33) {
            Toast.makeText(ctx, TILE_HINT, Toast.LENGTH_LONG).show()
            return
        }
        val sbm = ctx.getSystemService(StatusBarManager::class.java)
        if (sbm == null) {
            Toast.makeText(ctx, TILE_HINT, Toast.LENGTH_LONG).show()
            return
        }
        sbm.requestAddTileService(
            ComponentName(ctx, HazeTileService::class.java),
            ctx.getString(R.string.tile_label),
            Icon.createWithResource(ctx, R.drawable.ic_stat_haze),
            ctx.mainExecutor,
        ) { result ->
            val msg = when (result) {
                StatusBarManager.TILE_ADD_REQUEST_RESULT_TILE_ADDED,
                StatusBarManager.TILE_ADD_REQUEST_RESULT_TILE_NOT_ADDED,
                // A prompt is already showing: don't stack a second one or talk over it.
                StatusBarManager.TILE_ADD_REQUEST_ERROR_REQUEST_IN_PROGRESS -> null
                StatusBarManager.TILE_ADD_REQUEST_RESULT_TILE_ALREADY_ADDED -> TILE_ALREADY
                else -> TILE_FAILED
            }
            msg?.let { Toast.makeText(ctx, it, Toast.LENGTH_LONG).show() }
        }
    }
}

/** First-run offer: shown once, under the verdict, after the place and profile steps. Any button retires it. */
@OptIn(ExperimentalLayoutApi::class)
@Composable
fun HomeOfferCard(onDone: () -> Unit) {
    val ctx = LocalContext.current
    Card(
        shape = RoundedCornerShape(24.dp),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceContainer),
        modifier = Modifier.fillMaxWidth(),
    ) {
        Column(Modifier.padding(18.dp)) {
            Text(HomeShortcuts.OFFER_TITLE, style = MaterialTheme.typography.titleMedium, modifier = Modifier.semantics { heading() })
            Spacer(Modifier.height(4.dp))
            Text(HomeShortcuts.OFFER_BODY, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
            Spacer(Modifier.height(12.dp))
            FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                FilledTonalButton(onClick = { onDone(); HomeShortcuts.pinWidget(ctx, "small") }) { Text(HomeShortcuts.ADD_WIDGET) }
                if (HomeShortcuts.canRequestTile) {
                    OutlinedButton(onClick = { onDone(); HomeShortcuts.addTile(ctx) }) { Text(HomeShortcuts.ADD_TILE) }
                }
                TextButton(onClick = onDone) { Text(HomeShortcuts.NOT_NOW) }
            }
        }
    }
}

/** The permanent entry for the widget and the tile (tile prompt on Android 13+, a how-to line before that). */
@Composable
fun HomeShortcutsCard() {
    val ctx = LocalContext.current
    Card(
        shape = RoundedCornerShape(24.dp),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceContainer),
        modifier = Modifier.fillMaxWidth(),
    ) {
        Column(Modifier.padding(18.dp)) {
            Text(HomeShortcuts.CARD_TITLE, style = MaterialTheme.typography.titleMedium, modifier = Modifier.semantics { heading() })
            Spacer(Modifier.height(4.dp))
            TextButton(onClick = { HomeShortcuts.pinWidget(ctx, "small") }, contentPadding = PaddingValues(0.dp)) { Text(HomeShortcuts.ADD_WIDGET) }
            if (HomeShortcuts.canRequestTile) {
                TextButton(onClick = { HomeShortcuts.addTile(ctx) }, contentPadding = PaddingValues(0.dp)) { Text(HomeShortcuts.ADD_TILE) }
            } else {
                Spacer(Modifier.height(4.dp))
                Text(HomeShortcuts.TILE_HINT, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        }
    }
}
