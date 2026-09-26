package expo.modules.turnnotifier

import android.annotation.SuppressLint
import android.content.Context
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.ReactContext
import com.facebook.react.bridge.UiThreadUtil
import com.facebook.react.jstasks.HeadlessJsTaskConfig
import com.facebook.react.jstasks.HeadlessJsTaskContext
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/**
 * Keeps replies streaming while the app is in the background, and posts a
 * notification per chat when one finishes or asks a question.
 *
 * Staying alive takes two things. The foreground service stops Android from
 * killing the process or cutting its network. A headless JS task stops React
 * Native from pausing JS timers, which it does whenever the app is not in
 * front and no such task runs; the stream machine's reconnects and stall
 * watchdog run on timers. The task itself is an idle promise registered in JS
 * under [TASK_KEY]; it is only held open.
 */
class TurnNotifierModule : Module() {
  // The held headless task. Only touched on the UI thread.
  private var taskId: Int? = null

  private val context: Context
    get() = appContext.reactContext ?: throw Exceptions.ReactContextLost()

  override fun definition() = ModuleDefinition {
    Name("TurnNotifier")

    Function("startWork") { text: String ->
      TurnService.start(context, text)
      holdTask()
    }

    Function("stopWork") {
      TurnService.stop(context)
      releaseTask()
    }

    Function("notify") { tag: String, title: String, body: String, url: String ->
      post(tag, title, body, url)
    }

    Function("dismiss") { tag: String ->
      NotificationManagerCompat.from(context).cancel(tag, NOTIFICATION_ID)
    }

    OnDestroy {
      appContext.reactContext?.let { TurnService.stop(it) }
      releaseTask()
    }
  }

  // Without the permission (Android 13+) `notify` is dropped by the system.
  @SuppressLint("MissingPermission")
  private fun post(tag: String, title: String, body: String, url: String) {
    val context = context
    Channels.ensure(context)
    val notification = NotificationCompat.Builder(context, Channels.REPLIES)
      .setSmallIcon(R.drawable.ic_turn_notifier)
      .setContentTitle(title)
      .setContentText(body)
      .setStyle(NotificationCompat.BigTextStyle().bigText(body))
      .setContentIntent(Channels.openApp(context, url, tag.hashCode()))
      .setAutoCancel(true)
      .setCategory(NotificationCompat.CATEGORY_MESSAGE)
      .build()
    NotificationManagerCompat.from(context).notify(tag, NOTIFICATION_ID, notification)
  }

  private fun holdTask() {
    val reactContext = appContext.reactContext as? ReactContext ?: return
    UiThreadUtil.runOnUiThread {
      val tasks = HeadlessJsTaskContext.getInstance(reactContext)
      if (taskId?.let { tasks.isTaskRunning(it) } == true) return@runOnUiThread
      taskId = tasks.startTask(
        HeadlessJsTaskConfig(TASK_KEY, Arguments.createMap(), 0, true),
      )
    }
  }

  private fun releaseTask() {
    val reactContext = appContext.reactContext as? ReactContext ?: return
    UiThreadUtil.runOnUiThread {
      val id = taskId ?: return@runOnUiThread
      taskId = null
      HeadlessJsTaskContext.getInstance(reactContext).finishTask(id)
    }
  }

  companion object {
    private const val TASK_KEY = "OpenChatTurns"

    // Notifications are told apart by tag (the chat id); the id is shared.
    private const val NOTIFICATION_ID = 2
  }
}
