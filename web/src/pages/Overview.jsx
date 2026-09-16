import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { Globe2, MoreHorizontal, RefreshCw } from 'lucide-react'
import { api, qs } from '../api.js'
import TrafficChart from '../components/TrafficChart.jsx'
import { Button, Card, EmptyState, Notice, SectionHeader } from '../components/ui.jsx'
import { formatBytes, formatRate, formatTime, shortHost } from '../utils.js'

const modes = [
  { value: 'rule', label: '规则' },
  { value: 'global', label: '全局' },
  { value: 'direct', label: '直连' },
]

const ipProviders = [
  { value: 'ipwho', label: 'ipwho.is', url: 'https://ipwho.is/' },
  { value: 'ipsb', label: 'ip.sb', url: 'https://api.ip.sb/geoip' },
]

const latencySites = [
  { name: 'Google', url: 'https://www.google.com/generate_204' },
  { name: 'Cloudflare', url: 'https://www.cloudflare.com/cdn-cgi/trace' },
  { name: 'GitHub', url: 'https://github.com/' },
  { name: '微信', url: 'https://weixin.qq.com/' },
  { name: '淘宝', url: 'https://www.taobao.com/' },
  { name: '抖音', url: 'https://www.douyin.com/' },
]

function normalizeIpInfo(provider, data) {
  if (provider === 'ipsb') {
    return {
      ip: data?.ip || '--',
      country: data?.country || '--',
      city: data?.city || '--',
      org: data?.organization || '--',
      asn: data?.asn ? `AS${data.asn}` : '--',
      isp: data?.isp || '--',
    }
  }
  const connection = data?.connection || {}
  return {
    ip: data?.ip || '--',
    country: data?.country || '--',
    city: data?.city || '--',
    org: connection.org || '--',
    asn: connection.asn ? `AS${connection.asn}` : '--',
    isp: connection.isp || '--',
  }
}

async function pingSite(url) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 8000)
  const bust = `${url}${url.includes('?') ? '&' : '?'}_=${Date.now()}`
  const start = performance.now()
  try {
    await fetch(bust, { mode: 'no-cors', cache: 'no-store', signal: controller.signal })
    return Math.round(performance.now() - start)
  } catch {
    return -1
  } finally {
    clearTimeout(timer)
  }
}

function latencyTone(ms) {
  if (ms < 0) return 'bad'
  if (ms < 250) return 'good'
  if (ms < 800) return 'warn'
  return 'bad'
}

export default function Overview() {
  const [version, setVersion] = useState('')
  const [mode, setMode] = useState('rule')
  const [switching, setSwitching] = useState(false)
  const [connections, setConnections] = useState({ connections: [], uploadTotal: 0, downloadTotal: 0 })
  const [trend, setTrend] = useState([])
  const [liveRate, setLiveRate] = useState({ up: 0, down: 0 })
  const [ranks, setRanks] = useState({ sourceIP: [], host: [], outbound: [] })
  const [ipProvider, setIpProvider] = useState('ipwho')
  const [ipInfo, setIpInfo] = useState(null)
  const [ipLoading, setIpLoading] = useState(false)
  const [latency, setLatency] = useState({})
  const [latencyLoading, setLatencyLoading] = useState(false)
  const [error, setError] = useState('')
  const lastTotals = useRef(null)
  const lastTick = useRef(null)

  const loadBase = useCallback(async () => {
    try {
      const end = Date.now()
      const start = end - 24 * 3600000
      const [versionData, configData, trendData, devicesData, hostsData, outboundsData] = await Promise.all([
        api('/api/mihomo/version'),
        api('/api/mihomo/configs'),
        api(`/api/monitor/trend${qs({ start, end, bucket: 3600000 })}`).catch(() => []),
        api(`/api/monitor/aggregate${qs({ start, end, dimension: 'sourceIP' })}`).catch(() => []),
        api(`/api/monitor/aggregate${qs({ start, end, dimension: 'host' })}`).catch(() => []),
        api(`/api/monitor/aggregate${qs({ start, end, dimension: 'outbound' })}`).catch(() => []),
      ])
      setVersion(versionData?.version || '')
      setMode(configData?.mode || 'rule')
      setTrend(Array.isArray(trendData) ? trendData : [])
      setRanks({
        sourceIP: (Array.isArray(devicesData) ? devicesData : []).slice(0, 3),
        host: (Array.isArray(hostsData) ? hostsData : []).slice(0, 3),
        outbound: (Array.isArray(outboundsData) ? outboundsData : []).slice(0, 3),
      })
      setError('')
    } catch (err) {
      setError(err.message || '无法连接 Mihomo')
    }
  }, [])

  const pollConnections = useCallback(async () => {
    try {
      const data = await api('/api/mihomo/connections')
      const now = Date.now()
      const totalUpload = Number(data.uploadTotal || 0)
      const totalDownload = Number(data.downloadTotal || 0)
      if (lastTotals.current && lastTick.current) {
        const seconds = Math.max(0.5, (now - lastTick.current) / 1000)
        setLiveRate({
          up: Math.max(0, (totalUpload - lastTotals.current.upload) / seconds),
          down: Math.max(0, (totalDownload - lastTotals.current.download) / seconds),
        })
      }
      lastTotals.current = { upload: totalUpload, download: totalDownload }
      lastTick.current = now
      setConnections(data)
    } catch {
      // 轮询失败不刷屏，靠 loadBase 的错误提示
    }
  }, [])

  const loadIpInfo = useCallback(async (provider) => {
    setIpLoading(true)
    try {
      const target = ipProviders.find((item) => item.value === provider) || ipProviders[0]
      const response = await fetch(target.url, { cache: 'no-store' })
      if (!response.ok) throw new Error(`查询失败 (${response.status})`)
      const data = await response.json()
      if (provider === 'ipwho' && data?.success === false) throw new Error('查询失败')
      setIpInfo(normalizeIpInfo(provider, data))
    } catch {
      setIpInfo(null)
    } finally {
      setIpLoading(false)
    }
  }, [])

  const testLatency = useCallback(async () => {
    setLatencyLoading(true)
    const results = {}
    await Promise.all(
      latencySites.map(async (site) => {
        results[site.name] = await pingSite(site.url)
      }),
    )
    setLatency(results)
    setLatencyLoading(false)
  }, [])

  useEffect(() => {
    loadBase()
    pollConnections()
    loadIpInfo(ipProvider)
    testLatency()
    const timer = setInterval(pollConnections, 2000)
    return () => clearInterval(timer)
  }, [loadBase, pollConnections, loadIpInfo, testLatency, ipProvider])

  const switchMode = async (next) => {
    if (next === mode || switching) return
    setSwitching(true)
    try {
      await api('/api/mihomo/configs', { method: 'PATCH', body: { mode: next } })
      setMode(next)
    } catch (err) {
      setError(err.message || '切换模式失败')
    } finally {
      setSwitching(false)
    }
  }

  const active = connections.connections || []
  const recent = active.slice(0, 8)
  const online = !error
  const latencies = latencySites.map((site) => ({ ...site, ms: latency[site.name] }))
  const okLatencies = latencies.filter((item) => item.ms >= 0).map((item) => item.ms)
  const avgLatency = okLatencies.length ? Math.round(okLatencies.reduce((a, b) => a + b, 0) / okLatencies.length) : -1
  const maxLatency = Math.max(1, ...okLatencies)

  const rankCards = [
    { title: '终端设备', rows: ranks.sourceIP, dimension: 'sourceIP' },
    { title: '域名访问', rows: ranks.host, dimension: 'host' },
    { title: '出口节点', rows: ranks.outbound, dimension: 'outbound' },
  ]

  return (
    <div className="page-stack">
      <div className="page-head">
        <h1>概览</h1>
        <div className="head-actions">
          <div className="segmented">
            {modes.map((item) => (
              <button
                key={item.value}
                type="button"
                className={mode === item.value ? 'active' : ''}
                disabled={switching}
                onClick={() => switchMode(item.value)}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {error && <Notice tone="danger">{error}</Notice>}

      <section className="stat-grid">
        <Card className="stat-card">
          <div className="k">状态</div>
          <div className="v" style={{ color: online ? 'var(--green)' : 'var(--red)', fontSize: 17 }}>
            {online ? '在线' : '离线'}
          </div>
          <div className="s">{version || '--'}</div>
        </Card>
        <Card className="stat-card">
          <div className="k">实时下行</div>
          <div className="v">{formatRate(liveRate.down)}</div>
        </Card>
        <Card className="stat-card">
          <div className="k">实时上行</div>
          <div className="v">{formatRate(liveRate.up)}</div>
        </Card>
        <Card className="stat-card">
          <div className="k">活动连接</div>
          <div className="v">{active.length}</div>
          <div className="s">累计 {formatBytes(Number(connections.uploadTotal || 0) + Number(connections.downloadTotal || 0))}</div>
        </Card>
      </section>

      <Card>
        <SectionHeader title="24 小时流量" />
        <TrafficChart data={trend} height={220} />
        <div className="overview-ranks">
          {rankCards.map((card) => (
            <div key={card.title} className="rank-block">
              <div className="rank-block-head">
                <strong>{card.title}</strong>
                <Link className="icon-button" to={`/traffic?dimension=${card.dimension}`} title="查看全部">
                  <MoreHorizontal size={18} />
                </Link>
              </div>
              {card.rows.length ? (
                <div className="rank-entries">
                  {card.rows.map((row, index) => (
                    <div key={row.label} className="rank-entry static">
                      <span className="rank-num">{index + 1}</span>
                      <span className="rank-body">
                        <span className="rank-name">{shortHost(row.label)}</span>
                      </span>
                      <strong className="rank-value">{formatBytes(row.total)}</strong>
                    </div>
                  ))}
                </div>
              ) : <EmptyState title="暂无数据" />}
            </div>
          ))}
        </div>
      </Card>

      <section className="overview-bottom">
        <Card>
          <SectionHeader
            title="当前 IP"
            actions={(
              <>
                <select
                  className="mini-select"
                  value={ipProvider}
                  onChange={(event) => setIpProvider(event.target.value)}
                >
                  {ipProviders.map((item) => (
                    <option key={item.value} value={item.value}>{item.label}</option>
                  ))}
                </select>
                <button className="icon-button" type="button" onClick={() => loadIpInfo(ipProvider)} title="刷新">
                  <RefreshCw size={15} className={ipLoading ? 'spin' : ''} />
                </button>
              </>
            )}
          />
          {ipInfo ? (
            <div className="row-list">
              <div><span>IP 地址</span><strong className="mono" style={{ color: 'var(--accent)' }}>{ipInfo.ip}</strong></div>
              <div><span>国家</span><strong>{ipInfo.country}</strong></div>
              <div><span>城市</span><strong>{ipInfo.city}</strong></div>
              <div><span>组织</span><strong>{ipInfo.org}</strong></div>
              <div><span>ASN</span><strong>{ipInfo.asn}</strong></div>
            </div>
          ) : (
            <EmptyState
              title={ipLoading ? '查询中…' : '未获取到 IP 信息'}
              icon={Globe2}
              action={<Button size="sm" variant="ghost" onClick={() => loadIpInfo(ipProvider)}>重试</Button>}
            />
          )}
        </Card>

        <Card>
          <SectionHeader
            title="网络延迟"
            actions={(
              <>
                {avgLatency >= 0 && <span className="pill pill-danger">平均: {avgLatency}ms</span>}
                <button className="icon-button" type="button" onClick={testLatency} title="重新测试">
                  <RefreshCw size={15} className={latencyLoading ? 'spin' : ''} />
                </button>
              </>
            )}
          />
          <div className="lat-list">
            {latencies.map((site) => (
              <div key={site.name} className="lat-row">
                <span className="lat-name">{site.name}</span>
                <div className="lat-bar">
                  {site.ms !== undefined && site.ms >= 0 && (
                    <span className={`lat-fill ${latencyTone(site.ms)}`} style={{ width: `${Math.max(3, (site.ms / maxLatency) * 100)}%` }} />
                  )}
                </div>
                <span className="lat-ms">{site.ms === undefined ? '测试中' : site.ms < 0 ? '超时' : `${site.ms}ms`}</span>
              </div>
            ))}
          </div>
        </Card>
      </section>

      <Card>
        <SectionHeader
          title="最近连接"
          actions={<Link className="icon-button" to="/connections" title="查看全部"><MoreHorizontal size={18} /></Link>}
        />
        {recent.length ? (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr><th>目标</th><th>出口</th><th>规则</th><th>流量</th><th>开始</th></tr>
              </thead>
              <tbody>
                {recent.map((connection) => (
                  <tr key={connection.id}>
                    <td><span className="table-primary">{shortHost(connection.metadata?.host || connection.metadata?.destinationIP)}</span></td>
                    <td>{connection.chains?.[0] || 'DIRECT'}</td>
                    <td>{connection.rule || '--'}</td>
                    <td>{formatBytes(Number(connection.upload || 0) + Number(connection.download || 0))}</td>
                    <td>{formatTime(connection.start)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState title="暂无活动连接" />
        )}
      </Card>
    </div>
  )
}
