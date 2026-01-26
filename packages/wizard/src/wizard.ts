/**
 * Main wizard orchestration
 */

import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'yaml';
import type { WizardOptions, WizardState } from './types';
import * as prompts from './prompts';
import * as steps from './steps';

const DEFAULT_CONFIG_DIR = path.join(process.env.HOME || '~', '.opspilot');
const DEFAULT_CONFIG_PATH = path.join(DEFAULT_CONFIG_DIR, 'config.yaml');
const DEFAULT_WORKSPACE_PATH = path.join(DEFAULT_CONFIG_DIR, 'workspace');
const DEFAULT_MEMORY_PATH = path.join(DEFAULT_CONFIG_DIR, 'memory.db');

/**
 * Run the setup wizard
 */
export async function runWizard(options: WizardOptions): Promise<void> {
  prompts.showIntro();

  // Check existing config
  if (fs.existsSync(DEFAULT_CONFIG_PATH) && !options.reset) {
    const overwrite = await prompts.confirm({
      message: 'Configuration exists. Overwrite?',
      initialValue: false,
    });

    if (prompts.isCancel(overwrite)) prompts.handleCancel();
    if (!overwrite) {
      prompts.showOutro('Setup cancelled. Existing config preserved.');
      return;
    }
  }

  // Initialize state
  const state: WizardState = {
    mode: options.mode,
    aiProvider: 'anthropic',
    aiModel: 'claude-sonnet-4-20250514',
    aiApiKey: '',
    telegramEnabled: false,
    slackEnabled: false,
    webEnabled: true,
    webPort: 8080,
    detectedTools: [],
    enabledTools: [],
    mcpServers: [],
    enabledSkills: [],
    memoryEnabled: true,
    memoryProvider: 'auto',
    heartbeatEnabled: false,
    heartbeatInterval: '30m',
    gatewayBind: '127.0.0.1',
    gatewayPort: 18789,
    tunnelProvider: 'none',
  };

  // Run steps
  console.log();
  prompts.info('Step 1: AI Provider');
  await steps.configureAI(state);

  console.log();
  prompts.info('Step 2: Tools');
  await steps.configureTools(state);

  console.log();
  prompts.info('Step 3: Channels');
  await steps.configureChannels(state);

  console.log();
  prompts.info('Step 4: Skills');
  await steps.configureSkills(state);

  if (state.mode === 'advanced') {
    console.log();
    prompts.info('Step 5: Automation');
    await steps.configureAutomation(state);

    console.log();
    prompts.info('Step 6: Remote Access');
    await steps.configureTunnel(state);
  } else {
    await steps.configureAutomation(state);
    await steps.configureTunnel(state);
  }

  // Generate config
  const config = generateConfig(state);

  // Save config
  const spinner = prompts.showSpinner();
  spinner.start('Saving configuration...');

  try {
    // Create directories
    fs.mkdirSync(DEFAULT_CONFIG_DIR, { recursive: true });
    fs.mkdirSync(DEFAULT_WORKSPACE_PATH, { recursive: true });
    fs.mkdirSync(path.join(DEFAULT_WORKSPACE_PATH, 'memory'), { recursive: true });

    // Write config
    fs.writeFileSync(DEFAULT_CONFIG_PATH, yaml.stringify(config));

    // Create initial MEMORY.md
    const memoryPath = path.join(DEFAULT_WORKSPACE_PATH, 'MEMORY.md');
    if (!fs.existsSync(memoryPath)) {
      fs.writeFileSync(
        memoryPath,
        `# OpsPilot Memory

This file stores important information that OpsPilot should remember.

## Important Notes

- Add notes here that you want OpsPilot to remember across sessions
- Include solutions to problems, preferences, and context about your infrastructure

## Runbooks

- Document common procedures here

## Contacts

- List important contacts and escalation paths
`,
      );
    }

    // Create HEARTBEAT.md if enabled
    if (state.heartbeatEnabled) {
      const heartbeatPath = path.join(DEFAULT_WORKSPACE_PATH, 'HEARTBEAT.md');
      fs.writeFileSync(
        heartbeatPath,
        `# OpsPilot Heartbeat Checklist

Run these checks every ${state.heartbeatInterval}.

## Priority Checks

- [ ] Check for any critical alerts
- [ ] Review any failed deployments
- [ ] Check system resource utilization

## Response Format

If everything is normal, respond with: HEARTBEAT_OK

If action is needed, explain what you found and recommend next steps.
`,
      );
    }

    spinner.stop('Configuration saved');
  } catch (error) {
    spinner.stop('Failed to save configuration');
    prompts.error((error as Error).message);
    process.exit(1);
  }

  // Show summary
  console.log();
  prompts.showNote(
    `Config: ${DEFAULT_CONFIG_PATH}
Workspace: ${DEFAULT_WORKSPACE_PATH}

AI: ${state.aiProvider} (${state.aiModel})
Channels: ${[
      state.telegramEnabled && 'Telegram',
      state.slackEnabled && 'Slack',
      state.webEnabled && 'Web',
    ]
      .filter(Boolean)
      .join(', ')}
Tools: ${state.enabledTools.length} detected
Skills: ${state.enabledSkills.join(', ') || 'none'}`,
    'Setup Complete',
  );

  // Next steps
  console.log();
  prompts.info('Next steps:');
  console.log('  1. Start the gateway:', '  opspilot gateway start');
  console.log('  2. Check status:', '      opspilot status');
  if (state.telegramEnabled) {
    console.log('  3. Message your bot on Telegram');
  }

  prompts.showOutro('OpsPilot is ready! 🚀');
}

/**
 * Generate config object from wizard state
 */
function generateConfig(state: WizardState): Record<string, unknown> {
  const config: Record<string, unknown> = {
    version: '1',
    meta: {
      lastUpdated: new Date().toISOString(),
      wizardVersion: '0.1.0',
    },
    ai: {
      provider: state.aiProvider,
      model: state.aiModel,
      apiKey: state.aiApiKey,
    },
    channels: {
      telegram: state.telegramEnabled
        ? {
            enabled: true,
            accounts: {
              default: {
                token: state.telegramToken,
                allowFrom: state.telegramAllowFrom,
              },
            },
          }
        : { enabled: false },
      slack: state.slackEnabled
        ? {
            enabled: true,
            accounts: {
              default: {
                appToken: state.slackAppToken,
                botToken: state.slackBotToken,
              },
            },
          }
        : { enabled: false },
      web: {
        enabled: state.webEnabled,
        port: state.webPort,
      },
    },
    tools: {
      builtin: ['shell', 'http', 'filesystem'],
      detected: Object.fromEntries(
        state.detectedTools
          .filter((t) => state.enabledTools.includes(t.name))
          .map((t) => [t.name, { enabled: true, path: t.path }]),
      ),
    },
    skills: {
      enabled: state.enabledSkills,
    },
    memory: {
      enabled: state.memoryEnabled,
      provider: state.memoryProvider,
      store: {
        driver: 'sqlite',
        path: DEFAULT_MEMORY_PATH,
      },
      chunking: {
        tokens: 400,
        overlap: 80,
      },
      search: {
        maxResults: 6,
        minScore: 0.35,
        hybrid: {
          enabled: true,
          vectorWeight: 0.7,
          textWeight: 0.3,
        },
      },
    },
    automation: {
      heartbeat: {
        enabled: state.heartbeatEnabled,
        every: state.heartbeatInterval,
        checklist: path.join(DEFAULT_WORKSPACE_PATH, 'HEARTBEAT.md'),
      },
    },
    gateway: {
      bind: state.gatewayBind,
      port: state.gatewayPort,
      tunnel: {
        provider: state.tunnelProvider,
      },
    },
    agent: {
      name: 'OpsPilot',
      workspace: DEFAULT_WORKSPACE_PATH,
    },
  };

  return config;
}
