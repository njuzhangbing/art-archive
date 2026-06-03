export const GRADES = [
  { key: "ALEPH", color: "#D7263D", zh: "阿莱夫", note: "最高危·至上" },
  { key: "WAW", color: "#6A2C9C", zh: "瓦夫", note: "极重·非凡" },
  { key: "HE", color: "#F0A202", zh: "赫", note: "显著·要件" },
  { key: "TETH", color: "#1B6CA8", zh: "泰特", note: "常规·稳定" },
  { key: "ZAYIN", color: "#2A9D4A", zh: "扎因", note: "基底·安全" }
]

export const GRADE_KEYS = GRADES.map((g) => g.key)

export function gradeOf(key) {
  return GRADES.find((g) => g.key === key) || GRADES[GRADES.length - 1]
}

export function gradeRank(key) {
  const i = GRADE_KEYS.indexOf(key)
  return i < 0 ? GRADES.length : i
}
