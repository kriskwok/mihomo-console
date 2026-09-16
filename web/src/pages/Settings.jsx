import { useEffect, useState } from 'react'
import { AlertTriangle, KeyRound, LogOut, RefreshCw, RotateCcw } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { api } from '../api.js'
import { useAuth } from '../App.jsx'
import { Button, Card, Field, Modal, Notice, Pill, SectionHeader } from '../components/ui.jsx'
import { formatTime } from '../utils.js'

export default function Settings() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const [status, setStatus] = useState(null)
  const [kernel, setKernel] = useState(null)
  const [checking, setChecking] = useState(false)
  const [passOpen, setPassOpen] = useState(false)
  const [currentPass, setCurrentPass] = useState('')
  const [newPass, setNewPass] = useState('')
  const [confirmPass, setConfirmPass] = useState('')
  const [passError, setPassError] = useState('')
  const [changing, setChanging] = useState(false)
  const [restartOpen, setRestartOpen] = useState(false)
  const [restarting, setRestarting] = useState(false)
  const [restartMsg, setRestartMsg] = useState(null)
  const [passMsg, setPassMsg] = useState(null)

  useEffect(() => {
    api('/api/app/status').then(setStatus).catch(() => setStatus({ ok: false }))
    api('/api/kernel').then(setKernel).catch(() => setKernel(null))
  }, [])

  const checkKernel = async () => {
    setChecking(true)
    try {
      setKernel(await api('/api/kernel'))
    } catch {
      setKernel(null)
    } finally {
      setChecking(false)
    }
  }

  const doRestart = async () => {
    setRestarting(true)
    setRestartMsg(null)
    try {
      await api('/api/service/restart', { method: 'POST' })
      setRestartMsg({ tone: 'success', text: '重启指令已发送，服务约几秒后恢复' })
    } catch (err) {
      setRestartMsg({ tone: 'danger', text: err.message || '重启失败' })
    } finally {
      setRestarting(false)
      setRestartOpen(false)
    }
  }

  const openPassModal = () => {
    setCurrentPass('')
    setNewPass('')
    setConfirmPass('')
    setPassError('')
    setPassMsg(null)
    setPassOpen(true)
  }

  const doChangePassword = async () => {
    if (!currentPass) {
      setPassError('请输入当前密码')
      return
    }
    if (!newPass) {
      setPassError('新密码不能为空')
      return
    }
    if (newPass !== confirmPass) {
      setPassError('两次输入的新密码不一致')
      return
    }
    setChanging(true)
    setPassError('')
    try {
      await api('/api/auth/password', { method: 'POST', body: { currentPassword: currentPass, newPassword: newPass } })
      setPassOpen(false)
      setPassMsg({ tone: 'success', text: '密码已修改，其他设备的登录已失效' })
    } catch (err) {
      setPassError(err.message || '修改失败')
    } finally {
      setChanging(false)
    }
  }

  const doLogout = async () => {
    await logout()
    navigate('/login', { replace: true })
  }

  return (
    <div className="page-stack">
      <div className="page-head">
        <h1>设置</h1>
        <div className="head-actions">
          <Button variant="ghost" onClick={doLogout}><LogOut size={15} />退出登录</Button>
        </div>
      </div>

      <section className="split-grid">
        <Card>
          <SectionHeader title="账号" />
          <div className="row-list">
            <div><span>用户名</span><strong>{user?.username || 'admin'}</strong></div>
            <div><span>密码</span><Button size="sm" variant="ghost" onClick={openPassModal}><KeyRound size={13} />修改密码</Button></div>
          </div>
          {passMsg && <div style={{ marginTop: 10 }}><Notice tone={passMsg.tone}>{passMsg.text}</Notice></div>}
        </Card>

        <Card>
          <SectionHeader
            title="内核"
            actions={<><Button size="sm" variant="ghost" loading={checking} onClick={checkKernel}><RefreshCw size={13} />检查更新</Button><Button size="sm" variant="ghost" onClick={() => { setRestartMsg(null); setRestartOpen(true) }}><RotateCcw size={13} />重启</Button></>}
          />
          {kernel ? (
            <div className="row-list">
              <div><span>当前版本</span><strong className="mono">{kernel.current || '--'}</strong></div>
              <div><span>最新版本</span><strong className="mono">{kernel.latest || '--'}</strong></div>
              <div>
                <span>状态</span>
                {kernel.error
                  ? <Pill tone="warning">检查失败</Pill>
                  : kernel.hasUpdate
                    ? <Pill tone="warning">有新版本</Pill>
                    : <Pill tone="success">已是最新</Pill>}
              </div>
              {kernel.hasUpdate && <div><span>更新方式</span><strong className="muted">服务器执行 update-clash.sh</strong></div>}
              {kernel.error && <div><span>原因</span><strong className="muted">{kernel.error}</strong></div>}
            </div>
          ) : (
            <div className="muted">读取中…</div>
          )}
          {restartMsg && <div style={{ marginTop: 10 }}><Notice tone={restartMsg.tone}>{restartMsg.text}</Notice></div>}
        </Card>
      </section>

      <Card>
        <SectionHeader title="服务" />
        <div className="row-list">
          <div>
            <span>Mihomo API</span>
            <strong>{status?.mihomo?.ok ? `已连接 · ${status.mihomo.version || ''}` : '不可用'}<span className="table-sub mono">{status?.mihomo?.url || ''}</span></strong>
          </div>
          <div>
            <span>流量统计</span>
            <strong>{status?.traffic?.ok ? '已连接' : '不可用'}<span className="table-sub mono">{status?.traffic?.url || ''}</span></strong>
          </div>
          <div>
            <span>配置文件</span>
            <strong className="mono">{status?.config?.path || '/data/clash/config.yaml'}</strong>
          </div>
          <div>
            <span>检查时间</span>
            <strong>{status?.checkedAt ? formatTime(status.checkedAt) : '--'}</strong>
          </div>
        </div>
        {(status && !status.mihomo?.ok) && (
          <div style={{ marginTop: 10 }}>
            <Notice tone="danger">{status.mihomo?.error || 'Mihomo 未连接'}</Notice>
          </div>
        )}
      </Card>

      <Modal
        open={passOpen}
        title="修改密码"
        onClose={() => setPassOpen(false)}
        actions={[
          <Button key="cancel" variant="ghost" onClick={() => setPassOpen(false)}>取消</Button>,
          <Button key="save" variant="primary" loading={changing} onClick={doChangePassword}>确认修改</Button>,
        ]}
      >
        <div className="login-form">
          <Field label="当前密码">
            <input type="password" value={currentPass} onChange={(event) => setCurrentPass(event.target.value)} autoComplete="current-password" />
          </Field>
          <Field label="新密码">
            <input type="password" value={newPass} onChange={(event) => setNewPass(event.target.value)} autoComplete="new-password" />
          </Field>
          <Field label="确认新密码">
            <input type="password" value={confirmPass} onChange={(event) => setConfirmPass(event.target.value)} autoComplete="new-password" />
          </Field>
          {passError && <div className="form-error">{passError}</div>}
        </div>
      </Modal>

      <Modal
        open={restartOpen}
        title="重启 Mihomo 服务？"
        onClose={() => setRestartOpen(false)}
        actions={[
          <Button key="cancel" variant="ghost" onClick={() => setRestartOpen(false)}>取消</Button>,
          <Button key="restart" variant="primary" loading={restarting} onClick={doRestart}><RotateCcw size={15} />确认重启</Button>,
        ]}
      >
        <div className="confirm-content">
          <AlertTriangle size={22} />
          <div>
            <strong>重启期间所有连接会短暂中断</strong>
            <p>服务器将执行 <span className="mono">systemctl restart clash</span>，服务约几秒后恢复。只是改配置的话用配置页的“保存并重载”，不断连。</p>
          </div>
        </div>
      </Modal>
    </div>
  )
}
