import { json, oops } from "./_lib/respond.mjs"
import { store } from "./_lib/store.mjs"
import { currentUser } from "./_lib/auth.mjs"
import { pushNotif } from "./_lib/notify.mjs"

export default async (req, context) => {
  const me = await currentUser(req)
  if (!me) return oops("未登录", 401)
  if (req.method !== "POST") return oops("方法不允许", 405)
  const handle = context.params.handle
  const users = store("users")
  const targetId = await users.getJSON("handle/" + String(handle).toLowerCase())
  if (!targetId) return oops("用户不存在", 404)
  if (targetId === me.id) return oops("不能关注自己", 400)

  const follows = store("follows")
  const key = "follow/" + me.id + "/" + targetId
  const revKey = "follower/" + targetId + "/" + me.id
  const exists = await follows.getJSON(key)
  if (exists) {
    await follows.delete(key)
    await follows.delete(revKey)
  } else {
    const now = new Date().toISOString()
    await follows.setJSON(key, { at: now })
    await follows.setJSON(revKey, { at: now })
    await pushNotif(targetId, { type: "follow", text: "@" + me.handle + " 关注了你", link: "/u/" + me.handle, fromHandle: me.handle })
  }
  const followerCount = (await follows.list({ prefix: "follower/" + targetId + "/" })).blobs.length
  return json({ following: !exists, followerCount })
}

export const config = { path: "/api/users/:handle/follow" }
