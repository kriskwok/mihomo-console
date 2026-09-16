import { AlertCircle, CheckCircle2, LoaderCircle, X } from 'lucide-react'

function cx(...values) {
  return values.filter(Boolean).join(' ')
}

export function CatMark({ size = 32 }) {
  return (
    <img src="/cat-64.png" width={size} height={size} alt="Mihomo" style={{ borderRadius: 8, display: 'block' }} />
  )
}

export function Logo() {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 9 }}>
      <CatMark />
      <span className="brand-name">Mihomo</span>
    </span>
  )
}

export function StatusDot({ ok }) {
  return <span className={cx('status-dot', ok === null || ok === undefined ? '' : ok ? 'ok' : 'bad')} />
}

export function Pill({ children, tone = 'neutral', className }) {
  return <span className={cx('pill', tone !== 'neutral' && `pill-${tone}`, className)}>{children}</span>
}

export function Button({ children, variant = 'default', size = 'md', loading = false, className, ...props }) {
  return (
    <button
      className={cx('button', variant !== 'default' && `button-${variant}`, size !== 'md' && `button-${size}`, className)}
      disabled={loading || props.disabled}
      {...props}
    >
      {loading ? <LoaderCircle className="spin" size={15} /> : null}
      {children}
    </button>
  )
}

export function Card({ children, className }) {
  return <section className={cx('card', className)}>{children}</section>
}

export function SectionHeader({ title, description, actions }) {
  return (
    <div className="section-header">
      <div>
        {title && <h2>{title}</h2>}
        {description && <p>{description}</p>}
      </div>
      {actions && <div className="section-actions">{actions}</div>}
    </div>
  )
}

export function Field({ label, hint, children }) {
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      {children}
      {hint && <span className="field-hint">{hint}</span>}
    </label>
  )
}

export function Modal({ open, title, children, onClose, actions, width = '520px' }) {
  if (!open) return null
  return (
    <div className="modal-shell" role="dialog" aria-modal="true">
      <button className="modal-backdrop" type="button" onClick={onClose} aria-label="关闭" />
      <div className="modal-card" style={{ '--modal-width': width }}>
        <div className="modal-head">
          <h3>{title}</h3>
          <button className="icon-button" type="button" onClick={onClose} aria-label="关闭">
            <X size={18} />
          </button>
        </div>
        <div className="modal-body">{children}</div>
        {actions && <div className="modal-actions">{actions}</div>}
      </div>
    </div>
  )
}

export function Notice({ tone = 'neutral', children, icon: Icon }) {
  const FallbackIcon = tone === 'success' ? CheckCircle2 : AlertCircle
  const ActualIcon = Icon || FallbackIcon
  return (
    <div className={cx('notice', tone !== 'neutral' && `notice-${tone}`)}>
      <ActualIcon size={16} />
      <div>{children}</div>
    </div>
  )
}

export function EmptyState({ title = '暂无数据', description, action }) {
  return (
    <div className="empty-state">
      <strong>{title}</strong>
      {description && <p>{description}</p>}
      {action}
    </div>
  )
}

export function LoadingBlock({ label = '正在加载' }) {
  return (
    <div className="loading-block">
      <LoaderCircle className="spin" size={18} />
      <span>{label}</span>
    </div>
  )
}
