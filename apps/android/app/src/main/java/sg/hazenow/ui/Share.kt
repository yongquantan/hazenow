package sg.hazenow.ui

import android.content.ClipData
import android.content.Context
import android.content.Intent
import android.graphics.Bitmap
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.pager.HorizontalPager
import androidx.compose.foundation.pager.rememberPagerState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Share
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Text
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.mutableStateMapOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.core.content.FileProvider
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import sg.hazenow.core.Format
import sg.hazenow.core.HazeCore
import sg.hazenow.core.LocationMode
import sg.hazenow.core.ShareCard
import sg.hazenow.core.ShareCards
import sg.hazenow.core.ShareContext
import sg.hazenow.core.LatLon
import sg.hazenow.core.SharePick
import sg.hazenow.data.AreaList
import sg.hazenow.data.HazeData
import sg.hazenow.data.PlaceMode
import sg.hazenow.data.Settings
import sg.hazenow.render.ShareCardData
import sg.hazenow.render.ShareCardRenderer
import java.io.File

/** Builds share inputs from app state and sends them (image + text + link). */
object Share {
    fun cardTitle(c: ShareCard) = when (c) {
        ShareCard.NOW -> "Now"
        ShareCard.TWO_CLOCKS -> "Two clocks"
        ShareCard.GROUP -> "For our group"
        ShareCard.ALL_CLEAR -> "All clear"
    }

    /**
     * Words context for the cards: a named place ("Tampines") when we have one, the user's point for the
     * station distance, and whether we came from "Why two numbers?". GPS fixes resolve to the nearest planning
     * area on-device (coordinates never leave the phone and never appear on a card).
     */
    fun context(context: Context, data: HazeData, settings: Settings, fromWhy: Boolean = false): ShareContext {
        val s = data.snapshot
        val area = settings.area?.takeIf { settings.mode == PlaceMode.AREA }
        val gps = (settings.selection as? sg.hazenow.core.Selection.Gps)?.takeIf { s.locationMode == LocationMode.GPS }
        val placeName = when {
            area != null && area.name != "Current location" -> area.name
            gps != null -> AreaList.get(context).minByOrNull { HazeCore.haversineKm(gps.lat, gps.lon, it.lat, it.lon) }?.name
            settings.mode == PlaceMode.ISLAND -> "Singapore"
            else -> null
        }
        return ShareContext(placeName, gps?.let { LatLon(it.lat, it.lon) }, fromWhy)
    }

    fun cardData(context: Context, data: HazeData, settings: Settings, fromWhy: Boolean = false) =
        ShareCardData(data.snapshot, settings.profiles, context(context, data, settings, fromWhy), data.avgLine.lastOrNull()?.pm25)

    fun pick(d: ShareCardData): SharePick =
        ShareCards.pickShareCard(d.snapshot, d.profiles, context = d.context, avg24h = d.avg24h)

    /** Text + link; the link carries `?area=` so the server link preview (card 6) matches. */
    fun text(card: ShareCard, d: ShareCardData): String {
        val place = ShareCards.sharePlace(d.snapshot, d.context).name
        return ShareCards.shareCardText(card, d.snapshot, d.profiles, d.context, ShareCards.shareLink(place), d.avg24h)
    }

    fun fileName(card: ShareCard, d: ShareCardData): String =
        ShareCards.shareFileName(ShareCards.sharePlace(d.snapshot, d.context).name, d.snapshot.observedAt, card.id)

    fun writePng(context: Context, bmp: Bitmap, name: String): File {
        val dir = File(context.cacheDir, "share").apply { mkdirs() }
        dir.listFiles()?.forEach { it.delete() } // one outgoing image at a time
        return File(dir, name).also { f -> f.outputStream().use { bmp.compress(Bitmap.CompressFormat.PNG, 100, it) } }
    }

    fun send(context: Context, file: File, text: String) {
        val uri = FileProvider.getUriForFile(context, "${context.packageName}.share", file)
        val intent = Intent(Intent.ACTION_SEND).apply {
            type = "image/png"
            putExtra(Intent.EXTRA_STREAM, uri)
            putExtra(Intent.EXTRA_TEXT, text)
            clipData = ClipData.newRawUri("HazeNow", uri)
            addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
        }
        context.startActivity(Intent.createChooser(intent, "Share").addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
    }
}

/**
 * SPEC v1.6: one tap, no choosing. Large preview of the auto-picked card, with the other eligible cards in a
 * swipeable row; "Send" shares image + text + link.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ShareSheet(data: HazeData, settings: Settings, fromWhy: Boolean, onDismiss: () -> Unit) {
    val ctx = LocalContext.current
    val scope = rememberCoroutineScope()
    val cardData = remember(data, settings, fromWhy) { Share.cardData(ctx, data, settings, fromWhy) }
    val pick = remember(cardData) { Share.pick(cardData) }
    val images = remember(cardData) { mutableStateMapOf<ShareCard, Bitmap>() }
    val renderer = remember { ShareCardRenderer(ctx) }
    LaunchedEffect(cardData) {
        withContext(Dispatchers.Default) {
            for (c in pick.cards) {
                val b = renderer.render(c, cardData)
                withContext(Dispatchers.Main) { images[c] = b }
            }
        }
    }
    val pager = rememberPagerState { pick.cards.size }
    ModalBottomSheet(onDismissRequest = onDismiss, sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)) {
        Column(Modifier.navigationBarsPadding().padding(bottom = 16.dp), horizontalAlignment = Alignment.CenterHorizontally) {
            Text("Share", style = MaterialTheme.typography.headlineSmall)
            Spacer(Modifier.height(12.dp))
            HorizontalPager(
                state = pager,
                contentPadding = PaddingValues(horizontal = 40.dp),
                pageSpacing = 12.dp,
                modifier = Modifier.fillMaxWidth().heightIn(max = 520.dp),
            ) { page ->
                val card = pick.cards[page]
                val bmp = images[card]
                Box(
                    Modifier.fillMaxWidth().aspectRatio(1080f / 1350f).clip(RoundedCornerShape(16.dp))
                        .border(1.dp, MaterialTheme.colorScheme.outlineVariant, RoundedCornerShape(16.dp))
                        .semantics { contentDescription = "${Share.cardTitle(card)} card preview" },
                    contentAlignment = Alignment.Center,
                ) {
                    if (bmp != null) {
                        Image(bmp.asImageBitmap(), null, Modifier.fillMaxWidth(), contentScale = ContentScale.Fit)
                    } else {
                        CircularProgressIndicator()
                    }
                }
            }
            Spacer(Modifier.height(10.dp))
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
                pick.cards.forEachIndexed { i, c ->
                    val selected = pager.currentPage == i
                    Box(
                        Modifier.size(if (selected) 10.dp else 8.dp).clip(CircleShape)
                            .background(if (selected) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.outlineVariant),
                    )
                }
            }
            Spacer(Modifier.height(6.dp))
            val current = pick.cards.getOrElse(pager.currentPage) { pick.card }
            Text(
                Share.cardTitle(current) + if (current == pick.card) " · picked for now" else "",
                style = MaterialTheme.typography.labelLarge,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                textAlign = TextAlign.Center,
            )
            Spacer(Modifier.height(14.dp))
            Button(
                onClick = {
                    val bmp = images[current] ?: return@Button
                    scope.launch {
                        val file = withContext(Dispatchers.IO) {
                            Share.writePng(ctx, bmp, Share.fileName(current, cardData))
                        }
                        Share.send(ctx, file, Share.text(current, cardData))
                        onDismiss()
                    }
                },
                enabled = images[current] != null,
                modifier = Modifier.padding(horizontal = 24.dp).fillMaxWidth().height(56.dp),
            ) {
                Icon(Icons.Filled.Share, null)
                Spacer(Modifier.width(10.dp))
                Text("Send", style = MaterialTheme.typography.titleMedium)
            }
        }
    }
}
