import { useCallback, useEffect, useMemo, useState } from 'react'
import CodeMirror from '@uiw/react-codemirror'
import { yaml } from '@codemirror/lang-yaml'
import { oneDark } from '@codemirror/theme-one-dark'
import { AlertTriangle, CheckCircle2, FileCode2, History, RefreshCw, Save, ShieldCheck } from 'lucide-react'
import { api } from '../api.js'
import { Button, Card, LoadingBlock, Modal, Notice, Pill, SectionHeader } from '../components/ui.jsx'
import { formatBytes, formatTime } from '../utils.js'

export default function ConfigEditor() {
  const [content, setContent] = useState('')
  const [draft, setDraft] = useState('')
  const [meta, setMeta] = useState(null)
  const [backups, setBackups] = useState([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState('')
  const [output, setOutput] = useState('')
  const [message, setMessage] = useState(null)
  const [confirmOpen, setConfirmOpen] = useState(false)

  const dirty = content !== draft

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [configData, backupData] = await Promise.all([
        api('/api/config'),
        api('/api/config/backups'),
      ])
      setContent(configData.content || '')
      setDraft(configData.content || '')
      setMeta(configData)
      setBackups(Array.isArray(backupData) ? backupData : [])
      setMessage(null)
    } catch (err) {
      setMessage({ tone: 'danger', text: err.message || '读取配置失败' })
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const validate = async () => {
    setBusy('validate')
    setOutput('')
    setMessage(null)
    try {
      const result = await api('/api/config/validate', { method: 'POST', body: { content: draft } })
      setOutput(result.output || '配置校验通过')
      setMessage({ tone: 'success', text: '配置语法和引用校验通过。' })
    } catch (err) {
      setOutput(err.payload?.output || '')
      setMessage({ tone: 'danger', text: err.message || '配置校验失败' })
    } finally {
      setBusy('')
    }
  }

  const apply = async () => {
    setConfirmOpen(false)
    setBusy('apply')
    setOutput('')
    setMessage(null)
    try {
      const result = await api('/api/config/apply', { method: 'POST', body: { content: draft } })
      setOutput(result.output || '配置已应用')
      setContent(draft)
      await load()
      setMessage({ tone: 'success', text: `配置已保存并重载${result.backup ? `，备份：${result.backup.split('/').pop()}` : ''}` })
    } catch (err) {
      setOutput(err.payload?.output || '')
      setMessage({ tone: 'danger', text: err.message || '配置应用失败' })
    } finally {
      setBusy('')
    }
  }

  const lineCount = useMemo(() => draft.split('\n').length, [draft])

  return (
    <div className="page-stack">
      <div className="page-head">
        <div>
          <h1>配置</h1>
          <p className="sub"><span className="mono">/data/clash/config.yaml</span> · 保存前校验并备份</p>
        </div>
        <div className="head-actions">
          <Button variant="ghost" onClick={load}><RefreshCw size={15} />重新读取</Button>
          <Button variant="ghost" onClick={validate} loading={busy === 'validate'}><ShieldCheck size={15} />校验配置</Button>
          <Button variant="primary" onClick={() => setConfirmOpen(true)} disabled={!dirty}><Save size={15} />保存并重载</Button>
        </div>
      </div>

      {message && <Notice tone={message.tone}>{message.text}</Notice>}

      <section className="config-layout">
        <Card className="config-editor-card">
          <div className="config-editor-head">
            <div>
              <h2>config.yaml</h2>
            </div>
            <div className="config-status">
              <Pill tone={dirty ? 'warning' : 'success'}>{dirty ? '有未保存修改' : '已同步'}</Pill>
              <span>{lineCount} 行</span>
              {meta?.size != null && <span>{formatBytes(meta.size)}</span>}
            </div>
          </div>
          {loading ? <LoadingBlock label="正在读取配置文件" /> : (
            <div className="editor-frame">
              <CodeMirror
                value={draft}
                height="640px"
                theme={oneDark}
                extensions={[yaml()]}
                onChange={(value) => setDraft(value)}
                basicSetup={{
                  lineNumbers: true,
                  foldGutter: true,
                  highlightActiveLine: true,
                  bracketMatching: true,
                  autocompletion: false,
                }}
              />
            </div>
          )}
        </Card>

        <div className="config-side">
          <Card>
            <SectionHeader title="文件状态" />
            <div className="info-list">
              <div><span>路径</span><strong className="mono">/data/clash/config.yaml</strong></div>
              <div><span>大小</span><strong>{meta?.size != null ? formatBytes(meta.size) : '--'}</strong></div>
              <div><span>修改时间</span><strong>{meta?.mtime ? formatTime(meta.mtime) : '--'}</strong></div>
              <div><span>状态</span><strong>{dirty ? '待保存' : '已同步'}</strong></div>
            </div>
          </Card>

          <Card>
            <SectionHeader title="最近备份"  />
            {backups.length ? (
              <div className="backup-list">
                {backups.slice(0, 8).map((item) => (
                  <div className="backup-row" key={item.name}>
                    <History size={14} />
                    <span className="backup-name">{item.name}</span>
                    <span>{formatTime(item.mtime)}</span>
                  </div>
                ))}
              </div>
            ) : <div className="muted">暂无备份记录</div>}
          </Card>

          <Card>
            <SectionHeader title="校验输出" />
            <pre className="console-output">{output || '尚未执行校验。'}</pre>
          </Card>
        </div>
      </section>

      <Modal
        open={confirmOpen}
        title="保存并重载配置？"
        onClose={() => setConfirmOpen(false)}
        actions={[
          <Button key="cancel" variant="ghost" onClick={() => setConfirmOpen(false)}>取消</Button>,
          <Button key="apply" variant="primary" onClick={apply}><CheckCircle2 size={15} />确认应用</Button>,
        ]}
      >
        <div className="confirm-content">
          <AlertTriangle size={22} />
          <div>
            <strong>此操作会覆盖当前配置并通知内核重载</strong>
            <p>服务器先校验，成功后创建备份、写入配置并重载，不重启服务，现有连接不受影响 <span className="mono">clash.service</span>。</p>
          </div>
        </div>
      </Modal>
    </div>
  )
}
