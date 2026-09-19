import {
  type Action,
  COUNTERMOVES,
  type CountermoveKind,
  checkInvariants,
  createCampaign,
  ESCALATION_LEVELS,
  endTurn,
  escalationIndex,
  type GameState,
  type Genome,
  PLAYER_INDEX,
  QUARTERS_PER_YEAR,
  snapshot,
  type World,
} from "../sim";
import { type BotId, runBot } from "./policy";
import {
  type CampaignResult,
  type CountryRow,
  PP_TIMELINE_TURNS,
  type RivalCampaignReport,
  type TurnRow,
  type WhereAndWhen,
} from "./report";

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

/** Lowest points one rival reached over a campaign, observed after every turn. */
interface RivalLows {
  lowestHardcoreShare: WhereAndWhen;
  lowestRetained: WhereAndWhen;
  lowestGlobalHardcoreShare: number;
  eliminatedFrom: Set<string>;
  peakAnchorLevel: number;
}

const lowest = (value: number): WhereAndWhen => ({ value, countryId: "", turn: 0 });

/** Plays one campaign: the bot acts, then the turn ends, until the turn limit or the end. */
export function playCampaign(world: World, plan: CampaignPlan): PlayedCampaign {
  let state = createCampaign(world, {
    seed: plan.seed,
    anchorCountryId: plan.anchorCountryId,
    genome: plan.genome,
  });
  const anchorIndex = world.countries.findIndex((c) => c.id === plan.anchorCountryId);
  const anchorPopulation = world.countries[anchorIndex]?.population ?? 1;
  const worldPopulation = world.countries.reduce((sum, country) => sum + country.population, 0);
  const tierReached: CampaignResult["tierReached"] = {};
  const violations = new Set<string>();
  const turnRows: TurnRow[] = [];
  const actions: Action[] = [];

  const rivalSports = state.sports.flatMap((sport, index) =>
    sport.kind === "rival" ? [{ id: sport.id, index }] : [],
  );
  const startHardcore = state.countries.map((country) => country.fans.map((fans) => fans.hardcore));
  const lows: RivalLows[] = rivalSports.map(() => ({
    lowestHardcoreShare: lowest(1),
    lowestRetained: lowest(1),
    lowestGlobalHardcoreShare: 1,
    eliminatedFrom: new Set<string>(),
    peakAnchorLevel: 0,
  }));
  let peakPlayerShare = lowest(0);
  const nodesBought: CampaignResult["nodesBought"] = [];
  let ppSpentOnNodes = 0;
  const ppTimeline: CampaignResult["ppTimeline"] = [];
  let anchorOvertakeYears: number | null = null;
  let firstTopTurn: number | null = null;
  let longestTopStreak = 0;

  /** Tracks peaks and lows after each turn (turn 0 is the starting state). */
  const observe = (current: GameState, turn: number) => {
    const rivalWorldHardcore = rivalSports.map(() => 0);
    current.countries.forEach((country, i) => {
      const population = world.countries[i]?.population ?? 1;
      const playerShare = (country.fans[PLAYER_INDEX]?.hardcore ?? 0) / population;
      if (playerShare > peakPlayerShare.value) {
        peakPlayerShare = { value: playerShare, countryId: country.countryId, turn };
      }
      rivalSports.forEach((sport, r) => {
        const low = lows[r];
        const hardcore = country.fans[sport.index]?.hardcore ?? 0;
        if (!low) return;
        rivalWorldHardcore[r] = (rivalWorldHardcore[r] ?? 0) + hardcore;
        const share = hardcore / population;
        if (share < low.lowestHardcoreShare.value) {
          low.lowestHardcoreShare = { value: share, countryId: country.countryId, turn };
        }
        const started = startHardcore[i]?.[sport.index] ?? 0;
        if (started > 0) {
          const retained = hardcore / started;
          if (retained < low.lowestRetained.value) {
            low.lowestRetained = { value: retained, countryId: country.countryId, turn };
          }
          if (hardcore === 0) low.eliminatedFrom.add(country.countryId);
        }
        if (i === anchorIndex) {
          const level = escalationIndex(country.defense[r]?.level ?? "none");
          low.peakAnchorLevel = Math.max(low.peakAnchorLevel, level);
        }
      });
    });
    rivalSports.forEach((_sport, r) => {
      const low = lows[r];
      if (low) {
        low.lowestGlobalHardcoreShare = Math.min(
          low.lowestGlobalHardcoreShare,
          (rivalWorldHardcore[r] ?? 0) / worldPopulation,
        );
      }
    });
    const anchorFans = current.countries[anchorIndex]?.fans ?? [];
    const leadingRival = Math.max(0, ...rivalSports.map((s) => anchorFans[s.index]?.hardcore ?? 0));
    if (anchorOvertakeYears === null && (anchorFans[PLAYER_INDEX]?.hardcore ?? 0) > leadingRival) {
      anchorOvertakeYears = current.quarter / QUARTERS_PER_YEAR;
    }
  };
  observe(state, 0);

  for (let t = 0; t < plan.turns && state.outcome === null; t += 1) {
    const landmarksBefore = state.landmarks.length;
    const step = runBot(plan.bot, state, world);
    actions.push(...step.actions);
    for (const landmark of step.state.landmarks.slice(landmarksBefore)) {
      if (landmark.kind !== "nodeBought") continue;
      nodesBought.push({ nodeId: landmark.nodeId, turn: t + 1, cost: landmark.cost });
      ppSpentOnNodes += landmark.cost;
    }
    const tierBefore = step.state.ppTier;
    state = endTurn(step.state, world);
    if (state.ppTier > tierBefore && tierReached[state.ppTier] === undefined) {
      tierReached[state.ppTier] = { turnsCompleted: t + 1, quartersElapsed: state.quarter };
    }
    for (const problem of checkInvariants(state, world)) violations.add(problem);
    observe(state, t + 1);
    if (PP_TIMELINE_TURNS.includes(t + 1)) {
      ppTimeline.push({ turn: t + 1, banked: state.pp, spentOnNodes: ppSpentOnNodes });
    }

    const snap = snapshot(state, world);
    const player = snap.sports.find((sport) => sport.kind === "player");
    if (!player) throw new Error("Snapshot has no player sport");
    if (snap.win.rank === 1 && firstTopTurn === null) firstTopTurn = t + 1;
    longestTopStreak = Math.max(longestTopStreak, snap.win.turnsHeld);
    const anchorSnap = snap.countries[anchorIndex];
    const anchorLeague = anchorSnap?.league ?? null;
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
      anchorPlayerHardcoreShare: (anchorSnap?.hardcore ?? 0) / anchorPopulation,
      playerRank: snap.win.rank,
      turnsHeld: snap.win.turnsHeld,
      nodesOwned: state.growthNodes.length,
      ppSpentOnNodes,
      rivals: rivalSports.map((sport, r) => ({
        sportId: sport.id,
        anchorHardcoreShare:
          (state.countries[anchorIndex]?.fans[sport.index]?.hardcore ?? 0) / anchorPopulation,
        anchorLevel: anchorSnap?.rivals[r]?.level ?? "none",
      })),
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
      rivalLevels: c.rivals.map((rival) => rival.level).join("|"),
      rivalCountermoves: c.rivals.flatMap((rival) => rival.countermoves).join("|"),
    }),
  );
  const count = (kind: string) => state.landmarks.filter((l) => l.kind === kind).length;

  const rivalReports = rivalSports.map((sport, r): RivalCampaignReport => {
    const rival = state.rivals[r];
    const low = lows[r];
    const mine = state.landmarks.filter((l) => "sportId" in l && l.sportId === sport.id);
    const countermoves = Object.fromEntries(COUNTERMOVES.map((kind) => [kind, 0])) as Record<
      CountermoveKind,
      number
    >;
    for (const landmark of mine) {
      if (landmark.kind === "rivalCountermove") countermoves[landmark.move] += 1;
      if (landmark.kind === "rivalRuleCopied") countermoves.ruleCopying += 1;
    }
    return {
      sportId: sport.id,
      budgetSpent: rival?.budgetSpent ?? 0,
      budgetLeft: rival?.budget ?? 0,
      escalations: mine.filter((l) => l.kind === "rivalEscalated").length,
      deescalations: mine.filter((l) => l.kind === "rivalDeescalated").length,
      countermoves,
      countermovesTotal: Object.values(countermoves).reduce((sum, n) => sum + n, 0),
      finalGenomeChanges: rival
        ? Object.entries(rival.genome).filter(
            ([axis, option]) =>
              world.rivals[r]?.genome[axis as keyof Genome] !== (option as string),
          ).length
        : 0,
      peakAnchorLevel: ESCALATION_LEVELS[low?.peakAnchorLevel ?? 0] ?? "none",
      anchorHardcoreShareStart: (startHardcore[anchorIndex]?.[sport.index] ?? 0) / anchorPopulation,
      anchorHardcoreShareEnd:
        (state.countries[anchorIndex]?.fans[sport.index]?.hardcore ?? 0) / anchorPopulation,
      lowestHardcoreShare: low?.lowestHardcoreShare ?? lowest(0),
      lowestRetained: low?.lowestRetained ?? lowest(0),
      lowestGlobalHardcoreShare: low?.lowestGlobalHardcoreShare ?? 0,
      eliminatedFrom: [...(low?.eliminatedFrom ?? [])],
    };
  });

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
      firstTopTurn,
      wonTurn: state.win.won?.turn ?? null,
      wonYears: state.win.won ? state.win.won.quarter / QUARTERS_PER_YEAR : null,
      longestTopStreak,
      rankOneLosses: count("rankOneLost"),
      birthplaceOutlived: count("birthplaceOutlived"),
      ppTier: state.ppTier,
      peakTier: state.tierTrack.peakTier,
      pp: state.pp,
      focusActions: actions.filter((a) => a.type === "assignFocus").length,
      bailouts: actions.filter((a) => a.type === "bailoutLeague").length,
      promotions: count("leaguePromoted"),
      stepDowns: count("leagueSteppedDown"),
      leaguesFormed: count("leagueFormed"),
      // A post-win anchor collapse folds the anchor's league like any other.
      leaguesFolded: count("leagueFolded") + count("birthplaceOutlived"),
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
        (state.countries[anchorIndex]?.fans[PLAYER_INDEX]?.hardcore ?? 0) / anchorPopulation,
      peakPlayerHardcoreShare: peakPlayerShare,
      anchorOvertakeYears,
      nodesBought,
      ppSpentOnNodes,
      forkChoices: Object.fromEntries(
        world.growthTree.forks.map((fork) => [
          fork.id,
          fork.nodes.find((id) => state.growthNodes.includes(id)) ?? null,
        ]),
      ),
      ppTimeline,
      rivalReports,
      landmarks: state.landmarks.length,
      tierReached,
      invariantViolations: [...violations],
    },
    turnRows,
    countryRows,
    finalState: state,
  };
}
