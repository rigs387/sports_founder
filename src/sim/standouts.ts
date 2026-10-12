import { careerShare, drawName, drawPlace, finalSeasonChance } from "./flagship";
import { createRngState, nextFloat, type Rng, restoreRng, saveRng } from "./rng";
import type { GameState, LeagueTierId, Standout, StandoutsState, World } from "./types";

// Standouts (GDD v1.37): the named players of Professional and Elite leagues other than the
// flagship. They are people with a career curve and nothing else: no club, no matches, no scores
// and no effect on fans. They exist so that national teams and the flagship's talent pull have
// real players with a real past to draw on.

const STANDOUTS_STREAM = 0x3c6e_f372;

export function newStandouts(seed: number, season: number): StandoutsState {
  return { rng: createRngState((seed ^ STANDOUTS_STREAM) >>> 0), season, players: [] };
}

/** How many standouts a country's league has: none at the seat, none without a league. */
export function standoutPlaces(state: GameState, world: World, index: number): number {
  const country = state.countries[index];
  if (!country?.league || country.countryId === state.flagship.countryId) return 0;
  return world.config.standouts.places[country.league.tier];
}

/** A country's standouts, best first. */
export function standoutsIn(state: GameState, countryId: string): Standout[] {
  return state.standouts.players
    .filter((player) => player.countryId === countryId)
    .sort((a, b) => b.skill - a.skill || a.id - b.id);
}

function clamp(value: number, low: number, high: number): number {
  return Math.min(high, Math.max(low, value));
}

function newStandout(
  world: World,
  rng: Rng,
  id: number,
  countryId: string,
  tier: LeagueTierId,
  season: number,
  taken: ReadonlySet<string>,
  replacement: boolean,
): Standout {
  const { foundingAge, skill, peakSkill, replacement: young } = world.config.flagship.players;
  const ages = replacement ? young.age : foundingAge;
  const age = ages.min + Math.floor(nextFloat(rng) * (ages.max - ages.min + 1));
  const peak = clamp(
    peakSkill.mean +
      peakSkill.spread * (2 * nextFloat(rng) - 1) +
      world.config.standouts.peakLean[tier],
    skill.min,
    skill.max,
  );
  return {
    id,
    name: drawName(world, rng, countryId, taken),
    countryId,
    birthplace: drawPlace(world, rng, countryId),
    birthSeason: season - age,
    peakSkill: peak,
    skill: clamp(peak * careerShare(age, world), skill.min, skill.max),
    finalSeason: false,
  };
}

/**
 * The standouts' turn (GDD v1.37), once per `endTurn`. When the flagship has started a new season
 * a year has passed: standouts who played their final season retire, and the rest age (skill,
 * and perhaps a final season announced) by the flagship's career rules. Then every league is
 * brought to its places: a league that folded, dropped below its places or took the seat loses
 * standouts (the weakest first), and open places are filled, a retired standout's by a young
 * replacement. Ids come from the flagship's player sequence, so a standout who joins the flagship
 * keeps theirs.
 */
export function updateStandouts(state: GameState, world: World): GameState {
  const before = state.standouts;
  const season = state.flagship.season;
  const places = state.countries.map((_, index) => standoutPlaces(state, world, index));
  const newYear = season > before.season;
  if (before.players.length === 0 && places.every((count) => count === 0)) {
    return newYear ? { ...state, standouts: { ...before, season } } : state;
  }

  const rng = restoreRng(before.rng);
  const rules = world.config.flagship.players;
  const retired = new Map<string, number>();
  let players = before.players;
  if (newYear) {
    players = [];
    for (const player of before.players) {
      if (player.finalSeason) {
        retired.set(player.countryId, (retired.get(player.countryId) ?? 0) + 1);
        continue;
      }
      const age = season - player.birthSeason;
      const wobble = rules.career.wobble * (2 * nextFloat(rng) - 1);
      const skill = clamp(
        player.peakSkill * careerShare(age, world) + wobble,
        rules.skill.min,
        rules.skill.max,
      );
      const aged = { ...player, skill };
      players.push({
        ...aged,
        finalSeason: nextFloat(rng) < finalSeasonChance(aged, age, world),
      });
    }
  }

  const taken = new Set([
    ...state.flagship.players.map((player) => player.name),
    ...players.map((player) => player.name),
  ]);
  let nextPlayerId = state.flagship.nextPlayerId;
  const kept: Standout[] = [];
  state.countries.forEach((country, index) => {
    const target = places[index] ?? 0;
    const here = players
      .filter((player) => player.countryId === country.countryId)
      .sort((a, b) => b.skill - a.skill || a.id - b.id)
      .slice(0, target);
    let young = retired.get(country.countryId) ?? 0;
    const tier = country.league?.tier;
    while (tier && here.length < target) {
      const player = newStandout(
        world,
        rng,
        nextPlayerId,
        country.countryId,
        tier,
        season,
        taken,
        young > 0,
      );
      young -= 1;
      nextPlayerId += 1;
      taken.add(player.name);
      here.push(player);
    }
    kept.push(...here);
  });
  kept.sort((a, b) => a.id - b.id);

  return {
    ...state,
    flagship:
      nextPlayerId === state.flagship.nextPlayerId
        ? state.flagship
        : { ...state.flagship, nextPlayerId },
    standouts: { rng: saveRng(rng), season, players: kept },
  };
}

/** Every way the standouts are invalid. */
export function standoutProblems(state: GameState, world: World): string[] {
  const problems: string[] = [];
  const { skill } = world.config.flagship.players;
  const flagshipIds = new Set(state.flagship.players.map((player) => player.id));
  const seen = new Set<number>();
  const counts = new Map<string, number>();
  let last = 0;
  for (const player of state.standouts.players) {
    if (player.id <= last) problems.push(`standout ${player.id} is out of id order`);
    last = player.id;
    if (seen.has(player.id) || flagshipIds.has(player.id))
      problems.push(`standout id ${player.id} is used twice`);
    seen.add(player.id);
    if (player.id >= state.flagship.nextPlayerId)
      problems.push(`standout id ${player.id} is not below the next player id`);
    if (!(player.skill >= skill.min && player.skill <= skill.max))
      problems.push(`standout ${player.id} has skill ${player.skill}`);
    if (!(player.peakSkill >= skill.min && player.peakSkill <= skill.max))
      problems.push(`standout ${player.id} has peak skill ${player.peakSkill}`);
    if (!world.places[player.countryId]?.some((place) => place.name === player.birthplace))
      problems.push(`standout ${player.id} was born in an unknown place "${player.birthplace}"`);
    counts.set(player.countryId, (counts.get(player.countryId) ?? 0) + 1);
  }
  // A league may be promoted, restructured or fold between the standouts' turns, so only the
  // most any tier allows is checked.
  const most = Math.max(...Object.values(world.config.standouts.places));
  for (const country of state.countries) {
    const count = counts.get(country.countryId) ?? 0;
    counts.delete(country.countryId);
    if (count > most) problems.push(`"${country.countryId}" has ${count} standouts`);
  }
  for (const countryId of counts.keys())
    problems.push(`standouts in unknown country "${countryId}"`);
  return problems;
}
