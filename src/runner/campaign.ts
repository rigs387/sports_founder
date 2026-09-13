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
import { type PolicyId, runPolicy } from "./policy";
import type { CampaignResult, CountryRow, TurnRow } from "./report";

export interface CampaignPlan {
  seed: number;
  anchorCountryId: string;
  genome: Genome;
  genomeLabel: string;
  policy: PolicyId;
  turns: number;
}

export interface PlayedCampaign {
  result: CampaignResult;
  turnRows: TurnRow[];
  countryRows: CountryRow[];
  finalState: GameState;
}

/** Plays one campaign: the policy acts, then the turn ends, for every turn. */
export function playCampaign(world: World, plan: CampaignPlan): PlayedCampaign {
  let state = createCampaign(world, {
    seed: plan.seed,
    anchorCountryId: plan.anchorCountryId,
    genome: plan.genome,
  });
  const tierReached: CampaignResult["tierReached"] = {};
  const violations = new Set<string>();
  const turnRows: TurnRow[] = [];
  const actions: Action[] = [];

  for (let t = 0; t < plan.turns; t += 1) {
    const step = runPolicy(plan.policy, state, world);
    actions.push(...step.actions);
    const tierBefore = step.state.ppTier;
    state = endTurn(step.state, world);
    if (state.ppTier > tierBefore && tierReached[state.ppTier] === undefined) {
      tierReached[state.ppTier] = { turnsCompleted: t + 1, quartersElapsed: state.quarter };
    }
    for (const problem of checkInvariants(state, world)) violations.add(problem);

    const snap = snapshot(state, world);
    const ranked = [...snap.sports].sort((a, b) => b.fandomScore - a.fandomScore);
    const player = snap.sports.find((sport) => sport.kind === "player");
    if (!player) throw new Error("Snapshot has no player sport");
    turnRows.push({
      seed: plan.seed,
      genome: plan.genomeLabel,
      turn: t + 1,
      year: snap.year,
      quarterOfYear: snap.quarterOfYear,
      ppTier: snap.ppTier,
      pp: snap.pp,
      focus: snap.focus.map((id) => id ?? "-").join("|"),
      countriesWithFans: snap.countries.filter((c) => c.casual + c.hardcore > 0).length,
      playerCasual: player.casual,
      playerHardcore: player.hardcore,
      playerFandomScore: player.fandomScore,
      playerRank: ranked.indexOf(player) + 1,
    });
  }

  const snap = snapshot(state, world);
  const ranked = [...snap.sports].sort((a, b) => b.fandomScore - a.fandomScore);
  const player = snap.sports.find((sport) => sport.kind === "player");
  if (!player) throw new Error("Snapshot has no player sport");
  const byScore = [...snap.countries].sort((a, b) => b.fandomScore - a.fandomScore);
  const countryRows = snap.countries.map((c, index): CountryRow => {
    const fans = state.countries[index]?.fans[PLAYER_INDEX];
    return {
      seed: plan.seed,
      genome: plan.genomeLabel,
      countryId: c.countryId,
      population: c.population,
      casual: fans?.casual ?? c.casual,
      hardcore: fans?.hardcore ?? c.hardcore,
      fandomScore: c.fandomScore,
      share: c.share,
      rank: byScore.indexOf(c) + 1,
      focused: c.focused,
      exposure: c.exposure,
      affinity: c.affinity,
      accessibility: c.accessibility,
      depth: c.depth,
      rivalSimilarity: c.rivalSimilarity,
    };
  });

  return {
    result: {
      seed: plan.seed,
      anchorCountryId: plan.anchorCountryId,
      genome: plan.genome,
      genomeLabel: plan.genomeLabel,
      policy: plan.policy,
      turnsPlayed: plan.turns,
      quartersElapsed: state.quarter,
      finalYear: snap.year,
      finalQuarterOfYear: snap.quarterOfYear,
      ppTier: state.ppTier,
      pp: state.pp,
      focusActions: actions.length,
      finalFocus: snap.focus,
      player: { ...player, rank: ranked.indexOf(player) + 1 },
      rivals: snap.sports.filter((sport) => sport.kind === "rival"),
      countriesWithFans: snap.countries.filter((c) => c.casual + c.hardcore > 0).length,
      topCountries: byScore.slice(0, 10).map((c) => c.countryId),
      tierReached,
      invariantViolations: [...violations],
    },
    turnRows,
    countryRows,
    finalState: state,
  };
}
