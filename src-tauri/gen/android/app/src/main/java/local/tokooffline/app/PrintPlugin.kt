package local.tokooffline.app

import android.app.Activity
import android.content.Context
import android.print.PrintAttributes
import android.print.PrintManager
import android.webkit.WebView
import app.tauri.annotation.Command
import app.tauri.annotation.TauriPlugin
import app.tauri.plugin.Invoke
import app.tauri.plugin.Plugin

@TauriPlugin
class PrintPlugin(private val host: Activity) : Plugin(host) {
    private var currentWebView: WebView? = null

    override fun load(webView: WebView) {
        currentWebView = webView
    }

    @Command
    fun print(invoke: Invoke) {
        host.runOnUiThread {
            try {
                val webView = currentWebView ?: error("Halaman invoice belum siap")
                val manager = host.getSystemService(Context.PRINT_SERVICE) as PrintManager
                val attributes = PrintAttributes.Builder()
                    .setMediaSize(PrintAttributes.MediaSize.ISO_A4)
                    .setMinMargins(PrintAttributes.Margins.NO_MARGINS)
                    .build()
                manager.print("Invoice Toko Offline", webView.createPrintDocumentAdapter("Invoice Toko Offline"), attributes)
                invoke.resolve()
            } catch (error: Exception) {
                invoke.reject(error.localizedMessage ?: "Dialog cetak belum dapat dibuka")
            }
        }
    }
}
