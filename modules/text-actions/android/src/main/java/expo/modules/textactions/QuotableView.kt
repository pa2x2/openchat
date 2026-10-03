package expo.modules.textactions

import android.content.Context
import android.graphics.Rect
import android.view.ActionMode
import android.view.Menu
import android.view.MenuItem
import android.view.View
import android.widget.TextView
import expo.modules.kotlin.AppContext
import expo.modules.kotlin.viewevent.EventDispatcher
import expo.modules.kotlin.views.ExpoView

/**
 * Adds a Quote item to the toolbar Android shows over text selected inside
 * this view, and reports the selected words through `onQuote`.
 *
 * A text view starts its selection toolbar by asking its parents, one after
 * the other, up to the window. Catching that request here rather than at the
 * window keeps the item to the text inside this view, and works the same in
 * a Modal, which is a window of its own.
 */
class QuotableView(context: Context, appContext: AppContext) : ExpoView(context, appContext) {
  var label = "Quote"
  private val onQuote by EventDispatcher()

  // React Native places the children. ExpoView is a LinearLayout, whose own
  // pass would stack them again from the top, over one another, whenever a
  // child asks for a layout (as text does while a reply streams).
  override fun onLayout(changed: Boolean, left: Int, top: Int, right: Int, bottom: Int) = Unit

  override fun startActionModeForChild(
    originalView: View,
    callback: ActionMode.Callback,
    type: Int,
  ): ActionMode? {
    // A quotable view inside another one has wrapped the callback already.
    val quoting =
      type == ActionMode.TYPE_FLOATING && originalView is TextView && callback !is QuoteCallback
    return super.startActionModeForChild(
      originalView,
      if (quoting) QuoteCallback(callback, originalView as TextView) else callback,
      type,
    )
  }

  private inner class QuoteCallback(
    private val base: ActionMode.Callback,
    private val textView: TextView,
  ) : ActionMode.Callback2() {
    override fun onCreateActionMode(mode: ActionMode, menu: Menu): Boolean {
      val created = base.onCreateActionMode(mode, menu)
      if (created) addItem(menu)
      return created
    }

    // The text view refills its menu while the selection changes.
    override fun onPrepareActionMode(mode: ActionMode, menu: Menu): Boolean {
      val changed = base.onPrepareActionMode(mode, menu)
      return addItem(menu) || changed
    }

    override fun onActionItemClicked(mode: ActionMode, item: MenuItem): Boolean {
      if (item.itemId != QUOTE_ITEM) return base.onActionItemClicked(mode, item)
      val start = minOf(textView.selectionStart, textView.selectionEnd)
      val end = maxOf(textView.selectionStart, textView.selectionEnd)
      if (start in 0 until end) {
        onQuote(mapOf("text" to textView.text.subSequence(start, end).toString()))
      }
      mode.finish()
      return true
    }

    override fun onDestroyActionMode(mode: ActionMode) = base.onDestroyActionMode(mode)

    // Places the floating toolbar over the selection.
    override fun onGetContentRect(mode: ActionMode, view: View, outRect: Rect) {
      if (base is ActionMode.Callback2) base.onGetContentRect(mode, view, outRect)
      else super.onGetContentRect(mode, view, outRect)
    }

    private fun addItem(menu: Menu): Boolean {
      if (menu.findItem(QUOTE_ITEM) != null) return false
      // Order 0 puts it before Copy, which the text view adds at a higher order.
      menu.add(Menu.NONE, QUOTE_ITEM, 0, label).setShowAsAction(MenuItem.SHOW_AS_ACTION_ALWAYS)
      return true
    }
  }

  private companion object {
    // Any id the text view's own items don't use.
    const val QUOTE_ITEM = 0x51_0001
  }
}
