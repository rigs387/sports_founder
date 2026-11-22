import { offseasonOpen } from "./calendar";
import { runningCostPerQuarter } from "./leagues";
import { landmarks } from "./records";
import type { GameState, Landmark, LeagueTierId, World, YouthState } from "./types";

// Youth programs (GDD v1.40, v1.42; tech plan 2.28). The seat's league and focus countries'
// leagues, the places the player personally operates, buy levels with league cash in the
// offseason, one at a time; a level opens when the offseason closes a season later. Upkeep is
// paid every quarter, focus or not; a program kept after focus left cannot be upgraded. When the
// offseason closes a league whose cash is below `lossYears` of its youth upkeep loses its top
// level, and a league above its tier's cap drops to it. Each open level lifts hardcore
// conversion in the country. Every number is config (`youth`).

export interface YouthTerms {
  /** The level that would be set up. */
  level: number;
  price: number;
  /** It opens when the offseason before `opensSeason` closes. */
  opensSeason: number;
  /** Upkeep a quarter once it opens, on top of today's. */
  upkeep: number;
  /** Hardcore conversion lift it adds, as a share (0.02 = 2%). */
  conversion: number;
}

export type YouthBlocker = "window" | "league" | "focus" | "cap" | "building" | "cash";

/** A new league's youth program: none. */
export function newYouth(): YouthState {
  return { level: 0, building: null, opened: [] };
}

/** The highest youth level a league tier allows. */
export function youthCap(world: World, tier: LeagueTierId): number {
  return world.config.youth.maxLevel[tier];
}

/** Upkeep a quarter on a program at `level`: upkeepShare × the running cost per level. */
export function youthUpkeep(
  world: World,
  countryIndex: number,
  tier: LeagueTierId,
  level: number,
  owned: readonly string[],
): number {
  if (level <= 0) return 0;
  return (
    world.config.youth.upkeepShare * level * runningCostPerQuarter(world, countryIndex, tier, owned)
  );
}

/** The youth program's lift on hardcore conversion in a country: 1 + conversionBoost × level. */
export function youthConversion(state: Pick<GameState, "countries">, world: World, index: number) {
  const level = state.countries[index]?.league?.youth.level ?? 0;
  return 1 + world.config.youth.conversionBoost * level;
}

/** Whether the player operates this country's league now: the seat or a focus slot. */
export function youthOperated(state: Pick<GameState, "flagship" | "focus">, countryId: string) {
  return countryId === state.flagship.countryId || state.focus.includes(countryId);
}

const indexOf = (world: World, countryId: string) =>
  world.countries.findIndex((country) => country.id === countryId);

/** What setting up a league's next youth level would take, or null with no league or at the cap. */
export function youthTerms(state: GameState, world: World, countryId: string): YouthTerms | null {
  const index = indexOf(world, countryId);
  const league = state.countries[index]?.league;
  if (!league) return null;
  const level = league.youth.level + 1;
  const settings = world.config.youth;
  const quarters = settings.priceQuarters[level - 1];
  if (quarters === undefined || level > youthCap(world, league.tier)) return null;
  const running = runningCostPerQuarter(world, index, league.tier, state.growthNodes);
  return {
    level,
    price: quarters * running,
    opensSeason: state.flagship.season + settings.buildSeasons,
    upkeep: settings.upkeepShare * running,
    conversion: settings.conversionBoost,
  };
}

/** Why a league cannot set up its next youth level now, or null. `free` skips the price. */
export function youthBlocker(
  state: GameState,
  world: World,
  countryId: string,
  free = false,
): YouthBlocker | null {
  if (!free && !offseasonOpen(state)) return "window";
  const league = state.countries[indexOf(world, countryId)]?.league;
  if (!league) return "league";
  if (!youthOperated(state, countryId)) return "focus";
  if (league.youth.building) return "building";
  const terms = youthTerms(state, world, countryId);
  if (!terms) return "cap";
  return !free && league.cash < terms.price ? "cash" : null;
}

/**
 * Pays for a league's next youth level and starts setting it up (legality checked by the
 * caller). `free` is the community drive's (GDD v1.42): no league cash.
 */
export function buildYouth(
  state: GameState,
  world: World,
  countryId: string,
  free = false,
): GameState {
  const index = indexOf(world, countryId);
  const terms = youthTerms(state, world, countryId);
  const country = state.countries[index];
  const league = country?.league;
  if (!terms || !country || !league) throw new Error("unreachable: youth was checked");
  const countries = [...state.countries];
  countries[index] = {
    ...country,
    league: {
      ...league,
      cash: free ? league.cash : league.cash - terms.price,
      youth: { ...league.youth, building: { level: terms.level, opensSeason: terms.opensSeason } },
    },
  };
  return { ...state, countries };
}

/**
 * Settles every youth program as the offseason closes (after the season has started): a league
 * short of `lossYears` of upkeep loses its build and top level, a league above its tier's cap
 * drops to it, then the levels due open.
 */
export function settleYouth(state: GameState, world: World): GameState {
  const settings = world.config.youth;
  const found: Landmark[] = [];
  let changed = false;
  const countries = state.countries.map((country, index) => {
    const league = country.league;
    if (!league) return country;
    let youth = league.youth;
    if (youth.level === 0 && !youth.building) return country;
    const countryId = country.countryId;
    const upkeep = youthUpkeep(world, index, league.tier, youth.level, state.growthNodes);
    if (upkeep > 0 && league.cash < 4 * settings.lossYears * upkeep) {
      youth = { level: youth.level - 1, building: null, opened: youth.opened.slice(0, -1) };
      found.push(landmarks.youthLost(state.turn, state.quarter, countryId, youth.level, "upkeep"));
    }
    const cap = youthCap(world, league.tier);
    if (youth.building && youth.building.level > cap) youth = { ...youth, building: null };
    if (youth.level > cap) {
      youth = { ...youth, level: cap, opened: youth.opened.slice(0, cap) };
      found.push(landmarks.youthLost(state.turn, state.quarter, countryId, cap, "tier"));
    }
    const building = youth.building;
    if (building && building.opensSeason <= state.flagship.season) {
      youth = {
        level: building.level,
        building: null,
        opened: [...youth.opened, state.flagship.season],
      };
      found.push(landmarks.youthOpened(state.turn, state.quarter, countryId, building.level));
    }
    if (youth === league.youth) return country;
    changed = true;
    return { ...country, league: { ...league, youth } };
  });
  if (!changed) return state;
  return { ...state, countries, landmarks: [...state.landmarks, ...found] };
}

/** One league's youth program, as the offseason card and the country card show it. */
export interface YouthRow {
  countryId: string;
  level: number;
  cap: number;
  building: { level: number; opensSeason: number } | null;
  /** Upkeep a quarter now. */
  upkeep: number;
  /** The conversion lift now, as a share. */
  conversion: number;
  /** The seat or a focus slot: only these can be upgraded. */
  operated: boolean;
  terms: YouthTerms | null;
  blocker: YouthBlocker | null;
}

/**
 * Every league with a program or that the player operates: the seat first, then focus slots in
 * order, then programs kept after focus left.
 */
export function youthRows(state: GameState, world: World): YouthRow[] {
  const order: string[] = [];
  const add = (countryId: string | null) => {
    if (countryId && !order.includes(countryId)) order.push(countryId);
  };
  add(state.flagship.countryId);
  for (const countryId of state.focus) add(countryId);
  for (const country of state.countries)
    if (country.league && (country.league.youth.level > 0 || country.league.youth.building))
      add(country.countryId);
  const rows: YouthRow[] = [];
  for (const countryId of order) {
    const index = indexOf(world, countryId);
    const league = state.countries[index]?.league;
    if (!league) continue;
    const youth = league.youth;
    rows.push({
      countryId,
      level: youth.level,
      cap: youthCap(world, league.tier),
      building: youth.building,
      upkeep: youthUpkeep(world, index, league.tier, youth.level, state.growthNodes),
      conversion: youthConversion(state, world, index) - 1,
      operated: youthOperated(state, countryId),
      terms: youthTerms(state, world, countryId),
      blocker: youthBlocker(state, world, countryId),
    });
  }
  return rows;
}
