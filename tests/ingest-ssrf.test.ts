// SSRF guard — the headline crawl risk. Pins: private/loopback/link-local/
// metadata IP literals are rejected, http is rejected, localhost is rejected,
// public hosts pass the structural check, host-pinning equality.

import { describe, it, expect } from "vitest";
import { isPrivateIp, assertUrlAllowed, sameHost, SsrfError } from "@/lib/ingest/ssrf";

describe("isPrivateIp", () => {
  const privates = [
    "127.0.0.1",
    "10.0.0.1",
    "172.16.5.4",
    "172.31.255.255",
    "192.168.1.1",
    "169.254.1.1",
    "169.254.169.254", // cloud metadata
    "100.64.0.1", // CGNAT
    "0.0.0.0",
    "::1",
    "fe80::1",
    "fc00::1",
    "fd12:3456::1",
    "::ffff:127.0.0.1", // ipv4-mapped loopback
    "::ffff:169.254.169.254",
  ];
  for (const ip of privates) {
    it(`rejects ${ip} as private`, () => expect(isPrivateIp(ip)).toBe(true));
  }

  const publics = ["8.8.8.8", "1.1.1.1", "93.184.216.34", "2606:2800:220:1::"];
  for (const ip of publics) {
    it(`accepts ${ip} as public`, () => expect(isPrivateIp(ip)).toBe(false));
  }
});

describe("assertUrlAllowed", () => {
  it("accepts a normal https URL and returns the host", () => {
    const { host } = assertUrlAllowed("https://acme.com/sitemap.xml");
    expect(host).toBe("acme.com");
  });

  it("rejects http (https only)", () => {
    expect(() => assertUrlAllowed("http://acme.com/sitemap.xml")).toThrow(SsrfError);
  });

  it("rejects a private IP literal", () => {
    expect(() => assertUrlAllowed("https://192.168.0.1/sitemap.xml")).toThrow(SsrfError);
  });

  it("rejects the metadata IP", () => {
    expect(() => assertUrlAllowed("https://169.254.169.254/latest/meta-data")).toThrow(SsrfError);
  });

  it("rejects loopback hostname", () => {
    expect(() => assertUrlAllowed("https://localhost/sitemap.xml")).toThrow(SsrfError);
    expect(() => assertUrlAllowed("https://foo.localhost/sitemap.xml")).toThrow(SsrfError);
  });

  it("rejects a bracketed IPv6 loopback", () => {
    expect(() => assertUrlAllowed("https://[::1]/sitemap.xml")).toThrow(SsrfError);
  });

  it("rejects garbage", () => {
    expect(() => assertUrlAllowed("not a url")).toThrow(SsrfError);
  });
});

describe("sameHost", () => {
  it("is case-insensitive", () => {
    expect(sameHost("Acme.com", "acme.com")).toBe(true);
    expect(sameHost("acme.com", "evil.com")).toBe(false);
  });
});
