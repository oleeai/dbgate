// Connection labels ("tags"): free text chips next to a connection, eg. where it runs or its environment ("staging").
// Stored on the connection as one comma separated string: TAGS_<id> in the environment, or the Labels field of the
// connection dialog.

// Environment names get fixed colours; any other label gets a stable colour from its name.
const KNOWN_TAG_COLORS = {
  prod: '#ef4444',
  production: '#ef4444',
  live: '#ef4444',
  staging: '#f59e0b',
  test: '#f59e0b',
  dev: '#10b981',
  development: '#10b981',
  local: '#94a3b8',
};

const OTHER_TAG_COLORS = ['#3b82f6', '#8b5cf6', '#ec4899', '#14b8a6', '#f59e0b', '#6366f1', '#06b6d4', '#84cc16'];

export function parseConnectionTags(value: string | string[] | null | undefined): string[] {
  const list = Array.isArray(value) ? value : (value || '').split(',');
  const seen = new Set<string>();
  const res = [];
  for (const item of list) {
    const tag = String(item ?? '').trim();
    if (tag && !seen.has(tag.toLowerCase())) {
      seen.add(tag.toLowerCase());
      res.push(tag);
    }
  }
  return res;
}

export function getConnectionTags(connection): string[] {
  return parseConnectionTags(connection?.tags);
}

export function getTagColor(tag: string): string {
  const key = (tag || '').trim().toLowerCase();
  if (KNOWN_TAG_COLORS[key]) return KNOWN_TAG_COLORS[key];
  let hash = 0;
  for (let i = 0; i < key.length; i++) hash = (hash * 31 + key.charCodeAt(i)) | 0;
  return OTHER_TAG_COLORS[Math.abs(hash) % OTHER_TAG_COLORS.length];
}
