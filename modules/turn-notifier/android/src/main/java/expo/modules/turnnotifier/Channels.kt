package expo.modules.turnnotifier

import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.net.Uri
import androidx.core.app.NotificationChannelCompat
import androidx.core.app.NotificationManagerCompat

internal object Channels {
  /** The ongoing notification of a running reply; silent. */
  const val WORK = "turn-work"
  /** Finished replies and questions; these alert. */
  const val REPLIES = "turn-replies"

  fun ensure(context: Context) {
    val manager = NotificationManagerCompat.from(context)
    manager.createNotificationChannel(
      NotificationChannelCompat.Builder(WORK, NotificationManagerCompat.IMPORTANCE_LOW)
        .setName(context.getString(R.string.turn_notifier_channel_work))
        .setShowBadge(false)
        .build(),
    )
    manager.createNotificationChannel(
      NotificationChannelCompat.Builder(REPLIES, NotificationManagerCompat.IMPORTANCE_HIGH)
        .setName(context.getString(R.string.turn_notifier_channel_replies))
        .setDescription(context.getString(R.string.turn_notifier_channel_replies_description))
        .build(),
    )
  }

  /**
   * Brings the app to the front; with a `url`, as a deep link the router opens.
   * `requestCode` keeps one notification's link from replacing another's.
   */
  fun openApp(context: Context, url: String?, requestCode: Int = 0): PendingIntent {
    val intent = if (url != null) {
      Intent(Intent.ACTION_VIEW, Uri.parse(url)).setPackage(context.packageName)
    } else {
      context.packageManager.getLaunchIntentForPackage(context.packageName) ?: Intent()
    }
    intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP)
    return PendingIntent.getActivity(
      context,
      requestCode,
      intent,
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
    )
  }
}
