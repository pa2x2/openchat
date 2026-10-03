import { t } from "@/src/i18n";
import { formatCost, formatTokensShort } from "../usageFormat";

const usd = (amount: number) => formatCost(t, { amount, currency: "USD" });
const tokensShort = (count: number) => formatTokensShort(t, count);

// The number of decimals is picked from the amount before it is rounded, and
// the unit of a token count from the count before it is rounded. Just under a
// boundary, rounding then lands on a figure the range was not meant to print.
it("keeps a cost's shape when rounding carries it over a boundary", () => {
  expect([0.000056, 0.0031, 0.0184, 0.47, 1.284, 12.5].map(usd)).toEqual([
    "$0.000056",
    "$0.0031",
    "$0.018",
    "$0.47",
    "$1.28",
    "$12.50",
  ]);
  expect([0.996, 0.0996, 0.00996, 0.1].map(usd)).toEqual(["$1.00", "$0.10", "$0.01", "$0.10"]);
  expect(usd(0)).toBeNull();
  expect(formatCost(t, { amount: 0.47, currency: "EUR" })).toBe("0.47 EUR");
});

it("moves a token count to the next unit when rounding reaches it", () => {
  expect([842, 999, 48_612, 128_340, 1_422_500].map(tokensShort)).toEqual([
    "842",
    "999",
    "48.6k",
    "128k",
    "1.42M",
  ]);
  expect([99_949, 99_950, 999_499, 999_600].map(tokensShort)).toEqual([
    "99.9k",
    "100k",
    "999k",
    "1.00M",
  ]);
});
