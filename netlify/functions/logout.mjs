import { json, bakeCookie } from "./_lib/respond.mjs"

export default async () => json({ ok: true }, { headers: { "set-cookie": bakeCookie("sess", "", { clear: true }) } })

export const config = { path: "/api/logout" }
