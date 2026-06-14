package com.changshengtian.archive

import android.annotation.SuppressLint
import android.app.Activity
import android.content.Intent
import android.net.Uri
import android.os.Bundle
import android.view.KeyEvent
import android.view.View
import android.webkit.CookieManager
import android.webkit.ValueCallback
import android.webkit.WebChromeClient
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.ProgressBar
import android.app.NotificationChannel
import android.app.NotificationManager
import android.content.pm.PackageManager
import android.os.Build
import androidx.work.Constraints
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.NetworkType
import androidx.work.PeriodicWorkRequest
import androidx.work.WorkManager
import java.util.concurrent.TimeUnit

class MainActivity : Activity() {

    private lateinit var web: WebView
    private lateinit var progress: ProgressBar
    private var fileCallback: ValueCallback<Array<Uri>>? = null

    private val pickRequest = 1001
    private val startUrl = "https://ptrart.netlify.app/"
    private val host = "ptrart.netlify.app"

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)
        web = findViewById(R.id.web)
        progress = findViewById(R.id.progress)

        CookieManager.getInstance().setAcceptCookie(true)
        CookieManager.getInstance().setAcceptThirdPartyCookies(web, true)

        web.settings.apply {
            javaScriptEnabled = true
            domStorageEnabled = true
            databaseEnabled = true
            allowFileAccess = true
            allowContentAccess = true
            loadWithOverviewMode = true
            useWideViewPort = true
            mediaPlaybackRequiresUserGesture = false
            cacheMode = WebSettings.LOAD_DEFAULT
            setSupportZoom(false)
            setSupportMultipleWindows(false)
        }

        web.webViewClient = object : WebViewClient() {
            override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
                val url = request.url
                val scheme = url.scheme ?: ""
                if (scheme == "http" || scheme == "https") {
                    val h = url.host ?: return false
                    if (h == host || h.endsWith(".netlify.app")) return false
                    openExternal(url)
                    return true
                }
                openExternal(url)
                return true
            }

            override fun onReceivedError(view: WebView, request: WebResourceRequest, error: WebResourceError) {
                if (request.isForMainFrame) showError()
            }
        }

        web.webChromeClient = object : WebChromeClient() {
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
        if (savedInstanceState != null) {
            web.restoreState(savedInstanceState)
        } else {
            val openPath = intent?.getStringExtra("open")
            web.loadUrl(if (openPath != null) "https://$host$openPath" else startUrl)
        }
    }

    private fun openExternal(uri: Uri) {
        try { startActivity(Intent(Intent.ACTION_VIEW, uri)) } catch (e: Exception) { }
    }

    private fun showError() {
        val html = "<html><head><meta name='viewport' content='width=device-width,initial-scale=1'></head>" +
            "<body style=\"margin:0;font-family:sans-serif;background:#0E0E0E;color:#EEE;display:flex;flex-direction:column;" +
            "align-items:center;justify-content:center;height:100vh;text-align:center\">" +
            "<h2>连接失败</h2><p style='opacity:.7'>检查网络后点重试</p>" +
            "<a href='" + startUrl + "' style='margin-top:18px;padding:12px 26px;background:#E2231A;color:#fff;" +
            "text-decoration:none;font-size:16px'>重试</a></body></html>"
        web.loadDataWithBaseURL(startUrl, html, "text/html", "utf-8", null)
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

    override fun onKeyDown(keyCode: Int, event: KeyEvent): Boolean {
        if (keyCode == KeyEvent.KEYCODE_BACK && web.canGoBack()) {
            web.goBack()
            return true
        }
        return super.onKeyDown(keyCode, event)
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        intent.getStringExtra("open")?.let { web.loadUrl("https://$host$it") }
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

    override fun onSaveInstanceState(outState: Bundle) {
        super.onSaveInstanceState(outState)
        web.saveState(outState)
    }
}
