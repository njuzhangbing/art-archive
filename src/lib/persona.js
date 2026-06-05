export const PERSONA = [
  { key: "FULL", label: "全拟人化", en: "Full Personification", img: "/persona/full.webp" },
  { key: "SEMI", label: "半拟人化", en: "Semi Personification", img: "/persona/semi.webp" }
]

export const PERSONA_KEYS = PERSONA.map((p) => p.key)

export function personaOf(key) {
  return PERSONA.find((p) => p.key === key) || PERSONA[0]
}
