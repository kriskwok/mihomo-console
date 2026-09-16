const STATE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE'])

export class ApiError extends Error {
  constructor(message, status, payload) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.payload = payload
  }
}

export async function api(path, options = {}) {
  const method = (options.method || 'GET').toUpperCase()
  const headers = new Headers(options.headers || {})
  if (options.body !== undefined && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json')
  }
  if (STATE_METHODS.has(method)) {
    headers.set('X-Mihomo-Console', '1')
  }

  const response = await fetch(path, {
    ...options,
    method,
    headers,
    credentials: 'same-origin',
    body:
      options.body !== undefined && typeof options.body !== 'string'
        ? JSON.stringify(options.body)
        : options.body,
  })

  const contentType = response.headers.get('content-type') || ''
  const payload = contentType.includes('application/json')
    ? await response.json().catch(() => null)
    : await response.text().catch(() => '')

  if (!response.ok) {
    const message =
      (payload && typeof payload === 'object' && (payload.error || payload.message)) ||
      (typeof payload === 'string' && payload) ||
      `请求失败 (${response.status})`
    throw new ApiError(message, response.status, payload)
  }

  return payload
}

export function qs(params) {
  const search = new URLSearchParams()
  Object.entries(params || {}).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      search.set(key, String(value))
    }
  })
  const text = search.toString()
  return text ? `?${text}` : ''
}
