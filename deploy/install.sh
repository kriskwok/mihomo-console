#!/bin/bash
set -euo pipefail

if [ "$(id -u)" -ne 0 ]; then
  echo "please run as root" >&2
  exit 1
fi

APP_DIR=/opt/mihomo-console
CONFIG_DIR=/etc/mihomo-console
HELPER=/usr/local/bin/mihomo-console-config
NODE_BIN=$(command -v node)

if [ -z "$NODE_BIN" ]; then
  echo "node not found" >&2
  exit 1
fi

if ! id mihomo-console >/dev/null 2>&1; then
  useradd --system --no-create-home --shell /usr/sbin/nologin --user-group mihomo-console
fi

mkdir -p "$APP_DIR" "$CONFIG_DIR"

install -o root -g root -m 0755 "$APP_DIR/deploy/mihomo-console-config" "$HELPER"
install -o root -g root -m 0644 "$APP_DIR/deploy/sudoers" /etc/sudoers.d/mihomo-console
chmod 0440 /etc/sudoers.d/mihomo-console
visudo -cf /etc/sudoers.d/mihomo-console >/dev/null

chown -R root:mihomo-console "$APP_DIR"
chmod -R u=rwX,g=rX,o= "$APP_DIR"

mkdir -p "$CONFIG_DIR"
chown root:mihomo-console "$CONFIG_DIR"
# 组写权限：服务运行时需创建临时文件以更新密码
chmod 770 "$CONFIG_DIR"

if [ ! -f "$CONFIG_DIR/config.json" ]; then
  MIHOMO_CONSOLE_CONFIG="$CONFIG_DIR/config.json" "$NODE_BIN" "$APP_DIR/server/src/cli.js" init
else
  echo "config already exists: $CONFIG_DIR/config.json"
fi

chown root:mihomo-console "$CONFIG_DIR/config.json"
chmod 640 "$CONFIG_DIR/config.json"

install -o root -g root -m 0644 "$APP_DIR/deploy/mihomo-console.service" /etc/systemd/system/mihomo-console.service
systemctl daemon-reload
systemctl enable --now mihomo-console.service

echo "mihomo-console installed"
systemctl --no-pager --full status mihomo-console.service || true
if [ -f /root/.mihomo-console-admin-password ]; then
  echo "admin password file: /root/.mihomo-console-admin-password"
fi
