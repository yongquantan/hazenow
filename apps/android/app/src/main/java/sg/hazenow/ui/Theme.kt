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
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.Font
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import sg.hazenow.R
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
    MaterialTheme(
        colorScheme = scheme,
        typography = HazeTypography,
        content = content,
    )
}

/**
 * Apfel Grotezk (SIL OFL 1.1, brand/fonts): Regular for body, Mittel (Medium) for headlines with tight
 * tracking, Fett (Bold) for the big numbers. Glance widgets keep the system font (custom fonts aren't
 * reliable in older launchers).
 */
val ApfelGrotezk = FontFamily(
    Font(R.font.apfel_grotezk_regular, FontWeight.Normal),
    Font(R.font.apfel_grotezk_mittel, FontWeight.Medium),
    Font(R.font.apfel_grotezk_mittel, FontWeight.SemiBold),
    Font(R.font.apfel_grotezk_fett, FontWeight.Bold),
)

private val HazeTypography: Typography = Typography().let { t ->
    fun TextStyle.body() = copy(fontFamily = ApfelGrotezk, fontWeight = FontWeight.Normal)
    fun TextStyle.head(tracking: Float) = copy(fontFamily = ApfelGrotezk, fontWeight = FontWeight.Medium, letterSpacing = (fontSize.value * tracking).sp)
    t.copy(
        displayLarge = t.displayLarge.copy(
            fontFamily = ApfelGrotezk, fontWeight = FontWeight.Bold,
            fontSize = 96.sp, lineHeight = 100.sp, letterSpacing = (-3).sp,
        ),
        displayMedium = t.displayMedium.copy(fontFamily = ApfelGrotezk, fontWeight = FontWeight.Bold, letterSpacing = (-1.5).sp),
        displaySmall = t.displaySmall.copy(fontFamily = ApfelGrotezk, fontWeight = FontWeight.Bold, letterSpacing = (-1).sp),
        headlineLarge = t.headlineLarge.head(-0.02f),
        headlineMedium = t.headlineMedium.head(-0.02f),
        headlineSmall = t.headlineSmall.head(-0.02f),
        titleLarge = t.titleLarge.head(-0.015f),
        titleMedium = t.titleMedium.head(-0.01f),
        titleSmall = t.titleSmall.head(-0.005f),
        bodyLarge = t.bodyLarge.body(),
        bodyMedium = t.bodyMedium.body(),
        bodySmall = t.bodySmall.body(),
        labelLarge = t.labelLarge.copy(fontFamily = ApfelGrotezk, fontWeight = FontWeight.Medium),
        labelMedium = t.labelMedium.copy(fontFamily = ApfelGrotezk, fontWeight = FontWeight.Medium),
        labelSmall = t.labelSmall.copy(fontFamily = ApfelGrotezk, fontWeight = FontWeight.Medium),
    )
}

/** NEA band colours (SPEC §2). Used as accents / subtle tints — calm, never full-screen alarm red. */
val Band.color: Color get() = Color(argb)
