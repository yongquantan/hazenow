package sg.hazenow.render

import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.DashPathEffect
import android.graphics.Paint
import android.graphics.Path
import android.graphics.RectF
import android.graphics.Typeface
import sg.hazenow.core.Band
import sg.hazenow.core.Chart
import sg.hazenow.core.Contrast
import sg.hazenow.core.Format
import sg.hazenow.core.HazeCore
import sg.hazenow.core.HistoryPoint
import sg.hazenow.data.HazeData
import kotlin.math.max

data class ChartStyle(
    /** Background the chart sits on; band colours are contrast-adjusted against it (≥3:1). */
    val background: Int,
    val line: Int,
    val grid: Int,
    val text: Int,
    val labels: Boolean = true,
    val density: Float = 1f,
)

/**
 * "Last 24 hours" (COPY §8, SPEC v1.2 §2): hourly 1-hr PM2.5 bars coloured by NEA band, with NEA's 24-hr
 * average PM2.5 as a line — one unit (µg/m³), so the lag is visible without inventing an index.
 * Dashed band guides at 56 and 151. One renderer (android.graphics) is shared by the Compose screen
 * (via nativeCanvas), the medium widget bitmap and the share image.
 */
object ChartPainter {

    /** Band colour adjusted to ≥[target] contrast against [bg]. */
    fun bandColor(b: Band, bg: Int, target: Double = Contrast.ICON): Int =
        Contrast.ensure(b.argb, bg.toLong() and 0xFFFFFFFFL, target).toInt()

    /**
     * @param guides dashed guides (value to label); SG's are NEA's 56 / 151. Other countries pass none: NEA's bands
     *   never describe another country's air (SPEC v2.0 §5).
     * @param barColor bar colour per value; SG colours by NEA band. Other countries use one neutral colour.
     * @param clock time label for an ISO hour (SG time by default; station-local time elsewhere).
     */
    fun draw(
        c: Canvas, width: Float, height: Float, bars: List<HistoryPoint>, line: List<HistoryPoint>, s: ChartStyle,
        guides: List<Pair<Int, String>> = listOf(56 to Chart.GUIDE_ELEVATED, 151 to Chart.GUIDE_HIGH),
        barColor: ((Int) -> Int)? = null,
        minScale: Int = 170,
        clock: (String) -> String = Format::clock,
    ) {
        if (bars.isEmpty()) return
        val d = s.density
        val textPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply { color = s.text; textSize = 10.5f * d }
        val guideLabelW = if (s.labels && guides.isNotEmpty()) guides.maxOf { textPaint.measureText(it.second) } + 6f * d else 0f
        val left = 2f * d
        val bottom = height - if (s.labels) 16f * d else 2f * d
        val top = if (s.labels) 8f * d else 2f * d
        val right = width - 2f * d - guideLabelW
        val plotH = bottom - top

        val maxV = max(minScale, max(bars.maxOf { it.pm25 }, line.maxOfOrNull { it.pm25 } ?: 0))
        val yMax = maxV * 1.1f
        fun y(v: Int) = bottom - plotH * (v / yMax)

        // Dashed band guides, labelled at the right.
        val guide = Paint(Paint.ANTI_ALIAS_FLAG).apply {
            color = s.grid; strokeWidth = 1.2f * d; style = Paint.Style.STROKE
            pathEffect = DashPathEffect(floatArrayOf(5f * d, 4f * d), 0f)
        }
        for ((v, label) in guides) {
            val gy = y(v)
            c.drawLine(left, gy, right, gy, guide)
            if (s.labels) c.drawText(label, right + 4f * d, gy + 3.5f * d, textPaint)
        }

        val n = bars.size
        val slot = (right - left) / n
        val gap = (slot * 0.18f).coerceAtMost(4f * d)
        val barPaint = Paint(Paint.ANTI_ALIAS_FLAG)
        val r = (2.5f * d).coerceAtMost(slot / 3)
        bars.forEachIndexed { i, p ->
            barPaint.color = barColor?.invoke(p.pm25) ?: bandColor(HazeCore.band(p.pm25), s.background)
            barPaint.alpha = if (i == n - 1) 255 else 190
            val x0 = left + i * slot + gap / 2
            val x1 = left + (i + 1) * slot - gap / 2
            val rect = RectF(x0, y(p.pm25), x1, bottom)
            c.drawRoundRect(rect, r, r, barPaint)
            if (rect.height() > 2 * r) c.drawRect(x0, rect.top + r, x1, bottom, barPaint)
        }

        // NEA 24-hr average PM2.5 line, aligned to bar slots by timestamp.
        val slotOf = bars.mapIndexed { i, p -> HazeCore.parseInstant(p.time) to i }.toMap()
        val pts = line.mapNotNull { p ->
            val i = slotOf[HazeCore.parseInstant(p.time)] ?: return@mapNotNull null
            (left + (i + 0.5f) * slot) to y(p.pm25)
        }
        val linePaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
            color = s.line; style = Paint.Style.STROKE; strokeWidth = 2.5f * d
            strokeCap = Paint.Cap.ROUND; strokeJoin = Paint.Join.ROUND
        }
        if (pts.size >= 2) {
            val path = Path()
            pts.forEachIndexed { i, (x, yy) -> if (i == 0) path.moveTo(x, yy) else path.lineTo(x, yy) }
            c.drawPath(path, Paint(linePaint).apply { color = s.background; strokeWidth = 5.5f * d })
            c.drawPath(path, linePaint)
        }
        pts.lastOrNull()?.let { (x, yy) ->
            c.drawCircle(x, yy, 3.5f * d, Paint(Paint.ANTI_ALIAS_FLAG).apply { color = s.line })
        }

        if (s.labels) {
            for (i in listOf(0, n / 2, n - 1).distinct()) {
                val label = clock(bars[i].time)
                val w = textPaint.measureText(label)
                val cx = (left + (i + 0.5f) * slot - w / 2).coerceIn(left, right - w)
                c.drawText(label, cx, height - 3f * d, textPaint)
            }
        }
    }

    fun bitmap(data: HazeData, widthPx: Int, heightPx: Int, s: ChartStyle): Bitmap {
        val bmp = Bitmap.createBitmap(widthPx.coerceAtLeast(1), heightPx.coerceAtLeast(1), Bitmap.Config.ARGB_8888)
        draw(Canvas(bmp), widthPx.toFloat(), heightPx.toFloat(), data.snapshot.history, data.avgLine, s)
        return bmp
    }

    /**
     * Brand mark (brand/svg/mark-*.svg, viewBox 100) for live surfaces: the dot takes the NEA band colour,
     * the three haze lines never change. On dark backgrounds Very High uses #B06BC4 (brand README).
     */
    fun markBitmap(band: Band, dark: Boolean, sizePx: Int): Bitmap {
        val bmp = Bitmap.createBitmap(sizePx, sizePx, Bitmap.Config.ARGB_8888)
        val c = Canvas(bmp)
        val k = sizePx / 100f
        val dot = if (dark && band == Band.VERY_HIGH) 0xFFB06BC4.toInt() else band.argb.toInt()
        val line = if (dark) 0xFF9FB3BB.toInt() else 0xFF14232B.toInt()
        c.drawCircle(50 * k, 38 * k, 17 * k, Paint(Paint.ANTI_ALIAS_FLAG).apply { color = dot })
        val p = Paint(Paint.ANTI_ALIAS_FLAG).apply { color = line }
        for ((rect, a) in listOf(RectF(17f, 61f, 83f, 68.5f) to 255, RectF(27f, 73.5f, 73f, 81f) to 178, RectF(38f, 86f, 62f, 93.5f) to 115)) {
            p.alpha = a
            c.drawRoundRect(RectF(rect.left * k, rect.top * k, rect.right * k, rect.bottom * k), 3.75f * k, 3.75f * k, p)
        }
        return bmp
    }

    /** White-on-transparent number for the status bar / QS tile icon. */
    fun numberIcon(text: String, sizePx: Int = 96): Bitmap {
        val bmp = Bitmap.createBitmap(sizePx, sizePx, Bitmap.Config.ARGB_8888)
        val c = Canvas(bmp)
        val p = Paint(Paint.ANTI_ALIAS_FLAG).apply {
            color = Color.WHITE
            typeface = Typeface.create("sans-serif-condensed", Typeface.BOLD)
            textAlign = Paint.Align.CENTER
            textSize = sizePx * 0.8f
        }
        while (p.measureText(text) > sizePx * 0.98f && p.textSize > 8) p.textSize -= 2
        val fm = p.fontMetrics
        c.drawText(text, sizePx / 2f, sizePx / 2f - (fm.ascent + fm.descent) / 2, p)
        return bmp
    }
}
