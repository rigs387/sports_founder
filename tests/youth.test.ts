import { describe, expect, it } from "vitest";
import {
  applyAction,
  checkAction,
  checkInvariants,
  closeOffseason,
  createCampaign,
  deserializeSave,
  type EventRecord,
  type GameState,
  grantAsk,
  type LeagueTierId,
  leagueCosts,
  runningCostPerQuarter,
  serializeSave,
  snapshot,
  updateStandouts,
  youthConversion,
  youthTerms,
} from "../src/sim";
import { countryIndex, setupFor, world } from "./helpers";

// Youth programs (GDD v1.40, v1.42; tech plan 2.28 step 1): one anchor, direct calls.

const seat = countryIndex(world, "brazil");
const abroad = countryIndex(world, "argentina");

/** A Brazil campaign in the offseason, its league at `tier` with `cash`. */
function offseason(tier: LeagueTierId = "professional", cash = 1e9): GameState {
  const state = createCampaign(world, setupFor(5, "brazil"));
  return {
    ...state,
    flagship: { ...state.flagship, offseason: true },
    countries: state.countries.map((c, i) =>
      i === seat && c.league ? { ...c, league: { ...c.league, tier, cash } } : c,
    ),
  };
}

const youth = (state: GameState, index = seat) => state.countries[index]?.league?.youth;
const build = (state: GameState, countryId = "brazil") =>
  applyAction(state, world, { type: "buildYouth", countryId });

describe("youth programs", () => {
  it("a level is bought with league cash in the offseason and opens a season later", () => {
    const base = offseason();
    expect(youth(base)).toEqual({ level: 0, building: null, opened: [] });
    expect(
      checkAction({ ...base, flagship: { ...base.flagship, offseason: false } }, world, {
        type: "buildYouth",
        countryId: "brazil",
      }),
    ).toMatch(/offseason/);
    const terms = youthTerms(base, world, "brazil");
    const running = runningCostPerQuarter(world, seat, "professional", base.growthNodes);
    expect(terms?.price).toBeCloseTo((world.config.youth.priceQuarters[0] ?? 0) * running);
    const bought = build(base);
    expect(bought.countries[seat]?.league?.cash).toBeCloseTo(1e9 - (terms?.price ?? 0));
    expect(youth(bought)?.building).toEqual({ level: 1, opensSeason: terms?.opensSeason });
    expect(checkAction(bought, world, { type: "buildYouth", countryId: "brazil" })).toMatch(
      /already/,
    );
    // Not when this offseason closes: a season later, when the next one does.
    const first = closeOffseason(bought, world);
    expect(youth(first)?.level).toBe(0);
    const season = terms?.opensSeason ?? 0;
    const next = { ...first, flagship: { ...first.flagship, offseason: true, season } };
    const opened = closeOffseason(next, world);
    expect(youth(opened)).toEqual({ level: 1, building: null, opened: [opened.flagship.season] });
    expect(opened.landmarks.some((l) => l.kind === "youthOpened" && l.level === 1)).toBe(true);
    expect(checkInvariants(opened, world)).toEqual([]);
  });

  it("an open level lifts conversion and charges upkeep; a tier caps the level", () => {
    const base = offseason();
    const at = (level: number, tier: LeagueTierId = "professional"): GameState => ({
      ...base,
      countries: base.countries.map((c, i) =>
        i === seat && c.league
          ? { ...c, league: { ...c.league, tier, youth: { level, building: null, opened: [] } } }
          : c,
      ),
    });
    const { conversionBoost, upkeepShare, maxLevel } = world.config.youth;
    expect(youthConversion(at(3), world, seat)).toBeCloseTo(1 + 3 * conversionBoost);
    const running = runningCostPerQuarter(world, seat, "professional", base.growthNodes);
    expect(leagueCosts(at(3), world, seat).youth).toBeCloseTo(3 * upkeepShare * running);
    expect(leagueCosts(at(0), world, seat).youth).toBe(0);
    expect(youthTerms(at(maxLevel.professional), world, "brazil")).toBeNull();
    expect(
      checkAction(at(0, "amateur"), world, { type: "buildYouth", countryId: "brazil" }),
    ).toMatch(/top level/);
    // A league that falls below its level's tier drops to the cap when the offseason closes.
    const fallen = closeOffseason(at(4, "semi-pro"), world);
    expect(youth(fallen)?.level).toBe(maxLevel["semi-pro"]);
    expect(fallen.landmarks.some((l) => l.kind === "youthLost" && l.reason === "tier")).toBe(true);
  });

  it("a league short of a year's upkeep loses a level and its build when the offseason closes", () => {
    const base = offseason("professional", 0);
    const poor: GameState = {
      ...base,
      countries: base.countries.map((c, i) =>
        i === seat && c.league
          ? {
              ...c,
              league: {
                ...c.league,
                youth: { level: 2, building: { level: 3, opensSeason: 1 }, opened: [1, 2] },
              },
            }
          : c,
      ),
    };
    const closed = closeOffseason(poor, world);
    expect(youth(closed)).toEqual({ level: 1, building: null, opened: [1] });
    expect(closed.landmarks.some((l) => l.kind === "youthLost" && l.reason === "upkeep")).toBe(
      true,
    );
  });

  it("only the seat and focus countries can build; a kept program shows read-only", () => {
    const base = offseason();
    const league = base.countries[seat]?.league;
    if (!league) throw new Error("no seat league");
    const withAbroad: GameState = {
      ...base,
      countries: base.countries.map((c, i) =>
        i === abroad ? { ...c, league: { ...league, youth: { ...league.youth, level: 1 } } } : c,
      ),
    };
    expect(checkAction(withAbroad, world, { type: "buildYouth", countryId: "argentina" })).toMatch(
      /focus/,
    );
    const rows = snapshot(withAbroad, world).youth;
    expect(rows[0]?.countryId).toBe("brazil");
    expect(rows.find((r) => r.countryId === "argentina")).toMatchObject({
      level: 1,
      operated: false,
      blocker: "focus",
    });
    const focused = { ...withAbroad, focus: ["argentina", ...withAbroad.focus.slice(1)] };
    expect(checkAction(focused, world, { type: "buildYouth", countryId: "argentina" })).toBeNull();
  });

  it("a granted community drive sets up the next level free, unless it cannot", () => {
    const base = offseason("professional", 0);
    const event = {
      countryId: "brazil",
      facts: { director: { ask: "community-drive", directorId: 1 } },
    } as unknown as EventRecord;
    const granted = grantAsk(base, world, event);
    expect(granted.countries[seat]?.league?.cash).toBe(0);
    expect(youth(granted)?.building?.level).toBe(1);
    expect(grantAsk(granted, world, event)).toBe(granted);
  });

  it("a save round-trips with programs, and an older league loads with none", () => {
    const bought = build(offseason());
    const text = serializeSave(bought);
    expect(serializeSave(deserializeSave(text, world))).toBe(text);
    const legacy = text.replace(/,"youth":\{"level":0,"building":\{[^}]*\},"opened":\[\]\}/, "");
    expect(legacy).not.toBe(text);
    expect(youth(deserializeSave(legacy, world))?.building).toBeNull();
  });
});

// Homegrown quality (tech plan 2.28 step 2): one anchor, direct calls, the same seed both ways.

/** The campaign with a country's league at `tier` and its youth program at `level`. */
function withProgram(state: GameState, index: number, tier: LeagueTierId, level: number) {
  const seatLeague = state.countries[seat]?.league;
  if (!seatLeague) throw new Error("no seat league");
  return {
    ...state,
    countries: state.countries.map((c, i) =>
      i === index
        ? {
            ...c,
            league: {
              ...(c.league ?? seatLeague),
              tier,
              youth: { level, building: null, opened: level > 0 ? [1] : [] },
            },
          }
        : c,
    ),
  };
}

describe("homegrown quality", () => {
  const lift = world.config.youth.skillLift;
  const { max } = world.config.flagship.players.skill;

  it("standouts drawn after a level opens peak higher; the same seed draws the same players", () => {
    const base = createCampaign(world, setupFor(5, "brazil"));
    const draw = (level: number) =>
      updateStandouts(withProgram(base, abroad, "professional", level), world).standouts.players;
    const none = draw(0);
    const four = draw(4);
    expect(none.length).toBeGreaterThan(0);
    expect(four.map((p) => [p.id, p.name, p.birthSeason])).toEqual(
      none.map((p) => [p.id, p.name, p.birthSeason]),
    );
    four.forEach((player, i) => {
      const before = none[i]?.peakSkill ?? 0;
      expect(player.peakSkill).toBeCloseTo(Math.min(max, before + 4 * lift));
    });
    const mean = (players: typeof none) =>
      players.reduce((sum, p) => sum + p.peakSkill, 0) / players.length;
    expect(mean(four)).toBeGreaterThan(mean(none));
    expect(draw(4)).toEqual(four);
  });

  it("players already playing are unchanged when a level opens", () => {
    const base = createCampaign(world, setupFor(5, "brazil"));
    const drawn = updateStandouts(withProgram(base, abroad, "professional", 0), world);
    const opened = updateStandouts(withProgram(drawn, abroad, "professional", 4), world);
    expect(opened.standouts.players).toEqual(drawn.standouts.players);
  });

  it("the flagship's young replacement born at a program's country peaks higher", () => {
    const base = offseason();
    const club = base.flagship.players.find((p) => p.retiredSeason === null);
    if (!club) throw new Error("no leading player");
    const retiring = (level: number): GameState => {
      const state = withProgram(base, seat, "professional", level);
      return {
        ...state,
        flagship: {
          ...state.flagship,
          players: state.flagship.players.map((p) =>
            p.id === club.id ? { ...p, retiredSeason: state.flagship.season - 1 } : p,
          ),
        },
      };
    };
    const replacement = (level: number) => {
      const closed = closeOffseason(retiring(level), world);
      return closed.flagship.players.find(
        (p) => p.clubId === club.clubId && p.retiredSeason === null,
      );
    };
    const none = replacement(0);
    const four = replacement(4);
    expect(none?.id).toBe(four?.id);
    expect(four?.peakSkill).toBeCloseTo(Math.min(max, (none?.peakSkill ?? 0) + 4 * lift));
  });
});
