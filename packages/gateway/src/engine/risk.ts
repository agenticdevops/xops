/**
 * Command risk classification. Taxonomy data ported from xopsbot
 * (safety/risk-classifications.json, 186 commands across 8 tools).
 * Fail-closed: unknown tool → CRITICAL; unknown command → tool default_risk.
 */
import taxonomy from './risk-classifications.json';

export type RiskTier = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

interface ToolTaxonomy {
  default_risk: RiskTier;
  commands: Record<string, RiskTier>;
}

const TOOLS = (taxonomy as { tools: Record<string, ToolTaxonomy> }).tools;

export interface Classification {
  tier: RiskTier;
  matched: string | null; // taxonomy key that matched, null if default applied
}

/**
 * Extract command words, skipping leading flags. Heuristic: a leading flag
 * without '=' consumes the following arg as its value (covers -n <ns>,
 * --context <ctx>); '=' forms consume only themselves.
 */
function commandWords(args: string[]): string[] {
  let i = 0;
  while (i < args.length && args[i].startsWith('-')) {
    i += args[i].includes('=') ? 1 : 2;
  }
  return args.slice(i).filter((a) => !a.startsWith('-'));
}

export function classify(tool: string, args: string[]): Classification {
  const t = TOOLS[tool];
  if (!t) return { tier: 'CRITICAL', matched: null };

  const words = commandWords(args);
  // longest key first: "volume rm" must win over "rm"
  for (const len of [3, 2, 1]) {
    if (words.length < len) continue;
    const key = words.slice(0, len).join(' ');
    const tier = t.commands[key];
    if (tier) return { tier, matched: key };
  }
  return { tier: t.default_risk, matched: null };
}
