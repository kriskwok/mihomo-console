import { useCallback, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { ArrowDown, ArrowUp, Hash, RefreshCw, Sigma } from 'lucide-react'
import { api, qs } from '../api.js'
import TrafficChart from '../components/TrafficChart.jsx'
import { Button, Card, EmptyState, LoadingBlock, Notice, SectionHeader } from '../components/ui.jsx'
import { formatBytes, shortHost } from '../utils.js'

const dimensions = [
  { value: 'sourceIP', label: '设备' },
  { value: 'host', label: '目标主机' },
  { value: 'outbound', label: '出口节点' },
  { value: 'rule', label: '规则分组' },
]

const ranges = [
  { value: 'today', label: '今天' },
  { value: '1', label: '1 天' },
  { value: '3', label: '3 天' },
  { value: '7', label: '7 天' },
  { value: '15', label: '15 天' },
  { value: '30', label: '30 天' },
]

const SUMMARY_RANGE = '120'
const SUMMARY_RANGE_LABEL = '全部'
const MAX_ROWS = 50
const validDimensions = ['sourceIP', 'host', 'outbound', 'rule']

function rangeToTimes(range) {
  const end = Date.now()
  if (range === 'today') {
    const start = new Date()
    start.setHours(0, 0, 0, 0)
    return { start: start.getTime(), end }
  }
  return { start: end - Number(range || 1) * 86400000, end }
}

function pickBucket(start, end) {
  const duration = end - start
  if (duration <= 86400000) return 3600000
  if (duration <= 3 * 86400000) return 3 * 3600000
  if (duration <= 7 * 86400000) return 6 * 3600000
  return 24 * 3600000
}

export default function TrafficStats() {
  const [searchParams] = useSearchParams()
  const [dimension, setDimension] = useState(() => {
    const initial = searchParams.get('dimension')
    return validDimensions.includes(initial) ? initial : 'host'
  })
  const [range, setRange] = useState('7')
  const [mode, setMode] = useState('detail')
  const [prevRange, setPrevRange] = useState('7')
  const [primaryRows, setPrimaryRows] = useState([])
  const [trend, setTrend] = useState([])
  const [selectedPrimary, setSelectedPrimary] = useState('')
  const [secondaryRows, setSecondaryRows] = useState([])
  const [selectedSecondary, setSelectedSecondary] = useState('')
  const [details, setDetails] = useState([])
  const [loading, setLoading] = useState(true)
  const [drillLoading, setDrillLoading] = useState(false)
  const [error, setError] = useState('')

  const switchMode = (next) => {
    if (next === mode) return
    if (next === 'summary') {
      setPrevRange(range === SUMMARY_RANGE ? '7' : range)
      setRange(SUMMARY_RANGE)
    } else {
      setRange(prevRange)
    }
    setMode(next)
  }

  const params = useCallback(() => {
    const { start, end } = rangeToTimes(range)
    return { start, end, summary: mode === 'summary' ? '1' : '' }
  }, [range, mode])

  const loadPrimary = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const { start, end } = rangeToTimes(range)
      const base = { start, end, summary: mode === 'summary' ? '1' : '' }
      const [aggregate, trendData] = await Promise.all([
        api(`/api/monitor/aggregate${qs({ ...base, dimension })}`),
        api(`/api/monitor/trend${qs({ ...base, bucket: pickBucket(start, end) })}`),
      ])
      const rows = Array.isArray(aggregate) ? aggregate : []
      setPrimaryRows(rows)
      setTrend(Array.isArray(trendData) ? trendData : [])
      setSelectedPrimary(rows[0]?.label || '')
      setSecondaryRows([])
      setSelectedSecondary('')
      setDetails([])
    } catch (err) {
      setError(err.message || '读取流量统计失败')
    } finally {
      setLoading(false)
    }
  }, [dimension, range, mode])

  const loadSecondary = useCallback(
    async (primary) => {
      if (!primary) return
      setDrillLoading(true)
      setSelectedSecondary('')
      setDetails([])
      try {
        const { start, end, summary } = params()
        const rows = await api(`/api/monitor/substats${qs({ dimension, label: primary, start, end, summary })}`)
        const normalized = Array.isArray(rows) ? rows : []
        setSecondaryRows(normalized)
        setSelectedSecondary(normalized[0]?.label || '')
        if (normalized[0]?.label && mode !== 'summary') {
          const detailsData = await api(`/api/monitor/details${qs({ dimension, primary, secondary: normalized[0].label, start, end })}`)
          setDetails(Array.isArray(detailsData) ? detailsData : [])
        }
      } catch (err) {
        setError(err.message || '读取下钻数据失败')
      } finally {
        setDrillLoading(false)
      }
    },
    [dimension, mode, params],
  )

  const loadDetails = useCallback(
    async (primary, secondary) => {
      if (!primary || !secondary || mode === 'summary') {
        setDetails([])
        return
      }
      try {
        const { start, end } = params()
        const data = await api(`/api/monitor/details${qs({ dimension, primary, secondary, start, end })}`)
        setDetails(Array.isArray(data) ? data : [])
      } catch (err) {
        setError(err.message || '读取连接明细失败')
      }
    },
    [dimension, mode, params],
  )

  useEffect(() => {
    const fromUrl = searchParams.get('dimension')
    if (validDimensions.includes(fromUrl) && fromUrl !== dimension) setDimension(fromUrl)
  }, [searchParams, dimension])

  useEffect(() => { loadPrimary() }, [loadPrimary])
  useEffect(() => { if (selectedPrimary) loadSecondary(selectedPrimary) }, [selectedPrimary, loadSecondary])

  const totals = useMemo(() => {
    let upload = 0
    let download = 0
    primaryRows.forEach((row) => {
      upload += Number(row.upload || 0)
      download += Number(row.download || 0)
    })
    return { upload, download, total: upload + download, count: primaryRows.length }
  }, [primaryRows])

  const visiblePrimary = useMemo(() => primaryRows.slice(0, MAX_ROWS), [primaryRows])
  const visibleSecondary = useMemo(() => secondaryRows.slice(0, MAX_ROWS), [secondaryRows])
  const visibleDetails = useMemo(() => details.slice(0, MAX_ROWS), [details])
  const selectedLabel = dimensions.find((item) => item.value === dimension)?.label || '维度'

  return (
    <div className="page-stack">
      <div className="page-head">
        <h1>流量</h1>
        <div className="head-actions">
          <div className="segmented">
            {dimensions.map((item) => (
              <button key={item.value} type="button" className={dimension === item.value ? 'active' : ''} onClick={() => setDimension(item.value)}>
                {item.label}
              </button>
            ))}
          </div>
          <Button variant="ghost" onClick={loadPrimary}><RefreshCw size={15} />刷新</Button>
        </div>
      </div>

      {error && <Notice tone="danger">{error}</Notice>}

      <section className="traffic-top">
        <Card>
          <div className="traffic-toolbar">
            <strong>流量走势</strong>
            <div className="segmented small">
              <button type="button" className={mode === 'detail' ? 'active' : ''} onClick={() => switchMode('detail')}>明细</button>
              <button type="button" className={mode === 'summary' ? 'active' : ''} onClick={() => switchMode('summary')}>汇总</button>
            </div>
            <div className="range-tabs">
              {mode === 'summary' ? (
                <button key={SUMMARY_RANGE} type="button" className="active">{SUMMARY_RANGE_LABEL}</button>
              ) : ranges.map((item) => (
                <button key={item.value} type="button" className={range === item.value ? 'active' : ''} onClick={() => setRange(item.value)}>{item.label}</button>
              ))}
            </div>
          </div>
          {loading ? <LoadingBlock label="正在读取统计数据" /> : <TrafficChart data={trend} height={220} />}
        </Card>
        <div className="stat-tiles">
          <Card className="stat-tile">
            <div className="tile-top"><span>{selectedLabel}</span><span className="tile-icon tone-violet"><Hash size={15} /></span></div>
            <div className="tile-value">{totals.count}</div>
          </Card>
          <Card className="stat-tile">
            <div className="tile-top"><span>总流量</span><span className="tile-icon tone-red"><Sigma size={15} /></span></div>
            <div className="tile-value">{formatBytes(totals.total)}</div>
          </Card>
          <Card className="stat-tile">
            <div className="tile-top"><span>上传</span><span className="tile-icon tone-blue"><ArrowUp size={15} /></span></div>
            <div className="tile-value">{formatBytes(totals.upload)}</div>
          </Card>
          <Card className="stat-tile">
            <div className="tile-top"><span>下载</span><span className="tile-icon tone-green"><ArrowDown size={15} /></span></div>
            <div className="tile-value">{formatBytes(totals.download)}</div>
          </Card>
        </div>
      </section>

      <section className="traffic-grid">
        <Card>
          <SectionHeader title={`${selectedLabel}排行`} />
          {visiblePrimary.length ? (
            <div className="rank-entries">
              {visiblePrimary.map((row, index) => (
                <button
                  key={row.label}
                  type="button"
                  className={`rank-entry${selectedPrimary === row.label ? ' active' : ''}`}
                  onClick={() => setSelectedPrimary(row.label)}
                >
                  <span className="rank-num">{index + 1}</span>
                  <span className="rank-body">
                    <span className="rank-name">{shortHost(row.label)}</span>
                    <span className="rank-sub">↑ {formatBytes(row.upload)} ↓ {formatBytes(row.download)}</span>
                  </span>
                  <strong className="rank-value">{formatBytes(row.total)}</strong>
                </button>
              ))}
              {primaryRows.length > MAX_ROWS && (
                <div className="list-limit-note">仅显示前 {MAX_ROWS} 条，共 {primaryRows.length} 条</div>
              )}
            </div>
          ) : <EmptyState title="暂无统计数据" />}
        </Card>

        <Card>
          <SectionHeader
            title={selectedPrimary ? `${selectedPrimary} 命中的目标` : '下钻'}
          />
          {drillLoading ? <LoadingBlock label="正在下钻" /> : visibleSecondary.length ? (
            <div className="table-wrap">
              <table className="data-table">
                <thead><tr><th>#</th><th>目标</th><th>上传</th></tr></thead>
                <tbody>
                  {visibleSecondary.map((row, index) => (
                    <tr
                      key={row.label}
                      className={selectedSecondary === row.label ? 'row-active' : ''}
                      onClick={() => {
                        setSelectedSecondary(row.label)
                        loadDetails(selectedPrimary, row.label)
                      }}
                    >
                      <td><span className="rank-num sm">{index + 1}</span></td>
                      <td><span className="table-primary">{shortHost(row.label)}</span></td>
                      <td>{formatBytes(row.upload)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {secondaryRows.length > MAX_ROWS && (
                <div className="list-limit-note">仅显示前 {MAX_ROWS} 条</div>
              )}
            </div>
          ) : <EmptyState title="暂无下钻数据" description="请选择左侧的一个分组。" />}
        </Card>

        <Card>
          <SectionHeader
            title={selectedPrimary && selectedSecondary ? `${selectedPrimary} / ${selectedSecondary} 的连接明细` : '连接明细'}
          />
          {mode === 'summary' ? (
            <EmptyState title="汇总模式不展示明细" description="切换为“明细”查看连接明细。" />
          ) : visibleDetails.length ? (
            <div className="detail-cards">
              {visibleDetails.map((item, index) => (
                <div className="detail-card" key={`${item.sourceIP}-${item.destinationIP}-${index}`}>
                  <div className="dc-head">
                    <span className="dc-ip">{item.destinationIP || item.outbound || '--'}</span>
                    <strong className="dc-total">{formatBytes(item.total)}</strong>
                  </div>
                  <div className="dc-sub">{item.sourceIP || '--'} → {item.outbound || 'DIRECT'}</div>
                  <div className="dc-sub">↑ {formatBytes(item.upload)} ↓ {formatBytes(item.download)}</div>
                  {(item.chains?.length > 0) && (
                    <div className="chips">
                      {item.chains.map((node) => <span key={node} className="chip">{node}</span>)}
                    </div>
                  )}
                </div>
              ))}
            </div>
          ) : <EmptyState title="暂无连接明细" description="选择中间分组后显示。" />}
        </Card>
      </section>
    </div>
  )
}
