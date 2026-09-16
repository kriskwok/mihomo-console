import { useEffect, useMemo, useState } from 'react'
import { RefreshCw, Search } from 'lucide-react'
import { api } from '../api.js'
import { Button, Card, EmptyState, LoadingBlock, Notice, SectionHeader } from '../components/ui.jsx'
import { formatNumber } from '../utils.js'

function typeTone(type) {
  const t = String(type || '').toUpperCase()
  if (t.startsWith('DOMAIN')) return 'blue'
  if (t.startsWith('IP') || t.startsWith('GEOIP')) return 'green'
  if (t === 'RULE-SET' || t.startsWith('GEOSITE')) return 'violet'
  if (t.startsWith('PROCESS')) return 'cyan'
  if (t.includes('PORT')) return 'orange'
  if (t === 'MATCH' || t === 'FINAL') return 'amber'
  return 'neutral'
}

export default function Rules() {
  const [rules, setRules] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [query, setQuery] = useState('')

  const load = async () => {
    setLoading(true)
    try {
      const data = await api('/api/mihomo/rules')
      setRules(Array.isArray(data?.rules) ? data.rules : [])
      setError('')
    } catch (err) {
      setError(err.message || '读取规则失败')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase()
    if (!normalized) return rules
    return rules.filter((rule) =>
      [rule.type, rule.payload, rule.proxy].some((value) => String(value || '').toLowerCase().includes(normalized)),
    )
  }, [rules, query])

  return (
    <div className="page-stack">
      <div className="page-head">
        <div>
          <h1>规则</h1>
          <p className="sub">当前生效规则（只读，改规则去「配置」页）</p>
        </div>
        <div className="head-actions">
          <div className="search-box"><Search size={16} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索规则、域名或策略组" /></div>
          <Button variant="ghost" onClick={load}><RefreshCw size={15} />刷新</Button>
        </div>
      </div>

      {error && <Notice tone="danger">{error}</Notice>}
      {loading && <LoadingBlock label="正在读取规则" />}

      <Card>
        <SectionHeader title={`共 ${filtered.length} 条`} />
        {filtered.length ? (
          <div className="table-wrap">
            <table className="data-table rules-table">
              <thead><tr><th>匹配内容</th><th>类型</th><th>策略组</th><th>命中</th></tr></thead>
              <tbody>
                {filtered.map((rule, index) => (
                  <tr key={`${rule.type}-${rule.payload}-${index}`}>
                    <td><span className="mono">{rule.payload || '--'}</span></td>
                    <td><span className={`pill pill-${typeTone(rule.type)}`}>{rule.type || 'RULE'}</span></td>
                    <td><span className="table-primary">{rule.proxy || '--'}</span></td>
                    <td>{rule.extra?.hitCount === undefined || rule.extra?.hitCount === null ? '--' : formatNumber(rule.extra.hitCount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <EmptyState title="没有匹配的规则" />}
      </Card>
    </div>
  )
}
