// Shared dollar formatter for the admin Usage & Cost panel. Usage costs are
// routinely fractions of a cent (a single grounded turn is ~$0.0004 — see
// docs/product/usage-and-cost.md § worked example), so a plain 2dp format
// would round almost everything to "$0.00". This scales precision to the
// magnitude instead: tiny sums get up to 6dp, larger sums settle to 2dp.
export function formatUsd(amount: number): string {
  if (!Number.isFinite(amount)) return "$0.00";
  const abs = Math.abs(amount);
  if (abs === 0) return "$0.00";
  if (abs < 0.01) {
    // Fractions of a cent: show up to 6dp, trimmed of trailing zeros, but
    // never fewer than 4dp so e.g. $0.0004 doesn't collapse to "$0".
    const fixed = amount.toFixed(6).replace(/0+$/, "").replace(/\.$/, "");
    const [, dec = ""] = fixed.split(".");
    const dp = Math.max(4, dec.length);
    return `$${amount.toFixed(dp)}`;
  }
  if (abs < 1) return `$${amount.toFixed(4)}`;
  return `$${amount.toFixed(2)}`;
}
