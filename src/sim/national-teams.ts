import { activeClubs } from "./flagship";
import { leagueTierIndex } from "./leagues";
import { type GameState, PLAYER_INDEX, type World } from "./types";

// National teams (GDD v1.37): a country's best named players, wherever they play. Nothing here
// is saved: a squad is read from the state when it is needed (the list on screen now, a World
// Championship's field later), so no team exists between championships.

export interface NationalPlayer {
  playerId: number;
  name: string;
  skill: number;
  /** Leads a flagship club (at home in the seat's country, or abroad). */
  atFlagship: boolean;
}

export interface NationalTeam {
  countryId: string;
  /** League tier and hardcore share, plus the squad's skill. Never shown as a number. */
  strength: number;
  /** The best named nationals, best first; empty for a team that plays on its league alone. */
  players: NationalPlayer[];
}

/** Whether a country can field a team: a league at the configured tier or above. */
export function fieldsTeam(state: GameState, world: World, index: number): boolean {
  const league = state.countries[index]?.league;
  return (
    !!league && leagueTierIndex(league.tier) >= leagueTierIndex(world.config.nationalTeams.minTier)
  );
}

/** Every named player by the country they were born in: flagship leaders and standouts. */
function namedByCountry(state: GameState): Map<string, NationalPlayer[]> {
  const active = new Set(activeClubs(state.flagship).map((club) => club.id));
  const named = new Map<string, NationalPlayer[]>();
  const add = (countryId: string, player: NationalPlayer) => {
    const list = named.get(countryId);
    if (list) list.push(player);
    else named.set(countryId, [player]);
  };
  for (const player of state.flagship.players) {
    if (player.retiredSeason !== null || !active.has(player.clubId)) continue;
    add(player.countryId, {
      playerId: player.id,
      name: player.name,
      skill: player.skill,
      atFlagship: true,
    });
  }
  for (const player of state.standouts.players)
    add(player.countryId, {
      playerId: player.id,
      name: player.name,
      skill: player.skill,
      atFlagship: false,
    });
  return named;
}

/**
 * Every national team that can be fielded now, strongest first (ties by content order); a guest
 * needs a league of any tier. Strength
 * is a base for the league's tier, plus the player's hardcore share of the population up to
 * `hardcore.fullShare`, plus the skill of the best `players` named nationals wherever they play.
 */
export function nationalTeams(
  state: GameState,
  world: World,
  /** A country fielded whatever its league's tier: a World Championship's host. */
  guestId: string | null = null,
): NationalTeam[] {
  const rules = world.config.nationalTeams;
  const named = namedByCountry(state);
  const teams: (NationalTeam & { index: number })[] = [];
  state.countries.forEach((country, index) => {
    const league = country.league;
    if (!league || !(fieldsTeam(state, world, index) || country.countryId === guestId)) return;
    const population = world.countries[index]?.population ?? 0;
    const hardcore = country.fans[PLAYER_INDEX]?.hardcore ?? 0;
    const share = population > 0 ? hardcore / population : 0;
    const players = (named.get(country.countryId) ?? [])
      .sort((a, b) => b.skill - a.skill || a.playerId - b.playerId)
      .slice(0, rules.players);
    teams.push({
      index,
      countryId: country.countryId,
      strength:
        rules.tierBase[league.tier] +
        rules.hardcore.weight * Math.min(1, share / rules.hardcore.fullShare) +
        rules.skillWeight * players.reduce((sum, player) => sum + player.skill, 0),
      players,
    });
  });
  return teams
    .sort((a, b) => b.strength - a.strength || a.index - b.index)
    .map(({ index: _index, ...team }) => team);
}

/** A national team as the UI lists it: its place in the order and names, no numbers. */
export interface NationalTeamSnapshot {
  countryId: string;
  rank: number;
  players: { playerId: number; name: string; atFlagship: boolean }[];
}

export function nationalTeamSnapshots(state: GameState, world: World): NationalTeamSnapshot[] {
  return nationalTeams(state, world).map((team, index) => ({
    countryId: team.countryId,
    rank: index + 1,
    players: team.players.map(({ playerId, name, atFlagship }) => ({
      playerId,
      name,
      atFlagship,
    })),
  }));
}
