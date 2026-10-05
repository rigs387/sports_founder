import { RULE_AXES, TRADITION_TYPES, type TraditionType } from "../content";
import { yearOfQuarter } from "./calendar";
import { createRngState } from "./rng";
import type {
  AxisId,
  Club,
  CultureState,
  GameState,
  Genome,
  SportIdentity,
  Tradition,
  World,
} from "./types";

// Culture, first build (GDD v1.22). Culture is never bought: traditions are born only from
// recorded facts, held by the player's fans in follower countries, renewed by new facts and faded
// without them. Six types: derby, club rite, star legacy, national name, famous venue and the
// trophy. They make the player's hardcore fans stickier (generational turnover, rival poaching and
// reclaim) and make them resist betrayal: amendments that move away from the rules a tradition was
// born under, moving the commissioner's seat away from them, and renaming the trophy. Founding
// character biases births (birthplace) and betrayals (ethos). Every number is config (`culture`).
//
// Culture reads facts after they are recorded (landmarks and season summaries) once per turn, and
// rolls reach on its own random stream, so the world's random sequence never depends on it.

/** Distinguishes culture's random stream from the world's, the flagship's and identity's. */
const CULTURE_STREAM = 0x2545_f491;

/** Culture at a campaign's start, or when an older save first gains it. */
export function newCulture(
  seed: number,
  startSeason: number,
  landmarkCursor: number,
  quarter: number,
  world: World,
): CultureState {
  return {
    startSeason,
    landmarkCursor,
    year: yearOfQuarter(quarter, world.config),
    rng: createRngState((seed ^ CULTURE_STREAM) >>> 0),
    traditions: [],
    nextId: 1,
    stokes: [],
    naming: null,
  };
}

/** A small stable hash of a string (FNV-1a), for names that must not consume a random stream. */
function hash(text: string): number {
  let h = 0x811c_9dc5;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x0100_0193) >>> 0;
  }
  return h;
}

/**
 * A club's ground (GDD v1.22): the founding club's is named at setup; every other club's is its
 * town and a ground word, fixed by the club itself so it never consumes a random stream.
 */
export function clubGround(
  club: Club,
  identity: Pick<SportIdentity, "foundingClubId" | "groundName">,
  world: World,
): string {
  if (club.id === identity.foundingClubId) return identity.groundName;
  const words = world.names.groundWords;
  const word = words[hash(`${club.countryId}|${club.place}|${club.id}`) % words.length] ?? "";
  return `${club.place} ${word}`;
}

/** The rule traits of a genome, as a tradition remembers them. */
export function ruleTraits(genome: Genome): Partial<Record<AxisId, string>> {
  return Object.fromEntries(RULE_AXES.map((axis) => [axis, genome[axis]]));
}

export const living = (tradition: Tradition) => tradition.lost === null;

/** Every way the culture state is invalid (see src/sim/invariants.ts). */
export function cultureProblems(state: GameState, world: World): string[] {
  const problems: string[] = [];
  const { culture } = state;
  const known = new Set(world.countries.map((country) => country.id));
  if (culture.landmarkCursor > state.landmarks.length)
    problems.push("culture: landmark cursor is in the future");
  if (culture.startSeason < 1 || culture.startSeason > state.flagship.season)
    problems.push("culture: start season is invalid");
  const ids = new Set<number>();
  for (const tradition of culture.traditions) {
    const at = `culture: tradition ${tradition.id}`;
    if (ids.has(tradition.id) || tradition.id >= culture.nextId)
      problems.push(`${at} has a bad id`);
    ids.add(tradition.id);
    if (!TRADITION_TYPES.includes(tradition.type)) problems.push(`${at} has an unknown type`);
    if (!(tradition.strength >= 0 && tradition.strength <= 1))
      problems.push(`${at} strength ${tradition.strength} is outside 0–1`);
    if (tradition.followers[0] !== tradition.countryId)
      problems.push(`${at} does not list its home first`);
    if (new Set(tradition.followers).size !== tradition.followers.length)
      problems.push(`${at} lists a follower twice`);
    for (const countryId of tradition.followers)
      if (!known.has(countryId)) problems.push(`${at} names unknown country "${countryId}"`);
    for (const clubId of tradition.clubIds)
      if (clubId >= state.flagship.nextClubId) problems.push(`${at} names an unknown club`);
    if (tradition.playerId !== null && tradition.playerId >= state.flagship.nextPlayerId)
      problems.push(`${at} names an unknown player`);
    if (tradition.bornTurn > state.turn || tradition.bornQuarter > state.quarter)
      problems.push(`${at} is born in the future`);
    if (tradition.lost === null && tradition.strength <= 0)
      problems.push(`${at} has no strength but is not lost`);
  }
  if (culture.naming !== null) {
    const trophy = culture.traditions.find((t) => t.id === culture.naming);
    if (!trophy || trophy.type !== "trophy" || trophy.lost !== null)
      problems.push("culture: the trophy to name is not a living trophy");
  }
  for (const stoke of culture.stokes)
    if (stoke.clubIds.length !== 2 || stoke.clubIds.some((id) => id >= state.flagship.nextClubId))
      problems.push("culture: a derby stoke names unknown clubs");
  return problems;
}
