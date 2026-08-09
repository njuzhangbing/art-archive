package com.changshengtian.archive

import android.content.Context
import java.io.File
import java.io.InputStream
import java.net.HttpURLConnection
import java.net.URL
import java.security.MessageDigest
import org.json.JSONObject

/**
 * The front end, brought up to date without reinstalling the app.
 *
 * The APK carries a complete copy of the site so the app paints instantly. That
 * copy would otherwise be frozen at whatever the build was, and every change to
 * the archive's pages would need a new install. So the app also keeps an
 * *overlay*: a directory of the files that differ from the ones it shipped with.
 *
 * The site publishes `app-bundle.json` — every file it serves, with a SHA-256,
 * and a version that is a hash of those hashes. The APK carries the same file
 * for its own build. Updating is then a set difference: download only the paths
 * whose hash differs from the APK's, keep serving the rest straight out of
 * assets. A normal change to the pages is a handful of JS and CSS chunks —
 * tens of kilobytes — not the fifteen megabytes of fonts and plates that never
 * move.
 *
 * Three rules keep it from ever showing a half-updated site:
 *
 *  - a download lands in `<version>.part`, is verified hash by hash, and only
 *    then is renamed into place; a partial directory is never readable;
 *  - the pointer file is written last, so the swap is one atomic rename away
 *    from being invisible;
 *  - and the pointer is read once, when the activity starts. An update that
 *    arrives while someone is reading takes effect the next time they open the
 *    app, never underneath them.
 *
 * If anything at all goes wrong the app keeps running on what it already had.
 */
object WebUpdate {

    private const val MANIFEST = "app-bundle.json"
    private const val ACTIVE = "active"
    private const val CONNECT_MS = 15000
    private const val READ_MS = 20000
    /** A guard against a manifest that has gone wrong, not a real ceiling. */
    private const val MAX_FILES = 400
    private const val MAX_BYTES = 40L * 1024 * 1024

    private fun root(ctx: Context) = File(ctx.filesDir, "web").apply { if (!exists()) mkdirs() }
    private fun pointer(ctx: Context) = File(root(ctx), ACTIVE)

    private fun sha(bytes: ByteArray): String =
        MessageDigest.getInstance("SHA-256").digest(bytes).joinToString("") { "%02x".format(it) }

    /** What the APK was built with. Absent only if a build went wrong. */
    private fun shipped(ctx: Context): JSONObject? = try {
        ctx.assets.open("www/$MANIFEST").use { JSONObject(it.readBytes().decodeToString()) }
    } catch (e: Exception) {
        null
    }

    /**
     * The overlay in force for this run, or null to serve the APK alone.
     *
     * Read once at startup by [MainActivity] and held for the session, so the
     * page in front of the reader is served by one bundle from beginning to end.
     */
    fun active(ctx: Context): File? {
        val v = try { pointer(ctx).takeIf { it.isFile }?.readText()?.trim() } catch (e: Exception) { null }
        if (v.isNullOrEmpty()) return null
        val dir = File(root(ctx), v)
        return if (File(dir, MANIFEST).isFile) dir else null
    }

    /** The version the app is actually running: the overlay's, else the APK's. */
    fun version(ctx: Context): String {
        active(ctx)?.let {
            try { return JSONObject(File(it, MANIFEST).readText()).optString("version") } catch (e: Exception) {}
        }
        return shipped(ctx)?.optString("version") ?: "unknown"
    }

    /**
     * Fetch the site's manifest and install anything new.
     *
     * Runs on a worker thread. Returns the version now staged for the next
     * launch, or null when there was nothing to do or the attempt failed —
     * either way the app is left in a working state.
     */
    fun sync(ctx: Context): String? {
        val ship = shipped(ctx) ?: return null
        val remote = fetchJson(MainActivity.SITE + "/" + MANIFEST) ?: return null

        val want = remote.optString("version")
        if (want.isEmpty() || want == version(ctx)) return null

        val wantFiles = remote.optJSONObject("files") ?: return null
        val shipFiles = ship.optJSONObject("files") ?: JSONObject()
        if (wantFiles.length() > MAX_FILES) return null

        // Everything the APK cannot already answer for.
        val needed = wantFiles.keys().asSequence()
            .filter { wantFiles.optString(it) != shipFiles.optString(it) }
            .toList()

        val staging = File(root(ctx), "$want.part")
        staging.deleteRecursively()
        if (!staging.mkdirs()) return null

        try {
            var budget = MAX_BYTES
            for (rel in needed) {
                if (rel.startsWith("/") || rel.contains("..")) return abort(staging)
                val body = get(MainActivity.SITE + "/" + rel) ?: return abort(staging)
                // Verified before it is written, so a corrupted or swapped file
                // never reaches the disk, let alone the WebView.
                if (sha(body) != wantFiles.optString(rel)) return abort(staging)
                budget -= body.size
                if (budget < 0) return abort(staging)
                val out = File(staging, rel)
                out.parentFile?.mkdirs()
                out.writeBytes(body)
            }
            // Written last: its presence is what makes the directory usable.
            File(staging, MANIFEST).writeText(remote.toString())
        } catch (e: Exception) {
            return abort(staging)
        }

        val done = File(root(ctx), want)
        done.deleteRecursively()
        if (!staging.renameTo(done)) return abort(staging)
        pointer(ctx).writeText(want)
        prune(ctx, want)
        return want
    }

    private fun abort(staging: File): String? {
        staging.deleteRecursively()
        return null
    }

    /** Keep the overlay in force and nothing else. */
    private fun prune(ctx: Context, keep: String) {
        root(ctx).listFiles()?.forEach {
            if (it.isDirectory && it.name != keep) it.deleteRecursively()
        }
    }

    private fun open(url: String): HttpURLConnection? = try {
        (URL(url).openConnection() as HttpURLConnection).apply {
            requestMethod = "GET"
            setRequestProperty("Origin", MainActivity.APP_ORIGIN)
            // The overlay must reflect what the site serves now, not what a
            // proxy remembers.
            setRequestProperty("Cache-Control", "no-cache")
            connectTimeout = CONNECT_MS
            readTimeout = READ_MS
        }.takeIf { it.responseCode == 200 }
    } catch (e: Exception) {
        null
    }

    private fun get(url: String): ByteArray? = try {
        open(url)?.inputStream?.use(InputStream::readBytes)
    } catch (e: Exception) {
        null
    }

    private fun fetchJson(url: String): JSONObject? = try {
        get(url)?.let { JSONObject(it.decodeToString()) }
    } catch (e: Exception) {
        null
    }
}
