import { useCallback, useEffect, useState } from 'react'
import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import {
  Activity,
  Cable,
  ChartNoAxesCombined,
  FileCode2,
  LogOut,
  Moon,
  Route,
  ScrollText,
  Settings,
  Sun,
  Waypoints,
  RefreshCw,
} from 'lucide-react'
import { api } from '../api.js'
import { CatMark } from './ui.jsx'
import { useAuth } from '../App.jsx'

function formatUptime(totalSeconds) {
  const total = Math.max(0, Math.floor(Number(totalSeconds || 0)))
  const days = Math.floor(total / 86400)
  const hours = Math.floor((total % 86400) / 3600)
  const minutes = Math.floor((total % 3600) / 60)
  return `${days}天${hours}小时${minutes}分钟`
}

const navItems = [
  { to: '/', label: '概览', icon: Activity, end: true, color: '#0a84ff' },
  { to: '/proxies', label: '代理', icon: Waypoints, color: '#8b5cf6' },
  { to: '/subscriptions', label: '订阅', icon: RefreshCw, color: '#1f9d55' },
  { to: '/connections', label: '连接', icon: Cable, color: '#eab308' },
  { to: '/rules', label: '规则', icon: Route, color: '#e5484d' },
  { to: '/traffic', label: '流量', icon: ChartNoAxesCombined, color: '#06b6d4' },
  { to: '/logs', label: '日志', icon: ScrollText, color: '#64748b' },
  { to: '/config', label: '配置', icon: FileCode2, color: '#f97316' },
  { to: '/settings', label: '设置', icon: Settings, color: '#e3498b' },
]

export default function AppShell() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const [online, setOnline] = useState(null)
  const [uptimeAtLoad, setUptimeAtLoad] = useState(null)

  const loadStatus = useCallback(async () => {
    try {
      const status = await api('/api/app/status')
      setOnline(Boolean(status?.ok && status?.mihomo?.ok))
      // 运行时间只在页面打开时取一次，不跟随轮询更新
      setUptimeAtLoad((current) => {
        if (current !== null) return current
        const seconds = status?.mihomo?.uptime
        return typeof seconds === 'number' ? seconds : current
      })
    } catch {
      setOnline(false)
    }
  }, [])

  useEffect(() => {
    loadStatus()
    const timer = setInterval(loadStatus, 15000)
    return () => clearInterval(timer)
  }, [loadStatus])

  const [theme, setTheme] = useState(() => localStorage.getItem('mihomo-console-theme') || 'light')
  useEffect(() => {
    document.documentElement.dataset.theme = theme
    localStorage.setItem('mihomo-console-theme', theme)
  }, [theme])

  const doLogout = async () => {
    await logout()
    navigate('/login', { replace: true })
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <button className="brand" type="button" onClick={() => navigate('/')}>
          <CatMark size={32} />
          <span className="brand-name">Mihomo</span>
        </button>
        <nav className="side-nav">
          {navItems.map(({ to, label, icon: Icon, end, color }) => (
            <NavLink key={to} to={to} end={end} className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}>
              <Icon size={19} style={{ color }} />
              <span>{label}</span>
            </NavLink>
          ))}
        </nav>
        <div className="side-foot">
          <div className="side-status">
            <span className={`status-dot ${online === null ? '' : online ? 'ok' : 'bad'}`} />
            {online === null
              ? '检查中'
              : online
                ? `${uptimeAtLoad !== null ? `已运行${formatUptime(uptimeAtLoad)}` : '内核在线'}`
                : '内核离线'}
          </div>
          <div className="side-user">
            <strong>{user?.username || 'admin'}</strong>
            <button className="icon-button" type="button" onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')} title="切换主题">
              {theme === 'light' ? <Moon size={15} /> : <Sun size={15} />}
            </button>
            <button className="icon-button" type="button" onClick={doLogout} title="退出登录">
              <LogOut size={15} />
            </button>
          </div>
        </div>
      </aside>
      <main className="page-shell">
        <Outlet context={{ refreshAppStatus: loadStatus }} />
      </main>
    </div>
  )
}
