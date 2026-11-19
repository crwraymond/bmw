package local.tokooffline.app

import android.app.Activity
import android.content.Context
import android.print.PrintAttributes
import android.print.PrintManager
import android.webkit.WebView
import app.tauri.annotation.Command
import app.tauri.annotation.InvokeArg
import app.tauri.annotation.TauriPlugin
import app.tauri.plugin.Invoke
import app.tauri.plugin.Plugin

@InvokeArg
class PrintArgs {
    var landscape: Boolean = false
}

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
                val a4 = PrintAttributes.MediaSize.ISO_A4
                val landscape = invoke.parseArgs(PrintArgs::class.java).landscape
                val attributes = PrintAttributes.Builder()
                    .setMediaSize(if (landscape) a4.asLandscape() else a4.asPortrait())
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
