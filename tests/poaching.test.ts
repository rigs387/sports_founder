import { describe, expect, it } from "vitest";
import {
  createCampaign,
  type EscalationLevel,
  type GameState,
  OTHER_SPORT_ID,
  PLAYER_INDEX,
  PLAYER_SPORT_ID,
  poachingRates,
  pullStrength,
  stepQuarter,
  type World,
} from "../src/sim";
import { countryIndex, setupFor, withConfig, withWorld, world } from "./helpers";

// Hardcore poaching (GDD Fan Model v1.4, "Winning over rival hardcore fans is slow") tested through
// its consequences: who loses fans, where they go, how the pull scales, and how slow it is.

const COUNTRY = "valdoria";
const RIVAL = "fieldball";

/** No conversion, churn or noise anywhere, and no countermoves: only poaching moves fans. */
function onlyPoaching(base: World): World {
  return withConfig(base, (config) => {
    config.dynamics.noise = 0;
    config.turnover.annualRate = 0;
    config.dynamics.player = {
      casualConversionRate: 0,
      casualChurnRate: 0,
      casualDecayRate: 0,
      hardcoreConversionRate: 0,
    };
    config.dynamics.rival = {
      casualConversionRate: 0,
      casualChurnRate: 0,
      hardcoreConversionRate: 0,
    };
    config.rivalAI.movesPerQuarter = 0;
    for (const tier of config.ppTiers) if (tier.tier > 1) tier.fandomScoreRequired = 1e15;
  });
}

const frozen = onlyPoaching(world);
const population = frozen.countries[countryIndex(frozen, COUNTRY)]?.population ?? 0;

function withFans(
  state: GameState,
  w: World,
  countryId: string,
  sportId: string,
  fans: { casual?: number; hardcore?: number },
): GameState {
  const index = countryIndex(w, countryId);
  return {
    ...state,
    countries: state.countries.map((country, i) =>
      i !== index
        ? country
        : {
            ...country,
            fans: country.fans.map((f) =>
              f.sportId !== sportId
                ? f
                : { ...f, casual: fans.casual ?? f.casual, hardcore: fans.hardcore ?? f.hardcore },
            ),
          },
    ),
  };
}

function withLevel(state: GameState, w: World, sportId: string, level: EscalationLevel) {
  const index = countryIndex(w, COUNTRY);
  return {
    ...state,
    countries: state.countries.map((country, i) =>
      i !== index
        ? country
        : {
            ...country,
            defense: country.defense.map((front) =>
              front.sportId === sportId ? { ...front, level } : front,
            ),
          },
    ),
  };
}

function fansOf(state: GameState, w: World, sportId: string, countryId = COUNTRY) {
  const fans = state.countries[countryIndex(w, countryId)]?.fans.find((f) => f.sportId === sportId);
  if (!fans) throw new Error(`No ${sportId} fans in ${countryId}`);
  return fans;
}

/** A fresh campaign where the player holds `hardcore` fans in the test country. */
function pressuredBy(hardcore: number, w = frozen, casual = 0): GameState {
  return withFans(createCampaign(w, setupFor(1, COUNTRY)), w, COUNTRY, PLAYER_SPORT_ID, {
    hardcore,
    casual,
  });
}

describe("hardcore poaching", () => {
  it("rival and other hardcore fans fall only by demotion to casual about the same sport", () => {
    let state = pressuredBy(2_000_000, frozen, 1_000_000);
    let demoted = 0;
    for (let q = 0; q < 20; q += 1) {
      const next = stepQuarter(state, frozen);
      for (const sportId of [...frozen.rivals.map((r) => r.id), OTHER_SPORT_ID]) {
        const before = fansOf(state, frozen, sportId);
        const after = fansOf(next, frozen, sportId);
        const lost = before.hardcore - after.hardcore;
        expect(lost, `${sportId} quarter ${q + 1}`).toBeGreaterThanOrEqual(0);
        expect(after.casual - before.casual, `${sportId} quarter ${q + 1}`).toBe(lost);
        demoted += lost;
      }
      state = next;
    }
    expect(demoted).toBeGreaterThan(10_000);
  });

  it("the pull grows with the player's local hardcore share, and stops growing at the cap", () => {
    const lossAt = (share: number) => {
      const start = pressuredBy(Math.round(share * population));
      const next = stepQuarter(start, frozen);
      return fansOf(start, frozen, RIVAL).hardcore - fansOf(next, frozen, RIVAL).hardcore;
    };
    const [one, three, eight] = [0.01, 0.03, 0.08].map(lossAt) as [number, number, number];
    expect(one).toBeGreaterThan(100);
    expect(three / one).toBeCloseTo(3, 1);
    expect(eight / three).toBeCloseTo(8 / 3, 1);

    const { referenceShare, maxStrength } = frozen.config.poaching;
    const cap = referenceShare * maxStrength;
    expect(pullStrength(cap + 0.2, frozen.config)).toBe(maxStrength);
    expect(Math.abs(lossAt(cap + 0.2) - lossAt(cap))).toBeLessThanOrEqual(1);
  });

  it("is slow: under steady full-strength pressure a rival keeps most of its hardcore for decades", () => {
    // The player holds 30% of the country (full pull strength). Nobody converts anyone, so the
    // rival cannot rebuild, and it never defends: the worst case for the rival.
    let state = pressuredBy(Math.round(0.3 * population));
    const initial = fansOf(state, frozen, RIVAL).hardcore;
    expect(initial / population).toBeGreaterThan(0.1);
    const retained: Record<number, number> = {};
    for (let quarter = 1; quarter <= 80; quarter += 1) {
      state = stepQuarter(state, frozen);
      if (quarter % 20 === 0)
        retained[quarter / 4] = fansOf(state, frozen, RIVAL).hardcore / initial;
    }
    expect(retained[5]).toBeGreaterThan(0.9);
    expect(retained[10]).toBeGreaterThan(0.8);
    expect(retained[20]).toBeGreaterThan(0.6);
    // ...but the pull is real.
    expect(retained[20]).toBeLessThan(0.9);
  });

  it("rival defense slows the pull further: an entrenched rival loses fewer fans to the same pressure", () => {
    const pressured = pressuredBy(2_000_000);
    const loss = (state: GameState) =>
      fansOf(state, frozen, RIVAL).hardcore -
      fansOf(stepQuarter(state, frozen), frozen, RIVAL).hardcore;
    const open = loss(pressured);
    const entrenched = loss(withLevel(pressured, frozen, RIVAL, "entrenched"));
    const resistance = frozen.config.poaching.defenseResistance.entrenched;
    expect(resistance).toBeLessThan(1);
    expect(entrenched).toBeGreaterThan(0);
    expect(Math.abs(entrenched - open * resistance)).toBeLessThanOrEqual(2);
  });

  it("rivals pull from the player too, and the player's lost hardcore fans become casual", () => {
    let state = pressuredBy(500_000, frozen, 100_000);
    const index = countryIndex(frozen, COUNTRY);
    const country = state.countries[index];
    if (!country) throw new Error("no country");
    const rates = poachingRates(country, state.sports, population, frozen.config);
    const rivalStrength = state.sports.reduce(
      (sum, sport, s) =>
        sport.kind === "rival"
          ? sum + pullStrength((country.fans[s]?.hardcore ?? 0) / population, frozen.config)
          : sum,
      0,
    );
    expect(rates[PLAYER_INDEX]).toBeCloseTo(frozen.config.poaching.rate * rivalStrength, 12);

    const start = fansOf(state, frozen, PLAYER_SPORT_ID);
    for (let q = 0; q < 8; q += 1) {
      const next = stepQuarter(state, frozen);
      const before = fansOf(state, frozen, PLAYER_SPORT_ID);
      const after = fansOf(next, frozen, PLAYER_SPORT_ID);
      expect(after.hardcore).toBeLessThan(before.hardcore);
      expect(after.casual + after.hardcore).toBe(before.casual + before.hardcore);
      state = next;
    }
    expect(fansOf(state, frozen, PLAYER_SPORT_ID).hardcore).toBeLessThan(start.hardcore * 0.99);
  });

  it("never takes a sport below the floor share, even at an extreme rate", () => {
    const brutal = withConfig(frozen, (config) => {
      config.poaching.rate = 1;
    });
    let state = pressuredBy(Math.round(0.4 * population), brutal);
    for (let q = 0; q < 40; q += 1) state = stepQuarter(state, brutal);
    const floor = Math.ceil(brutal.config.poaching.floorShare * population);
    for (const sportId of [...brutal.rivals.map((r) => r.id), OTHER_SPORT_ID]) {
      expect(fansOf(state, brutal, sportId).hardcore, sportId).toBe(floor);
    }
  });
});

describe("the other sports bucket", () => {
  // A country where no rival has fans and unmodeled sports hold 30% of the hardcore pie.
  const noRivalsHere = withWorld(frozen, (content) => {
    const country = content.countries.find((c) => c.id === COUNTRY);
    if (country) {
      country.startingRivalFans = {};
      country.otherHardcoreShare = 0.3;
    }
  });

  it("loses hardcore fans to a strong player sport by demotion, but never pulls the player's", () => {
    let state = pressuredBy(1_500_000, noRivalsHere);
    const other = fansOf(state, noRivalsHere, OTHER_SPORT_ID);
    for (let q = 0; q < 12; q += 1) state = stepQuarter(state, noRivalsHere);
    const otherAfter = fansOf(state, noRivalsHere, OTHER_SPORT_ID);
    const lost = other.hardcore - otherAfter.hardcore;
    expect(lost).toBeGreaterThan(10_000);
    expect(otherAfter.casual - other.casual).toBe(lost);
    expect(fansOf(state, noRivalsHere, PLAYER_SPORT_ID).hardcore).toBe(1_500_000);
  });

  it("never defends: it has no escalation front, and its pull ignores every defense level", () => {
    const state = pressuredBy(1_500_000, noRivalsHere);
    const country = state.countries[countryIndex(noRivalsHere, COUNTRY)];
    if (!country) throw new Error("no country");
    expect(country.defense.map((front) => front.sportId)).toEqual(
      noRivalsHere.rivals.map((r) => r.id),
    );
    const otherIndex = state.sports.findIndex((sport) => sport.id === OTHER_SPORT_ID);
    const entrenched = {
      ...country,
      defense: country.defense.map((front) => ({ ...front, level: "entrenched" as const })),
    };
    const rates = poachingRates(country, state.sports, population, noRivalsHere.config);
    const defended = poachingRates(entrenched, state.sports, population, noRivalsHere.config);
    expect(rates[otherIndex]).toBeGreaterThan(0);
    expect(defended[otherIndex]).toBe(rates[otherIndex]);
  });
});
