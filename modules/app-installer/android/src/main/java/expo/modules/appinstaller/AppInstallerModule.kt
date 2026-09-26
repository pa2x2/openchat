package expo.modules.appinstaller

import android.app.Activity
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.pm.PackageInfo
import android.content.pm.PackageInstaller
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.provider.Settings
import androidx.core.content.ContextCompat
import androidx.core.content.IntentCompat
import androidx.core.content.pm.PackageInfoCompat
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleOwner
import expo.modules.kotlin.Promise
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.File
import java.security.MessageDigest

/**
 * Installs an update APK of this app through PackageInstaller, so the update
 * never leaves the app for a browser or file manager.
 *
 * On Android 12+ the session asks for no confirmation once this app is the
 * installer of record (true after its first self-update). Otherwise Android
 * shows its confirmation screen over the app; if that request arrives while
 * the app is in the background it is held until the app is back in front.
 *
 * A successful self-update kills the process, so `install` only ever settles
 * on failure or cancellation.
 */
class AppInstallerModule : Module() {
  private val lock = Any()
  private var receiver: BroadcastReceiver? = null
  private var receiverContext: Context? = null

  // The install in flight. Guarded by `lock`.
  private var sessionId: Int? = null
  private var pendingPromise: Promise? = null
  private var deferredConfirmation: Intent? = null
  private var confirmationShown = false

  private val context: Context
    get() = appContext.reactContext ?: throw Exceptions.ReactContextLost()

  override fun definition() = ModuleDefinition {
    Name("AppInstaller")

    Constant("supportedAbis") { Build.SUPPORTED_ABIS.toList() }

    OnCreate {
      val context = context
      val receiver = object : BroadcastReceiver() {
        override fun onReceive(context: Context, intent: Intent) = onStatus(intent)
      }
      ContextCompat.registerReceiver(
        context,
        receiver,
        IntentFilter(statusAction(context)),
        ContextCompat.RECEIVER_NOT_EXPORTED,
      )
      this@AppInstallerModule.receiver = receiver
      receiverContext = context
    }

    OnDestroy {
      receiver?.let { runCatching { receiverContext?.unregisterReceiver(it) } }
      receiver = null
    }

    OnActivityEntersForeground { onForeground() }

    Function("canRequestInstalls") {
      // Before Android 8 the global "unknown sources" switch applies, and the
      // installer's own screen explains it.
      Build.VERSION.SDK_INT < Build.VERSION_CODES.O || context.packageManager.canRequestPackageInstalls()
    }

    Function("openInstallSettings") {
      val intent = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
        Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:${context.packageName}"))
      } else {
        Intent(Settings.ACTION_SECURITY_SETTINGS)
      }
      val activity = appContext.currentActivity
      if (activity != null) {
        activity.startActivity(intent)
      } else {
        context.startActivity(intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
      }
    }

    AsyncFunction("install") { fileUri: String, sha256: String?, promise: Promise ->
      install(fileUri, sha256, promise)
    }
  }

  private fun install(fileUri: String, sha256: String?, promise: Promise) {
    val file = File(Uri.parse(fileUri).path ?: fileUri)
    if (!file.isFile) {
      promise.reject("E_FILE_MISSING", "The downloaded update file is missing.", null)
      return
    }
    if (sha256 != null) {
      val actual = sha256Of(file)
      if (!actual.equals(sha256, ignoreCase = true)) {
        promise.reject("E_CHECKSUM", "The downloaded update is corrupted (SHA-256 $actual, expected $sha256).", null)
        return
      }
    }
    checkArchive(file)?.let { (code, message) ->
      promise.reject(code, message, null)
      return
    }

    val installer = context.packageManager.packageInstaller
    // Only one install at a time: settle the previous caller and drop any
    // session left behind by an earlier attempt or an earlier process.
    synchronized(lock) {
      pendingPromise?.reject("E_INSTALL_SUPERSEDED", "A newer install request replaced this one.", null)
      clearPending()
    }
    installer.mySessions.forEach { runCatching { installer.abandonSession(it.sessionId) } }

    val params = PackageInstaller.SessionParams(PackageInstaller.SessionParams.MODE_FULL_INSTALL).apply {
      setAppPackageName(context.packageName)
      setSize(file.length())
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
        setInstallReason(PackageManager.INSTALL_REASON_USER)
      }
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
        setRequireUserAction(PackageInstaller.SessionParams.USER_ACTION_NOT_REQUIRED)
      }
    }

    var id: Int? = null
    try {
      id = installer.createSession(params)
      installer.openSession(id).use { session ->
        file.inputStream().use { input ->
          session.openWrite("base.apk", 0, file.length()).use { output ->
            input.copyTo(output)
            session.fsync(output)
          }
        }
        synchronized(lock) {
          sessionId = id
          pendingPromise = promise
        }
        session.commit(statusReceiver(id).intentSender)
      }
    } catch (error: Exception) {
      id?.let { runCatching { installer.abandonSession(it) } }
      synchronized(lock) { if (pendingPromise === promise) clearPending() }
      promise.reject("E_INSTALL_FAILED", error.message ?: "Could not start the install.", error)
    }
  }

  private fun onStatus(intent: Intent) {
    val id = intent.getIntExtra(PackageInstaller.EXTRA_SESSION_ID, -1)
    val status = intent.getIntExtra(PackageInstaller.EXTRA_STATUS, PackageInstaller.STATUS_FAILURE)
    val message = intent.getStringExtra(PackageInstaller.EXTRA_STATUS_MESSAGE)

    if (status == PackageInstaller.STATUS_PENDING_USER_ACTION) {
      val confirmation = IntentCompat.getParcelableExtra(intent, Intent.EXTRA_INTENT, Intent::class.java)
      synchronized(lock) {
        if (id != sessionId) return
        if (confirmation == null) {
          settle("E_INSTALL_FAILED", "Android asked for confirmation but sent no screen to show.")
          return
        }
        val activity = appContext.currentActivity
        if (activity != null && isResumed(activity)) {
          confirmationShown = true
          activity.startActivity(confirmation)
        } else {
          deferredConfirmation = confirmation
        }
      }
      return
    }

    synchronized(lock) {
      if (id != sessionId) return
      when (status) {
        PackageInstaller.STATUS_SUCCESS -> settle(null, null)
        PackageInstaller.STATUS_FAILURE_ABORTED ->
          settle("E_INSTALL_CANCELLED", message ?: "The install was cancelled.")
        PackageInstaller.STATUS_FAILURE_BLOCKED ->
          settle("E_INSTALL_BLOCKED", message ?: "The install was blocked.")
        PackageInstaller.STATUS_FAILURE_CONFLICT ->
          settle("E_INSTALL_CONFLICT", message ?: "The update conflicts with the installed app.")
        PackageInstaller.STATUS_FAILURE_INCOMPATIBLE ->
          settle("E_INSTALL_INCOMPATIBLE", message ?: "The update is not compatible with this device.")
        PackageInstaller.STATUS_FAILURE_STORAGE ->
          settle("E_INSTALL_STORAGE", message ?: "Not enough storage to install the update.")
        else -> settle("E_INSTALL_FAILED", message ?: "The install failed.")
      }
    }
  }

  private fun onForeground() {
    synchronized(lock) {
      val id = sessionId ?: return
      val confirmation = deferredConfirmation
      if (confirmation != null) {
        deferredConfirmation = null
        confirmationShown = true
        appContext.currentActivity?.startActivity(confirmation)
        return
      }
      // Back from the confirmation screen with the session gone and no status
      // broadcast: some Android builds drop it on cancel.
      if (confirmationShown && context.packageManager.packageInstaller.getSessionInfo(id) == null) {
        settle("E_INSTALL_CANCELLED", "The install was cancelled.")
      }
    }
  }

  /** Settles the in-flight promise (resolves when `code` is null); call with `lock` held. */
  private fun settle(code: String?, message: String?) {
    val promise = pendingPromise
    clearPending()
    if (code == null) promise?.resolve(null) else promise?.reject(code, message, null)
  }

  private fun clearPending() {
    sessionId = null
    pendingPromise = null
    deferredConfirmation = null
    confirmationShown = false
  }

  private fun statusReceiver(id: Int): PendingIntent {
    val intent = Intent(statusAction(context)).setPackage(context.packageName)
    // Mutable: PackageInstaller fills in the status extras.
    val flags = PendingIntent.FLAG_UPDATE_CURRENT or
      (if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) PendingIntent.FLAG_MUTABLE else 0)
    return PendingIntent.getBroadcast(context, id, intent, flags)
  }

  /**
   * Checks the APK is a newer build of this app signed with the same key, so
   * a wrong file fails here with a clear reason instead of after Android's
   * confirmation screen.
   */
  private fun checkArchive(file: File): Pair<String, String>? {
    val pm = context.packageManager
    @Suppress("DEPRECATION")
    val flags = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) PackageManager.GET_SIGNING_CERTIFICATES else 0
    @Suppress("DEPRECATION")
    val archive = pm.getPackageArchiveInfo(file.path, flags)
      ?: return "E_INVALID_APK" to "The downloaded file is not a valid APK."
    if (archive.packageName != context.packageName) {
      return "E_WRONG_PACKAGE" to "The APK is for ${archive.packageName}, not ${context.packageName}."
    }
    @Suppress("DEPRECATION")
    val installed = pm.getPackageInfo(context.packageName, flags)
    val archiveVersion = PackageInfoCompat.getLongVersionCode(archive)
    val installedVersion = PackageInfoCompat.getLongVersionCode(installed)
    if (archiveVersion <= installedVersion) {
      return "E_NOT_NEWER" to "The APK has versionCode $archiveVersion; the installed app has $installedVersion."
    }
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P && !sameSigner(archive, installed)) {
      return "E_SIGNATURE_MISMATCH" to "The update is signed with a different key than the installed app."
    }
    return null
  }

  private fun sameSigner(archive: PackageInfo, installed: PackageInfo): Boolean {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.P) return true
    val current = installed.signingInfo?.apkContentsSigners ?: return true
    val incoming = archive.signingInfo ?: return true
    // The history covers a rotated key, whose lineage includes the old one.
    val accepted = if (incoming.hasMultipleSigners()) incoming.apkContentsSigners else incoming.signingCertificateHistory
    return current.any { signer -> accepted.orEmpty().any { it == signer } }
  }

  private fun isResumed(activity: Activity): Boolean =
    (activity as? LifecycleOwner)?.lifecycle?.currentState?.isAtLeast(Lifecycle.State.RESUMED) ?: true

  private fun statusAction(context: Context) = "${context.packageName}.APP_INSTALLER_STATUS"

  private fun sha256Of(file: File): String {
    val digest = MessageDigest.getInstance("SHA-256")
    file.inputStream().use { input ->
      val buffer = ByteArray(DEFAULT_BUFFER_SIZE * 8)
      while (true) {
        val read = input.read(buffer)
        if (read < 0) break
        digest.update(buffer, 0, read)
      }
    }
    return digest.digest().joinToString("") { "%02x".format(it) }
  }
}
