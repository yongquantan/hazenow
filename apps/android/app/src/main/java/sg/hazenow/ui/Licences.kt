package sg.hazenow.ui

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.unit.dp
import sg.hazenow.R

private data class Notice(val name: String, val licence: String, val detail: String)

private val NOTICES = listOf(
    Notice("HazeNow", "MIT License", "Free and open source. Data: NEA via data.gov.sg (Singapore Open Data Licence)."),
    Notice("AndroidX (Compose, Glance, WorkManager, DataStore, Core, Activity, Lifecycle)", "Apache License 2.0", "© The Android Open Source Project"),
    Notice("Kotlin, kotlinx.coroutines, kotlinx.serialization", "Apache License 2.0", "© JetBrains s.r.o. and contributors"),
    Notice("OkHttp, Okio", "Apache License 2.0", "© Square, Inc."),
)

/** Open-source licences, including the full SIL OFL text for the Apfel Grotezk typeface. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun LicencesSheet(onDismiss: () -> Unit) {
    val ctx = LocalContext.current
    val ofl = remember { runCatching { ctx.resources.openRawResource(R.raw.ofl_apfel_grotezk).bufferedReader().use { it.readText() } }.getOrDefault("") }
    ModalBottomSheet(onDismissRequest = onDismiss) {
        Column(Modifier.navigationBarsPadding().verticalScroll(rememberScrollState()).padding(horizontal = 24.dp).padding(bottom = 32.dp)) {
            Text("Open-source licences", style = MaterialTheme.typography.headlineSmall, modifier = Modifier.semantics { heading() })
            Spacer(Modifier.height(12.dp))
            NOTICES.forEach { n ->
                Text(n.name, style = MaterialTheme.typography.titleSmall)
                Text("${n.licence} · ${n.detail}", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                Spacer(Modifier.height(12.dp))
            }
            Text("Apfel Grotezk typeface", style = MaterialTheme.typography.titleSmall)
            Text("SIL Open Font License 1.1", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            Spacer(Modifier.height(8.dp))
            Text(ofl, style = MaterialTheme.typography.bodySmall.copy(fontFamily = FontFamily.Monospace), color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
    }
}
