---
sidebar_position: 2
---

# Self-Hosting

Run OpsPilot on your own infrastructure.

## Deployment Options

| Option | Best For |
|--------|----------|
| Local (default) | Personal use, development |
| Docker | Easy deployment, isolation |
| Systemd | Linux servers, always-on |
| Kubernetes | Production, high availability |

## Local Installation

The simplest option - run directly on your machine:

```bash
# Install
bun install -g opspilot

# Configure
opspilot setup

# Run
opspilot gateway start
```

## Docker Deployment

### Dockerfile

```dockerfile
FROM oven/bun:1.0

WORKDIR /app

# Copy package files
COPY package.json bun.lockb ./
COPY packages ./packages
COPY apps ./apps

# Install dependencies
RUN bun install --frozen-lockfile

# Expose gateway port
EXPOSE 18789

# Run gateway
CMD ["bun", "run", "apps/cli/src/index.ts", "gateway", "start"]
```

### Docker Compose

```yaml
version: '3.8'

services:
  opspilot:
    build: .
    ports:
      - "18789:18789"
    environment:
      - ANTHROPIC_API_KEY=${ANTHROPIC_API_KEY}
      - TELEGRAM_BOT_TOKEN=${TELEGRAM_BOT_TOKEN}
    volumes:
      - opspilot-data:/root/.opspilot
    restart: unless-stopped

volumes:
  opspilot-data:
```

### Run with Docker

```bash
# Build
docker build -t opspilot .

# Run
docker run -d \
  --name opspilot \
  -p 18789:18789 \
  -e ANTHROPIC_API_KEY=$ANTHROPIC_API_KEY \
  -e TELEGRAM_BOT_TOKEN=$TELEGRAM_BOT_TOKEN \
  -v opspilot-data:/root/.opspilot \
  opspilot
```

## Systemd Service

### Create Service File

```bash
sudo cat > /etc/systemd/system/opspilot.service << 'EOF'
[Unit]
Description=OpsPilot DevOps Copilot
After=network.target

[Service]
Type=simple
User=opspilot
Group=opspilot
WorkingDirectory=/opt/opspilot
ExecStart=/usr/local/bin/bun run apps/cli/src/index.ts gateway start
Restart=on-failure
RestartSec=10

# Environment
Environment=HOME=/opt/opspilot
EnvironmentFile=/opt/opspilot/.env

# Hardening
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ReadWritePaths=/opt/opspilot

[Install]
WantedBy=multi-user.target
EOF
```

### Setup

```bash
# Create user
sudo useradd -r -s /bin/false opspilot

# Install OpsPilot
sudo mkdir -p /opt/opspilot
sudo chown opspilot:opspilot /opt/opspilot

# Copy files
sudo -u opspilot git clone https://github.com/agenticops/opspilot /opt/opspilot
cd /opt/opspilot && sudo -u opspilot bun install

# Create env file
sudo cat > /opt/opspilot/.env << 'EOF'
ANTHROPIC_API_KEY=sk-ant-...
TELEGRAM_BOT_TOKEN=123456:ABC...
EOF
sudo chmod 600 /opt/opspilot/.env

# Configure
sudo -u opspilot opspilot setup

# Enable and start
sudo systemctl enable opspilot
sudo systemctl start opspilot
```

### Management

```bash
# Status
sudo systemctl status opspilot

# Logs
sudo journalctl -u opspilot -f

# Restart
sudo systemctl restart opspilot

# Stop
sudo systemctl stop opspilot
```

## Kubernetes Deployment

### Deployment

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: opspilot
  labels:
    app: opspilot
spec:
  replicas: 1
  selector:
    matchLabels:
      app: opspilot
  template:
    metadata:
      labels:
        app: opspilot
    spec:
      containers:
        - name: opspilot
          image: ghcr.io/agenticops/opspilot:latest
          ports:
            - containerPort: 18789
          env:
            - name: ANTHROPIC_API_KEY
              valueFrom:
                secretKeyRef:
                  name: opspilot-secrets
                  key: anthropic-api-key
            - name: TELEGRAM_BOT_TOKEN
              valueFrom:
                secretKeyRef:
                  name: opspilot-secrets
                  key: telegram-bot-token
          volumeMounts:
            - name: config
              mountPath: /root/.opspilot
          resources:
            requests:
              memory: "256Mi"
              cpu: "100m"
            limits:
              memory: "1Gi"
              cpu: "500m"
      volumes:
        - name: config
          persistentVolumeClaim:
            claimName: opspilot-pvc
```

### Secret

```yaml
apiVersion: v1
kind: Secret
metadata:
  name: opspilot-secrets
type: Opaque
stringData:
  anthropic-api-key: sk-ant-...
  telegram-bot-token: "123456:ABC..."
```

### Service

```yaml
apiVersion: v1
kind: Service
metadata:
  name: opspilot
spec:
  selector:
    app: opspilot
  ports:
    - port: 18789
      targetPort: 18789
  type: ClusterIP
```

## Remote Access

### Tailscale (Recommended)

Zero-config secure access:

```yaml
# config.yaml
gateway:
  bind: "0.0.0.0"
  port: 18789
  tunnel:
    provider: tailscale
```

```bash
# Install Tailscale
curl -fsSL https://tailscale.com/install.sh | sh

# Connect
tailscale up

# Access from any Tailscale device
curl http://opspilot:18789/status
```

### ngrok

Quick public URL:

```bash
# Install ngrok
brew install ngrok

# Expose gateway
ngrok http 18789
```

```yaml
# config.yaml
gateway:
  bind: "127.0.0.1"
  port: 18789
  tunnel:
    provider: ngrok
```

### Cloudflare Tunnel

Enterprise-grade:

```bash
# Install cloudflared
brew install cloudflared

# Create tunnel
cloudflared tunnel create opspilot

# Route
cloudflared tunnel route dns opspilot opspilot.yourdomain.com

# Run
cloudflared tunnel run opspilot
```

## Reverse Proxy

### Nginx

```nginx
upstream opspilot {
    server 127.0.0.1:18789;
}

server {
    listen 443 ssl http2;
    server_name opspilot.yourdomain.com;

    ssl_certificate /etc/letsencrypt/live/opspilot.yourdomain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/opspilot.yourdomain.com/privkey.pem;

    location / {
        proxy_pass http://opspilot;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

### Caddy

```
opspilot.yourdomain.com {
    reverse_proxy localhost:18789
}
```

## High Availability

For production deployments:

### Multiple Instances

```yaml
# Kubernetes
spec:
  replicas: 2
```

Note: Telegram bots can only have one active polling connection. Use webhooks for multiple instances.

### Database

Use external SQLite or migrate to PostgreSQL:

```yaml
memory:
  store:
    driver: sqlite
    path: /shared/memory.db  # On shared volume
```

### Health Checks

```yaml
livenessProbe:
  httpGet:
    path: /health
    port: 18789
  initialDelaySeconds: 10
  periodSeconds: 30

readinessProbe:
  httpGet:
    path: /health
    port: 18789
  initialDelaySeconds: 5
  periodSeconds: 10
```

## Backup

### Config Backup

```bash
# Backup
tar czf opspilot-backup.tar.gz ~/.opspilot

# Restore
tar xzf opspilot-backup.tar.gz -C ~
```

### Automated Backup

```bash
# Cron job
0 2 * * * tar czf /backups/opspilot-$(date +\%Y\%m\%d).tar.gz ~/.opspilot
```

## Monitoring

### Health Endpoint

```bash
curl http://localhost:18789/health
```

### Status Endpoint

```bash
curl http://localhost:18789/status
```

### Prometheus Metrics

Coming soon.

## Troubleshooting

### Container won't start

Check logs:
```bash
docker logs opspilot
```

Common issues:
- Missing environment variables
- Port already in use
- Permission denied on volumes

### Telegram not connecting

- Only one instance can poll a bot
- Check bot token is correct
- Verify network access to api.telegram.org

### Memory database locked

SQLite locks with concurrent access:
- Use single instance
- Or migrate to PostgreSQL (coming soon)
