import { describe, expect, it } from "vitest";
import {
  applyAction,
  createCampaign,
  type Deal,
  type GameState,
  offerEvents,
  offerProposal,
  proposalNow,
  settleEvents,
  settleProposal,
} from "../src/sim";
import { setupFor, world } from "./helpers";

// Deal partners' rule proposals (GDD v1.41, tech plan 2.26 step 3): one anchor, direct calls.

/** A Brazil campaign ten years in, offseason open, with a paying TV deal that has a balance clause. */
function withPartner(): GameState {
  const state = createCampaign(world, setupFor(5, "brazil"));
  const season = state.flagship.season;
  const deal: Deal = {
    id: 1,
    slot: "tv",
    position: 0,
    partnerId: "lantern-sports",
    annualValue: 100,
    seasons: 4,
    demand: { kind: "balance" },
    renewal: false,
    firstSeason: season - 1,
    lastSeason: season + 20,
    countryId: "brazil",
    clauseMet: 0,
    clauseMisses: 0,
    fansMark: 0,
  };
  return {
    ...state,
    // The default preset is already short and high scoring: give the partner something to want.
    genome: { ...state.genome, matchLength: "standard", scoring: "medium" },
    quarter: 40,
    flagship: {
      ...state.flagship,
      offseason: true,
      deals: { ...state.flagship.deals, signed: [deal] },
    },
  };
}

/** The proposal offered and its card on the table. */
function proposed(state: GameState): GameState {
  return offerEvents(offerProposal(state, world), world, 1);
}

const card = (state: GameState) =>
  state.events.pending.find((e) => e.templateId === "partner-proposal");

describe("partner rule proposals", () => {
  it("a clause partner asks for one step on the first rule its slot wants", () => {
    const state = withPartner();
    const proposal = proposalNow(state, world);
    const want = world.config.rulesEvolution.proposals.wants.tv;
    expect(want.map((w) => w.axis)).toContain(proposal?.axis);
    const offered = proposed(state);
    expect(card(offered)?.facts.proposal).toMatchObject({
      partnerId: "lantern-sports",
      axis: proposal?.axis,
      to: proposal?.to,
    });
    // One at a time, and none from a partner without a clause.
    expect(proposalNow(offered, world)).toBeNull();
    const plain = withPartner();
    const deals = plain.flagship.deals;
    const noClause = {
      ...plain,
      flagship: {
        ...plain.flagship,
        deals: { ...deals, signed: deals.signed.map((d) => ({ ...d, demand: null })) },
      },
    };
    expect(proposalNow(noClause, world)).toBeNull();
  });

  it("accepting amends the rule for no PP; then none for the window", () => {
    const offered = proposed(withPartner());
    const told = card(offered);
    if (!told?.facts.proposal) throw new Error("No proposal card");
    const accepted = applyAction(offered, world, {
      type: "chooseEvent",
      eventId: told.id,
      choiceId: "accept",
    });
    const axis = told.facts.proposal.axis as keyof GameState["genome"];
    expect(accepted.genome[axis]).toBe(told.facts.proposal.to);
    expect(accepted.pp).toBe(offered.pp);
    const settled = settleProposal(accepted);
    expect(settled.flagship.deals.signed[0]?.clauseMisses).toBe(0);
    expect(settled.rules.proposal?.open).toBe(false);
    // The next offseason: inside the window, nothing.
    const next = { ...settled, quarter: settled.quarter + 4, rules: { ...settled.rules } };
    const later = { ...next, flagship: { ...next.flagship, season: next.flagship.season + 1 } };
    expect(proposalNow(later, world)).toBeNull();
  });

  it("declining, the default, is a missed clause", () => {
    const offered = proposed(withPartner());
    const declined = settleProposal(settleEvents(offered, world));
    expect(declined.flagship.deals.signed[0]?.clauseMisses).toBe(1);
    expect(declined.genome).toEqual(offered.genome);
  });
});
