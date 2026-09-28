package sg.hazenow.ui

import android.os.Build
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Typography
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.dynamicDarkColorScheme
import androidx.compose.material3.dynamicLightColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.sp
import sg.hazenow.core.Band

private val Light = lightColorScheme(
    primary = Color(0xFF2F6B55),
    onPrimary = Color.White,
    primaryContainer = Color(0xFFB4EFD4),
    secondary = Color(0xFF4D6358),
    background = Color(0xFFFAFAF7),
    surface = Color(0xFFFAFAF7),
    surfaceContainer = Color(0xFFEFF0EB),
    surfaceContainerHigh = Color(0xFFE9EAE5),
)

private val Dark = darkColorScheme(
    primary = Color(0xFF98D5BA),
    onPrimary = Color(0xFF00382A),
    primaryContainer = Color(0xFF155140),
    secondary = Color(0xFFB4CCBF),
    background = Color(0xFF121412),
    surface = Color(0xFF121412),
    surfaceContainer = Color(0xFF1E201E),
    surfaceContainerHigh = Color(0xFF282A28),
)

@Composable
fun HazeTheme(content: @Composable () -> Unit) {
    val dark = isSystemInDarkTheme()
    val ctx = LocalContext.current
    val scheme = when {
        Build.VERSION.SDK_INT >= Build.VERSION_CODES.S -> if (dark) dynamicDarkColorScheme(ctx) else dynamicLightColorScheme(ctx)
        dark -> Dark
        else -> Light
    }
    val base = Typography()
    MaterialTheme(
        colorScheme = scheme,
        typography = base.copy(
            displayLarge = base.displayLarge.copy(fontSize = 96.sp, lineHeight = 100.sp, fontWeight = FontWeight.Bold, letterSpacing = (-3).sp),
            headlineSmall = base.headlineSmall.copy(fontWeight = FontWeight.SemiBold),
        ),
        content = content,
    )
}

/** NEA band colours (SPEC §2). Used as accents / subtle tints — calm, never full-screen alarm red. */
val Band.color: Color get() = Color(argb)
