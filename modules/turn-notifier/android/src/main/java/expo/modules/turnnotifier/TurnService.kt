package expo.modules.turnnotifier

import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder
import android.util.Log
import androidx.core.app.NotificationCompat
import androidx.core.app.ServiceCompat
import androidx.core.content.ContextCompat

/**
 * Foreground service that keeps the process alive while replies stream, so
 * Android neither kills it nor cuts its network once the app is left. It does
 * no work of its own: the JS stream machine keeps running in the same process.
 *
 * Starting it again with new text only updates its ongoing notification.
 */
class TurnService : Service() {
  override fun onBind(intent: Intent?): IBinder? = null

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    val text = intent?.getStringExtra(EXTRA_TEXT) ?: ""
    val notification = NotificationCompat.Builder(this, Channels.WORK)
      .setSmallIcon(R.drawable.ic_turn_notifier)
      .setContentTitle(text)
      .setContentIntent(Channels.openApp(this, null))
      .setOngoing(true)
      .setSilent(true)
      .setCategory(NotificationCompat.CATEGORY_PROGRESS)
      .setForegroundServiceBehavior(NotificationCompat.FOREGROUND_SERVICE_IMMEDIATE)
      .build()
    ServiceCompat.startForeground(
      this,
      NOTIFICATION_ID,
      notification,
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
        ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC
      } else {
        0
      },
    )
    // After a process death there is no stream left to keep alive.
    return START_NOT_STICKY
  }

  // Android 15 caps dataSync services at 6 hours a day and crashes the app if
  // the service outlives its timeout.
  override fun onTimeout(startId: Int, fgsType: Int) {
    stopSelf()
  }

  companion object {
    private const val TAG = "TurnService"
    private const val EXTRA_TEXT = "text"
    private const val NOTIFICATION_ID = 1

    fun start(context: Context, text: String) {
      Channels.ensure(context)
      val intent = Intent(context, TurnService::class.java).putExtra(EXTRA_TEXT, text)
      try {
        ContextCompat.startForegroundService(context, intent)
      } catch (error: IllegalStateException) {
        // Android 12+ refuses to start one from the background (a run picked
        // up while the app was not in front). The reply still streams for as
        // long as Android lets the process live.
        Log.w(TAG, "Could not start the foreground service", error)
      }
    }

    fun stop(context: Context) {
      context.stopService(Intent(context, TurnService::class.java))
    }
  }
}
