package sg.hazenow.widget

import android.content.Context
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
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
import androidx.glance.text.FontWeight
import androidx.glance.text.Text
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

@Composable
private fun MockBadge(d: HazeData) {
    if (d.mock != null) Text("MOCK DATA", style = TextStyle(color = GlanceTheme.colors.error, fontSize = 9.sp, fontWeight = FontWeight.Bold))
}

@Composable
private fun Shell(content: @Composable () -> Unit) {
    Column(
        modifier = GlanceModifier.fillMaxSize()
            .appWidgetBackground()
            .background(GlanceTheme.colors.widgetBackground)
            .cornerRadius(20.dp)
            .clickable(actionStartActivity<MainActivity>())
            .padding(horizontal = 14.dp, vertical = 10.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) { content() }
}

@Composable
private fun Empty() = Shell {
    Text("HazeNow", style = TextStyle(color = GlanceTheme.colors.onSurface, fontWeight = FontWeight.Bold))
    Text("Can't load the air reading", style = TextStyle(color = GlanceTheme.colors.onSurfaceVariant, fontSize = 12.sp))
}

/** Small: `● 105 ▲` + band label. Never colour-only: label is always present. */
class SmallWidget : GlanceAppWidget() {
    override val sizeMode = SizeMode.Exact

    override suspend fun provideGlance(context: Context, id: GlanceId) {
        val (data, place) = loadData(context, id)
        provideContent { GlanceTheme { if (data == null) Empty() else SmallContent(data, place) } }
    }

    @Composable
    private fun SmallContent(d: HazeData, place: String?) = Shell {
        val s = d.snapshot
        val onSurface = GlanceTheme.colors.onSurface
        Row(
            verticalAlignment = Alignment.CenterVertically,
            modifier = GlanceModifier.semantics { contentDescription = d.insight.compactAccessibility },
        ) {
            Text("●", style = TextStyle(color = bandProvider(d), fontSize = 18.sp))
            Spacer(GlanceModifier.width(6.dp))
            Text(d.insight.display, style = TextStyle(color = onSurface, fontSize = 30.sp, fontWeight = FontWeight.Bold))
            Spacer(GlanceModifier.width(4.dp))
            Text(s.trend.direction.arrow, style = TextStyle(color = onSurface, fontSize = 16.sp))
        }
        Text(
            listOfNotNull(bandLabel(d), place).joinToString(" · "),
            style = TextStyle(color = GlanceTheme.colors.onSurfaceVariant, fontSize = 12.sp, fontWeight = FontWeight.Medium),
            maxLines = 1,
        )
        MockBadge(d)
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
    private fun MediumContent(d: HazeData, place: String?) = Shell {
        val s = d.snapshot
        val ctx = LocalContext.current
        val size = LocalSize.current
        val onSurface = GlanceTheme.colors.onSurface
        val muted = GlanceTheme.colors.onSurfaceVariant
        // COPY §16: Short verdict · `105` Elevated ▲ · "4pm · NEA"
        val nightMode = (ctx.resources.configuration.uiMode and android.content.res.Configuration.UI_MODE_NIGHT_MASK) ==
            android.content.res.Configuration.UI_MODE_NIGHT_YES
        Row(verticalAlignment = Alignment.CenterVertically, modifier = GlanceModifier.fillMaxWidth()) {
            // Brand mark; its dot carries the band colour (the label next to the number carries the meaning).
            Image(
                provider = ImageProvider(ChartPainter.markBitmap(s.band, nightMode, (20 * ctx.resources.displayMetrics.density).toInt())),
                contentDescription = null,
                modifier = GlanceModifier.width(20.dp).height(20.dp),
            )
            Spacer(GlanceModifier.width(8.dp))
            Text(
                d.insight.verdict.short,
                style = TextStyle(color = onSurface, fontSize = 15.sp, fontWeight = FontWeight.Bold),
                maxLines = 1,
                modifier = GlanceModifier.defaultWeight(),
            )
            MockBadge(d)
        }
        Row(
            verticalAlignment = Alignment.CenterVertically,
            modifier = GlanceModifier.fillMaxWidth().semantics {
                contentDescription = "${d.insight.verdict.short}. ${d.insight.compactAccessibility}"
            },
        ) {
            Text("●", style = TextStyle(color = bandProvider(d), fontSize = 16.sp))
            Spacer(GlanceModifier.width(4.dp))
            Text(d.insight.display, style = TextStyle(color = onSurface, fontSize = 30.sp, fontWeight = FontWeight.Bold))
            Spacer(GlanceModifier.width(6.dp))
            Text(
                "${bandLabel(d)} ${s.trend.direction.arrow}",
                style = TextStyle(color = onSurface, fontSize = 13.sp, fontWeight = FontWeight.Medium),
                maxLines = 1,
                modifier = GlanceModifier.defaultWeight(),
            )
            Text("${Format.clock(s.observedAt)} · NEA", style = TextStyle(color = muted, fontSize = 11.sp))
        }
        if (size.height.value >= 120f) {
            Text(
                listOfNotNull(place, d.insight.officialPsiLabel).joinToString(" · "),
                style = TextStyle(color = muted, fontSize = 11.sp),
                maxLines = 1,
            )
        }
        val chartHdp = (size.height.value - 104f)
        if (chartHdp >= 28f) {
            val density = ctx.resources.displayMetrics.density
            val wPx = ((size.width.value - 28f) * density).toInt()
            val hPx = (chartHdp * density).toInt()
            val night = (ctx.resources.configuration.uiMode and android.content.res.Configuration.UI_MODE_NIGHT_MASK) ==
                android.content.res.Configuration.UI_MODE_NIGHT_YES
            val bg = if (night) WIDGET_DARK_BG else WIDGET_LIGHT_BG
            val fg = if (night) 0xFFE6E6E1L else 0xFF1B1C1AL
            val grid = if (night) 0xFF72766FL else 0xFF868A84L
            val bmp = ChartPainter.bitmap(
                d, wPx, hPx,
                ChartStyle(bg.toInt(), fg.toInt(), grid.toInt(), fg.toInt(), labels = false, density = density),
            )
            Spacer(GlanceModifier.height(6.dp))
            Image(
                provider = ImageProvider(bmp),
                contentDescription = Chart.accessibility(s.history, d.avgLine),
                modifier = GlanceModifier.fillMaxWidth().height(chartHdp.dp),
            )
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
