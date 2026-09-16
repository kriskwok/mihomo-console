import { useCallback, useEffect, useMemo, useState } from 'react'
import { RefreshCw, Search, Zap } from 'lucide-react'
import { api } from '../api.js'
import { Button, Card, EmptyState, LoadingBlock, Notice, Pill } from '../components/ui.jsx'

const HIDDEN_GROUPS = new Set(['GLOBAL'])

function isGroup(proxy) {
  return Array.isArray(proxy?.all) && proxy.all.length > 0
}

function typeLabel(type) {
  const map = {
    Selector: '手动选择',
    URLTest: '自动测速',
    Fallback: '故障转移',
    LoadBalance: '负载均衡',
    Relay: '链式代理',
  }
  return map[type] || type || '策略组'
}

function prettyType(type) {
  if (type === 'Direct') return '直连'
  if (type === 'Reject') return '拒绝'
  return type || ''
}

function toneOf(delay) {
  if (delay === undefined || delay === null || delay === 0 || delay === -2) return 'none'
  if (delay < 0) return 'bad'
  if (delay < 300) return 'good'
  if (delay < 800) return 'warn'
  return 'bad'
}

function delayTextOf(delay) {
  if (delay === undefined || delay === null || delay === 0) return '--'
  if (delay === -2) return '不可测'
  if (delay < 0) return '超时'
  return `${delay} ms`
}

const DELAY_URL = encodeURIComponent('http://www.gstatic.com/generate_204')
const DELAY_TIMEOUT = 10000

export default function Proxies() {
  const [proxies, setProxies] = useState({})
  const [nodeTypes, setNodeTypes] = useState({})
  const [nodeProvider, setNodeProvider] = useState({})
  const [order, setOrder] = useState([])
  const [expanded, setExpanded] = useState({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [query, setQuery] = useState('')
  const [testing, setTesting] = useState('')
  const [latency, setLatency] = useState({})
  const [switching, setSwitching] = useState('')

  const load = useCallback(async () => {
    setError('')
    try {
      const [proxiesData, orderData] = await Promise.all([
        api('/api/mihomo/proxies'),
        api('/api/config/groups').catch(() => ({ groups: [] })),
      ])
      const all = proxiesData?.proxies || {}
      setProxies(all)
      const types = { ...(orderData?.types || {}) }
      Object.entries(all).forEach(([proxyName, proxy]) => {
        if (!proxy) return
        if (Array.isArray(proxy.all)) types[proxyName] = typeLabel(proxy.type)
        else if (proxy.type) types[proxyName] = prettyType(proxy.type)
      })
      Object.keys(types).forEach((key) => {
        if (types[key] === 'Direct') types[key] = '直连'
        if (types[key] === 'Reject') types[key] = '拒绝'
      })
      setNodeTypes(types)
      setNodeProvider(orderData?.nodeProviders || {})
      setOrder(Array.isArray(orderData?.groups) ? orderData.groups : [])
      const seed = orderData?.delays || {}
      setLatency((current) => ({ ...seed, ...current }))
    } catch (err) {
      setError(err.message || '读取代理失败')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
    const timer = setInterval(load, 8000)
    return () => clearInterval(timer)
  }, [load])

  const groups = useMemo(() => {
    const normalized = query.trim().toLowerCase()
    const rank = new Map(order.map((name, index) => [name, index]))
    return Object.entries(proxies)
      .filter(([, proxy]) => isGroup(proxy))
      .filter(([name]) => !HIDDEN_GROUPS.has(name))
      .filter(([name, proxy]) => {
        if (!normalized) return true
        return name.toLowerCase().includes(normalized) || proxy.all.some((item) => item.toLowerCase().includes(normalized))
      })
      .sort(([a], [b]) => {
        const ra = rank.has(a) ? rank.get(a) : Number.MAX_SAFE_INTEGER
        const rb = rank.has(b) ? rank.get(b) : Number.MAX_SAFE_INTEGER
        return ra - rb || a.localeCompare(b, 'zh-CN')
      })
  }, [proxies, order, query])

  const toggle = (name) => setExpanded((current) => ({ ...current, [name]: !current[name] }))

  const selectProxy = async (groupName, nodeName) => {
    setSwitching(`${groupName}:${nodeName}`)
    setError('')
    try {
      await api(`/api/mihomo/proxies/${encodeURIComponent(groupName)}`, {
        method: 'PUT',
        body: { name: nodeName },
      })
      await load()
    } catch (err) {
      setError(err.message || '切换节点失败')
    } finally {
      setSwitching('')
    }
  }

  const testSingleNode = async (node) => {
    const provider = nodeProvider[node]
    const path = provider
      ? `/api/mihomo/providers/proxies/${encodeURIComponent(provider)}/${encodeURIComponent(node)}/healthcheck`
      : `/api/mihomo/proxies/${encodeURIComponent(node)}/delay`
    try {
      const result = await api(`${path}?timeout=${DELAY_TIMEOUT}&url=${DELAY_URL}`)
      return Number(result?.delay ?? 0)
    } catch {
      if (!provider) {
        const data = await api(`/api/mihomo/group/${encodeURIComponent(node)}/delay?timeout=${DELAY_TIMEOUT}&url=${DELAY_URL}`).catch(() => null)
        const entries = Object.entries(data || {})
        if (entries.length) {
          const merged = {}
          entries.forEach(([name, delay]) => { merged[name] = Number(delay) })
          setLatency((current) => ({ ...current, ...merged }))
          if (merged[node] !== undefined) return merged[node]
        }
      }
      return 0
    }
  }

  const testNode = async (event, node) => {
    event.stopPropagation()
    setLatency((current) => ({ ...current, [node]: -3 }))
    setError('')
    try {
      const delay = await testSingleNode(node)
      setLatency((current) => ({ ...current, [node]: delay }))
    } catch {
      setLatency((current) => ({ ...current, [node]: 0 }))
    }
  }

  const testGroup = async (event, groupName, group) => {
    event?.stopPropagation()
    if (!expanded[groupName]) setExpanded((current) => ({ ...current, [groupName]: true }))
    setTesting(groupName)
    setError('')
    const results = {}
    try {
      if (['URLTest', 'Fallback', 'LoadBalance'].includes(group?.type)) {
        const data = await api(`/api/mihomo/group/${encodeURIComponent(groupName)}/delay?timeout=${DELAY_TIMEOUT}&url=${DELAY_URL}`)
        Object.entries(data || {}).forEach(([node, delay]) => {
          results[node] = Number(delay)
        })
      } else {
        const candidates = (group?.all || []).slice(0, 40)
        await Promise.all(
          candidates.map(async (node) => {
            results[node] = await testSingleNode(node)
          }),
        )
      }
    } catch (err) {
      setError(err.message || '延迟测试失败')
    }
    setLatency((current) => ({ ...current, ...results }))
    setTesting('')
  }

  return (
    <div className="page-stack">
      <div className="page-head">
        <h1>代理</h1>
        <div className="head-actions">
          <div className="search-box">
            <Search size={16} />
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索策略组或节点" />
          </div>
          <Button variant="ghost" onClick={load}><RefreshCw size={15} />刷新</Button>
        </div>
      </div>

      {error && <Notice tone="danger">{error}</Notice>}
      {loading && <LoadingBlock label="正在读取代理" />}

      {!loading && !groups.length && (
        <Card><EmptyState title="没有策略组" description="确认 Mihomo 已启动，且配置里包含策略组。" /></Card>
      )}

      <section className="proxy-list">
        {groups.map(([name, group]) => {
          const open = Boolean(expanded[name])
          const selectable = group.type === 'Selector'
          const resolveDelay = (target, seen = new Set()) => {
            if (!target || seen.has(target)) return undefined
            if (latency[target] !== undefined) return latency[target]
            const targetGroup = proxies[target]
            if (targetGroup && Array.isArray(targetGroup.all) && targetGroup.now) {
              seen.add(target)
              return resolveDelay(targetGroup.now, seen)
            }
            return undefined
          }
          const nowDelay = group.now ? resolveDelay(group.now) : undefined
          const nowTone = !group.now || nowDelay === undefined || nowDelay === null || nowDelay === 0 || nowDelay === -2
            ? 'neutral'
            : nowDelay < 0 ? 'danger' : nowDelay < 300 ? 'success' : nowDelay < 800 ? 'warning' : 'danger'
          const nowText = !group.now
            ? '未选择'
            : nowDelay === undefined || nowDelay === null ? '--' : nowDelay === -2 ? '不可测' : nowDelay < 0 ? '超时' : `${nowDelay} ms`
          return (
            <Card key={name} className="proxy-group-card">
              <button type="button" className="proxy-group-head-btn" onClick={() => toggle(name)}>
                <div className="proxy-group-titles">
                  <div className="proxy-group-name">{name}<span className="group-count">{group.all.length} 个节点</span></div>
                  <div className="proxy-group-sub">{typeLabel(group.type)} &gt; {group.now || '未选择'}</div>
                </div>
                <Pill tone={nowTone}>{nowText}</Pill>
                <span onClick={(event) => event.stopPropagation()}>
                  <Button size="sm" variant="ghost" loading={testing === name} title="延迟测试" onClick={(event) => testGroup(event, name, group)}>
                    <Zap size={14} />
                  </Button>
                </span>
              </button>
              {open && (
                <div className="proxy-node-list">
                  {group.all.map((node) => {
                    const active = node === group.now
                    const delay = latency[node] === -3 ? -3 : (resolveDelay(node) ?? latency[node])
                    const busy = switching === `${name}:${node}`
                    const nodeType = nodeTypes[node]
                    const delayText = delayTextOf(delay === -3 ? undefined : delay)
                    const delayTone = delay === -3 ? 'none' : toneOf(delay)
                    const NodeTag = selectable ? 'button' : 'div'
                    return (
                      <NodeTag
                        key={node}
                        type={selectable ? 'button' : undefined}
                        className={`proxy-node${active ? ' active' : ''}${selectable ? '' : ' locked'}`}
                        onClick={selectable && !active ? () => selectProxy(name, node) : undefined}
                        disabled={selectable ? busy : undefined}
                        title={selectable ? undefined : '自动测速组由内核自动选择，不可手动切换'}
                      >
                        <span className="node-name">{node}</span>
                        <span className="node-meta">
                          {busy ? '切换中…' : (<>
                            {nodeType && <span className="node-type">{nodeType}</span>}
                            <span className="node-lat" onClick={(event) => testNode(event, node)} title="点击测速">
                              {delay === -3 ? '测速中…' : (<>
                                {delayText && <span className={`latency ${delayTone}`}>{delayText}</span>}
                                <span className={`lat-dot ${delayTone}`} />
                              </>)}
                            </span>
                          </>)}
                        </span>
                      </NodeTag>
                    )
                  })}
                </div>
              )}
            </Card>
          )
        })}
      </section>
    </div>
  )
}
