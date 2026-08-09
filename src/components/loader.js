let el = null
let shownAt = 0

export function showLoader() {
  if (el) return
  el = document.createElement("div")
  el.id = "loader"
  el.innerHTML = '<div class="loader__in"><div class="loader__seal">天</div><div class="loader__bar"></div><div class="loader__txt">LOADING 载入中</div></div>'
  document.body.appendChild(el)
  shownAt = performance.now()
}

export function hideLoader() {
  if (!el) return
  const node = el
  el = null
  const wait = Math.max(0, 600 - (performance.now() - shownAt))
  setTimeout(() => {
    node.classList.add("gone")
    setTimeout(() => node.remove(), 600)
  }, wait)
}
