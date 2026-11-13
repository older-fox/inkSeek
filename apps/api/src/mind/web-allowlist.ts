/**
 * Host allowlist for the mind's web tools. The SSRF guard rejects hosts that
 * resolve to private addresses; an entry here is the operator's explicit
 * override for sites that only resolve internally (split-horizon DNS).
 */

const HOST_PATTERN =
  /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)*[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;

/** Accepts a pasted URL or wildcard and returns a bare lowercase hostname, or null. */
export function normalizeAllowedHost(value: string): string | null {
  let host = value.trim().toLowerCase();
  if (!host) {
    return null;
  }
  const scheme = host.indexOf('://');
  if (scheme >= 0) {
    host = host.slice(scheme + 3);
  }
  host = host.replace(/^[^@/]*@/, '');
  host = host.split(/[/?#]/)[0] ?? '';
  host = host.replace(/:\d+$/, '').replace(/^\.+/, '').replace(/^\*\./, '');
  if (!host || !HOST_PATTERN.test(host)) {
    return null;
  }
  return host;
}

/** Stored JSON is trusted loosely: keep valid hostnames, dedupe, preserve order. */
export function normalizeAllowedHosts(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  const seen = new Set<string>();
  const hosts: string[] = [];
  for (const item of value) {
    if (typeof item !== 'string') {
      continue;
    }
    const host = normalizeAllowedHost(item);
    if (!host || seen.has(host)) {
      continue;
    }
    seen.add(host);
    hosts.push(host);
  }
  return hosts;
}

/** Matches the host itself or any subdomain of an allowed entry. */
export function isHostAllowed(hostname: string, allowed: readonly string[]): boolean {
  const host = hostname.trim().toLowerCase();
  if (!host) {
    return false;
  }
  return allowed.some((entry) => host === entry || host.endsWith(`.${entry}`));
}
