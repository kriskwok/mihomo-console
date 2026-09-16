export function formatBytes(value, digits = 1) {
  const n = Number(value || 0)
  if (!Number.isFinite(n) || n <= 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB', 'TB', 'PB']
  const index = Math.min(Math.floor(Math.log(n) / Math.log(1024)), units.length - 1)
  const amount = n / 1024 ** index
  return `${amount.toFixed(index === 0 ? 0 : digits)} ${units[index]}`
}

export function formatRate(value) {
  return `${formatBytes(value)}/s`
}

export function formatNumber(value) {
  return new Intl.NumberFormat('zh-CN').format(Number(value || 0))
}

export function formatTime(value, withDate = true) {
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return '--'
  const options = withDate
    ? { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }
    : { hour: '2-digit', minute: '2-digit', second: '2-digit' }
  return new Intl.DateTimeFormat('zh-CN', options).format(date)
}

export function formatDuration(seconds) {
  const total = Math.max(0, Math.floor(Number(seconds || 0)))
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  if (h) return `${h}h ${m}m`
  if (m) return `${m}m ${s}s`
  return `${s}s`
}

export function shortHost(value) {
  const text = String(value || '')
  if (!text) return '--'
  if (text.length <= 42) return text
  return `${text.slice(0, 39)}...`
}

export function classNames(...values) {
  return values.filter(Boolean).join(' ')
}

export function parseDateRange(range, custom = {}) {
  const now = Date.now()
  if (range === 'today') {
    const start = new Date()
    start.setHours(0, 0, 0, 0)
    return { start: start.getTime(), end: now }
  }
  if (range === 'custom') {
    return {
      start: custom.start ? new Date(custom.start).getTime() : now - 86400000,
      end: custom.end ? new Date(custom.end).getTime() : now,
    }
  }
  const days = Number(range || 1)
  return { start: now - days * 86400000, end: now }
}
