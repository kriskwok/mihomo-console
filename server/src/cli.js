import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { hashPassword } from './auth.js'

const configFile = process.env.MIHOMO_CONSOLE_CONFIG || '/etc/mihomo-console/config.json'

function randomPassword(length = 18) {
  return crypto.randomBytes(32).toString('base64url').slice(0, length)
}

function readMihomoSecret() {
  try {
    const content = fs.readFileSync('/data/clash/config.yaml', 'utf8')
    const line = content.split('\n').find((item) => /^secret\s*:/.test(item.trim()))
    if (!line) return ''
    return line.replace(/^secret\s*:\s*/, '').trim().replace(/^["']|["']$/g, '')
  } catch {
    return ''
  }
}

function defaultConfig(password) {
  return {
    listen: '10.10.9.2',
    port: 9082,
    username: 'admin',
    passwordHash: hashPassword(password),
    sessionSecret: crypto.randomBytes(32).toString('base64url'),
    sessionTtlHours: 168,
    mihomoUrl: 'http://127.0.0.1:9095',
    mihomoSecret: readMihomoSecret(),
    trafficMonitorUrl: 'http://127.0.0.1:8080',
    configPath: '/data/clash/config.yaml',
    configHelper: '/usr/local/bin/mihomo-console-config',
    webDist: '/opt/mihomo-console/web/dist',
  }
}

function writeConfig(config) {
  fs.mkdirSync(path.dirname(configFile), { recursive: true })
  fs.writeFileSync(configFile, `${JSON.stringify(config, null, 2)}\n`, { mode: 0o640 })
}

function readConfig() {
  return JSON.parse(fs.readFileSync(configFile, 'utf8'))
}

const command = process.argv[2]

if (command === 'init') {
  if (fs.existsSync(configFile)) {
    console.error(`config already exists: ${configFile}`)
    process.exit(1)
  }
  const password = randomPassword()
  writeConfig(defaultConfig(password))
  fs.writeFileSync('/root/.mihomo-console-admin-password', `${password}\n`, { mode: 0o600 })
  console.log(`username=admin`)
  console.log(`password=${password}`)
  process.exit(0)
}

if (command === 'set-password') {
  const password = process.argv[3]
  if (!password) {
    console.error('usage: node src/cli.js set-password <password>')
    process.exit(2)
  }
  const config = readConfig()
  config.passwordHash = hashPassword(password)
  writeConfig(config)
  console.log('password updated')
  process.exit(0)
}

console.log(`usage:
  node src/cli.js init
  node src/cli.js set-password <password>`)
