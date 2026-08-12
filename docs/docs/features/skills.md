---
sidebar_position: 2
---

# Skills

Skills are specialized prompts that give OpsPilot expertise in specific domains.

## Overview

Skills provide:

- **Domain Knowledge** - Best practices for specific tools
- **Structured Workflows** - Step-by-step procedures
- **Tool Integration** - Commands and API calls
- **Context Awareness** - Understands your environment

## Bundled Skills

OpsPilot comes with DevOps-focused skills:

| Skill | Description | Requires |
|-------|-------------|----------|
| `k8s-debug` | Kubernetes debugging | kubectl |
| `incident-diagnose` | Incident response workflow | - |
| `prometheus-query` | Prometheus metrics | kubectl, prometheus |
| `loki-search` | Log analysis | kubectl, loki |
| `argocd-sync` | GitOps deployments | argocd |

## Using Skills

Skills are automatically loaded when relevant. Just ask naturally:

```
You: Debug why the api-service pods keep restarting

OpsPilot: I'll run through the Kubernetes debugging workflow.

1. Checking pod status...
   kubectl get pods -l app=api-service

   NAME                          READY   STATUS             RESTARTS
   api-service-7d4f8b6c9-x2k4m   0/1     CrashLoopBackOff   5

2. Checking recent events...
   kubectl describe pod api-service-7d4f8b6c9-x2k4m

   Events:
   - Container exceeded memory limit (OOMKilled)

3. Checking resource limits...
   Current: 512Mi memory limit
   Usage before crash: 498Mi

Diagnosis: The pod is being OOMKilled due to insufficient memory.

Recommended fix:
kubectl set resources deployment/api-service --limits=memory=1Gi

Should I apply this fix?
```

## Skill Reference

### k8s-debug

**Kubernetes Debugging & Troubleshooting**

Capabilities:
- Pod status analysis
- Log investigation
- Event correlation
- Resource diagnostics
- Network debugging

Example prompts:
- "Why is the api-service pod crashing?"
- "Debug networking between frontend and backend"
- "Check resource usage in production namespace"

### incident-diagnose

**Incident Response Workflow**

Capabilities:
- Impact assessment
- Timeline reconstruction
- Root cause analysis
- Remediation tracking
- Post-mortem creation

Example prompts:
- "We have an outage in production"
- "High error rates on the API"
- "Help me investigate this alert"

### prometheus-query

**Prometheus Metrics Analysis**

Capabilities:
- PromQL query building
- Metric exploration
- Alert rule creation
- Dashboard suggestions

Example prompts:
- "What's the p99 latency for the API?"
- "Show me error rates over the last hour"
- "Create an alert for high CPU usage"

### loki-search

**Log Analysis with Loki**

Capabilities:
- LogQL query building
- Pattern detection
- Error aggregation
- Log correlation

Example prompts:
- "Find all errors in the API logs"
- "Show logs from the last deployment"
- "Search for timeout errors"

### argocd-sync

**ArgoCD GitOps Operations**

Capabilities:
- Application sync
- Rollback operations
- Diff analysis
- Health checking

Example prompts:
- "Sync the production application"
- "Rollback to the previous version"
- "What changes are pending deployment?"

## Configuration

Enable skills in your config:

```yaml
skills:
  enabled:
    - k8s-debug
    - incident-diagnose
    - prometheus-query
```

## Skill Format

Skills use the standard SKILL.md format:

```yaml
---
name: k8s-debug
description: "Kubernetes pod debugging, log analysis"
metadata:
  emoji: "🐳"
  requires:
    bins: [kubectl]
    config: ["~/.kube/config"]
  install:
    - id: brew-kubectl
      kind: brew
      package: kubernetes-cli
---

# Kubernetes Debugging

You are an expert Kubernetes troubleshooter...

## Debugging Workflow

1. Check pod status
2. Review events
3. Analyze logs
4. Check resources
5. Diagnose and fix

## Common Issues

### CrashLoopBackOff
...
```

### Skill Metadata

| Field | Description |
|-------|-------------|
| `name` | Unique identifier |
| `description` | Brief description |
| `requires.bins` | Required CLI tools |
| `requires.config` | Required config files |
| `requires.env` | Required environment variables |

## Custom Skills

Create your own skills in your workspace:

```bash
mkdir -p ~/.opspilot/workspace/skills
```

```markdown
# ~/.opspilot/workspace/skills/my-api.md
---
name: my-api
description: "Our internal API operations"
metadata:
  requires:
    env: [MY_API_TOKEN]
---

# My API Operations

You help with our internal API.

## Authentication

Use the MY_API_TOKEN environment variable for auth.

## Common Operations

### Get User
curl -H "Authorization: Bearer $MY_API_TOKEN" \
  https://api.example.com/users/{id}

### Create Deployment
curl -X POST ...
```

## Skill Detection

OpsPilot automatically detects when to use skills based on:

1. **Keywords** - "debug", "incident", "prometheus"
2. **Context** - Kubernetes resources, metrics, logs
3. **Intent** - Troubleshooting, monitoring, deployment

## Best Practices

### 1. Start Broad, Get Specific

```
You: The API is slow
OpsPilot: I'll investigate. First, let me check...

You: Focus on the database queries
OpsPilot: Looking at database-related metrics...
```

### 2. Provide Context

```
You: Debug the api-service in production namespace
```

Better than:
```
You: Debug the pod
```

### 3. Confirm Before Changes

OpsPilot asks for confirmation before making changes:

```
OpsPilot: I recommend scaling up the deployment:
kubectl scale deployment/api-service --replicas=5

Should I apply this change?

You: Yes, do it
```

## Troubleshooting

### Skill not recognized

- Check skill is in enabled list
- Verify required tools are installed
- Check config file syntax

### Wrong skill being used

Be more specific in your prompt:
```
You: Using Prometheus, show me the error rate
```

### Missing tool error

Install the required tool:
```bash
# For k8s-debug
brew install kubectl

# For prometheus-query
# Ensure Prometheus is accessible
```
