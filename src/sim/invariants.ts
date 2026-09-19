import { genomeSchema, IDENTITY_AXES } from "../content";
import { QUARTERS_PER_YEAR } from "./calendar";
import { forkOf } from "./growth";
import {
  ESCALATION_LEVELS,
  type GameState,
  HEALTH_LEVELS,
  LEAGUE_TIERS,
  OTHER_SPORT_ID,
  PLAYER_SPORT_ID,
  type World,
} from "./types";

/** Returns every way `state` is invalid for `world`. An empty list means the state is valid. */
export function checkInvariants(state: GameState, world: World): string[] {
  return invariantsOf(state, world);
}

export function invariantsOf(state: GameState, world: World): string[] {
  const problems: string[] = [];

  if (!Number.isInteger(state.turn) || state.turn < 1)
    problems.push(`turn ${state.turn} is invalid`);
  if (!Number.isInteger(state.quarter) || state.quarter < 0) {
    problems.push(`quarter ${state.quarter} is invalid`);
  }
  if (!Number.isFinite(state.pp) || state.pp < 0) problems.push(`pp ${state.pp} is invalid`);
  const tier = world.config.ppTiers.find((entry) => entry.tier === state.ppTier);
  if (!tier) problems.push(`ppTier ${state.ppTier} is not in the tier table`);
  const anchorIndex = world.countries.findIndex((country) => country.id === state.anchorCountryId);
  if (anchorIndex < 0) {
    problems.push(`anchor "${state.anchorCountryId}" is not a known country`);
  }

  const genome = genomeSchema.safeParse(state.genome);
  if (!genome.success) {
    for (const issue of genome.error.issues) {
      problems.push(`genome ${issue.path.join(".")}: ${issue.message}`);
    }
  }

  const track = state.tierTrack;
  if (track.peakTier < state.ppTier) {
    problems.push(`peak tier ${track.peakTier} is below the current tier ${state.ppTier}`);
  }
  if (track.pendingTierUp && track.pendingTierUp.tier !== state.ppTier + 1) {
    problems.push(`pending tier-up to ${track.pendingTierUp.tier} is not the next tier`);
  }
  if (tier && state.focus.length !== tier.focusSlots + track.slotsToDrop) {
    problems.push(
      `${state.focus.length} focus slot(s) but tier ${tier.tier} has ${tier.focusSlots} plus ${track.slotsToDrop} to drop`,
    );
  }
  const focused = new Set<string>();
  state.focus.forEach((countryId, slot) => {
    if (countryId === null) return;
    if (!world.countries.some((country) => country.id === countryId)) {
      problems.push(`focus slot ${slot} points at unknown country "${countryId}"`);
    }
    if (focused.has(countryId)) problems.push(`"${countryId}" holds more than one focus slot`);
    focused.add(countryId);
  });

  // Growth tree: known nodes, owned once, prerequisites owned first, at most one side of a fork.
  const nodeIds = new Set(world.growthTree.nodes.map((node) => node.id));
  const ownedSoFar = new Set<string>();
  for (const nodeId of state.growthNodes) {
    const node = world.growthTree.nodes.find((candidate) => candidate.id === nodeId);
    if (!nodeIds.has(nodeId) || !node) {
      problems.push(`growth node "${nodeId}" is not in the growth tree`);
      continue;
    }
    if (ownedSoFar.has(nodeId)) problems.push(`growth node "${nodeId}" is owned more than once`);
    for (const required of node.requires) {
      if (!ownedSoFar.has(required)) {
        problems.push(`growth node "${nodeId}" was bought before its prerequisite "${required}"`);
      }
    }
    const fork = forkOf(world, nodeId);
    const sibling = fork?.nodes.find((id) => id !== nodeId && ownedSoFar.has(id));
    if (fork && sibling !== undefined) {
      problems.push(`growth nodes "${sibling}" and "${nodeId}" are both owned in fork ${fork.id}`);
    }
    ownedSoFar.add(nodeId);
  }

  const expectedSports = [
    PLAYER_SPORT_ID,
    ...world.rivals.map((rival) => rival.id),
    OTHER_SPORT_ID,
  ];
  const actualSports = state.sports.map((sport) => sport.id);
  if (actualSports.join("|") !== expectedSports.join("|")) {
    problems.push(`sports [${actualSports}] do not match content [${expectedSports}]`);
  }
  state.sports.forEach((sport, index) => {
    const expectedKind =
      index === 0 ? "player" : index === expectedSports.length - 1 ? "other" : "rival";
    if (sport.kind !== expectedKind) problems.push(`sport "${sport.id}" should be ${expectedKind}`);
  });

  const rivalIds = world.rivals.map((rival) => rival.id);
  const stateRivalIds = state.rivals.map((rival) => rival.sportId);
  if (stateRivalIds.join("|") !== rivalIds.join("|")) {
    problems.push(`rivals [${stateRivalIds}] do not match content [${rivalIds}]`);
  }
  state.rivals.forEach((rival, i) => {
    const where = `rival "${rival.sportId}"`;
    const parsed = genomeSchema.safeParse(rival.genome);
    if (!parsed.success) {
      problems.push(`${where}: invalid genome`);
    } else {
      // Rule copying changes rule traits only; identity traits keep a sport recognizable.
      const content = world.rivals[i]?.genome;
      for (const axis of IDENTITY_AXES) {
        if (content && rival.genome[axis] !== content[axis]) {
          problems.push(`${where}: identity trait ${axis} changed`);
        }
      }
    }
    for (const field of ["budget", "budgetSpent"] as const) {
      if (!Number.isFinite(rival[field]) || rival[field] < 0) {
        problems.push(`${where}: ${field} ${rival[field]} is invalid`);
      }
    }
  });

  if (state.countries.length !== world.countries.length) {
    problems.push(
      `state has ${state.countries.length} countries but content has ${world.countries.length}`,
    );
  }
  state.countries.forEach((countryState, index) => {
    const country = world.countries[index];
    if (!country || country.id !== countryState.countryId) {
      problems.push(`country #${index} "${countryState.countryId}" does not match content`);
      return;
    }
    if (countryState.fans.length !== state.sports.length) {
      problems.push(`${country.id}: has fans for ${countryState.fans.length} sports`);
    }
    let hardcore = 0;
    countryState.fans.forEach((fans, sportIndex) => {
      const where = `${country.id}/${fans.sportId}`;
      if (fans.sportId !== state.sports[sportIndex]?.id) problems.push(`${where}: out of order`);
      for (const bucket of ["casual", "hardcore"] as const) {
        const value = fans[bucket];
        if (!Number.isSafeInteger(value) || value < 0) {
          problems.push(`${where}: ${bucket} ${value} is not a non-negative whole number`);
        }
      }
      if (fans.casual + fans.hardcore > country.population) {
        problems.push(`${where}: casual + hardcore exceeds population`);
      }
      hardcore += fans.hardcore;
    });
    if (hardcore > country.population) {
      problems.push(`${country.id}: hardcore fans across sports exceed population`);
    }

    const league = countryState.league;
    if (league) {
      if (!LEAGUE_TIERS.includes(league.tier)) problems.push(`${country.id}: bad league tier`);
      if (!HEALTH_LEVELS.includes(league.health)) problems.push(`${country.id}: bad league health`);
      if (!Number.isFinite(league.cash)) problems.push(`${country.id}: league cash is not finite`);
      if (league.formedQuarter > state.quarter) {
        problems.push(`${country.id}: league formed in the future`);
      }
    }
    // Before the win an anchor collapse ends the campaign; after it the anchor may lose its league.
    if (index === anchorIndex && state.outcome === null && state.win.won === null && !league) {
      problems.push(`the anchor has no league but the campaign has not ended`);
    }

    const fronts = countryState.defense.map((front) => front.sportId);
    if (fronts.join("|") !== rivalIds.join("|")) {
      problems.push(`${country.id}: defense fronts [${fronts}] do not match rivals [${rivalIds}]`);
    }
    for (const front of countryState.defense) {
      const where = `${country.id}/${front.sportId}`;
      if (!ESCALATION_LEVELS.includes(front.level)) problems.push(`${where}: bad escalation level`);
      if (!Number.isFinite(front.pressure) || front.pressure < 0) {
        problems.push(`${where}: pressure ${front.pressure} is invalid`);
      }
    }
    const inEffect = new Set<string>();
    for (const move of countryState.countermoves) {
      const where = `${country.id}: ${move.kind} by "${move.sportId}"`;
      if (!rivalIds.includes(move.sportId)) problems.push(`${where}: not a rival`);
      if (move.endQuarter <= state.quarter) {
        problems.push(`${where} ended at quarter ${move.endQuarter} but is still in effect`);
      }
      // A rival's own boosts are per rival; a block on the player is never doubled up.
      const key =
        move.kind === "broadcastDeal" || move.kind === "sponsorLockout"
          ? move.kind
          : `${move.kind}/${move.sportId}`;
      if (inEffect.has(key)) problems.push(`${where}: already in effect there`);
      inEffect.add(key);
    }
  });

  if (state.win.turnsHeld > 0 && !state.win.atTop) {
    problems.push(`the win hold is ${state.win.turnsHeld} turn(s) but the sport is not #1`);
  }
  const won = state.win.won;
  if (won !== null && (won.turn >= state.turn || won.quarter > state.quarter)) {
    problems.push(`the win is dated turn ${won.turn}, quarter ${won.quarter}, in the future`);
  }
  if (won !== null && state.outcome !== null) {
    problems.push(
      "the campaign ended after the win, but winning makes an anchor collapse survivable",
    );
  }
  if (state.outcome !== null && state.outcome.countryId !== state.anchorCountryId) {
    problems.push(`the campaign ended on "${state.outcome.countryId}", which is not the anchor`);
  }
  // Yearly snapshots run consecutively up to the last completed year. A campaign migrated from an
  // older save may lack the years before history was recorded, but never has gaps or extras.
  const fullYears = Math.floor(state.quarter / QUARTERS_PER_YEAR);
  if (state.yearly.length > fullYears) {
    problems.push(`${state.yearly.length} yearly snapshots after ${fullYears} full year(s)`);
  }
  const lastFullYear = world.config.calendar.startYear + fullYears - 1;
  state.yearly.forEach((snapshot, i) => {
    const expectedYear = lastFullYear - (state.yearly.length - 1 - i);
    if (snapshot.year !== expectedYear) {
      problems.push(`yearly snapshot ${i} is for ${snapshot.year}, expected ${expectedYear}`);
    }
  });
  const fansPerYear = state.countries.length * state.sports.length * 2;
  state.yearly.forEach((snapshot, i) => {
    if (snapshot.fans.length !== fansPerYear) {
      problems.push(`yearly snapshot ${i} has ${snapshot.fans.length} values, not ${fansPerYear}`);
    }
  });

  return problems;
}
