package com.changshengtian.archive

import android.annotation.SuppressLint
import android.app.Activity
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Bundle
import android.view.KeyEvent
import android.view.View
import android.webkit.CookieManager
import android.webkit.PermissionRequest
import android.webkit.ValueCallback
import android.webkit.WebChromeClient
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.ProgressBar
import android.app.NotificationChannel
import android.app.NotificationManager
import android.content.pm.PackageManager
import android.os.Build
import androidx.webkit.WebViewAssetLoader
import java.io.File
import androidx.work.Constraints
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.ExistingWorkPolicy
import androidx.work.NetworkType
import androidx.work.OneTimeWorkRequest
import androidx.work.PeriodicWorkRequest
import androidx.work.WorkManager
import java.util.concurrent.TimeUnit

/**
 * The archive, carried rather than fetched.
 *
 * Every page, style, font and plate lives inside the APK and is served to the
 * WebView over androidx's asset domain, so the shell paints instantly and works
 * on a bad connection. Only the data crosses the network: the site's API and its
 * media, over at [SITE].
 *
 * Assets are served under a real https origin rather than file://, which is what
 * lets the page use localStorage, fetch and history at all — and it gives the
 * server one exact Origin to allow, instead of a wildcard.
 */
class MainActivity : Activity() {

    private lateinit var web: WebView
    private lateinit var progress: ProgressBar
    private var fileCallback: ValueCallback<Array<Uri>>? = null

    private val pickRequest = 1001
    private val CAMERA_REQ = 1002
    /** A WebView camera request waiting on the system's answer. */
    private var pendingCamera: PermissionRequest? = null

    companion object {
        /** Where the data lives. The pages do not come from here. */
        const val SITE = "https://painthub.netlify.app"
        const val APP_ORIGIN = "https://appassets.androidplatform.net"
        const val APP_HOST = "appassets.androidplatform.net"
        /** Mirrors the key the web bundle writes in `src/lib/net.js`. */
        const val TOKEN_KEY = "tengri.sess"
        /** Everything under here is artwork, and artwork is cached on disk. */
        const val MEDIA = "$SITE/media/"
    }

    /**
     * The bundled site, with the same fallback the server does: anything that
     * does not name a file is a route, and every route is the shell.
     */
    private class SiteAssets(ctx: Context, private val overlay: File?) : WebViewAssetLoader.PathHandler {
        private val assets = WebViewAssetLoader.AssetsPathHandler(ctx)

        /** Whatever the update installed wins; everything else comes off the APK. */
        private fun fromOverlay(rel: String): WebResourceResponse? {
            val dir = overlay ?: return null
            if (rel.isEmpty() || rel.contains("..")) return null
            val f = File(dir, rel)
            if (!f.isFile) return null
            return try {
                WebResourceResponse(mimeOf(rel), null, 200, "OK", emptyMap(), f.inputStream())
            } catch (e: Exception) {
                null
            }
        }

        private fun mimeOf(rel: String) = when (rel.substringAfterLast('.', "")) {
            "html" -> "text/html"
            "js", "mjs" -> "text/javascript"
            "css" -> "text/css"
            "json" -> "application/json"
            "svg" -> "image/svg+xml"
            "webp" -> "image/webp"
            "png" -> "image/png"
            "jpg", "jpeg" -> "image/jpeg"
            "woff2" -> "font/woff2"
            "ico" -> "image/x-icon"
            else -> "application/octet-stream"
        }

        override fun handle(path: String): WebResourceResponse? {
            val clean = path.trimStart('/')
            // Data lives on the server, never in here. Handing the page shell to
            // a call that should have gone to the network is how a caller ends
            // up parsing "<!doctype html>" as JSON, so answer plainly instead.
            if (clean.startsWith("api/") || clean.startsWith("media/")) {
                return WebResourceResponse(
                    "text/plain", "utf-8", 404, "Not Found", emptyMap(),
                    "this path belongs to the server, not the bundle".byteInputStream()
                )
            }
            val isFile = clean.substringAfterLast('/').contains('.')
            val rel = if (isFile) clean else "index.html"
            return fromOverlay(rel) ?: assets.handle("www/$rel")
        }
    }

    private lateinit var loader: WebViewAssetLoader

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)
        web = findViewById(R.id.web)
        progress = findViewById(R.id.progress)

        // Read once, for the whole session. An update that lands while someone
        // is reading takes effect next time they open the app, not underneath
        // them halfway down a page.
        loader = WebViewAssetLoader.Builder()
            .addPathHandler("/", SiteAssets(this, WebUpdate.active(this)))
            .build()

        CookieManager.getInstance().setAcceptCookie(true)
        CookieManager.getInstance().setAcceptThirdPartyCookies(web, true)

        web.settings.apply {
            javaScriptEnabled = true
            domStorageEnabled = true
            databaseEnabled = true
            allowFileAccess = false
            allowContentAccess = false
            loadWithOverviewMode = true
            useWideViewPort = true
            mediaPlaybackRequiresUserGesture = false
            cacheMode = WebSettings.LOAD_DEFAULT
            // Pinch to zoom, without the floating +/- overlay from 2011.
            setSupportZoom(true)
            builtInZoomControls = true
            displayZoomControls = false
            setSupportMultipleWindows(false)
        }

        web.webViewClient = object : WebViewClient() {
            override fun shouldInterceptRequest(view: WebView, request: WebResourceRequest): WebResourceResponse? {
                val url = request.url
                if (url.host == APP_HOST) return loader.shouldInterceptRequest(url)
                // Artwork comes off disk after the first time it is seen. Anything
                // else — every API call — goes to the network, every time.
                val full = url.toString()
                if (request.method == "GET" && full.startsWith(MEDIA)) {
                    return MediaCache.serve(applicationContext, full)
                }
                return null
            }

            override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
                val url = request.url
                // The bundled pages are the app; everything else is the web.
                if (url.host == APP_HOST) return false
                openExternal(url)
                return true
            }

            override fun onPageFinished(view: WebView, url: String) {
                keepToken()
            }

            override fun onReceivedError(view: WebView, request: WebResourceRequest, error: WebResourceError) {
                if (request.isForMainFrame) showError()
            }
        }

        web.webChromeClient = object : WebChromeClient() {
            /**
             * getUserMedia asks twice: once of Android, once of the WebView.
             *
             * The page can only be granted what the app itself holds, so the
             * system permission is requested first and the WebView's request is
             * held until there is an answer. Granting the WebView while the app
             * lacks the permission produces a stream that opens and delivers
             * nothing, which looks like a broken camera rather than a refusal.
             */
            override fun onPermissionRequest(request: PermissionRequest) {
                val wanted = request.resources.filter {
                    it == PermissionRequest.RESOURCE_VIDEO_CAPTURE
                }.toTypedArray()
                if (wanted.isEmpty()) { request.deny(); return }
                if (Build.VERSION.SDK_INT >= 23 &&
                    checkSelfPermission(android.Manifest.permission.CAMERA) != PackageManager.PERMISSION_GRANTED) {
                    pendingCamera = request
                    requestPermissions(arrayOf(android.Manifest.permission.CAMERA), CAMERA_REQ)
                    return
                }
                runOnUiThread { request.grant(wanted) }
            }

            override fun onPermissionRequestCanceled(request: PermissionRequest) {
                if (pendingCamera == request) pendingCamera = null
            }

            override fun onProgressChanged(view: WebView, newProgress: Int) {
                progress.progress = newProgress
                progress.visibility = if (newProgress in 1..99) View.VISIBLE else View.GONE
            }

            override fun onShowFileChooser(
                view: WebView,
                callback: ValueCallback<Array<Uri>>,
                params: FileChooserParams
            ): Boolean {
                fileCallback?.onReceiveValue(null)
                fileCallback = callback
                val intent = Intent(Intent.ACTION_GET_CONTENT).apply {
                    addCategory(Intent.CATEGORY_OPENABLE)
                    type = "*/*"
                    putExtra(Intent.EXTRA_ALLOW_MULTIPLE, params.mode == FileChooserParams.MODE_OPEN_MULTIPLE)
                    val accepts = params.acceptTypes?.filter { it.isNotBlank() }?.toTypedArray()
                    if (accepts != null && accepts.isNotEmpty()) putExtra(Intent.EXTRA_MIME_TYPES, accepts)
                }
                return try {
                    startActivityForResult(Intent.createChooser(intent, "选择文件"), pickRequest)
                    true
                } catch (e: Exception) {
                    fileCallback = null
                    false
                }
            }
        }

        web.setDownloadListener { url, _, _, _, _ -> openExternal(Uri.parse(url)) }

        ensureNotifications()
        warmMedia()
        watchForUpdates()
        if (savedInstanceState != null) {
            web.restoreState(savedInstanceState)
        } else {
            web.loadUrl(APP_ORIGIN + (intent?.getStringExtra("open") ?: "/"))
        }
    }

    /**
     * Lift the session out of the page so the background poll can use it.
     *
     * The app signs in with a bearer token rather than a cookie — a cookie set
     * by the site is third-party here and the WebView will not keep it — and the
     * token lives in the page's own storage, which no other process can read.
     */
    private fun keepToken() {
        web.evaluateJavascript("localStorage.getItem('$TOKEN_KEY')") { raw ->
            val tok = raw?.trim('"')?.takeIf { it.isNotBlank() && it != "null" }
            getSharedPreferences("notif", Context.MODE_PRIVATE).edit()
                .putString("token", tok).apply()
        }
    }

    private fun openExternal(uri: Uri) {
        try { startActivity(Intent(Intent.ACTION_VIEW, uri)) } catch (e: Exception) { }
    }

    private fun showError() {
        val html = "<html><head><meta name='viewport' content='width=device-width,initial-scale=1'></head>" +
            "<body style=\"margin:0;font-family:sans-serif;background:#05070A;color:#E8E0D5;display:flex;" +
            "flex-direction:column;align-items:center;justify-content:center;height:100vh;text-align:center\">" +
            "<h2 style='font-weight:400;letter-spacing:.08em'>连接失败</h2>" +
            "<p style='opacity:.6;font-size:14px'>检查网络后点重试</p>" +
            "<a href='" + APP_ORIGIN + "/' style='margin-top:20px;padding:13px 30px;background:#002FA7;color:#fff;" +
            "text-decoration:none;font-size:15px;letter-spacing:.2em'>重试</a></body></html>"
        web.loadDataWithBaseURL(APP_ORIGIN, html, "text/html", "utf-8", null)
    }

    override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
        super.onActivityResult(requestCode, resultCode, data)
        if (requestCode == pickRequest) {
            val cb = fileCallback ?: return
            var results: Array<Uri>? = null
            if (resultCode == Activity.RESULT_OK && data != null) {
                val clip = data.clipData
                if (clip != null) {
                    results = Array(clip.itemCount) { clip.getItemAt(it).uri }
                } else if (data.data != null) {
                    results = arrayOf(data.data!!)
                }
            }
            cb.onReceiveValue(results)
            fileCallback = null
        }
    }

    override fun onRequestPermissionsResult(code: Int, perms: Array<out String>, granted: IntArray) {
        super.onRequestPermissionsResult(code, perms, granted)
        if (code != CAMERA_REQ) return
        val req = pendingCamera ?: return
        pendingCamera = null
        val ok = granted.isNotEmpty() && granted[0] == PackageManager.PERMISSION_GRANTED
        runOnUiThread {
            if (ok) req.grant(arrayOf(PermissionRequest.RESOURCE_VIDEO_CAPTURE)) else req.deny()
        }
    }

    override fun onKeyDown(keyCode: Int, event: KeyEvent): Boolean {
        if (keyCode == KeyEvent.KEYCODE_BACK && web.canGoBack()) {
            web.goBack()
            return true
        }
        return super.onKeyDown(keyCode, event)
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        intent.getStringExtra("open")?.let { web.loadUrl(APP_ORIGIN + it) }
    }

    private fun ensureNotifications() {
        if (Build.VERSION.SDK_INT >= 26) {
            val ch = NotificationChannel("notif", "通知", NotificationManager.IMPORTANCE_DEFAULT)
            (getSystemService(NOTIFICATION_SERVICE) as NotificationManager).createNotificationChannel(ch)
        }
        if (Build.VERSION.SDK_INT >= 33 &&
            checkSelfPermission(android.Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
            requestPermissions(arrayOf(android.Manifest.permission.POST_NOTIFICATIONS), 2002)
        }
        val constraints = Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build()
        val req = PeriodicWorkRequest.Builder(NotifWorker::class.java, 15, TimeUnit.MINUTES)
            .setConstraints(constraints)
            .build()
        WorkManager.getInstance(this).enqueueUniquePeriodicWork("notif-poll", ExistingPeriodicWorkPolicy.KEEP, req)
    }

    /**
     * Fill the picture cache ahead of the reader, on wifi and once a day. Kept
     * off the metered network on purpose: nobody wants an archive of paintings
     * arriving over their data plan.
     */
    /**
     * Check for a newer front end once a day on wifi, and once shortly after
     * launch so a reader who opens the app daily is never far behind.
     */
    private fun watchForUpdates() {
        val onWifi = Constraints.Builder()
            .setRequiredNetworkType(NetworkType.UNMETERED)
            .build()
        val wm = WorkManager.getInstance(this)
        wm.enqueueUniquePeriodicWork(
            UpdateWorker.NAME, ExistingPeriodicWorkPolicy.KEEP,
            PeriodicWorkRequest.Builder(UpdateWorker::class.java, 1, TimeUnit.DAYS)
                .setConstraints(onWifi).build()
        )
        wm.enqueueUniqueWork(
            UpdateWorker.NAME + "-now", ExistingWorkPolicy.KEEP,
            OneTimeWorkRequest.Builder(UpdateWorker::class.java)
                .setConstraints(onWifi)
                .setInitialDelay(20, TimeUnit.SECONDS)
                .build()
        )
    }

    private fun warmMedia() {
        val onWifi = Constraints.Builder()
            .setRequiredNetworkType(NetworkType.UNMETERED)
            .setRequiresBatteryNotLow(true)
            .build()
        val req = PeriodicWorkRequest.Builder(WarmWorker::class.java, 1, TimeUnit.DAYS)
            .setConstraints(onWifi)
            .build()
        WorkManager.getInstance(this)
            .enqueueUniquePeriodicWork(WarmWorker.NAME, ExistingPeriodicWorkPolicy.KEEP, req)
    }

    override fun onSaveInstanceState(outState: Bundle) {
        super.onSaveInstanceState(outState)
        web.saveState(outState)
    }
}
