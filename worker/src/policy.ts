export const DEFAULT_KNOWN_AGENTS = [
  'cleo',
  'atlas',
  'dev',
  'lance',
  'bigfoot',
  'lil-beaver',
  'locdev',
  'auditor',
  'curator',
  'pr-checker',
  'ansem',
  'megenie',
] as const;

export function parseAllowedAgents(raw?: string): Set<string> {
  const values = (raw || '').split(',').map((value) => value.trim()).filter(Boolean);
  return new Set(values.length > 0 ? values : DEFAULT_KNOWN_AGENTS);
}

export function isAllowedAgent(agent: string, raw?: string): boolean {
  return parseAllowedAgents(raw).has(agent);
}

export function validateAgent(agent: string | undefined, raw?: string): string | null {
  if (!agent) return 'agent is required';
  return isAllowedAgent(agent, raw) ? null : 'Unknown or unauthorized agent';
}
