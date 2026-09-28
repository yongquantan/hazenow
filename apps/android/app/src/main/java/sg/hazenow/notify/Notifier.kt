package sg.hazenow.notify

import android.Manifest
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat
import androidx.core.graphics.drawable.IconCompat
import sg.hazenow.R
import sg.hazenow.core.BandAlert
import sg.hazenow.core.Format
import sg.hazenow.data.HazeData
import sg.hazenow.render.ChartPainter
import sg.hazenow.ui.MainActivity

object Notifier {
    const val CH_WATCH = "haze_watch"
    const val CH_ALERTS = "band_alerts"
    private const val ID_WATCH = 1
    private const val ID_ALERT = 2

    fun createChannels(context: Context) {
        val nm = context.getSystemService(NotificationManager::class.java)
        nm.createNotificationChannel(
            NotificationChannel(CH_WATCH, "Haze watch", NotificationManager.IMPORTANCE_LOW).apply {
                description = "Quiet and persistent: the latest 1-hr PM2.5 in your status bar."
                setShowBadge(false)
            },
        )
        nm.createNotificationChannel(
            NotificationChannel(CH_ALERTS, "Band changes", NotificationManager.IMPORTANCE_DEFAULT).apply {
                description = "Only when the band changes near you, and when it's clear again. Never at night."
            },
        )
    }

    fun canPost(context: Context) = Build.VERSION.SDK_INT < 33 ||
        ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED

    private fun openApp(context: Context) = PendingIntent.getActivity(
        context, 0,
        Intent(context, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP),
        PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
    )

    /** Persistent low-priority "Haze watch": the number itself is the status-bar icon. */
    fun showWatch(context: Context, data: HazeData) {
        if (!canPost(context)) return
        val s = data.snapshot
        val i = data.insight
        val n = NotificationCompat.Builder(context, CH_WATCH)
            .setSmallIcon(IconCompat.createWithBitmap(ChartPainter.numberIcon(s.pm25.toString())))
            .setContentTitle("${i.verdict.short} · ${i.display} ${s.band.label} ${s.trend.direction.arrow}")
            .setContentText("${Format.place(s)} · measured ${Format.clock(s.observedAt)} · ${i.officialPsiLabel}")
            .setStyle(
                NotificationCompat.BigTextStyle().bigText(
                    "${i.verdict.long}\n${i.trendWords}\n${i.provenance}\n${i.officialPsiLabel}\nData: NEA via data.gov.sg",
                ),
            )
            .setColor(s.band.argb.toInt())
            .setOngoing(true)
            .setOnlyAlertOnce(true)
            .setSilent(true)
            .setShowWhen(false)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .setCategory(NotificationCompat.CATEGORY_STATUS)
            .setContentIntent(openApp(context))
            .build()
        runCatching { NotificationManagerCompat.from(context).notify(ID_WATCH, n) }
    }

    fun cancelWatch(context: Context) = NotificationManagerCompat.from(context).cancel(ID_WATCH)

    fun showAlert(context: Context, alert: BandAlert, data: HazeData) {
        if (!canPost(context)) return
        val n = NotificationCompat.Builder(context, CH_ALERTS)
            .setSmallIcon(R.drawable.ic_stat_haze)
            .setContentTitle(alert.title)
            .setContentText(alert.text)
            .setStyle(NotificationCompat.BigTextStyle().bigText(alert.text))
            .setColor(data.snapshot.band.argb.toInt())
            .setAutoCancel(true)
            .setCategory(NotificationCompat.CATEGORY_STATUS)
            .setContentIntent(openApp(context))
            .build()
        runCatching { NotificationManagerCompat.from(context).notify(ID_ALERT, n) }
    }
}
