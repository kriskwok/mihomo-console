import fs from 'node:fs'
import path from 'node:path'
import express from 'express'
import { createProxyMiddleware } from 'http-proxy-middleware'
import { loadConfig, saveConfig } from './config.js'
import {
  cleanupSessions,
  clearLoginFailures,
  clearSessionCookie,
  createSession,
  deleteSession,
  deleteSessionsExcept,
  getSession,
  hashPassword,
  loginRateLimited,
  parseCookies,
  recordLoginFailure,
  sessionCookie,
  verifyPassword,
} from './auth.js'
import { applyConfig, readConfig, restartService, restoreConfig, runHelper, validateConfig } from './helper.js'

const config = loadConfig()
const app = express()
const startedAt = Date.now()

app.disable('x-powered-by')
app.use(express.json({ limit: '2mb' }))
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff')
  res.setHeader('Referrer-Policy', 'same-origin')
  if (req.path.startsWith('/api/')) {
    res.setHeader('Cache-Control', 'no-store')
  }
  next()
})

function requestIp(req) {
  return req.socket?.remoteAddress || req.ip || 'unknown'
}

function sessionFromRequest(req) {
  const cookies = parseCookies(req.headers.cookie || '')
  return { token: cookies.mihomo_console || '', session: getSession(cookies.mihomo_console || '') }
}

function requireCsrf(req, res, next) {
  if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method) && req.get('X-Mihomo-Console') !== '1') {
    return res.status(403).json({ error: '缺少请求标记' })
  }
  next()
}

function requireAuth(req, res, next) {
  const { session } = sessionFromRequest(req)
  if (!session) return res.status(401).json({ error: '未登录或会话已过期' })
  req.user = session
  next()
}

async function fetchJSON(url, timeoutMs = 3500) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const response = await fetch(url, { signal: controller.signal })
    const text = await response.text()
    if (!response.ok) throw new Error(`${response.status} ${text.slice(0, 120)}`)
    return text ? JSON.parse(text) : {}
  } finally {
    clearTimeout(timer)
  }
}

async function mihomoRequest(method, endpoint, body, timeoutMs = 30000) {
  const base = String(config.mihomoUrl).replace(/\/+$/, '')
  const headers = { 'Content-Type': 'application/json' }
  if (config.mihomoSecret) headers.Authorization = `Bearer ${config.mihomoSecret}`
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const response = await fetch(`${base}${endpoint}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: controller.signal,
    })
    const text = await response.text()
    if (!response.ok) throw new Error(`${response.status} ${text.slice(0, 200)}`)
    return text ? JSON.parse(text) : {}
  } finally {
    clearTimeout(timer)
  }
}

async function mihomoJSON(endpoint, timeoutMs = 3500) {
  const base = String(config.mihomoUrl).replace(/\/+$/, '')
  const headers = {}
  if (config.mihomoSecret) headers.Authorization = `Bearer ${config.mihomoSecret}`
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const response = await fetch(`${base}${endpoint}`, { headers, signal: controller.signal })
    const text = await response.text()
    if (!response.ok) throw new Error(`${response.status} ${text.slice(0, 120)}`)
    return text ? JSON.parse(text) : {}
  } finally {
    clearTimeout(timer)
  }
}

app.get('/healthz', (req, res) => res.json({ status: 'ok', uptime: Math.floor((Date.now() - startedAt) / 1000) }))

app.get('/api/auth/session', (req, res) => {
  const { session } = sessionFromRequest(req)
  if (!session) return res.json({ authenticated: false })
  res.json({ authenticated: true, username: session.username })
})

app.post('/api/auth/login', requireCsrf, (req, res) => {
  const ip = requestIp(req)
  if (loginRateLimited(ip)) return res.status(429).json({ error: '尝试次数过多，请 15 分钟后再试' })
  const username = String(req.body?.username || '')
  const password = String(req.body?.password || '')
  if (username !== config.username || !verifyPassword(password, config.passwordHash)) {
    recordLoginFailure(ip)
    return res.status(401).json({ error: '用户名或密码错误' })
  }
  clearLoginFailures(ip)
  const { token, expiresAt } = createSession(username, config.sessionTtlHours)
  res.setHeader('Set-Cookie', sessionCookie(token, expiresAt))
  res.json({ authenticated: true, username })
})

app.post('/api/auth/password', requireCsrf, (req, res) => {
  const { session, token } = sessionFromRequest(req)
  if (!session) return res.status(401).json({ error: '未登录或会话已过期' })
  const currentPassword = String(req.body?.currentPassword ?? '')
  const newPassword = String(req.body?.newPassword ?? '')
  if (!verifyPassword(currentPassword, config.passwordHash)) {
    return res.status(400).json({ error: '当前密码不正确' })
  }
  if (!newPassword) return res.status(400).json({ error: '新密码不能为空' })
  try {
    config.passwordHash = hashPassword(newPassword)
    saveConfig(config)
    deleteSessionsExcept(token)
    res.json({ ok: true })
  } catch (error) {
    res.status(500).json({ error: error.message || '保存密码失败' })
  }
})

app.post('/api/auth/logout', requireCsrf, (req, res) => {
  const { token } = sessionFromRequest(req)
  deleteSession(token)
  res.setHeader('Set-Cookie', clearSessionCookie())
  res.json({ ok: true })
})

app.use('/api', requireAuth)

app.get('/api/app/status', async (req, res) => {
  const checkedAt = Date.now()
  let mihomo = { ok: false, version: '', error: '' }
  let traffic = { ok: false, error: '' }
  let configFile = { path: config.configPath, size: null, mtime: null }

  try {
    const version = await mihomoJSON('/version')
    mihomo = { ok: true, version: version.version || '', error: '', url: config.mihomoUrl, uptime: null }
    try {
      const uptimeResult = await runHelper(config, 'uptime', '', 5000)
      const seconds = Number(String(uptimeResult.stdout || '').trim())
      if (uptimeResult.ok && Number.isFinite(seconds) && seconds >= 0) mihomo.uptime = Math.floor(seconds)
    } catch {
      // 取不到运行时间不影响在线状态
    }
  } catch (error) {
    mihomo.error = error.message
    mihomo.url = config.mihomoUrl
  }

  try {
    const health = await fetchJSON(`${String(config.trafficMonitorUrl).replace(/\/+$/, '')}/health`, 2500)
    traffic = { ok: health.status === 'ok', error: '', url: config.trafficMonitorUrl }
  } catch (error) {
    traffic.error = error.message
    traffic.url = config.trafficMonitorUrl
  }

  try {
    const stat = fs.statSync(config.configPath)
    configFile = { path: config.configPath, size: stat.size, mtime: stat.mtimeMs }
  } catch {
    // helper will provide a more precise error when opening the config page
  }

  res.json({ ok: mihomo.ok, mihomo, traffic, config: configFile, checkedAt, uptime: Math.floor((Date.now() - startedAt) / 1000) })
})

app.get('/api/config', async (req, res) => {
  try {
    const content = await readConfig(config)
    let stat = null
    try { stat = fs.statSync(config.configPath) } catch {}
    res.json({ content, path: config.configPath, size: stat?.size ?? Buffer.byteLength(content), mtime: stat?.mtimeMs ?? null })
  } catch (error) {
    res.status(500).json({ error: error.message || '读取配置失败' })
  }
})

app.post('/api/config/validate', async (req, res) => {
  const content = String(req.body?.content ?? '')
  if (!content.trim()) return res.status(400).json({ error: '配置内容为空' })
  const result = await validateConfig(config, content)
  const output = [result.stdout, result.stderr].filter(Boolean).join('\n').trim()
  if (!result.ok) return res.status(400).json({ error: '配置校验失败', output })
  res.json({ ok: true, output })
})

app.post('/api/config/apply', async (req, res) => {
  const content = String(req.body?.content ?? '')
  if (!content.trim()) return res.status(400).json({ error: '配置内容为空' })
  const result = await applyConfig(config, content)
  const output = [result.stdout, result.stderr].filter(Boolean).join('\n').trim()
  if (!result.ok) return res.status(400).json({ error: '保存配置失败', output })
  const backupLine = result.stdout.split('\n').find((line) => line.startsWith('backup=')) || ''
  const backupPath = backupLine.slice('backup='.length).trim()
  const backupName = backupPath.split('/').pop()
  try {
    await mihomoRequest('PUT', '/configs', { path: config.configPath })
  } catch (reloadError) {
    let restored = false
    if (backupName) {
      const restoreResult = await restoreConfig(config, backupName)
      restored = restoreResult.ok
    }
    return res.status(502).json({
      error: `配置已写入，但内核重载失败${restored ? '，已恢复备份' : ''}：${reloadError.message}`,
    })
  }
  res.json({ ok: true, output, backup: backupPath })
})

app.post('/api/service/restart', async (req, res) => {
  const result = await restartService(config)
  if (!result.ok) {
    const output = [result.stdout, result.stderr].filter(Boolean).join('\n').trim()
    return res.status(500).json({ error: output || '重启服务失败' })
  }
  res.json({ ok: true })
})

app.get('/api/config/backups', (req, res) => {
  try {
    const dir = path.dirname(config.configPath)
    const base = path.basename(config.configPath)
    const items = fs.readdirSync(dir)
      .filter((name) => name.startsWith(`${base}.bak-`))
      .map((name) => {
        const stat = fs.statSync(path.join(dir, name))
        return { name, size: stat.size, mtime: stat.mtimeMs }
      })
      .sort((a, b) => b.mtime - a.mtime)
    res.json(items)
  } catch (error) {
    res.status(500).json({ error: error.message || '读取备份失败' })
  }
})

function parseProxyProviders(yaml) {
  const result = {}
  const lines = String(yaml || '').split('\n')
  let start = -1
  for (let i = 0; i < lines.length; i += 1) {
    if (/^proxy-providers:\s*$/.test(lines[i])) { start = i + 1; break }
  }
  if (start < 0) return result
  let current = null
  for (let i = start; i < lines.length; i += 1) {
    const line = lines[i]
    if (/^\S/.test(line)) break
    if (/^\s*#/.test(line) || !line.trim()) continue
    const nameMatch = line.match(/^  ([^\s#:][^:]*):\s*$/)
    if (nameMatch) {
      current = nameMatch[1].trim()
      result[current] = {}
      continue
    }
    if (current) {
      const fieldMatch = line.match(/^    ([A-Za-z0-9_-]+):\s*(.*)$/)
      if (fieldMatch) result[current][fieldMatch[1]] = fieldMatch[2].trim()
    }
  }
  return result
}

function lastDelay(proxy) {
  const history = proxy?.history
  if (!Array.isArray(history) || !history.length) return null
  const delay = Number(history[history.length - 1]?.delay)
  return Number.isFinite(delay) ? delay : null
}

function maskSubscriptionUrl(url) {
  const text = String(url || '').trim().replace(/^["']|["']$/g, '')
  if (!text) return ''
  try {
    return new URL(text).host
  } catch {
    return text.length > 48 ? `${text.slice(0, 48)}…` : text
  }
}

function parseSubscriptionInfo(info) {
  if (!info || typeof info !== 'object') return null
  const pick = (...keys) => {
    for (const key of keys) {
      const value = info[key]
      if (value !== undefined && value !== null && value !== '') return Number(value) || 0
    }
    return 0
  }
  const upload = pick('Upload', 'upload')
  const download = pick('Download', 'download')
  const total = pick('Total', 'total')
  const expire = pick('Expire', 'expire')
  if (!upload && !download && !total && !expire) return null
  return { upload, download, total, expire: expire > 0 ? expire * 1000 : 0 }
}

app.get('/api/subscriptions', async (req, res) => {
  try {
    const [providersData, yaml] = await Promise.all([
      mihomoJSON('/providers/proxies'),
      readConfig(config).catch(() => ''),
    ])
    const fileProviders = parseProxyProviders(yaml)
    const items = Object.entries(providersData?.providers || {})
      .filter(([, provider]) => provider?.vehicleType === 'HTTP' || provider?.type === 'Proxy')
      .filter(([name]) => fileProviders[name] || providersData.providers[name]?.vehicleType === 'HTTP')
      .map(([name, provider]) => {
        const file = fileProviders[name] || {}
        const providerProxies = Array.isArray(provider?.proxies) ? provider.proxies : []
        const nodes = providerProxies
          .filter((proxy) => proxy && typeof proxy === 'object' && proxy.name && !Array.isArray(proxy.all))
          .map((proxy) => ({ name: proxy.name, type: proxy.type || '', delay: lastDelay(proxy) }))
          .sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'))
        return {
          name,
          nodeCount: nodes.length || providerProxies.length,
          updatedAt: provider?.updatedAt && !String(provider.updatedAt).startsWith('0001') ? provider.updatedAt : null,
          subscription: parseSubscriptionInfo(provider?.subscriptionInfo),
          host: maskSubscriptionUrl(file.url),
          path: String(file.path || '').replace(/^["']|["']$/g, ''),
          interval: Number(String(file.interval || '').replace(/[^0-9]/g, '')) || null,
          nodes,
        }
      })
      .sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'))
    res.json(items)
  } catch (error) {
    res.status(502).json({ error: error.message || '读取订阅失败' })
  }
})

app.post('/api/subscriptions/:name/healthcheck', async (req, res) => {
  const name = String(req.params.name || '')
  if (!name) return res.status(400).json({ error: '缺少订阅名称' })
  try {
    await mihomoRequest('GET', `/providers/proxies/${encodeURIComponent(name)}/healthcheck`, undefined, 120000)
    res.json({ ok: true, name })
  } catch (error) {
    res.status(502).json({ error: error.message || '测速失败' })
  }
})

app.post('/api/subscriptions/:name/update', async (req, res) => {
  const name = String(req.params.name || '')
  if (!name) return res.status(400).json({ error: '缺少订阅名称' })
  try {
    await mihomoRequest('PUT', `/providers/proxies/${encodeURIComponent(name)}`)
    const providersData = await mihomoJSON('/providers/proxies')
    const provider = providersData?.providers?.[name] || {}
    res.json({
      ok: true,
      name,
      nodeCount: Array.isArray(provider?.proxies) ? provider.proxies.length : 0,
      updatedAt: provider?.updatedAt && !String(provider.updatedAt).startsWith('0001') ? provider.updatedAt : null,
    })
  } catch (error) {
    res.status(502).json({ error: error.message || '刷新订阅失败' })
  }
})

let kernelCache = { at: 0, payload: null }
const KERNEL_CACHE_TTL = 10 * 60 * 1000

function compareVersions(a, b) {
  const pa = String(a || '').replace(/^v/i, '').split('.').map((x) => Number(x) || 0)
  const pb = String(b || '').replace(/^v/i, '').split('.').map((x) => Number(x) || 0)
  for (let i = 0; i < Math.max(pa.length, pb.length); i += 1) {
    const diff = (pa[i] || 0) - (pb[i] || 0)
    if (diff !== 0) return diff
  }
  return 0
}

app.get('/api/kernel', async (req, res) => {
  if (Date.now() - kernelCache.at < KERNEL_CACHE_TTL && kernelCache.payload) {
    return res.json(kernelCache.payload)
  }
  const payload = { current: '', latest: '', hasUpdate: false, checkedAt: Date.now(), error: '' }
  try {
    const version = await mihomoJSON('/version')
    payload.current = version?.version || ''
  } catch (error) {
    payload.error = `内核离线: ${error.message}`
    return res.json(payload)
  }
  try {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 8000)
    const response = await fetch('https://api.github.com/repos/MetaCubeX/mihomo/releases/latest', {
      headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'mihomo-console' },
      signal: controller.signal,
    })
    clearTimeout(timer)
    if (!response.ok) throw new Error(`GitHub 返回 ${response.status}`)
    const release = await response.json()
    payload.latest = release?.tag_name || ''
    payload.publishedAt = release?.published_at || ''
    payload.hasUpdate = Boolean(payload.latest && compareVersions(payload.latest, payload.current) > 0)
  } catch (error) {
    payload.error = `检查更新失败: ${error.message}`
  }
  kernelCache = { at: Date.now(), payload }
  res.json(payload)
})

function parseProxyGroupNames(yaml) {
  const names = []
  const lines = String(yaml || '').split('\n')
  let start = -1
  for (let i = 0; i < lines.length; i += 1) {
    if (/^proxy-groups:\s*$/.test(lines[i])) { start = i + 1; break }
  }
  if (start < 0) return names
  for (let i = start; i < lines.length; i += 1) {
    const line = lines[i]
    if (/^\S/.test(line)) break
    const match = line.match(/^\s*-\s*name:\s*(.+)$/)
    if (match) names.push(match[1].trim().replace(/^["']|["']$/g, ''))
  }
  return names
}

app.get('/api/config/groups', async (req, res) => {
  try {
    const [yaml, providersData] = await Promise.all([
      readConfig(config),
      mihomoJSON('/providers/proxies').catch(() => null),
    ])
    const types = {}
    const delays = {}
    const nodeProviders = {}
    Object.entries(providersData?.providers || {}).forEach(([providerName, provider]) => {
      ;(provider?.proxies || []).forEach((proxy) => {
        if (proxy && typeof proxy === 'object' && proxy.name && !Array.isArray(proxy.all)) {
          if (proxy.type) types[proxy.name] = proxy.type
          const delay = lastDelay(proxy)
          if (delay !== null && delays[proxy.name] === undefined) delays[proxy.name] = delay
          if (nodeProviders[proxy.name] === undefined) nodeProviders[proxy.name] = providerName
        }
      })
    })
    res.json({ groups: parseProxyGroupNames(yaml), types, delays, nodeProviders })
  } catch (error) {
    res.status(500).json({ error: error.message || '读取策略组顺序失败' })
  }
})

const LOG_LEVELS = ['all', 'info', 'warning', 'error', 'debug']
const LOG_MAX = 200
const logStreams = {}

function mihomoLogLevel(level) {
  // 内核只认小写，大写会被拒绝导致无数据
  if (level === 'all') return 'debug'
  return level
}

function mihomoWsUrl(path) {
  const base = String(config.mihomoUrl).replace(/\/+$/, '')
  return base.replace(/^http/, 'ws') + path
}

function ensureLogStream(level) {
  if (!LOG_LEVELS.includes(level)) level = 'info'
  let stream = logStreams[level]
  if (!stream) {
    stream = logStreams[level] = { logs: [], socket: null, retryTimer: null }
  }
  if (stream.socket || stream.retryTimer) return stream
  const connect = () => {
    stream.socket = null
    stream.retryTimer = null
    try {
      const headers = {}
      if (config.mihomoSecret) headers.Authorization = `Bearer ${config.mihomoSecret}`
      const socket = new WebSocket(mihomoWsUrl(`/logs?level=${mihomoLogLevel(level)}`), { headers })
      stream.socket = socket
      socket.onmessage = (event) => {
        try {
          const data = JSON.parse(String(event.data || '{}'))
          stream.logs.push({
            time: data.Time || data.time || new Date().toISOString(),
            level: String(data.type || data.LogLevel || data.level || level).toLowerCase(),
            message: String(data.payload ?? data.Payload ?? ''),
          })
          if (stream.logs.length > LOG_MAX) stream.logs.splice(0, stream.logs.length - LOG_MAX)
        } catch {
          // 忽略无法解析的帧
        }
      }
      const reconnect = () => {
        try { socket.close() } catch {}
        stream.socket = null
        if (!stream.retryTimer) stream.retryTimer = setTimeout(connect, 5000)
      }
      socket.onerror = reconnect
      socket.onclose = () => {
        stream.socket = null
        if (!stream.retryTimer) stream.retryTimer = setTimeout(connect, 5000)
      }
    } catch {
      if (!stream.retryTimer) stream.retryTimer = setTimeout(connect, 5000)
    }
  }
  connect()
  return stream
}

const LOG_SEVERITY = { debug: 0, info: 1, warning: 2, error: 3 }

app.get('/api/logs', (req, res) => {
  const level = LOG_LEVELS.includes(req.query.level) ? req.query.level : 'all'
  ;['debug', 'info', 'warning', 'error'].forEach(ensureLogStream)
  const merged = []
  ;['debug', 'info', 'warning', 'error'].forEach((name) => {
    ensureLogStream(name).logs.forEach((log) => merged.push(log))
  })
  merged.sort((a, b) => (a.time < b.time ? 1 : a.time > b.time ? -1 : 0))
  const seen = new Set()
  const deduped = merged.filter((log) => {
    const key = `${log.time}|${log.level}|${log.message}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
  const logs = level === 'all'
    ? deduped.filter((log) => log.level !== 'debug').slice(0, LOG_MAX)
    : deduped.filter((log) => log.level === level).slice(0, LOG_MAX)
  res.json({ level, logs })
})

const mihomoProxy = createProxyMiddleware({
  target: config.mihomoUrl,
  changeOrigin: false,
  ws: false,
  timeout: 20000,
  proxyTimeout: 20000,
  on: {
    proxyReq: (proxyReq, req) => {
      if (config.mihomoSecret) proxyReq.setHeader('Authorization', `Bearer ${config.mihomoSecret}`)
      // express.json() 已消费请求流，写操作需把解析后的 body 重新写入，否则内核会一直等 body 而超时
      const body = req.body
      if (body && typeof body === 'object' && !Buffer.isBuffer(body)) {
        const data = JSON.stringify(body)
        proxyReq.setHeader('Content-Type', 'application/json')
        proxyReq.setHeader('Content-Length', Buffer.byteLength(data))
        proxyReq.write(data)
      }
    },
    error: (error, req, res) => {
      if (res && !res.headersSent && typeof res.writeHead === 'function') {
        res.writeHead(502, { 'Content-Type': 'application/json; charset=utf-8' })
        res.end(JSON.stringify({ error: `Mihomo 代理请求失败: ${error.message}` }))
      }
    },
  },
})

const monitorProxy = createProxyMiddleware({
  target: config.trafficMonitorUrl,
  changeOrigin: false,
  secure: false,
  timeout: 20000,
  proxyTimeout: 20000,
  pathRewrite: { '^/': '/api/traffic/' },
  on: {
    error: (error, req, res) => {
      if (res && !res.headersSent && typeof res.writeHead === 'function') {
        res.writeHead(502, { 'Content-Type': 'application/json; charset=utf-8' })
        res.end(JSON.stringify({ error: `统计服务请求失败: ${error.message}` }))
      }
    },
  },
})

app.use('/api/mihomo', mihomoProxy)
app.use('/api/monitor', monitorProxy)

app.use(
  express.static(config.webDist, {
    index: false,
    maxAge: '1h',
    setHeaders: (res, filePath) => {
      // 入口 HTML 不缓存，避免重新部署后引用到已被清理的旧构建产物
      if (filePath.endsWith('.html')) res.setHeader('Cache-Control', 'no-cache')
    },
  }),
)
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api/')) return next()
  res.setHeader('Cache-Control', 'no-cache')
  res.sendFile(path.join(config.webDist, 'index.html'))
})

app.use((error, req, res, next) => {
  if (res.headersSent) return next(error)
  res.status(500).json({ error: error.message || '服务器内部错误' })
})

setInterval(cleanupSessions, 30 * 60000).unref()

app.listen(config.port, config.listen, () => {
  console.log(`[mihomo-console] listening on http://${config.listen}:${config.port}`)
  console.log(`[mihomo-console] mihomo=${config.mihomoUrl} monitor=${config.trafficMonitorUrl} config=${config.configPath}`)
})
