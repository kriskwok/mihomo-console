import { useCallback, useEffect, useMemo, useState } from 'react'
import { RefreshCw, Search, Trash2, PhoneOff, X, AlertTriangle } from 'lucide-react'
import { api } from '../api.js'
import { Button, Card, EmptyState, Modal, Notice, SectionHeader } from '../components/ui.jsx'
import { formatBytes, formatDuration, formatTime, shortHost } from '../utils.js'

export default function Connections() {
  const [data, setData] = useState({ connections: [], uploadTotal: 0, downloadTotal: 0 })
  const [query, setQuery] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState('')
  const [confirmKillAll, setConfirmKillAll] = useState(false)
  const [killing, setKilling] = useState(false)
  const [lastUpdated, setLastUpdated] = useState(null)

  const load = useCallback(async () => {
    try {
      const payload = await api('/api/mihomo/connections')
      setData(payload)
      setLastUpdated(Date.now())
      setError('')
    } catch (err) {
      setError(err.message || '读取连接失败')
    }
  }, [])

  useEffect(() => {
    load()
    const timer = setInterval(load, 2000)
    return () => clearInterval(timer)
  }, [load])

  const connections = useMemo(() => {
    const normalized = query.trim().toLowerCase()
    const rows = [...(data.connections || [])].sort(
      (a, b) => new Date(b.start).getTime() - new Date(a.start).getTime(),
    )
    if (!normalized) return rows
    return rows.filter((connection) => {
      const fields = [
        connection.metadata?.sniffHost,
        connection.metadata?.remoteDestination,
        connection.metadata?.host,
        connection.metadata?.destinationIP,
        connection.metadata?.destinationPort,
        connection.metadata?.sourceIP,
        connection.metadata?.sourcePort,
        connection.rule,
        ...(connection.chains || []),
      ]
      return fields.some((value) => String(value || '').toLowerCase().includes(normalized))
    })
  }, [data.connections, query])

  const killAll = async () => {
    setKilling(true)
    try {
      await api('/api/mihomo/connections', { method: 'DELETE' })
      await load()
    } catch (err) {
      setError(err.message || '断开全部连接失败')
    } finally {
      setKilling(false)
      setConfirmKillAll(false)
    }
  }

  const closeConnection = async (id) => {
    setBusy(id)
    try {
      await api(`/api/mihomo/connections/${encodeURIComponent(id)}`, { method: 'DELETE' })
      await load()
    } catch (err) {
      setError(err.message || '关闭连接失败')
    } finally {
      setBusy('')
    }
  }

  return (
    <div className="page-stack">
      <div className="page-head">
        <div>
          <h1>连接</h1>
          <p className="sub">每 2 秒刷新，可搜索、可关闭</p>
        </div>
        <div className="head-actions">
          <div className="search-box">
            <Search size={16} />
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索连接" />
          </div>
          <Button variant="ghost" onClick={() => setConfirmKillAll(true)}><PhoneOff size={15} />断开全部</Button>
          <Button variant="ghost" onClick={load}><RefreshCw size={15} />刷新</Button>
        </div>
      </div>

      {error && <Notice tone="danger">{error}</Notice>}

      <section className="stat-grid">
        <Card className="stat-card"><div className="k">活动连接</div><div className="v">{connections.length}</div></Card>
        <Card className="stat-card"><div className="k">上传总量</div><div className="v">{formatBytes(data.uploadTotal)}</div></Card>
        <Card className="stat-card"><div className="k">下载总量</div><div className="v">{formatBytes(data.downloadTotal)}</div></Card>
        <Card className="stat-card"><div className="k">最后刷新</div><div className="v" style={{ fontSize: 17 }}>{lastUpdated ? formatTime(lastUpdated, false) : '--'}</div></Card>
      </section>

      <Card>
        <SectionHeader
          title="活动连接"
          description={query ? `已过滤 ${connections.length} 条` : undefined}
        />
        {connections.length ? (
          <div className="table-wrap">
            <table className="data-table connections-table">
              <thead>
                <tr>
                  <th>目标主机</th>
                  <th>流向</th>
                  <th>网络</th>
                  <th>上传</th>
                  <th>下载</th>
                  <th>持续</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {connections.map((connection) => {
                  const start = connection.start ? new Date(connection.start).getTime() : Date.now()
                  return (
                    <tr key={connection.id}>
                      <td>
                        <span className="table-primary">{shortHost(connection.metadata?.sniffHost || connection.metadata?.host || connection.metadata?.destinationIP)}</span>
                        <span className="table-sub">{connection.metadata?.destinationIP || '--'}</span>
                        <span className="table-sub">{connection.rule || '--'}</span>
                      </td>
                      <td>
                        <span className="table-primary">{connection.metadata?.sourceIP || '--'}{connection.metadata?.sourcePort ? `:${connection.metadata.sourcePort}` : ''}</span>
                        <span className="table-sub">→ {connection.metadata?.remoteDestination || connection.metadata?.destinationIP || '--'}{connection.metadata?.destinationPort ? `:${connection.metadata.destinationPort}` : ''}</span>
                        <span className="table-sub">{connection.chains?.[0] || 'DIRECT'}</span>
                      </td>
                      <td>{connection.metadata?.network || 'tcp'}</td>
                      <td>{formatBytes(connection.upload)}</td>
                      <td>{formatBytes(connection.download)}</td>
                      <td>{formatDuration((Date.now() - start) / 1000)}</td>
                      <td>
                        <button className="icon-button danger" type="button" disabled={busy === connection.id} onClick={() => closeConnection(connection.id)} title="关闭连接">
                          <Trash2 size={15} />
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        ) : <EmptyState title="没有活动连接" description="列表为空，或搜索没有匹配结果。" />}
      </Card>

      <Modal
        open={confirmKillAll}
        title="断开全部连接？"
        onClose={() => setConfirmKillAll(false)}
        actions={[
          <Button key="cancel" variant="ghost" onClick={() => setConfirmKillAll(false)}>取消</Button>,
          <Button key="kill" variant="primary" loading={killing} onClick={killAll}><PhoneOff size={15} />确认断开</Button>,
        ]}
      >
        <div className="confirm-content">
          <AlertTriangle size={22} />
          <div>
            <strong>所有活动连接将立即断开</strong>
            <p>包括正在下载、视频、通话等，客户端会自动重连。</p>
          </div>
        </div>
      </Modal>
    </div>
  )
}
