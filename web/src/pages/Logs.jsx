import { useCallback, useEffect, useRef, useState } from 'react'
import { Pause, Play } from 'lucide-react'
import { api } from '../api.js'
import { Button, Card, EmptyState, Notice } from '../components/ui.jsx'
import { formatTime } from '../utils.js'

const levels = [
  { value: 'all', label: '全部' },
  { value: 'info', label: '信息' },
  { value: 'warning', label: '警告' },
  { value: 'error', label: '错误' },
  { value: 'debug', label: '调试' },
]

function levelTone(level) {
  if (level === 'error') return 'danger'
  if (level === 'warning') return 'warning'
  if (level === 'debug') return 'neutral'
  return 'success'
}

export default function Logs() {
  const [level, setLevel] = useState('all')
  const [logs, setLogs] = useState([])
  const [paused, setPaused] = useState(false)
  const [error, setError] = useState('')
  const listRef = useRef(null)

  const load = useCallback(async () => {
    try {
      const data = await api(`/api/logs?level=${level}`)
      setLogs(Array.isArray(data?.logs) ? data.logs : [])
      setError('')
    } catch (err) {
      setError(err.message || '读取日志失败')
    }
  }, [level])

  useEffect(() => {
    setLogs([])
    load()
    if (paused) return undefined
    const timer = setInterval(load, 2000)
    return () => clearInterval(timer)
  }, [load, paused, level])

  useEffect(() => {
    if (listRef.current) {
      listRef.current.scrollTop = 0
    }
  }, [logs])

  return (
    <div className="page-stack logs-page">
      <div className="page-head">
        <div>
          <h1>日志</h1>
          <p className="sub">实时展示，不保存，只保留最近 200 条</p>
        </div>
        <div className="head-actions">
          <div className="segmented">
            {levels.map((item) => (
              <button key={item.value} type="button" className={level === item.value ? 'active' : ''} onClick={() => setLevel(item.value)}>
                {item.label}
              </button>
            ))}
          </div>
          <Button variant="ghost" onClick={() => setPaused((value) => !value)}>
            {paused ? <Play size={15} /> : <Pause size={15} />}{paused ? '继续' : '暂停'}
          </Button>
        </div>
      </div>

      {error && <Notice tone="danger">{error}</Notice>}

      <Card className="fill-card">
        <div className="log-toolbar">
          <span className="muted">实时刷新 · 最多 200 条</span>
          <span className="muted">{logs.length} 条</span>
        </div>
        {logs.length ? (
          <div className="log-list" ref={listRef}>
            {logs.map((log, index) => (
              <div key={`${log.time}-${index}`} className="log-row">
                <span className="log-time">{formatTime(log.time, false)}</span>
                <span className={`pill pill-${levelTone(log.level)}`}>{log.level}</span>
                <span className="log-msg">{log.message}</span>
              </div>
            ))}
          </div>
        ) : <EmptyState title="暂无日志" description={paused ? '已暂停，继续后恢复。' : '等待内核日志输出。'} />}
      </Card>
    </div>
  )
}
