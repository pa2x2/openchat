package expo.modules.dynamiccolors

import android.annotation.SuppressLint
import android.content.Context
import android.os.Build
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/**
 * Reads the Material You tonal palettes Android 12+ derives from the
 * wallpaper (`android.R.color.system_accent1_500` and friends).
 *
 * The colours are read on every call rather than cached: they change when the
 * user picks a new wallpaper or colour style, and the JS side re-reads them
 * when the app comes back to the foreground.
 */
class DynamicColorsModule : Module() {
  private val context: Context
    get() = appContext.currentActivity ?: appContext.reactContext ?: throw Exceptions.ReactContextLost()

  override fun definition() = ModuleDefinition {
    Name("DynamicColors")

    Constant("supported") { Build.VERSION.SDK_INT >= Build.VERSION_CODES.S }

    Function("getPalettes") {
      if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S) return@Function null
      PALETTES.associateWith { palette ->
        SHADES.associateWith { shade -> hex(palette, shade) }.mapKeys { it.key.toString() }
      }
    }
  }

  // The system_* colours are public API, but reaching them by name keeps this
  // to one loop instead of 65 R.color constants.
  @SuppressLint("DiscouragedApi")
  private fun hex(palette: String, shade: Int): String {
    val id = context.resources.getIdentifier("system_${palette}_$shade", "color", "android")
    return "#%06X".format(context.getColor(id) and 0xFFFFFF)
  }

  private companion object {
    val PALETTES = listOf("accent1", "accent2", "accent3", "neutral1", "neutral2")
    val SHADES = listOf(0, 10, 50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 1000)
  }
}
