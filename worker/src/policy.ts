export function parseAllowedAgents(raw?: string): Set<string> {
  const values = (raw || '').split(',').map((value) => value.trim()).filter(Boolean);
  return new Set(values);
}

export function isAllowedAgent(agent: string, raw?: string): boolean {
  return parseAllowedAgents(raw).has(agent);
}

export function validateAgent(agent: string | undefined, raw?: string): string | null {
  if (!agent) return 'agent is required';
  return isAllowedAgent(agent, raw) ? null : 'Unknown or unauthorized agent';
}

export function validateFileKey(file: string | undefined): string | null {
  if (!file) return 'file is required';
  if (file.startsWith('/') || file.includes('..') || file.includes('\\')) {
    return 'Invalid file path';
  }
  return null;
}
