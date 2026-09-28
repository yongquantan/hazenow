package sg.hazenow.render

import android.content.Context
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.DashPathEffect
import android.graphics.Paint
import android.graphics.Path
import android.graphics.RectF
import android.graphics.Typeface
import android.text.Layout
import android.text.StaticLayout
import android.text.TextPaint
import androidx.core.content.res.ResourcesCompat
import sg.hazenow.R
import sg.hazenow.core.Band
import sg.hazenow.core.Profile
import sg.hazenow.core.ShareCard
import sg.hazenow.core.ShareCardContent
import sg.hazenow.core.ShareCards
import sg.hazenow.core.ShareContext
import sg.hazenow.core.Snapshot
import sg.hazenow.core.TrendDirection
import kotlin.math.max
import kotlin.math.min

/** Inputs for one share session: the snapshot plus the words' context (place, point, profile). */
data class ShareCardData(
    val snapshot: Snapshot,
    val profiles: Set<Profile>,
    val context: ShareContext,
    /** NEA 24-hr average PM2.5 at your spot (µg/m³), latest. */
    val avg24h: Int?,
) {
    fun content(card: String): ShareCardContent = ShareCards.shareCardContent(card, snapshot, profiles, context, avg24h)
}

/**
 * Renders the SPEC v1.6 cards at exact pixel sizes (1080×1350, link preview 1200×630), independent of screen
 * density, with Apfel Grotezk. Layout mirrors the HTML designs in docs/share-cards (CSS px == bitmap px).
 */
class ShareCardRenderer(context: Context) {
    private val regular: Typeface = ResourcesCompat.getFont(context, R.font.apfel_grotezk_regular) ?: Typeface.DEFAULT
    private val medium: Typeface = ResourcesCompat.getFont(context, R.font.apfel_grotezk_mittel) ?: Typeface.DEFAULT
    private val bold: Typeface = ResourcesCompat.getFont(context, R.font.apfel_grotezk_fett) ?: Typeface.DEFAULT_BOLD

    companion object {
        const val W = 1080
        const val H = 1350
        const val OG_W = 1200
        const val OG_H = 630
        private const val INK = 0xFF14232B.toInt()
        private const val IVORY = 0xFFF5F0E6.toInt()
        private const val MIST = 0xFF9FB3BB.toInt()
        private const val SLATE = 0xFF3D4F57.toInt()
        private const val PAD_X = 84f
        private const val PAD_TOP = 80f
        private const val PAD_BOTTOM = 72f

        /** Band colour for the mark / dots; Very High is lightened on dark backgrounds (brand README). */
        fun dotColor(band: Band, dark: Boolean): Int =
            if (dark && band == Band.VERY_HIGH) 0xFFB06BC4.toInt() else band.argb.toInt()
    }

    fun render(card: ShareCard, d: ShareCardData): Bitmap = when (card) {
        ShareCard.NOW -> now(d.content("now") as ShareCardContent.Now, d.snapshot)
        ShareCard.TWO_CLOCKS -> twoClocks(d.content("clocks") as ShareCardContent.Clocks)
        ShareCard.GROUP -> group(d.content("group") as ShareCardContent.Group)
        ShareCard.ALL_CLEAR -> allClear(d.content("clear") as ShareCardContent.Clear)
    }

    fun linkPreview(d: ShareCardData): Bitmap = linkPreview(d.content("preview") as ShareCardContent.Preview)

    // ---------------------------------------------------------------- text helpers

    private enum class Weight { REGULAR, MEDIUM, BOLD }

    private fun tf(w: Weight) = when (w) { Weight.REGULAR -> regular; Weight.MEDIUM -> medium; Weight.BOLD -> bold }

    private fun paint(size: Float, w: Weight, color: Int, trackingEm: Float = 0f) = TextPaint(Paint.ANTI_ALIAS_FLAG).apply {
        textSize = size
        typeface = tf(w)
        this.color = color
        letterSpacing = trackingEm
        isSubpixelText = true
    }

    /** A wrapped text block with a CSS-like line-height (multiple of font size). */
    private fun block(
        text: CharSequence,
        p: TextPaint,
        width: Int,
        lineHeight: Float = 1.2f,
        align: Layout.Alignment = Layout.Alignment.ALIGN_NORMAL,
    ): StaticLayout {
        val natural = p.fontMetrics.let { it.descent - it.ascent }
        val mult = (p.textSize * lineHeight) / natural
        return StaticLayout.Builder.obtain(text, 0, text.length, p, max(1, width))
            .setAlignment(align)
            .setIncludePad(false)
            .setLineSpacing(0f, mult)
            .setBreakStrategy(Layout.BREAK_STRATEGY_BALANCED)
            .build()
    }

    /** Height of a layout, trimming the extra spacing StaticLayout adds after the last line. */
    private fun h(l: StaticLayout): Float {
        if (l.lineCount == 0) return 0f
        val last = l.lineCount - 1
        return (l.getLineBottom(last) - (l.getLineBottom(last) - l.getLineDescent(last) - l.getLineBaseline(last)).coerceAtLeast(0)).toFloat()
    }

    private fun draw(c: Canvas, l: StaticLayout, x: Float, y: Float) {
        c.save(); c.translate(x, y); l.draw(c); c.restore()
    }

    /**
     * Shrink-to-fit a headline: start at [start] px and step down until no single word is wider than the
     * box, it fits in [maxLines] and within [maxHeight]. Never clips (SPEC v1.6 quality rule).
     */
    private fun fit(
        text: String,
        w: Weight,
        color: Int,
        width: Int,
        start: Float,
        min: Float,
        lineHeight: Float,
        trackingEm: Float,
        maxLines: Int,
        maxHeight: Float = Float.MAX_VALUE,
    ): StaticLayout {
        var size = start
        while (true) {
            val p = paint(size, w, color, trackingEm)
            val wordsFit = text.split(' ', '\n').all { p.measureText(it) <= width }
            val l = block(text, p, width, lineHeight)
            if ((wordsFit && l.lineCount <= maxLines && h(l) <= maxHeight) || size <= min) return l
            size -= 2f
        }
    }

    // ---------------------------------------------------------------- shape helpers

    private fun mark(c: Canvas, x: Float, y: Float, size: Float, dot: Int, line: Int) {
        val k = size / 100f
        val p = Paint(Paint.ANTI_ALIAS_FLAG)
        p.color = dot
        c.drawCircle(x + 50 * k, y + 38 * k, 17 * k, p)
        p.color = line
        for ((r, a) in listOf(floatArrayOf(17f, 61f, 83f, 68.5f) to 255, floatArrayOf(27f, 73.5f, 73f, 81f) to 178, floatArrayOf(38f, 86f, 62f, 93.5f) to 115)) {
            p.alpha = a
            c.drawRoundRect(RectF(x + r[0] * k, y + r[1] * k, x + r[2] * k, y + r[3] * k), 3.75f * k, 3.75f * k, p)
        }
    }

    private fun dot(c: Canvas, cx: Float, cy: Float, diameter: Float, color: Int) {
        c.drawCircle(cx, cy, diameter / 2, Paint(Paint.ANTI_ALIAS_FLAG).apply { this.color = color })
    }

    /** Vector trend triangle (Apfel has no ▲▼ glyphs). */
    private fun arrow(c: Canvas, x: Float, cy: Float, size: Float, dir: TrendDirection, color: Int) {
        val p = Path()
        when (dir) {
            TrendDirection.UP -> { p.moveTo(x + size / 2, cy - size * 0.42f); p.lineTo(x + size, cy + size * 0.42f); p.lineTo(x, cy + size * 0.42f) }
            TrendDirection.DOWN -> { p.moveTo(x, cy - size * 0.42f); p.lineTo(x + size, cy - size * 0.42f); p.lineTo(x + size / 2, cy + size * 0.42f) }
            TrendDirection.STEADY -> { p.moveTo(x + size * 0.1f, cy - size / 2); p.lineTo(x + size * 0.9f, cy); p.lineTo(x + size * 0.1f, cy + size / 2) }
        }
        p.close()
        c.drawPath(p, Paint(Paint.ANTI_ALIAS_FLAG).apply { this.color = color })
    }

    private fun hLine(c: Canvas, x0: Float, x1: Float, y: Float, width: Float, color: Int) {
        c.drawRect(x0, y, x1, y + width, Paint().apply { this.color = color })
    }

    /** A vertical section with a known height and a draw function taking its top y. */
    private class Section(val height: Float, val draw: (Float) -> Unit)

    /** CSS `justify-content: space-between` for a column of sections between [top] and [bottom]. */
    private fun spaceBetween(sections: List<Section>, top: Float, bottom: Float) {
        val total = sections.sumOf { it.height.toDouble() }.toFloat()
        val gap = if (sections.size > 1) max(0f, (bottom - top - total) / (sections.size - 1)) else 0f
        var y = top
        for (s in sections) { s.draw(y); y += s.height + gap }
    }

    /** Stack of sub-blocks with a fixed gap (CSS flex column + gap). */
    private fun stack(parts: List<Section>, gap: Float): Section {
        val height = parts.sumOf { it.height.toDouble() }.toFloat() + gap * max(0, parts.size - 1)
        return Section(height) { top ->
            var y = top
            for (p in parts) { p.draw(y); y += p.height + gap }
        }
    }

    private fun text(c: Canvas, l: StaticLayout, x: Float) = Section(h(l)) { y -> draw(c, l, x, y) }

    private fun header(c: Canvas, band: Band, dark: Boolean, right: String, rightColor: Int, rightWeight: Weight): Section {
        val fg = if (dark) IVORY else INK
        val brand = paint(34f, Weight.BOLD, fg, -0.02f)
        val rp = paint(30f, rightWeight, rightColor)
        return Section(52f) { y ->
            mark(c, PAD_X, y, 52f, dotColor(band, dark), if (dark) MIST else INK)
            val fm = brand.fontMetrics
            c.drawText("HazeNow", PAD_X + 52 + 14, y + 26 - (fm.ascent + fm.descent) / 2, brand)
            val rfm = rp.fontMetrics
            c.drawText(right, W - PAD_X - rp.measureText(right), y + 26 - (rfm.ascent + rfm.descent) / 2, rp)
        }
    }

    private fun footer(c: Canvas, left: CharSequence, right: CharSequence, border: Int, color: Int, width: Float = W - 2 * PAD_X): Section {
        val p = paint(24f, Weight.REGULAR, color)
        val half = (width / 2 - 12).toInt()
        val l = block(left, p, (width * 0.62f).toInt(), 1.45f)
        val r = block(right, p, half, 1.45f, Layout.Alignment.ALIGN_OPPOSITE)
        val height = 2 + 28 + max(h(l), h(r))
        return Section(height) { y ->
            hLine(c, PAD_X, PAD_X + width, y, 2f, border)
            val top = y + 30
            draw(c, l, PAD_X, top + max(0f, h(r) - h(l)))
            draw(c, r, PAD_X + width - half, top + max(0f, h(l) - h(r)))
        }
    }

    private fun credit() = "Free and open source\nMade by ${ShareCards.CREDIT}"

    private fun canvas(w: Int = W, h: Int = H, bg: Int): Pair<Bitmap, Canvas> {
        val bmp = Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888)
        bmp.density = Bitmap.DENSITY_NONE
        val c = Canvas(bmp)
        c.drawColor(bg)
        return bmp to c
    }

    // ---------------------------------------------------------------- 1 · Now card

    fun now(k: ShareCardContent.Now, s: Snapshot): Bitmap {
        val (bmp, c) = canvas(bg = 0xFFF3F1EC.toInt())
        val cw = (W - 2 * PAD_X).toInt()

        val hook = block(k.hook, paint(34f, Weight.MEDIUM, SLATE), cw, 1.2f)
        val headline = fit(k.headline, Weight.MEDIUM, INK, cw, 132f, 72f, 0.95f, -0.045f, maxLines = 2)
        val num = paint(88f, Weight.BOLD, INK, -0.04f)
        val numW = num.measureText(s.pm25.toString())
        val capW = (cw - 28 - 20 - numW - 20).toInt()
        val cap = block(k.pmDetail, paint(32f, Weight.REGULAR, SLATE), capW, 1.2f)
        val numRowH = max(88f * 1.0f, h(cap))
        val numRow = Section(numRowH) { y ->
            val base = y + numRowH / 2
            dot(c, PAD_X + 14, base, 28f, s.band.argb.toInt())
            val fm = num.fontMetrics
            val baseline = base - (fm.ascent + fm.descent) / 2
            c.drawText(s.pm25.toString(), PAD_X + 28 + 20, baseline, num)
            draw(c, cap, PAD_X + 28 + 20 + numW + 20, base - h(cap) / 2 + 4)
        }
        val middle = stack(listOf(text(c, hook, PAD_X), text(c, headline, PAD_X), numRow), 28f)

        // NEA advice box.
        val boxInnerW = cw - 88
        val title = block(k.adviceLabel.uppercase(), paint(24f, Weight.BOLD, 0xFF4A5C64.toInt(), 0.08f), boxInnerW, 1.2f)
        fun pair(label: String, value: String): Section {
            val a = block(label, paint(28f, Weight.REGULAR, SLATE), boxInnerW, 1.2f)
            val b = block(value, paint(40f, Weight.MEDIUM, INK, -0.01f), boxInnerW, 1.2f)
            return stack(listOf(text(c, a, PAD_X + 44), text(c, b, PAD_X + 44)), 6f)
        }
        val inner = stack(listOf(text(c, title, PAD_X + 44), pair("Most people", k.adviceMost), pair("Elderly, children, pregnant, heart or lung conditions", k.adviceVulnerable)), 24f)
        val box = Section(inner.height + 80) { y ->
            val r = RectF(PAD_X + 1, y + 1, W - PAD_X - 1, y + inner.height + 80 - 1)
            c.drawRoundRect(r, 28f, 28f, Paint(Paint.ANTI_ALIAS_FLAG).apply { color = 0xFFFFFFFF.toInt() })
            c.drawRoundRect(r, 28f, 28f, Paint(Paint.ANTI_ALIAS_FLAG).apply { color = 0xFFE2DDD2.toInt(); style = Paint.Style.STROKE; strokeWidth = 2f })
            inner.draw(y + 40)
        }

        val explain = block(k.psiLine, paint(30f, Weight.REGULAR, 0xFF24363E.toInt()), cw, 1.4f)
        val foot = footer(c, "Data: NEA via data.gov.sg\n${k.station}", credit(), 0xFFD9D4C9.toInt(), SLATE)

        spaceBetween(
            listOf(header(c, s.band, false, ShareCards.SITE, INK, Weight.MEDIUM), middle, box, text(c, explain, PAD_X), foot),
            PAD_TOP, H - PAD_BOTTOM,
        )
        return bmp
    }

    // ---------------------------------------------------------------- 2 · Two clocks

    fun twoClocks(k: ShareCardContent.Clocks): Bitmap {
        val (bmp, c) = canvas(bg = INK)
        val cw = (W - 2 * PAD_X).toInt()
        val placeLine = "${k.place} · ${k.`when`}"
        val hp = paint(30f, Weight.REGULAR, 0xFFC9D5DA.toInt())
        // Fresh: place/time sits right of the wordmark (as designed). Stale: the long "reading from …
        // (latest available)" line gets its own row under the header, and the headline and chart shrink a
        // little so the card keeps normal spacing (parity with Apple).
        val headerRight = if (k.stale) "" else placeLine
        while (hp.measureText(headerRight) > cw - 52 - 14 - 190 && hp.textSize > 20) hp.textSize -= 1
        val header = Section(52f) { y ->
            mark(c, PAD_X, y, 52f, dotColor(k.band, true), MIST)
            val brand = paint(34f, Weight.BOLD, IVORY, -0.02f)
            val fm = brand.fontMetrics
            c.drawText("HazeNow", PAD_X + 66, y + 26 - (fm.ascent + fm.descent) / 2, brand)
            if (headerRight.isNotEmpty()) {
                val rfm = hp.fontMetrics
                c.drawText(headerRight, W - PAD_X - hp.measureText(headerRight), y + 26 - (rfm.ascent + rfm.descent) / 2, hp)
            }
        }
        val staleRow = if (k.stale) block(placeLine, paint(30f, Weight.MEDIUM, 0xFFC9D5DA.toInt()), cw, 1.25f) else null
        val h1 = fit(
            "${k.headlineLines.first}\n${k.headlineLines.second}", Weight.MEDIUM, IVORY, cw,
            if (k.stale) 96f else 112f, 72f, 0.95f, -0.045f, maxLines = 2,
        )

        // Two boxes.
        val colW = (cw - 28) / 2f
        val innerW = (colW - 80).toInt()
        fun bigNumber(v: String, color: Int): StaticLayout =
            fit(v, Weight.BOLD, color, innerW, 144f, 90f, 0.9f, -0.05f, maxLines = 1)
        val lTitle = block(k.lastHourLabel, paint(28f, Weight.MEDIUM, INK), innerW)
        val lNum = bigNumber(k.pm25.toString(), INK)
        val lUnit = block("µg/m³ PM2.5", paint(26f, Weight.REGULAR, SLATE), innerW)
        val bandP = paint(30f, Weight.BOLD, INK)
        val rTitle = block("The last 24 hours", paint(28f, Weight.MEDIUM, 0xFFC9D5DA.toInt()), innerW)
        val rNum = bigNumber(k.avg?.toString() ?: "—", 0xFFC9D5DA.toInt())
        val rUnit = block("µg/m³ PM2.5, averaged", paint(26f, Weight.REGULAR, MIST), innerW)
        val rPsi = block("24-hr PSI ${k.psi ?: "—"}", paint(30f, Weight.BOLD, IVORY), innerW)
        val bandRowH = 32f
        val leftH = h(lTitle) + h(lNum) + h(lUnit) + bandRowH + 6 + 30
        val rightH = h(rTitle) + h(rNum) + h(rUnit) + h(rPsi) + 6 + 30
        val boxH = max(leftH, rightH) + 80
        val boxes = Section(boxH) { y ->
            val lr = RectF(PAD_X, y, PAD_X + colW, y + boxH)
            c.drawRoundRect(lr, 28f, 28f, Paint(Paint.ANTI_ALIAS_FLAG).apply { color = IVORY })
            var yy = y + 40
            draw(c, lTitle, PAD_X + 40, yy); yy += h(lTitle) + 10
            draw(c, lNum, PAD_X + 40, yy); yy += h(lNum) + 10
            draw(c, lUnit, PAD_X + 40, yy); yy += h(lUnit) + 16
            dot(c, PAD_X + 40 + 9, yy + bandRowH / 2, 18f, k.band.argb.toInt())
            val fm = bandP.fontMetrics
            c.drawText(k.band.label, PAD_X + 40 + 28, yy + bandRowH / 2 - (fm.ascent + fm.descent) / 2, bandP)

            val rx = PAD_X + colW + 28
            val rr = RectF(rx + 1, y + 1, rx + colW - 1, y + boxH - 1)
            c.drawRoundRect(rr, 28f, 28f, Paint(Paint.ANTI_ALIAS_FLAG).apply { color = 0xFF3A5260.toInt(); style = Paint.Style.STROKE; strokeWidth = 2f })
            yy = y + 40
            draw(c, rTitle, rx + 40, yy); yy += h(rTitle) + 10
            draw(c, rNum, rx + 40, yy); yy += h(rNum) + 10
            draw(c, rUnit, rx + 40, yy); yy += h(rUnit) + 16
            draw(c, rPsi, rx + 40, yy)
        }

        // Chart: last 24 hourly bars, dashed 24-hr average.
        val bars = k.bars
        val avg = k.avg
        val labelP = paint(22f, Weight.BOLD, IVORY)
        val axisP = paint(22f, Weight.REGULAR, MIST)
        val nowP = paint(22f, Weight.BOLD, IVORY)
        val chartH = if (k.stale) 190f else 230f
        val chart = Section(chartH + 14 + 30) { y ->
            val bottom = y + chartH
            val maxV = max(bars.maxOrNull() ?: 1, avg ?: 0).coerceAtLeast(1)
            val n = max(1, bars.size)
            val gap = 8f
            val bw = (cw - gap * (n - 1)) / n
            bars.forEachIndexed { i, b ->
                val bh = max(4f, b / maxV.toFloat() * (chartH - 10f))
                val x0 = PAD_X + i * (bw + gap)
                val color = if (i == bars.size - 1) k.band.argb.toInt() else 0xFF4E6874.toInt()
                val p = Paint(Paint.ANTI_ALIAS_FLAG).apply { this.color = color }
                c.drawRoundRect(RectF(x0, bottom - bh, x0 + bw, bottom), 5f, 5f, p)
                if (bh > 10) c.drawRect(x0, bottom - bh + 5, x0 + bw, bottom, p)
            }
            hLine(c, PAD_X, W - PAD_X, bottom, 3f, MIST)
            if (avg != null) {
                val ay = bottom - avg / maxV.toFloat() * (chartH - 10f)
                val dash = Paint(Paint.ANTI_ALIAS_FLAG).apply {
                    color = IVORY; strokeWidth = 4f; style = Paint.Style.STROKE
                    pathEffect = DashPathEffect(floatArrayOf(12f, 10f), 0f)
                }
                c.drawLine(PAD_X, ay, W - PAD_X, ay, dash)
                val label = "24-hr average"
                val lw = labelP.measureText(label)
                val fm = labelP.fontMetrics
                val ly = max(y + 4, ay - 12 - (fm.descent - fm.ascent))
                c.drawRect(PAD_X, ly, PAD_X + lw + 8, ly + (fm.descent - fm.ascent) + 4, Paint().apply { color = INK })
                c.drawText(label, PAD_X, ly + 2 - fm.ascent, labelP)
            }
            val fm = axisP.fontMetrics
            val by = bottom + 14 - fm.ascent
            c.drawText("24 hours ago", PAD_X, by, axisP)
            c.drawText(k.endLabel, W - PAD_X - nowP.measureText(k.endLabel), by, nowP)
        }

        val line = block(k.caption, paint(30f, Weight.REGULAR, 0xFFD5DEE1.toInt()), cw, 1.4f)
        val left = android.text.SpannableStringBuilder().apply {
            append(ShareCards.SITE)
            setSpan(android.text.style.AbsoluteSizeSpan(30), 0, length, 0)
            setSpan(android.text.style.ForegroundColorSpan(IVORY), 0, length, 0)
            setSpan(TypefaceSpanCompat(bold), 0, length, 0)
            append("\nData: NEA via data.gov.sg")
        }
        val foot = footer(c, left, credit(), 0xFF2E4550.toInt(), 0xFFC9D5DA.toInt())
        val top = if (staleRow != null) stack(listOf(header, text(c, staleRow, PAD_X)), 20f) else header
        spaceBetween(listOf(top, text(c, h1, PAD_X), boxes, chart, text(c, line, PAD_X), foot), PAD_TOP, H - PAD_BOTTOM)
        return bmp
    }

    // ---------------------------------------------------------------- 3 · For our group

    fun group(k: ShareCardContent.Group): Bitmap {
        val (bmp, c) = canvas(bg = IVORY)
        val cw = (W - 2 * PAD_X).toInt()

        val pillP = paint(30f, Weight.BOLD, IVORY)
        while (pillP.measureText(k.chip) > cw - 56 && pillP.textSize > 20) pillP.textSize -= 1
        val pillH = (pillP.fontMetrics.let { it.descent - it.ascent }) + 24
        val pill = Section(pillH) { y ->
            val w = pillP.measureText(k.chip) + 56
            c.drawRoundRect(RectF(PAD_X, y, PAD_X + w, y + pillH), pillH / 2, pillH / 2, Paint(Paint.ANTI_ALIAS_FLAG).apply { color = INK })
            c.drawText(k.chip, PAD_X + 28, y + 12 - pillP.fontMetrics.ascent, pillP)
        }
        val sub = block("${k.place} · ${k.`when`}", paint(32f, Weight.MEDIUM, SLATE), cw)
        val h1 = fit(k.headline, Weight.MEDIUM, INK, cw, 136f, 72f, 0.95f, -0.045f, maxLines = 3)
        val rowText = android.text.SpannableStringBuilder().apply {
            append("PM2.5 ${k.pm25}")
            setSpan(TypefaceSpanCompat(bold), 0, length, 0)
            val st = length
            append("  ${k.statsRest}")
            setSpan(android.text.style.ForegroundColorSpan(SLATE), st, length, 0)
            setSpan(TypefaceSpanCompat(regular), st, length, 0)
        }
        val row = block(rowText, paint(34f, Weight.BOLD, INK), cw - 40, 1.25f)
        val rowSec = Section(max(h(row), 34f)) { y ->
            dot(c, PAD_X + 12, y + 34f * 0.62f, 24f, k.band.argb.toInt())
            draw(c, row, PAD_X + 40, y)
        }
        val middle = stack(listOf(pill, text(c, sub, PAD_X), text(c, h1, PAD_X), rowSec), 28f)

        val numP = paint(36f, Weight.BOLD, MIST)
        val itemP = paint(36f, Weight.REGULAR, INK)
        val list = k.actions.mapIndexed { i, t ->
            val l = block(t, itemP, cw - 50, 1.3f)
            Section(h(l)) { y ->
                c.drawText("${i + 1}", PAD_X, y - itemP.fontMetrics.ascent + 2, numP)
                draw(c, l, PAD_X + 50, y)
            }
        }
        val listStack = stack(list, 18f)
        val listSec = Section(2 + 32 + listStack.height) { y ->
            hLine(c, PAD_X, W - PAD_X, y, 2f, 0xFFD9D4C9.toInt())
            listStack.draw(y + 34)
        }
        val foot = footer(c, "Based on NEA’s 1-hr PM2.5 advice\nData: NEA via data.gov.sg · ${k.station}", credit(), 0xFFD9D4C9.toInt(), SLATE)
        spaceBetween(listOf(header(c, k.band, false, ShareCards.SITE, INK, Weight.MEDIUM), middle, listSec, foot), PAD_TOP, H - PAD_BOTTOM)
        return bmp
    }

    // ---------------------------------------------------------------- 4 · All clear

    fun allClear(k: ShareCardContent.Clear): Bitmap {
        val (bmp, c) = canvas(bg = 0xFFEEF3EC.toInt())
        val cw = (W - 2 * PAD_X).toInt()
        val green = Band.NORMAL.argb.toInt()
        val circle = Section(160f) { y -> dot(c, PAD_X + 80, y + 80, 160f, green) }
        val sub = block("${k.place} · ${k.`when`}", paint(34f, Weight.MEDIUM, SLATE), cw)
        val h1 = fit(k.headline, Weight.MEDIUM, INK, cw, 150f, 80f, 0.92f, -0.05f, maxLines = 2)
        val body = block("${k.bodyLines.first}\n${k.bodyLines.second}", paint(40f, Weight.REGULAR, 0xFF24363E.toInt()), cw, 1.3f)
        val middle = stack(listOf(circle, text(c, sub, PAD_X), text(c, h1, PAD_X), text(c, body, PAD_X)), 32f)
        val parts = buildList {
            if (k.stats.isNotEmpty()) add(text(c, block(k.stats, paint(28f, Weight.REGULAR, SLATE), cw), PAD_X))
            add(footer(c, "Data: NEA via data.gov.sg", credit(), 0xFFC9D6C8.toInt(), SLATE))
        }
        spaceBetween(listOf(header(c, Band.NORMAL, false, ShareCards.SITE, INK, Weight.MEDIUM), middle, stack(parts, 24f)), PAD_TOP, H - PAD_BOTTOM)
        return bmp
    }

    // ---------------------------------------------------------------- 6 · Link preview (1200×630)

    fun linkPreview(k: ShareCardContent.Preview): Bitmap {
        val (bmp, c) = canvas(OG_W, OG_H, 0xFFF3F1EC.toInt())
        val padX = 68f
        val padY = 60f
        val panelW = 360f
        val leftW = (OG_W - 2 * padX - 52 - panelW).toInt()
        val brand = paint(26f, Weight.BOLD, INK, -0.01f)
        mark(c, padX, padY, 40f, k.band.argb.toInt(), INK)
        c.drawText("HazeNow", padX + 52, padY + 20 - (brand.fontMetrics.ascent + brand.fontMetrics.descent) / 2, brand)
        val foot = block(
            "Data: NEA via data.gov.sg · Free and open source · Made by ${k.credit} · ${ShareCards.SITE}",
            paint(22f, Weight.REGULAR, SLATE), leftW, 1.35f,
        )
        draw(c, foot, padX, OG_H - padY - h(foot))
        val hook = block(k.hook, paint(26f, Weight.MEDIUM, SLATE), leftW)
        val midTop = padY + 40 + 24
        val midBottom = OG_H - padY - h(foot) - 24
        val h1 = fit(k.headline, Weight.MEDIUM, INK, leftW, 84f, 48f, 0.95f, -0.045f, maxLines = 3, maxHeight = midBottom - midTop - h(hook) - 16)
        val blockH = h(hook) + 16 + h(h1)
        val my = midTop + (midBottom - midTop - blockH) / 2
        draw(c, hook, padX, my)
        draw(c, h1, padX, my + h(hook) + 16)

        val px = OG_W - padX - panelW
        c.drawRoundRect(RectF(px, padY, px + panelW, OG_H - padY), 28f, 28f, Paint(Paint.ANTI_ALIAS_FLAG).apply { color = INK })
        val inner = (panelW - 76).toInt()
        val t1 = paint(24f, Weight.REGULAR, 0xFFC9D5DA.toInt())
        c.drawText("1-hr PM2.5", px + 38, padY + 38 - t1.fontMetrics.ascent, t1)
        val num = fit(k.pm25.toString(), Weight.BOLD, IVORY, inner, 150f, 90f, 1.0f, -0.05f, maxLines = 1)
        draw(c, num, px + 38, padY + 38 + 40 + ((OG_H - 2 * padY - 76 - 40 - 80) - h(num)) / 2)
        val bp = paint(26f, Weight.BOLD, IVORY)
        val by = OG_H - padY - 38 - 30 - 10
        dot(c, px + 38 + 8, by - 9, 16f, dotColor(k.band, true))
        c.drawText(k.band.label, px + 38 + 26, by, bp)
        k.direction?.let { arrow(c, px + 38 + 26 + bp.measureText(k.band.label) + 12, by - 9, 18f, it, IVORY) }
        val sp = paint(22f, Weight.REGULAR, 0xFFC9D5DA.toInt())
        c.drawText("24-hr PSI ${k.psi ?: "—"} · ${ShareCards.SITE}", px + 38, OG_H - padY - 38f, sp)
        return bmp
    }
}

/** Typeface span that works on minSdk 26 (TypefaceSpan(Typeface) is API 28+). */
private class TypefaceSpanCompat(private val tf: Typeface) : android.text.style.MetricAffectingSpan() {
    override fun updateDrawState(tp: TextPaint) { tp.typeface = tf }
    override fun updateMeasureState(tp: TextPaint) { tp.typeface = tf }
}
