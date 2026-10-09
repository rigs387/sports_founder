import { fandomScore } from "./fandom";
import { type Config, type CountryState, type GameState, PLAYER_INDEX, type World } from "./types";

// PP prices in quarters of income (GDD v1.34). Every PP price is the sport's base PP income per
// quarter (never below a floor) × a number of quarters set in content or config, so a price takes
// the same time to earn whatever the sport's size. The PP tier no longer multiplies prices: longer
// turns and the growth tree's per-node rise do that job.

/**
 * PP income for a quarter: scale × score ^ exponent × the score-weighted mean of each country's
 * growth tree PP income factor (so an unconditional +8% node adds exactly 8%). The score counts
 * each country's Fandom Score × its wealth level's weight (GDD v1.21); without weights, raw.
 */
export function quarterPpIncome(
  countries: readonly CountryState[],
  growth: readonly { readonly ppIncome: number }[],
  config: Config,
  wealthWeights: readonly number[] = [],
): number {
  let score = 0;
  let weighted = 0;
  countries.forEach((country, index) => {
    const fans = country.fans[PLAYER_INDEX];
    if (!fans) return;
    const here =
      fandomScore(fans.casual, fans.hardcore, config.fandomScore.casualWeight) *
      (wealthWeights[index] ?? 1);
    score += here;
    weighted += here * (growth[index]?.ppIncome ?? 1);
  });
  if (score <= 0) return 0;
  return config.ppIncome.scale * score ** config.ppIncome.exponent * (weighted / score);
}

/** Each country's wealth level weight on Prestige income (GDD v1.21). */
export function ppWeights(world: World): number[] {
  const { levels } = world.config.wealthLevels;
  return world.derived.map((derived) => levels[derived.wealthLevel]?.ppWeight ?? 1);
}

/**
 * The income a price is measured in: base PP income per quarter (no growth tree bonus, so PP
 * income nodes stay worth buying), never below `ppPrices.minIncomePerQuarter`.
 */
export function priceIncome(state: Pick<GameState, "countries">, world: World): number {
  const base = quarterPpIncome(state.countries, [], world.config, ppWeights(world));
  return Math.max(world.config.ppPrices.minIncomePerQuarter, base);
}

/** The PP price of something that costs `quarters` quarters of income now. */
export function ppPrice(
  state: Pick<GameState, "countries">,
  world: World,
  quarters: number,
): number {
  return quarters * priceIncome(state, world);
}
