package sg.hazenow.ui

import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.verticalScroll
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Edit
import androidx.compose.material.icons.filled.Home
import androidx.compose.material.icons.filled.LocationOn
import androidx.compose.material.icons.filled.Search
import androidx.compose.material3.AssistChip
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilledTonalButton
import androidx.compose.material3.FilterChip
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import sg.hazenow.core.Area
import sg.hazenow.core.Areas
import sg.hazenow.core.Insight
import sg.hazenow.data.AreaList
import sg.hazenow.data.PlaceKeys
import sg.hazenow.data.PlaceMode
import sg.hazenow.data.Settings

/** SPEC v1.4 §1: two equal choices, and no OS prompt until the user taps. */
@Composable
fun FirstRunScreen(modifier: Modifier, onLocation: () -> Unit, onPickArea: () -> Unit, onSkip: () -> Unit) {
    Box(modifier.fillMaxSize().padding(24.dp), contentAlignment = Alignment.Center) {
        Column(Modifier.widthIn(max = 480.dp), horizontalAlignment = Alignment.CenterHorizontally) {
            Text(
                "Where should we check the air?",
                style = MaterialTheme.typography.headlineMedium,
                textAlign = TextAlign.Center,
                modifier = Modifier.semantics { heading() },
            )
            Spacer(Modifier.height(10.dp))
            Text(
                "We only need your rough area to pick the nearest NEA stations.",
                style = MaterialTheme.typography.bodyLarge,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                textAlign = TextAlign.Center,
            )
            Spacer(Modifier.height(28.dp))
            // Equal weight: same component, same size.
            FilledTonalButton(onClick = onLocation, modifier = Modifier.fillMaxWidth().heightIn(min = 64.dp)) {
                Icon(Icons.Filled.LocationOn, null)
                Spacer(Modifier.width(10.dp))
                Text("Use my location", style = MaterialTheme.typography.titleMedium)
            }
            Spacer(Modifier.height(12.dp))
            FilledTonalButton(onClick = onPickArea, modifier = Modifier.fillMaxWidth().heightIn(min = 64.dp)) {
                Icon(Icons.Filled.Search, null)
                Spacer(Modifier.width(10.dp))
                Text("Pick my area", style = MaterialTheme.typography.titleMedium)
            }
            Spacer(Modifier.height(16.dp))
            Text(Insight.PRIVACY, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant, textAlign = TextAlign.Center)
            Spacer(Modifier.height(8.dp))
            TextButton(onClick = onSkip) { Text("Not now: show all of Singapore") }
        }
    }
}

/** Quick switcher: Near you · Home · Work/School · Other · current area · pick another. */
@Composable
fun PlaceSwitcher(
    settings: Settings,
    hasPermission: Boolean,
    locating: Boolean,
    onNear: () -> Unit,
    onPlace: (String) -> Unit,
    onPickArea: () -> Unit,
    onEditPlaces: () -> Unit,
) {
    Row(
        Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()),
        horizontalArrangement = Arrangement.spacedBy(8.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        if (hasPermission || settings.mode == PlaceMode.GPS) {
            FilterChip(
                selected = settings.mode == PlaceMode.GPS,
                onClick = onNear,
                label = { Text(if (locating) "Finding your spot…" else "Near you") },
                leadingIcon = { Icon(Icons.Filled.LocationOn, null, Modifier.size(18.dp)) },
            )
        } else {
            // SPEC v1.4 §3: quiet chip; tapping it asks (or deep-links to Settings if the OS won't ask again).
            AssistChip(
                onClick = onNear,
                label = { Text("Use my location") },
                leadingIcon = { Icon(Icons.Filled.LocationOn, null, Modifier.size(18.dp)) },
            )
        }
        PlaceKeys.SAVED.forEach { key ->
            settings.places[key]?.let { p ->
                FilterChip(
                    selected = settings.mode == PlaceMode.AREA && settings.activePlace == key,
                    onClick = { onPlace(key) },
                    label = { Text(p.label) },
                    leadingIcon = if (key == PlaceKeys.HOME) ({ Icon(Icons.Filled.Home, null, Modifier.size(18.dp)) }) else null,
                )
            }
        }
        val area = settings.area
        if (settings.mode == PlaceMode.AREA && settings.activePlace == null && area != null) {
            FilterChip(selected = true, onClick = onPickArea, label = { Text(area.name) })
        }
        if (settings.mode == PlaceMode.ISLAND) {
            FilterChip(selected = true, onClick = onPickArea, label = { Text("All of Singapore") })
        }
        AssistChip(onClick = onPickArea, label = { Text("Pick area") }, leadingIcon = { Icon(Icons.Filled.Search, null, Modifier.size(18.dp)) })
        AssistChip(onClick = onEditPlaces, label = { Text("Places") }, leadingIcon = { Icon(Icons.Filled.Edit, null, Modifier.size(18.dp)) })
    }
}

/** Offline, searchable list of towns / planning areas. Typing never touches the network. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun AreaPickerSheet(onPick: (Area) -> Unit, onDismiss: () -> Unit) {
    val ctx = LocalContext.current
    val all = remember { AreaList.get(ctx) }
    var q by rememberSaveable { mutableStateOf("") }
    val results = remember(q, all) { Areas.search(all, q, limit = 200) }
    ModalBottomSheet(onDismissRequest = onDismiss, sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)) {
        Column(Modifier.padding(horizontal = 20.dp).fillMaxHeight(0.85f)) {
            Text("Pick your area", style = MaterialTheme.typography.headlineSmall, modifier = Modifier.semantics { heading() })
            Spacer(Modifier.height(10.dp))
            OutlinedTextField(
                value = q,
                onValueChange = { q = it },
                modifier = Modifier.fillMaxWidth(),
                singleLine = true,
                leadingIcon = { Icon(Icons.Filled.Search, null) },
                placeholder = { Text("Town or estate, e.g. Tampines") },
                keyboardOptions = KeyboardOptions(imeAction = ImeAction.Search, autoCorrectEnabled = false),
                shape = RoundedCornerShape(16.dp),
            )
            Spacer(Modifier.height(6.dp))
            Text("Searched on your phone. Nothing is sent.", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            Spacer(Modifier.height(6.dp))
            if (all.isEmpty()) {
                Text("The area list isn't included in this build.", Modifier.padding(vertical = 16.dp))
            } else if (results.isEmpty()) {
                Text("No area matches \"$q\".", Modifier.padding(vertical = 16.dp), color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
            LazyColumn(Modifier.fillMaxWidth()) {
                items(results, key = { it.first.name }) { (area, alias) ->
                    Column(
                        Modifier.fillMaxWidth().clickable(role = Role.Button) { onPick(area) }.padding(vertical = 14.dp),
                    ) {
                        Text(area.name, style = MaterialTheme.typography.bodyLarge)
                        if (alias != null && alias != area.name) {
                            Text("Includes $alias", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        }
                    }
                    HorizontalDivider()
                }
            }
        }
    }
}

/** Saved places: Home, Work/School and one more, each set from location or the area list. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun PlacesSheet(
    settings: Settings,
    onPickArea: (String) -> Unit,
    onUseLocation: (String) -> Unit,
    onClear: (String) -> Unit,
    onDismiss: () -> Unit,
) {
    ModalBottomSheet(onDismissRequest = onDismiss) {
        Column(Modifier.navigationBarsPadding().verticalScroll(rememberScrollState()).padding(horizontal = 24.dp).padding(bottom = 32.dp)) {
            Text("Your places", style = MaterialTheme.typography.headlineSmall)
            Text(
                "Switch between them on the main screen, or pin one to a widget. Saved on this device only.",
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            Spacer(Modifier.height(12.dp))
            PlaceKeys.SAVED.forEach { key ->
                val p = settings.places[key]
                Text(PlaceKeys.label(key), style = MaterialTheme.typography.titleMedium, modifier = Modifier.padding(top = 10.dp))
                Text(p?.name ?: "Not set", style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    OutlinedButton(onClick = { onPickArea(key) }) { Text("Pick area") }
                    OutlinedButton(onClick = { onUseLocation(key) }) { Text("Use my location") }
                    if (p != null) TextButton(onClick = { onClear(key) }) { Text("Clear") }
                }
                HorizontalDivider(Modifier.padding(top = 8.dp))
            }
        }
    }
}
