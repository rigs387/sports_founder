import { offseasonOpen, QUARTERS_PER_YEAR, yearOfQuarter } from "./calendar";
import { tidyName } from "./identity";
import { runningCostPerQuarter } from "./leagues";
import { type NationalTeam, nationalTeams } from "./national-teams";
import { ppPrice } from "./prices";
import { landmarks } from "./records";
import { createRngState, nextFloat, type Rng, restoreRng, saveRng } from "./rng";
import {
  type ChampionshipLift,
  type ChampionshipMatch,
  type ChampionshipTournament,
  type GameState,
  PLAYER_INDEX,
  type World,
  type WorldChampionshipState,
} from "./types";

// The World Championship (GDD v1.37): the sport's own tournament of national teams. This file
// holds its founding, its calendar and hosts, and the tournament itself: a seeded knockout played
// in one turn, whose results lift the sport where its teams came from.
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
    lifts: [],
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

/** Seed positions for a knockout of `size` (a power of two): 1 meets the last, and so on. */
function seedOrder(size: number): number[] {
  let order = [1];
  while (order.length < size) order = order.flatMap((seed) => [seed, 2 * order.length + 1 - seed]);
  return order;
}

/**
 * The field (GDD v1.37): the strongest teams that fill the largest configured size, or the
 * largest power of two if too few can be fielded; the host always enters, in the weakest place.
 */
function drawField(state: GameState, world: World, hostId: string): NationalTeam[] {
  const all = nationalTeams(state, world, hostId);
  const sizes = [...world.config.worldChampionship.fieldSizes].sort((a, b) => b - a);
  let size = sizes.find((candidate) => candidate <= all.length) ?? 0;
  if (size === 0) size = all.length >= 2 ? 2 ** Math.floor(Math.log2(all.length)) : 0;
  const field = all.slice(0, size);
  const host = all.find((team) => team.countryId === hostId);
  if (size > 0 && host && !field.includes(host)) field[size - 1] = host;
  return field;
}

/** Plays the knockout: each match goes to a side by the odds of the strength gap. */
function playKnockout(
  field: readonly NationalTeam[],
  hostId: string,
  world: World,
  rng: Rng,
): ChampionshipMatch[][] {
  const { upsetScale, hostBonus } = world.config.worldChampionship;
  const strength = (team: NationalTeam) =>
    team.strength + (team.countryId === hostId ? hostBonus : 0);
  let alive = seedOrder(field.length).flatMap((seed) => field[seed - 1] ?? []);
  const rounds: ChampionshipMatch[][] = [];
  while (alive.length > 1) {
    const matches: ChampionshipMatch[] = [];
    const through: NationalTeam[] = [];
    for (let i = 0; i + 1 < alive.length; i += 2) {
      const [a, b] = [alive[i], alive[i + 1]];
      if (!a || !b) continue;
      const odds = 1 / (1 + 10 ** ((strength(b) - strength(a)) / upsetScale));
      const winner = nextFloat(rng) < odds ? a : b;
      matches.push({ a: a.countryId, b: b.countryId, winner: winner.countryId });
      through.push(winner);
    }
    rounds.push(matches);
    alive = through;
  }
  return rounds;
}

/** How many matches a team won in a tournament. */
export function roundsWon(tournament: ChampionshipTournament, countryId: string): number {
  return tournament.rounds.filter((round) => round.some((match) => match.winner === countryId))
    .length;
}

/** The teams whose run was an underdog's: seeded in the bottom of the field, in the last four. */
export function underdogs(tournament: ChampionshipTournament, world: World): string[] {
  const { seedShare } = world.config.worldChampionship.underdog;
  const lastFour = Math.max(0, tournament.rounds.length - 2);
  return tournament.teams
    .filter(
      (team) =>
        team.seed > tournament.teams.length * seedShare &&
        roundsWon(tournament, team.countryId) >= lastFour,
    )
    .map((team) => team.countryId);
}

/** The top seeds knocked out in the first round. */
export function flops(tournament: ChampionshipTournament, world: World): string[] {
  return tournament.teams
    .filter(
      (team) =>
        team.seed <= world.config.worldChampionship.topSeeds &&
        roundsWon(tournament, team.countryId) === 0,
    )
    .map((team) => team.countryId);
}

/**
 * Plays the tournament due after `season` (GDD v1.37) and lands what it does: a casual lift for
 * a year where each team came from, larger the further it went; the host's hardcore lift and
 * league cash; and a top seed's first-round exit costs casual fans at home. Too few teams, or no
 * host, and nothing is played.
 */
function playTournament(state: GameState, world: World, season: number): GameState {
  const championship = state.worldChampionship;
  const rules = world.config.worldChampionship;
  const hostId = championship.hostId;
  if (hostId === null) return state;
  const field = drawField(state, world, hostId);
  if (field.length < 2) return state;
  const rng = restoreRng(championship.rng);
  const rounds = playKnockout(field, hostId, world, rng);
  const championId = rounds.at(-1)?.[0]?.winner;
  if (!championId) return state;
  const ended = state.flagship.seasons.find((summary) => summary.season === season);
  const tournament: ChampionshipTournament = {
    season,
    year: yearOfQuarter(ended?.quarter ?? state.quarter, world.config),
    hostId,
    teams: field.map((team, index) => ({
      countryId: team.countryId,
      seed: index + 1,
      players: team.players.map(({ playerId, name }) => ({ playerId, name })),
    })),
    rounds,
    championId,
  };

  const surprise = new Set(underdogs(tournament, world));
  const lifts: ChampionshipLift[] = tournament.teams.map((team) => ({
    countryId: team.countryId,
    casual:
      1 +
      rules.casualPerRound * (roundsWon(tournament, team.countryId) + 1) +
      (team.countryId === championId ? rules.championBonus : 0) +
      (surprise.has(team.countryId) ? rules.underdog.bonus : 0),
    hardcore: team.countryId === hostId ? rules.hostHardcore : 1,
    endQuarter: state.quarter + rules.liftQuarters,
  }));
  const flopped = new Set(flops(tournament, world));
  const countries = state.countries.map((country, index) => {
    let next = country;
    if (flopped.has(country.countryId))
      next = {
        ...next,
        fans: next.fans.map((fans, sport) =>
          sport === PLAYER_INDEX
            ? { ...fans, casual: fans.casual - Math.round(fans.casual * rules.flopCasualLoss) }
            : fans,
        ),
      };
    if (country.countryId === hostId && next.league)
      next = {
        ...next,
        league: {
          ...next.league,
          cash:
            next.league.cash +
            rules.hostCashQuarters *
              runningCostPerQuarter(world, index, next.league.tier, state.growthNodes),
        },
      };
    return next;
  });
  return {
    ...state,
    countries,
    worldChampionship: {
      ...championship,
      rng: saveRng(rng),
      tournaments: [...championship.tournaments, tournament],
      lifts: [...championship.lifts, ...lifts],
    },
    landmarks: [
      ...state.landmarks,
      landmarks.championshipPlayed(state.turn, state.quarter, championId, season, hostId),
    ],
  };
}

/** What past tournaments do to the player's conversion in a country now. */
export function championshipFactors(
  state: Pick<GameState, "worldChampionship" | "quarter">,
  countryId: string,
): { casual: number; hardcore: number } {
  const factors = { casual: 1, hardcore: 1 };
  for (const lift of state.worldChampionship.lifts) {
    if (lift.countryId !== countryId || lift.endQuarter <= state.quarter) continue;
    factors.casual *= lift.casual;
    factors.hardcore *= lift.hardcore;
  }
  return factors;
}

/**
 * The championship's turn, at the end of `endTurn`: lifts that have run out are dropped; a
 * tournament whose season has ended is played and the next is set `everySeasons` on; then the
 * bids for a tournament whose offseason has opened arrive.
 */
export function updateChampionship(state: GameState, world: World): GameState {
  let next = state;
  const due = next.worldChampionship.nextSeason;
  if (next.worldChampionship.lifts.some((lift) => lift.endQuarter <= next.quarter))
    next = {
      ...next,
      worldChampionship: {
        ...next.worldChampionship,
        lifts: next.worldChampionship.lifts.filter((lift) => lift.endQuarter > next.quarter),
      },
    };
  if (next.worldChampionship.founded !== null && due !== null && next.flagship.season > due) {
    next = playTournament(next, world, due);
    next = {
      ...next,
      worldChampionship: {
        ...next.worldChampionship,
        nextSeason: due + world.config.worldChampionship.everySeasons,
        hostId: null,
        bids: [],
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
  /** Past tournaments, oldest first, with their whole brackets. */
  tournaments: ChampionshipTournament[];
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
    const field = new Set(tournament.teams.map((team) => team.countryId));
    if (field.size !== tournament.teams.length || !field.has(tournament.championId))
      problems.push(`championship tournament of season ${tournament.season} has a bad field`);
    let alive = tournament.teams.length;
    for (const round of tournament.rounds) {
      if (round.length * 2 !== alive)
        problems.push(`championship tournament of season ${tournament.season} has a bad round`);
      alive = round.length;
      for (const match of round)
        if (
          !field.has(match.a) ||
          !field.has(match.b) ||
          ![match.a, match.b].includes(match.winner)
        )
          problems.push(`championship tournament of season ${tournament.season} has a bad match`);
    }
    if (alive !== 1 || tournament.rounds.at(-1)?.[0]?.winner !== tournament.championId)
      problems.push(`championship tournament of season ${tournament.season} has no final`);
  }
  for (const lift of championship.lifts)
    if (!known(lift.countryId)) problems.push(`a championship lift names "${lift.countryId}"`);
  return problems;
}
