import { offseasonOpen, QUARTERS_PER_YEAR, yearOfQuarter } from "./calendar";
import { tidyName } from "./identity";
import { nationalTeams } from "./national-teams";
import { ppPrice } from "./prices";
import { landmarks } from "./records";
import { createRngState, nextFloat, restoreRng, saveRng } from "./rng";
import type { GameState, World, WorldChampionshipState } from "./types";

// The World Championship (GDD v1.37): the sport's own tournament of national teams. This file
// holds its founding, its calendar and its hosts; the tournament itself is played by a later
// build step, so for now a tournament's date passes with only its host on record.
//
// The calendar runs on flagship seasons: a tournament is played when a season ends. The one
// founded in an offseason is played after the season about to start, then every `everySeasons`.
// Countries bid in the offseason before, and the player picks the host there.

const CHAMPIONSHIP_STREAM = 0x1f83_d9ab;

export function newWorldChampionship(seed: number): WorldChampionshipState {
  return {
    rng: createRngState((seed ^ CHAMPIONSHIP_STREAM) >>> 0),
    founded: null,
    nextSeason: null,
    bids: [],
    hostId: null,
    tournaments: [],
  };
}

/** What founding costs now: quarters of PP income. */
export function foundingPrice(state: Pick<GameState, "countries">, world: World): number {
  return ppPrice(state, world, world.config.worldChampionship.foundingQuarters);
}

function nameProblem(world: World, name: string): boolean {
  const tidy = tidyName(name);
  const { nameMinLength, trophyNameMaxLength } = world.config.identity;
  return tidy.length < nameMinLength || tidy.length > trophyNameMaxLength;
}

/** Why the championship cannot be founded now, or null when it can. */
export type FoundBlocker = "founded" | "window" | "teams" | "name" | "pp";
export function foundBlocker(state: GameState, world: World, name: string): FoundBlocker | null {
  if (state.worldChampionship.founded !== null) return "founded";
  if (!offseasonOpen(state)) return "window";
  if (nationalTeams(state, world).length < world.config.worldChampionship.foundingTeams)
    return "teams";
  if (nameProblem(world, name)) return "name";
  return state.pp < foundingPrice(state, world) ? "pp" : null;
}

/** Wealth level, then population: the order bidders are ranked by when the player does not pick. */
function wealthiest(world: World, countryIds: readonly string[]): string | undefined {
  const rank = (id: string) => {
    const index = world.countries.findIndex((country) => country.id === id);
    return {
      wealth: world.derived[index]?.wealthLevel ?? 0,
      population: world.countries[index]?.population ?? 0,
    };
  };
  return [...countryIds].sort((a, b) => {
    const [x, y] = [rank(a), rank(b)];
    return y.wealth - x.wealth || y.population - x.population || a.localeCompare(b);
  })[0];
}

/**
 * The bids for the next tournament (GDD v1.37): a few countries with a league, drawn without
 * repeats by wealth (bidWealthBase ^ wealth level), never the last host. Fewer if few have leagues.
 */
function drawBids(state: GameState, world: World): GameState {
  const championship = state.worldChampionship;
  const rules = world.config.worldChampionship;
  const rng = restoreRng(championship.rng);
  const lastHost = championship.tournaments.at(-1)?.hostId;
  const pool = state.countries.flatMap((country, index) =>
    country.league && country.countryId !== lastHost
      ? [
          {
            countryId: country.countryId,
            weight: rules.bidWealthBase ** (world.derived[index]?.wealthLevel ?? 0),
          },
        ]
      : [],
  );
  const wanted =
    rules.bids.min + Math.floor(nextFloat(rng) * (rules.bids.max - rules.bids.min + 1));
  const bids: string[] = [];
  while (bids.length < wanted && pool.length > 0) {
    let roll = nextFloat(rng) * pool.reduce((sum, entry) => sum + entry.weight, 0);
    let pick = pool.length - 1;
    for (let i = 0; i < pool.length; i += 1) {
      roll -= pool[i]?.weight ?? 0;
      if (roll < 0) {
        pick = i;
        break;
      }
    }
    const [chosen] = pool.splice(pick, 1);
    if (chosen) bids.push(chosen.countryId);
  }
  return { ...state, worldChampionship: { ...championship, rng: saveRng(rng), bids } };
}

/** Whether the bids for the next tournament are due: its offseason is open and nothing is set. */
function bidsDue(state: GameState): boolean {
  const championship = state.worldChampionship;
  return (
    championship.founded !== null &&
    offseasonOpen(state) &&
    championship.nextSeason === state.flagship.season &&
    championship.hostId === null &&
    championship.bids.length === 0
  );
}

/**
 * Founds the World Championship (checked by the caller): the price is paid, the first tournament
 * is set for the end of the season about to start, and its bids arrive at once.
 */
export function foundChampionship(state: GameState, world: World, name: string): GameState {
  const founded: GameState = {
    ...state,
    pp: state.pp - foundingPrice(state, world),
    worldChampionship: {
      ...state.worldChampionship,
      founded: {
        name: tidyName(name),
        turn: state.turn,
        year: yearOfQuarter(state.quarter, world.config),
      },
      nextSeason: state.flagship.season,
    },
    landmarks: [
      ...state.landmarks,
      landmarks.championshipFounded(state.turn, state.quarter, state.flagship.countryId),
    ],
  };
  return drawBids(founded, world);
}

/** Why a country cannot be picked as host now, or null when it can. */
export type HostBlocker = "none" | "window" | "chosen" | "bidder";
export function hostBlocker(state: GameState, countryId: string): HostBlocker | null {
  const championship = state.worldChampionship;
  if (championship.founded === null) return "none";
  if (championship.hostId !== null) return "chosen";
  if (championship.bids.length === 0) return "none";
  if (!offseasonOpen(state)) return "window";
  return championship.bids.includes(countryId) ? null : "bidder";
}

function setHost(state: GameState, countryId: string, picked: boolean): GameState {
  return {
    ...state,
    worldChampionship: { ...state.worldChampionship, hostId: countryId, bids: [] },
    landmarks: [
      ...state.landmarks,
      landmarks.championshipHost(
        state.turn,
        state.quarter,
        countryId,
        state.worldChampionship.nextSeason ?? state.flagship.season,
        picked,
      ),
    ],
  };
}

/** The player picks the host from the bids (checked by the caller). The pick is final. */
export function pickHost(state: GameState, countryId: string): GameState {
  return setHost(state, countryId, true);
}

/**
 * Before the offseason closes (the start of `endTurn`): bids nobody chose from go to the
 * wealthiest bidder.
 */
export function settleHost(state: GameState, world: World): GameState {
  const championship = state.worldChampionship;
  if (!offseasonOpen(state) || championship.hostId !== null || championship.bids.length === 0)
    return state;
  const host = wealthiest(world, championship.bids);
  return host ? setHost(state, host, false) : state;
}

/**
 * The championship's turn, at the end of `endTurn`: a tournament whose season has ended passes
 * into the record with its host (the tournament itself is a later build step) and the next is
 * set `everySeasons` on; then the bids for a tournament whose offseason has opened arrive.
 */
export function updateChampionship(state: GameState, world: World): GameState {
  let next = state;
  const championship = next.worldChampionship;
  const due = championship.nextSeason;
  if (championship.founded !== null && due !== null && next.flagship.season > due) {
    const ended = next.flagship.seasons.find((season) => season.season === due);
    next = {
      ...next,
      worldChampionship: {
        ...championship,
        nextSeason: due + world.config.worldChampionship.everySeasons,
        hostId: null,
        bids: [],
        tournaments: championship.hostId
          ? [
              ...championship.tournaments,
              {
                season: due,
                year: yearOfQuarter(ended?.quarter ?? next.quarter, world.config),
                hostId: championship.hostId,
              },
            ]
          : championship.tournaments,
      },
    };
  }
  return bidsDue(next) ? drawBids(next, world) : next;
}

/** The year the next tournament is played: when its flagship season ends. */
export function nextTournamentYear(state: GameState, world: World): number | null {
  const { nextSeason } = state.worldChampionship;
  if (nextSeason === null) return null;
  const { flagship } = state;
  const left = flagship.offseason
    ? QUARTERS_PER_YEAR
    : Math.max(0, flagship.seasonQuarters - flagship.quartersPlayed);
  const later = Math.max(0, nextSeason - flagship.season) * QUARTERS_PER_YEAR;
  return yearOfQuarter(state.quarter + left + later, world.config);
}

/** The championship as the UI shows it. */
export interface ChampionshipSnapshot {
  founded: { name: string; year: number } | null;
  /** Countries that can field a team now, and how many founding needs. */
  teams: number;
  teamsNeeded: number;
  price: number;
  /** Why it cannot be founded now, the name aside; null when it can, or once it is founded. */
  blocker: Exclude<FoundBlocker, "name" | "founded"> | null;
  nameLimits: { min: number; max: number };
  everySeasons: number;
  nextYear: number | null;
  /** The bids on the table, in the order they came, with each bidder's wealth level id. */
  bids: { countryId: string; wealthLevel: string }[];
  /** Whether a bid can be picked now. */
  canPick: boolean;
  hostId: string | null;
  /** Past tournaments, oldest first. */
  tournaments: { season: number; year: number; hostId: string }[];
}

export function championshipSnapshot(state: GameState, world: World): ChampionshipSnapshot {
  const championship = state.worldChampionship;
  const rules = world.config.worldChampionship;
  const { identity, wealthLevels } = world.config;
  const blocker = foundBlocker(state, world, "x".repeat(identity.nameMinLength));
  return {
    founded: championship.founded
      ? { name: championship.founded.name, year: championship.founded.year }
      : null,
    teams: nationalTeams(state, world).length,
    teamsNeeded: rules.foundingTeams,
    price: foundingPrice(state, world),
    blocker: blocker === "name" || blocker === "founded" ? null : blocker,
    nameLimits: { min: identity.nameMinLength, max: identity.trophyNameMaxLength },
    everySeasons: rules.everySeasons,
    nextYear: nextTournamentYear(state, world),
    bids: championship.bids.map((countryId) => {
      const index = world.countries.findIndex((country) => country.id === countryId);
      return {
        countryId,
        wealthLevel: wealthLevels.levels[world.derived[index]?.wealthLevel ?? 0]?.id ?? "",
      };
    }),
    canPick: championship.bids.length > 0 && championship.hostId === null && offseasonOpen(state),
    hostId: championship.hostId,
    tournaments: championship.tournaments,
  };
}

/** Every way the championship's state is invalid. */
export function championshipProblems(state: GameState, world: World): string[] {
  const problems: string[] = [];
  const championship = state.worldChampionship;
  const known = (id: string) => world.countries.some((country) => country.id === id);
  if ((championship.founded === null) !== (championship.nextSeason === null))
    problems.push("the championship's calendar does not match its founding");
  if (championship.founded === null) {
    if (championship.bids.length > 0 || championship.hostId !== null)
      problems.push("an unfounded championship has bids or a host");
    if (championship.tournaments.length > 0)
      problems.push("an unfounded championship has tournaments");
  }
  if (championship.hostId !== null && championship.bids.length > 0)
    problems.push("the championship has a host and bids still on the table");
  for (const id of [...championship.bids, ...(championship.hostId ? [championship.hostId] : [])])
    if (!known(id)) problems.push(`the championship names an unknown country "${id}"`);
  if (new Set(championship.bids).size !== championship.bids.length)
    problems.push("a country bids twice for the championship");
  let last = 0;
  for (const tournament of championship.tournaments) {
    if (tournament.season <= last || tournament.season >= state.flagship.season)
      problems.push(`championship tournament of season ${tournament.season} is out of order`);
    last = tournament.season;
    if (!known(tournament.hostId))
      problems.push(`a championship was hosted by an unknown country "${tournament.hostId}"`);
  }
  return problems;
}
