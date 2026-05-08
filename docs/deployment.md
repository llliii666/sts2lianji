# 部署说明

目标环境：阿里云轻量服务器 Ubuntu 24.x，2 核 2G / 40GB。

## 服务器环境检查

上线前先运行只读检查脚本，把输出发回本地确认：

```bash
bash scripts/ubuntu24-check.sh
```

如果服务器还没有 Git/Node/Caddy，可以运行环境安装脚本：

```bash
bash scripts/ubuntu24-bootstrap-env.sh
```

如果仓库还没有 clone 到服务器，先运行本文末尾的“未 clone 前的只读检查命令”，把输出发回确认。

## 服务器依赖

只需要安装 Git、Node.js 24 LTS、Caddy。

```bash
sudo apt update
sudo apt install -y git curl
curl -fsSL https://deb.nodesource.com/setup_24.x | sudo -E bash -
sudo apt install -y nodejs
node --version
npm --version
```

Caddy 用于自动 HTTPS 和反向代理：

```bash
sudo apt install -y debian-keyring debian-archive-keyring apt-transport-https
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list
sudo apt update
sudo apt install -y caddy
```

## 拉取和构建

```bash
git clone <your-github-repo-url> /opt/spire-lobby
cd /opt/spire-lobby
npm ci
npm run build
```

生产数据库建议放在仓库目录内的 `data/prod.sqlite`，该文件不会提交到 GitHub。

## systemd 服务

创建 `/etc/systemd/system/spire-lobby.service`：

```ini
[Unit]
Description=Slay the Spire 2 Lobby
After=network.target

[Service]
Type=simple
WorkingDirectory=/opt/spire-lobby
Environment=NODE_ENV=production
Environment=PORT=3000
Environment=HOST=127.0.0.1
Environment=DATABASE_PATH=/opt/spire-lobby/data/prod.sqlite
Environment=PUBLIC_ORIGIN=https://your-domain.example
ExecStart=/usr/bin/npm run start
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
```

启用服务：

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now spire-lobby
sudo systemctl status spire-lobby
```

## Caddy 反向代理

编辑 `/etc/caddy/Caddyfile`：

```caddyfile
your-domain.example {
  reverse_proxy 127.0.0.1:3000
}
```

应用配置：

```bash
sudo systemctl reload caddy
```

## 更新流程

```bash
cd /opt/spire-lobby
git pull
npm ci
npm run build
sudo systemctl restart spire-lobby
sudo systemctl status spire-lobby
```

## 验收命令

```bash
curl http://127.0.0.1:3000/api/health
sudo journalctl -u spire-lobby -n 100 --no-pager
```

## 未 clone 前的只读检查命令

```bash
set -x
date -Is
cat /etc/os-release
uname -a
nproc
free -h
df -h /
command -v sudo git curl gpg node npm caddy systemctl ss ufw || true
git --version || true
curl --version | head -n 1 || true
node --version || true
npm --version || true
caddy version || true
node --no-warnings=ExperimentalWarning -e "require('node:sqlite'); console.log('node:sqlite ok')" || true
systemctl is-system-running || true
systemctl is-enabled caddy || true
systemctl is-active caddy || true
ss -ltnp | sed -n '1,30p' || true
sudo -n ufw status verbose || ufw status verbose || true
apt-cache policy nodejs | sed -n '1,20p' || true
apt-cache policy caddy | sed -n '1,20p' || true
```
