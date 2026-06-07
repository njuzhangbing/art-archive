export const MIMICRY = [
  { key: "MALE", label: "雄" },
  { key: "FEMALE", label: "雌" },
  { key: "HERM", label: "雌雄同体" },
  { key: "NONE", label: "无性" },
  { key: "UNKNOWN", label: "不明" }
]

export const MIMICRY_KEYS = MIMICRY.map((m) => m.key)

export function mimicryLabel(key) {
  const hit = MIMICRY.find((m) => m.key === key)
  return hit ? hit.label : "？？？"
}
