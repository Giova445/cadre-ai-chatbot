// SSRF defenses for the crawl front-end. We fetch attacker-influenceable URLs
// (a pasted sitemap and every <loc> in it), so every outbound target must be
// vetted: https-only, no private/loopback/link-local hosts, no cloud metadata
// IP, and — to defeat DNS-rebinding — the resolved addresses are re-checked at
// fetch time, not just the literal.
//
// The pure predicates (isPrivateIp, structural URL checks) are unit-tested with
// no network; assertHostResolvesPublic does the async DNS lookup.

export class SsrfError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SsrfError";
  }
}

// The cloud metadata endpoint — the canonical SSRF target. Explicitly blocked
// even though it also falls inside link-local (169.254/16) below.
const METADATA_IPV4 = "169.254.169.254";

/** IPv4 dotted-quad → 32-bit unsigned int, or null when not a valid IPv4. */
function ipv4ToInt(ip: string): number | null {
  const parts = ip.split(".");
  if (parts.length !== 4) return null;
  let value = 0;
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part)) return null;
    const n = Number(part);
    if (n > 255) return null;
    value = value * 256 + n;
  }
  return value >>> 0;
}

function inV4Range(value: number, cidr: string): boolean {
  const [base, bitsRaw] = cidr.split("/");
  const baseInt = ipv4ToInt(base);
  if (baseInt === null) return false;
  const bits = Number(bitsRaw);
  const mask = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0;
  return (value & mask) === (baseInt & mask);
}

// Private / non-routable IPv4 ranges (RFC 1918, loopback, link-local, CGNAT,
// broadcast, "this network", benchmarking, and multicast/reserved).
const PRIVATE_V4_CIDRS = [
  "0.0.0.0/8",
  "10.0.0.0/8",
  "100.64.0.0/10",
  "127.0.0.0/8",
  "169.254.0.0/16",
  "172.16.0.0/12",
  "192.0.0.0/24",
  "192.168.0.0/16",
  "198.18.0.0/15",
  "224.0.0.0/4",
  "240.0.0.0/4",
];

/**
 * True when an IP literal (v4 or v6) is private, loopback, link-local, unique-
 * local, or the metadata IP — i.e. must never be fetched.
 */
export function isPrivateIp(ipRaw: string): boolean {
  if (!ipRaw) return true;
  let ip = ipRaw.trim().toLowerCase();
  // Strip an IPv6 zone id and brackets if present.
  ip = ip.replace(/^\[/, "").replace(/\]$/, "");
  const zone = ip.indexOf("%");
  if (zone !== -1) ip = ip.slice(0, zone);

  if (ip === METADATA_IPV4) return true;

  // IPv4-mapped / -embedded IPv6 (::ffff:169.254.169.254, ::ffff:a.b.c.d).
  const mapped = ip.match(/(?:::ffff:)?(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/);
  if (mapped) {
    const asInt = ipv4ToInt(mapped[1]);
    if (asInt === null) return true; // malformed → treat as unsafe
    return PRIVATE_V4_CIDRS.some((cidr) => inV4Range(asInt, cidr));
  }

  const asInt = ipv4ToInt(ip);
  if (asInt !== null) {
    return PRIVATE_V4_CIDRS.some((cidr) => inV4Range(asInt, cidr));
  }

  // IPv6 forms we treat as unsafe.
  if (ip === "::1" || ip === "::") return true; // loopback / unspecified
  if (ip.startsWith("fe80")) return true; // link-local
  if (ip.startsWith("fc") || ip.startsWith("fd")) return true; // unique-local
  if (ip.startsWith("ff")) return true; // multicast

  return false;
}

/** True for a bare IPv4/IPv6 literal (vs a DNS name). */
function isIpLiteral(hostname: string): boolean {
  const h = hostname.replace(/^\[/, "").replace(/\]$/, "");
  return ipv4ToInt(h) !== null || h.includes(":");
}

/**
 * Structural URL validation (no DNS): https scheme, a hostname is present, and
 * if the host is an IP literal it is not private. Returns the parsed URL and its
 * lowercased hostname. Throws SsrfError on any violation.
 */
export function assertUrlAllowed(urlStr: string): { url: URL; host: string } {
  let url: URL;
  try {
    url = new URL(urlStr);
  } catch {
    throw new SsrfError("Invalid URL.");
  }
  if (url.protocol !== "https:") {
    throw new SsrfError("Only https URLs are allowed.");
  }
  const host = url.hostname.toLowerCase();
  if (!host) throw new SsrfError("URL has no host.");
  if (host === "localhost" || host.endsWith(".localhost")) {
    throw new SsrfError("Loopback host is not allowed.");
  }
  if (isIpLiteral(host) && isPrivateIp(host)) {
    throw new SsrfError("Private, loopback, or link-local address is not allowed.");
  }
  return { url, host };
}

/** Case-insensitive host equality (the crawl is pinned to the sitemap's host). */
export function sameHost(a: string, b: string): boolean {
  return a.toLowerCase() === b.toLowerCase();
}

/**
 * Resolve a DNS hostname and assert every resolved address is public. Defeats
 * DNS-rebinding (a name that passed the structural check but resolves to a
 * private IP). IP-literal hosts skip resolution (already checked structurally).
 * Throws SsrfError if resolution fails or any address is private.
 */
export async function assertHostResolvesPublic(hostname: string): Promise<void> {
  const host = hostname.toLowerCase();
  if (isIpLiteral(host)) {
    if (isPrivateIp(host)) throw new SsrfError("Private address is not allowed.");
    return;
  }
  const dns = await import("node:dns/promises");
  let addrs: { address: string }[];
  try {
    addrs = await dns.lookup(host, { all: true });
  } catch {
    throw new SsrfError(`Could not resolve host: ${host}`);
  }
  if (addrs.length === 0) throw new SsrfError(`Host did not resolve: ${host}`);
  for (const a of addrs) {
    if (isPrivateIp(a.address)) {
      throw new SsrfError(`Host resolves to a private address: ${host}`);
    }
  }
}
