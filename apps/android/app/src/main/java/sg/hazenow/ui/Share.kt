package sg.hazenow.ui

import android.content.ClipData
import android.content.Context
import android.content.Intent
import androidx.core.content.FileProvider
import sg.hazenow.core.Format
import sg.hazenow.data.HazeData
import sg.hazenow.render.ChartPainter
import java.io.File

object Share {
    /** COPY §15 share text (no verdict, no Instant PSI) plus the "Last 24 hours" chart card as an image. */
    fun share(context: Context, data: HazeData, dark: Boolean) {
        val intent = Intent(Intent.ACTION_SEND).apply {
            putExtra(Intent.EXTRA_TEXT, Format.shareText(data.snapshot))
            type = "text/plain"
        }
        runCatching {
            val dir = File(context.cacheDir, "share").apply { mkdirs() }
            val f = File(dir, "hazenow.png")
            f.outputStream().use { ChartPainter.shareCard(data, dark).compress(android.graphics.Bitmap.CompressFormat.PNG, 100, it) }
            val uri = FileProvider.getUriForFile(context, "${context.packageName}.share", f)
            intent.putExtra(Intent.EXTRA_STREAM, uri)
            intent.type = "image/png"
            intent.clipData = ClipData.newRawUri("HazeNow", uri)
            intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
        }
        context.startActivity(Intent.createChooser(intent, "Share"))
    }
}
