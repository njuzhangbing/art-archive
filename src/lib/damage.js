export const DAMAGE = [
  { key: "RED", label: "Red", color: "#D7263D", icon: "/damage/red.svg" },
  { key: "WHITE", label: "White", color: "#C9BE7E", icon: "/damage/white.svg" },
  { key: "BLACK", label: "Black", color: "#6A2C9C", icon: "/damage/black.svg" },
  { key: "PALE", label: "Pale", color: "#2BA6A4", icon: "/damage/pale.svg" }
]

export const DAMAGE_KEYS = DAMAGE.map((d) => d.key)

export function damageOf(key) {
  return DAMAGE.find((d) => d.key === key) || DAMAGE[0]
}
