package sg.hazenow.ui

import android.content.Intent
import android.net.Uri
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilledTonalButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp

object AboutLinks {
    const val LINKEDIN = "https://www.linkedin.com/in/yongquantan"
    const val KAIROS = "https://kairoslabs.sg"
    const val GITHUB = "https://github.com/yongquantan/hazenow"
}

/** COPY §18 (canonical): who, why, free/open source. LinkedIn first, then Kairos Labs, then GitHub. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun AboutSheet(onDismiss: () -> Unit) {
    val ctx = LocalContext.current
    fun open(url: String) = runCatching {
        ctx.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(url)).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
    }
    ModalBottomSheet(onDismissRequest = onDismiss) {
        Column(Modifier.navigationBarsPadding().verticalScroll(rememberScrollState()).padding(horizontal = 24.dp).padding(bottom = 32.dp)) {
            Text("About HazeNow", style = MaterialTheme.typography.headlineSmall, modifier = Modifier.semantics { heading() })
            Spacer(Modifier.height(10.dp))
            Text(
                "I built HazeNow because the number most of us check during a haze, the 24-hr PSI, moves slowly. " +
                    "NEA also publishes the last hour's PM2.5, and recommends it for deciding what to do right now. " +
                    "HazeNow puts that number first, in plain words, using only NEA's data.",
                style = MaterialTheme.typography.bodyLarge,
            )
            Spacer(Modifier.height(10.dp))
            Text(
                "It's free and open source (MIT). No ads, no tracking, no account. Your location stays on your phone.",
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            Spacer(Modifier.height(10.dp))
            Text("— Yong Quan Tan", style = MaterialTheme.typography.titleSmall)
            Spacer(Modifier.height(20.dp))
            FilledTonalButton(onClick = { open(AboutLinks.LINKEDIN) }, modifier = Modifier.fillMaxWidth()) { Text("LinkedIn") }
            Spacer(Modifier.height(8.dp))
            OutlinedButton(onClick = { open(AboutLinks.KAIROS) }, modifier = Modifier.fillMaxWidth()) {
                Column(horizontalAlignment = androidx.compose.ui.Alignment.CenterHorizontally) {
                    Text("Kairos Labs · kairoslabs.sg")
                    Text("I run Kairos Labs, an applied AI studio.", style = MaterialTheme.typography.bodySmall)
                }
            }
            Spacer(Modifier.height(8.dp))
            OutlinedButton(onClick = { open(AboutLinks.GITHUB) }, modifier = Modifier.fillMaxWidth()) { Text("Source code on GitHub") }
        }
    }
}
