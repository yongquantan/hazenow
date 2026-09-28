package sg.hazenow.work

import android.content.Context
import androidx.work.BackoffPolicy
import androidx.work.Constraints
import androidx.work.CoroutineWorker
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.ExistingWorkPolicy
import androidx.work.NetworkType
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.WorkerParameters
import androidx.work.workDataOf
import sg.hazenow.Refresher
import sg.hazenow.core.Freshness
import sg.hazenow.core.HazeCore
import java.time.Duration
import java.time.Instant
import java.util.concurrent.TimeUnit

/**
 * Background refresh for widgets / Haze watch / tile / alerts (SPEC v1.3 §3):
 *  - periodic work every 15 min (Android's minimum; the OS decides exact timing), and
 *  - a best-effort one-off at hh:02, re-armed after every run, since NEA publishes ~1 min after the hour.
 * v1 is fetched every run; the rate-limited v2 back-fill pass only runs in the second half of the hour.
 */
class RefreshWorker(context: Context, params: WorkerParameters) : CoroutineWorker(context, params) {
    override suspend fun doWork(): Result {
        val force = inputData.getBoolean(KEY_FORCE, false)
        val minute = Instant.now().atZone(HazeCore.SG_ZONE).minute
        return try {
            Refresher.refresh(applicationContext, force = force, v1 = true, v2 = force || minute >= 30)
            Result.success()
        } catch (e: Exception) {
            if (runAttemptCount < 3) Result.retry() else Result.failure()
        } finally {
            scheduleTopOfHour(applicationContext)
        }
    }

    companion object {
        private const val PERIODIC = "haze-refresh"
        private const val HH02 = "haze-refresh-hh02"
        private const val ONCE = "haze-refresh-now"
        private const val KEY_FORCE = "force"
        private val constraints = Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build()

        fun schedule(context: Context) {
            val req = PeriodicWorkRequestBuilder<RefreshWorker>(15, TimeUnit.MINUTES)
                .setConstraints(constraints)
                .setBackoffCriteria(BackoffPolicy.EXPONENTIAL, 30, TimeUnit.SECONDS)
                .build()
            WorkManager.getInstance(context).enqueueUniquePeriodicWork(PERIODIC, ExistingPeriodicWorkPolicy.KEEP, req)
            scheduleTopOfHour(context)
        }

        /** One-off at the next hh:02 (best effort; the OS may delay it). */
        fun scheduleTopOfHour(context: Context) {
            val now = Instant.now()
            val delay = Duration.between(now, Freshness.nextBackgroundRun(now))
            val req = OneTimeWorkRequestBuilder<RefreshWorker>()
                .setConstraints(constraints)
                .setInitialDelay(delay.toMillis(), TimeUnit.MILLISECONDS)
                .build()
            WorkManager.getInstance(context).enqueueUniqueWork(HH02, ExistingWorkPolicy.REPLACE, req)
        }

        /** Run now (debug hooks, widget added, mock switched). */
        fun runOnce(context: Context, force: Boolean = true) {
            val req = OneTimeWorkRequestBuilder<RefreshWorker>()
                .setConstraints(constraints)
                .setInputData(workDataOf(KEY_FORCE to force))
                .build()
            WorkManager.getInstance(context).enqueueUniqueWork(ONCE, ExistingWorkPolicy.REPLACE, req)
        }
    }
}
