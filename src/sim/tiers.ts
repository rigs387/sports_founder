import { tierEntry } from "./calendar";
import { playerFandomScore } from "./fandom";
import { leagueTierIndex } from "./leagues";
import { landmarks } from "./records";
import {
  type BreadthCondition,
  type GameState,
  PLAYER_INDEX,
  type TierTrack,
  type World,
} from "./types";
import { standing } from "./win";

// PP tier track (GDD Global PP Tier Track). Tier-ups need the Fandom Score threshold and the
// tier's breadth condition; they are announced telegraphTurns ahead and then happen regardless.
// Demotion is judged on the current tier's own requirements, needs a wide gap sustained for
// several turns, and respects a cooldown after any tier change.

/** The player's rank by Fandom Score among modeled sports (player + rivals), 1 = first. */
export function playerRank(state: Pick<GameState, "sports" | "countries">, world: World): number {
  return standing(state, world).rank;
}

/** Progress toward a breadth condition: 1 or more means met. */
export function breadthProgress(
  state: GameState,
  world: World,
  condition: BreadthCondition,
): number {
  const anchorIndex = world.countries.findIndex((c) => c.id === state.anchorCountryId);
  const anchor = state.countries[anchorIndex];
  switch (condition.type) {
    case "none":
      return 1;
    case "anchorLeagueTier": {
      const reached = anchor?.league ? leagueTierIndex(anchor.league.tier) + 1 : 0;
      return reached / (leagueTierIndex(condition.leagueTier) + 1);
    }
    case "anchorHardcoreShare": {
      const population = world.countries[anchorIndex]?.population ?? 1;
      const hardcore = anchor?.fans[PLAYER_INDEX]?.hardcore ?? 0;
      return hardcore / population / condition.share;
    }
    case "leaguesOnContinents": {
      const needed = leagueTierIndex(condition.leagueTier);
      const continents = new Set<string>();
      state.countries.forEach((country, index) => {
        const continent = world.countries[index]?.continent;
        if (country.league && continent && leagueTierIndex(country.league.tier) >= needed) {
          continents.add(continent);
        }
      });
      return continents.size / condition.continents;
    }
    case "globalRank": {
      const rank = playerRank(state, world);
      return rank <= condition.rank ? 1 : condition.rank / rank;
    }
  }
}

export interface TierStatus {
  score: number;
  /** Requirements to reach the next tier, or null at the top. */
  next: { tier: number; scoreProgress: number; breadthProgress: number } | null;
  /** How the current tier's own requirements stand (what demotion is judged on). */
  current: { scoreProgress: number; breadthProgress: number };
}

export function tierStatus(state: GameState, world: World): TierStatus {
  const { config } = world;
  const score = playerFandomScore(state.sports, state.countries, config.fandomScore.casualWeight);
  const here = tierEntry(state.ppTier, config);
  const nextEntry = config.ppTiers.find((tier) => tier.tier === state.ppTier + 1);
  const ratio = (value: number, required: number) => (required > 0 ? value / required : 1);
  return {
    score,
    next: nextEntry
      ? {
          tier: nextEntry.tier,
          scoreProgress: ratio(score, nextEntry.fandomScoreRequired),
          breadthProgress: breadthProgress(state, world, nextEntry.breadth),
        }
      : null,
    current: {
      scoreProgress: ratio(score, here.fandomScoreRequired),
      breadthProgress: breadthProgress(state, world, here.breadth),
    },
  };
}

/**
 * Focus slots after a tier change: new slots arrive empty; after a demotion the player owes slot
 * drops (focus keeps its length until they choose, or the default drop applies).
 */
function refitFocus(state: GameState, tier: number, world: World) {
  const slots = tierEntry(tier, world.config).focusSlots;
  const focus = [...state.focus];
  while (focus.length < slots) focus.push(null);
  return { focus, slotsToDrop: focus.length - slots };
}

/** Applies the end-of-turn tier check. `state` is after the turn's quarters and health checks. */
export function updateTierTrack(state: GameState, world: World): GameState {
  if (state.outcome !== null) return state;
  const settings = world.config.tierTrack;
  const turn = state.turn;
  const quarter = state.quarter;
  const tier = state.ppTier;
  const track: TierTrack = { ...state.tierTrack };
  const cooldownOver =
    track.lastChangeTurn === null || turn - track.lastChangeTurn >= settings.cooldownTurns;
  const status = tierStatus(state, world);
  const found = [];
  let newTier = tier;

  // Demotion: the current tier's requirements, a wide gap, sustained.
  if (tier > 1 && cooldownOver) {
    const atRisk =
      status.current.breadthProgress < settings.demotionLine ||
      status.current.scoreProgress < settings.demotionLine;
    track.turnsBelowLine = atRisk ? track.turnsBelowLine + 1 : 0;
    if (track.turnsBelowLine >= settings.demotionTurns) {
      newTier = tier - 1;
      track.turnsBelowLine = 0;
      track.pendingTierUp = null;
      track.lastChangeTurn = turn;
      found.push(landmarks.ppTierDown(turn, quarter, tier, newTier));
    }
  } else {
    track.turnsBelowLine = 0;
  }

  // Tier-up: announced, then unavoidable.
  if (newTier === tier) {
    const pending = track.pendingTierUp;
    const promote = (to: number) => {
      newTier = to;
      track.pendingTierUp = null;
      track.turnsBelowLine = 0;
      track.lastChangeTurn = turn;
      found.push(landmarks.ppTierUp(turn, quarter, tier, to));
    };
    if (pending !== null) {
      const turnsLeft = pending.turnsLeft - 1;
      if (turnsLeft <= 0) promote(pending.tier);
      else track.pendingTierUp = { tier: pending.tier, turnsLeft };
    } else if (
      cooldownOver &&
      status.next !== null &&
      status.next.scoreProgress >= 1 &&
      status.next.breadthProgress >= 1
    ) {
      if (settings.telegraphTurns === 0) promote(status.next.tier);
      else track.pendingTierUp = { tier: status.next.tier, turnsLeft: settings.telegraphTurns };
    }
  }

  track.peakTier = Math.max(track.peakTier, newTier);
  const { focus, slotsToDrop } = refitFocus(state, newTier, world);
  track.slotsToDrop = slotsToDrop;
  return {
    ...state,
    ppTier: newTier,
    tierTrack: track,
    focus,
    landmarks: found.length > 0 ? [...state.landmarks, ...found] : state.landmarks,
  };
}

/** Applies the default slot drop the player did not choose: the highest-numbered slots go. */
export function applyDefaultSlotDrops(state: GameState): GameState {
  const owed = state.tierTrack.slotsToDrop;
  if (owed <= 0) return state;
  return {
    ...state,
    focus: state.focus.slice(0, state.focus.length - owed),
    tierTrack: { ...state.tierTrack, slotsToDrop: 0 },
  };
}
