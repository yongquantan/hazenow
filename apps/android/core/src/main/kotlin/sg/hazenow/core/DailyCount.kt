package sg.hazenow.core

import java.time.Instant
import java.time.ZoneOffset

/**
 * The anonymous daily "+1" (docs/PRIVACY.md): at most once per UTC day per install, the app adds 1 to the data
 * server's `app_open` counter for (day, surface, new|returning, the selected place's country). Count, never identify:
 * no id, version, coordinate or anything else is sent, and "once a day" is decided here, on the device.
 */
object DailyCount {
    val SURFACES = setOf("android", "ios", "mac")

    /** The UTC day, yyyy-MM-dd. */
    fun utcDay(epochMs: Long): String = Instant.ofEpochMilli(epochMs).atOffset(ZoneOffset.UTC).toLocalDate().toString()

    data class Decision(val day: String, val seen: String)

    /**
     * @param lastDay the UTC day of the last +1 (the local "counted on" flag), or null
     * @param firstSeen whether the local first-seen flag is set
     * @param existingInstall settings from before this counter existed (counts as returning on its first +1)
     * @return what to send, or null when today was already counted
     */
    fun decide(nowMs: Long, lastDay: String?, firstSeen: Boolean, existingInstall: Boolean): Decision? {
        val day = utcDay(nowMs)
        if (lastDay == day) return null
        return Decision(day, if (firstSeen || existingInstall) "returning" else "new")
    }

    /** POST target. [cc] is the selected place's covered country code (never a location); omitted when unknown. */
    fun url(base: String, surface: String, seen: String, cc: String?): String {
        require(surface in SURFACES) { "surface must be one of $SURFACES" }
        require(seen == "new" || seen == "returning")
        val c = cc?.lowercase()?.takeIf { sg.hazenow.core.sea.Registry.parse(it) != null }
        return "${base.trimEnd('/')}/v1/hit?e=app_open&surface=$surface&seen=$seen" + (c?.let { "&cc=$it" } ?: "")
    }
}
