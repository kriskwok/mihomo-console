import fs from 'node:fs'
import path from 'node:path'

const DEFAULT_CONFIG_PATH = '/etc/mihomo-console/config.json'

export function configPath() {
  return process.env.MIHOMO_CONSOLE_CONFIG || DEFAULT_CONFIG_PATH
}

export function loadConfig() {
  const file = configPath()
  const raw = fs.readFileSync(file, 'utf8')
  const config = JSON.parse(raw)

  const required = ['listen', 'port', 'username', 'passwordHash', 'sessionSecret', 'mihomoUrl', 'trafficMonitorUrl', 'configPath', 'configHelper']
  for (const key of required) {
    if (config[key] === undefined || config[key] === null || config[key] === '') {
      throw new Error(`配置缺少字段: ${key}`)
    }
  }

  config.port = Number(config.port)
  config.sessionTtlHours = Number(config.sessionTtlHours || 168)
  config.mihomoSecret = String(config.mihomoSecret || '')
  config.webDist = config.webDist || path.resolve(process.cwd(), '../web/dist')
  return config
}

export function saveConfig(config) {
  const file = configPath()
  const temp = `${file}.tmp`
  fs.writeFileSync(temp, `${JSON.stringify(config, null, 2)}\n`, { mode: 0o640 })
  fs.renameSync(temp, file)
}
