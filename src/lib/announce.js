export const LEVELS = [
  { key: "normal", zh: "普通" },
  { key: "important", zh: "重要" },
  { key: "urgent", zh: "紧急" }
]

export const LEVEL_KEYS = LEVELS.map((l) => l.key)

export function levelOf(key) {
  return LEVELS.find((l) => l.key === key) || LEVELS[0]
}

export function levelRank(key) {
  const i = LEVEL_KEYS.indexOf(key)
  return i < 0 ? 0 : i
}
