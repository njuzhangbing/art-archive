package com.changshengtian.archive

import android.content.Context
import androidx.work.Worker
import androidx.work.WorkerParameters
import java.net.HttpURLConnection
import java.net.URL

/**
 * Pull the archive's covers down before anyone scrolls to them.
 *
 * Runs on an unmetered connection only, once a day. It asks the API for what
 * the reader would see first — projects, characters, programmes — takes every
 * media path in the answer and puts the files in [MediaCache]. Nothing is
 * rendered and no JSON is kept; the list is read for its picture paths and
 * thrown away, so nothing here can go stale or leak a record that was closed
 * after the fact.
 *
 * Bounded on both axes. A run stops at [MAX_FILES] or [MAX_BYTES], whichever
 * comes first, so a growing archive can never turn this into an unbounded
 * download on someone's phone.
 */
class WarmWorker(ctx: Context, params: WorkerParameters) : Worker(ctx, params) {

    companion object {
        const val NAME = "media-warm"
        private const val MAX_FILES = 80
        private const val MAX_BYTES = 80L * 1024 * 1024
        private val LISTS = listOf("/api/projects", "/api/characters", "/api/programmes")
        private val MEDIA = Regex("\"(/media/[^\"]+)\"")
    }

    override fun doWork(): Result {
        val token = applicationContext
            .getSharedPreferences("notif", Context.MODE_PRIVATE)
            .getString("token", null) ?: return Result.success()

        val paths = LinkedHashSet<String>()
        for (path in LISTS) {
            val body = read(MainActivity.SITE + path, token) ?: continue
            for (m in MEDIA.findAll(body)) paths.add(m.groupValues[1])
            if (paths.size >= MAX_FILES) break
        }
        if (paths.isEmpty()) return Result.success()

        val before = MediaCache.bytes(applicationContext)
        var got = 0
        for (p in paths.take(MAX_FILES)) {
            if (isStopped) break
            if (MediaCache.bytes(applicationContext) - before >= MAX_BYTES) break
            if (MediaCache.fetch(applicationContext, MainActivity.SITE + p)) got++
        }
        return Result.success()
    }

    private fun read(url: String, token: String): String? = try {
        val conn = (URL(url).openConnection() as HttpURLConnection).apply {
            requestMethod = "GET"
            setRequestProperty("Authorization", "Bearer $token")
            setRequestProperty("Origin", MainActivity.APP_ORIGIN)
            setRequestProperty("Accept", "application/json")
            connectTimeout = 15000
            readTimeout = 20000
        }
        if (conn.responseCode == 200) conn.inputStream.bufferedReader().use { it.readText() } else null
    } catch (e: Exception) {
        null
    }
}
