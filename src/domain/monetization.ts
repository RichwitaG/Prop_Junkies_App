/** Share of each subscription the platform keeps (OnlyFans: 20%, Patreon: ~8-12%). */
export const PLATFORM_FEE = 0.2;

export const PRICE_MIN = 4.99;
export const PRICE_MAX = 99.99;

/** Creator's monthly take-home before payment-processing fees. */
export function monthlyPayout(price: number, subscribers: number): number {
  return Math.round(price * subscribers * (1 - PLATFORM_FEE) * 100) / 100;
}

export const usd = (n: number) =>
  n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: n >= 1000 ? 0 : 2 });
