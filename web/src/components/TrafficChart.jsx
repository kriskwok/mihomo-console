import { useMemo, useState } from 'react'
import { formatBytes, formatTime } from '../utils.js'

const WIDTH = 1000
const HEIGHT = 260
const PADDING = { top: 22, right: 18, bottom: 14, left: 56 }

function buildPath(points, key, max) {
  if (!points.length) return ''
  const innerW = WIDTH - PADDING.left - PADDING.right
  const innerH = HEIGHT - PADDING.top - PADDING.bottom
  return points
    .map((point, index) => {
      const x = PADDING.left + (index / Math.max(1, points.length - 1)) * innerW
      const y = PADDING.top + innerH - (Number(point[key] || 0) / max) * innerH
      return `${index === 0 ? 'M' : 'L'} ${x.toFixed(2)} ${y.toFixed(2)}`
    })
    .join(' ')
}

function buildArea(points, key, max) {
  if (!points.length) return ''
  const path = buildPath(points, key, max)
  const innerW = WIDTH - PADDING.left - PADDING.right
  const bottom = HEIGHT - PADDING.bottom
  return `${path} L ${PADDING.left + innerW} ${bottom} L ${PADDING.left} ${bottom} Z`
}

export default function TrafficChart({ data = [], height = 260, compact = false }) {
  const [hover, setHover] = useState(null)
  const points = Array.isArray(data) ? data : []
  const max = useMemo(() => {
    const values = points.flatMap((point) => [Number(point.upload || 0), Number(point.download || 0)])
    return Math.max(1, ...values) * 1.18
  }, [points])

  const uploadPath = useMemo(() => buildPath(points, 'upload', max), [points, max])
  const downloadPath = useMemo(() => buildPath(points, 'download', max), [points, max])
  const uploadArea = useMemo(() => buildArea(points, 'upload', max), [points, max])
  const downloadArea = useMemo(() => buildArea(points, 'download', max), [points, max])

  const onMove = (event) => {
    if (!points.length) return
    const rect = event.currentTarget.getBoundingClientRect()
    const ratio = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width))
    const innerRatio = Math.min(1, Math.max(0, (ratio * WIDTH - PADDING.left) / (WIDTH - PADDING.left - PADDING.right)))
    setHover(Math.round(innerRatio * (points.length - 1)))
  }

  const hoverPoint = hover !== null ? points[hover] : null
  const hoverX =
    hover !== null ? PADDING.left + (hover / Math.max(1, points.length - 1)) * (WIDTH - PADDING.left - PADDING.right) : 0

  return (
    <div className="chart-shell" style={{ height }}>
      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        preserveAspectRatio="none"
        className="traffic-chart"
        onMouseMove={onMove}
        onMouseLeave={() => setHover(null)}
      >
        <defs>
          <linearGradient id="uploadFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#65b8ff" stopOpacity="0.35" />
            <stop offset="100%" stopColor="#65b8ff" stopOpacity="0" />
          </linearGradient>
          <linearGradient id="downloadFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#8b5cf6" stopOpacity="0.32" />
            <stop offset="100%" stopColor="#8b5cf6" stopOpacity="0" />
          </linearGradient>
        </defs>

        {[0, 0.25, 0.5, 0.75, 1].map((tick) => {
          const y = PADDING.top + tick * (HEIGHT - PADDING.top - PADDING.bottom)
          return <line key={tick} x1={PADDING.left} x2={WIDTH - PADDING.right} y1={y} y2={y} className="chart-grid" />
        })}

        <path d={uploadArea} fill="url(#uploadFill)" />
        <path d={downloadArea} fill="url(#downloadFill)" />
        <path d={uploadPath} className="chart-line chart-upload" />
        <path d={downloadPath} className="chart-line chart-download" />

        {hoverPoint && (
          <g>
            <line x1={hoverX} x2={hoverX} y1={PADDING.top} y2={HEIGHT - PADDING.bottom} className="chart-cursor" />
            <circle cx={hoverX} cy={PADDING.top + (HEIGHT - PADDING.top - PADDING.bottom) - (Number(hoverPoint.upload || 0) / max) * (HEIGHT - PADDING.top - PADDING.bottom)} r="4" className="chart-point chart-point-upload" />
            <circle cx={hoverX} cy={PADDING.top + (HEIGHT - PADDING.top - PADDING.bottom) - (Number(hoverPoint.download || 0) / max) * (HEIGHT - PADDING.top - PADDING.bottom)} r="4" className="chart-point chart-point-download" />
          </g>
        )}
      </svg>

      {hoverPoint && (
        <div className="chart-tooltip" style={{ left: `${(hoverX / WIDTH) * 100}%` }}>
          <strong>{formatTime(hoverPoint.timestamp)}</strong>
          <span><i className="dot dot-upload" />上传 {formatBytes(hoverPoint.upload)}</span>
          <span><i className="dot dot-download" />下载 {formatBytes(hoverPoint.download)}</span>
        </div>
      )}
    </div>
  )
}
