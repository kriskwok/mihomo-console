import { useCallback, useEffect, useState } from 'react'
import { Gauge, RefreshCw } from 'lucide-react'
import { api } from '../api.js'
import { Button, Card, EmptyState, LoadingBlock, Notice, Pill } from '../components/ui.jsx'
import { formatBytes, formatTime } from '../utils.js'

function formatInterval(seconds) {
  if (!seconds) return '--'
  const hours = Math.round(seconds / 3600)
  if (hours < 24) return `每${hours}小时`
  const days = Math.round(hours / 24)
  return days <= 1 ? '每天' : `每${days}天`
}

function formatDate(value) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '--'
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${date.getFullYear()}-${m}-${d}`
}

function isNoData(delay) {
  return delay === null || delay === undefined || delay === 0
}

function delayTone(delay) {
  if (isNoData(delay)) return 'none'
  if (delay < 0) return 'bad'
  if (delay < 300) return 'good'
  if (delay < 800) return 'warn'
  return 'bad'
}

function delayText(delay) {
  if (isNoData(delay)) return '--'
  return `${delay} ms`
}

function prettyType(type) {
  if (type === 'Direct') return '直连'
  if (type === 'Reject') return '拒绝'
  return type || ''
}

export default function Subscriptions() {
  const [items, setItems] = useState([])
  const [collapsed, setCollapsed] = useState({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [updating, setUpdating] = useState('')
  const [testing, setTesting] = useState('')

  const load = useCallback(async () => {
    setError('')
    try {
      const data = await api('/api/subscriptions')
      setItems(Array.isArray(data) ? data : [])
    } catch (err) {
      setError(err.message || '读取订阅失败')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const toggle = (name) => setCollapsed((current) => ({ ...current, [name]: !current[name] }))

  const updateOne = async (event, name) => {
    event.stopPropagation()
    setUpdating(name)
    setError('')
    try {
      await api(`/api/subscriptions/${encodeURIComponent(name)}/update`, { method: 'POST' })
      await load()
    } catch (err) {
      setError(err.message || '刷新订阅失败')
    } finally {
      setUpdating('')
    }
  }

  const testOne = async (event, name) => {
    event.stopPropagation()
    setTesting(name)
    setError('')
    try {
      await api(`/api/subscriptions/${encodeURIComponent(name)}/healthcheck`, { method: 'POST' })
      await load()
    } catch (err) {
      setError(err.message || '测速失败')
    } finally {
      setTesting('')
    }
  }

  return (
    <div className="page-stack">
      <div className="page-head">
        <h1>订阅</h1>
      </div>

      {error && <Notice tone="danger">{error}</Notice>}
      {loading && <LoadingBlock label="正在读取订阅" />}

      {!loading && !items.length && <Card><EmptyState title="没有订阅" description="配置里没有 proxy-providers。" /></Card>}

      <section className="sub-grid">
        {items.map((item) => {
          const sub = item.subscription
          const used = sub ? sub.upload + sub.download : 0
          const percent = sub && sub.total ? Math.min(100, (used / sub.total) * 100) : 0
          const open = !collapsed[item.name]
          return (
            <Card key={item.name} className="sub-card">
              <button type="button" className="sub-head" onClick={() => toggle(item.name)}>
                <strong className="sub-name">{item.name}</strong>
                <Pill>{item.nodeCount}</Pill>
                <Pill>HTTP</Pill>
                <span className="sub-actions" onClick={(event) => event.stopPropagation()}>
                  <Button size="sm" variant="ghost" loading={updating === item.name} title="刷新订阅" onClick={(event) => updateOne(event, item.name)}>
                    <RefreshCw size={14} />
                  </Button>
                  <Button size="sm" variant="ghost" loading={testing === item.name} title="测速" onClick={(event) => testOne(event, item.name)}>
                    <Gauge size={14} />
                  </Button>
                </span>
              </button>

              <div className="sub-bar-row">
                <div className="sub-bar"><span style={{ width: `${percent}%` }} /></div>
                <span className="pct-badge">{percent.toFixed(1)}%</span>
              </div>

              <div className="sub-usage">
                <span>{sub && sub.total ? `${formatBytes(used)} / ${formatBytes(sub.total)}` : '--'}</span>
                <span>到期时间: {sub?.expire ? formatDate(sub.expire) : '--'}</span>
              </div>

              <div className="sub-meta">
                <span className="mono">{item.host || '--'}</span>
                <span>{formatInterval(item.interval)}更新 · {item.updatedAt ? formatTime(item.updatedAt) : '未更新'}</span>
              </div>

              {open && (
                <div className="sub-nodes">
                  {(item.nodes || []).map((node) => (
                    <div key={node.name} className="proxy-node static">
                      <span className="node-name">{node.name}</span>
                      <span className="node-meta">
                        {prettyType(node.type) && <span className="node-type">{prettyType(node.type)}</span>}
                        <span className="node-lat">
                          <span className={`latency ${delayTone(node.delay)}`}>{delayText(node.delay)}</span>
                          <span className={`lat-dot ${delayTone(node.delay)}`} />
                        </span>
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          )
        })}
      </section>

    </div>
  )
}
