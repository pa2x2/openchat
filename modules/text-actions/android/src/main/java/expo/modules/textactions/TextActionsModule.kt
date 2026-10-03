package expo.modules.textactions

import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class TextActionsModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("TextActions")

    View(QuotableView::class) {
      Events("onQuote")

      Prop("label") { view: QuotableView, label: String ->
        view.label = label
      }
    }
  }
}
