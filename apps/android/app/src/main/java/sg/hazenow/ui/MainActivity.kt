package sg.hazenow.ui

import android.content.Intent
import android.os.Bundle
import android.widget.Toast
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.activity.viewModels
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.lifecycleScope
import androidx.lifecycle.repeatOnLifecycle
import kotlinx.coroutines.launch
import sg.hazenow.BuildConfig
import sg.hazenow.core.Areas
import sg.hazenow.data.AreaList
import sg.hazenow.data.LocationHelper
import sg.hazenow.data.MockData
import sg.hazenow.work.RefreshWorker

/**
 * Also reachable as `sg.hazenow/.MainActivity` (activity-alias). Launch extras, handy for QA:
 *   --es mock <scenario|off>   (debug builds only) persist a MockData scenario
 *   --es pinWidget small|medium  ask the launcher to add a widget
 *   --ez addTile true            ask System UI to add the Quick Settings tile (Android 13+)
 *   --es region <name>           pick a region
 *   --ez location true           use my location (needs the permission already granted)
 *   --es area <name>             pick an area from the bundled list (e.g. Tampines); completes first run
 *   --es country th [--es area pai]  SPEC v2.0 deep link: a place outside Singapore (area = slug, name or alias;
 *                                omitted = the country's default city). Like ?country=th&area=pai on the web.
 *   --es edge <url|off>          (debug builds only) override HAZENOW_EDGE, e.g. http://10.0.2.2:8787
 *   --es place home|work|other   switch to a saved place
 *   --ez island true             show the island average
 *   --ez resetFirstRun true      show the first-run flow again
 *   --ez refresh true            force a refresh of every surface now
 *   --ez share true              open the share sheet (also used by the band-change notification)
 */
class MainActivity : ComponentActivity() {
    companion object {
        const val EXTRA_SHARE = "share"
    }

    private val vm: HazeViewModel by viewModels()

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        setContent { HazeTheme { HazeScreen(vm) } }
        handle(intent)
        lifecycleScope.launch {
            repeatOnLifecycle(Lifecycle.State.STARTED) { vm.pollWhileVisible() }
        }
    }

    override fun onStart() {
        super.onStart()
        // The anonymous daily +1 (DailyPing): once per UTC day at most, off the main thread, never blocking.
        val app = applicationContext
        lifecycleScope.launch(kotlinx.coroutines.Dispatchers.IO) {
            runCatching { sg.hazenow.data.DailyPing.maybeSend(app, sg.hazenow.data.SettingsRepo(app).current()) }
        }
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        handle(intent)
    }

    private fun handle(intent: Intent?) {
        intent ?: return
        intent.getStringExtra("mock")?.let { m ->
            if (!BuildConfig.DEBUG) return@let
            when (m) {
                "off", "" -> vm.setMock(null)
                in MockData.SCENARIOS -> vm.setMock(m)
                else -> Toast.makeText(this, "Unknown mock scenario: $m", Toast.LENGTH_LONG).show()
            }
            RefreshWorker.runOnce(this)
        }
        if (intent.getBooleanExtra(EXTRA_SHARE, false)) vm.requestShare()
        if (intent.getBooleanExtra("resetFirstRun", false)) vm.resetFirstRun()
        intent.getStringExtra("region")?.let { vm.selectRegion(it) }
        if (BuildConfig.DEBUG) intent.getStringExtra("edge")?.let { vm.setEdgeOverride(it.takeIf { e -> e != "off" }) }
        val country = sg.hazenow.core.sea.Registry.parse(intent.getStringExtra("country"))
        if (country != null && country != sg.hazenow.core.sea.CountryCode.SG) {
            val q = intent.getStringExtra("area")
            val c = q?.let { sg.hazenow.core.sea.SeaPlaces.findCity(it, country) } ?: sg.hazenow.core.sea.SeaPlaces.defaultCity(country)
            vm.pickCity(c)
            intent.removeExtra("area")
        }
        intent.getStringExtra("area")?.let { q ->
            val hit = Areas.search(AreaList.get(this), q, limit = 1).firstOrNull()?.first
            if (hit != null) vm.pickArea(hit) else Toast.makeText(this, "No area matches $q", Toast.LENGTH_LONG).show()
        }
        intent.getStringExtra("place")?.let { vm.activatePlace(it) }
        if (intent.getBooleanExtra("island", false)) vm.useIsland()
        if (intent.getBooleanExtra("location", false) && LocationHelper.hasPermission(this)) vm.useMyLocation()
        intent.getStringExtra("pinWidget")?.let { pinWidget(it) }
        if (intent.getBooleanExtra("addTile", false)) addTile()
        if (intent.getBooleanExtra("refresh", false)) {
            vm.refresh()
            RefreshWorker.runOnce(this)
        }
        // Consume one-shot extras so rotation doesn't replay them.
        listOf("mock", "edge", "country", "region", "location", "pinWidget", "addTile", "refresh", "area", "place", "island", "resetFirstRun", EXTRA_SHARE).forEach { intent.removeExtra(it) }
    }

    /** Also used by the debug `pinWidget` / `addTile` extras; the UI calls [HomeShortcuts] directly. */
    fun pinWidget(which: String) = HomeShortcuts.pinWidget(this, which)

    fun addTile() = HomeShortcuts.addTile(this)
}
