import type { HallFirst, HallWing, LeagueTierId } from "../content";
import { yearOfQuarter } from "./calendar";
import type { EventRecord } from "./events-state";
import { landmarks } from "./records";
import type {
  GameState,
  HallOfFameState,
  Inductee,
  InducteeFacts,
  Landmark,
  Player,
  SeasonSummary,
  World,
} from "./types";

// The Hall of Fame (GDD v1.31): a class at each flagship season's end, read only from retained
// records. Players are inducted on points from their careers once they have retired and waited;
// the Moments wing inducts the sport's firsts. Each player inductee adds a permanent shrine weight
// to their home country's tradition weight. Every number is config (`hallOfFame`).

/**
 * The Hall at a campaign's start, or when an older save first gains it: only players retiring
 * from `startSeason` on, and firsts recorded from `landmarkStart` on, count.
 */
export function newHallOfFame(startSeason: number, landmarkStart: number): HallOfFameState {
  return { startSeason, landmarkStart, inductees: [], nextId: 1 };
}

/** A player's career as the Hall reads it: star seasons, titles, top-scorer seasons, the record. */
export function inducteeFacts(
  state: Pick<GameState, "flagship" | "landmarks">,
  player: Player,
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
  };
}

/** A career's Hall of Fame points (config hallOfFame.points). */
export function hallPoints(facts: InducteeFacts, world: World): number {
  const { points } = world.config.hallOfFame;
  return (
    facts.starSeasons * points.starSeason +
    facts.titles * points.title +
    facts.topScorerSeasons * points.topScorer +
    facts.awards * points.playerOfSeason +
    (facts.record ? points.record : 0)
  );
}

/** Whether a landmark is the kind of fact a first is read from. */
function firstOf(
  first: HallFirst,
  landmark: Landmark,
  state: Pick<GameState, "identity" | "landmarks">,
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
        state.landmarks.some(
          (l) =>
            l.kind === "leaguePromoted" &&
            l.to === "professional" &&
            l.countryId === landmark.countryId &&
            l.quarter <= landmark.quarter,
        )
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

/**
 * The class a flagship season's end inducts (GDD v1.31): eligible players at or above the bar,
 * best first (ties: earlier retirement, then lower id), up to the class cap; and firsts recorded
 * before landmark index `before` (the season's champion landmark) since the Hall began, oldest
 * first, up to the Moments cap. Inductees take ids from the Hall's next id.
 */
export function chooseClass(
  state: GameState,
  world: World,
  summary: SeasonSummary,
  before: number,
  turn: number,
  quarter: number,
): Inductee[] {
  const hall = state.hallOfFame;
  const config = world.config.hallOfFame;
  let nextId = hall.nextId;

  const players = hallEligible(state, world, summary.season)
    .map((player) => {
      const facts = inducteeFacts(state, player);
      return { player, facts, points: hallPoints(facts, world) };
    })
    .filter((c) => c.points >= config.bar)
    .sort(
      (a, b) =>
        b.points - a.points ||
        (a.player.retiredSeason ?? 0) - (b.player.retiredSeason ?? 0) ||
        a.player.id - b.player.id,
    )
    .slice(0, config.playersPerClass);

  const inductedFirsts = new Set(hall.inductees.map((i) => i.first));
  const firsts: { first: HallFirst; index: number }[] = [];
  for (const first of config.moments) {
    if (inductedFirsts.has(first)) continue;
    const index = state.landmarks.findIndex((l) => firstOf(first, l, state));
    // Only the first of its kind ever: one recorded before the Hall began is never inducted.
    if (index < hall.landmarkStart || index >= before) continue;
    firsts.push({ first, index });
  }
  firsts.sort((a, b) => a.index - b.index);

  const base = { season: summary.season, turn, quarter };
  return [
    ...players.map(
      ({ player, facts }): Inductee => ({
        id: nextId++,
        wing: "players",
        ...base,
        countryId: player.countryId,
        playerId: player.id,
        facts,
        first: null,
        landmarkIndex: null,
      }),
    ),
    ...firsts.slice(0, config.momentsPerClass).map(({ first, index }): Inductee => {
      const landmark = state.landmarks[index];
      const countryId =
        landmark && "countryId" in landmark ? landmark.countryId : state.anchorCountryId;
      return {
        id: nextId++,
        wing: "moments",
        ...base,
        countryId,
        playerId: null,
        facts: null,
        first,
        landmarkIndex: index,
      };
    }),
  ];
}

/** A class's landmark, or none for an empty class. */
export function classLandmark(state: GameState, inductees: readonly Inductee[]): Landmark[] {
  const [first] = inductees;
  if (!first) return [];
  return [
    landmarks.hallOfFameClass(
      first.turn,
      first.quarter,
      state.flagship.countryId,
      first.season,
      inductees.length,
    ),
  ];
}

/** Each country's shrine weight (content order): shrineWeight per player inductee from there. */
export function shrineWeights(state: Pick<GameState, "hallOfFame">, world: World): number[] {
  const weights = world.countries.map(() => 0);
  const index = new Map(world.countries.map((country, i) => [country.id, i]));
  for (const inductee of state.hallOfFame.inductees) {
    if (inductee.wing !== "players") continue;
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
  const firsts = new Set<string>();
  for (const inductee of hall.inductees) {
    if (ids.has(inductee.id) || inductee.id >= hall.nextId)
      problems.push(`Hall of Fame inductee ${inductee.id} is repeated or not yet issued`);
    ids.add(inductee.id);
    if (inductee.wing === "players") {
      const id = inductee.playerId;
      const player = state.flagship.players.find((p) => p.id === id);
      if (id === null || !player || player.retiredSeason === null || players.has(id))
        problems.push(`Hall of Fame inductee ${inductee.id} is not a retired player inducted once`);
      if (id !== null) players.add(id);
    } else {
      if (inductee.first === null || firsts.has(inductee.first))
        problems.push(`Hall of Fame inductee ${inductee.id} is not a first inducted once`);
      if (inductee.first !== null) firsts.add(inductee.first);
    }
  }
  return problems;
}

/** A class card's PP (GDD v1.31): each inductee's PP by wing at the flagship league's tier. */
export function classPP(
  state: Pick<GameState, "hallOfFame">,
  world: World,
  event: Pick<EventRecord, "facts">,
): number {
  const hall = event.facts.hall;
  if (!hall) return 0;
  const tier: LeagueTierId = event.facts.leagueTier ?? "amateur";
  const { pp } = world.config.hallOfFame;
  return state.hallOfFame.inductees
    .filter((inductee) => hall.inducteeIds.includes(inductee.id))
    .reduce((sum, inductee) => sum + pp[inductee.wing][tier], 0);
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

// ---- What the player sees (the Almanac, GDD v1.31) --------------------------------------------

export interface InducteeSnapshot {
  id: number;
  wing: HallWing;
  /** The class's season and its year. */
  season: number;
  year: number;
  countryId: string;
  playerId: number | null;
  /** A player's last club. */
  clubId: number | null;
  facts: InducteeFacts | null;
  first: HallFirst | null;
  /** When a first happened, and the player or club it names, where it names one. */
  firstYear: number | null;
  firstPlayerId: number | null;
  firstClubId: number | null;
}

/** A retired player who clears the bar and waits: for room in a class, or for their seasons. */
export interface WaitingSnapshot {
  playerId: number;
  clubId: number;
  facts: InducteeFacts;
  retiredSeason: number;
  /** The first class they can enter. */
  eligibleSeason: number;
}

export interface HallSnapshot {
  inductees: InducteeSnapshot[];
  waiting: WaitingSnapshot[];
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

export function hallSnapshot(state: GameState, world: World): HallSnapshot {
  const { hallOfFame: hall, flagship } = state;
  const config = world.config.hallOfFame;
  const year = (quarter: number) => yearOfQuarter(Math.max(0, quarter - 1), world.config);
  const players = new Map(flagship.players.map((p) => [p.id, p]));
  const inductees = hall.inductees.map((inductee): InducteeSnapshot => {
    const player = inductee.playerId === null ? undefined : players.get(inductee.playerId);
    const landmark =
      inductee.landmarkIndex === null ? undefined : state.landmarks[inductee.landmarkIndex];
    return {
      id: inductee.id,
      wing: inductee.wing,
      season: inductee.season,
      year: year(inductee.quarter),
      countryId: inductee.countryId,
      playerId: inductee.playerId,
      clubId: player ? lastClub(player) : null,
      facts: inductee.facts,
      first: inductee.first,
      firstYear: landmark ? year(landmark.quarter) : null,
      firstPlayerId: landmark && "playerId" in landmark ? landmark.playerId : null,
      firstClubId: landmark && "clubId" in landmark ? landmark.clubId : null,
    };
  });
  const inducted = new Set(hall.inductees.map((i) => i.playerId));
  const waiting = flagship.players
    .filter(
      (p) => p.retiredSeason !== null && p.retiredSeason >= hall.startSeason && !inducted.has(p.id),
    )
    .map((p) => ({ player: p, facts: inducteeFacts(state, p) }))
    .filter(({ facts }) => hallPoints(facts, world) >= config.bar)
    .map(
      ({ player, facts }): WaitingSnapshot => ({
        playerId: player.id,
        clubId: lastClub(player),
        facts,
        retiredSeason: player.retiredSeason ?? 0,
        eligibleSeason: (player.retiredSeason ?? 0) + config.waitSeasons,
      }),
    )
    .sort((a, b) => a.eligibleSeason - b.eligibleSeason || a.playerId - b.playerId);
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
  let crowd: HallSnapshot["records"]["crowd"] = null;
  for (const s of flagship.seasons)
    if (s.crowd !== null && (crowd === null || s.crowd > crowd.crowd))
      crowd = { crowd: s.crowd, season: s.season, year: year(s.quarter), countryId: s.countryId };
  return {
    inductees,
    waiting,
    awardNamerId: hall.inductees.find((i) => i.wing === "players")?.playerId ?? null,
    records: {
      champions: [...flagship.seasons].reverse().map((s) => ({
        season: s.season,
        year: year(s.quarter),
        countryId: s.countryId,
        championId: s.championId,
        topScorer: s.topScorer
          ? { playerId: s.topScorer.playerId, scores: s.topScorer.scores }
          : null,
        crowd: s.crowd,
        playerOfSeason: s.playerOfSeason,
      })),
      scorers,
      crowd,
      mostAwards,
    },
  };
}
