package com.changshengtian.archive

import android.content.Context
import androidx.work.Worker
import androidx.work.WorkerParameters

/**
 * Look for a newer front end, on a connection that is not being paid for by the
 * megabyte.
 *
 * Deliberately quiet: nothing is announced, nothing interrupts. Whatever it
 * installs is picked up the next time the app is opened, which is also the only
 * moment it is safe to change the files under a running page.
 */
class UpdateWorker(ctx: Context, params: WorkerParameters) : Worker(ctx, params) {

    companion object { const val NAME = "web-update" }

    override fun doWork(): Result {
        // A failure here is not worth a retry storm; the job runs again on its
        // own schedule and the app is perfectly usable in the meantime.
        WebUpdate.sync(applicationContext)
        return Result.success()
    }
}
