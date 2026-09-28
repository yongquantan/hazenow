package sg.hazenow.data

import android.content.Context
import sg.hazenow.core.Area
import sg.hazenow.core.Areas

/** Offline area list bundled from packages/core/data/sg-areas.json (SPEC v1.4 §6). Empty if not bundled. */
object AreaList {
    @Volatile private var cached: List<Area>? = null

    fun get(context: Context): List<Area> = cached ?: runCatching {
        context.assets.open("sg-areas.json").bufferedReader().use { Areas.parse(it.readText()) }
    }.getOrDefault(emptyList()).also { cached = it }
}
