import type { HallFirst } from "../content";
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
    (facts.record ? points.record : 0)
  );
}

/** Whether a landmark is the kind of fact a first is read from. */
function firstOf(first: HallFirst, landmark: Landmark, state: Pick<GameState, "identity">) {
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
      return landmark.kind === "recordCrowd";
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
