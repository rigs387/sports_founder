import { AXIS_IDS, GENOME_AXES } from "../content";
import { offseasonOpen } from "./calendar";
import {
  betrayGround,
  nameTrophy,
  nameTrophyBlocker,
  renameTrophy,
  renameTrophyBlocker,
} from "./culture";
import { breakDeals, signBlocker, signDeal } from "./deals";
import { eventBlocker, minorMomentIds, resolveEvent } from "./events";
import { backBlocker, backStar, dropBlocker, dropStar, seatBlocker } from "./flagship";
import { growthFactorsAt, growthNode, nodeBlocker, nodeCost } from "./growth";
import { bulkPromotable, leagueActionReason, leagueActions } from "./league-actions";
import {
  bailoutTerms,
  demoteHardcore,
  leagueTierIndex,
  promotionTerms,
  runningCostPerQuarter,
} from "./leagues";
import { ppPrice } from "./prices";
import { landmarks } from "./records";
import { amendBlocker, amendmentJump, amendmentPrice, amendRule } from "./rules";
import { computeExposure } from "./spread";
import {
  type AxisId,
  type GameState,
  LEAGUE_TIERS,
  type LeagueTierId,
  PLAYER_INDEX,
  type World,
} from "./types";
import { buildVenue, venueBlocker } from "./venue-actions";

// The player's legal actions. Every action, from the UI or a bot, goes through applyAction, which
// validates legality first, so nothing can bypass the rules.
//   collectMinorMoments  collect every minor moment waiting, in order (GDD v1.32: auto-collect)
//   assignFocus     point a focus slot at a country (GDD Spread Model: focus slots, cold launches)
//   dropFocusSlot   give up a slot owed after a PP tier demotion
//   promoteLeague   promote a qualifying league, in the offseason only (GDD League tiers)
//   stepDownLeague  restructure a Near-Collapse league one tier down
//   bailoutLeague   emergency PP → cash for a league in trouble, with a cooldown
//   buyNode         buy a growth tree node (GDD PP Growth Tree); permanent, no refunds
//   moveSeat        ask to move the commissioner's seat to a Professional or Elite league, in the
//                   offseason; it moves when the offseason closes (GDD v1.13, v1.24). Asking for
//                   the current seat's country cancels a pending move.
//   backStar        back a flagship star, in the offseason, for a one-time PP price
//   dropStar        drop a backed star, in the offseason; their influence is lost
//   amendRule       change one rule trait, in the offseason, once a year (GDD v1.20)
//   nameTrophy      name the flagship's newborn trophy, free, while its champion card is open
//                   (GDD v1.22)
//   renameTrophy    rename the seat's trophy in the offseason: the old trophy tradition
//                   ends and its followers' purists turn casual (GDD v1.22)
//   signDeal        sign a flagship deal offer, in the offseason; the slot's other offers are
//                   withdrawn (GDD v1.28)
//   buildVenue      start building the seat's next venue level with league cash, in the
//                   offseason, one level at a time (GDD v1.30)

export type Action =
  | { type: "collectMoment"; eventId: number }
  | { type: "collectMinorMoments" }
  | { type: "chooseEvent"; eventId: number; choiceId: string }
  | { type: "buyNode"; nodeId: string }
  | { type: "assignFocus"; slot: number; countryId: string }
  | { type: "dropFocusSlot"; slot: number }
  | { type: "promoteLeague"; countryId: string }
  /** Every eligible league but the flagship, into one tier (GDD v1.34). */
  | { type: "promoteLeagues"; to: LeagueTierId }
  | { type: "stepDownLeague"; countryId: string }
  | { type: "bailoutLeague"; countryId: string }
  | { type: "moveSeat"; countryId: string }
  | { type: "backStar"; playerId: number }
  | { type: "dropStar"; playerId: number }
  | { type: "amendRule"; axis: AxisId; option: string }
  | { type: "nameTrophy"; name: string }
  | { type: "renameTrophy"; name: string }
  | { type: "signDeal"; offerId: number }
  | { type: "buildVenue" };

export class IllegalActionError extends Error {
  override name = "IllegalActionError";
  readonly action: Action;

  constructor(action: Action, reason: string) {
    super(`Illegal action ${JSON.stringify(action)}: ${reason}`);
    this.action = action;
  }
}

/**
 * PP cost of pointing a focus slot at a country, in quarters of income (GDD v1.34). A cold
 * launch (no exposure) costs the most; existing organic exposure makes it cheaper, down to
 * exposedQuarters once exposure reaches costSaturationExposure. The cold-launch premium (the part
 * above exposedQuarters) is scaled by the growth tree's factor in that country.
 */
export function focusCostFromExposure(
  organicExposure: number,
  state: Pick<GameState, "countries" | "growthNodes">,
  world: World,
  countryIndex: number,
): number {
  const { focus } = world.config;
  const level = Math.min(1, organicExposure / focus.costSaturationExposure);
  const premium = growthFactorsAt(world, state.growthNodes, countryIndex).coldLaunchPremium;
  const quarters =
    focus.exposedQuarters +
    (focus.coldLaunchQuarters - focus.exposedQuarters) * (1 - level) * premium;
  return ppPrice(state, world, quarters);
}

export function focusCost(state: GameState, world: World, countryId: string): number {
  const index = countryIndexOf(world, countryId);
  if (index < 0) throw new Error(`Unknown country "${countryId}"`);
  const exposure = computeExposure(state, world)[index];
  return focusCostFromExposure(exposure?.organic ?? 0, state, world, index);
}

function countryIndexOf(world: World, countryId: string): number {
  return world.countries.findIndex((country) => country.id === countryId);
}

const money = (value: number) => value.toFixed(1);

/** Returns why an action is illegal, or null if it is legal. */
export function checkAction(state: GameState, world: World, action: Action): string | null {
  if (state.outcome !== null) return "the campaign has ended";
  if (action.type === "collectMinorMoments")
    return minorMomentIds(state, world).length === 0 ? "no minor moment waits" : null;
  if (action.type === "collectMoment" || action.type === "chooseEvent")
    return eventBlocker(
      state,
      world,
      action.eventId,
      action.type === "chooseEvent" ? action.choiceId : null,
    );

  if (action.type === "buyNode") {
    if (!world.growthTree.nodes.some((node) => node.id === action.nodeId)) {
      return `unknown growth node "${action.nodeId}"`;
    }
    const blocker = nodeBlocker(state, world, action.nodeId);
    if (blocker !== null) {
      switch (blocker.kind) {
        case "owned":
          return `"${action.nodeId}" is already owned (nodes are permanent)`;
        case "fork":
          return `"${action.nodeId}" is locked out: "${blocker.takenBy}" was chosen in the ${blocker.forkId} fork`;
        case "tier":
          return `${growthNode(world, action.nodeId).category} nodes unlock at PP tier ${blocker.unlockTier} (you are at tier ${state.ppTier})`;
        case "prerequisites":
          return `"${action.nodeId}" needs ${blocker.missing.map((id) => `"${id}"`).join(" and ")} first`;
      }
    }
    const cost = nodeCost(state, world, action.nodeId);
    if (state.pp < cost) return `not enough PP: costs ${money(cost)}, you have ${money(state.pp)}`;
    return null;
  }

  if (action.type === "dropFocusSlot") {
    if (state.tierTrack.slotsToDrop <= 0) return "no focus slot needs to be dropped";
    if (!Number.isInteger(action.slot) || action.slot < 0 || action.slot >= state.focus.length) {
      return `slot ${action.slot} does not exist`;
    }
    return null;
  }

  if (action.type === "assignFocus") {
    if (!Number.isInteger(action.slot) || action.slot < 0 || action.slot >= state.focus.length) {
      return `slot ${action.slot} does not exist (you have ${state.focus.length} focus slot(s) at PP tier ${state.ppTier})`;
    }
    if (countryIndexOf(world, action.countryId) < 0) {
      return `unknown country "${action.countryId}"`;
    }
    if (state.focus.includes(action.countryId)) {
      return `"${action.countryId}" already has a focus slot`;
    }
    const cost = focusCost(state, world, action.countryId);
    if (state.pp < cost) return `not enough PP: costs ${money(cost)}, you have ${money(state.pp)}`;
    return null;
  }

  if (action.type === "amendRule") {
    if (!(AXIS_IDS as readonly string[]).includes(action.axis))
      return `unknown trait "${action.axis}"`;
    if (!(GENOME_AXES[action.axis].options as readonly string[]).includes(action.option))
      return `"${action.option}" is not an option of ${action.axis}`;
    switch (amendBlocker(state, world, action.axis, action.option)) {
      case "window":
        return "rules can only be amended in the offseason";
      case "thisYear":
        return "the rules have already been amended this year";
      case "identity":
        return `${action.axis} is an identity trait and never changes`;
      case "same":
        return `${action.axis} is already ${action.option}`;
      case "pp": {
        const jump = amendmentJump(action.axis, state.genome[action.axis], action.option, world);
        return `not enough PP: costs ${money(amendmentPrice(state, world, jump))}, you have ${money(state.pp)}`;
      }
      case null:
        return null;
    }
  }
  if (action.type === "nameTrophy") {
    switch (nameTrophyBlocker(state, world, action.name)) {
      case "none":
        return "there is no newborn trophy to name";
      case "name":
        return "the trophy's name is too short or too long";
      case null:
        return null;
    }
  }
  if (action.type === "renameTrophy") {
    const open = offseasonOpen(state);
    switch (renameTrophyBlocker(state, world, action.name, open)) {
      case "trophy":
        return "the league at the seat has no trophy";
      case "naming":
        return "the newborn trophy is named for free (nameTrophy)";
      case "window":
        return "the trophy can only be renamed in the offseason";
      case "name":
        return "the trophy's name is too short or too long";
      case "same":
        return "the trophy already has that name";
      case null:
        return null;
    }
  }
  if (action.type === "backStar") return backBlocker(state, world, action.playerId);
  if (action.type === "signDeal") {
    switch (signBlocker(state, action.offerId)) {
      case "window":
        return "deals are signed only in the offseason";
      case "offer":
        return `no deal offer #${action.offerId} is on the table`;
      case null:
        return null;
    }
  }
  if (action.type === "dropStar") return dropBlocker(state, world, action.playerId);
  if (action.type === "buildVenue") {
    switch (venueBlocker(state, world)) {
      case "window":
        return "venues are built only in the offseason";
      case "league":
        return "the seat's country has no league";
      case "top":
        return "the venue is already at the top level";
      case "building":
        return "a venue level is already being built";
      case "cash":
        return "the league cannot afford the next venue level";
      case null:
        return null;
    }
  }

  if (action.type === "moveSeat") {
    if (countryIndexOf(world, action.countryId) < 0) return `unknown country "${action.countryId}"`;
    if (action.countryId === state.flagship.countryId) {
      return state.flagship.pendingCountryId !== null ? null : "the seat is already there";
    }
    switch (seatBlocker(state, world, action.countryId, offseasonOpen(state))) {
      case "window":
        return "the seat can only move in the offseason";
      case "same":
        return "the seat is already there";
      case "league":
        return `"${action.countryId}" has no league`;
      case "tier":
        return "only a Professional or Elite league can take the seat";
      case null:
        return null;
    }
  }

  if (action.type === "promoteLeagues") {
    if (!offseasonOpen(state)) return "leagues can only be promoted in the offseason";
    if (bulkPromotable(state, world, action.to).length === 0)
      return `no league can be promoted to ${action.to} now`;
    return null;
  }

  if (
    action.type !== "promoteLeague" &&
    action.type !== "stepDownLeague" &&
    action.type !== "bailoutLeague"
  ) {
    return `unknown action type "${String((action as { type: unknown }).type)}"`;
  }
  const index = countryIndexOf(world, action.countryId);
  if (index < 0) return `unknown country "${action.countryId}"`;
  const country = state.countries[index];
  const league = country?.league ?? null;
  if (!country || league === null) return `"${action.countryId}" has no league`;

  const options = leagueActions(state, world, index);
  if (!options) throw new Error("unreachable: league was checked");
  return leagueActionReason(options[action.type].blocker);
}

/**
 * Applies a legal action. Throws IllegalActionError otherwise. Pure: returns a new state. A deal
 * whose demand the action breaks (a step-down below a tier floor) ends at once (GDD v1.28).
 */
export function applyAction(state: GameState, world: World, action: Action): GameState {
  const reason = checkAction(state, world, action);
  if (reason !== null) throw new IllegalActionError(action, reason);
  return breakDeals(applyLegal(state, world, action), world);
}

function applyLegal(state: GameState, world: World, action: Action): GameState {
  switch (action.type) {
    case "collectMoment":
      return resolveEvent(state, world, action.eventId, null);
    case "collectMinorMoments":
      return minorMomentIds(state, world).reduce(
        (next, eventId) => resolveEvent(next, world, eventId, null),
        state,
      );
    case "chooseEvent":
      return resolveEvent(state, world, action.eventId, action.choiceId);
    case "buyNode": {
      const cost = nodeCost(state, world, action.nodeId);
      return {
        ...state,
        pp: state.pp - cost,
        growthNodes: [...state.growthNodes, action.nodeId],
        landmarks: [
          ...state.landmarks,
          landmarks.nodeBought(state.turn, state.quarter, action.nodeId, cost),
        ],
      };
    }
    case "assignFocus": {
      const cost = focusCost(state, world, action.countryId);
      const focus = [...state.focus];
      focus[action.slot] = action.countryId;
      return { ...state, pp: state.pp - cost, focus };
    }
    case "dropFocusSlot":
      return {
        ...state,
        focus: state.focus.filter((_, slot) => slot !== action.slot),
        tierTrack: { ...state.tierTrack, slotsToDrop: state.tierTrack.slotsToDrop - 1 },
      };
    case "promoteLeague":
      return updateLeague(state, world, action.countryId, (country, index) => {
        const league = country.league;
        const terms = league ? promotionTerms(world, index, league.tier, state.growthNodes) : null;
        if (!league || !terms) throw new Error("unreachable: promotion was checked");
        return {
          country: {
            ...country,
            // Investors fund the step up (GDD v1.34).
            league: { ...league, tier: terms.to, cash: league.cash + terms.investment },
          },
          landmark: landmarks.leaguePromoted(
            state.turn,
            state.quarter,
            country.countryId,
            league.tier,
            terms.to,
          ),
        };
      });
    case "promoteLeagues":
      // One promotion each, in content order, as if each were promoted on its own.
      return bulkPromotable(state, world, action.to).reduce(
        (next, countryId) => applyLegal(next, world, { type: "promoteLeague", countryId }),
        state,
      );
    case "stepDownLeague":
      return updateLeague(state, world, action.countryId, (country) => {
        const league = country.league;
        const to = league ? LEAGUE_TIERS[leagueTierIndex(league.tier) - 1] : undefined;
        if (!league || to === undefined) throw new Error("unreachable: step-down was checked");
        const fans = country.fans.map((sport, sportIndex) =>
          sportIndex === PLAYER_INDEX
            ? demoteHardcore(sport, world.config.leagues.stepDown.hardcoreDemotionShare)
            : sport,
        );
        return {
          country: {
            ...country,
            fans,
            league: {
              ...league,
              tier: to,
              health: "struggling",
              // A restructure is a clean slate for the hardcore trend.
              hardcoreAtLastEval: fans[PLAYER_INDEX]?.hardcore ?? 0,
            },
          },
          landmark: landmarks.leagueSteppedDown(
            state.turn,
            state.quarter,
            country.countryId,
            league.tier,
            to,
          ),
        };
      });
    case "amendRule":
      return amendRule(state, world, action.axis, action.option);
    case "nameTrophy":
      return nameTrophy(state, action.name);
    case "renameTrophy":
      return renameTrophy(state, world, action.name);
    case "backStar":
      return backStar(state, world, action.playerId);
    case "signDeal": {
      // Naming rights on a famous or founding ground betray it (GDD v1.28).
      const offer = state.flagship.deals.offers.find((o) => o.id === action.offerId);
      const signed = signDeal(state, action.offerId);
      return offer?.slot === "namingRights" ? betrayGround(signed, world, offer.position) : signed;
    }
    case "dropStar":
      return dropStar(state, world, action.playerId);
    case "buildVenue":
      return buildVenue(state, world);
    case "moveSeat":
      return {
        ...state,
        flagship: {
          ...state.flagship,
          pendingCountryId: action.countryId === state.flagship.countryId ? null : action.countryId,
        },
      };
    case "bailoutLeague": {
      const index = countryIndexOf(world, action.countryId);
      const terms = bailoutTerms(state, world, index);
      const next = updateLeague(state, world, action.countryId, (country) => {
        const league = country.league;
        if (!league) throw new Error("unreachable: bailout was checked");
        return {
          country: {
            ...country,
            league: {
              ...league,
              cash: league.cash + terms.cash,
              bailoutReadyQuarter: state.quarter + world.config.leagues.bailout.cooldownQuarters,
            },
          },
          landmark: null,
        };
      });
      return { ...next, pp: state.pp - terms.ppCost };
    }
  }
}

function updateLeague(
  state: GameState,
  world: World,
  countryId: string,
  change: (
    country: GameState["countries"][number],
    index: number,
  ) => {
    country: GameState["countries"][number];
    landmark: GameState["landmarks"][number] | null;
  },
): GameState {
  const index = countryIndexOf(world, countryId);
  const country = state.countries[index];
  if (!country) throw new Error(`Unknown country "${countryId}"`);
  const result = change(country, index);
  const countries = [...state.countries];
  countries[index] = result.country;
  return {
    ...state,
    countries,
    landmarks: result.landmark ? [...state.landmarks, result.landmark] : state.landmarks,
  };
}

/** Running cost per quarter of a country's current league, or 0 without one. */
export function leagueRunningCost(state: GameState, world: World, countryId: string): number {
  const index = countryIndexOf(world, countryId);
  const league = state.countries[index]?.league;
  return league ? runningCostPerQuarter(world, index, league.tier, state.growthNodes) : 0;
}
