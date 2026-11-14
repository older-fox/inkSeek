import { lookup } from 'node:dns/promises';
import { isHostAllowed } from './web-allowlist.js';

/** SSRF url guard: http(s) only, standard ports, no credentials, hash dropped. */
export function normalizePublicUrl(value: string): URL {
  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    throw new Error('不是有效的网页地址');
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('只允许 http/https 地址');
  }
  if (url.username || url.password) {
    throw new Error('网页地址不能带登录信息');
  }
  if (url.port && url.port !== '80' && url.port !== '443') {
    throw new Error('只允许标准网页端口');
  }
  url.hash = '';
  return url;
}

/**
 * Resolves the hostname and rejects localhost or any record pointing at a
 * private address. Hosts in the operator allowlist skip the check, which is
 * how split-horizon sites that only resolve internally stay readable.
 */
export async function assertPublicHost(
  url: URL,
  allowedHosts: readonly string[] = [],
): Promise<void> {
  const host = url.hostname.trim().toLowerCase();
  if (isHostAllowed(host, allowedHosts)) {
    return;
  }
  if (!host || host === 'localhost' || host.endsWith('.localhost')) {
    throw new Error('不能读取本地地址');
  }
  const addresses = await lookup(host, { all: true, verbatim: true });
  if (addresses.length === 0) {
    throw new Error('无法解析网页地址');
  }
  if (addresses.some((entry) => isPrivateAddress(entry.address))) {
    throw new Error('不能读取内网地址（如确需访问，请在设置 → 网页访问 里加入该域名）');
  }
}

/** True for loopback, RFC1918/link-local/CGNAT ranges and anything malformed. */
function isPrivateAddress(address: string): boolean {
  const value = address.trim().toLowerCase();
  if (value.includes(':')) {
    if (value.includes('::ffff:')) {
      return true;
    }
    if (value === '::1' || value === '::') {
      return true;
    }
    if (/^f[cd]/.test(value) || /^fe[89ab]/.test(value)) {
      return true;
    }
    return false;
  }
  const parts = value.split('.').map(Number);
  if (
    parts.length !== 4 ||
    parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)
  ) {
    return true;
  }
  const [a = 0, b = 0] = parts;
  if (a === 0 || a === 10 || a === 127 || a >= 224) {
    return true;
  }
  if (a === 169 && b === 254) {
    return true;
  }
  if (a === 172 && b >= 16 && b <= 31) {
    return true;
  }
  if (a === 192 && b === 168) {
    return true;
  }
  if (a === 100 && b >= 64 && b <= 127) {
    return true;
  }
  return a === 198 && (b === 18 || b === 19);
}
