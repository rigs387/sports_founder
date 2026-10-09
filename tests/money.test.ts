import { describe, expect, it } from "vitest";
import i18next, { formatMoney, setDollarsPerCash } from "../src/renderer/src/i18n";
import en from "../src/renderer/src/i18n/locales/en.json";
import { world } from "./helpers";

// Money on screen (GDD v1.34): cash shows as US dollars at the configured rate.
describe("money in dollars", () => {
  it("formats cash as compact dollars at the snapshot's rate", () => {
    setDollarsPerCash(world.config.money.dollarsPerCash);
    expect(formatMoney(0.05, "en")).toBe("$455");
    expect(formatMoney(2, "en")).toBe("$18.2K");
    expect(formatMoney(2.52e6, "en")).toBe("$22.9B");
    expect(i18next.t("league.manage.signedMoney", { value: -1 })).toBe("-$9.1K");
  });

  it("never prints a raw number as cash", () => {
    const text = JSON.stringify(en);
    expect(text).not.toMatch(/\}\} (local )?cash/);
    expect(text).not.toMatch(/\}\} in (league )?cash/);
  });

  it("calibrates a full Elite slate in the United States near the NFL's revenue", () => {
    // 2.52M cash a year in the playtest save (docs/money/README.md) against US$23B.
    const dollars = 2.52e6 * world.config.money.dollarsPerCash;
    expect(dollars).toBeGreaterThan(20e9);
    expect(dollars).toBeLessThan(26e9);
  });
});
