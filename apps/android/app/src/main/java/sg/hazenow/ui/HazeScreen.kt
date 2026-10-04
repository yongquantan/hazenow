package sg.hazenow.ui

import android.Manifest
import android.content.Intent
import android.net.Uri
import android.os.Build
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.animation.animateColorAsState
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.LocationOn
import androidx.compose.material.icons.filled.Person
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material.icons.filled.Share
import androidx.compose.material.icons.outlined.Info
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilledTonalButton
import androidx.compose.material3.FilterChip
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LargeTopAppBar
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Surface
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.drawscope.drawIntoCanvas
import androidx.compose.ui.graphics.lerp
import androidx.compose.ui.graphics.nativeCanvas
import androidx.compose.ui.graphics.toArgb
import androidx.compose.ui.input.nestedscroll.nestedScroll
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import sg.hazenow.core.Band
import sg.hazenow.core.Chart
import sg.hazenow.core.Contrast
import sg.hazenow.core.Format
import sg.hazenow.core.HazeCore
import sg.hazenow.core.Insight
import sg.hazenow.core.LocationMode
import sg.hazenow.core.Profile
import sg.hazenow.core.TrendDirection
import sg.hazenow.data.HazeData
import sg.hazenow.data.LocationHelper
import sg.hazenow.data.Settings
import sg.hazenow.render.ChartPainter
import sg.hazenow.render.ChartStyle
import kotlin.math.cos
import kotlin.math.sin

private const val NEA_HAZE_URL = "https://www.haze.gov.sg/"

/** Band colour adjusted to meet [target] contrast on [bg] (SPEC v1.2 §11). Never mixes hues. */
private fun Band.on(bg: Color, target: Double): Color =
    Color(Contrast.ensure(argb, bg.toArgb().toLong() and 0xFFFFFFFFL, target))

/** Trend arrow as a vector (Apfel Grotezk has no ▲▼ glyphs; SPEC v1.5). Decorative: the words carry the meaning. */
@Composable
fun TrendArrow(direction: TrendDirection, tint: Color, size: Dp = 12.dp) {
    Canvas(Modifier.size(size)) {
        val w = this.size.width
        val p = Path().apply {
            when (direction) {
                TrendDirection.UP -> { moveTo(w / 2, w * 0.08f); lineTo(w * 0.95f, w * 0.88f); lineTo(w * 0.05f, w * 0.88f) }
                TrendDirection.DOWN -> { moveTo(w * 0.05f, w * 0.12f); lineTo(w * 0.95f, w * 0.12f); lineTo(w / 2, w * 0.92f) }
                TrendDirection.STEADY -> { moveTo(w * 0.12f, w * 0.05f); lineTo(w * 0.92f, w / 2); lineTo(w * 0.12f, w * 0.95f) }
            }
            close()
        }
        drawPath(p, tint)
    }
}

/** COPY §3: shape carries meaning: circle, half-gauge circle, triangle, octagon. */
@Composable
fun BandIcon(band: Band, tint: Color, size: Dp = 16.dp, outline: Boolean = false) {
    Canvas(Modifier.size(size)) {
        val w = this.size.width
        val c = Offset(w / 2, w / 2)
        val stroke = Stroke(width = w * 0.14f)
        when (band) {
            Band.NORMAL -> if (outline) drawCircle(tint, w * 0.42f, c, style = stroke) else drawCircle(tint, w * 0.45f, c)
            Band.ELEVATED -> {
                drawCircle(tint, w * 0.40f, c, style = stroke)
                drawRect(tint, Offset(w * 0.18f, w * 0.44f), androidx.compose.ui.geometry.Size(w * 0.64f, w * 0.14f))
                if (!outline) drawArc(tint, 0f, 180f, true, Offset(w * 0.10f, w * 0.10f), androidx.compose.ui.geometry.Size(w * 0.8f, w * 0.8f))
            }
            Band.HIGH -> {
                val p = Path().apply { moveTo(w / 2, w * 0.06f); lineTo(w * 0.96f, w * 0.90f); lineTo(w * 0.04f, w * 0.90f); close() }
                if (outline) drawPath(p, tint, style = stroke) else drawPath(p, tint)
            }
            Band.VERY_HIGH -> {
                val p = Path()
                for (i in 0 until 8) {
                    val a = Math.toRadians(22.5 + i * 45.0)
                    val x = c.x + w * 0.47f * cos(a).toFloat()
                    val y = c.y + w * 0.47f * sin(a).toFloat()
                    if (i == 0) p.moveTo(x, y) else p.lineTo(x, y)
                }
                p.close()
                if (outline) drawPath(p, tint, style = stroke) else drawPath(p, tint)
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun HazeScreen(vm: HazeViewModel) {
    val state by vm.state.collectAsStateWithLifecycle()
    val ctx = LocalContext.current
    val dark = isSystemInDarkTheme()
    var showProfiles by rememberSaveable { mutableStateOf(false) }
    var showInfo by rememberSaveable { mutableStateOf(false) }
    var showWhy by rememberSaveable { mutableStateOf(false) }
    var showTips by rememberSaveable { mutableStateOf(false) }
    /** Pending location purpose for the rationale dialog: "current" or a saved-place key. */
    var locationAsk by rememberSaveable { mutableStateOf<String?>(null) }
    var locationPurpose by rememberSaveable { mutableStateOf("current") }
    /** Area picker target: "current" or a saved-place key. */
    var areaPicker by rememberSaveable { mutableStateOf<String?>(null) }
    var showPlaces by rememberSaveable { mutableStateOf(false) }
    var showNotifAsk by rememberSaveable { mutableStateOf(false) }
    var showLicences by rememberSaveable { mutableStateOf(false) }
    var showAbout by rememberSaveable { mutableStateOf(false) }
    var showShare by rememberSaveable { mutableStateOf(false) }
    /** SPEC v2.1 two-step place sheet: "" = the country list, else a country code (its places). */
    var picker by rememberSaveable { mutableStateOf<String?>(null) }
    var shareFromWhy by rememberSaveable { mutableStateOf(false) }
    // Deep links (band-change notification "Share" action, widgets): open the share sheet once data is in.
    LaunchedEffect(state.shareRequested, state.data != null) {
        if (state.shareRequested && state.data != null) { shareFromWhy = false; showShare = true; vm.consumeShareRequest() }
    }
    // The v1.4 first-run card only for a sure Singapore guess; other guesses render a place at once (SPEC v2.1 §4).
    val firstRun = state.showFirstRun
    val city = state.city

    val locationPerm = rememberLauncherForActivityResult(ActivityResultContracts.RequestMultiplePermissions()) { r ->
        val purpose = locationPurpose
        if (r.values.any { it }) {
            if (purpose == "current") vm.useMyLocation() else vm.savePlaceFromLocation(purpose)
        } else {
            // SPEC v1.4 §3: no automatic re-prompt; fall back to the area list, then the island view.
            vm.locationDenied()
            if (purpose == "current" && firstRun) areaPicker = "current"
        }
    }
    val notifPerm = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { }

    fun openAppSettings() = runCatching {
        ctx.startActivity(
            Intent(android.provider.Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.fromParts("package", ctx.packageName, null))
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK),
        )
    }

    /** User-initiated only. Explainer first, then the OS prompt; if the OS won't ask again, deep-link to Settings. */
    fun askLocation(purpose: String = "current") {
        if (LocationHelper.hasPermission(ctx)) {
            if (purpose == "current") vm.useMyLocation() else vm.savePlaceFromLocation(purpose)
            return
        }
        val act = ctx as? android.app.Activity
        val canAsk = !state.settings.locationDenied ||
            (act?.shouldShowRequestPermissionRationale(Manifest.permission.ACCESS_COARSE_LOCATION) ?: false)
        if (canAsk) locationAsk = purpose else openAppSettings()
    }
    fun ensureNotif() {
        if (Build.VERSION.SDK_INT >= 33) notifPerm.launch(Manifest.permission.POST_NOTIFICATIONS)
    }
    fun openNea() = runCatching { ctx.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(NEA_HAZE_URL))) }

    LaunchedEffect(state.settingsLoaded, state.settings.firstRunDone, state.settings.profilesChosen) {
        if (state.settingsLoaded && state.settings.firstRunDone && !state.settings.profilesChosen) showProfiles = true
    }
    // COPY §11: ask for notifications after the first Elevated+ view, not on first launch.
    val band = if (city == null) state.data?.snapshot?.band else null
    LaunchedEffect(band, state.settings.notifAsked, state.settings.profilesChosen) {
        if (band != null && band != Band.NORMAL && !state.settings.notifAsked && state.settings.profilesChosen && !Notifier.canPostNow(ctx)) {
            showNotifAsk = true
        }
    }

    val scroll = TopAppBarDefaults.exitUntilCollapsedScrollBehavior()
    Scaffold(
        modifier = Modifier.nestedScroll(scroll.nestedScrollConnection),
        topBar = {
            LargeTopAppBar(
                // Title only: the place and the mock badge live in the content, so large text can't clip them (QA S14).
                title = { Text("HazeNow", fontWeight = FontWeight.SemiBold, maxLines = 1) },
                actions = {
                    if (state.loading || state.countryLoading) {
                        CircularProgressIndicator(Modifier.size(20.dp).padding(end = 4.dp), strokeWidth = 2.dp)
                    } else {
                        IconButton(onClick = { vm.refresh() }) { Icon(Icons.Filled.Refresh, "Refresh") }
                    }
                    val countrySnap = (state.country as? sg.hazenow.data.CountryResult.Data)?.snap
                    IconButton(
                        onClick = { if (city != null) countrySnap?.let { shareCountryText(ctx, it, city) } else { shareFromWhy = false; showShare = true } },
                        enabled = if (city != null) countrySnap != null else state.data != null,
                    ) {
                        Icon(Icons.Filled.Share, "Share")
                    }
                    IconButton(onClick = { showInfo = true }) { Icon(Icons.Outlined.Info, "How we calculate this") }
                },
                scrollBehavior = scroll,
            )
        },
    ) { pad ->
        val data = state.data
        if (firstRun) {
            FirstRunScreen(
                Modifier.padding(pad),
                onLocation = { askLocation("current") },
                onPickArea = { areaPicker = "current" },
                onSkip = { vm.useIsland() },
            )
        } else if (city != null) {
            CountryContent(
                state, city, pad.calculateTopPadding(),
                hasPermission = LocationHelper.hasPermission(ctx),
                onLocation = { askLocation("current") },
                onChange = { cc -> picker = cc?.name ?: "" },
                onRetry = { vm.refresh() },
                onWho = { showProfiles = true },
                onInfo = { showInfo = true },
                onAbout = { showAbout = true },
                onLicences = { showLicences = true },
                showHomeOffer = state.showHomeOffer && !showProfiles,
                onHomeOfferDone = { vm.markHomeOfferDone() },
            )
        } else if (data == null) {
            EmptyState(state, Modifier.padding(pad), onRetry = { vm.refresh() })
        } else {
            val offline = state.problem == LoadProblem.OFFLINE
            LazyColumn(
                contentPadding = PaddingValues(start = 16.dp, end = 16.dp, top = pad.calculateTopPadding(), bottom = 32.dp),
                verticalArrangement = Arrangement.spacedBy(14.dp),
                modifier = Modifier.fillMaxSize().navigationBarsPadding(),
            ) {
                item {
                    Column {
                        state.settings.mock?.let { m ->
                            Surface(color = MaterialTheme.colorScheme.errorContainer, shape = RoundedCornerShape(6.dp)) {
                                Text(
                                    "MOCK DATA · $m",
                                    Modifier.padding(horizontal = 8.dp, vertical = 3.dp),
                                    style = MaterialTheme.typography.labelMedium,
                                    color = MaterialTheme.colorScheme.onErrorContainer,
                                )
                            }
                            Spacer(Modifier.height(6.dp))
                        }
                        Text(
                            state.settings.placeName ?: Format.place(data.snapshot),
                            style = MaterialTheme.typography.titleMedium,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                            modifier = Modifier.semantics { heading() },
                        )
                    }
                }
                when (state.problem) {
                    LoadProblem.OFFLINE -> item { Notice("You're offline. Showing the reading from ${Format.clock(data.snapshot.observedAt)}.") }
                    // COPY §10: keep the last snapshot and say which reading it is.
                    LoadProblem.API_ERROR -> item {
                        Notice("Can't reach NEA's data right now. Showing the reading from ${Format.clock(data.snapshot.observedAt)}. We'll try again in a few minutes.")
                    }
                    else -> {}
                }
                item {
                    PlaceSwitcher(
                        state.settings,
                        hasPermission = LocationHelper.hasPermission(ctx),
                        locating = state.locating,
                        onNear = { askLocation("current") },
                        onPlace = vm::activatePlace,
                        onPickArea = { picker = "SG" },
                        onEditPlaces = { showPlaces = true },
                    )
                }
                item { VerdictCard(data, offline, onWho = { showProfiles = true }, onWhy = { showWhy = true }, onShare = { shareFromWhy = false; showShare = true }) }
                item { Provenance(data.insight, state, data) }
                // Once, after the first verdict, under it (never above the reading, never over a first-run sheet).
                if (state.showHomeOffer && !showProfiles) item { HomeOfferCard(onDone = { vm.markHomeOfferDone() }) }
                // SPEC v2.1 §4: an unsure (or non-SEA) guess still shows the default reading, with this card under it.
                state.guess?.takeIf { !it.sureSingapore && !state.settings.firstRunDone }?.let {
                    item { WhereCheckingCard(proxy = sg.hazenow.data.SeaRepository.edge(state.settings) != null, onCountry = { cc -> picker = cc.name }) }
                }
                item { ActionsCard(data.insight, onMore = { showTips = true }) }
                item { ChartCard(data, onWhy = { showWhy = true }) }
                item {
                    RegionsCard(data, state.settings, onRegion = vm::selectRegion)
                }
                item {
                    AlertsCard(
                        state.settings,
                        onWatch = { on -> if (on) ensureNotif(); vm.setHazeWatch(on) },
                        onAlerts = { on -> if (on) ensureNotif(); vm.setBandAlerts(on) },
                        onElevated = vm::setElevatedAlerts,
                    )
                }
                item { HomeShortcutsCard() }
                item { Footer(onInfo = { showInfo = true }, onNea = ::openNea, onLicences = { showLicences = true }, onAbout = { showAbout = true }) }
            }
        }
    }

    if (showProfiles) {
        ProfileSheet(state.settings.profiles, onDone = { vm.setProfiles(it); showProfiles = false })
    }
    if (showInfo) InfoSheet(onDismiss = { showInfo = false })
    if (showLicences) LicencesSheet(onDismiss = { showLicences = false })
    if (showAbout) AboutSheet(onDismiss = { showAbout = false })
    if (showShare) state.data?.let { ShareSheet(it, state.settings, shareFromWhy, onDismiss = { showShare = false }) }
    if (showTips) state.data?.let { TipsSheet(it.insight, onNea = ::openNea, onDismiss = { showTips = false }) }
    if (showWhy) {
        AlertDialog(
            onDismissRequest = { showWhy = false },
            title = { Text(Insight.WHY_TWO_NUMBERS_LINK) },
            text = { Text(Insight.WHY_TWO_NUMBERS) },
            confirmButton = { TextButton(onClick = { showWhy = false }) { Text("OK") } },
            dismissButton = {
                TextButton(onClick = { showWhy = false; shareFromWhy = true; showShare = state.data != null }) { Text("Share this") }
            },
        )
    }
    locationAsk?.let { purpose ->
        AlertDialog(
            onDismissRequest = { locationAsk = null },
            title = { Text("Use my location") },
            text = { Text("We only use this to find your nearest NEA station. It stays on your phone.") },
            confirmButton = {
                Button(onClick = {
                    locationAsk = null
                    locationPurpose = purpose
                    // Approximate only, foreground only (SPEC v1.4 §1).
                    locationPerm.launch(arrayOf(Manifest.permission.ACCESS_COARSE_LOCATION))
                }) { Text("Continue") }
            },
            dismissButton = {
                TextButton(onClick = { locationAsk = null; areaPicker = purpose }) { Text("Pick my area instead") }
            },
        )
    }
    areaPicker?.let { target ->
        AreaPickerSheet(
            onPick = { area ->
                areaPicker = null
                if (target == "current") vm.pickArea(area) else vm.savePlaceFromArea(target, area)
            },
            onDismiss = {
                areaPicker = null
                if (target == "current" && firstRun) vm.useIsland() // last-resort fallback: island view
            },
        )
    }
    picker?.let { start ->
        PlacePickerSheet(
            startCountry = sg.hazenow.core.sea.Registry.parse(start),
            proxy = sg.hazenow.data.SeaRepository.edge(state.settings) != null,
            current = (state.country as? sg.hazenow.data.CountryResult.Data)?.snap,
            onCity = { c -> picker = null; vm.pickCity(c) },
            onArea = { a -> picker = null; vm.pickArea(a) },
            onIsland = { picker = null; vm.useIsland() },
            onLocation = { picker = null; askLocation("current") },
            onDismiss = { picker = null },
        )
    }
    if (showPlaces) {
        PlacesSheet(
            state.settings,
            onPickArea = { key -> areaPicker = key },
            onUseLocation = { key -> askLocation(key) },
            onClear = vm::clearPlace,
            onDismiss = { showPlaces = false },
        )
    }
    if (showNotifAsk) {
        AlertDialog(
            onDismissRequest = { showNotifAsk = false; vm.markNotifAsked() },
            title = { Text("Want a heads-up when the haze changes?") },
            text = { Text("We'll only message when the band changes near you, and tell you when it's clear again. Never at night.") },
            confirmButton = {
                Button(onClick = {
                    showNotifAsk = false
                    vm.markNotifAsked()
                    vm.setBandAlerts(true)
                    ensureNotif()
                }) { Text("Yes, notify me") }
            },
            dismissButton = { TextButton(onClick = { showNotifAsk = false; vm.markNotifAsked() }) { Text("Not now") } },
        )
    }
}

private object Notifier {
    fun canPostNow(ctx: android.content.Context) = sg.hazenow.notify.Notifier.canPost(ctx)
}

@Composable
private fun EmptyState(state: UiState, modifier: Modifier, onRetry: () -> Unit) {
    val (headline, detail) = when {
        state.loading && state.problem == LoadProblem.NONE -> "Getting NEA's latest reading…" to null
        state.problem == LoadProblem.OFFLINE -> "Can't load the air reading" to "You're offline. Connect to see NEA's latest reading."
        state.problem == LoadProblem.API_ERROR -> "Can't reach NEA's data right now" to "We'll try again in a few minutes."
        state.problem == LoadProblem.NO_DATA -> "No reading available" to "NEA's data didn't include a usable reading this hour. We'll try again soon."
        else -> "Getting NEA's latest reading…" to null
    }
    Box(modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
        Column(horizontalAlignment = Alignment.CenterHorizontally, modifier = Modifier.padding(32.dp)) {
            if (detail == null) {
                CircularProgressIndicator()
                Spacer(Modifier.height(16.dp))
            }
            Text(headline, style = MaterialTheme.typography.titleLarge, textAlign = TextAlign.Center)
            if (detail != null) {
                Spacer(Modifier.height(8.dp))
                Text(detail, textAlign = TextAlign.Center, color = MaterialTheme.colorScheme.onSurfaceVariant)
                Spacer(Modifier.height(16.dp))
                Button(onClick = onRetry) { Text("Try again") }
            }
        }
    }
}

@Composable
private fun Notice(text: String) {
    Surface(color = MaterialTheme.colorScheme.secondaryContainer, shape = RoundedCornerShape(16.dp)) {
        Text(text, Modifier.padding(12.dp).fillMaxWidth(), style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSecondaryContainer)
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun VerdictCard(d: HazeData, offline: Boolean, onWho: () -> Unit, onWhy: () -> Unit, onShare: () -> Unit) {
    val s = d.snapshot
    val i = d.insight
    val surface = MaterialTheme.colorScheme.surfaceContainer
    val tint by animateColorAsState(s.band.color, tween(600), label = "band")
    val cardBg = lerp(surface, tint, 0.12f)
    val onCard = MaterialTheme.colorScheme.onSurface
    val muted = MaterialTheme.colorScheme.onSurfaceVariant
    val numberColor = if (offline) muted else s.band.on(cardBg, Contrast.TEXT)
    Surface(shape = RoundedCornerShape(28.dp), color = cardBg, modifier = Modifier.fillMaxWidth()) {
        Column(Modifier.padding(20.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    modifier = Modifier.clip(RoundedCornerShape(50))
                        .clickable(role = Role.Button, onClickLabel = "Change who you're checking for", onClick = onWho)
                        .background(MaterialTheme.colorScheme.surface.copy(alpha = 0.7f)).padding(horizontal = 10.dp, vertical = 6.dp),
                ) {
                    Icon(Icons.Filled.Person, null, Modifier.size(16.dp), tint = muted)
                    Spacer(Modifier.width(6.dp))
                    Text(i.verdict.forLabel, style = MaterialTheme.typography.labelLarge, color = muted)
                }
                if (offline) {
                    Spacer(Modifier.width(8.dp))
                    Text(
                        "Offline",
                        Modifier.border(1.dp, muted, RoundedCornerShape(50)).padding(horizontal = 8.dp, vertical = 4.dp),
                        style = MaterialTheme.typography.labelMedium, color = muted,
                    )
                }
                Spacer(Modifier.weight(1f))
                // SPEC v1.6: prominent primary Share, next to the verdict.
                Button(onClick = onShare, contentPadding = PaddingValues(horizontal = 18.dp, vertical = 8.dp)) {
                    Icon(Icons.Filled.Share, null, Modifier.size(18.dp))
                    Spacer(Modifier.width(8.dp))
                    Text("Share")
                }
            }
            Spacer(Modifier.height(12.dp))
            // 1. Verdict. Live region only here, so TalkBack announces when the verdict (band) changes.
            Text(
                i.verdict.long,
                style = MaterialTheme.typography.headlineSmall,
                color = if (offline) muted else onCard,
                modifier = Modifier.semantics {
                    heading()
                    liveRegion = LiveRegionMode.Polite
                    contentDescription = i.accessibility
                },
            )
            i.secondLine?.let {
                Spacer(Modifier.height(4.dp))
                Text(it, style = MaterialTheme.typography.bodyLarge, color = muted)
            }
            Spacer(Modifier.height(6.dp))

            // 2. Big number + band chip + trend
            Row(verticalAlignment = Alignment.Bottom, modifier = Modifier.clearAndSetSemantics { }) {
                Text(i.display, style = MaterialTheme.typography.displayLarge, color = numberColor)
                Spacer(Modifier.width(10.dp))
                Column(Modifier.padding(bottom = 16.dp)) {
                    Text("µg/m³", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold)
                    Text("PM2.5 · last hour", style = MaterialTheme.typography.bodySmall, color = muted)
                }
            }
            // SPEC v1.5: uncertainty lives here, never as "~" on the number.
            Text(i.sourceLine, style = MaterialTheme.typography.bodyMedium, color = muted)
            Spacer(Modifier.height(10.dp))
            FlowRow {
                BandChip(s.band, cardBg, stale = i.stale)
                Spacer(Modifier.width(10.dp))
                Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.padding(vertical = 6.dp)) {
                    TrendArrow(s.trend.direction, MaterialTheme.colorScheme.onSurface, 12.dp)
                    Spacer(Modifier.width(6.dp))
                    Text(i.trendWords, style = MaterialTheme.typography.bodyMedium, fontWeight = FontWeight.Medium)
                }
            }
            Spacer(Modifier.height(6.dp))
            Text(i.anchor, style = MaterialTheme.typography.bodyMedium, color = muted)
            Spacer(Modifier.height(14.dp))
            HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant)
            Spacer(Modifier.height(10.dp))
            // Official figure: always visible, smaller, no "lagging" (COPY §6).
            // Stacked (not side by side) so large text never squeezes the label (QA S14).
            Text(i.officialPsiLabel, style = MaterialTheme.typography.titleSmall)
            Text(Insight.PSI_CAPTION, style = MaterialTheme.typography.bodySmall, color = muted)
            TextButton(onClick = onWhy, contentPadding = PaddingValues(horizontal = 0.dp, vertical = 4.dp)) {
                Text(Insight.WHY_TWO_NUMBERS_LINK)
            }
        }
    }
}

@Composable
private fun BandChip(band: Band, bg: Color, stale: Boolean) {
    val fg = band.on(bg, Contrast.TEXT)
    val shape = RoundedCornerShape(50)
    val base = Modifier.clip(shape)
    val mod = if (stale) base.border(1.5.dp, fg, shape) else base.background(band.color.copy(alpha = 0.20f))
    Row(
        verticalAlignment = Alignment.CenterVertically,
        modifier = mod.padding(horizontal = 10.dp, vertical = 5.dp)
            .semantics(mergeDescendants = true) { contentDescription = band.label + if (stale) ", old reading" else "" },
    ) {
        BandIcon(band, band.on(bg, Contrast.ICON), 14.dp, outline = stale)
        Spacer(Modifier.width(6.dp))
        Text(band.label + if (stale) " (old)" else "", style = MaterialTheme.typography.labelLarge, color = fg, fontWeight = FontWeight.SemiBold)
    }
}

@Composable
private fun Provenance(i: Insight, state: UiState, d: HazeData) {
    val muted = MaterialTheme.colorScheme.onSurfaceVariant
    val notes = listOfNotNull(
        i.note,
        if (state.locating) "Finding your spot…" else null,
        if (state.locationFailed) "Showing ${Format.regionName(d.snapshot.nearestRegion)}. Pick your area, or allow location for a closer reading." else null,
    ).distinct()
    Column(Modifier.padding(horizontal = 6.dp)) {
        Row {
            Icon(Icons.Filled.LocationOn, null, Modifier.size(16.dp).padding(top = 2.dp), tint = muted)
            Spacer(Modifier.width(6.dp))
            Text(i.provenance, style = MaterialTheme.typography.bodySmall, color = muted)
        }
        notes.forEach {
            Spacer(Modifier.height(4.dp))
            Text(it, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurface)
        }
    }
}

@Composable
private fun SectionCard(title: String, trailing: (@Composable () -> Unit)? = null, content: @Composable () -> Unit) {
    Card(
        shape = RoundedCornerShape(24.dp),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceContainer),
        modifier = Modifier.fillMaxWidth(),
    ) {
        Column(Modifier.padding(18.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(title, style = MaterialTheme.typography.titleMedium, modifier = Modifier.weight(1f).semantics { heading() })
                trailing?.invoke()
            }
            Spacer(Modifier.height(10.dp))
            content()
        }
    }
}

@Composable
private fun ActionsCard(i: Insight, onMore: () -> Unit) = SectionCard("What you can do") {
    if (i.actions.isEmpty()) {
        Text(i.calmLine ?: "Enjoy the fresh air.", style = MaterialTheme.typography.bodyLarge)
    } else {
        i.actions.take(3).forEach { a ->
            Row(Modifier.padding(vertical = 4.dp)) {
                Icon(Icons.Filled.CheckCircle, null, Modifier.size(18.dp).padding(top = 2.dp), tint = MaterialTheme.colorScheme.primary)
                Spacer(Modifier.width(10.dp))
                Text(a, style = MaterialTheme.typography.bodyMedium)
            }
        }
    }
    TextButton(onClick = onMore, contentPadding = PaddingValues(0.dp)) { Text("More tips") }
}

@Composable
private fun ChartCard(d: HazeData, onWhy: () -> Unit) {
    val s = d.snapshot
    val bg = MaterialTheme.colorScheme.surfaceContainer
    val line = MaterialTheme.colorScheme.onSurface
    val grid = MaterialTheme.colorScheme.outline
    val text = MaterialTheme.colorScheme.onSurfaceVariant
    val density = LocalDensity.current.density
    SectionCard(Chart.TITLE, trailing = { IconButton(onClick = onWhy) { Icon(Icons.Outlined.Info, Insight.WHY_TWO_NUMBERS_LINK) } }) {
        Canvas(
            Modifier.fillMaxWidth().height(180.dp).semantics { contentDescription = Chart.accessibility(s.history, d.avgLine) },
        ) {
            drawIntoCanvas {
                ChartPainter.draw(
                    it.nativeCanvas, size.width, size.height, s.history, d.avgLine,
                    ChartStyle(bg.toArgb(), line.toArgb(), grid.toArgb(), text.toArgb(), labels = true, density = density),
                )
            }
        }
        Spacer(Modifier.height(8.dp))
        Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.clearAndSetSemantics { }) {
            BandIcon(s.band, s.band.on(bg, Contrast.ICON), 10.dp)
            Spacer(Modifier.width(6.dp))
            Text(Chart.LEGEND_BARS, style = MaterialTheme.typography.labelSmall, color = text)
        }
        Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.clearAndSetSemantics { }) {
            Box(Modifier.width(10.dp).height(3.dp).background(line))
            Spacer(Modifier.width(6.dp))
            Text(Chart.LEGEND_LINE, style = MaterialTheme.typography.labelSmall, color = text)
        }
        Spacer(Modifier.height(8.dp))
        Text(Chart.CAPTION, style = MaterialTheme.typography.bodySmall, color = text)
        Text(Format.asOf(s), style = MaterialTheme.typography.bodySmall, color = text)
    }
}

@Composable
private fun RegionsCard(
    d: HazeData,
    settings: Settings,
    onRegion: (String) -> Unit,
) = SectionCard("Across Singapore") {
    val s = d.snapshot
    val usingGps = s.locationMode == LocationMode.GPS
    val bg = MaterialTheme.colorScheme.surfaceContainer
    val muted = MaterialTheme.colorScheme.onSurfaceVariant
    Text("Tap a station to see its area.", style = MaterialTheme.typography.bodySmall, color = muted)
    Spacer(Modifier.height(4.dp))
    listOf("north", "west", "central", "east", "south").forEach { name ->
        val r = s.regions[name] ?: return@forEach
        HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant)
        val pm = r.pm25
        val band = pm?.let(HazeCore::band)
        val mine = when {
            name != s.nearestRegion || s.locationMode == LocationMode.ISLAND -> ""
            usingGps -> " (nearest)"
            settings.mode == sg.hazenow.data.PlaceMode.REGION -> " (your area)"
            else -> ""
        }
        val row = if (pm == null) "${Format.regionName(name)} · offline" else "${Format.regionName(name)} · $pm · ${band!!.label}"
        Row(
            verticalAlignment = Alignment.CenterVertically,
            modifier = Modifier.fillMaxWidth().clickable(onClickLabel = "Show ${Format.regionName(name)}") { onRegion(name) }
                .padding(vertical = 12.dp)
                .semantics(mergeDescendants = true) { contentDescription = row + mine },
        ) {
            if (band != null) BandIcon(band, band.on(bg, Contrast.ICON), 16.dp) else Spacer(Modifier.width(16.dp))
            Spacer(Modifier.width(12.dp))
            Text(
                row + mine,
                style = MaterialTheme.typography.bodyLarge,
                fontWeight = if (mine.isNotEmpty()) FontWeight.SemiBold else FontWeight.Normal,
                color = if (pm == null) muted else MaterialTheme.colorScheme.onSurface,
            )
        }
    }
}

@Composable
private fun AlertsCard(settings: Settings, onWatch: (Boolean) -> Unit, onAlerts: (Boolean) -> Unit, onElevated: (Boolean) -> Unit) =
    SectionCard("Notifications") {
        SwitchRow("Tell me when it changes", "Only when the band changes near you, and when it's clear again. Never at night (10pm–7am).", settings.bandAlerts, onAlerts)
        if (settings.bandAlerts) {
            SwitchRow("Include Elevated", "Also tell me when it goes up to Elevated. High and above always notify.", settings.alertPrefs.elevatedEnabled, onElevated)
        }
        SwitchRow("Haze watch", "A quiet, ongoing notification with the number in your status bar.", settings.hazeWatch, onWatch)
    }

@Composable
private fun SwitchRow(title: String, subtitle: String, checked: Boolean, onChange: (Boolean) -> Unit) {
    Row(
        verticalAlignment = Alignment.CenterVertically,
        modifier = Modifier.fillMaxWidth().clickable(role = Role.Switch) { onChange(!checked) }.padding(vertical = 8.dp),
    ) {
        Column(Modifier.weight(1f)) {
            Text(title, style = MaterialTheme.typography.bodyLarge)
            Text(subtitle, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
        Spacer(Modifier.width(12.dp))
        Switch(checked = checked, onCheckedChange = null)
    }
}

@Composable
private fun Footer(onInfo: () -> Unit, onNea: () -> Unit, onLicences: () -> Unit, onAbout: () -> Unit) {
    Column(Modifier.fillMaxWidth().padding(top = 4.dp), horizontalAlignment = Alignment.CenterHorizontally) {
        TextButton(onClick = onInfo) { Text("How we calculate this") }
        TextButton(onClick = onNea) { Text("Planning for tomorrow? NEA's 24-hr PSI forecast") }
        TextButton(onClick = onAbout) { Text("Made by Yong Quan Tan") }
        TextButton(onClick = onLicences) { Text("Open-source licences") }
        Text(
            Insight.FOOTER,
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            textAlign = TextAlign.Center,
        )
    }
}

@OptIn(ExperimentalMaterial3Api::class, ExperimentalLayoutApi::class)
@Composable
private fun ProfileSheet(initial: Set<Profile>, onDone: (Set<Profile>) -> Unit) {
    var sel by remember { mutableStateOf(initial) }
    ModalBottomSheet(onDismissRequest = { onDone(sel) }, sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)) {
        Column(Modifier.padding(horizontal = 24.dp).padding(bottom = 32.dp)) {
            Text("Who are you checking for?", style = MaterialTheme.typography.headlineSmall)
            Spacer(Modifier.height(6.dp))
            Text("We'll give advice that fits. You can pick more than one.", style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
            Spacer(Modifier.height(16.dp))
            FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                Profile.entries.forEach { p ->
                    FilterChip(selected = p in sel, onClick = { sel = Profile.toggle(sel, p) }, label = { Text(p.pickerLabel) })
                }
            }
            Spacer(Modifier.height(12.dp))
            Text("Saved on this device only. Change it any time in Settings.", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            Spacer(Modifier.height(12.dp))
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.End) {
                TextButton(onClick = { onDone(setOf(Profile.GENERAL)) }) { Text("Skip for now") }
                Spacer(Modifier.width(8.dp))
                Button(onClick = { onDone(sel) }) { Text("Done") }
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun TipsSheet(i: Insight, onNea: () -> Unit, onDismiss: () -> Unit) {
    ModalBottomSheet(onDismissRequest = onDismiss) {
        Column(Modifier.padding(horizontal = 24.dp).padding(bottom = 32.dp).verticalScroll(rememberScrollState())) {
            Text("More tips", style = MaterialTheme.typography.headlineSmall)
            Spacer(Modifier.height(12.dp))
            (i.actions.drop(3) + Insight.MORE_TIPS).forEach {
                Text("• $it", style = MaterialTheme.typography.bodyMedium, modifier = Modifier.padding(vertical = 4.dp))
            }
            TextButton(onClick = onNea, contentPadding = PaddingValues(0.dp)) { Text("Open NEA's haze page") }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun InfoSheet(onDismiss: () -> Unit) {
    ModalBottomSheet(onDismissRequest = onDismiss) {
        Column(Modifier.padding(horizontal = 24.dp).padding(bottom = 32.dp).verticalScroll(rememberScrollState())) {
            Text("How we calculate this", style = MaterialTheme.typography.headlineSmall)
            Spacer(Modifier.height(12.dp))
            HOW.forEach { (t, b) ->
                Text(t, style = MaterialTheme.typography.titleSmall)
                Text(b, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                Spacer(Modifier.height(12.dp))
            }
        }
    }
}

/** COPY §12, verbatim. */
private val HOW = listOf(
    "Where the numbers come from" to "Every number here comes from the National Environment Agency (NEA), published on data.gov.sg. We don't have our own sensors and we don't change NEA's readings.",
    "The big number: 1-hr PM2.5" to "PM2.5 is tiny particles in the air, the main part of haze. NEA measures it every hour at five stations: North, South, East, West and Central. The big number is the latest hour, in micrograms per cubic metre (µg/m³). NEA recommends this reading for deciding what to do in the next hour or so.",
    "Your spot" to "If you share your location, we estimate the reading for your spot from all of NEA's stations. Closer stations count more. If you're right next to a station, we use that station. If you don't share your location, we use the area you pick. Your location stays on your device.",
    "The advice" to "We use NEA's four bands for 1-hr PM2.5: Normal (0–55), Elevated (56–150), High (151–250) and Very High (251 and above). The advice for each band follows NEA's personal guide for healthy and vulnerable people. Vulnerable means older adults, pregnant women, children, and people with chronic lung or heart disease. We only put it in everyday words.",
    "NEA's 24-hr PSI" to "We also show NEA's official 24-hr PSI. It averages the last 24 hours, so it moves slowly. It's the right number for planning tomorrow, and schools and events use NEA's 24-hr PSI forecast. The chart shows both, so you can see how they move.",
    "Trend" to "We compare this hour with the hour before. \"Rising\" means up by 5 or more. \"Rising fast\" means up by 20 or more.",
    "When data is late or missing" to "NEA usually posts each hour's reading about 30 minutes later. Sometimes a station goes offline, and we then use the other stations and tell you. If readings are more than 2 hours old, we say so clearly.",
    "What this app is not" to "It's not medical advice, and it's not an official NEA app. If you feel unwell, see a doctor. In an emergency, call 995.",
    "Check our work" to "HazeNow is free and open source (MIT). All the maths is public, and every app uses the same rules.",
)
