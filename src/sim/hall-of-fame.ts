import type { HallFirst, LeagueTierId } from "../content";
import { yearOfQuarter } from "./calendar";
import type { EventRecord } from "./events-state";
import { scoreUnit } from "./flagship";
import { landmarks } from "./records";
import type {
  BallotEntry,
  FlagshipState,
  GameState,
  HallOfFameState,
  Inductee,
  InducteeFacts,
  Landmark,
  Player,
  SeasonSummary,
  World,
} from "./types";
import { seasonMatchCrowd } from "./venues";

// The Hall of Fame (GDD v1.31, revised v1.35): a class at each flagship season's end, read only
// from retained records. Players are inducted on points from their careers once they have retired
// and waited: star seasons, titles, top-scorer seasons, awards, the record, career scores (in the
// scoring rule's units) and an all-time top ten. Every retired player above ballotShare of the bar
// is on the ballot; each class inducts the best who clear the bar, and a player passed over in
// ballotClasses classes drops off for good. Each inductee adds a permanent shrine weight to their
// home country's tradition weight. The sport's firsts are history, told in the Almanac, not
// inducted. Every number is config (`hallOfFame`).

/**
 * The Hall at a campaign's start, or when an older save first gains it: only players retiring
 * from `startSeason` on count.
 */
export function newHallOfFame(startSeason: number): HallOfFameState {
  return { startSeason, inductees: [], nextId: 1, ballots: [] };
}

/**
 * Every flagship player's career scores in units of each season's scoring rule (GDD v1.34,
 * v1.35), by player id: read once per call, as the all-time rank compares them all.
 */
export function careerUnitsById(flagship: FlagshipState, world: World): Map<number, number> {
  const rules = new Map(flagship.seasons.map((s) => [s.season, s.scoring]));
  const units = new Map<number, number>();
  for (const player of flagship.players)
    units.set(
      player.id,
      player.career.reduce(
        (sum, line) =>
          sum + line.scores / scoreUnit(world, rules.get(line.season) ?? flagship.scoring),
        0,
      ),
    );
  return units;
}

/** A player's place among every flagship player by career units, 1 = first (ties: lower id). */
function allTimeRank(units: ReadonlyMap<number, number>, playerId: number): number {
  const own = units.get(playerId) ?? 0;
  let rank = 1;
  for (const [id, other] of units)
    if (id !== playerId && (other > own || (other === own && id < playerId))) rank += 1;
  return rank;
}

/** A player's career as the Hall reads it: star seasons, titles, awards, the record, the career. */
export function inducteeFacts(
  state: Pick<GameState, "flagship" | "landmarks">,
  world: World,
  player: Player,
  units: ReadonlyMap<number, number> = careerUnitsById(state.flagship, world),
): InducteeFacts {
  const { seasons } = state.flagship;
  const last = player.retiredSeason ?? player.career.at(-1)?.season ?? player.starSince ?? 0;
  return {
    starSeasons: player.starSince === null ? 0 : Math.max(0, last - player.starSince + 1),
    titles: player.career.filter((line) =>
      seasons.some((s) => s.season === line.season && s.championId === line.clubId),
    ).length,
    topScorerSeasons: seasons.filter((s) => s.topScorer?.playerId === player.id).length,
    awards: seasons.filter((s) => s.playerOfSeason === player.id).length,
    record: state.landmarks.some((l) => l.kind === "scoringRecord" && l.playerId === player.id),
    scores: player.career.reduce((sum, line) => sum + line.scores, 0),
    careerUnits: units.get(player.id) ?? 0,
    allTimeRank: allTimeRank(units, player.id),
  };
}

/** A career's Hall of Fame points (config hallOfFame.points). */
export function hallPoints(facts: InducteeFacts, world: World): number {
  const { points, topRank } = world.config.hallOfFame;
  return (
    facts.starSeasons * points.starSeason +
    facts.titles * points.title +
    facts.topScorerSeasons * points.topScorer +
    facts.awards * points.playerOfSeason +
    (facts.record ? points.record : 0) +
    Math.floor(facts.careerUnits / points.careerUnits) +
    (facts.allTimeRank <= topRank ? points.topTen : 0)
  );
}

/**
 * Whether a landmark is the kind of fact a first is read from. `professionalSince` is the quarter
 * each country's league first turned Professional (the first record crowd needs one).
 */
function firstOf(
  first: HallFirst,
  landmark: Landmark,
  state: Pick<GameState, "identity">,
  professionalSince: ReadonlyMap<string, number>,
) {
  switch (first) {
    case "foundingTitle":
      return (
        landmark.kind === "seasonChampion" && landmark.clubId === state.identity.foundingClubId
      );
    case "firstStar":
      return landmark.kind === "firstStar";
    case "firstProfessional":
      return landmark.kind === "leaguePromoted" && landmark.to === "professional";
    case "firstElite":
      return landmark.kind === "leaguePromoted" && landmark.to === "elite";
    case "firstRecordCrowd":
      // Only once its league has turned Professional (GDD v1.32).
      return (
        landmark.kind === "recordCrowd" &&
        (professionalSince.get(landmark.countryId) ?? Number.POSITIVE_INFINITY) <= landmark.quarter
      );
    case "firstRankOne":
      return landmark.kind === "rankOneTaken";
    case "won":
      return landmark.kind === "won";
  }
}

/** Players not yet inducted who retired since the Hall began and have waited long enough. */
export function hallEligible(state: GameState, world: World, season: number): Player[] {
  const hall = state.hallOfFame;
  const inducted = new Set(hall.inductees.map((i) => i.playerId));
  return state.flagship.players.filter(
    (p) =>
      p.retiredSeason !== null &&
      p.retiredSeason >= hall.startSeason &&
      season - p.retiredSeason >= world.config.hallOfFame.waitSeasons &&
      !inducted.has(p.id),
  );
}

/** A player on the ballot: their facts and points, and the classes they have been passed over in. */
export interface BallotCandidate {
  player: Player;
  facts: InducteeFacts;
  points: number;
  classes: number;
}

/**
 * The ballot for a class at `season`'s end (GDD v1.35): eligible players at or above ballotShare
 * of the bar who have not been passed over ballotClasses times, best first (ties: earlier
 * retirement, then lower id).
 */
export function hallBallot(state: GameState, world: World, season: number): BallotCandidate[] {
  const config = world.config.hallOfFame;
  const passed = new Map(state.hallOfFame.ballots.map((b) => [b.playerId, b.classes]));
  const eligible = hallEligible(state, world, season);
  if (eligible.length === 0) return [];
  const units = careerUnitsById(state.flagship, world);
  return eligible
    .map((player) => {
      const facts = inducteeFacts(state, world, player, units);
      return {
        player,
        facts,
        points: hallPoints(facts, world),
        classes: passed.get(player.id) ?? 0,
      };
    })
    .filter((c) => c.points >= config.ballotShare * config.bar && c.classes < config.ballotClasses)
    .sort(
      (a, b) =>
        b.points - a.points ||
        (a.player.retiredSeason ?? 0) - (b.player.retiredSeason ?? 0) ||
        a.player.id - b.player.id,
    );
}

/** A class: who goes in, the ballot after it, and its near-miss (the best left out), if any. */
export interface HallClass {
  inductees: Inductee[];
  ballots: BallotEntry[];
  nearMissId: number | null;
}

/**
 * The class a flagship season's end inducts (GDD v1.31, v1.35): the ballot's players at or above
 * the bar, best first, up to the class cap; everyone else on the ballot is passed over once more.
 * Inductees take ids from the Hall's next id.
 */
export function chooseClass(
  state: GameState,
  world: World,
  summary: SeasonSummary,
  turn: number,
  quarter: number,
): HallClass {
  const hall = state.hallOfFame;
  const config = world.config.hallOfFame;
  let nextId = hall.nextId;
  const ballot = hallBallot(state, world, summary.season);
  const chosen = ballot
    .filter((c) => c.points >= config.bar)
    .slice(0, config.playersPerClass)
    .map((c) => c.player.id);
  const left = ballot.filter((c) => !chosen.includes(c.player.id));
  const passed = new Map(hall.ballots.map((b) => [b.playerId, b.classes]));
  for (const c of left) passed.set(c.player.id, c.classes + 1);
  const inductees = ballot
    .filter((c) => chosen.includes(c.player.id))
    .map(
      ({ player, facts }): Inductee => ({
        id: nextId++,
        season: summary.season,
        turn,
        quarter,
        countryId: player.countryId,
        playerId: player.id,
        facts,
      }),
    );
  return {
    inductees,
    ballots: [...passed]
      .filter(([playerId]) => !chosen.includes(playerId))
      .map(([playerId, classes]) => ({ playerId, classes }))
      .sort((a, b) => a.playerId - b.playerId),
    nearMissId: left[0]?.player.id ?? null,
  };
}

/** A class's landmark, or none for an empty class. */
export function classLandmark(
  state: GameState,
  inductees: readonly Inductee[],
  nearMissId: number | null,
): Landmark[] {
  const [first] = inductees;
  if (!first) return [];
  return [
    landmarks.hallOfFameClass(
      first.turn,
      first.quarter,
      state.flagship.countryId,
      first.season,
      inductees.length,
      nearMissId,
    ),
  ];
}

/** Each country's shrine weight (content order): shrineWeight per inductee from there. */
export function shrineWeights(state: Pick<GameState, "hallOfFame">, world: World): number[] {
  const weights = world.countries.map(() => 0);
  const index = new Map(world.countries.map((country, i) => [country.id, i]));
  for (const inductee of state.hallOfFame.inductees) {
    const i = index.get(inductee.countryId);
    if (i !== undefined) weights[i] = (weights[i] ?? 0) + world.config.hallOfFame.shrineWeight;
  }
  return weights;
}

/** Every way the Hall of Fame is invalid (see src/sim/invariants.ts). */
export function hallProblems(state: GameState): string[] {
  const problems: string[] = [];
  const hall = state.hallOfFame;
  const ids = new Set<number>();
  const players = new Set<number>();
  for (const inductee of hall.inductees) {
    if (ids.has(inductee.id) || inductee.id >= hall.nextId)
      problems.push(`Hall of Fame inductee ${inductee.id} is repeated or not yet issued`);
    ids.add(inductee.id);
    const player = state.flagship.players.find((p) => p.id === inductee.playerId);
    if (!player || player.retiredSeason === null || players.has(inductee.playerId))
      problems.push(`Hall of Fame inductee ${inductee.id} is not a retired player inducted once`);
    players.add(inductee.playerId);
  }
  for (const entry of hall.ballots)
    if (players.has(entry.playerId) || entry.classes < 1)
      problems.push(`Hall of Fame ballot entry for ${entry.playerId} is invalid`);
  return problems;
}

/** A class card's PP (GDD v1.31): each inductee's PP at the flagship league's tier. */
export function classPP(
  state: Pick<GameState, "hallOfFame">,
  world: World,
  event: Pick<EventRecord, "facts">,
): number {
  const hall = event.facts.hall;
  if (!hall) return 0;
  const tier: LeagueTierId = event.facts.leagueTier ?? "amateur";
  const count = state.hallOfFame.inductees.filter((i) => hall.inducteeIds.includes(i.id)).length;
  return count * world.config.hallOfFame.pp[tier];
}

/**
 * Whether a class is front-page news (GDD v1.31, v1.32): the sport's first class, or one inducting
 * the all-time scoring record holder of the day (the latest record landmark by the class's end).
 */
export function classHeadline(state: GameState, event: Pick<EventRecord, "facts">): boolean {
  const hall = event.facts.hall;
  if (!hall) return false;
  const first = state.hallOfFame.inductees[0];
  if (first && hall.inducteeIds.includes(first.id)) return true;
  const inductees = state.hallOfFame.inductees.filter((i) => hall.inducteeIds.includes(i.id));
  const quarter = inductees[0]?.quarter ?? 0;
  let holder: number | null = null;
  for (const landmark of state.landmarks)
    if (landmark.kind === "scoringRecord" && landmark.quarter <= quarter)
      holder = landmark.playerId;
  return holder !== null && inductees.some((inductee) => inductee.playerId === holder);
}

// ---- What the player sees (the Almanac, GDD v1.31, v1.35) -------------------------------------

export interface InducteeSnapshot {
  id: number;
  /** The class's season and its year. */
  season: number;
  year: number;
  countryId: string;
  playerId: number;
  /** The player's last club. */
  clubId: number;
  facts: InducteeFacts;
}

/** A player on the ballot (GDD v1.35): points against the bar and classes left. */
export interface BallotSnapshot {
  playerId: number;
  clubId: number;
  facts: InducteeFacts;
  points: number;
  /** Classes they have been passed over in so far. */
  passedOver: number;
  /** Classes they may still be passed over in before they drop off. */
  classesLeft: number;
  /** The first class they can enter, if they are still waiting out waitSeasons. */
  eligibleSeason: number;
}

/** One of the sport's firsts on the history timeline (GDD v1.35): when, where, who. */
export interface HistorySnapshot {
  first: HallFirst;
  year: number;
  countryId: string;
  playerId: number | null;
  clubId: number | null;
}

export interface HallSnapshot {
  inductees: InducteeSnapshot[];
  ballot: BallotSnapshot[];
  /** Points a player needs to go in. */
  bar: number;
  /** The sport's firsts so far, oldest first. */
  history: HistorySnapshot[];
  /**
   * The player Player of the Season is named after (GDD v1.33): the first player the Hall of Fame
   * inducted, or null while it is still plain "Player of the Season".
   */
  awardNamerId: number | null;
  records: {
    /** Every finished flagship season, newest first. */
    champions: {
      season: number;
      year: number;
      countryId: string;
      championId: number;
      topScorer: { playerId: number; scores: number } | null;
      crowd: number | null;
      playerOfSeason: number | null;
    }[];
    /** The all-time top scorers by career scores (config hallOfFame.leaders), best first. */
    scorers: { playerId: number; clubId: number; scores: number; retired: boolean }[];
    /** The best crowd any flagship season drew, if one was recorded. */
    crowd: { crowd: number; season: number; year: number; countryId: string } | null;
    /** The most Player of the Season awards (config hallOfFame.awardLeaders), most first. */
    mostAwards: { playerId: number; clubId: number; awards: number }[];
  };
}

const lastClub = (player: Player) => player.career.at(-1)?.clubId ?? player.clubId;

/** The sport's firsts so far (GDD v1.35), oldest first, read from the first landmark of each. */
export function historySnapshot(state: GameState, world: World): HistorySnapshot[] {
  const year = (quarter: number) => yearOfQuarter(Math.max(0, quarter - 1), world.config);
  const professionalSince = new Map<string, number>();
  for (const l of state.landmarks)
    if (
      l.kind === "leaguePromoted" &&
      l.to === "professional" &&
      !professionalSince.has(l.countryId)
    )
      professionalSince.set(l.countryId, l.quarter);
  return world.config.hallOfFame.firsts
    .flatMap((first): (HistorySnapshot & { index: number })[] => {
      const index = state.landmarks.findIndex((l) => firstOf(first, l, state, professionalSince));
      const landmark = state.landmarks[index];
      if (!landmark) return [];
      return [
        {
          first,
          index,
          year: year(landmark.quarter),
          countryId: "countryId" in landmark ? landmark.countryId : state.anchorCountryId,
          playerId: "playerId" in landmark ? landmark.playerId : null,
          clubId: "clubId" in landmark ? landmark.clubId : null,
        },
      ];
    })
    .sort((a, b) => a.index - b.index)
    .map(({ index: _index, ...entry }) => entry);
}

export function hallSnapshot(state: GameState, world: World): HallSnapshot {
  const { hallOfFame: hall, flagship } = state;
  const config = world.config.hallOfFame;
  const year = (quarter: number) => yearOfQuarter(Math.max(0, quarter - 1), world.config);
  const players = new Map(flagship.players.map((p) => [p.id, p]));
  const inductees = hall.inductees.map((inductee): InducteeSnapshot => {
    const player = players.get(inductee.playerId);
    return {
      id: inductee.id,
      season: inductee.season,
      year: year(inductee.quarter),
      countryId: inductee.countryId,
      playerId: inductee.playerId,
      clubId: player ? lastClub(player) : 0,
      facts: inductee.facts,
    };
  });
  // The ballot as the next class will see it, waiting players included.
  const later = flagship.season + config.waitSeasons;
  const ballot = hallBallot(state, world, later).map(
    (c): BallotSnapshot => ({
      playerId: c.player.id,
      clubId: lastClub(c.player),
      facts: c.facts,
      points: c.points,
      passedOver: c.classes,
      classesLeft: config.ballotClasses - c.classes,
      eligibleSeason: (c.player.retiredSeason ?? 0) + config.waitSeasons,
    }),
  );
  const scorers = flagship.players
    .map((p) => ({
      playerId: p.id,
      clubId: lastClub(p),
      scores: p.career.reduce((sum, line) => sum + line.scores, 0),
      retired: p.retiredSeason !== null,
    }))
    .filter((row) => row.scores > 0)
    .sort((a, b) => b.scores - a.scores || a.playerId - b.playerId)
    .slice(0, config.leaders);
  const awards = new Map<number, number>();
  for (const s of flagship.seasons)
    if (s.playerOfSeason !== null)
      awards.set(s.playerOfSeason, (awards.get(s.playerOfSeason) ?? 0) + 1);
  const mostAwards = [...awards]
    .map(([playerId, count]) => {
      const player = players.get(playerId);
      return { playerId, clubId: player ? lastClub(player) : 0, awards: count };
    })
    .sort((a, b) => b.awards - a.awards || a.playerId - b.playerId)
    .slice(0, config.awardLeaders);
  // Crowds a game, as the screen shows them (GDD v1.34).
  const perGame = new Map(
    flagship.seasons.map((s) => [s.season, seasonMatchCrowd(state, world, s)]),
  );
  let crowd: HallSnapshot["records"]["crowd"] = null;
  for (const s of flagship.seasons) {
    const drew = perGame.get(s.season) ?? null;
    if (drew !== null && (crowd === null || drew > crowd.crowd))
      crowd = { crowd: drew, season: s.season, year: year(s.quarter), countryId: s.countryId };
  }
  return {
    inductees,
    ballot,
    bar: config.bar,
    history: historySnapshot(state, world),
    awardNamerId: hall.inductees[0]?.playerId ?? null,
    records: {
      champions: [...flagship.seasons].reverse().map((s) => ({
        season: s.season,
        year: year(s.quarter),
        countryId: s.countryId,
        championId: s.championId,
        topScorer: s.topScorer
          ? { playerId: s.topScorer.playerId, scores: s.topScorer.scores }
          : null,
        crowd: perGame.get(s.season) ?? null,
        playerOfSeason: s.playerOfSeason,
      })),
      scorers,
      crowd,
      mostAwards,
    },
  };
}
