/**
 * Hash every file in the built front end.
 *
 * Written into `dist/`, so it is published with the site and copied into the
 * APK — the same file in both places. Comparing the app's copy against the
 * site's is the entire update mechanism: a file whose hash already matches what
 * shipped in the APK never has to be downloaded, so a typical update is the few
 * JS and CSS chunks that actually changed and not fifteen megabytes of fonts.
 *
 * The lexicon is left out for the same reason it is left out of the APK: it is
 * a separate work the archive links to, served from the site and never carried.
 */
import { readdir, readFile, writeFile } from "node:fs/promises"
import { fileURLToPath } from "node:url"
import { createHash } from "node:crypto"
import path from "node:path"

export const MANIFEST = "app-bundle.json"
const SERVER_ONLY = new Set(["lexica"])

const sha = (buf) => createHash("sha256").update(buf).digest("hex")

export async function build(dir) {
  const files = {}
  async function walk(at, rel) {
    const entries = (await readdir(at, { withFileTypes: true })).sort((a, b) => (a.name < b.name ? -1 : 1))
    for (const e of entries) {
      // Nothing that starts with a dot: .DS_Store is not part of the archive
      // and its presence would change the version for no reason.
      if (e.name.startsWith(".")) continue
      const next = rel ? rel + "/" + e.name : e.name
      if (rel === "" && SERVER_ONLY.has(e.name)) continue
      if (e.isDirectory()) { await walk(path.join(at, e.name), next); continue }
      if (next === MANIFEST) continue
      files[next] = sha(await readFile(path.join(at, e.name)))
    }
  }
  await walk(dir, "")
  // A hash of the hashes: it changes when and only when some file does, so two
  // builds of the same source agree on it.
  const version = sha(Object.entries(files).map(([k, v]) => `${k} ${v}`).join("\n")).slice(0, 16)
  return { version, files }
}

const root = path.dirname(fileURLToPath(new URL("../package.json", import.meta.url)))
const dist = path.join(root, "dist")
const mf = await build(dist)
await writeFile(path.join(dist, MANIFEST), JSON.stringify(mf))
console.log(`manifest ${mf.version}, ${Object.keys(mf.files).length} files → dist/${MANIFEST}`)
