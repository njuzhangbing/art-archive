/**
 * Copy the built site into the Android project.
 *
 * The APK carries the whole front end — pages, styles, subset fonts, plates —
 * so the app paints without a network round trip and only its data crosses the
 * wire. The destination is a generated directory outside `src/main/assets`, so
 * a stale copy can never be committed by accident.
 */
import { cp, rm, mkdir, stat, readdir } from "node:fs/promises"
import { fileURLToPath } from "node:url"
import path from "node:path"

const root = path.dirname(fileURLToPath(new URL("../package.json", import.meta.url)))
const from = path.join(root, "dist")
const to = path.join(root, "android/app/src/main/webassets/www")

try {
  await stat(from)
} catch {
  console.error("no dist/ — run the web build first")
  process.exit(1)
}

await rm(path.dirname(to), { recursive: true, force: true })
await mkdir(to, { recursive: true })
await cp(from, to, { recursive: true })

async function weigh(dir) {
  let n = 0, bytes = 0
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name)
    if (e.isDirectory()) { const s = await weigh(p); n += s.n; bytes += s.bytes }
    else { n++; bytes += (await stat(p)).size }
  }
  return { n, bytes }
}

const { n, bytes } = await weigh(to)
console.log(`bundled ${n} files, ${(bytes / 1048576).toFixed(1)} MB → android/app/src/main/webassets/www`)
