package sg.hazenow.widget

import android.appwidget.AppWidgetManager
import android.content.Intent
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawingPadding
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.unit.dp
import androidx.glance.appwidget.updateAll
import androidx.lifecycle.lifecycleScope
import kotlinx.coroutines.launch
import sg.hazenow.data.PlaceKeys
import sg.hazenow.data.Settings
import sg.hazenow.data.SettingsRepo
import sg.hazenow.ui.HazeTheme

/** SPEC v1.4 §2: pin a widget to a place (Home, Work/School, …) or let it follow the app. Optional on Android 12+. */
class WidgetConfigActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val id = intent?.extras?.getInt(AppWidgetManager.EXTRA_APPWIDGET_ID, AppWidgetManager.INVALID_APPWIDGET_ID)
            ?: AppWidgetManager.INVALID_APPWIDGET_ID
        setResult(RESULT_CANCELED, Intent().putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, id))
        if (id == AppWidgetManager.INVALID_APPWIDGET_ID) { finish(); return }
        val repo = SettingsRepo(this)
        setContent {
            HazeTheme {
                var settings by remember { mutableStateOf<Settings?>(null) }
                LaunchedEffect(Unit) { settings = repo.current() }
                Surface(Modifier.fillMaxSize()) {
                    Column(Modifier.safeDrawingPadding().padding(24.dp)) {
                        Text("Which place should this widget show?", style = MaterialTheme.typography.headlineSmall)
                        Spacer(Modifier.height(16.dp))
                        val s = settings
                        val options = buildList {
                            add(PlaceKeys.FOLLOW to "Same as the app")
                            if (s?.lat != null) add(PlaceKeys.NEAR to "Near you")
                            PlaceKeys.SAVED.forEach { k -> s?.places?.get(k)?.let { add(k to it.display) } }
                        }
                        options.forEach { (key, label) ->
                            Text(
                                label,
                                style = MaterialTheme.typography.bodyLarge,
                                modifier = Modifier.fillMaxWidth().clickable(role = Role.Button) { choose(id, key) }.padding(vertical = 16.dp),
                            )
                            HorizontalDivider()
                        }
                        if (s != null && s.places.isEmpty()) {
                            Spacer(Modifier.height(12.dp))
                            Text(
                                "Save Home or Work/School in the app to pin them here.",
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                            )
                        }
                    }
                }
            }
        }
    }

    private fun choose(id: Int, key: String) {
        lifecycleScope.launch {
            SettingsRepo(this@WidgetConfigActivity).setWidgetPlace(id, key)
            runCatching { SmallWidget().updateAll(this@WidgetConfigActivity) }
            runCatching { MediumWidget().updateAll(this@WidgetConfigActivity) }
            setResult(RESULT_OK, Intent().putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, id))
            finish()
        }
    }
}
