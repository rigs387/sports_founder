import { offseasonOpen } from "./calendar";
import { activeClubs } from "./flagship";
import { landmarks } from "./records";
import { nextFloat, restoreRng, saveRng } from "./rng";
import { departStandout } from "./standouts";
import type { Club, GameState, Player, Standout, World } from "./types";

// Talent pull (GDD v1.37): the flagship draws the best players from the other leagues. A club
// whose leading player retired gets a young replacement at the season's end; while the offseason
// is open, the best standout abroad who is better than that replacement may take the place
// instead. They keep their birthplace, so they still play for their country.

/** A flagship club a standout could join: its retired leader's replacement has not played yet. */
export interface Opening {
  club: Club;
  rookie: Player;
}

/** The seat's openings while the offseason is open, the strongest club first. */
export function openings(state: GameState): Opening[] {
  const { flagship } = state;
  if (!offseasonOpen(state)) return [];
  const retiredAt = new Set(
    flagship.players
      .filter((player) => player.retiredSeason === flagship.season - 1)
      .map((player) => player.clubId),
  );
  return activeClubs(flagship)
    .flatMap((club): Opening[] => {
      const rookie = flagship.players.find(
        (player) => player.clubId === club.id && player.retiredSeason === null,
      );
      const untried =
        rookie !== undefined &&
        rookie.career.length === 0 &&
        rookie.backing === null &&
        rookie.starSince === null &&
        rookie.countryId === flagship.countryId;
      return rookie && untried && retiredAt.has(club.id) ? [{ club, rookie }] : [];
    })
    .sort((a, b) => b.club.rating - a.club.rating || a.club.id - b.club.id);
}

/** The best standout abroad who is better than `skill` and not in their final season. */
export function bestAbroad(state: GameState, skill: number): Standout | null {
  const candidates = state.standouts.players
    .filter((player) => !player.finalSeason && player.skill > skill)
    .sort((a, b) => b.skill - a.skill || a.id - b.id);
  return candidates[0] ?? null;
}

/** How many standouts the seat's league may draw on their own in one offseason. */
export function pullPlaces(state: GameState, world: World): number {
  const seat = state.countries.find((country) => country.countryId === state.flagship.countryId);
  return seat?.league ? world.config.standouts.talentPull.perOffseason[seat.league.tier] : 0;
}

/** The standout and the opening a signing card would name now, or null. */
export function signingOffer(
  state: GameState,
  world: World,
): { standout: Standout; opening: Opening } | null {
  if (pullPlaces(state, world) <= 0 || state.flagship.pendingCountryId !== null) return null;
  const opening = openings(state)[0];
  const standout = opening ? bestAbroad(state, opening.rookie.skill) : null;
  return opening && standout ? { standout, opening } : null;
}

/** Whether the standout can still join the club now. */
export function canJoin(state: GameState, standoutId: number, clubId: number): boolean {
  return (
    state.standouts.players.some((player) => player.id === standoutId) &&
    openings(state).some((opening) => opening.club.id === clubId)
  );
}

/**
 * A standout joins a flagship club as its leading player: the untried replacement steps aside,
 * the home league gets a young replacement, and a landmark records the move.
 */
export function joinFlagship(
  state: GameState,
  world: World,
  standoutId: number,
  clubId: number,
  signed: boolean,
): GameState {
  const standout = state.standouts.players.find((player) => player.id === standoutId);
  const opening = openings(state).find((entry) => entry.club.id === clubId);
  if (!standout || !opening) return state;
  const joined: Player = {
    id: standout.id,
    name: standout.name,
    countryId: standout.countryId,
    birthplace: standout.birthplace,
    clubId,
    birthSeason: standout.birthSeason,
    peakSkill: standout.peakSkill,
    skill: standout.skill,
    starSince: null,
    finalSeason: false,
    retiredSeason: null,
    backing: null,
    career: [],
  };
  const players = [
    ...state.flagship.players.filter((player) => player.id !== opening.rookie.id),
    joined,
  ].sort((a, b) => a.id - b.id);
  const left = departStandout(
    { ...state, flagship: { ...state.flagship, players } },
    world,
    standoutId,
  );
  return {
    ...left,
    landmarks: [
      ...left.landmarks,
      landmarks.talentJoined(
        state.turn,
        state.quarter,
        standout.countryId,
        // The season just finished: they join in the offseason after it.
        state.flagship.season - 1,
        standout.id,
        clubId,
        signed,
      ),
    ],
  };
}

/**
 * The pull itself, at the start of `endTurn` before the offseason closes: each opening left, the
 * strongest club first, takes the best standout abroad with the configured chance, up to the
 * seat league's places. A seat about to move pulls no one.
 */
export function pullTalent(state: GameState, world: World): GameState {
  const places = pullPlaces(state, world);
  if (!offseasonOpen(state) || places <= 0 || state.flagship.pendingCountryId !== null)
    return state;
  if (state.standouts.players.length === 0 || openings(state).length === 0) return state;
  const { chance } = world.config.standouts.talentPull;
  const rng = restoreRng(state.standouts.rng);
  const picked: Opening[] = [];
  for (const opening of openings(state)) {
    if (picked.length >= places) break;
    if (nextFloat(rng) < chance) picked.push(opening);
  }
  let next: GameState = { ...state, standouts: { ...state.standouts, rng: saveRng(rng) } };
  for (const opening of picked) {
    const standout = bestAbroad(next, opening.rookie.skill);
    if (standout) next = joinFlagship(next, world, standout.id, opening.club.id, false);
  }
  return next;
}
