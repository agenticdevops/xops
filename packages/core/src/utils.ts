/**
 * Utility functions
 */

import { execSync, spawn, type SpawnOptions } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

/**
 * Detect installed tools
 */
export interface DetectedTool {
  name: string;
  path: string;
  version?: string;
}

export async function detectTools(): Promise<DetectedTool[]> {
  const tools = ['kubectl', 'aws', 'docker', 'gh', 'terraform', 'helm', 'gcloud', 'az'];
  const detected: DetectedTool[] = [];

  for (const tool of tools) {
    try {
      const toolPath = execSync(`which ${tool}`, { encoding: 'utf-8' }).trim();
      if (toolPath) {
        let version: string | undefined;
        try {
          if (tool === 'kubectl') {
            version = execSync(`${tool} version --client -o json 2>/dev/null`, { encoding: 'utf-8' });
            const parsed = JSON.parse(version);
            version = parsed.clientVersion?.gitVersion || parsed.kustomizeVersion;
          } else if (tool === 'docker') {
            version = execSync(`${tool} --version`, { encoding: 'utf-8' }).trim();
          } else if (tool === 'aws') {
            version = execSync(`${tool} --version`, { encoding: 'utf-8' }).trim();
          } else if (tool === 'gh') {
            version = execSync(`${tool} --version`, { encoding: 'utf-8' }).split('\n')[0].trim();
          } else if (tool === 'terraform') {
            version = execSync(`${tool} version`, { encoding: 'utf-8' }).split('\n')[0].trim();
          } else if (tool === 'helm') {
            version = execSync(`${tool} version --short`, { encoding: 'utf-8' }).trim();
          }
        } catch {
          // Version detection failed, continue without version
        }

        detected.push({ name: tool, path: toolPath, version });
      }
    } catch {
      // Tool not found
    }
  }

  return detected;
}

/**
 * Execute shell command with streaming output
 */
export interface ExecResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

export async function execCommand(
  command: string,
  args: string[],
  options?: SpawnOptions,
): Promise<ExecResult> {
  return new Promise((resolve, reject) => {
    const proc = spawn(command, args, {
      shell: true,
      ...options,
    });

    let stdout = '';
    let stderr = '';

    proc.stdout?.on('data', (data) => {
      stdout += data.toString();
    });

    proc.stderr?.on('data', (data) => {
      stderr += data.toString();
    });

    proc.on('close', (code) => {
      resolve({
        stdout,
        stderr,
        exitCode: code ?? 0,
      });
    });

    proc.on('error', (err) => {
      reject(err);
    });
  });
}

/**
 * Ensure directory exists
 */
export function ensureDir(dir: string): void {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

/**
 * Get platform info
 */
export function getPlatform(): 'darwin' | 'linux' | 'windows' {
  const platform = os.platform();
  if (platform === 'darwin') return 'darwin';
  if (platform === 'win32') return 'windows';
  return 'linux';
}

/**
 * Parse duration string (e.g., "30m", "1h", "2d")
 */
export function parseDuration(duration: string): number {
  const match = duration.match(/^(\d+)([smhd])$/);
  if (!match) {
    throw new Error(`Invalid duration: ${duration}`);
  }

  const value = parseInt(match[1], 10);
  const unit = match[2];

  switch (unit) {
    case 's': return value * 1000;
    case 'm': return value * 60 * 1000;
    case 'h': return value * 60 * 60 * 1000;
    case 'd': return value * 24 * 60 * 60 * 1000;
    default: throw new Error(`Invalid duration unit: ${unit}`);
  }
}

/**
 * Truncate text to max length with ellipsis
 */
export function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength - 3) + '...';
}

/**
 * Format bytes to human readable
 */
export function formatBytes(bytes: number): string {
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let unitIndex = 0;
  let value = bytes;

  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex++;
  }

  return `${value.toFixed(1)} ${units[unitIndex]}`;
}

/**
 * Sleep for specified milliseconds
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
