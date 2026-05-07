# 部署说明

目标环境：阿里云轻量服务器 Ubuntu，2 核 2G / 40GB。

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
