package sg.hazenow.debug

import android.content.Context
import android.graphics.Bitmap
import android.util.Log
import sg.hazenow.core.Place
import sg.hazenow.core.Profile
import sg.hazenow.core.ShareCard
import sg.hazenow.core.SharePersona
import sg.hazenow.data.AreaList
import sg.hazenow.data.HazeRepository
import sg.hazenow.data.MockData
import sg.hazenow.data.PlaceMode
import sg.hazenow.data.Settings
import sg.hazenow.data.SettingsRepo
import sg.hazenow.render.ShareCardRenderer
import sg.hazenow.ui.Share
import java.io.File

/** Debug-only: renders every share card for every mock scenario and persona, for visual QA. */
object CardExport {
    private const val TAG = "HazeNowCards"

    suspend fun exportAll(context: Context) {
        val dir = File(context.getExternalFilesDir(null), "cards").apply { deleteRecursively(); mkdirs() }
        val renderer = ShareCardRenderer(context)
        val repo = HazeRepository.get(context)
        val base = SettingsRepo(context).current()
        fun area(name: String): Place {
            val a = AreaList.get(context).first { it.name == name }
            return Place.of(a.name, a.name, a.lat, a.lon)
        }
        fun settings(scenario: String, place: Place, profiles: Set<Profile>) =
            base.copy(mock = scenario, mode = PlaceMode.AREA, area = place, activePlace = null, profiles = profiles)
        fun save(name: String, bmp: Bitmap) {
            File(dir, "$name.png").outputStream().use { bmp.compress(Bitmap.CompressFormat.PNG, 100, it) }
            Log.i(TAG, "$name.png ${bmp.width}x${bmp.height}")
        }
        fun export(prefix: String, s: Settings, cards: List<ShareCard>, preview: Boolean) {
            val data = repo.compute(s) ?: run { Log.w(TAG, "$prefix: no data"); return }
            val cd = Share.cardData(context, data, s)
            val pick = Share.pick(cd)
            Log.i(TAG, "$prefix: picked ${pick.card.id}, alternates ${pick.alternates.map { it.id }} | ${Share.text(pick.card, cd)}")
            for (c in cards) save("$prefix-${c.id}", renderer.render(c, cd))
            if (preview) save("$prefix-link_preview", renderer.linkPreview(cd))
        }

        val tampines = area("Tampines")
        for (sc in MockData.SCENARIOS - MockData.NETWORK_ERROR) {
            val cards = listOf(ShareCard.NOW, ShareCard.TWO_CLOCKS) + if (sc == "all_clear") listOf(ShareCard.ALL_CLEAR) else emptyList()
            export(sc, settings(sc, tampines, setOf(Profile.GENERAL)), cards, preview = true)
        }
        for (sc in listOf("elevated", "very_high")) {
            for (p in SharePersona.entries) export("$sc-${p.id}", settings(sc, tampines, setOf(p.profile)), listOf(ShareCard.GROUP), false)
        }
        // Longest-text stress case: long area name + 3-digit PM2.5.
        val cck = area("Choa Chu Kang")
        export("stress-choa-chu-kang-very_high", settings("very_high", cck, setOf(Profile.ELDERLY)), ShareCard.entries - ShareCard.ALL_CLEAR, true)
        export("all_offline_stale-kids", settings("all_offline_stale", tampines, setOf(Profile.KIDS)), listOf(ShareCard.GROUP), false)
        export("stress-choa-chu-kang-stale", settings("all_offline_stale", cck, setOf(Profile.GENERAL)), listOf(ShareCard.NOW, ShareCard.TWO_CLOCKS), true)
        export("stress-choa-chu-kang-all_clear", settings("all_clear", cck, setOf(Profile.GENERAL)), listOf(ShareCard.ALL_CLEAR), false)
        Log.i(TAG, "done -> ${dir.absolutePath}")
    }
}
