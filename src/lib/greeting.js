const tails = [
  "准备好开始动笔了吗？",
  "今天也要画下去。",
  "画布在等你。",
  "来画点什么吧。",
  "新的一版，从现在开始。",
  "让长生天见证你的笔触。",
  "哪怕只画一格，也是进步。",
  "把脑子里的画面落到纸上吧。",
  "今天想画点什么？",
  "深呼吸，然后落笔。"
]

let last = -1

export function greetingFor(name) {
  const hr = new Date().getHours()
  const greet = hr < 5 ? "夜深了" : hr < 11 ? "早上好" : hr < 13 ? "中午好" : hr < 18 ? "下午好" : hr < 23 ? "晚上好" : "夜深了"
  let i = Math.floor(Math.random() * tails.length)
  if (tails.length > 1) while (i === last) i = Math.floor(Math.random() * tails.length)
  last = i
  return { greet, name: name || "创作者", tail: tails[i] }
}
