package sg.hazenow.ui

import android.content.Context
import android.content.Intent
import android.net.Uri
import androidx.compose.animation.animateColorAsState
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.focusable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
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
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.LocationOn
import androidx.compose.material.icons.filled.Person
import androidx.compose.material.icons.filled.Search
import androidx.compose.material.icons.filled.Share
import androidx.compose.material3.AssistChip
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
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
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.drawscope.drawIntoCanvas
import androidx.compose.ui.graphics.lerp
import androidx.compose.ui.graphics.nativeCanvas
import androidx.compose.ui.graphics.toArgb
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
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import sg.hazenow.core.Area
import sg.hazenow.core.Areas
import sg.hazenow.core.Band
import sg.hazenow.core.Contrast
import sg.hazenow.core.Experience
import sg.hazenow.core.HistoryPoint
import sg.hazenow.core.Profile
import sg.hazenow.core.sea.CityPlace
import sg.hazenow.core.sea.CountryCode
import sg.hazenow.core.sea.CountrySnapshot
import sg.hazenow.core.sea.CountryUi
import sg.hazenow.core.sea.Coverage
import sg.hazenow.core.sea.Registry
import sg.hazenow.core.sea.SeaPlaces
import sg.hazenow.core.sea.Verdicts
import sg.hazenow.data.AreaList
import sg.hazenow.data.CityWhere
import sg.hazenow.data.CountryProblem
import sg.hazenow.data.CountryResult
import sg.hazenow.data.SeaRepository
import sg.hazenow.render.ChartPainter
import sg.hazenow.render.ChartStyle
import java.util.TimeZone

/* ----------------------------------------------------------------------------------------------- helpers */

private fun hex(c: String): Long = 0xFF000000L or c.removePrefix("#").toLong(16)

/** An authority's colour, adjusted only in lightness until it reaches [target] contrast on [bg] (SPEC v1.2 §11). */
private fun tone(colorHex: String, bg: Color, target: Double): Color =
    Color(Contrast.ensure(hex(colorHex), bg.toArgb().toLong() and 0xFFFFFFFFL, target))

/** COPY §3 shapes by name (the same drawings as the SG band icon). */
@Composable
private fun ShapeIcon(shape: String, tint: Color, size: Dp, outline: Boolean = false) = BandIcon(
    when (shape) { "half" -> Band.ELEVATED; "triangle" -> Band.HIGH; "octagon" -> Band.VERY_HIGH; else -> Band.NORMAL }, tint, size, outline,
)

private fun viewerOffsetHours(): Double = TimeZone.getDefault().getOffset(System.currentTimeMillis()) / 3_600_000.0

fun countryName(cc: CountryCode): String = Registry.of(cc).name

/** "Live" · "Not yet on this app" (proxied, no proxy in this build) · "Not yet" (COVERAGE.md). */
private fun countryStatus(cc: CountryCode, proxy: Boolean): String = when (Registry.of(cc).status) {
    Coverage.LIVE_DIRECT -> "Live"
    Coverage.NEEDS_PROXY -> if (proxy) "Live" else "Not yet on this app"
    else -> "Not yet"
}

fun shareCountryText(ctx: Context, s: CountrySnapshot, w: CityWhere) {
    val text = CountryUi.countryShareText(s, w.name, lon = w.lon)
    val intent = Intent(Intent.ACTION_SEND).apply { type = "text/plain"; putExtra(Intent.EXTRA_TEXT, text) }
    ctx.startActivity(Intent.createChooser(intent, "Share").addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
}

/* ----------------------------------------------------------------------------------------------- main content */

@OptIn(ExperimentalLayoutApi::class)
@Composable
fun CountryContent(
    state: UiState,
    w: CityWhere,
    topPadding: Dp,
    hasPermission: Boolean,
    onLocation: () -> Unit,
    onChange: (CountryCode?) -> Unit,
    onRetry: () -> Unit,
    onWho: () -> Unit,
    onInfo: () -> Unit,
    onAbout: () -> Unit,
    onLicences: () -> Unit,
    showHomeOffer: Boolean = false,
    onHomeOfferDone: () -> Unit = {},
) {
    val ctx = LocalContext.current
    val muted = MaterialTheme.colorScheme.onSurfaceVariant
    val proxy = SeaRepository.edge(state.settings) != null
    LazyColumn(
        contentPadding = PaddingValues(start = 16.dp, end = 16.dp, top = topPadding, bottom = 32.dp),
        verticalArrangement = Arrangement.spacedBy(14.dp),
        modifier = Modifier.fillMaxSize().navigationBarsPadding(),
    ) {
        item {
            Text(
                "${w.name} · ${countryName(w.country)}",
                style = MaterialTheme.typography.titleMedium,
                color = muted,
                modifier = Modifier.semantics { heading() },
            )
        }
        state.guess?.takeIf { w.guessed && (it.sure || it.start.notCoveredFrom != null) }?.let { g ->
            item { GuessBanner(g, w, onChange = { onChange(null) }, onLocation = onLocation) }
        }
        item {
            Row(
                Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()),
                horizontalArrangement = Arrangement.spacedBy(8.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                if (w.gps) {
                    FilterChip(selected = true, onClick = onLocation, label = { Text(if (state.locating) "Finding your spot…" else "Near you") },
                        leadingIcon = { Icon(Icons.Filled.LocationOn, null, Modifier.size(18.dp)) })
                } else {
                    AssistChip(onClick = onLocation, label = { Text(if (hasPermission) "Near you" else "Use my location") },
                        leadingIcon = { Icon(Icons.Filled.LocationOn, null, Modifier.size(18.dp)) })
                    FilterChip(selected = true, onClick = { onChange(w.country) }, label = { Text(w.name) })
                }
                AssistChip(onClick = { onChange(null) }, label = { Text("Change") }, leadingIcon = { Icon(Icons.Filled.Search, null, Modifier.size(18.dp)) })
            }
        }
        when (val r = state.country) {
            is CountryResult.Unavailable -> item { UnavailableCard(r, w) }
            is CountryResult.Failed -> item { FailedCard(r.problem, w.country, onRetry) }
            is CountryResult.Data -> {
                val s = r.snap
                if (r.fromCache && r.problem != CountryProblem.NONE) {
                    item {
                        val line = when (r.problem) {
                            CountryProblem.OFFLINE -> "You're offline. Showing the reading from ${CountryUi.stationTime(s.observedAt, s.country, viewerOffsetHours(), w.lon)}."
                            CountryProblem.OFFICIAL, CountryProblem.API ->
                                CountryUi.officialDownCopy(s.country, s.observedAt, System.currentTimeMillis(), viewerOffsetHours()).cachedLine!!
                            else -> "No usable reading came back this time. Showing the last one we got. We'll try again soon."
                        }
                        Surface(color = MaterialTheme.colorScheme.secondaryContainer, shape = RoundedCornerShape(16.dp)) {
                            Text(line, Modifier.padding(12.dp).fillMaxWidth(), style = MaterialTheme.typography.bodyMedium,
                                color = MaterialTheme.colorScheme.onSecondaryContainer)
                        }
                    }
                }
                item { CountryVerdictCard(s, w, state.settings.profiles, dim = r.fromCache && r.problem == CountryProblem.OFFLINE, onWho = onWho,
                    onShare = { shareCountryText(ctx, s, w) }) }
                item { CountryProvenance(s, w) }
                if (showHomeOffer) item { HomeOfferCard(onDone = onHomeOfferDone) }
                val band = Verdicts.adviceBand(s)
                if (band != null) item { CountryActions(s, state.settings.profiles, band) }
                if (s.history.size >= 2) item { CountryChart(s, w) }
                if (s.stations.isNotEmpty()) item { StationsCard(s) }
                item { AttributionFooter(s) }
            }
            null -> item {
                Box(Modifier.fillMaxWidth().padding(vertical = 48.dp), contentAlignment = Alignment.Center) {
                    Column(horizontalAlignment = Alignment.CenterHorizontally) {
                        CircularProgressIndicator()
                        Spacer(Modifier.height(16.dp))
                        Text("Getting the latest reading…", style = MaterialTheme.typography.titleLarge, textAlign = TextAlign.Center)
                    }
                }
            }
        }
        state.guess?.takeIf { w.guessed && !it.sure && it.start.notCoveredFrom == null }?.let {
            item { WhereCheckingCard(proxy, onCountry = onChange) }
        }
        item { HomeShortcutsCard() }
        item {
            Column(Modifier.fillMaxWidth().padding(top = 4.dp), horizontalAlignment = Alignment.CenterHorizontally) {
                TextButton(onClick = onInfo) { Text("How we calculate this") }
                TextButton(onClick = onAbout) { Text("Made by Yong Quan Tan") }
                TextButton(onClick = onLicences) { Text("Open-source licences") }
                Text("Free & open source · No ads, no tracking, no account", style = MaterialTheme.typography.bodySmall, color = muted, textAlign = TextAlign.Center)
            }
        }
    }
}

/** SPEC v2.1 §4: one calm line above the reading. Never blocks, never prompts. */
@Composable
private fun GuessBanner(g: GuessUi, w: CityWhere, onChange: () -> Unit, onLocation: () -> Unit) {
    val text = g.start.notCoveredFrom?.let { cc ->
        "${countryName(cc)} isn't available yet. Showing ${w.name}, the nearest place we cover."
    } ?: "Showing ${w.name}"
    Surface(color = MaterialTheme.colorScheme.surfaceContainerHigh, shape = RoundedCornerShape(16.dp)) {
        Column(Modifier.padding(horizontal = 14.dp, vertical = 8.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(text, style = MaterialTheme.typography.bodyMedium, modifier = Modifier.weight(1f))
                TextButton(onClick = onChange) { Text("Change") }
            }
            TextButton(onClick = onLocation, contentPadding = PaddingValues(0.dp)) { Text("Use my precise location") }
        }
    }
}

/** SPEC v2.1 §4: unsure guess → a non-blocking card under the reading, one chip per country. */
@OptIn(ExperimentalLayoutApi::class)
@Composable
fun WhereCheckingCard(proxy: Boolean, onCountry: (CountryCode) -> Unit) {
    Card(
        shape = RoundedCornerShape(24.dp),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceContainer),
        modifier = Modifier.fillMaxWidth(),
    ) {
        Column(Modifier.padding(18.dp)) {
            Text("Where are you checking?", style = MaterialTheme.typography.titleMedium, modifier = Modifier.semantics { heading() })
            Spacer(Modifier.height(4.dp))
            Text("Pick a country to see its places. Nothing is sent anywhere.", style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant)
            Spacer(Modifier.height(8.dp))
            FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                SeaPlaces.PICKER_COUNTRIES.forEach { cc ->
                    AssistChip(onClick = { onCountry(cc) }, label = { Text(countryName(cc)) },
                        modifier = Modifier.semantics { contentDescription = "${countryName(cc)}, ${countryStatus(cc, proxy)}" })
                }
            }
        }
    }
}

@Composable
private fun UnavailableCard(r: CountryResult.Unavailable, w: CityWhere) {
    val c = r.city
    val (title, body) = if (r.proxyMissing) {
        "Not available yet on this app" to
            "Readings for ${w.name} come through HazeNow's own server, which this version of the app isn't connected to yet. " +
            "We won't show recorded or made-up numbers instead."
    } else {
        SeaPlaces.NOT_AVAILABLE_HEADLINE to (c.reason ?: if (c.status == Coverage.NEEDS_PERMISSION) SeaPlaces.NOT_AVAILABLE_NEEDS_PERMISSION else SeaPlaces.NOT_AVAILABLE_NOT_FEASIBLE)
    }
    Card(shape = RoundedCornerShape(28.dp), colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceContainer), modifier = Modifier.fillMaxWidth()) {
        Column(Modifier.padding(20.dp)) {
            Text(title, style = MaterialTheme.typography.headlineSmall, modifier = Modifier.semantics { heading() })
            Spacer(Modifier.height(8.dp))
            Text(body, style = MaterialTheme.typography.bodyLarge, color = MaterialTheme.colorScheme.onSurfaceVariant)
            if (!r.proxyMissing) c.fix?.let {
                Spacer(Modifier.height(8.dp))
                Text("What would fix it: $it", style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        }
    }
}

@Composable
private fun FailedCard(p: CountryProblem, cc: CountryCode, onRetry: () -> Unit) {
    val (title, line) = when (p) {
        CountryProblem.OFFLINE -> "Can't load the air reading" to "You're offline. Connect to see the latest reading."
        CountryProblem.NO_DATA -> "No reading available" to "The data didn't include a usable reading near here this time. We'll try again soon."
        CountryProblem.OFFICIAL -> CountryUi.officialDownCopy(cc).let { it.title to it.line }
        else -> "Can't reach the air data right now" to "We'll try again in a few minutes."
    }
    Column(Modifier.fillMaxWidth().padding(vertical = 32.dp), horizontalAlignment = Alignment.CenterHorizontally) {
        Text(title, style = MaterialTheme.typography.titleLarge, textAlign = TextAlign.Center)
        Spacer(Modifier.height(8.dp))
        Text(line, textAlign = TextAlign.Center, color = MaterialTheme.colorScheme.onSurfaceVariant)
        Spacer(Modifier.height(16.dp))
        Button(onClick = onRetry) { Text("Try again") }
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun CountryVerdictCard(s: CountrySnapshot, w: CityWhere, profiles: Set<Profile>, dim: Boolean, onWho: () -> Unit, onShare: () -> Unit) {
    val d = CountryUi.countryDisplay(s, w.name, viewerOffsetHours(), w.lon)
    val v = Verdicts.countryVerdict(s, profiles)
    val surface = MaterialTheme.colorScheme.surfaceContainer
    val chipHex = d.chip?.color
    val tint by animateColorAsState(chipHex?.let { Color(hex(it).toInt()) } ?: surface, tween(600), label = "chip")
    val cardBg = if (chipHex != null) lerp(surface, tint, 0.12f) else surface
    val onCard = MaterialTheme.colorScheme.onSurface
    val muted = MaterialTheme.colorScheme.onSurfaceVariant
    val numberColor = if (dim || chipHex == null) onCard else tone(chipHex, cardBg, Contrast.TEXT)
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
                    Text(v.forWhom, style = MaterialTheme.typography.labelLarge, color = muted)
                }
                Spacer(Modifier.weight(1f))
                Button(onClick = onShare, contentPadding = PaddingValues(horizontal = 18.dp, vertical = 8.dp)) {
                    Icon(Icons.Filled.Share, null, Modifier.size(18.dp))
                    Spacer(Modifier.width(8.dp))
                    Text("Share")
                }
            }
            Spacer(Modifier.height(12.dp))
            // The headline is always a verdict, in the normal text colour (COPY §20.1).
            Text(
                v.headline,
                style = MaterialTheme.typography.headlineSmall,
                color = onCard,
                modifier = Modifier.semantics { heading(); liveRegion = LiveRegionMode.Polite },
            )
            v.headlineLocal?.let { Text(it, style = MaterialTheme.typography.bodyMedium, color = muted) }
            v.secondLine?.let {
                Spacer(Modifier.height(4.dp))
                Text(it, style = MaterialTheme.typography.bodyLarge, color = muted)
            }
            Spacer(Modifier.height(6.dp))
            if (s.pm25 != null) {
                Row(verticalAlignment = Alignment.Bottom, modifier = Modifier.clearAndSetSemantics {
                    contentDescription = "${s.pm25} micrograms per cubic metre, ${d.numberSub}"
                }) {
                    Text(s.pm25.toString(), style = MaterialTheme.typography.displayLarge, color = numberColor)
                    Spacer(Modifier.width(10.dp))
                    Column(Modifier.padding(bottom = 16.dp).weight(1f)) {
                        Text("µg/m³", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold)
                        Text(d.numberSub, style = MaterialTheme.typography.bodySmall, color = muted)
                    }
                }
            } else d.noNumber?.let { (title, line) ->
                Text(title, style = MaterialTheme.typography.titleLarge)
                Text(line, style = MaterialTheme.typography.bodyMedium, color = muted)
            }
            d.chip?.let { chip ->
                Spacer(Modifier.height(10.dp))
                FlowRow(verticalArrangement = Arrangement.Center) {
                    val fg = tone(chip.color, cardBg, Contrast.TEXT)
                    val shape = RoundedCornerShape(50)
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        modifier = (if (s.stale) Modifier.clip(shape).border(1.5.dp, fg, shape) else Modifier.clip(shape).background(Color(hex(chip.color).toInt()).copy(alpha = 0.20f)))
                            .padding(horizontal = 10.dp, vertical = 5.dp)
                            .semantics(mergeDescendants = true) {
                                contentDescription = listOfNotNull(chip.en, chip.local, chip.agency, if (chip.estimate) "estimate" else null, if (s.stale) "old reading" else null).joinToString(", ")
                            },
                    ) {
                        ShapeIcon(chip.shape, tone(chip.color, cardBg, Contrast.ICON), 14.dp, outline = s.stale)
                        Spacer(Modifier.width(6.dp))
                        Text(chip.en + if (s.stale) " (old)" else "", style = MaterialTheme.typography.labelLarge, color = fg, fontWeight = FontWeight.SemiBold)
                        chip.local?.let {
                            Spacer(Modifier.width(6.dp))
                            Text(it, style = MaterialTheme.typography.labelMedium, color = fg)
                        }
                        if (chip.estimate) {
                            Spacer(Modifier.width(6.dp))
                            Text("estimate", Modifier.border(1.dp, fg, RoundedCornerShape(50)).padding(horizontal = 6.dp, vertical = 1.dp),
                                style = MaterialTheme.typography.labelSmall, color = fg)
                        }
                    }
                    if (s.pm25 != null && s.history.size >= 2 && !s.stale) {
                        Spacer(Modifier.width(10.dp))
                        Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.padding(vertical = 6.dp)) {
                            TrendArrow(s.trend.direction, onCard, 12.dp)
                            Spacer(Modifier.width(6.dp))
                            Text(Experience.trend(s.sgHistory).words, style = MaterialTheme.typography.bodyMedium, fontWeight = FontWeight.Medium)
                        }
                    }
                }
                Spacer(Modifier.height(4.dp))
                Text(chip.basisNote, style = MaterialTheme.typography.bodySmall, color = muted)
            }
            d.whoLine?.let { Spacer(Modifier.height(4.dp)); Text(it, style = MaterialTheme.typography.bodyMedium, color = muted) }
            d.sensorLine?.let {
                Spacer(Modifier.height(6.dp))
                Text("$it It's a community sensor, not an official reading.", style = MaterialTheme.typography.bodyMedium)
            }
            d.official?.let { o ->
                Spacer(Modifier.height(14.dp))
                HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant)
                Spacer(Modifier.height(10.dp))
                Text(o.label + ": " + o.value + (o.en?.let { " · $it" } ?: ""), style = MaterialTheme.typography.titleSmall)
                o.local?.let { Text(it, style = MaterialTheme.typography.bodySmall, color = muted) }
                d.officialExplainer?.let { Text(it, style = MaterialTheme.typography.bodySmall, color = muted) }
            }
        }
    }
}

@Composable
private fun CountryProvenance(s: CountrySnapshot, w: CityWhere) {
    val d = CountryUi.countryDisplay(s, w.name, viewerOffsetHours(), w.lon)
    val muted = MaterialTheme.colorScheme.onSurfaceVariant
    val lines = listOfNotNull(d.kindLabel) + d.notices + listOfNotNull(if (!w.gps) w.city.note else null)
    Column(Modifier.padding(horizontal = 6.dp)) {
        d.provenance?.let {
            Row {
                Icon(Icons.Filled.LocationOn, null, Modifier.size(16.dp).padding(top = 2.dp), tint = muted)
                Spacer(Modifier.width(6.dp))
                Text(it, style = MaterialTheme.typography.bodySmall, color = muted)
            }
        }
        lines.forEach {
            Spacer(Modifier.height(4.dp))
            Text(it, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurface)
        }
    }
}

@Composable
private fun CountryCard(title: String, content: @Composable () -> Unit) {
    Card(shape = RoundedCornerShape(24.dp), colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceContainer), modifier = Modifier.fillMaxWidth()) {
        Column(Modifier.padding(18.dp)) {
            Text(title, style = MaterialTheme.typography.titleMedium, modifier = Modifier.semantics { heading() })
            Spacer(Modifier.height(10.dp))
            content()
        }
    }
}

@Composable
private fun CountryActions(s: CountrySnapshot, profiles: Set<Profile>, band: Band) = CountryCard("What you can do") {
    val actions = Verdicts.countryActions(s, profiles).take(3)
    if (actions.isEmpty() || band == Band.NORMAL) {
        Text("Enjoy the fresh air.", style = MaterialTheme.typography.bodyLarge)
    } else actions.forEach { a ->
        Row(Modifier.padding(vertical = 4.dp)) {
            Icon(Icons.Filled.CheckCircle, null, Modifier.size(18.dp).padding(top = 2.dp), tint = MaterialTheme.colorScheme.primary)
            Spacer(Modifier.width(10.dp))
            Text(a, style = MaterialTheme.typography.bodyMedium)
        }
    }
}

@Composable
private fun CountryChart(s: CountrySnapshot, w: CityWhere) = CountryCard("Last 24 hours") {
    val bg = MaterialTheme.colorScheme.surfaceContainer
    val line = MaterialTheme.colorScheme.onSurface
    val grid = MaterialTheme.colorScheme.outline
    val text = MaterialTheme.colorScheme.onSurfaceVariant
    val density = LocalDensity.current.density
    val bars = s.sgHistory
    val avg = s.history.mapNotNull { h -> h.pm25Avg24h?.let { HistoryPoint(h.time, Math.round(it).toInt()) } }
    // One neutral colour: NEA's bands never describe another country's air (SPEC v2.0 §5).
    val barArgb = tone("#8FA3AD", bg, Contrast.ICON).toArgb()
    val hasLine = avg.size >= 2
    Canvas(Modifier.fillMaxWidth().height(180.dp).semantics {
        contentDescription = "Hourly PM2.5 for the last ${bars.size} hours, latest ${bars.last().pm25}" + if (hasLine) ", with the 24-hour average as a line" else ""
    }) {
        drawIntoCanvas {
            ChartPainter.draw(
                it.nativeCanvas, size.width, size.height, bars, avg,
                ChartStyle(bg.toArgb(), line.toArgb(), grid.toArgb(), text.toArgb(), labels = true, density = density),
                guides = emptyList(), barColor = { barArgb }, minScale = 50,
                clock = { t -> Verdicts.formatLocalTime(CountryUi.toLocalIso(t, s.country, w.lon)) },
            )
        }
    }
    Spacer(Modifier.height(8.dp))
    Text(
        (if (s.pm25Kind == "crowd_estimate") "Bars: community-sensor estimate for each hour (µg/m³)." else "Bars: 1-hr PM2.5 for each hour (µg/m³).") +
            if (hasLine) " Line: ${s.official?.agency ?: "the authority"}'s 24-hour average PM2.5." else "",
        style = MaterialTheme.typography.bodySmall, color = text,
    )
    Text("Times are local (${CountryUi.zoneLabel(CountryUi.localOffsetHours(s.country, w.lon), s.country)}).", style = MaterialTheme.typography.bodySmall, color = text)
}

@Composable
private fun StationsCard(s: CountrySnapshot) = CountryCard("Nearby stations and sensors") {
    val muted = MaterialTheme.colorScheme.onSurfaceVariant
    Text("Same country only. Official readings are never mixed across a border.", style = MaterialTheme.typography.bodySmall, color = muted)
    s.stations.take(6).forEach { st ->
        HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant)
        val kind = if (st.grade == "reference") "official" else "community sensor"
        val value = st.pm25_1h?.let { "${Math.round(it)} µg/m³" } ?: st.official?.let { "${it.name} ${it.valueText}" } ?: "no reading"
        val km = st.distanceKm?.let { " · ${Verdicts.fmt1(it)} km" } ?: ""
        Column(Modifier.fillMaxWidth().padding(vertical = 10.dp).semantics(mergeDescendants = true) {}) {
            Text("${st.name} · $value", style = MaterialTheme.typography.bodyLarge)
            Text("$kind$km", style = MaterialTheme.typography.bodySmall, color = muted)
        }
    }
}

@Composable
private fun AttributionFooter(s: CountrySnapshot) {
    val ctx = LocalContext.current
    Column(Modifier.fillMaxWidth().padding(horizontal = 6.dp)) {
        s.attribution.forEach { a ->
            Text(
                a.text + if (a.shareAlike == true) " (${a.licence})" else "",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.primary,
                modifier = Modifier.clickable(role = Role.Button, onClickLabel = "Open ${a.url}") {
                    runCatching { ctx.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(a.url)).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)) }
                }.padding(vertical = 4.dp),
            )
        }
    }
}

/* ----------------------------------------------------------------------------------------------- two-step picker */

/**
 * SPEC v2.1 §4 "Change": step 1 lists the countries (name, status, band dot for the current reading); step 2 is that
 * country's places, Popular first, then all (Singapore: its 55 areas), then "Use my precise location". One search box
 * searches every country and alias ("Bali", "Penang", "KL", "Saigon", "Tampines"). Back returns to the countries.
 * Everything is searched on the phone; nothing is sent.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun PlacePickerSheet(
    startCountry: CountryCode?,
    proxy: Boolean,
    current: CountrySnapshot?,
    onCity: (CityPlace) -> Unit,
    onArea: (Area) -> Unit,
    onIsland: () -> Unit,
    onLocation: () -> Unit,
    onDismiss: () -> Unit,
) {
    val ctx = LocalContext.current
    val areas = remember { AreaList.get(ctx) }
    var step by rememberSaveable { mutableStateOf(startCountry?.name) }
    var q by rememberSaveable { mutableStateOf("") }
    val cc = step?.let { Registry.parse(it) }
    val muted = MaterialTheme.colorScheme.onSurfaceVariant
    val headingFocus = remember { FocusRequester() }
    LaunchedEffect(step) { runCatching { headingFocus.requestFocus() } }

    ModalBottomSheet(onDismissRequest = onDismiss, sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)) {
        Column(Modifier.padding(horizontal = 20.dp).fillMaxHeight(0.92f)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                if (cc != null && q.isBlank()) {
                    IconButton(onClick = { step = null }) { Icon(Icons.AutoMirrored.Filled.ArrowBack, "Back to countries") }
                }
                Text(
                    if (cc == null || q.isNotBlank()) "Where are you checking?" else countryName(cc),
                    style = MaterialTheme.typography.headlineSmall,
                    modifier = Modifier.semantics { heading() }.focusRequester(headingFocus).focusable(),
                )
            }
            Spacer(Modifier.height(8.dp))
            OutlinedTextField(
                value = q, onValueChange = { q = it }, modifier = Modifier.fillMaxWidth(), singleLine = true,
                leadingIcon = { Icon(Icons.Filled.Search, null) },
                placeholder = { Text("City, island or area, e.g. Bali, KL, Tampines") },
                keyboardOptions = KeyboardOptions(imeAction = ImeAction.Search, autoCorrectEnabled = false),
                shape = RoundedCornerShape(16.dp),
            )
            Spacer(Modifier.height(4.dp))
            Text("Searched on your phone. Nothing is sent.", style = MaterialTheme.typography.bodySmall, color = muted)
            Spacer(Modifier.height(4.dp))
            LazyColumn(Modifier.fillMaxWidth()) {
                if (q.isNotBlank()) {
                    val sg = Areas.search(areas, q, limit = 8)
                    val sea = SeaPlaces.searchPlaces(q, 12)
                    if (sg.isEmpty() && sea.isEmpty()) item { Text("Nothing matches \"$q\".", Modifier.padding(vertical = 16.dp), color = muted) }
                    sg.forEach { (area, alias) ->
                        item { PickRow(area.name, listOfNotNull(alias?.takeIf { it != area.name }?.let { "Includes $it" }, "Singapore").joinToString(" · "), null) { onArea(area) } }
                    }
                    sea.forEach { m ->
                        item { CityRow(m.place, proxy, m.matched) { onCity(m.place) } }
                    }
                } else if (cc == null) {
                    SeaPlaces.PICKER_COUNTRIES.forEach { c ->
                        item {
                            val dot = current?.takeIf { it.country == c }?.localBand
                            Row(
                                verticalAlignment = Alignment.CenterVertically,
                                modifier = Modifier.fillMaxWidth().clickable(role = Role.Button) { step = c.name; q = "" }.padding(vertical = 14.dp)
                                    .semantics(mergeDescendants = true) {},
                            ) {
                                Text(countryName(c), style = MaterialTheme.typography.bodyLarge, modifier = Modifier.weight(1f))
                                dot?.let {
                                    ShapeIcon(it.shape, tone(it.color, MaterialTheme.colorScheme.surfaceContainerLow, Contrast.ICON), 12.dp)
                                    Spacer(Modifier.width(8.dp))
                                }
                                val status = countryStatus(c, proxy)
                                Text(status, Modifier.border(1.dp, MaterialTheme.colorScheme.outline, RoundedCornerShape(50)).padding(horizontal = 8.dp, vertical = 2.dp),
                                    style = MaterialTheme.typography.labelSmall, color = if (status == "Live") MaterialTheme.colorScheme.primary else muted)
                            }
                            HorizontalDivider()
                        }
                    }
                } else if (cc == CountryCode.SG) {
                    item { PickRow("All of Singapore", "Island average", null, onIsland) }
                    areas.forEach { a -> item { PickRow(a.name, null, null) { onArea(a) } } }
                    item { PickRow("Use my precise location", "Asks first. Your location stays on your phone.", null, onLocation) }
                } else {
                    val (popular, others) = SeaPlaces.placeGroups(cc)
                    if (popular.isNotEmpty()) {
                        item { SectionLabel("Popular") }
                        popular.forEach { c -> item { CityRow(c, proxy, null) { onCity(c) } } }
                    }
                    if (others.isNotEmpty()) {
                        item { SectionLabel("All places") }
                        others.forEach { c -> item { CityRow(c, proxy, null) { onCity(c) } } }
                    }
                    item { PickRow("Use my precise location", "Asks first. Your location stays on your phone.", null, onLocation) }
                }
            }
        }
    }
}

@Composable
private fun SectionLabel(t: String) =
    Text(t, style = MaterialTheme.typography.titleSmall, color = MaterialTheme.colorScheme.primary, modifier = Modifier.padding(top = 14.dp, bottom = 4.dp).semantics { heading() })

@Composable
private fun CityRow(c: CityPlace, proxy: Boolean, matched: String?, onClick: () -> Unit) {
    val live = CountryUi.cityLive(c, proxy)
    val sub = listOfNotNull(
        matched?.let { "“$it”" },
        c.region?.takeIf { it != c.name && it != matched },
        countryName(c.country),
        when {
            live && c.crowdOnly -> "Community sensors only"
            live -> null
            c.status == Coverage.NEEDS_PROXY -> "Not available yet on this app"
            else -> "Not available yet"
        },
    ).joinToString(" · ")
    PickRow(c.name, sub, null, onClick)
}

@Composable
private fun PickRow(title: String, sub: String?, trailing: String?, onClick: () -> Unit) {
    Column(Modifier.fillMaxWidth().clickable(role = Role.Button, onClick = onClick).padding(vertical = 12.dp)) {
        Text(title, style = MaterialTheme.typography.bodyLarge)
        sub?.let { Text(it, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant) }
        trailing?.let { Text(it) }
    }
    HorizontalDivider()
}
