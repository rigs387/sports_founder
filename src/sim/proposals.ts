import { GENOME_AXES } from "../content";
import { offseasonOpen } from "./calendar";
import { payingDeals } from "./deals";
import type { EventRecord } from "./events-state";
import { landmarks } from "./records";
import { amendBlocker, amendedThisYear, amendRule, backlashTotal, ruleSince } from "./rules";
import type { AxisId, Deal, GameState, World } from "./types";

// Deal partners' rule proposals (GDD v1.41, tech plan 2.26 step 3). Rare and small: at most one
// in `rulesEvolution.proposals.everySeasons` flagship seasons, in an offseason when no rule has
// been amended that year, from a paying partner whose deal carries a clause (balance, star or
// fans: the partners who care about the product). The partner asks for one step on the first rule
// its slot wants moved that was not amended within the window. Accepting is the year's amendment
// with no PP price and the usual backlash; declining, the default, counts as a missed clause on
// that deal, so the partner walks at the next miss if it already has one. The answer is read back
// from the journal when the next End Turn starts, as directors' asks are.

const CLAUSES: readonly string[] = ["balance", "star", "fans"];
const QUARTERS_PER_SEASON = 4;

/** The option one step from `current` toward the first or last of the trait's options, or null. */
function stepToward(axis: AxisId, current: string, toward: "first" | "last"): string | null {
  const options = GENOME_AXES[axis].options as readonly string[];
  const at = options.indexOf(current);
  const next = toward === "first" ? at - 1 : at + 1;
  return at < 0 ? null : (options[next] ?? null);
}

/** The proposal a partner would make now, the richest deal first, or null. */
export function proposalNow(
  state: GameState,
  world: World,
): { deal: Deal; axis: AxisId; to: string } | null {
  const settings = world.config.rulesEvolution.proposals;
  const seasons = settings.everySeasons;
  if (!offseasonOpen(state) || state.outcome !== null || amendedThisYear(state, world)) return null;
  const last = state.rules.proposal;
  if (last && (last.open || state.flagship.season - last.season < seasons)) return null;
  const deals = payingDeals(state.flagship)
    .filter((deal) => CLAUSES.includes(deal.demand?.kind ?? ""))
    .sort((a, b) => b.annualValue - a.annualValue || a.id - b.id);
  for (const deal of deals) {
    for (const want of settings.wants[deal.slot]) {
      const axis = want.axis as AxisId;
      if (state.quarter - ruleSince(state, axis) < seasons * QUARTERS_PER_SEASON) continue;
      const to = stepToward(axis, state.genome[axis], want.toward);
      if (to !== null) return { deal, axis, to };
    }
  }
  return null;
}

/** At End Turn's end: a partner's proposal, when one is due (a landmark its card is told from). */
export function offerProposal(state: GameState, world: World): GameState {
  const proposal = proposalNow(state, world);
  if (!proposal) return state;
  const { deal, axis, to } = proposal;
  return {
    ...state,
    rules: {
      ...state.rules,
      proposal: {
        season: state.flagship.season,
        quarter: state.quarter,
        dealId: deal.id,
        open: true,
      },
    },
    landmarks: [
      ...state.landmarks,
      landmarks.ruleProposed(
        state.turn,
        state.quarter,
        state.flagship.countryId,
        deal.id,
        deal.partnerId,
        axis,
        to,
      ),
    ],
  };
}

/** Whether an event record is the card for the open proposal. */
function isProposalCard(event: EventRecord, open: { quarter: number; dealId: number }): boolean {
  return event.facts.proposal?.dealId === open.dealId && event.quarter === open.quarter;
}

/**
 * When End Turn starts: the open proposal's answer, read from the journal. Declining counts as a
 * missed clause on the deal (its partner walks at its next miss once it has enough).
 */
export function settleProposal(state: GameState): GameState {
  const open = state.rules.proposal;
  if (!open?.open) return state;
  if (state.events.pending.some((e) => isProposalCard(e, open))) return state;
  const answered = state.events.history.find((e) => isProposalCard(e, open));
  const closed = { ...state, rules: { ...state.rules, proposal: { ...open, open: false } } };
  if (!answered || answered.resolution?.choiceId === "accept") return closed;
  const deals = closed.flagship.deals;
  return {
    ...closed,
    flagship: {
      ...closed.flagship,
      deals: {
        ...deals,
        signed: deals.signed.map((deal) =>
          deal.id === open.dealId ? { ...deal, clauseMisses: deal.clauseMisses + 1 } : deal,
        ),
      },
    },
  };
}

/** Why a proposal card cannot be accepted now (the year's amendment made, or it no longer applies). */
export function proposalBlocker(
  state: GameState,
  world: World,
  event: EventRecord,
): "rules" | null {
  const told = event.facts.proposal;
  if (!told) return "rules";
  const axis = told.axis as AxisId;
  if (state.genome[axis] !== told.from) return "rules";
  const blocker = amendBlocker(state, world, axis, told.to);
  return blocker === null || blocker === "pp" ? null : "rules";
}

/** Accepts a partner's proposal: the amendment, free of PP (GDD v1.41). */
export function acceptProposal(state: GameState, world: World, event: EventRecord): GameState {
  const told = event.facts.proposal;
  if (!told) return state;
  return amendRule(state, world, told.axis as AxisId, told.to, true);
}

/** The card's facts at the time: the partner, the change and the backlash it would bring then. */
export function proposalFacts(
  state: GameState,
  world: World,
  landmark: { dealId: number; partnerId: string; axis: AxisId; to: string },
): NonNullable<EventRecord["facts"]["proposal"]> {
  const deal = state.flagship.deals.signed.find((d) => d.id === landmark.dealId);
  return {
    dealId: landmark.dealId,
    partnerId: landmark.partnerId,
    slot: deal?.slot ?? "sponsor",
    axis: landmark.axis,
    from: state.genome[landmark.axis],
    to: landmark.to,
    demoted: backlashTotal(state, world, landmark.axis, landmark.to),
  };
}
