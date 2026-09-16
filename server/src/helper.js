import { spawn } from 'node:child_process'

export function runHelper(config, command, input = '', timeoutMs = 90000, extraArgs = []) {
  return new Promise((resolve) => {
    const child = spawn('/usr/bin/sudo', ['-n', config.configHelper, command, ...extraArgs], {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env, LC_ALL: 'C', LANG: 'C' },
    })

    let stdout = ''
    let stderr = ''
    let settled = false
    const timer = setTimeout(() => {
      if (!settled) {
        settled = true
        child.kill('SIGKILL')
        resolve({ ok: false, code: -1, stdout, stderr: `${stderr}\nhelper timed out`.trim() })
      }
    }, timeoutMs)

    child.stdout.on('data', (chunk) => { stdout += chunk.toString() })
    child.stderr.on('data', (chunk) => { stderr += chunk.toString() })
    child.on('error', (error) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      resolve({ ok: false, code: -1, stdout, stderr: error.message })
    })
    child.on('close', (code) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      resolve({ ok: code === 0, code, stdout, stderr })
    })

    if (input) child.stdin.end(input)
    else child.stdin.end()
  })
}

export async function readConfig(config) {
  const result = await runHelper(config, 'read')
  if (!result.ok) throw new Error(result.stderr || '读取配置失败')
  return result.stdout
}

export async function validateConfig(config, content) {
  return runHelper(config, 'validate', content)
}

export async function applyConfig(config, content) {
  return runHelper(config, 'apply', content)
}

export async function restoreConfig(config, backupName) {
  return runHelper(config, 'restore', '', 30000, [backupName])
}

export async function restartService(config) {
  return runHelper(config, 'restart', '', 60000)
}
