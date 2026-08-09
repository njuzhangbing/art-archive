package com.changshengtian.archive

import android.content.Context
import android.webkit.WebResourceResponse
import java.io.File
import java.net.HttpURLConnection
import java.net.URL
import java.security.MessageDigest

/**
 * A durable on-disk cache for the archive's artwork.
 *
 * The pages ship inside the APK, so the only heavy thing left on the wire is
 * the pictures — plates, covers, portraits. Those are the right thing to keep:
 * a media key is random, is never written twice, and the server already sends
 * them `immutable, max-age=1y`. A key cannot change meaning, so a hit is always
 * correct and there is no invalidation to get wrong.
 *
 * The WebView has its own HTTP cache doing some of this already; it is small,
 * shared with every other page the device has loaded, and evicted early. This
 * one is the app's own, with its own budget, and survives.
 *
 * Deliberately not cached: API responses. A record's classification can change
 * — a project or a programme can be closed — and a stale body would keep
 * showing a reader something the archive has since shut. Pictures are public by
 * key and the server says so in its own headers; records are not.
 */
object MediaCache {

    /** How much artwork the app is allowed to keep. Oldest read goes first. */
    private const val BUDGET = 256L * 1024 * 1024
    private const val CONNECT_MS = 15000
    private const val READ_MS = 20000

    private fun dir(ctx: Context): File =
        File(ctx.filesDir, "media").apply { if (!exists()) mkdirs() }

    private fun key(url: String): String {
        val d = MessageDigest.getInstance("SHA-256").digest(url.toByteArray())
        return d.joinToString("") { "%02x".format(it) }
    }

    /** Cross-origin reads — the export tool uses fetch — need the same allow the server sends. */
    private fun headers() = mapOf(
        "access-control-allow-origin" to "*",
        "cache-control" to "public, max-age=31536000, immutable"
    )

    private fun respond(body: File, type: File): WebResourceResponse? {
        if (!body.isFile) return null
        val mime = if (type.isFile) type.readText() else "application/octet-stream"
        // Touch it, so the trim below evicts by least-recently-read.
        body.setLastModified(System.currentTimeMillis())
        return WebResourceResponse(mime, null, 200, "OK", headers(), body.inputStream())
    }

    /**
     * Answer a media request from disk, fetching and storing it the first time.
     * Returns null on any failure, which hands the request back to the WebView
     * to load the ordinary way.
     */
    fun serve(ctx: Context, url: String): WebResourceResponse? {
        val id = key(url)
        val body = File(dir(ctx), id)
        val type = File(dir(ctx), "$id.t")
        respond(body, type)?.let { return it }
        if (!fetch(ctx, url)) return null
        return respond(body, type)
    }

    /**
     * Pull a file into the cache without serving it. Used by the warm-up.
     * @return true when the file is on disk afterwards
     */
    fun fetch(ctx: Context, url: String): Boolean {
        val id = key(url)
        val body = File(dir(ctx), id)
        if (body.isFile) return true
        val part = File(dir(ctx), "$id.part")
        try {
            val conn = (URL(url).openConnection() as HttpURLConnection).apply {
                requestMethod = "GET"
                setRequestProperty("Origin", MainActivity.APP_ORIGIN)
                connectTimeout = CONNECT_MS
                readTimeout = READ_MS
            }
            if (conn.responseCode != 200) return false
            val mime = (conn.contentType ?: "application/octet-stream").substringBefore(';').trim()
            conn.inputStream.use { input -> part.outputStream().use { input.copyTo(it) } }
            // Rename last: a half-written file must never be readable as a hit.
            if (!part.renameTo(body)) return false
            File(dir(ctx), "$id.t").writeText(mime)
        } catch (e: Exception) {
            part.delete()
            return false
        }
        trim(ctx)
        return true
    }

    /** Drop the least-recently-read files until the cache is inside its budget. */
    private fun trim(ctx: Context) {
        val files = dir(ctx).listFiles() ?: return
        var total = files.sumOf { it.length() }
        if (total <= BUDGET) return
        for (f in files.filter { !it.name.endsWith(".t") }.sortedBy { it.lastModified() }) {
            if (total <= BUDGET) break
            total -= f.length()
            File(dir(ctx), f.name + ".t").delete()
            f.delete()
        }
    }

    fun bytes(ctx: Context): Long = (dir(ctx).listFiles() ?: emptyArray()).sumOf { it.length() }
}
