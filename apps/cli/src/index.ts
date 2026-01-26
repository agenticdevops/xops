#!/usr/bin/env bun
/**
 * OpsPilot CLI - Your 24/7 DevOps Copilot
 */

import { Command } from 'commander';
import pc from 'picocolors';
import { configExists, loadConfig, DEFAULT_CONFIG_PATH } from '../../../packages/core/src';
import { runWizard } from '../../../packages/wizard/src';

const VERSION = '0.1.0';

const program = new Command();

program
  .name('opspilot')
  .description('Your 24/7 DevOps Copilot that actually does the work')
  .version(VERSION);

// Setup command
program
  .command('setup')
  .description('Interactive setup wizard')
  .option('-q, --quickstart', 'Use quickstart mode with sensible defaults')
  .option('--advanced', 'Use advanced mode with full control')
  .option('--reset', 'Reset existing configuration')
  .action(async (options) => {
    const mode = options.advanced ? 'advanced' : 'quickstart';
    await runWizard({
      mode,
      reset: options.reset,
    });
  });

// Status command
program
  .command('status')
  .description('Show OpsPilot status')
  .action(async () => {
    console.log(pc.cyan('\n📊 OpsPilot Status\n'));

    if (!configExists()) {
      console.log(pc.red('Not configured.'), 'Run', pc.cyan('opspilot setup'), 'first.\n');
      return;
    }

    try {
      const config = await loadConfig();
      console.log(pc.green('✓'), 'Configuration loaded');
      console.log(pc.dim('  AI Provider:'), config.ai.provider);
      console.log(pc.dim('  Model:'), config.ai.model);
      console.log(pc.dim('  Memory:'), config.memory?.enabled ? 'enabled' : 'disabled');
      console.log(pc.dim('  Gateway:'), `${config.gateway?.bind}:${config.gateway?.port}`);
      console.log();
    } catch (error) {
      console.log(pc.red('✗'), 'Failed to load config:', (error as Error).message);
    }
  });

// Gateway command
program
  .command('gateway')
  .description('Manage the gateway server')
  .argument('<action>', 'Action: start, stop, restart, logs')
  .option('-f, --foreground', 'Run in foreground (default for start)')
  .action(async (action) => {
    if (action === 'start') {
      console.log(pc.cyan('\n🌐 Starting Gateway\n'));

      if (!configExists()) {
        console.log(pc.red('Not configured.'), 'Run', pc.cyan('opspilot setup'), 'first.\n');
        return;
      }

      try {
        const config = await loadConfig();
        const { GatewayServer } = await import('../../../packages/gateway/src');
        const { MemoryManager } = await import('../../../packages/memory/src');

        // Initialize memory if enabled
        let memoryManager: InstanceType<typeof MemoryManager> | undefined;
        if (config.memory?.enabled) {
          memoryManager = new MemoryManager({
            dbPath: config.memory.store.path,
            embeddingProvider: config.memory.provider === 'auto' ? 'openai' : config.memory.provider,
          });
          await memoryManager.initialize();
          console.log(pc.green('✓'), 'Memory system initialized');
        }

        // Create gateway server
        const gateway = new GatewayServer({
          config,
          onMemorySearch: memoryManager
            ? async (query: string, limit?: number) => {
                const results = await memoryManager!.search(query, { limit: limit ?? 6 });
                return results.map((r) => ({ content: r.content, score: r.score }));
              }
            : undefined,
        });

        // Start server
        await gateway.start();
        console.log(pc.green('✓'), `Gateway running on http://${config.gateway.bind}:${config.gateway.port}`);

        // Start channel adapters
        const adapters: Array<{ stop: () => Promise<void> }> = [];

        // Telegram
        if (config.channels.telegram?.enabled && config.channels.telegram.accounts?.default?.token) {
          try {
            const { TelegramAdapter } = await import('../../../packages/channels/src');
            const telegram = new TelegramAdapter({
              token: config.channels.telegram.accounts.default.token,
              allowFrom: config.channels.telegram.accounts.default.allowFrom,
            });

            await telegram.initialize();
            telegram.onMessage(async (msg) => {
              return gateway.processMessage({
                message: msg.content,
                userId: msg.userId,
                channel: 'telegram',
                username: msg.username,
              });
            });
            await telegram.start();
            adapters.push(telegram);
            console.log(pc.green('✓'), 'Telegram bot connected');
          } catch (error) {
            console.log(pc.yellow('⚠'), 'Telegram failed:', (error as Error).message);
          }
        }

        // Slack
        if (config.channels.slack?.enabled && config.channels.slack.accounts?.default?.appToken) {
          try {
            const { SlackAdapter } = await import('../../../packages/channels/src');
            const slack = new SlackAdapter({
              appToken: config.channels.slack.accounts.default.appToken,
              botToken: config.channels.slack.accounts.default.botToken,
            });

            await slack.initialize();
            slack.onMessage(async (msg) => {
              return gateway.processMessage({
                message: msg.content,
                userId: msg.userId,
                channel: 'slack',
                username: msg.username,
              });
            });
            await slack.start();
            adapters.push(slack);
            console.log(pc.green('✓'), 'Slack bot connected');
          } catch (error) {
            console.log(pc.yellow('⚠'), 'Slack failed:', (error as Error).message);
          }
        }

        console.log(pc.dim('  Press Ctrl+C to stop'));

        // Handle shutdown
        process.on('SIGINT', async () => {
          console.log(pc.dim('\nShutting down...'));
          for (const adapter of adapters) {
            await adapter.stop();
          }
          await gateway.stop();
          if (memoryManager) {
            await memoryManager.close();
          }
          process.exit(0);
        });
      } catch (error) {
        console.log(pc.red('✗'), 'Failed to start gateway:', (error as Error).message);
        process.exit(1);
      }
    } else if (action === 'stop') {
      console.log(pc.cyan('\n🌐 Stopping Gateway\n'));
      console.log(pc.dim('Stop via Ctrl+C in the running terminal, or use systemctl if running as service.'));
    } else if (action === 'status') {
      if (!configExists()) {
        console.log(pc.red('Not configured.'), 'Run', pc.cyan('opspilot setup'), 'first.\n');
        return;
      }
      try {
        const config = await loadConfig();
        const response = await fetch(`http://${config.gateway.bind}:${config.gateway.port}/status`);
        if (response.ok) {
          const status = await response.json();
          console.log(pc.green('✓'), 'Gateway is running');
          console.log(pc.dim('  Uptime:'), Math.floor(status.stats.uptime / 1000) + 's');
          console.log(pc.dim('  Messages:'), status.stats.messagesProcessed);
          console.log(pc.dim('  Conversations:'), status.stats.activeConversations);
        } else {
          console.log(pc.yellow('⚠'), 'Gateway not responding');
        }
      } catch {
        console.log(pc.red('✗'), 'Gateway is not running');
      }
    } else {
      console.log(pc.red('Unknown action:'), action);
      console.log(pc.dim('Available: start, stop, status'));
    }
  });

// Memory command
program
  .command('memory')
  .description('Manage memory and search')
  .argument('<action>', 'Action: search, sync, status, reindex')
  .argument('[query]', 'Search query (for search action)')
  .option('-n, --max-results <n>', 'Maximum results', '6')
  .action(async (action, query, options) => {
    if (action === 'search' && query) {
      console.log(pc.cyan(`\n🔍 Searching memory for: "${query}"\n`));
      // TODO: Implement memory search
      console.log(pc.dim('Memory search coming soon...'));
    } else if (action === 'sync') {
      console.log(pc.cyan('\n🔄 Syncing memory index...\n'));
      // TODO: Implement memory sync
      console.log(pc.dim('Memory sync coming soon...'));
    } else if (action === 'status') {
      console.log(pc.cyan('\n📊 Memory Status\n'));
      // TODO: Implement memory status
      console.log(pc.dim('Memory status coming soon...'));
    } else if (action === 'reindex') {
      console.log(pc.cyan('\n🔄 Reindexing memory...\n'));
      // TODO: Implement memory reindex
      console.log(pc.dim('Memory reindex coming soon...'));
    } else {
      console.log(pc.red('Unknown action:'), action);
      console.log(pc.dim('Available: search, sync, status, reindex'));
    }
  });

// Cron command
program
  .command('cron')
  .description('Manage cron jobs')
  .argument('<action>', 'Action: list, add, remove, run')
  .option('--name <name>', 'Job name')
  .option('--schedule <cron>', 'Cron schedule')
  .option('--message <msg>', 'Job message/prompt')
  .option('--deliver <channel>', 'Delivery channel')
  .action(async (action, options) => {
    console.log(pc.cyan(`\n⏰ Cron ${action}\n`));
    // TODO: Implement cron management
    console.log(pc.dim('Cron management coming soon...'));
  });

// Heartbeat command
program
  .command('heartbeat')
  .description('Manage heartbeat automation')
  .argument('<action>', 'Action: run, status, enable, disable')
  .action(async (action) => {
    console.log(pc.cyan(`\n💓 Heartbeat ${action}\n`));
    // TODO: Implement heartbeat management
    console.log(pc.dim('Heartbeat management coming soon...'));
  });

// Chat command (quick message)
program
  .command('chat')
  .description('Send a quick message to OpsPilot')
  .argument('<message>', 'Message to send')
  .action(async (message) => {
    if (!configExists()) {
      console.log(pc.red('Not configured.'), 'Run', pc.cyan('opspilot setup'), 'first.\n');
      return;
    }

    try {
      const config = await loadConfig();
      const gatewayUrl = `http://${config.gateway.bind}:${config.gateway.port}`;

      // Check if gateway is running
      try {
        await fetch(`${gatewayUrl}/health`);
      } catch {
        console.log(pc.red('Gateway not running.'), 'Run', pc.cyan('opspilot gateway start'), 'first.\n');
        return;
      }

      console.log(pc.cyan('\n💬 OpsPilot\n'));
      process.stdout.write(pc.dim('Thinking... '));

      // Send message to gateway
      const response = await fetch(`${gatewayUrl}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Request failed');
      }

      const data = await response.json();
      process.stdout.write('\r' + ' '.repeat(20) + '\r'); // Clear "Thinking..."
      console.log(data.response);
      console.log();
    } catch (error) {
      console.log(pc.red('✗'), (error as Error).message);
    }
  });

program.parse();
