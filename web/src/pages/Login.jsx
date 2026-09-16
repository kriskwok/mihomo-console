import { useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../App.jsx'
import { Button, Card, Field, Logo } from '../components/ui.jsx'

export default function Login() {
  const { login } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [username, setUsername] = useState('admin')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const submit = async (event) => {
    event.preventDefault()
    setError('')
    setLoading(true)
    try {
      await login(username, password)
      navigate(location.state?.from || '/', { replace: true })
    } catch (err) {
      setError(err.message || '登录失败')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="login-page">
      <Card className="login-card">
        <div style={{ marginBottom: 14 }}><Logo /></div>
        <h2>登录</h2>
        <form onSubmit={submit} className="login-form">
          <Field label="用户名">
            <input
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              autoComplete="username"
              autoFocus
              required
            />
          </Field>
          <Field label="密码">
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="current-password"
              required
            />
          </Field>
          {error && <div className="form-error">{error}</div>}
          <Button type="submit" variant="primary" size="lg" loading={loading} className="login-submit">
            登录
          </Button>
        </form>
      </Card>
    </div>
  )
}
