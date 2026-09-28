package sg.hazenow.core

import java.time.OffsetDateTime
import java.util.Locale

/** Human strings shared by the app, widgets, notification, tile and share sheet (docs/COPY.md). */
object Format {
    /** "2026-09-28T16:30:40+08:00" -> "4:30pm"; on the hour -> "4pm". Always in SGT. */
    fun clock(iso: String): String = try {
        val t = OffsetDateTime.parse(iso).atZoneSameInstant(HazeCore.SG_ZONE)
        val h = t.hour % 12
        val hh = if (h == 0) 12 else h
        val ampm = if (t.hour < 12) "am" else "pm"
        if (t.minute == 0) "$hh$ampm" else String.format(Locale.US, "%d:%02d%s", hh, t.minute, ampm)
    } catch (e: Exception) {
        iso
    }

    /** COPY §6 detail: "Measured 4pm · posted by NEA 4:30pm" */
    fun asOf(s: Snapshot): String = "Measured ${clock(s.observedAt)} · posted by NEA ${clock(s.publishedAt)}"

    fun regionName(name: String): String = name.replaceFirstChar { it.titlecase(Locale.US) }

    fun place(s: Snapshot): String = when (s.locationMode) {
        LocationMode.GPS -> "Near you"
        LocationMode.REGION -> regionName(s.nearestRegion)
        LocationMode.ISLAND -> "Singapore (island average)"
    }

    /** Compact surfaces: "● 105 ▲" */
    fun compact(s: Snapshot): String = "● ${s.pm25} ${s.trend.direction.arrow}"

    /**
     * COPY §15 (no verdict: advice depends on the reader's profile). No Instant PSI (SPEC v1.2 §1).
     * `{shareUrl}` is appended only when there is one.
     */
    fun shareText(s: Snapshot, shareUrl: String? = null): String {
        val trend = Experience.trend(s.history, s.trend.delta).a11y ?: "steady"
        val psi = s.officialPsi24h?.toString() ?: "not available right now"
        val base = "Air near me right now: ${s.band.label} (PM2.5 ${s.pm25}), $trend. NEA 24-hr PSI: $psi. Data: NEA via data.gov.sg."
        return if (shareUrl.isNullOrBlank()) base else "$base $shareUrl"
    }
}
