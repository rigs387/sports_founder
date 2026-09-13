import {
  type Action,
  checkInvariants,
  createCampaign,
  endTurn,
  type GameState,
  type Genome,
  PLAYER_INDEX,
  snapshot,
  type World,
} from "../sim";
import { type BotId, runBot } from "./policy";
import type { CampaignResult, CountryRow, TurnRow } from "./report";

export interface CampaignPlan {
  seed: number;
  anchorCountryId: string;
  genome: Genome;
  genomeLabel: string;
  bot: BotId;
  /** Maximum turns; the campaign stops early if it ends. */
  turns: number;
}

export interface PlayedCampaign {
  result: CampaignResult;
  turnRows: TurnRow[];
  countryRows: CountryRow[];
  finalState: GameState;
}

/** Plays one campaign: the bot acts, then the turn ends, until the turn limit or the end. */
export function playCampaign(world: World, plan: CampaignPlan): PlayedCampaign {
  let state = createCampaign(world, {
    seed: plan.seed,
    anchorCountryId: plan.anchorCountryId,
    genome: plan.genome,
  });
  const anchorIndex = world.countries.findIndex((c) => c.id === plan.anchorCountryId);
  const tierReached: CampaignResult["tierReached"] = {};
  const violations = new Set<string>();
  const turnRows: TurnRow[] = [];
  const actions: Action[] = [];

  for (let t = 0; t < plan.turns && state.outcome === null; t += 1) {
    const step = runBot(plan.bot, state, world);
    actions.push(...step.actions);
    const tierBefore = step.state.ppTier;
    state = endTurn(step.state, world);
    if (state.ppTier > tierBefore && tierReached[state.ppTier] === undefined) {
      tierReached[state.ppTier] = { turnsCompleted: t + 1, quartersElapsed: state.quarter };
    }
    for (const problem of checkInvariants(state, world)) violations.add(problem);

    const snap = snapshot(state, world);
    const player = snap.sports.find((sport) => sport.kind === "player");
    if (!player) throw new Error("Snapshot has no player sport");
    const anchorLeague = snap.countries[anchorIndex]?.league ?? null;
    turnRows.push({
      seed: plan.seed,
      genome: plan.genomeLabel,
      bot: plan.bot,
      turn: t + 1,
      year: snap.year,
      quarterOfYear: snap.quarterOfYear,
      ppTier: snap.ppTier,
      pp: snap.pp,
      focus: snap.focus.map((id) => id ?? "-").join("|"),
      countriesWithFans: snap.countries.filter((c) => c.casual + c.hardcore > 0).length,
      leagues: snap.countries.filter((c) => c.league !== null).length,
      anchorLeagueTier: anchorLeague?.tier ?? "",
      anchorHealth: anchorLeague?.health ?? "",
      anchorCash: anchorLeague?.cash ?? 0,
      playerCasual: player.casual,
      playerHardcore: player.hardcore,
      playerFandomScore: player.fandomScore,
    });
  }

  const snap = snapshot(state, world);
  const ranked = [...snap.sports]
    .filter((sport) => sport.kind !== "other")
    .sort((a, b) => b.fandomScore - a.fandomScore);
  const player = snap.sports.find((sport) => sport.kind === "player");
  if (!player) throw new Error("Snapshot has no player sport");
  const byScore = [...snap.countries].sort((a, b) => b.fandomScore - a.fandomScore);
  const byShare = [...snap.countries].sort(
    (a, b) => b.share - a.share || b.fandomScore - a.fandomScore,
  );
  const countryRows = snap.countries.map(
    (c): CountryRow => ({
      seed: plan.seed,
      genome: plan.genomeLabel,
      bot: plan.bot,
      countryId: c.countryId,
      population: c.population,
      casual: c.casual,
      hardcore: c.hardcore,
      fandomScore: c.fandomScore,
      share: c.share,
      rank: byScore.indexOf(c) + 1,
      focused: c.focused,
      exposure: c.exposure,
      affinity: c.affinity,
      accessibility: c.accessibility,
      depth: c.depth,
      rivalSimilarity: c.rivalSimilarity,
      leagueTier: c.league?.tier ?? "",
      leagueHealth: c.league?.health ?? "",
      leagueCash: c.league?.cash ?? 0,
      leaguesFolded: state.countries[snap.countries.indexOf(c)]?.leaguesFolded ?? 0,
    }),
  );
  const count = (kind: string) => state.landmarks.filter((l) => l.kind === kind).length;

  return {
    result: {
      seed: plan.seed,
      anchorCountryId: plan.anchorCountryId,
      genome: plan.genome,
      genomeLabel: plan.genomeLabel,
      bot: plan.bot,
      turnsPlayed: state.turn - 1,
      quartersElapsed: state.quarter,
      finalYear: snap.year,
      collapsed: state.outcome !== null,
      collapseTurn: state.outcome?.turn ?? null,
      ppTier: state.ppTier,
      peakTier: state.tierTrack.peakTier,
      pp: state.pp,
      focusActions: actions.filter((a) => a.type === "assignFocus").length,
      bailouts: actions.filter((a) => a.type === "bailoutLeague").length,
      promotions: count("leaguePromoted"),
      stepDowns: count("leagueSteppedDown"),
      leaguesFormed: count("leagueFormed"),
      leaguesFolded: count("leagueFolded"),
      tierDemotions: count("ppTierDown"),
      leaguesAtEnd: snap.countries.filter((c) => c.league !== null).length,
      anchorLeagueTier: state.countries[anchorIndex]?.league?.tier ?? null,
      finalFocus: snap.focus,
      player: { ...player, rank: ranked.indexOf(player) + 1 },
      rivals: snap.sports.filter((sport) => sport.kind === "rival"),
      countriesWithFans: snap.countries.filter((c) => c.casual + c.hardcore > 0).length,
      topCountries: byScore.slice(0, 10).map((c) => c.countryId),
      topCountriesByShare: byShare.slice(0, 10).map((c) => c.countryId),
      anchorHardcoreShare:
        (state.countries[anchorIndex]?.fans[PLAYER_INDEX]?.hardcore ?? 0) /
        (world.countries[anchorIndex]?.population ?? 1),
      tierReached,
      invariantViolations: [...violations],
    },
    turnRows,
    countryRows,
    finalState: state,
  };
}
