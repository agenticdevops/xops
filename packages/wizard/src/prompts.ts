/**
 * Clack prompt wrappers for consistent styling
 */

import * as p from '@clack/prompts';
import * as pc from 'picocolors';

/**
 * Show intro banner
 */
export function showIntro(): void {
  console.log();
  p.intro(pc.bgCyan(pc.black(' xops Setup ')));
}

/**
 * Show outro message
 */
export function showOutro(message: string): void {
  p.outro(pc.green(message));
}

/**
 * Show note
 */
export function showNote(message: string, title?: string): void {
  p.note(message, title);
}

/**
 * Show spinner
 */
export function showSpinner(): ReturnType<typeof p.spinner> {
  return p.spinner();
}

/**
 * Select from options
 */
export async function selectOption<T extends string>(options: {
  message: string;
  options: Array<{ value: T; label: string; hint?: string }>;
  initialValue?: T;
}): Promise<T | symbol> {
  return p.select(options as Parameters<typeof p.select>[0]);
}

/**
 * Multi-select options
 */
export async function multiSelect<T extends string>(options: {
  message: string;
  options: Array<{ value: T; label: string; hint?: string }>;
  initialValues?: T[];
  required?: boolean;
}): Promise<T[] | symbol> {
  return p.multiselect(options as Parameters<typeof p.multiselect>[0]);
}

/**
 * Text input
 */
export async function textInput(options: {
  message: string;
  placeholder?: string;
  defaultValue?: string;
  validate?: (value: string) => string | Error | undefined;
}): Promise<string | symbol> {
  return p.text(options as Parameters<typeof p.text>[0]);
}

/**
 * Password input
 */
export async function passwordInput(options: {
  message: string;
  validate?: (value: string) => string | Error | undefined;
}): Promise<string | symbol> {
  return p.password(options as Parameters<typeof p.password>[0]);
}

/**
 * Confirm prompt
 */
export async function confirm(options: {
  message: string;
  initialValue?: boolean;
}): Promise<boolean | symbol> {
  return p.confirm(options);
}

/**
 * Check if user cancelled
 */
export function isCancel(value: unknown): value is symbol {
  return p.isCancel(value);
}

/**
 * Handle cancellation
 */
export function handleCancel(): never {
  p.cancel('Setup cancelled.');
  process.exit(0);
}

/**
 * Show success message
 */
export function success(message: string): void {
  console.log(pc.green('✓'), message);
}

/**
 * Show warning message
 */
export function warn(message: string): void {
  console.log(pc.yellow('⚠'), message);
}

/**
 * Show error message
 */
export function error(message: string): void {
  console.log(pc.red('✗'), message);
}

/**
 * Show info message
 */
export function info(message: string): void {
  console.log(pc.blue('ℹ'), message);
}
