import { performance } from "node:perf_hooks";
import {
  type Action,
  broadcastEffects,
  COUNTERMOVES,
  type CountermoveKind,
  checkInvariants,
  clauseMet,
  computeExposure,
  createCampaign,
  dealIncomePerQuarter,
  dealSlateShare,
  ESCALATION_LEVELS,
  endTurn,
  escalationIndex,
  type GameState,
  type Genome,
  leagueCosts,
  leagueIncomePerQuarter,
  PLAYER_INDEX,
  QUARTERS_PER_YEAR,
  seatedCrowd,
  shrineWeights,
  snapshot,
  turnLengthQuarters,
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
  /** Whether the bot may amend rules (default true). */
  amend?: boolean;
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

type CampaignListener = (played: PlayedCampaign, ms: number) => void;
let listener: CampaignListener | null = null;

/** Called after every campaign the runner plays: progress and the time budget (budget.ts). */
export function onCampaignPlayed(next: CampaignListener | null): void {
  listener = next;
}

/** Plays one campaign: the bot acts, then the turn ends, until the turn limit or the end. */
export function playCampaign(world: World, plan: CampaignPlan): PlayedCampaign {
  const started = performance.now();
  const played = playOneCampaign(world, plan);
  listener?.(played, performance.now() - started);
  return played;
}

function playOneCampaign(world: World, plan: CampaignPlan): PlayedCampaign {
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
  /** Decision answers by "card/choice"; a decision left to End Turn counts as its default. */
  const eventAnswers: Record<string, number> = {};
  let ppSpentOnEvents = 0;
  const ppTimeline: CampaignResult["ppTimeline"] = [];
  let anchorOvertakeYears: number | null = null;
  let firstTopTurn: number | null = null;
  let longestTopStreak = 0;
  /** Per observed turn: the flagship broadcast's share of world media reach exposure. */
  const broadcastShares: number[] = [];
  let broadcastReaches = false;
  // Flagship deals (GDD v1.28).
  const dealsSigned: Record<string, number> = {};
  const demandsSigned: Record<string, number> = {};
  /** Per offseason, by the seat league's tier: the slate share before and after the cap. */
  const slates: CampaignResult["deals"]["slates"] = [];
  let slateSeason: number | null = null;
  const dealIncomeShares: number[] = [];
  let nearCollapseTurns = 0;
  /** Clause judgements by kind (GDD v1.29): seasons met, seasons missed, partners who walked. */
  const clauses: CampaignResult["deals"]["clauses"] = {};
  const tallyClause = (kind: string, field: "met" | "missed" | "walked") => {
    const entry = clauses[kind] ?? { met: 0, missed: 0, walked: 0 };
    entry[field] += 1;
    clauses[kind] = entry;
  };
  const CLAUSE_KINDS = ["balance", "star", "fans"];
  let seatTurns = 0;
  // Venues and payroll at the seat (GDD v1.30).
  let gateLost = 0;
  let payrollShare = 0;
  let wagesShare = 0;
  const venueLevels: CampaignResult["venues"]["levels"] = [];
  let levelSeason: number | null = null;

  /** Tracks peaks and lows after each turn (turn 0 is the starting state). */
  const observe = (current: GameState, turn: number) => {
    // Over the next turn's quarters, as the fans stand now: the season-end pulse fades within a
    // turn, and seasons end on turn boundaries at long turns.
    let media = 0;
    let broadcast = 0;
    for (let k = 0; k < turnLengthQuarters(current.ppTier, world.config); k += 1) {
      computeExposure({ ...current, quarter: current.quarter + k }, world).forEach(
        (exposure, i) => {
          const population = world.countries[i]?.population ?? 0;
          media += exposure.media * population;
          broadcast += exposure.broadcast * population;
        },
      );
    }
    broadcastShares.push(media > 0 ? broadcast / media : 0);
    broadcastReaches ||= broadcastEffects(current, world).reach.size > 0;
    const seat = world.countries.findIndex((c) => c.id === current.flagship.countryId);
    const seatLeague = current.countries[seat]?.league ?? null;
    if (seatLeague) {
      seatTurns += 1;
      if (seatLeague.health === "near-collapse") nearCollapseTurns += 1;
      const income = leagueIncomePerQuarter(current, world, seat);
      if (income > 0) dealIncomeShares.push(dealIncomePerQuarter(current.flagship) / income);
      const hardcore = current.countries[seat]?.fans[PLAYER_INDEX]?.hardcore ?? 0;
      if (hardcore > 0) {
        const seated = seatedCrowd(world, seat, seatLeague.venue.level, hardcore);
        gateLost += 1 - seated / hardcore;
      }
      const costs = leagueCosts(current, world, seat);
      if (costs.total > 0) {
        payrollShare += costs.payroll / costs.total;
        wagesShare += costs.wages / costs.total;
      }
      if (current.flagship.offseason && levelSeason !== current.flagship.season) {
        levelSeason = current.flagship.season;
        venueLevels.push({ tier: seatLeague.tier, level: seatLeague.venue.level });
      }
      if (current.flagship.offseason && slateSeason !== current.flagship.season) {
        slateSeason = current.flagship.season;
        const before = dealSlateShare(current, world);
        const after = dealSlateShare(current, world, true);
        if (before !== null && after !== null) {
          slates.push({ tier: seatLeague.tier, before, after });
        }
      }
    }
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

  let firstBackTurn: number | null = null;
  for (let t = 0; t < plan.turns && state.outcome === null; t += 1) {
    const landmarksBefore = state.landmarks.length;
    const step = runBot(plan.bot, state, world, { amend: plan.amend ?? true });
    actions.push(...step.actions);
    const tally = (key: string) => {
      eventAnswers[key] = (eventAnswers[key] ?? 0) + 1;
    };
    let offers = state.flagship.deals.offers;
    for (const action of step.actions) {
      if (action.type === "backStar") firstBackTurn ??= state.turn;
      if (action.type === "signDeal") {
        const offer = offers.find((o) => o.id === action.offerId);
        if (offer) {
          dealsSigned[offer.slot] = (dealsSigned[offer.slot] ?? 0) + 1;
          const demand = offer.demand?.kind ?? "none";
          demandsSigned[demand] = (demandsSigned[demand] ?? 0) + 1;
          offers = offers.filter((o) => o.slot !== offer.slot || o.position !== offer.position);
        }
      }
      if (action.type !== "chooseEvent") continue;
      const event = state.events.pending.find((e) => e.id === action.eventId);
      tally(`${event?.templateId}/${action.choiceId}`);
      const settled = step.state.events.history.find((e) => e.id === action.eventId);
      ppSpentOnEvents += settled?.resolution?.cost ?? 0;
    }
    for (const event of step.state.events.pending) {
      const card = world.events.cards.find((c) => c.id === event.templateId);
      if (card?.kind === "decision") tally(`${card.id}/${card.defaultChoice}`);
    }
    for (const landmark of step.state.landmarks.slice(landmarksBefore)) {
      if (landmark.kind !== "nodeBought") continue;
      nodesBought.push({ nodeId: landmark.nodeId, turn: t + 1, cost: landmark.cost });
      ppSpentOnNodes += landmark.cost;
    }
    const tierBefore = step.state.ppTier;
    const before = step.state;
    state = endTurn(step.state, world);
    // Clause judgements this turn: changes on deals still running, the final judgement of a
    // deal that ended at its term (judged just before it expired, in the same turn), walks.
    {
      const fresh = state.landmarks.slice(before.landmarks.length);
      const now = new Map(state.flagship.deals.signed.map((deal) => [deal.id, deal]));
      const seat = state.countries.find((c) => c.countryId === state.flagship.countryId);
      const fans =
        (seat?.fans[PLAYER_INDEX]?.casual ?? 0) + (seat?.fans[PLAYER_INDEX]?.hardcore ?? 0);
      for (const deal of before.flagship.deals.signed) {
        const kind = deal.demand?.kind ?? "";
        if (!CLAUSE_KINDS.includes(kind)) continue;
        const after = now.get(deal.id);
        if (after) {
          if (after.clauseMet > deal.clauseMet) tallyClause(kind, "met");
          else if (after.clauseMisses > deal.clauseMisses) tallyClause(kind, "missed");
          continue;
        }
        if (fresh.some((l) => l.kind === "dealWalked" && l.dealId === deal.id)) {
          tallyClause(kind, "missed");
          tallyClause(kind, "walked");
        } else if (fresh.some((l) => l.kind === "dealEnded" && l.dealId === deal.id)) {
          tallyClause(kind, clauseMet(state, world, deal, fans) ? "met" : "missed");
        }
      }
    }
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
      rankOneLostBeforeWin: state.landmarks.some(
        (l) =>
          l.kind === "rankOneLost" && l.turn <= (state.win.won?.turn ?? Number.POSITIVE_INFINITY),
      ),
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
      broadcastShare:
        broadcastShares.reduce((sum, share) => sum + share, 0) /
        Math.max(1, broadcastShares.length),
      broadcastReaches,
      anchorOvertakeYears,
      nodesBought,
      ppSpentOnNodes,
      eventAnswers,
      ppSpentOnEvents,
      flagship: (() => {
        const titles = new Map<number, number>();
        for (const season of state.flagship.seasons) {
          titles.set(season.championId, (titles.get(season.championId) ?? 0) + 1);
        }
        return {
          seasons: state.flagship.seasons.length,
          distinctChampions: titles.size,
          mostTitles: Math.max(0, ...titles.values()),
          starsMade: state.flagship.players.filter((p) => p.starSince !== null).length,
          starsBacked: actions.filter((a) => a.type === "backStar").length,
          firstBackTurn,
        };
      })(),
      deals: {
        signed: dealsSigned,
        demandsSigned,
        breaches: state.landmarks.reduce<Record<string, number>>((counts, landmark) => {
          if (landmark.kind === "dealBroken") {
            counts[landmark.demand] = (counts[landmark.demand] ?? 0) + 1;
          }
          return counts;
        }, {}),
        incomeShare:
          dealIncomeShares.reduce((sum, share) => sum + share, 0) /
          Math.max(1, dealIncomeShares.length),
        slates,
        nearCollapseShare: nearCollapseTurns / Math.max(1, seatTurns),
        clauses,
      },
      venues: {
        gateLost: gateLost / Math.max(1, seatTurns),
        payrollShare: payrollShare / Math.max(1, seatTurns),
        wagesShare: wagesShare / Math.max(1, seatTurns),
        levels: venueLevels,
        opened: state.landmarks.filter((l) => l.kind === "venueOpened").length,
        modernized: state.landmarks.filter((l) => l.kind === "venueOpened" && l.modernized).length,
        records: state.landmarks.filter((l) => l.kind === "recordCrowd").length,
      },
      remembers: {
        players: state.hallOfFame.inductees.filter((i) => i.wing === "players").length,
        moments: state.hallOfFame.inductees.filter((i) => i.wing === "moments").length,
        firstPlayerTurn: state.hallOfFame.inductees.find((i) => i.wing === "players")?.turn ?? null,
        chants: state.culture.traditions.filter((t) => t.type === "chant").length,
        chantsSpread: state.landmarks.filter((l) => l.kind === "chantSpread").length,
        anchorShrine: shrineWeights(state, world)[anchorIndex] ?? 0,
        cultureNodes: state.growthNodes.filter(
          (id) => world.growthTree.nodes.find((n) => n.id === id)?.category === "culture",
        ).length,
      },
      amendments: state.rules.amendments.map(({ turn, axis, from, to, demoted }) => ({
        turn,
        change: `${axis} ${from}→${to}`,
        demoted,
      })),
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
