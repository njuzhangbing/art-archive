package com.changshengtian.archive

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.work.Worker
import androidx.work.WorkerParameters
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL

class NotifWorker(ctx: Context, params: WorkerParameters) : Worker(ctx, params) {

    private val base = MainActivity.SITE

    override fun doWork(): Result {
        val prefs0 = applicationContext.getSharedPreferences("notif", Context.MODE_PRIVATE)
        // The app signs in with a bearer token, not a cookie; the activity lifts
        // it out of the page's storage after every load. No token means nobody
        // has signed in on this device yet.
        val token = prefs0.getString("token", null) ?: return Result.success()
        try {
            val conn = (URL("$base/api/notifications").openConnection() as HttpURLConnection).apply {
                requestMethod = "GET"
                setRequestProperty("Authorization", "Bearer $token")
                setRequestProperty("Origin", MainActivity.APP_ORIGIN)
                setRequestProperty("Accept", "application/json")
                connectTimeout = 15000
                readTimeout = 15000
            }
            if (conn.responseCode != 200) return Result.success()
            val body = conn.inputStream.bufferedReader().use { it.readText() }
            val arr = JSONObject(body).optJSONArray("notifications") ?: return Result.success()

            val prefs = prefs0
            val lastId = prefs.getString("lastId", "") ?: ""
            var newestId = lastId
            val fresh = ArrayList<String>()
            for (i in 0 until arr.length()) {
                val n = arr.getJSONObject(i)
                val id = n.optString("id")
                if (id > newestId) newestId = id
                if (id > lastId && !n.optBoolean("read", false)) fresh.add(n.optString("text"))
            }
            if (fresh.isNotEmpty() && lastId.isNotEmpty()) postNotice(fresh)
            prefs.edit().putString("lastId", newestId).apply()
        } catch (e: Exception) {
            return Result.retry()
        }
        return Result.success()
    }

    private fun postNotice(items: List<String>) {
        val ctx = applicationContext
        if (Build.VERSION.SDK_INT >= 26) {
            val ch = NotificationChannel("notif", "通知", NotificationManager.IMPORTANCE_DEFAULT)
            (ctx.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager).createNotificationChannel(ch)
        }
        val tap = Intent(ctx, MainActivity::class.java).apply {
            putExtra("open", "/notifications")
            flags = Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP
        }
        val flags = PendingIntent.FLAG_UPDATE_CURRENT or (if (Build.VERSION.SDK_INT >= 23) PendingIntent.FLAG_IMMUTABLE else 0)
        val pi = PendingIntent.getActivity(ctx, 0, tap, flags)
        val title = if (items.size == 1) "长生天计划" else "长生天计划 · ${items.size} 条新通知"
        val builder = NotificationCompat.Builder(ctx, "notif")
            .setSmallIcon(R.drawable.ic_notif)
            .setContentTitle(title)
            .setContentText(items.first())
            .setStyle(NotificationCompat.BigTextStyle().bigText(items.joinToString("\n")))
            .setAutoCancel(true)
            .setContentIntent(pi)
        try {
            NotificationManagerCompat.from(ctx).notify(2026, builder.build())
        } catch (e: SecurityException) {
        }
    }
}
