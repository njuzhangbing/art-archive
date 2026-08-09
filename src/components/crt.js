/**
 * The page change, played as a cathode-ray tube switching source.
 *
 * A real CRT does not cut between pictures. The raster collapses to a bright
 * line, the line pulls in to a dot, and when the new signal arrives the whole
 * thing opens back out — and for a moment afterwards you can still see the
 * tube: scanlines crawling, the shadow mask, the corners falling away, a hum
 * bar rolling down the glass. That residue fades and the page is left clean.
 *
 * Nothing here transforms the page itself. The collapse is played by shutters
 * closing over it, which keeps fixed and sticky chrome exactly where it was —
 * a transform on an ancestor would reparent all of it for the duration.
 *
 * Timings live in the stylesheet as keyframes; this only schedules the swap and
 * the teardown against them.
 */

const tame = matchMedia("(prefers-reduced-motion: reduce)").matches

/** When the shutters are fully closed and the new view can be built unseen. */
const SWAP_AT = 248
/** When the tube is open again and the router may carry on. */
const OPEN_AT = 660
/** When the last of the glass has faded and the layer can go. */
const GONE_AT = 1320

/**
 * Swap the page behind a CRT source change.
 * @param {() => void} swap builds the new view; called while the tube is shut
 * @returns {Promise<void>} resolves once the picture is back
 */
export function crtSwap(swap) {
  if (tame) {
    swap()
    window.scrollTo(0, 0)
    return Promise.resolve()
  }

  const el = document.createElement("div")
  el.className = "crt"
  el.setAttribute("aria-hidden", "true")
  el.innerHTML =
    '<div class="crt__shut crt__shut--t"></div>' +
    '<div class="crt__shut crt__shut--b"></div>' +
    '<div class="crt__beam"></div>' +
    '<div class="crt__glass"></div>' +
    '<div class="crt__hum"></div>'
  document.body.appendChild(el)

  return new Promise((resolve) => {
    let swapped = false
    const doSwap = () => {
      if (swapped) return
      swapped = true
      try { swap() } finally { window.scrollTo(0, 0) }
    }
    const timers = [
      setTimeout(doSwap, SWAP_AT),
      setTimeout(resolve, OPEN_AT),
      setTimeout(() => el.remove(), GONE_AT)
    ]
    // If the tab is backgrounded the timers still fire, but a torn-down router
    // must never be left waiting on one — everything above is idempotent, and
    // this is the backstop that guarantees both happen.
    setTimeout(() => {
      timers.forEach(clearTimeout)
      doSwap()
      el.remove()
      resolve()
    }, GONE_AT + 400)
  })
}
