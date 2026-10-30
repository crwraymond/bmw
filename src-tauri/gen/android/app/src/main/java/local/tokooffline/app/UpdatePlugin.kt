package local.tokooffline.app

import android.app.Activity
import android.content.Intent
import android.content.pm.PackageInfo
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.provider.Settings
import androidx.core.content.FileProvider
import app.tauri.annotation.Command
import app.tauri.annotation.TauriPlugin
import app.tauri.plugin.Invoke
import app.tauri.plugin.JSObject
import app.tauri.plugin.Plugin
import org.json.JSONObject
import java.io.File
import java.security.MessageDigest
import java.util.concurrent.Executors

@TauriPlugin
class UpdatePlugin(private val host: Activity) : Plugin(host) {
    private val executor = Executors.newSingleThreadExecutor()
    private var pending: JSONObject? = null
    @Volatile private var openingInstaller = false
    private val apk: File get() = File(host.cacheDir, "updates/toko-update.apk")
    private val manifestUrl = "https://github.com/crwraymond/bmw/releases/latest/download/android-latest.json"
    private val maxApkSize = 200L * 1024 * 1024

    private fun background(invoke: Invoke, action: () -> JSObject?) {
        executor.execute {
            try { invoke.resolve(action()) }
            catch (error: Exception) { invoke.reject(error.localizedMessage ?: "Update belum dapat diproses") }
        }
    }

    @Suppress("DEPRECATION")
    private fun code(info: PackageInfo): Long = if (Build.VERSION.SDK_INT >= 28) info.longVersionCode else info.versionCode.toLong()

    @Suppress("DEPRECATION")
    private fun signatures(info: PackageInfo): Set<String> {
        val values = if (Build.VERSION.SDK_INT >= 28) info.signingInfo?.apkContentsSigners else info.signatures
        return values?.map { sha256(it.toByteArray()) }?.toSet() ?: emptySet()
    }

    @Suppress("DEPRECATION")
    private fun signatureFlags(): Int = if (Build.VERSION.SDK_INT >= 28) PackageManager.GET_SIGNING_CERTIFICATES else PackageManager.GET_SIGNATURES

    private fun installed(): PackageInfo = host.packageManager.getPackageInfo(host.packageName, signatureFlags())
    private fun sha256(bytes: ByteArray): String = MessageDigest.getInstance("SHA-256").digest(bytes).joinToString("") { "%02x".format(it) }
    @Command
    fun check(invoke: Invoke) = background(invoke) {
        pending = null
        val manifest = JSONObject(UpdateTransport.manifest(manifestUrl))
        check(manifest.getString("packageId") == host.packageName && manifest.getString("abi") == "arm64-v8a") { "Paket update tidak sesuai perangkat" }
        check(Regex("[0-9a-f]{64}").matches(manifest.getString("sha256"))) { "Hash update tidak valid" }
        check(manifest.getLong("size") in 1..maxApkSize) { "Ukuran update tidak valid" }
        val url = manifest.getString("url")
        check(Regex("https://github\\.com/crwraymond/bmw/releases/download/v[0-9]+\\.[0-9]+\\.[0-9]+/Toko-Offline-[0-9]+\\.[0-9]+\\.[0-9]+-arm64\\.apk").matches(url)) { "Alamat update tidak valid" }
        if (manifest.getLong("versionCode") <= code(installed())) return@background null
        pending = manifest
        JSObject().apply { put("version", manifest.getString("version")); put("body", manifest.optString("notes")) }
    }

    private fun verify(file: File, manifest: JSONObject) {
        UpdateTransport.verifyHash(file, manifest.getLong("size"), manifest.getString("sha256"))
        val archive = host.packageManager.getPackageArchiveInfo(file.absolutePath, signatureFlags()) ?: error("APK update tidak valid")
        val current = installed()
        check(archive.packageName == host.packageName && archive.versionName == manifest.getString("version")) { "Identitas APK update tidak sesuai" }
        check(code(archive) == manifest.getLong("versionCode") && code(archive) > code(current)) { "Versi APK update tidak lebih baru" }
        val trusted = signatures(current)
        check(trusted.isNotEmpty() && signatures(archive) == trusted) { "Tanda tangan APK update tidak sesuai installer toko" }
    }

    @Command
    fun download(invoke: Invoke) = background(invoke) {
        val manifest = pending ?: error("Cek update terlebih dahulu")
        openingInstaller = false
        if (apk.exists()) {
            try { verify(apk, manifest); return@background JSObject() }
            catch (_: Exception) { apk.delete() }
        }
        apk.parentFile!!.mkdirs()
        val partial = File(apk.parentFile, "toko-update.part")
        try {
            UpdateTransport.download(manifest.getString("url"), partial, manifest.getLong("size"))
            verify(partial, manifest)
            check(partial.renameTo(apk)) { "APK belum dapat disimpan" }
        } finally { partial.delete() }
        JSObject()
    }

    @Command
    fun install(invoke: Invoke) {
      executor.execute {
        try {
          val manifest = pending ?: error("Cek update terlebih dahulu")
          verify(apk, manifest)
          host.runOnUiThread {
            try {
                if (Build.VERSION.SDK_INT >= 26 && !host.packageManager.canRequestPackageInstalls()) {
                    host.startActivity(Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:${host.packageName}")))
                    invoke.reject("Aktifkan izin pemasangan untuk Toko Offline, lalu kembali dan tekan Pasang update lagi.")
                } else {
                    val uri = FileProvider.getUriForFile(host, "${host.packageName}.fileprovider", apk)
                    val intent = Intent(Intent.ACTION_VIEW).setDataAndType(uri, "application/vnd.android.package-archive")
                        .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
                    host.startActivity(intent)
                    openingInstaller = true
                    invoke.resolve()
                }
            } catch (error: Exception) { invoke.reject(error.localizedMessage ?: "Dialog pemasangan belum dapat dibuka") }
        }
        } catch (error: Exception) { invoke.reject(error.localizedMessage ?: "APK belum siap dipasang") }
      }
    }

    @Command
    fun close(invoke: Invoke) = background(invoke) {
        pending = null
        if (!openingInstaller) apk.delete()
        JSObject()
    }
}
