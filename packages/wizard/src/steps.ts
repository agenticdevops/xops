/**
 * Individual wizard steps
 */

import { execSync } from 'child_process';
import type { WizardState, DetectedTool } from './types';
import * as prompts from './prompts';

/**
 * Step: Select wizard mode
 */
export async function selectMode(): Promise<'quickstart' | 'advanced'> {
  const mode = await prompts.selectOption({
    message: 'Select setup mode',
    options: [
      {
        value: 'quickstart',
        label: 'Quickstart (Recommended)',
        hint: '5 minutes, sensible defaults',
      },
      {
        value: 'advanced',
        label: 'Advanced',
        hint: 'Full control over all settings',
      },
    ],
    initialValue: 'quickstart',
  });

  if (prompts.isCancel(mode)) prompts.handleCancel();
  return mode as 'quickstart' | 'advanced';
}

/**
 * Step: Configure AI provider
 */
export async function configureAI(state: WizardState): Promise<void> {
  // Check if Claude Code CLI is available
  let claudeCodeAvailable = false;
  try {
    execSync('which claude', { stdio: 'ignore' });
    claudeCodeAvailable = true;
  } catch {
    // Claude Code CLI not installed
  }

  // Select provider
  const providerOptions = [
    ...(claudeCodeAvailable
      ? [{ value: 'claude-code' as const, label: 'Claude Code (Recommended)', hint: 'Uses your existing subscription - no API key needed' }]
      : []),
    { value: 'anthropic' as const, label: 'Anthropic API', hint: 'API key required, pay-per-token' },
    { value: 'openai' as const, label: 'OpenAI GPT', hint: 'GPT-4o, GPT-4' },
    { value: 'bedrock' as const, label: 'AWS Bedrock', hint: 'Claude via AWS' },
    { value: 'gemini' as const, label: 'Google Gemini', hint: 'Gemini Pro' },
    { value: 'ollama' as const, label: 'Ollama (Local)', hint: 'Run models locally, free' },
    { value: 'openrouter' as const, label: 'OpenRouter', hint: 'Multi-provider gateway' },
  ];

  const provider = await prompts.selectOption({
    message: 'Select AI Provider',
    options: providerOptions,
    initialValue: claudeCodeAvailable ? 'claude-code' : 'anthropic',
  });

  if (prompts.isCancel(provider)) prompts.handleCancel();
  state.aiProvider = provider as typeof state.aiProvider;

  // Set default model based on provider
  const defaultModels: Record<string, string> = {
    'claude-code': 'sonnet',
    anthropic: 'claude-sonnet-4-20250514',
    openai: 'gpt-4o',
    bedrock: 'anthropic.claude-3-5-sonnet-20241022-v2:0',
    gemini: 'gemini-2.0-flash-exp',
    ollama: 'llama3.2',
    openrouter: 'anthropic/claude-3.5-sonnet',
  };
  state.aiModel = defaultModels[state.aiProvider] ?? 'claude-sonnet-4-20250514';

  // Claude Code and Ollama don't need API keys
  if (state.aiProvider === 'claude-code') {
    prompts.success('Using your Claude subscription via Claude Code CLI');
    state.aiApiKey = undefined;
  } else if (state.aiProvider === 'ollama') {
    state.aiApiKey = undefined;
  } else {
    const envVars: Record<string, string> = {
      anthropic: 'ANTHROPIC_API_KEY',
      openai: 'OPENAI_API_KEY',
      bedrock: 'AWS_ACCESS_KEY_ID',
      gemini: 'GEMINI_API_KEY',
      openrouter: 'OPENROUTER_API_KEY',
    };

    const envVar = envVars[state.aiProvider];
    const existingKey = envVar ? process.env[envVar] : undefined;

    if (existingKey) {
      prompts.success(`Found ${envVar} in environment`);
      state.aiApiKey = `\${${envVar}}`;
    } else {
      const apiKey = await prompts.passwordInput({
        message: `Enter your ${state.aiProvider} API key`,
        validate: (value) => {
          if (!value || value.length < 10) return 'Please enter a valid API key';
        },
      });

      if (prompts.isCancel(apiKey)) prompts.handleCancel();
      state.aiApiKey = apiKey as string;
    }
  }
}

/**
 * Step: Detect installed tools
 */
export async function detectTools(): Promise<DetectedTool[]> {
  const spinner = prompts.showSpinner();
  spinner.start('Detecting installed tools...');

  const tools = ['kubectl', 'aws', 'docker', 'gh', 'terraform', 'helm', 'gcloud', 'az'];
  const detected: DetectedTool[] = [];

  for (const tool of tools) {
    try {
      const toolPath = execSync(`which ${tool} 2>/dev/null`, { encoding: 'utf-8' }).trim();
      if (toolPath) {
        let version: string | undefined;
        try {
          if (tool === 'kubectl') {
            const out = execSync(`${tool} version --client -o json 2>/dev/null`, { encoding: 'utf-8' });
            const parsed = JSON.parse(out);
            version = parsed.clientVersion?.gitVersion;
          } else if (tool === 'docker') {
            version = execSync(`${tool} --version 2>/dev/null`, { encoding: 'utf-8' }).trim().split(' ')[2];
          } else if (tool === 'gh') {
            version = execSync(`${tool} --version 2>/dev/null`, { encoding: 'utf-8' }).split('\n')[0].split(' ')[2];
          }
        } catch {
          // Version detection failed
        }
        detected.push({ name: tool, path: toolPath, version });
      }
    } catch {
      // Tool not found
    }
  }

  spinner.stop(`Found ${detected.length} tools`);
  return detected;
}

/**
 * Step: Configure tools
 */
export async function configureTools(state: WizardState): Promise<void> {
  state.detectedTools = await detectTools();

  if (state.detectedTools.length === 0) {
    prompts.warn('No DevOps tools detected. You can add them later.');
    state.enabledTools = [];
    return;
  }

  // In quickstart, enable all detected tools
  if (state.mode === 'quickstart') {
    state.enabledTools = state.detectedTools.map((t) => t.name);
    for (const tool of state.detectedTools) {
      prompts.success(`${tool.name} ${tool.version ? `(${tool.version})` : ''}`);
    }
    return;
  }

  // In advanced mode, let user select
  const selected = await prompts.multiSelect({
    message: 'Select tools to enable',
    options: state.detectedTools.map((t) => ({
      value: t.name,
      label: t.name,
      hint: t.version,
    })),
    initialValues: state.detectedTools.map((t) => t.name),
  });

  if (prompts.isCancel(selected)) prompts.handleCancel();
  state.enabledTools = selected as string[];
}

/**
 * Step: Configure channels
 */
export async function configureChannels(state: WizardState): Promise<void> {
  // In quickstart, just ask about Telegram
  if (state.mode === 'quickstart') {
    const enableTelegram = await prompts.confirm({
      message: 'Enable Telegram bot?',
      initialValue: true,
    });

    if (prompts.isCancel(enableTelegram)) prompts.handleCancel();
    state.telegramEnabled = enableTelegram as boolean;

    if (state.telegramEnabled) {
      const token = await prompts.passwordInput({
        message: 'Enter Telegram bot token (from @BotFather)',
        validate: (value) => {
          if (!value || !value.includes(':')) return 'Invalid token format';
        },
      });

      if (prompts.isCancel(token)) prompts.handleCancel();
      state.telegramToken = token as string;

      const allowFrom = await prompts.textInput({
        message: 'Your Telegram username (for access control)',
        placeholder: '@yourusername',
      });

      if (prompts.isCancel(allowFrom)) prompts.handleCancel();
      state.telegramAllowFrom = [(allowFrom as string).replace(/^@/, '')];
    }

    // Web always enabled in quickstart
    state.webEnabled = true;
    state.webPort = 8080;
    state.slackEnabled = false;
    return;
  }

  // Advanced mode: configure each channel
  const channels = await prompts.multiSelect({
    message: 'Select channels to enable',
    options: [
      { value: 'telegram', label: 'Telegram Bot' },
      { value: 'slack', label: 'Slack' },
      { value: 'web', label: 'Web Chat (always recommended)' },
    ],
    initialValues: ['telegram', 'web'],
  });

  if (prompts.isCancel(channels)) prompts.handleCancel();

  state.telegramEnabled = (channels as string[]).includes('telegram');
  state.slackEnabled = (channels as string[]).includes('slack');
  state.webEnabled = (channels as string[]).includes('web') || true; // Always enable web

  // Configure Telegram
  if (state.telegramEnabled) {
    const token = await prompts.passwordInput({
      message: 'Enter Telegram bot token',
    });
    if (prompts.isCancel(token)) prompts.handleCancel();
    state.telegramToken = token as string;
  }

  // Configure Slack
  if (state.slackEnabled) {
    const appToken = await prompts.passwordInput({
      message: 'Enter Slack App Token (xapp-...)',
    });
    if (prompts.isCancel(appToken)) prompts.handleCancel();
    state.slackAppToken = appToken as string;

    const botToken = await prompts.passwordInput({
      message: 'Enter Slack Bot Token (xoxb-...)',
    });
    if (prompts.isCancel(botToken)) prompts.handleCancel();
    state.slackBotToken = botToken as string;
  }

  // Configure Web
  if (state.webEnabled) {
    const port = await prompts.textInput({
      message: 'Web chat port',
      defaultValue: '8080',
    });
    if (prompts.isCancel(port)) prompts.handleCancel();
    state.webPort = parseInt(port as string, 10) || 8080;
  }
}

/**
 * Step: Configure skills
 */
export async function configureSkills(state: WizardState): Promise<void> {
  const availableSkills = [
    { value: 'k8s-debug', label: 'Kubernetes Debugging', hint: 'Pod troubleshooting' },
    { value: 'incident-diagnose', label: 'Incident Response', hint: 'RCA workflow' },
    { value: 'prometheus-query', label: 'Prometheus Queries', hint: 'Metrics analysis' },
    { value: 'loki-search', label: 'Loki Log Search', hint: 'Log analysis' },
    { value: 'argocd-sync', label: 'ArgoCD Sync', hint: 'GitOps deployments' },
  ];

  if (state.mode === 'quickstart') {
    // Enable relevant skills based on detected tools
    const defaultSkills: string[] = [];
    if (state.enabledTools.includes('kubectl')) {
      defaultSkills.push('k8s-debug', 'incident-diagnose');
    }
    state.enabledSkills = defaultSkills.length > 0 ? defaultSkills : ['incident-diagnose'];
    return;
  }

  const selected = await prompts.multiSelect({
    message: 'Select skills to enable',
    options: availableSkills,
    initialValues: ['k8s-debug', 'incident-diagnose'],
  });

  if (prompts.isCancel(selected)) prompts.handleCancel();
  state.enabledSkills = selected as string[];
}

/**
 * Step: Configure automation
 */
export async function configureAutomation(state: WizardState): Promise<void> {
  if (state.mode === 'quickstart') {
    state.heartbeatEnabled = false;
    state.heartbeatInterval = '30m';
    return;
  }

  const enableHeartbeat = await prompts.confirm({
    message: 'Enable heartbeat automation? (periodic checks)',
    initialValue: false,
  });

  if (prompts.isCancel(enableHeartbeat)) prompts.handleCancel();
  state.heartbeatEnabled = enableHeartbeat as boolean;

  if (state.heartbeatEnabled) {
    const interval = await prompts.selectOption({
      message: 'Heartbeat interval',
      options: [
        { value: '15m', label: 'Every 15 minutes' },
        { value: '30m', label: 'Every 30 minutes (Recommended)' },
        { value: '1h', label: 'Every hour' },
      ],
      initialValue: '30m',
    });
    if (prompts.isCancel(interval)) prompts.handleCancel();
    state.heartbeatInterval = interval as string;
  }
}

/**
 * Step: Configure tunnel
 */
export async function configureTunnel(state: WizardState): Promise<void> {
  if (state.mode === 'quickstart') {
    // Check if Tailscale is available
    try {
      execSync('which tailscale', { stdio: 'ignore' });
      state.tunnelProvider = 'tailscale';
      prompts.success('Tailscale detected - will use for secure remote access');
    } catch {
      state.tunnelProvider = 'none';
      prompts.info('No tunnel configured - local access only');
    }
    return;
  }

  const tunnel = await prompts.selectOption({
    message: 'Configure tunnel for remote access?',
    options: [
      { value: 'tailscale', label: 'Tailscale (Recommended)', hint: 'Zero-config, secure' },
      { value: 'ngrok', label: 'ngrok', hint: 'Quick public URL' },
      { value: 'cloudflare', label: 'Cloudflare Tunnel', hint: 'Enterprise-grade' },
      { value: 'none', label: 'None', hint: 'Local only' },
    ],
    initialValue: 'tailscale',
  });

  if (prompts.isCancel(tunnel)) prompts.handleCancel();
  state.tunnelProvider = tunnel as typeof state.tunnelProvider;
}
