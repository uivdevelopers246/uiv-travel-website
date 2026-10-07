const currency = new Intl.NumberFormat("en-US", {
  style: "currency", currency: "USD", minimumFractionDigits: 0, maximumFractionDigits: 2,
});

export function formatAccommodationNightlyPrice(accommodation: {
  price_min_usd: number | null;
  price_max_usd: number | null;
}): string {
  const { price_min_usd: min, price_max_usd: max } = accommodation;
  if (min == null || max == null) return "No available nights";
  const range = min === max ? currency.format(min) : `${currency.format(min)} - ${currency.format(max)}`;
  return `${range}/night`;
}

export function matchesAccommodationPriceRange(price: number | null, range: string): boolean {
  if (range === "all") return true;
  if (price == null) return false;
  const [min, max] = range.split("-").map((part) => Number.parseInt(part, 10));
  return price >= min && (range.includes("+") || price <= max);
}
