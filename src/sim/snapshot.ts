import type { NodeEffect } from "../content";
import { focusCostFromExposure } from "./actions";
import { offseasonOpen, turnLengthQuarters, yearOfQuarter } from "./calendar";
import { type CultureSnapshot, cultureSnapshot } from "./culture";
import { leagueIncomePerQuarter } from "./deals";
import { type EventSnapshot, eventSnapshots } from "./events";
import type { EventState } from "./events-state";
import { fandomScore, localRank, type SportTotals, sportTotals } from "./fandom";
import { activeClubs, broadcastEffects, type FlagshipSnapshot, flagshipSnapshot } from "./flagship";
import { leverMultipliers, similarityEffect } from "./genome";
import {
  effectValue,
  type GrowthFactors,
  growthFactors,
  type NodeBlocker,
  nodeBlocker,
  nodeCost,
} from "./growth";
import { type HallSnapshot, hallSnapshot } from "./hall-of-fame";
import { type IdentitySnapshot, identitySnapshot } from "./identity";
import { bulkPromotable, type LeagueActions, leagueActions } from "./league-actions";
import { type LeagueCosts, leagueCosts } from "./league-costs";
import { type NationalTeamSnapshot, nationalTeamSnapshots } from "./national-teams";
import { ppWeights, quarterPpIncome } from "./prices";
import { type RulesSnapshot, rulesSnapshot } from "./rules";
import { shapeFactors } from "./shape";
import { computeExposure } from "./spread";
import {
  type CountrySportStanding,
  countryStandings,
  leadingSport,
  type StandingsSnapshot,
  standingsSnapshot,
} from "./standings";
import { standoutsIn } from "./standouts";
import { tierStatus } from "./tiers";
import {
  type EscalationLevel,
  type GameOutcome,
  type GameState,
  type Genome,
  type GrowthCategory,
  type HealthLevel,
  LEAGUE_TIERS,
  type LeagueTierId,
  type PendingTierUp,
  PLAYER_INDEX,
  type PlayerOfYear,
  type TimedCountermoveKind,
  type World,
} from "./types";
import { groundSize, matchCrowd, seasonMatchCrowd, seatedCrowd, venueCapacity } from "./venues";
import { countsTowardHold, standing } from "./win";

const QUARTERS_PER_YEAR = 4;

export interface LeagueSnapshot {
  actions: LeagueActions;
  tier: LeagueTierId;
  health: HealthLevel;
  cash: number;
  revenuePerQuarter: number;
  /** Every cost a quarter: running cost, payroll, star wages and venue upkeep. */
  runningCostPerQuarter: number;
  /** The cost lines (GDD v1.30): payroll and wages only at the seat. */
  costs: LeagueCosts;
  lastFlowPerQuarter: number | null;
  /** The venue (GDD v1.30): capacity caps the gate only at the seat. */
  venue: {
    level: number;
    capacity: number;
    /** Hardcore fans seated now. */
    seated: number;
    building: { level: number; opensSeason: number } | null;
    record: number | null;
    /** What the screen shows (GDD v1.34): each club's ground, a game's crowd and a season's. */
    groundSize: number;
    matchCrowd: number;
    seasonAttendance: number;
    /** Hardcore fans with no seat: the cap on the gate. */
    turnedAway: number;
    /** The best crowd a game in this country's recorded seasons. */
    recordMatchCrowd: number | null;
  };
}

/** One country as the UI sees it: the player's standing there and why it is moving. */
export interface CountrySnapshot {
  countryId: string;
  population: number;
  /** The market's wealth level id (GDD v1.21): what its fans can spend on sport. */
  wealthLevel: string;
  /** Every modeled sport's fans here, best first (GDD v1.35 standings). */
  sports: CountrySportStanding[];
  /** The player's place among the modeled sports here, 1 = first. */
  localRank: number;
  /** The sport leading here, if any has fans. */
  leaderSportId: string | null;
  /** The highest league tier the market can hold unless it has the seat (GDD v1.35). */
  maxTier: LeagueTierId;
  /**
   * The league's named standouts, best first (GDD v1.37): none at the seat or below Professional.
   * Skill stays out of the snapshot; the order is all that shows.
   */
  standouts: StandoutSnapshot[];
  /**
   * Players born here who lead a flagship club abroad (GDD v1.37), by name: the broadcast reaches
   * further into their home while they play.
   */
  atFlagship: string[];
  casual: number;
  hardcore: number;
  fandomScore: number;
  /** Fandom Score ÷ population. */
  share: number;
  focused: boolean;
  /** Current PP price of assigning a slot here, computed from organic exposure. */
  focusCost: number;
  exposure: number;
  /** The flagship broadcast's lift on media reach here, 0 where it does not air (GDD v1.27). */
  broadcastLift: number;
  /** Casual fans lost here each quarter to a Near-Collapse flagship's troubles (GDD v1.23). */
  broadcastRipple: number;
  affinity: number;
  accessibility: number;
  depth: number;
  /** Similarity to the country's dominant rival, 0–1. */
  rivalSimilarity: number;
  league: LeagueSnapshot | null;
  /** Each rival's escalation here and its countermoves in effect. Budgets stay hidden. */
  rivals: RivalDefenseSnapshot[];
}

/** What the map shows of one rival in one country (GDD Rival AI: budgets are hidden). */
export interface RivalDefenseSnapshot {
  sportId: string;
  level: EscalationLevel;
  countermoves: TimedCountermoveKind[];
}

export interface TierTrackSnapshot {
  peakTier: number;
  /** An announced tier-up ("Approaching National Pastime"). */
  pendingTierUp: PendingTierUp | null;
  /** Turns at risk so far, and turns left before demotion; null when not at risk. */
  atRisk: { turnsBelowLine: number; turnsUntilDemotion: number } | null;
  slotsToDrop: number;
  next: { tier: number; scoreProgress: number; breadthProgress: number } | null;
}

/** The race for #1 (GDD Win condition). */
export interface WinSnapshot {
  /** The player's rank by global Fandom Score among modeled sports, 1 = first. */
  rank: number;
  /** The rival with the highest Fandom Score. */
  leadingRivalId: string | null;
  /** Consecutive turns ended at #1 at the required PP tier so far: the win hold. */
  turnsHeld: number;
  /** Turns the hold must last to win, and the PP tier it must be held at. */
  holdTurns: number;
  requiredTier: number;
  /** Whether this turn's standing counts toward the hold (#1 at the required tier). */
  holding: boolean;
  /** When the win landed, or null before it. Stays set if #1 is lost later. */
  won: { turn: number; quarter: number } | null;
}

/** One growth tree node as the UI sees it (GDD PP Growth Tree). No text: the UI names it. */
/**
 * What a level would do, in concrete terms (GDD v1.35): each country effect's value in the
 * player's top markets, and the flagship's club count and star places before and after.
 */
export interface GrowthPreview {
  /** Per top market: each effect's value there (0 for global effects), in effect order. */
  markets: { countryId: string; values: number[] }[];
  clubs: { from: number; to: number } | null;
  starPlaces: { from: number; to: number } | null;
}

/**
 * What the tracks have done so far (GDD v1.35): their factors in the player's top markets. The
 * sport's shape stays in the simulation (it carries flagship club parity, which stays hidden).
 */
export interface GrowthDone {
  markets: { countryId: string; factors: GrowthFactors }[];
}

export interface GrowthNodeSnapshot {
  nodeId: string;
  category: GrowthCategory;
  /** The level on its track, 1–12; a fork's sides share one. */
  level: number;
  /** The fork this node is a side of, if any. */
  forkId: string | null;
  /** Either of these opens this level (the fork before it). */
  requiresAny: string[];
  preview: GrowthPreview;
  /** owned; available (every rule met, whether or not the PP is there); locked. */
  status: "owned" | "available" | "locked";
  /** Price right now: quarters of PP income, risen per node owned (GDD v1.34). */
  cost: number;
  affordable: boolean;
  /** Why it cannot be bought (null when available or owned). */
  lock: Exclude<NodeBlocker, { kind: "owned" }> | null;
  requires: string[];
  /** Fork siblings this node would lock out, or that lock it out. */
  forkSiblings: string[];
  /** Base modifiers; country conditions and stacking still apply in the simulation. */
  effects: NodeEffect[];
  unlockTier: number;
}

/** What the UI shows after a turn. Plain data, cheap to send across the worker boundary. */
export interface TurnSnapshot {
  seed: number;
  anchorCountryId: string;
  genome: Genome;
  turn: number;
  quarter: number;
  year: number;
  quarterOfYear: number;
  ppTier: number;
  turnLengthQuarters: number;
  pp: number;
  /** PP earned a turn at today's fans, growth tree included (GDD v1.34: prices read in turns). */
  ppIncomePerTurn: number;
  /** Bulk promotion (GDD v1.34): each tier some leagues could be promoted into now, and which. */
  bulkPromotions: { to: LeagueTierId; countryIds: string[] }[];
  /** Dollars per unit of the simulation's cash, for display only (GDD v1.34). */
  dollarsPerCash: number;
  offseasonOpen: boolean;
  tierTrack: TierTrackSnapshot;
  focus: (string | null)[];
  win: WinSnapshot;
  outcome: GameOutcome | null;
  sports: SportTotals[];
  /** Same order as content. */
  countries: CountrySnapshot[];
  /** Every growth tree node in content order, with its status and current price. */
  growthNodes: GrowthNodeSnapshot[];
  /** What the growth tracks have done so far, in the player's top markets (GDD v1.35). */
  growthDone: GrowthDone;
  /** The player's sport against the rival sports (GDD v1.35). */
  standings: StandingsSnapshot;
  landmarkCount: number;
  events: EventSnapshot[];
  eventHistory: EventState["history"];
  eventModifiers: EventState["modifiers"];
  /** The league the player runs as commissioner (GDD v1.11, v1.14). */
  flagship: FlagshipSnapshot;
  /** The sport's name, founding club and ground, character, terms and emblem (GDD v1.18). */
  identity: IdentitySnapshot;
  /** The rule traits, their amendment options with price, backlash and hints (GDD v1.20). */
  rules: RulesSnapshot;
  /** Traditions, the trophy's name and rivals' flavor traditions (GDD v1.22). */
  culture: CultureSnapshot;
  /** The Hall of Fame and the Almanac's records (GDD v1.31). */
  hallOfFame: HallSnapshot;
  /** Each season's Player of the Year, oldest first (GDD v1.37); empty until standouts exist. */
  playersOfYear: PlayerOfYear[];
  /** Every national team that could be fielded now, strongest first (GDD v1.37). */
  nationalTeams: NationalTeamSnapshot[];
}

/** Attendance and max capacity as the venue card shows them (GDD v1.34). */
function venueDisplay(
  state: GameState,
  world: World,
  index: number,
  level: number,
  hardcore: number,
) {
  const countryId = world.countries[index]?.id;
  const clubs = state.flagship.clubs.filter((c) => c.active && c.countryId === countryId).length;
  const seated = seatedCrowd(world, index, level, hardcore);
  const crowd = matchCrowd(world, index, level, seated, Math.max(1, clubs));
  // A season is a double round robin: every club hosts every other once.
  const games = clubs * Math.max(0, clubs - 1);
  let record: number | null = null;
  for (const season of state.flagship.seasons) {
    if (season.countryId !== countryId) continue;
    const drew = seasonMatchCrowd(state, world, season);
    if (drew !== null && (record === null || drew > record)) record = drew;
  }
  return {
    groundSize: groundSize(world, level),
    matchCrowd: crowd,
    seasonAttendance: crowd * games,
    turnedAway: Math.max(0, hardcore - venueCapacity(world, index, level)),
    recordMatchCrowd: record,
  };
}

/** The player's top markets by Fandom Score, the ones previews are read in. */
function topMarkets(state: GameState, world: World, count = 3): number[] {
  const { casualWeight } = world.config.fandomScore;
  return state.countries
    .map((country, index) => {
      const fans = country.fans[PLAYER_INDEX];
      return { index, score: fans ? fandomScore(fans.casual, fans.hardcore, casualWeight) : 0 };
    })
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .slice(0, count)
    .map((entry) => entry.index);
}

/** What the growth tracks have done so far (GDD v1.35). */
export function growthDone(state: GameState, world: World): GrowthDone {
  const factors = growthFactors(world, state.growthNodes);
  return {
    markets: topMarkets(state, world).map((index) => ({
      countryId: world.countries[index]?.id ?? "",
      factors: factors[index] ?? growthFactors(world, [])[0] ?? ({} as GrowthFactors),
    })),
  };
}

export function growthNodeSnapshots(state: GameState, world: World): GrowthNodeSnapshot[] {
  const top = topMarkets(state, world);
  const seat = state.countries.find((c) => c.countryId === state.flagship.countryId)?.league;
  const now = shapeFactors(world, state.growthNodes);
  return world.growthTree.nodes.map((node): GrowthNodeSnapshot => {
    const blocker = nodeBlocker(state, world, node.id);
    const cost = nodeCost(state, world, node.id);
    const fork = world.growthTree.forks.find((candidate) => candidate.nodes.includes(node.id));
    // Only a level that moves the club count or star places needs its shape after.
    const discreteEffect = node.effects.some(
      (e) => e.type === "flagshipClubs" || e.type === "starPlaces",
    );
    const after = discreteEffect
      ? shapeFactors(world, [...state.growthNodes.filter((id) => id !== node.id), node.id])
      : now;
    const discrete = (base: number, from: number, to: number, extra = false) => {
      const before = extra ? base + Math.round(from - 1) : Math.round(base * from);
      const next = extra ? base + Math.round(to - 1) : Math.round(base * to);
      return before === next ? null : { from: before, to: next };
    };
    const preview: GrowthPreview = {
      markets: top.map((index) => ({
        countryId: world.countries[index]?.id ?? "",
        values: node.effects.map((effect) =>
          world.derived[index] ? effectValue(effect, world.derived[index]) : 0,
        ),
      })),
      clubs: seat
        ? discrete(world.config.flagship.clubs[seat.tier], now.flagshipClubs, after.flagshipClubs)
        : null,
      starPlaces: seat
        ? discrete(
            world.config.flagship.stars.places[seat.tier],
            now.starPlaces,
            after.starPlaces,
            true,
          )
        : null,
    };
    return {
      nodeId: node.id,
      category: node.category,
      level: node.level,
      forkId: fork?.id ?? null,
      requiresAny: [...node.requiresAny],
      preview,
      status: blocker === null ? "available" : blocker.kind === "owned" ? "owned" : "locked",
      cost,
      affordable: state.pp >= cost,
      lock: blocker === null || blocker.kind === "owned" ? null : blocker,
      requires: [...node.requires],
      forkSiblings: fork ? fork.nodes.filter((id) => id !== node.id) : [],
      effects: node.effects,
      unlockTier: world.growthTree.categories[node.category]?.unlockTier ?? 1,
    };
  });
}

/** A league standout as the UI names them: recorded facts only. */
export interface StandoutSnapshot {
  playerId: number;
  name: string;
  birthplace: string;
  age: number;
  finalSeason: boolean;
}

export function snapshot(state: GameState, world: World): TurnSnapshot {
  const exposure = computeExposure(state, world);
  const broadcast = broadcastEffects(state, world);
  const { casualWeight } = world.config.fandomScore;
  const shape = shapeFactors(world, state.growthNodes);
  // Leading players of the seat's active clubs who were born in another market (GDD v1.37).
  const seatClubs = new Set(activeClubs(state.flagship).map((club) => club.id));
  const abroad = state.flagship.players.filter(
    (player) =>
      player.retiredSeason === null &&
      seatClubs.has(player.clubId) &&
      player.countryId !== state.flagship.countryId,
  );
  const countries = state.countries.map((countryState, index): CountrySnapshot => {
    const country = world.countries[index];
    const fans = countryState.fans[PLAYER_INDEX];
    if (!country || !fans) throw new Error(`Country #${index} is missing from content or state`);
    const levers = leverMultipliers(world, state.genome, index, shape.climateFit);
    const score = fandomScore(fans.casual, fans.hardcore, casualWeight);
    const league = countryState.league;
    const costs = leagueCosts(state, world, index);
    return {
      countryId: country.id,
      population: country.population,
      wealthLevel:
        world.config.wealthLevels.levels[world.derived[index]?.wealthLevel ?? 0]?.id ?? "",
      maxTier: world.derived[index]?.maxTier ?? "elite",
      standouts: standoutsIn(state, country.id).map((player) => ({
        playerId: player.id,
        name: player.name,
        birthplace: player.birthplace,
        age: state.flagship.season - player.birthSeason,
        finalSeason: player.finalSeason,
      })),
      atFlagship: abroad.filter((player) => player.countryId === country.id).map((p) => p.name),
      sports: countryStandings(state, world, index),
      localRank: localRank(state, world, index),
      leaderSportId: leadingSport(state, world, index),
      casual: fans.casual,
      hardcore: fans.hardcore,
      fandomScore: score,
      share: score / country.population,
      focused: exposure[index]?.focused ?? false,
      focusCost: focusCostFromExposure(exposure[index]?.organic ?? 0, state, world, index),
      exposure: exposure[index]?.total ?? 0,
      broadcastLift: broadcast.boost * (broadcast.reach.get(index) ?? 0),
      broadcastRipple: broadcast.ripple.get(index) ?? 0,
      affinity: levers.affinity,
      accessibility: levers.accessibility,
      depth: levers.depth,
      rivalSimilarity: similarityEffect(
        world,
        state.genome,
        countryState,
        state.sports,
        country.population,
        state.rivals,
      ).similarity,
      league: league
        ? {
            tier: league.tier,
            actions: leagueActions(state, world, index) as LeagueActions,
            health: league.health,
            cash: league.cash,
            revenuePerQuarter: leagueIncomePerQuarter(state, world, index),
            runningCostPerQuarter: costs.total,
            costs,
            lastFlowPerQuarter: league.lastFlowPerQuarter,
            venue: {
              level: league.venue.level,
              capacity: venueCapacity(world, index, league.venue.level),
              seated: seatedCrowd(world, index, league.venue.level, fans.hardcore),
              building: league.venue.building,
              record: league.venue.record,
              ...venueDisplay(state, world, index, league.venue.level, fans.hardcore),
            },
          }
        : null,
      rivals: countryState.defense.map((front) => ({
        sportId: front.sportId,
        level: front.level,
        countermoves: countryState.countermoves
          .filter((move) => move.sportId === front.sportId)
          .map((move) => move.kind),
      })),
    };
  });
  const track = state.tierTrack;
  const { demotionTurns } = world.config.tierTrack;
  return {
    seed: state.seed,
    events: eventSnapshots(state, world),
    eventHistory: state.events.history,
    eventModifiers: state.events.modifiers,
    anchorCountryId: state.anchorCountryId,
    genome: state.genome,
    turn: state.turn,
    quarter: state.quarter,
    year: yearOfQuarter(state.quarter, world.config),
    quarterOfYear: (state.quarter % QUARTERS_PER_YEAR) + 1,
    ppTier: state.ppTier,
    turnLengthQuarters: turnLengthQuarters(state.ppTier, world.config),
    pp: state.pp,
    dollarsPerCash: world.config.money.dollarsPerCash,
    bulkPromotions: offseasonOpen(state)
      ? LEAGUE_TIERS.slice(1)
          .map((to) => ({ to, countryIds: bulkPromotable(state, world, to) }))
          .filter((entry) => entry.countryIds.length > 0)
      : [],
    ppIncomePerTurn:
      quarterPpIncome(
        state.countries,
        growthFactors(world, state.growthNodes),
        world.config,
        ppWeights(world),
      ) * turnLengthQuarters(state.ppTier, world.config),
    offseasonOpen: offseasonOpen(state),
    tierTrack: {
      peakTier: track.peakTier,
      pendingTierUp: track.pendingTierUp,
      atRisk:
        track.turnsBelowLine > 0
          ? {
              turnsBelowLine: track.turnsBelowLine,
              turnsUntilDemotion: demotionTurns - track.turnsBelowLine,
            }
          : null,
      slotsToDrop: track.slotsToDrop,
      next: tierStatus(state, world).next,
    },
    focus: [...state.focus],
    win: (() => {
      const { rank, leadingRivalId } = standing(state, world);
      return {
        rank,
        leadingRivalId,
        turnsHeld: state.win.turnsHeld,
        holdTurns: world.config.win.holdTurns,
        requiredTier: world.config.win.requiredTier,
        holding: countsTowardHold(rank, state.ppTier, world),
        won: state.win.won,
      };
    })(),
    outcome: state.outcome,
    sports: sportTotals(state, world),
    countries,
    growthNodes: growthNodeSnapshots(state, world),
    growthDone: growthDone(state, world),
    standings: standingsSnapshot(state, world),
    landmarkCount: state.landmarks.length,
    flagship: flagshipSnapshot(state, world),
    identity: identitySnapshot(state, world),
    rules: rulesSnapshot(state, world),
    culture: cultureSnapshot(state, world, offseasonOpen(state)),
    hallOfFame: hallSnapshot(state, world),
    playersOfYear: state.standouts.playersOfYear,
    nationalTeams: nationalTeamSnapshots(state, world),
  };
}
