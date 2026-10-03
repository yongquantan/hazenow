package sg.hazenow.widget

import android.content.Context
import androidx.glance.unit.ColorProvider
import androidx.compose.runtime.Composable
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.snapshots.Snapshot
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import androidx.glance.GlanceId
import androidx.glance.GlanceModifier
import androidx.glance.GlanceTheme
import androidx.glance.Image
import androidx.glance.ImageProvider
import androidx.glance.LocalContext
import androidx.glance.LocalSize
import androidx.glance.action.clickable
import androidx.glance.appwidget.GlanceAppWidget
import androidx.glance.appwidget.GlanceAppWidgetManager
import androidx.glance.appwidget.GlanceAppWidgetReceiver
import androidx.glance.appwidget.SizeMode
import androidx.glance.action.actionStartActivity
import androidx.glance.appwidget.appWidgetBackground
import androidx.glance.appwidget.cornerRadius
import androidx.glance.appwidget.provideContent
import androidx.glance.background
import androidx.glance.layout.Alignment
import androidx.glance.layout.Column
import androidx.glance.layout.Row
import androidx.glance.layout.Spacer
import androidx.glance.layout.fillMaxSize
import androidx.glance.layout.fillMaxWidth
import androidx.glance.layout.height
import androidx.glance.layout.padding
import androidx.glance.layout.width
import androidx.glance.semantics.contentDescription
import androidx.glance.semantics.semantics
import androidx.compose.ui.unit.sp
import androidx.glance.text.FontWeight
import androidx.glance.text.Text
import androidx.glance.text.TextAlign
import androidx.glance.text.TextStyle
import androidx.glance.color.ColorProvider
import sg.hazenow.core.Chart
import sg.hazenow.core.Contrast
import sg.hazenow.core.Format
import sg.hazenow.data.HazeData
import sg.hazenow.data.HazeRepository
import sg.hazenow.data.PlaceMode
import sg.hazenow.data.SettingsRepo
import sg.hazenow.render.ChartPainter
import sg.hazenow.render.ChartStyle
import sg.hazenow.ui.MainActivity
import sg.hazenow.work.RefreshWorker

/** Data for this widget instance, honouring its pinned place (SPEC v1.4 §2). */
private suspend fun loadData(context: Context, id: GlanceId): Pair<HazeData?, String?> {
    val repo = SettingsRepo(context)
    val appWidgetId = runCatching { GlanceAppWidgetManager(context).getAppWidgetId(id) }.getOrNull()
    val key = appWidgetId?.let { repo.widgetPlace(it) }
    val settings = repo.current().pinnedTo(key)
    val data = HazeRepository.get(context).compute(settings)
    val label = when {
        settings.mode == PlaceMode.AREA -> settings.area?.let { if (settings.activePlace != null) it.label else it.name }
        data != null -> Format.place(data.snapshot)
        else -> null
    }
    return data to label
}

private const val WIDGET_LIGHT_BG = 0xFFF3F4EFL
private const val WIDGET_DARK_BG = 0xFF1D1F1DL

/** Band colour, contrast-adjusted (≥3:1 as an icon) for light and dark widget backgrounds. */
private fun bandProvider(d: HazeData, target: Double = Contrast.ICON) = ColorProvider(
    day = Color(Contrast.ensure(d.snapshot.band.argb, WIDGET_LIGHT_BG, target)),
    night = Color(Contrast.ensure(d.snapshot.band.argb, WIDGET_DARK_BG, target)),
)

private fun bandLabel(d: HazeData) = d.snapshot.band.label + if (d.snapshot.stale) " (old)" else ""

/**
 * Font-scale-aware sizing for the widgets (QA r2 P2: clipping at font_scale 2.0).
 *
 * Glance text is in sp, so it grows with the system font scale while the widget's cell size (dp) does not.
 * Each widget budgets its height and width in dp from [LocalSize], gives space to the most important text first
 * (the number and band word are never dropped, wrapped or ellipsized) and drops secondary text and the chart when
 * it runs out. Widths are estimated, so the estimates are deliberately conservative.
 */
private object Fit {
    /** A TextView's line height (including font padding) as a multiple of its text size. */
    const val LINE = 1.25f

    /** Average advance per character, as a multiple of text size. Conservative for Roboto. */
    private const val CHAR_REGULAR = 0.56f
    private const val CHAR_BOLD = 0.62f

    fun widthDp(text: String, textDp: Float, bold: Boolean = false): Float {
        val per = if (bold) CHAR_BOLD else CHAR_REGULAR
        // Symbols (● ▲ ▶ ▼) are close to a full em wide.
        return text.sumOf { c -> (if (c.code in 0x25A0..0x25FF) 1.0f else per).toDouble() }.toFloat() * textDp
    }

    fun lineDp(textDp: Float, lines: Int = 1) = textDp * LINE * lines

    fun linesNeeded(text: String, textDp: Float, widthDp: Float, bold: Boolean = false): Int =
        if (widthDp <= 0f) Int.MAX_VALUE else kotlin.math.ceil(widthDp(text, textDp, bold) / widthDp).toInt().coerceAtLeast(1)

    /** Largest text size <= [desiredDp] at which [text] fits on one line in [widthDp]. */
    fun fitDp(text: String, desiredDp: Float, widthDp: Float, bold: Boolean = false): Float {
        val w = widthDp(text, 1f, bold)
        return if (w <= 0f) desiredDp else minOf(desiredDp, widthDp / w)
    }
}

/** System font scale for this widget's context. */
private fun fontScale(ctx: Context) = ctx.resources.configuration.fontScale.takeIf { it > 0f } ?: 1f

/**
 * Bumped by [onFontScaleChanged]. A running Glance session doesn't recompose on `updateAll` unless something it
 * reads has changed, so the widgets read this to pick up a new font scale.
 */
private val fontScaleVersion = mutableIntStateOf(0)

/** Call when the system font scale changes, then `updateAll` the widgets (see HazeApp). */
fun onFontScaleChanged() {
    Snapshot.withMutableSnapshot { fontScaleVersion.intValue++ }
}

/** Font scale for widget layout; recomposes running widget sessions when it changes. */
@Composable
private fun currentFontScale(): Float {
    fontScaleVersion.intValue
    return fontScale(LocalContext.current)
}

/** Text size in dp that honours the font scale up to [cap]. */
private fun scaledDp(baseSp: Float, fs: Float, cap: Float = 2f) = baseSp * minOf(fs, cap)

/**
 * Text whose size is budgeted in dp. Glance only takes sp, so convert using the font scale at composition time.
 * The launcher applies the font scale when it draws, so if the user changes font size after we rendered, the
 * widget must be re-rendered: see HazeApp (config callback) and Refresher.publish (font scale is in its key).
 */
@Composable
private fun DpText(
    text: String,
    sizeDp: Float,
    color: ColorProvider,
    weight: FontWeight? = null,
    maxLines: Int = 1,
    align: TextAlign? = null,
    modifier: GlanceModifier = GlanceModifier,
) {
    val fs = currentFontScale()
    Text(
        text,
        style = TextStyle(color = color, fontSize = (sizeDp / fs).sp, fontWeight = weight, textAlign = align),
        maxLines = maxLines.coerceAtLeast(1),
        modifier = modifier,
    )
}

private const val MOCK_DP = 9f
private const val MOCK_TEXT = "MOCK DATA"

@Composable
private fun MockBadge(d: HazeData, fs: Float) {
    // Debug-only marker: a fixed size, so it never competes with real content for space.
    if (d.mock != null) {
        DpText(MOCK_TEXT, MOCK_DP, GlanceTheme.colors.error, FontWeight.Bold, maxLines = 1)
    }
}

private const val H_PAD = 14f

@Composable
private fun Shell(
    vPad: Float = 10f,
    vertical: Alignment.Vertical = Alignment.CenterVertically,
    content: @Composable () -> Unit,
) {
    Column(
        modifier = GlanceModifier.fillMaxSize()
            .appWidgetBackground()
            .background(GlanceTheme.colors.widgetBackground)
            .cornerRadius(20.dp)
            .clickable(actionStartActivity<MainActivity>())
            .padding(horizontal = H_PAD.dp, vertical = vPad.dp),
        verticalAlignment = vertical,
    ) { content() }
}

@Composable
private fun Empty() = Shell {
    val fs = currentFontScale()
    DpText("HazeNow", scaledDp(14f, fs, 1.5f), GlanceTheme.colors.onSurface, FontWeight.Bold)
    DpText("Can't load the air reading", scaledDp(12f, fs, 1.5f), GlanceTheme.colors.onSurfaceVariant,
        maxLines = 2,
    )
}

/** Small: `● 105 ▲` + band label. Never colour-only: label is always present. */
class SmallWidget : GlanceAppWidget() {
    override val sizeMode = SizeMode.Exact

    override suspend fun provideGlance(context: Context, id: GlanceId) {
        val (data, place) = loadData(context, id)
        provideContent { GlanceTheme { if (data == null) Empty() else SmallContent(data, place) } }
    }

    @Composable
    private fun SmallContent(d: HazeData, place: String?) {
        val s = d.snapshot
        val ctx = LocalContext.current
        val size = LocalSize.current
        val fs = currentFontScale()
        val vPad = if (size.height.value < 100f) 6f else 10f
        val w = size.width.value - 2 * H_PAD
        var room = size.height.value - 2 * vPad

        // 1. Band word: always shown, on one line, shrunk (never ellipsized) if the widget is narrow.
        val band = bandLabel(d)
        val bandDp = Fit.fitDp(band, scaledDp(12f, fs), w, bold = true)
        room -= Fit.lineDp(bandDp)
        // Debug badge shares the last line's height budget.
        if (d.mock != null) room -= Fit.lineDp(MOCK_DP)

        // 2. The number: grows a little with font scale (it's already large), limited by the height and width left.
        // The dot and arrow keep their 1x proportions to the number (18 : 30 and 16 : 30), so when the number has
        // to shrink to fit the width they shrink with it. 4dp slack covers TextView rounding.
        val dotK = 0.6f
        val arrowK = 0.53f
        val unitW = Fit.widthDp(d.insight.display, 1f, bold = true) + Fit.widthDp("●", dotK) + Fit.widthDp("▲", arrowK)
        val numberDp = minOf(30f * minOf(fs, 1.3f), room / Fit.LINE, (w - 6f - 4f - 4f) / unitW)
            .coerceAtLeast(14f)
        val dotDp = numberDp * dotK
        val arrowDp = numberDp * arrowK
        room -= Fit.lineDp(numberDp)

        // 3. Place: on the band line if it fits there, else its own line if there's height, else dropped.
        val inlineLabel = place?.let { "$band · $it" }
        val placeInline = inlineLabel != null && Fit.widthDp(inlineLabel, bandDp, bold = true) <= w
        val placeDp = scaledDp(12f, fs)
        val placeOwnLine = place != null && !placeInline && room >= Fit.lineDp(placeDp)
        if (placeOwnLine) room -= Fit.lineDp(placeDp)

        // Top-aligned with a computed centring gap rather than CenterVertically: if the launcher ever draws at a
        // larger font scale than we composed for, overflow falls off the bottom (badge, place), never the number.
        Shell(vPad = vPad, vertical = Alignment.Top) {
            if (room > 1f) Spacer(GlanceModifier.height((room / 2f).dp))
            val onSurface = GlanceTheme.colors.onSurface
            val muted = GlanceTheme.colors.onSurfaceVariant
            Row(
                verticalAlignment = Alignment.CenterVertically,
                modifier = GlanceModifier.semantics { contentDescription = d.insight.compactAccessibility },
            ) {
                DpText("●", dotDp, bandProvider(d), maxLines = 1)
                Spacer(GlanceModifier.width(6.dp))
                DpText(d.insight.display, numberDp, onSurface, FontWeight.Bold, maxLines = 1)
                Spacer(GlanceModifier.width(4.dp))
                DpText(s.trend.direction.arrow, arrowDp, onSurface, maxLines = 1)
            }
            DpText(if (placeInline) inlineLabel!! else band, bandDp, muted, FontWeight.Medium,
                maxLines = 1,
            )
            if (placeOwnLine) {
                DpText(place!!, placeDp, muted, maxLines = 1)
            }
            MockBadge(d, fs)
        }
    }
}

/** Medium (resizable): short verdict, number + band + trend, NEA 24-hr PSI, and the last-24-hours chart. */
class MediumWidget : GlanceAppWidget() {
    override val sizeMode = SizeMode.Exact

    override suspend fun provideGlance(context: Context, id: GlanceId) {
        val (data, place) = loadData(context, id)
        provideContent { GlanceTheme { if (data == null) Empty() else MediumContent(data, place) } }
    }

    @Composable
    private fun MediumContent(d: HazeData, place: String?) {
        val s = d.snapshot
        val ctx = LocalContext.current
        val size = LocalSize.current
        val fs = currentFontScale()
        val vPad = 10f
        val w = size.width.value - 2 * H_PAD
        var room = size.height.value - 2 * vPad
        val mockW = if (d.mock != null) Fit.widthDp(MOCK_TEXT, MOCK_DP, bold = true) + 6f else 0f

        // COPY §16: Short verdict · `105` Elevated ▲ · "4pm · NEA". Priority, highest first:
        // number + band word > verdict > "4pm · NEA" > place > NEA 24-hr PSI > chart.

        // Row 2: the number and band word. The band word is never ellipsized: it shrinks to fit, or moves under
        // the number when the row is too narrow at this font scale.
        val markScale = minOf(fs, 1.3f)
        val dotDp = 16f * markScale
        val numberDp = 30f * markScale
        val bandText = "${bandLabel(d)} ${s.trend.direction.arrow}"
        val bandDesired = scaledDp(13f, fs)
        val numberW = Fit.widthDp("●", dotDp) + 4f + Fit.widthDp(d.insight.display, numberDp, bold = true) + 6f
        val bandInlineDp = Fit.fitDp(bandText, bandDesired, w - numberW, bold = true)
        val bandStacked = bandInlineDp < minOf(bandDesired, 13f) // would have to shrink below the 1x size: stack it
        val bandDp = if (bandStacked) Fit.fitDp(bandText, bandDesired, w, bold = true) else bandInlineDp
        val row2H = if (bandStacked) Fit.lineDp(numberDp) + Fit.lineDp(bandDp) else Fit.lineDp(maxOf(numberDp, bandDp))
        room -= row2H

        // "4pm · NEA": at the end of row 2 if there's width, otherwise at the start of the meta line.
        val time = "${Format.clock(s.observedAt)} · NEA"
        val metaDp = scaledDp(11f, fs)
        val timeInline = !bandStacked &&
            w - numberW - Fit.widthDp(bandText, bandDp, bold = true) - 6f >= Fit.widthDp(time, metaDp)

        // Header: the verdict, one line, two if it needs them and there's room. Dropped only on a widget too
        // short for it at this font scale; the verdict stays in the number row's content description.
        val markDp = 20f * minOf(fs, 1.5f)
        // Shrink a long verdict towards 1.3x before wrapping or ellipsizing it.
        val verdictDp = maxOf(
            Fit.fitDp(d.insight.verdict.short, scaledDp(15f, fs), w - markDp - 8f - mockW, bold = true),
            scaledDp(15f, fs, 1.3f),
        )
        val verdictW = w - markDp - 8f - mockW
        val verdictNeeds = Fit.linesNeeded(d.insight.verdict.short, verdictDp, verdictW, bold = true).coerceAtMost(2)
        val showHeader = room >= Fit.lineDp(verdictDp)
        var verdictLines = 0
        if (showHeader) { verdictLines = 1; room -= Fit.lineDp(verdictDp) } else if (d.mock != null) room -= Fit.lineDp(MOCK_DP)

        // Meta line: place and (if moved) the time.
        // Time first: if the line is too long, the place name is what gets ellipsized.
        val metaA = listOfNotNull(if (timeInline) null else time, place).joinToString(" · ").ifEmpty { null }
        val showMetaA = metaA != null && room >= Fit.lineDp(metaDp)
        if (showMetaA) room -= Fit.lineDp(metaDp)

        // PSI: on the place line when it fits there, else its own line(s), up to 2.
        val psi = d.insight.officialPsiLabel
        val joined = if (showMetaA) "$metaA · $psi" else null
        val psiJoined = joined != null && Fit.linesNeeded(joined, metaDp, w) == 1
        var psiLines = 0
        if (!psiJoined) {
            val needs = Fit.linesNeeded(psi, metaDp, w).coerceAtMost(2)
            psiLines = (needs downTo 1).firstOrNull { room >= Fit.lineDp(metaDp, it) } ?: 0
            room -= Fit.lineDp(metaDp, psiLines)
        }

        // Second verdict line if it wraps and there's room for it.
        if (showHeader && verdictNeeds > 1 && room >= Fit.lineDp(verdictDp)) { verdictLines = 2; room -= Fit.lineDp(verdictDp) }

        // Chart gets whatever is left.
        val chartGap = 6f
        val chartHdp = room - chartGap

        Shell(vPad = vPad, vertical = Alignment.Top) {
            val onSurface = GlanceTheme.colors.onSurface
            val muted = GlanceTheme.colors.onSurfaceVariant
            val nightMode = (ctx.resources.configuration.uiMode and android.content.res.Configuration.UI_MODE_NIGHT_MASK) ==
                android.content.res.Configuration.UI_MODE_NIGHT_YES
            if (showHeader) {
                Row(verticalAlignment = Alignment.CenterVertically, modifier = GlanceModifier.fillMaxWidth()) {
                    // Brand mark; its dot carries the band colour (the label next to the number carries the meaning).
                    Image(
                        provider = ImageProvider(ChartPainter.markBitmap(s.band, nightMode, (markDp * ctx.resources.displayMetrics.density).toInt())),
                        contentDescription = null,
                        modifier = GlanceModifier.width(markDp.dp).height(markDp.dp),
                    )
                    Spacer(GlanceModifier.width(8.dp))
                    DpText(d.insight.verdict.short, verdictDp, onSurface, FontWeight.Bold,
                        maxLines = verdictLines,
                        modifier = GlanceModifier.defaultWeight(),
                    )
                    MockBadge(d, fs)
                }
            }
            Row(
                verticalAlignment = Alignment.CenterVertically,
                modifier = GlanceModifier.fillMaxWidth().semantics {
                    contentDescription = "${d.insight.verdict.short}. ${d.insight.compactAccessibility}"
                },
            ) {
                DpText("●", dotDp, bandProvider(d), maxLines = 1)
                Spacer(GlanceModifier.width(4.dp))
                DpText(d.insight.display, numberDp, onSurface, FontWeight.Bold, maxLines = 1)
                Spacer(GlanceModifier.width(6.dp))
                if (!bandStacked) {
                    // The band word is measured first (no weight), so even if the launcher draws at a larger font
                    // scale than we composed for, the time is what gets squeezed, never the band word.
                    DpText(bandText, bandDp, onSurface, FontWeight.Medium, maxLines = 1)
                    if (timeInline) {
                        DpText(time, metaDp, muted, maxLines = 1, align = TextAlign.End, modifier = GlanceModifier.defaultWeight())
                    } else {
                        Spacer(GlanceModifier.defaultWeight())
                    }
                } else {
                    Spacer(GlanceModifier.defaultWeight())
                }
            }
            if (bandStacked) {
                DpText(bandText, bandDp, onSurface, FontWeight.Medium, maxLines = 1)
            }
            if (showMetaA) {
                DpText(if (psiJoined) joined!! else metaA!!, metaDp, muted,
                    maxLines = 1,
                )
            }
            if (psiLines > 0) {
                DpText(psi, metaDp, muted, maxLines = psiLines)
            }
            if (!showHeader) MockBadge(d, fs)
            if (chartHdp >= 28f) {
                val density = ctx.resources.displayMetrics.density
                val wPx = (w * density).toInt()
                val hPx = (chartHdp * density).toInt()
                val bg = if (nightMode) WIDGET_DARK_BG else WIDGET_LIGHT_BG
                val fg = if (nightMode) 0xFFE6E6E1L else 0xFF1B1C1AL
                val grid = if (nightMode) 0xFF72766FL else 0xFF868A84L
                val bmp = ChartPainter.bitmap(
                    d, wPx, hPx,
                    ChartStyle(bg.toInt(), fg.toInt(), grid.toInt(), fg.toInt(), labels = false, density = density),
                )
                Spacer(GlanceModifier.height(chartGap.dp))
                Image(
                    provider = ImageProvider(bmp),
                    contentDescription = Chart.accessibility(s.history, d.avgLine),
                    modifier = GlanceModifier.fillMaxWidth().height(chartHdp.dp),
                )
            }
        }
    }
}

class SmallWidgetReceiver : GlanceAppWidgetReceiver() {
    override val glanceAppWidget: GlanceAppWidget = SmallWidget()
    override fun onEnabled(context: Context) {
        super.onEnabled(context)
        RefreshWorker.runOnce(context)
    }
}

class MediumWidgetReceiver : GlanceAppWidgetReceiver() {
    override val glanceAppWidget: GlanceAppWidget = MediumWidget()
    override fun onEnabled(context: Context) {
        super.onEnabled(context)
        RefreshWorker.runOnce(context)
    }
}
