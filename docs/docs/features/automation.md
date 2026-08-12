---
sidebar_position: 3
---

# Automation

> **Status: planned, not built.** Heartbeats, cron jobs, and morning briefings do not exist yet — the `@xops/automation` package is currently an empty stub. This is roadmap Phase 7. The description below is the target design.

Let xops work proactively with heartbeats, cron jobs, and scheduled tasks.

## Overview

Automation features:

- **Heartbeat** - Periodic health checks
- **Cron Jobs** - Scheduled tasks and reports
- **Morning Briefings** - Daily status summaries
- **Proactive Alerts** - Get notified before problems

## Heartbeat

Heartbeat runs periodic checks based on a checklist you define.

### Enable Heartbeat

```yaml
automation:
  heartbeat:
    enabled: true
    every: 30m
    checklist: ~/.xops/workspace/HEARTBEAT.md
```

### Create Checklist

```markdown
# ~/.xops/workspace/HEARTBEAT.md

# xops Heartbeat Checklist

Run these checks every 30 minutes.

## Priority Checks

- [ ] Check for any critical alerts in PagerDuty
- [ ] Verify all production pods are running
- [ ] Check for any failed deployments in ArgoCD
- [ ] Review error rates in the last 30 minutes

## Resource Checks

- [ ] Check CPU usage across clusters
- [ ] Check memory utilization
- [ ] Check disk space on persistent volumes

## Response Format

If everything is normal, respond with: HEARTBEAT_OK

If action is needed:
1. Describe what you found
2. Assess severity (critical, warning, info)
3. Recommend next steps
4. Tag relevant team members if critical
```

### Heartbeat Output

When everything is fine:
```
HEARTBEAT_OK

All systems nominal:
- 47 pods running, 0 failing
- CPU: 45% avg, Memory: 62% avg
- No critical alerts
- ArgoCD: All apps synced
```

When issues are found:
```
⚠️ HEARTBEAT ALERT

Found 2 issues requiring attention:

1. [WARNING] High memory usage on api-service
   - Current: 89% of limit
   - Trend: Increasing over last hour
   - Action: Consider increasing memory limit

2. [WARNING] ArgoCD app 'frontend' out of sync
   - Last sync: 2 hours ago
   - Pending changes: 3 commits
   - Action: Review and sync deployment

Recommended: Review and address within 1 hour.
```

### Manual Heartbeat

Run a heartbeat check now:

```bash
xops heartbeat run
```

## Cron Jobs

Schedule recurring tasks and reports.

### Configuration

```yaml
automation:
  cron:
    jobs:
      - name: morning-briefing
        schedule: "0 8 * * 1-5"    # 8am weekdays
        message: "Give me a morning briefing"
        deliver: telegram

      - name: weekly-cost-report
        schedule: "0 9 * * 1"      # 9am Mondays
        message: "Generate weekly AWS cost report"
        deliver: slack

      - name: nightly-backup-check
        schedule: "0 6 * * *"      # 6am daily
        message: "Verify all backups completed successfully"
        deliver: telegram
```

### Cron Schedule Format

```
┌───────────── minute (0-59)
│ ┌───────────── hour (0-23)
│ │ ┌───────────── day of month (1-31)
│ │ │ ┌───────────── month (1-12)
│ │ │ │ ┌───────────── day of week (0-6, Sun=0)
│ │ │ │ │
* * * * *
```

Common schedules:

| Schedule | Meaning |
|----------|---------|
| `0 8 * * 1-5` | 8am weekdays |
| `0 9 * * 1` | 9am Mondays |
| `0 */2 * * *` | Every 2 hours |
| `*/30 * * * *` | Every 30 minutes |
| `0 0 1 * *` | Midnight on 1st of month |

### Delivery Channels

| Channel | Description |
|---------|-------------|
| `telegram` | Send to Telegram bot |
| `slack` | Post to Slack |
| `web` | Log to web interface |

### Managing Cron Jobs

```bash
# List all jobs
xops cron list

# Add a job
xops cron add \
  --name "daily-check" \
  --schedule "0 9 * * *" \
  --message "Check system health" \
  --deliver telegram

# Remove a job
xops cron remove --name "daily-check"

# Run manually
xops cron run --name "morning-briefing"
```

## Morning Briefing

A special cron job that summarizes overnight activity.

### Setup

```yaml
automation:
  cron:
    jobs:
      - name: morning-briefing
        schedule: "0 8 * * 1-5"
        message: |
          Give me a morning briefing covering:
          1. Any alerts that fired overnight
          2. Deployment activity
          3. Current system health
          4. Any issues needing attention
        deliver: telegram
```

### Example Output

```
☀️ Good morning! Here's your briefing for January 26, 2025:

📊 Overnight Summary (11pm - 8am)
- Alerts: 3 fired, 2 auto-resolved, 1 acknowledged
- Deployments: 2 successful (frontend, api-v2.1.0)
- Incidents: None

🔍 Current Status
- All 47 pods healthy
- Error rate: 0.02% (normal)
- p99 latency: 145ms (normal)

⚠️ Attention Needed
1. Disk usage on logs-pv at 78% - consider cleanup
2. SSL cert for api.example.com expires in 14 days

📈 Trends
- Traffic 15% higher than last week
- Memory usage trending up on worker nodes

Have a productive day! 🚀
```

## Proactive Monitoring

Configure xops to watch for specific conditions.

### Cost Alerts

```yaml
automation:
  cron:
    jobs:
      - name: cost-check
        schedule: "0 10 * * *"
        message: |
          Check AWS costs for today.
          Alert if:
          - Daily spend exceeds $500
          - Any single service increased >20% from yesterday
        deliver: slack
```

### Security Checks

```yaml
automation:
  cron:
    jobs:
      - name: security-scan
        schedule: "0 2 * * *"
        message: |
          Run security checks:
          1. Check for pods running as root
          2. Verify no public S3 buckets
          3. Check for expired certificates
          4. Review failed login attempts
        deliver: telegram
```

### SLA Monitoring

```yaml
automation:
  cron:
    jobs:
      - name: sla-report
        schedule: "0 0 * * 1"  # Midnight Sunday
        message: |
          Generate weekly SLA report:
          - Uptime percentage
          - p95 and p99 latencies
          - Error budget remaining
          - Incidents affecting SLA
        deliver: slack
```

## Best Practices

### 1. Start Simple

Begin with a basic heartbeat:

```yaml
automation:
  heartbeat:
    enabled: true
    every: 30m
```

### 2. Tune Frequency

- Critical systems: 15m heartbeat
- Standard: 30m heartbeat
- Cost checks: Daily
- Reports: Weekly

### 3. Use Meaningful Messages

```yaml
# Good
message: "Check if any deployments failed in the last hour and report errors"

# Too vague
message: "Check deployments"
```

### 4. Route to Right Channels

- Urgent: Telegram (push notifications)
- Reports: Slack (team visibility)
- Logs: Web (searchable history)

### 5. Review and Iterate

Regularly review automation outputs and adjust:
- Remove noisy checks
- Add missing coverage
- Tune thresholds

## Troubleshooting

### Cron not running

1. Check gateway is running
2. Verify cron schedule syntax
3. Check logs for errors

### Messages not delivered

1. Verify channel is configured
2. Check channel credentials
3. Test channel manually

### Heartbeat timing issues

Heartbeat runs from gateway start, not clock time:
- Gateway starts at 8:15
- 30m heartbeat runs at 8:45, 9:15, etc.

For clock-aligned runs, use cron instead.
