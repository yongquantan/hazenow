package sg.hazenow.core

import kotlinx.serialization.Serializable
import java.time.Instant

/** Persisted notification state (on-device). */
@Serializable
data class AlertState(
    /** Last confirmed band (after hysteresis). null = never evaluated. */
    val band: Band? = null,
    /** A rise alert was sent this episode, so an all-clear is owed. */
    val episodeAlerted: Boolean = false,
    /** SGT date of [sentToday]. */
    val day: String = "",
    /** Non-all-clear notifications sent on [day]. */
    val sentToday: Int = 0,
    /** Highest band reached while quiet hours held notifications back. */
    val overnightPeak: Band? = null,
)

data class AlertPrefs(
    val profiles: Set<Profile> = setOf(Profile.GENERAL),
    /** null = COPY §11 default: on for sensitive/exercise profiles, off for general-only. */
    val elevatedAlerts: Boolean? = null,
    val quietStart: Int = Alerts.QUIET_START_HOUR,
    val quietEnd: Int = Alerts.QUIET_END_HOUR,
    /** Named place (picked area / saved place), used as "{area}" = "in Tampines". */
    val placeName: String? = null,
) {
    val elevatedEnabled: Boolean
        get() = elevatedAlerts ?: Profile.normalize(profiles).any { it.sensitive || it == Profile.EXERCISING }
}

data class BandAlert(val title: String, val text: String, val allClear: Boolean, val catchUp: Boolean = false)

data class AlertOutcome(val state: AlertState, val alert: BandAlert?)

/**
 * SPEC v1.1 §10 + v1.2 §7 + COPY §11: band crossings only, hysteresis (2 consecutive hours across the
 * boundary, or ≥10 µg/m³ past it), quiet hours 22:00–07:00 SGT with a morning catch-up, Elevated alerts
 * off by default for general-only, max 3 per day, and the all-clear always gets through.
 */
object Alerts {
    const val QUIET_START_HOUR = 22
    const val QUIET_END_HOUR = 7
    const val DAILY_CAP = 3
    const val HYSTERESIS_UG = 10

    private fun lower(b: Band) = when (b) { Band.NORMAL -> 0; Band.ELEVATED -> 56; Band.HIGH -> 151; Band.VERY_HIGH -> 251 }
    private fun upper(b: Band) = when (b) { Band.NORMAL -> 55; Band.ELEVATED -> 150; Band.HIGH -> 250; Band.VERY_HIGH -> Int.MAX_VALUE }

    fun inQuietHours(now: Instant, startHour: Int = QUIET_START_HOUR, endHour: Int = QUIET_END_HOUR): Boolean {
        if (startHour == endHour) return false
        val h = now.atZone(HazeCore.SG_ZONE).hour
        return if (startHour > endHour) h >= startHour || h < endHour else h in startHour until endHour
    }

    /** "near you" in GPS mode, "in the West" in region mode, "islandwide" otherwise. */
    fun area(s: Snapshot, placeName: String? = null): String = if (placeName != null) "in $placeName" else when (s.locationMode) {
        LocationMode.GPS -> "near you"
        LocationMode.REGION -> "in the ${Format.regionName(s.nearestRegion)}"
        LocationMode.ISLAND -> "islandwide"
    }

    /** The band confirmed by hysteresis, starting from [confirmed]. */
    fun confirmedBand(confirmed: Band, history: List<HistoryPoint>): Band {
        val latest = history.lastOrNull() ?: return confirmed
        val cur = HazeCore.band(latest.pm25)
        if (cur == confirmed) return confirmed
        val v = latest.pm25
        val above = v > upper(confirmed)
        val margin = if (above) v - upper(confirmed) else lower(confirmed) - v
        val prev = history.getOrNull(history.size - 2)?.pm25
        val prevSameSide = prev != null && if (above) prev > upper(confirmed) else prev < lower(confirmed)
        return if (margin >= HYSTERESIS_UG || prevSameSide) cur else confirmed
    }

    private fun wantsRise(to: Band, prefs: AlertPrefs) = when (to) {
        Band.NORMAL -> false
        Band.ELEVATED -> prefs.elevatedEnabled
        else -> true
    }

    fun evaluate(prev: AlertState, s: Snapshot, prefs: AlertPrefs, now: Instant = Instant.now()): AlertOutcome {
        val today = now.atZone(HazeCore.SG_ZONE).toLocalDate().toString()
        var st = if (prev.day == today) prev else prev.copy(day = today, sentToday = 0)
        if (prev.band == null) return AlertOutcome(st.copy(band = s.band), null) // first run: adopt silently
        if (s.stale) return AlertOutcome(st, null)

        val old = prev.band
        val cur = confirmedBand(old, s.history)
        val quiet = inQuietHours(now, prefs.quietStart, prefs.quietEnd)
        val profiles = Profile.normalize(prefs.profiles)
        val verdict = Experience.verdict(s.band, profiles).long
        val area = area(s, prefs.placeName)

        // Morning catch-up for anything held back overnight.
        if (!quiet && st.overnightPeak != null) {
            val peak = st.overnightPeak!!
            st = st.copy(band = cur, overnightPeak = null)
            if (wantsRise(peak, prefs) && st.sentToday < DAILY_CAP) {
                val trend = Experience.trend(s.history, s.trend.delta).a11y ?: "steady"
                val alert = BandAlert(
                    "Overnight air update",
                    "The haze reached ${peak.label} overnight. Now: ${s.band.label}, PM2.5 ${s.pm25}, $trend. $verdict",
                    allClear = false, catchUp = true,
                )
                return AlertOutcome(st.copy(sentToday = st.sentToday + 1, episodeAlerted = cur != Band.NORMAL), alert)
            }
            if (cur == Band.NORMAL) st = st.copy(episodeAlerted = false)
            return AlertOutcome(st, null)
        }

        if (cur == old) return AlertOutcome(st, null)
        st = st.copy(band = cur)

        if (quiet) {
            val peak = listOfNotNull(st.overnightPeak, cur).maxBy { it.ordinal }
            return AlertOutcome(if (cur.ordinal > old.ordinal) st.copy(overnightPeak = peak) else st, null)
        }

        val pm = s.pm25
        val alert: BandAlert? = when {
            cur == Band.NORMAL -> if (st.episodeAlerted) {
                val g = Experience.governing(Band.NORMAL, profiles)
                val body = when (g) {
                    Profile.KIDS -> "Air's back to Normal (PM2.5 $pm). Fine for outdoor play again."
                    Profile.EXERCISING -> "Air's back to Normal (PM2.5 $pm). Fine for your run."
                    else -> "Air's back to Normal (PM2.5 $pm). Fine to be out. Good time to open the windows."
                }
                BandAlert("All clear $area", body, allClear = true)
            } else null
            cur.ordinal > old.ordinal -> if (!wantsRise(cur, prefs) || st.sentToday >= DAILY_CAP) null else when (cur) {
                Band.ELEVATED -> BandAlert("Haze rising $area", "Now Elevated (PM2.5 $pm). $verdict", false)
                Band.HIGH -> BandAlert("Haze now High $area", "PM2.5 $pm. $verdict Close windows and keep cool with aircon or a fan.", false)
                else -> BandAlert("Haze now Very High $area", "PM2.5 $pm. $verdict Check on older family.", false)
            }
            else -> if (!st.episodeAlerted || st.sentToday >= DAILY_CAP) null else
                BandAlert("Haze easing $area", "Down to ${cur.label} (PM2.5 $pm). $verdict", false)
        }
        st = when {
            alert == null -> if (cur == Band.NORMAL) st.copy(episodeAlerted = false) else st
            alert.allClear -> st.copy(episodeAlerted = false)
            else -> st.copy(episodeAlerted = true, sentToday = st.sentToday + 1)
        }
        return AlertOutcome(st, alert)
    }
}

/** WCAG contrast helpers (SPEC v1.2 §11: ≥3:1 icons, ≥4.5:1 text). Pure sRGB maths, no hue mixing. */
object Contrast {
    const val TEXT = 4.5
    const val ICON = 3.0

    private fun channel(c: Int): Double {
        val s = c / 255.0
        return if (s <= 0.03928) s / 12.92 else Math.pow((s + 0.055) / 1.055, 2.4)
    }

    fun luminance(argb: Long): Double {
        val r = ((argb shr 16) and 0xFF).toInt()
        val g = ((argb shr 8) and 0xFF).toInt()
        val b = (argb and 0xFF).toInt()
        return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b)
    }

    fun ratio(a: Long, b: Long): Double {
        val la = luminance(a)
        val lb = luminance(b)
        return (maxOf(la, lb) + 0.05) / (minOf(la, lb) + 0.05)
    }

    /**
     * Darken (on light backgrounds) or lighten (on dark ones) [fg] by scaling toward black/white in sRGB,
     * keeping its hue, until it reaches [target] against [bg].
     */
    fun ensure(fg: Long, bg: Long, target: Double): Long {
        if (ratio(fg, bg) >= target) return fg
        val towardBlack = luminance(bg) > 0.18
        var t = 0.0
        var out = fg
        while (t <= 1.0) {
            out = mix(fg, if (towardBlack) 0xFF000000 else 0xFFFFFFFF, t)
            if (ratio(out, bg) >= target) return out
            t += 0.02
        }
        return out
    }

    private fun mix(a: Long, b: Long, t: Double): Long {
        fun ch(x: Long, sh: Int) = ((x shr sh) and 0xFF).toDouble()
        fun m(sh: Int) = (ch(a, sh) + (ch(b, sh) - ch(a, sh)) * t).toLong().coerceIn(0, 255)
        return (0xFFL shl 24) or (m(16) shl 16) or (m(8) shl 8) or m(0)
    }
}
