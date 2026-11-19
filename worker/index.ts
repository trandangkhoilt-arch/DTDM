import { Hono } from 'hono'
import { getCookie, setCookie, deleteCookie } from 'hono/cookie'

type Bindings = { DB: D1Database; ASSETS: Fetcher }
type Variables = { userId: string }
type AppEnv = { Bindings: Bindings; Variables: Variables }

const app = new Hono<AppEnv>()
const encoder = new TextEncoder()

const now = () => new Date().toISOString()
const uuid = () => crypto.randomUUID()
const toBase64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes))
const fromBase64 = (value: string) => Uint8Array.from(atob(value), (c) => c.charCodeAt(0))

async function hashPassword(password: string) {
  const salt = crypto.getRandomValues(new Uint8Array(16))
  const key = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveBits'])
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt, iterations: 120_000, hash: 'SHA-256' }, key, 256)
  return `pbkdf2$120000$${toBase64(salt)}$${toBase64(new Uint8Array(bits))}`
}

async function verifyPassword(password: string, stored: string) {
  const [scheme, iterations, saltText, hashText] = stored.split('$')
  if (scheme !== 'pbkdf2') return false
  const key = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveBits'])
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt: fromBase64(saltText), iterations: Number(iterations), hash: 'SHA-256' }, key, 256)
  const expected = fromBase64(hashText)
  const actual = new Uint8Array(bits)
  let mismatch = 0
  for (let i = 0; i < expected.length; i++) mismatch |= expected[i] ^ (actual[i] ?? 0)
  return mismatch === 0
}

async function tokenHash(token: string) {
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(token))
  return toBase64(new Uint8Array(digest))
}

async function createSession(c: Parameters<typeof app.get>[1] extends never ? any : any, userId: string) {
  const token = toBase64(crypto.getRandomValues(new Uint8Array(32))).replaceAll('+', '-').replaceAll('/', '_')
  const sessionId = uuid()
  const expires = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
  await c.env.DB.prepare('INSERT INTO sessions (id,user_id,token_hash,expires_at,created_at) VALUES (?,?,?,?,?)')
    .bind(sessionId, userId, await tokenHash(token), expires, now()).run()
  setCookie(c, 'taskflow_session', token, {
    httpOnly: true,
    secure: c.req.url.startsWith('https://'),
    sameSite: 'Lax',
    path: '/',
    maxAge: 7 * 24 * 60 * 60,
  })
}

app.use('/api/*', async (c, next) => {
  await c.env.DB.prepare('PRAGMA foreign_keys = ON').run()
  await next()
})

app.use('/api/*', async (c, next) => {
  if (!['POST', 'PATCH', 'PUT', 'DELETE'].includes(c.req.method)) return next()
  const origin = c.req.header('origin')
  if (origin && c.req.url.startsWith('https://') && !c.req.url.startsWith(origin)) {
    return c.json({ error: 'Origin không hợp lệ' }, 403)
  }
  await next()
})

app.use('/api/*', async (c, next) => {
  if (c.req.path.startsWith('/api/auth/login') || c.req.path.startsWith('/api/auth/register')) return next()
  const token = getCookie(c, 'taskflow_session')
  if (token) {
    const expires = new Date(Date.now()).toISOString()
    const row = await c.env.DB.prepare(
      'SELECT s.user_id FROM sessions s WHERE s.token_hash=? AND s.expires_at>?'
    ).bind(await tokenHash(token), expires).first<{ user_id: string }>()
    if (row) c.set('userId', row.user_id)
  }
  await next()
})

app.get('/api/auth/me', async (c) => {
  const userId = c.get('userId')
  if (!userId) return c.json({ error: 'Chưa đăng nhập' }, 401)
  const user = await c.env.DB.prepare('SELECT id,name,email,created_at,updated_at FROM users WHERE id=?').bind(userId).first()
  return c.json({ user })
})

app.post('/api/auth/register', async (c) => {
  const body = await c.req.json<any>()
  const name = String(body.name ?? '').trim()
  const email = String(body.email ?? '').trim().toLowerCase()
  const password = String(body.password ?? '')
  if (name.length < 2 || name.length > 80) return c.json({ error: 'Tên hiển thị phải từ 2–80 ký tự' }, 400)
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return c.json({ error: 'Email không hợp lệ' }, 400)
  if (password.length < 8) return c.json({ error: 'Mật khẩu tối thiểu 8 ký tự' }, 400)
  const exists = await c.env.DB.prepare('SELECT id FROM users WHERE email=?').bind(email).first()
  if (exists) return c.json({ error: 'Email đã được sử dụng' }, 409)
  const id = uuid()
  const stamp = now()
  await c.env.DB.prepare('INSERT INTO users (id,name,email,password_hash,created_at,updated_at) VALUES (?,?,?,?,?,?)')
    .bind(id, name, email, await hashPassword(password), stamp, stamp).run()
  const defaults = [
    ['Học tập', '#6366F1'], ['Công việc', '#14B8A6'], ['Cá nhân', '#F59E0B'],
  ] as const
  for (const [categoryName, color] of defaults) {
    await c.env.DB.prepare('INSERT INTO categories (id,user_id,name,color,created_at) VALUES (?,?,?,?,?)')
      .bind(uuid(), id, categoryName, color, stamp).run()
  }
  await createSession(c, id)
  return c.json({ user: { id, name, email, created_at: stamp, updated_at: stamp } }, 201)
})

app.post('/api/auth/login', async (c) => {
  const body = await c.req.json<any>()
  const email = String(body.email ?? '').trim().toLowerCase()
  const password = String(body.password ?? '')
  const user = await c.env.DB.prepare('SELECT * FROM users WHERE email=?').bind(email).first<any>()
  if (!user || !(await verifyPassword(password, user.password_hash))) return c.json({ error: 'Email hoặc mật khẩu không đúng' }, 401)
  await createSession(c, user.id)
  return c.json({ user: { id: user.id, name: user.name, email: user.email, created_at: user.created_at, updated_at: user.updated_at } })
})

app.post('/api/auth/logout', async (c) => {
  const token = getCookie(c, 'taskflow_session')
  if (token) await c.env.DB.prepare('DELETE FROM sessions WHERE token_hash=?').bind(await tokenHash(token)).run()
  deleteCookie(c, 'taskflow_session', { path: '/' })
  return c.json({ ok: true })
})

function requireUser(c: any) {
  const userId = c.get('userId')
  if (!userId) throw new Response(JSON.stringify({ error: 'Chưa đăng nhập' }), { status: 401, headers: { 'Content-Type': 'application/json' } })
  return userId
}

app.get('/api/categories', async (c) => {
  const userId = requireUser(c)
  const { results } = await c.env.DB.prepare(
    `SELECT c.*, COUNT(t.id) task_count FROM categories c
     LEFT JOIN tasks t ON t.category_id=c.id AND t.user_id=c.user_id
     WHERE c.user_id=? GROUP BY c.id ORDER BY c.created_at`
  ).bind(userId).all()
  return c.json({ categories: results })
})

app.post('/api/categories', async (c) => {
  const userId = requireUser(c)
  const body = await c.req.json<any>()
  const name = String(body.name ?? '').trim()
  const color = String(body.color ?? '')
  if (name.length < 1 || name.length > 40) return c.json({ error: 'Tên danh mục phải từ 1–40 ký tự' }, 400)
  if (!/^#[0-9A-Fa-f]{6}$/.test(color)) return c.json({ error: 'Màu không hợp lệ' }, 400)
  const id = uuid()
  try {
    await c.env.DB.prepare('INSERT INTO categories (id,user_id,name,color,created_at) VALUES (?,?,?,?,?)')
      .bind(id, userId, name, color, now()).run()
  } catch {
    return c.json({ error: 'Danh mục đã tồn tại' }, 409)
  }
  return c.json({ category: { id, name, color } }, 201)
})

app.patch('/api/categories/:id', async (c) => {
  const userId = requireUser(c)
  const body = await c.req.json<any>()
  const name = String(body.name ?? '').trim()
  const color = String(body.color ?? '')
  if (name.length < 1 || name.length > 40 || !/^#[0-9A-Fa-f]{6}$/.test(color)) return c.json({ error: 'Dữ liệu danh mục không hợp lệ' }, 400)
  const result = await c.env.DB.prepare('UPDATE categories SET name=?,color=? WHERE id=? AND user_id=?').bind(name, color, c.req.param('id'), userId).run()
  if (!result.meta.changes) return c.json({ error: 'Không tìm thấy danh mục' }, 404)
  return c.json({ ok: true })
})

app.delete('/api/categories/:id', async (c) => {
  const userId = requireUser(c)
  await c.env.DB.prepare('UPDATE tasks SET category_id=NULL WHERE category_id=? AND user_id=?').bind(c.req.param('id'), userId).run()
  const result = await c.env.DB.prepare('DELETE FROM categories WHERE id=? AND user_id=?').bind(c.req.param('id'), userId).run()
  if (!result.meta.changes) return c.json({ error: 'Không tìm thấy danh mục' }, 404)
  return c.json({ ok: true })
})

app.get('/api/tasks', async (c) => {
  const userId = requireUser(c)
  const q = c.req.query()
  const where = ['t.user_id=?']
  const values: (string | number)[] = [userId]
  if (q.status) { where.push('t.status=?'); values.push(q.status) }
  if (q.priority) { where.push('t.priority=?'); values.push(q.priority) }
  if (q.category) { where.push('t.category_id=?'); values.push(q.category) }
  if (q.search) { where.push('(t.title LIKE ? OR t.description LIKE ?)'); values.push(`%${q.search}%`, `%${q.search}%`) }
  if (q.preset === 'today') { where.push('t.due_at>=? AND t.due_at<?'); values.push(q.today_start, q.today_end) }
  if (q.preset === 'week') { where.push('t.due_at>=? AND t.due_at<?'); values.push(q.today_start, q.week_end) }
  if (q.preset === 'overdue') { where.push('t.due_at<? AND t.status!=?'); values.push(now(), 'DONE') }
  const sort = q.sort === 'due' ? 't.due_at IS NULL, t.due_at ASC'
    : q.sort === 'priority' ? `CASE t.priority WHEN 'HIGH' THEN 1 WHEN 'MEDIUM' THEN 2 ELSE 3 END`
    : 't.created_at DESC'
  const page = Math.max(1, Number(q.page ?? 1))
  const limit = Math.min(20, Math.max(1, Number(q.limit ?? 10)))
  const offset = (page - 1) * limit
  const countRow = await c.env.DB.prepare(`SELECT COUNT(*) AS count FROM tasks t WHERE ${where.join(' AND ')}`).bind(...values).first<{ count: number }>()
  const { results } = await c.env.DB.prepare(
    `SELECT t.*, c.name AS category_name,c.color AS category_color
     FROM tasks t LEFT JOIN categories c ON c.id=t.category_id
     WHERE ${where.join(' AND ')} ORDER BY ${sort} LIMIT ? OFFSET ?`
  ).bind(...values, limit, offset).all()
  return c.json({ tasks: results, pagination: { page, limit, total: countRow?.count ?? 0 } })
})

app.post('/api/tasks', async (c) => {
  const userId = requireUser(c)
  const body = await c.req.json<any>()
  const title = String(body.title ?? '').trim()
  if (title.length < 1 || title.length > 150) return c.json({ error: 'Tên công việc phải từ 1–150 ký tự' }, 400)
  const description = body.description ? String(body.description).trim().slice(0, 5000) : null
  const status = ['TODO','IN_PROGRESS','DONE'].includes(body.status) ? body.status : 'TODO'
  const priority = ['LOW','MEDIUM','HIGH'].includes(body.priority) ? body.priority : 'MEDIUM'
  const dueAt = body.due_at ? String(body.due_at) : null
  const completedAt = status === 'DONE' ? now() : null
  const id = uuid()
  const stamp = now()
  await c.env.DB.prepare(
    'INSERT INTO tasks (id,user_id,category_id,title,description,status,priority,due_at,completed_at,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)'
  ).bind(id,userId,body.category_id || null,title,description,status,priority,dueAt,completedAt,stamp,stamp).run()
  return c.json({ task: { id, title, description, status, priority, due_at: dueAt, category_id: body.category_id || null } }, 201)
})

app.get('/api/tasks/:id', async (c) => {
  const userId = requireUser(c)
  const task = await c.env.DB.prepare(
    `SELECT t.*,c.name AS category_name,c.color AS category_color FROM tasks t
     LEFT JOIN categories c ON c.id=t.category_id WHERE t.id=? AND t.user_id=?`
  ).bind(c.req.param('id'), userId).first()
  if (!task) return c.json({ error: 'Không tìm thấy công việc' }, 404)
  const { results: subtasks } = await c.env.DB.prepare('SELECT * FROM subtasks WHERE task_id=? ORDER BY created_at').bind(task.id).all()
  return c.json({ task: { ...task, subtasks } })
})

app.patch('/api/tasks/:id', async (c) => {
  const userId = requireUser(c)
  const body = await c.req.json<any>()
  const existing = await c.env.DB.prepare('SELECT * FROM tasks WHERE id=? AND user_id=?').bind(c.req.param('id'), userId).first<any>()
  if (!existing) return c.json({ error: 'Không tìm thấy công việc' }, 404)
  const title = body.title === undefined ? existing.title : String(body.title).trim()
  if (title.length < 1 || title.length > 150) return c.json({ error: 'Tên công việc phải từ 1–150 ký tự' }, 400)
  const status = body.status === undefined ? existing.status : body.status
  if (!['TODO','IN_PROGRESS','DONE'].includes(status)) return c.json({ error: 'Trạng thái không hợp lệ' }, 400)
  const priority = body.priority === undefined ? existing.priority : body.priority
  if (!['LOW','MEDIUM','HIGH'].includes(priority)) return c.json({ error: 'Ưu tiên không hợp lệ' }, 400)
  const stamp = now()
  const completedAt = status === 'DONE' ? (existing.status === 'DONE' ? existing.completed_at : stamp) : null
  await c.env.DB.prepare(
    `UPDATE tasks SET title=?,description=?,status=?,priority=?,due_at=?,category_id=?,completed_at=?,updated_at=? WHERE id=? AND user_id=?`
  ).bind(
    title,
    body.description === undefined ? existing.description : (String(body.description).trim().slice(0,5000) || null),
    status, priority,
    body.due_at === undefined ? existing.due_at : (body.due_at || null),
    body.category_id === undefined ? existing.category_id : (body.category_id || null),
    completedAt, stamp, existing.id, userId
  ).run()
  return c.json({ ok: true })
})

app.delete('/api/tasks/:id', async (c) => {
  const userId = requireUser(c)
  const result = await c.env.DB.prepare('DELETE FROM tasks WHERE id=? AND user_id=?').bind(c.req.param('id'), userId).run()
  if (!result.meta.changes) return c.json({ error: 'Không tìm thấy công việc' }, 404)
  return c.json({ ok: true })
})

app.get('/api/dashboard', async (c) => {
  const userId = requireUser(c)
  const counts = await c.env.DB.prepare(
    `SELECT COUNT(*) total,
      SUM(status='TODO') todo,
      SUM(status='IN_PROGRESS') in_progress,
      SUM(status='DONE') done,
      SUM(status!='DONE' AND due_at IS NOT NULL AND due_at<?) overdue
     FROM tasks WHERE user_id=?`
  ).bind(now(), userId).first<any>()
  const upcoming = await c.env.DB.prepare(
    `SELECT * FROM tasks WHERE user_id=? AND status!='DONE' AND due_at IS NOT NULL
     ORDER BY due_at ASC LIMIT 5`
  ).bind(userId).all()
  const high = await c.env.DB.prepare(
    `SELECT * FROM tasks WHERE user_id=? AND status!='DONE' AND priority='HIGH' ORDER BY due_at ASC LIMIT 5`
  ).bind(userId).all()
  const total = counts?.total ?? 0
  return c.json({
    stats: { total, todo: counts?.todo ?? 0, in_progress: counts?.in_progress ?? 0, done: counts?.done ?? 0, overdue: counts?.overdue ?? 0,
      completion: total ? Math.round((counts.done / total) * 100) : 0 },
    upcoming: upcoming.results,
    high: high.results,
  })
})

app.post('/api/tasks/:id/subtasks', async (c) => {
  const userId = requireUser(c)
  const task = await c.env.DB.prepare('SELECT id FROM tasks WHERE id=? AND user_id=?').bind(c.req.param('id'), userId).first()
  if (!task) return c.json({ error: 'Không tìm thấy công việc' }, 404)
  const body = await c.req.json<any>()
  const title = String(body.title ?? '').trim()
  if (!title || title.length > 150) return c.json({ error: 'Tên công việc con không hợp lệ' }, 400)
  const id = uuid(), stamp = now()
  await c.env.DB.prepare('INSERT INTO subtasks (id,task_id,title,is_done,created_at,updated_at) VALUES (?,?,?,?,?,?)')
    .bind(id,c.req.param('id'),title,0,stamp,stamp).run()
  return c.json({ subtask: { id, title, is_done: 0 } }, 201)
})

app.patch('/api/subtasks/:id', async (c) => {
  const userId = requireUser(c)
  const body = await c.req.json<any>()
  const subtask = await c.env.DB.prepare(
    'SELECT s.* FROM subtasks s JOIN tasks t ON t.id=s.task_id WHERE s.id=? AND t.user_id=?'
  ).bind(c.req.param('id'), userId).first<any>()
  if (!subtask) return c.json({ error: 'Không tìm thấy công việc con' }, 404)
  const title = body.title === undefined ? subtask.title : String(body.title).trim()
  const isDone = body.is_done === undefined ? subtask.is_done : (body.is_done ? 1 : 0)
  await c.env.DB.prepare('UPDATE subtasks SET title=?,is_done=?,updated_at=? WHERE id=?')
    .bind(title, isDone, now(), subtask.id).run()
  return c.json({ ok: true })
})

app.delete('/api/subtasks/:id', async (c) => {
  const userId = requireUser(c)
  const result = await c.env.DB.prepare(
    'DELETE FROM subtasks WHERE id=? AND task_id IN (SELECT id FROM tasks WHERE user_id=?)'
  ).bind(c.req.param('id'), userId).run()
  if (!result.meta.changes) return c.json({ error: 'Không tìm thấy công việc con' }, 404)
  return c.json({ ok: true })
})

app.patch('/api/profile', async (c) => {
  const userId = requireUser(c)
  const body = await c.req.json<any>()
  const name = String(body.name ?? '').trim()
  if (name.length < 2 || name.length > 80) return c.json({ error: 'Tên hiển thị phải từ 2–80 ký tự' }, 400)
  await c.env.DB.prepare('UPDATE users SET name=?,updated_at=? WHERE id=?').bind(name, now(), userId).run()
  return c.json({ ok: true })
})

app.onError((err, c) => {
  if (err instanceof Response) return err
  console.error(err)
  return c.json({ error: 'Đã có lỗi xảy ra trên máy chủ' }, 500)
})

export default app
