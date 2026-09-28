package sg.hazenow.ui

import android.app.Application
import android.net.ConnectivityManager
import android.net.NetworkCapabilities
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.currentCoroutineContext
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import sg.hazenow.Refresher
import sg.hazenow.core.Freshness
import sg.hazenow.core.Area
import sg.hazenow.core.Place
import sg.hazenow.core.Profile
import sg.hazenow.data.PlaceKeys
import sg.hazenow.data.PlaceMode
import sg.hazenow.data.HazeData
import sg.hazenow.data.HazeRepository
import sg.hazenow.data.LocationHelper
import sg.hazenow.data.Settings
import sg.hazenow.data.SettingsRepo
import java.time.Instant

/** COPY §10 load/error states. */
enum class LoadProblem { NONE, OFFLINE, API_ERROR, NO_DATA }

data class UiState(
    val data: HazeData? = null,
    val settings: Settings = Settings(),
    val settingsLoaded: Boolean = false,
    val loading: Boolean = true,
    val problem: LoadProblem = LoadProblem.NONE,
    val locating: Boolean = false,
    /** Location permission was refused; show the COPY §10 hint. */
    val locationDenied: Boolean = false,
    val locationFailed: Boolean = false,
    /** Set by deep links (notification "Share" action) to open the share sheet. */
    val shareRequested: Boolean = false,
)

class HazeViewModel(app: Application) : AndroidViewModel(app) {
    private val repo = HazeRepository.get(app)
    private val settingsRepo = SettingsRepo(app)
    private val _state = MutableStateFlow(UiState())
    val state: StateFlow<UiState> = _state.asStateFlow()

    init {
        viewModelScope.launch {
            settingsRepo.flow.collect { s ->
                val mockChanged = _state.value.settingsLoaded && s.mock != _state.value.settings.mock
                _state.update { it.copy(settings = s, settingsLoaded = true) }
                if (mockChanged) refreshNow(force = true) else recompute()
            }
        }
    }

    private suspend fun recompute() {
        val s = _state.value.settings
        val data = withContext(Dispatchers.Default) { repo.compute(s) }
        // StateFlow equality means an unchanged publish (same updatedTimestamp) doesn't re-render.
        // Keep the last snapshot when a fetch fails or nothing usable came back (COPY §10, QA S9).
        _state.update { it.copy(data = data ?: it.data) }
        data?.let { withContext(Dispatchers.IO) { Refresher.publish(getApplication(), it) } }
    }

    /**
     * Foreground polling per SPEC v1.3 §3: from hh:00:30 poll v1 every 60 s until the new hour appears
     * (stop at hh:10), a v2 back-fill call at ~hh:35 and ~hh:50, idle otherwise; exponential backoff
     * (30 s → 10 min) on 429 / network errors. Mock mode just re-renders every minute.
     */
    suspend fun pollWhileVisible() {
        refreshNow(v2 = true)
        while (currentCoroutineContext().isActive) {
            if (_state.value.settings.mock != null) {
                delay(60_000)
                recompute()
                continue
            }
            val now = Instant.now()
            val plan = Freshness.plan(now, repo.latestObserved())
            val wait = maxOf(plan.delay, repo.backoffRemaining())
            delay(wait.toMillis().coerceAtLeast(1_000))
            refreshNow(v1 = true, v2 = plan.source == Freshness.Source.V2)
        }
    }

    private fun isOnline(): Boolean {
        val cm = getApplication<Application>().getSystemService(ConnectivityManager::class.java) ?: return true
        val caps = cm.getNetworkCapabilities(cm.activeNetwork) ?: return false
        return caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)
    }

    suspend fun refreshNow(force: Boolean = false, v1: Boolean = true, v2: Boolean = force) {
        _state.update { it.copy(loading = true) }
        val result = runCatching { withContext(Dispatchers.IO) { Refresher.refresh(getApplication(), force, v1, v2) } }
        recompute()
        val mock = _state.value.settings.mock
        val problem = when {
            result.isFailure && mock == null && !isOnline() -> LoadProblem.OFFLINE
            result.isFailure -> LoadProblem.API_ERROR
            result.getOrNull() == null -> LoadProblem.NO_DATA
            else -> LoadProblem.NONE
        }
        _state.update { it.copy(loading = false, problem = problem) }
    }

    fun requestShare() = _state.update { it.copy(shareRequested = true) }
    fun consumeShareRequest() = _state.update { it.copy(shareRequested = false) }

    fun refresh() = viewModelScope.launch { refreshNow(force = true) }

    fun selectRegion(name: String) = viewModelScope.launch { settingsRepo.setRegion(name) }

    fun setProfiles(p: Set<Profile>) = viewModelScope.launch { settingsRepo.setProfiles(Profile.normalize(p)) }

    fun setHazeWatch(on: Boolean) = viewModelScope.launch {
        settingsRepo.setHazeWatch(on)
        _state.value.data?.let { Refresher.publish(getApplication(), it, force = true) }
    }

    fun setBandAlerts(on: Boolean) = viewModelScope.launch { settingsRepo.setBandAlerts(on) }
    fun setElevatedAlerts(on: Boolean) = viewModelScope.launch { settingsRepo.setElevatedAlerts(on) }
    fun markNotifAsked() = viewModelScope.launch { settingsRepo.setNotifAsked() }
    fun setMock(scenario: String?) = viewModelScope.launch { settingsRepo.setMock(scenario) }

    /** SPEC v1.4 §3: denied → never re-prompt automatically; remember it for the quiet chip. */
    fun locationDenied() = viewModelScope.launch {
        settingsRepo.setLocationDenied(true)
        _state.update { it.copy(locationDenied = true) }
    }

    fun pickArea(area: Area) = viewModelScope.launch { settingsRepo.setArea(Place.of(area.name, area.name, area.lat, area.lon)) }
    fun useIsland() = viewModelScope.launch { settingsRepo.setMode(PlaceMode.ISLAND) }
    fun finishFirstRun() = viewModelScope.launch { settingsRepo.setFirstRunDone() }
    fun resetFirstRun() = viewModelScope.launch { settingsRepo.resetFirstRun() }

    fun activatePlace(key: String) = viewModelScope.launch {
        _state.value.settings.places[key]?.let { settingsRepo.setArea(it, key) }
    }

    fun savePlaceFromArea(key: String, area: Area) = viewModelScope.launch {
        settingsRepo.savePlace(key, Place.of(PlaceKeys.label(key), area.name, area.lat, area.lon))
    }

    fun clearPlace(key: String) = viewModelScope.launch { settingsRepo.savePlace(key, null) }

    /** Saves a coarse fix as a place ("Home (Near you)"), rounded to 2 dp. */
    fun savePlaceFromLocation(key: String) = viewModelScope.launch {
        val loc = LocationHelper.current(getApplication()) ?: return@launch
        settingsRepo.savePlace(key, Place.of(PlaceKeys.label(key), "Current location", loc.latitude, loc.longitude))
    }

    /** Call after coarse location permission is granted. */
    fun useMyLocation() = viewModelScope.launch {
        _state.update { it.copy(locating = true, locationDenied = false, locationFailed = false) }
        val loc = LocationHelper.current(getApplication())
        if (loc != null) {
            settingsRepo.setLocation(loc.latitude, loc.longitude)
            _state.update { it.copy(locating = false) }
        } else {
            _state.update { it.copy(locating = false, locationFailed = true) }
            settingsRepo.setFirstRunDone()
        }
    }
}
