package sg.hazenow

import android.app.Application
import sg.hazenow.notify.Notifier
import sg.hazenow.work.RefreshWorker

class HazeApp : Application() {
    override fun onCreate() {
        super.onCreate()
        Notifier.createChannels(this)
        RefreshWorker.schedule(this)
    }
}
