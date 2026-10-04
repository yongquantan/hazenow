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
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.withTimeoutOrNull
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
import sg.hazenow.data.CityWhere
import sg.hazenow.data.CountryProblem
import sg.hazenow.data.CountryResult
import sg.hazenow.data.SeaRepository
import sg.hazenow.core.Freshness as SgFreshness
import sg.hazenow.core.sea.CityPlace
import sg.hazenow.core.sea.CountryCode
import sg.hazenow.core.sea.CountryGuess
import sg.hazenow.core.sea.Guess
import sg.hazenow.core.sea.SeaPlaces
import sg.hazenow.core.sea.StartPlace
import java.time.Duration
import java.time.Instant
import java.util.TimeZone

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
    /** SPEC v2.0: the place outside Singapore being shown (picked, GPS, or guessed); null = Singapore. */
    val city: CityWhere? = null,
    val country: CountryResult? = null,
    val countryLoading: Boolean = false,
    /** SPEC v2.1: the device's country guess, while the user hasn't picked anything yet (never saved). */
    val guess: GuessUi? = null,
) {
    /** The v1.4 first-run card: only for a sure Singapore guess (pixel for pixel as before), never for other guesses. */
    val showFirstRun: Boolean get() = settingsLoaded && !settings.firstRunDone && (guess == null || guess.sureSingapore)

    /**
     * The one-time widget/tile card: only once the place and profile steps are done (so it never stacks on them)
     * and a real verdict is on screen. The screens place it under the verdict, so it never hides the reading.
     */
    val showHomeOffer: Boolean get() = settingsLoaded && settings.firstRunDone && settings.profilesChosen && !settings.homeOfferDone &&
        (if (city != null) country is CountryResult.Data else data != null)
}

data class GuessUi(val guess: CountryGuess, val start: StartPlace) {
    val sureSingapore: Boolean get() = guess.country == CountryCode.SG && guess.sure
    /** "Showing Bangkok · Change" (sure, not SG). */
    val sure: Boolean get() = guess.sure && guess.country != null && start.notCoveredFrom == null
}

class HazeViewModel(app: Application) : AndroidViewModel(app) {
    private val repo = HazeRepository.get(app)
    private val settingsRepo = SettingsRepo(app)
    private val _state = MutableStateFlow(UiState())
    val state: StateFlow<UiState> = _state.asStateFlow()

    private val seaRepo = SeaRepository.get(app)
    private var countryFailures = 0

    init {
        viewModelScope.launch {
            settingsRepo.flow.collect { s ->
                val mockChanged = _state.value.settingsLoaded && s.mock != _state.value.settings.mock
                val guess = if (s.firstRunDone) null else deviceGuess()
                val city = whereOf(s, guess)
                val prevKey = _state.value.city?.key
                _state.update {
                    it.copy(
                        settings = s, settingsLoaded = true, guess = guess, city = city,
                        country = if (city?.key != prevKey) city?.let(::cachedResult) else it.country,
                    )
                }
                // A new place outside Singapore: fetch it now (the poll loop also wakes on the change).
                if (city != null && city.key != prevKey) viewModelScope.launch { refreshCountry(city) }
                if (mockChanged) refreshNow(force = true) else recompute()
            }
        }
    }

    /** SPEC v2.1 §6: time zone + preferred languages (+ the SIM's country, on-device), no network, no prompt. */
    private fun deviceGuess(): GuessUi {
        val tz = TimeZone.getDefault().id
        val langs = android.os.LocaleList.getDefault().toLanguageTags().split(",").filter { it.isNotBlank() }
        val sim = runCatching {
            getApplication<Application>().getSystemService(android.telephony.TelephonyManager::class.java)?.networkCountryIso
        }.getOrNull()
        val g = Guess.guessCountry(tz, langs, sim)
        return GuessUi(g, SeaPlaces.startPlace(g))
    }

    /** SPEC v2.1 §1 order: deep link / saved choice (both in settings) → the guess → Singapore. */
    private fun whereOf(s: Settings, guess: GuessUi?): CityWhere? {
        if (s.firstRunDone) {
            if (s.mode == PlaceMode.CITY) {
                val cc = sg.hazenow.core.sea.Registry.parse(s.cityCountry) ?: return null
                val c = s.cityId?.let { SeaPlaces.findCity(it, cc) } ?: SeaPlaces.defaultCity(cc)
                return if (cc == CountryCode.SG) null else CityWhere.of(c)
            }
            val gc = s.gpsCountry
            if (gc != null && s.lat != null && s.lon != null) {
                return CityWhere(gc, "", CityWhere.nearestCity(gc, s.lat, s.lon).name, s.lat, s.lon, gps = true)
            }
            return null
        }
        val g = guess ?: return null
        if (g.sureSingapore || g.start.place.country == CountryCode.SG) return null
        return CityWhere.of(g.start.place, guessed = true)
    }

    private fun cachedResult(w: CityWhere): CountryResult? = seaRepo.cached(w)?.let { CountryResult.Data(it, fromCache = true, problem = CountryProblem.NONE) }

    /** Settings used for the Singapore reading: an unsure guess shows the island average without saving anything. */
    private fun effective(s: Settings): Settings =
        if (!s.firstRunDone && _state.value.guess?.let { !it.sureSingapore } == true) s.copy(mode = PlaceMode.ISLAND) else s

    private suspend fun recompute() {
        val s = effective(_state.value.settings)
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
        if (_state.value.city == null) refreshNow(v2 = true)
        while (currentCoroutineContext().isActive) {
            val city = _state.value.city
            if (city != null) {
                val snap = (_state.value.country as? CountryResult.Data)?.snap
                val failing = _state.value.country.let { it is CountryResult.Failed || (it as? CountryResult.Data)?.fromCache == true }
                val wait = when {
                    _state.value.country is CountryResult.Unavailable -> Duration.ofDays(1).toMillis()
                    failing -> SgFreshness.backoff(countryFailures).toMillis()
                    else -> SeaRepository.nextPollMs(city.country, snap?.observedAt)
                }
                if (waitOrMove(city.key, wait)) refreshCountry(_state.value.city ?: continue)
                else if (_state.value.city == null) refreshNow(v2 = true)
                continue
            }
            if (_state.value.settings.mock != null) {
                delay(60_000)
                recompute()
                continue
            }
            val now = Instant.now()
            val plan = Freshness.plan(now, repo.latestObserved())
            val wait = maxOf(plan.delay, repo.backoffRemaining())
            if (waitOrMove(null, wait.toMillis().coerceAtLeast(1_000))) refreshNow(v1 = true, v2 = plan.source == Freshness.Source.V2)
        }
    }

    /** Sleep [ms], waking early when the place changes. @return true if the full wait elapsed (same place). */
    private suspend fun waitOrMove(key: String?, ms: Long): Boolean =
        withTimeoutOrNull(ms.coerceAtLeast(1_000)) { state.map { it.city?.key }.first { it != key } } == null

    /** SPEC v2.0 for a place outside Singapore: fetch, build on the device, fall back to the cache (COPY §10). */
    suspend fun refreshCountry(w: CityWhere) {
        _state.update { it.copy(countryLoading = true, loading = false) }
        val r = seaRepo.load(w, SeaRepository.edge(_state.value.settings), isOnline())
        countryFailures = if (r is CountryResult.Failed || (r as? CountryResult.Data)?.fromCache == true) countryFailures + 1 else 0
        _state.update { if (it.city?.key == w.key) it.copy(country = r, countryLoading = false) else it.copy(countryLoading = false) }
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

    fun refresh() = viewModelScope.launch {
        val c = _state.value.city
        if (c != null) refreshCountry(c) else refreshNow(force = true)
    }

    /** A place outside Singapore picked in the two-step sheet (saved: it's the user's own choice). */
    fun pickCity(c: CityPlace) = viewModelScope.launch {
        if (c.country == CountryCode.SG) settingsRepo.setMode(PlaceMode.ISLAND) else settingsRepo.setCity(c.country.name, c.id)
    }

    fun setEdgeOverride(url: String?) = viewModelScope.launch { settingsRepo.setEdgeOverride(url) }

    fun selectRegion(name: String) = viewModelScope.launch { settingsRepo.setRegion(name) }

    fun setProfiles(p: Set<Profile>) = viewModelScope.launch { settingsRepo.setProfiles(Profile.normalize(p)) }

    fun setHazeWatch(on: Boolean) = viewModelScope.launch {
        settingsRepo.setHazeWatch(on)
        _state.value.data?.let { Refresher.publish(getApplication(), it, force = true) }
    }

    fun setBandAlerts(on: Boolean) = viewModelScope.launch { settingsRepo.setBandAlerts(on) }
    fun setElevatedAlerts(on: Boolean) = viewModelScope.launch { settingsRepo.setElevatedAlerts(on) }
    fun markNotifAsked() = viewModelScope.launch { settingsRepo.setNotifAsked() }
    fun markHomeOfferDone() = viewModelScope.launch { settingsRepo.setHomeOfferDone() }
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
