import type { EventEffect } from "../content";
import {
  type Action,
  type AxisId,
  activeClubs,
  applyAction,
  backlashTotal,
  checkAction,
  eventBlocker,
  eventChoiceCost,
  fandomScore,
  type GameState,
  keepCost,
  optionNetDelta,
  ownersLoss,
  PLAYER_INDEX,
  priceIncome,
  type World,
} from "../sim";

// How bots answer event decisions (tech plan 2.1). Without this every bot took the free default,
// so no campaign ever tested whether a paid choice is worth its PP. Each bot weighs a choice's
// effects by what it cares about and pays when the value beats the price. Like the rest of
// policy.ts, these weights shape bot behavior only; they are not game balance.
//
// A choice's value is the sum of its effects, each measured as a relative change to a fan bucket
// or to the league, so different effect types can be compared (star effects: see effectValue):
//   conversion/spread  (factor − 1) × years it lasts
//   fanShift           fans moved ÷ the bucket they join (casual or hardcore)
//   hardcoreDemotion   − share of the player's hardcore lost
//   rivalSetback       rival hardcore removed ÷ the player's hardcore there
//   leagueHealth       rungs climbed
//   clubRating         rating steps closed between the champion and the mean of the rest of
//                      the field (flagship season cards: competitive balance)
//   derbyStoke         a share of a derby's shelter against hardcore turnover (GDD v1.22)
//   pp                 PP gained, at the bot's PP price
// The price is cost × ppPrice ÷ the price level (price income ÷ the floor, GDD v1.34), because PP
// income grows with the sport as fast as prices do.

/** How far PP prices have risen from the floor (GDD v1.34): PP is worth less as prices climb. */
function priceLevel(state: GameState, world: World): number {
  return priceIncome(state, world) / world.config.ppPrices.minIncomePerQuarter;
}

export interface EventWeights {
  casual: number;
  hardcore: number;
  proximity: number;
  language: number;
  media: number;
  league: number;
  rival: number;
  /** Competitive balance in the flagship league, per rating step closed. */
  balance: number;
  /** Value of one PP at the price floor (GDD v1.34). */
  ppPrice: number;
}

export const EVENT_WEIGHTS = {
  /** Values every gain alike and PP cheaply: the naive bot takes almost any upside. */
  greedy: {
    casual: 1,
    hardcore: 1,
    proximity: 1,
    language: 1,
    media: 1,
    league: 1,
    rival: 1,
    balance: 1,
    ppPrice: 0.005,
  },
  builder: {
    casual: 1,
    hardcore: 1,
    proximity: 1,
    language: 1,
    media: 1,
    league: 1,
    rival: 1,
    balance: 1,
    ppPrice: 0.01,
  },
  turtle: {
    casual: 0.5,
    hardcore: 2,
    proximity: 0.5,
    language: 0.3,
    media: 0.3,
    league: 3,
    rival: 1,
    balance: 1.5,
    ppPrice: 0.015,
  },
  media: {
    casual: 1.5,
    hardcore: 0.5,
    proximity: 0.5,
    language: 1.5,
    media: 2,
    league: 0.5,
    rival: 0.5,
    balance: 0.5,
    ppPrice: 0.01,
  },
} satisfies Record<string, EventWeights>;

/**
 * What changing `axis` to `option` is worth to a bot that amends (GDD v1.20): the fit gain in
 * every market, weighted by its Fandom Score there, less the share of hardcore fans the backlash
 * would turn casual. The builder's own amendments and partners' proposals (GDD v1.41) both use it.
 */
export function amendmentValue(
  state: GameState,
  world: World,
  axis: AxisId,
  option: string,
): number {
  const { casualWeight } = world.config.fandomScore;
  const current = state.genome[axis];
  let total = 0;
  let gain = 0;
  let hardcore = 0;
  state.countries.forEach((country, index) => {
    const fans = country.fans[PLAYER_INDEX];
    if (!fans) return;
    hardcore += fans.hardcore;
    const weight = fandomScore(fans.casual, fans.hardcore, casualWeight);
    if (weight <= 0) return;
    total += weight;
    gain +=
      weight *
      (optionNetDelta(world, axis, option, index) - optionNetDelta(world, axis, current, index));
  });
  if (total <= 0 || hardcore <= 0) return Number.NEGATIVE_INFINITY;
  return gain / total - backlashTotal(state, world, axis, option) / hardcore;
}

function effectValue(
  state: GameState,
  world: World,
  countryId: string,
  rivalId: string | null,
  championId: number | null,
  starId: number | null,
  effect: EventEffect,
  weights: EventWeights,
  proposal: { axis: string; to: string } | null = null,
): number {
  const index = world.countries.findIndex((country) => country.id === countryId);
  const country = state.countries[index];
  const fans = country?.fans[PLAYER_INDEX];
  const population = world.countries[index]?.population ?? 0;
  if (!country || !fans) return 0;
  switch (effect.type) {
    case "conversion":
    case "spread":
      return (effect.factor - 1) * (effect.quarters / 4) * weights[effect.target];
    case "fanShift":
      return effect.target === "uninterestedToCasual"
        ? ((population - fans.casual - fans.hardcore) * effect.share * weights.casual) /
            Math.max(1, fans.casual)
        : (fans.casual * effect.share * weights.hardcore) / Math.max(1, fans.hardcore);
    case "hardcoreDemotion":
      return -effect.share * weights.hardcore;
    case "rivalSetback": {
      const rival = country.fans.find((f) => f.sportId === rivalId);
      return ((rival?.hardcore ?? 0) * effect.share * weights.rival) / Math.max(1, fans.hardcore);
    }
    case "leagueHealth":
      return effect.steps * weights.league;
    case "pp":
      return (effect.amount * weights.ppPrice) / priceLevel(state, world);
    // Late rewards by kind (GDD v1.39), valued like the effects they resemble.
    case "leagueCash": {
      const league = state.countries.find((c) => c.countryId === effect.countryId)?.league;
      return league ? (effect.amount / Math.max(1, league.cash)) * weights.league : 0;
    }
    case "traditionWeight":
      return effect.strength * weights.hardcore;
    // Star cards (GDD v1.16). Honors and mentoring keep some of a backed star's influence working
    // after they retire; keeping a star holds their strength at their old club for league cash.
    case "starHonors":
    case "starMentor": {
      const { casualConversion, mediaReach } = world.config.flagship.backing;
      const { afterglowSeasons, mentorShare } = world.config.flagship.stars;
      const star = state.flagship.players.find((p) => p.id === starId);
      const seasons =
        effect.type === "starHonors"
          ? afterglowSeasons / 2
          : mentorShare * world.config.flagship.backing.influenceSeasons;
      return (
        (star?.backing?.influence ?? 0) *
        seasons *
        (casualConversion * weights.casual + mediaReach * weights.media)
      );
    }
    case "starBack": {
      // Backing from a breakout card (GDD v1.35): a star at full influence, held for the
      // seasons influence takes to grow.
      const { casualConversion, mediaReach, influenceSeasons } = world.config.flagship.backing;
      return influenceSeasons * (casualConversion * weights.casual + mediaReach * weights.media);
    }
    case "ruleProposal":
      // A partner's proposal (GDD v1.41), valued as the builder values its own amendments.
      return proposal
        ? amendmentValue(state, world, proposal.axis as AxisId, proposal.to) * weights.hardcore
        : 0;
    case "clubMove": {
      // A club relocation (GDD v1.41): a stronger failing club and the owners' losses avoided,
      // against the hardcore fans it costs at the seat.
      const { ratingLift, hardcoreLoss } = world.config.flagship.relocation;
      const cash = Math.max(1, country.league?.cash ?? 0);
      return (
        (ratingLift / world.config.flagship.stories.ratingStep) * weights.balance +
        (ownersLoss(state, world) / cash) * weights.league -
        hardcoreLoss * weights.hardcore
      );
    }
    case "directorAsk":
      // A director's ask (GDD v1.41): bots read it as goodwill worth half a league rung, since
      // declining uses up the director's patience.
      return 0.5 * weights.league;
    case "starSign": {
      // A player from abroad (GDD v1.37): the broadcast's link into their home market grows
      // while they play, for the seasons a backing takes to grow.
      const { influenceSeasons } = world.config.flagship.backing;
      return influenceSeasons * world.config.standouts.follow.link * weights.media;
    }
    case "starKeep": {
      // A typical star's strength (bots never read hidden skill) stays with the weaker club, in
      // rating steps of competitive balance, against the share of league cash it costs.
      const league = country.league;
      if (!league || league.cash <= 0) return Number.NEGATIVE_INFINITY;
      const { stars, players, stories } = world.config.flagship;
      const balance = (stars.strengthPerSkill * players.peakSkill.mean) / stories.ratingStep;
      return (
        balance * weights.balance -
        (keepCost(state, world, countryId) / league.cash) * weights.league
      );
    }
    case "derbyStoke": {
      // A share of a derby (GDD v1.22): one meeting of those it needs, at its starting strength,
      // as the hardcore turnover it would spare at full weight.
      const { derby, startStrength, turnoverCut, weightCap } = world.config.culture;
      return (startStrength / weightCap / derby.meetings) * turnoverCut * weights.hardcore;
    }
    case "clubRating": {
      const clubs = activeClubs(state.flagship);
      const champion = clubs.find((club) => club.id === championId);
      const field = clubs.filter((club) => club.id !== championId);
      if (!champion || field.length === 0) return 0;
      const gap = champion.rating - field.reduce((sum, c) => sum + c.rating, 0) / field.length;
      const step = world.config.flagship.stories.ratingStep;
      const moved = effect.target === "champion" ? effect.steps * step : -effect.steps * step;
      return ((Math.abs(gap) - Math.abs(gap + moved)) / step) * weights.balance;
    }
  }
}

/** Net value of a choice to a bot: its effects minus its price. */
export function choiceValue(
  state: GameState,
  world: World,
  eventId: number,
  choiceId: string,
  weights: EventWeights,
): number {
  const event = state.events.pending.find((e) => e.id === eventId);
  const card = world.events.cards.find((c) => c.id === event?.templateId);
  const choice = card?.choices.find((c) => c.id === choiceId);
  if (!event || !card || !choice) return Number.NEGATIVE_INFINITY;
  const gains = choice.effects.reduce(
    (sum, effect) =>
      sum +
      effectValue(
        state,
        world,
        event.countryId,
        event.facts.rivalId,
        event.facts.season?.championId ?? null,
        event.facts.star?.playerId ?? null,
        effect,
        weights,
        event.facts.proposal ?? null,
      ),
    0,
  );
  const price =
    (eventChoiceCost(state, world, card, choiceId) * weights.ppPrice) / priceLevel(state, world);
  return gains - price;
}

/**
 * Answers every pending decision with its best-valued legal choice that leaves `reserve` PP, or
 * leaves it for the default when nothing beats the default. Moments are left for End Turn to
 * collect, as before.
 */
export function chooseEvents(
  state: GameState,
  world: World,
  weights: EventWeights,
  reserve: number,
  /** Whether the bot amends rules: one that never does turns every proposal down (GDD v1.41). */
  amend = false,
): { state: GameState; actions: Action[] } {
  let current = state;
  const actions: Action[] = [];
  for (const event of state.events.pending) {
    const card = world.events.cards.find((c) => c.id === event.templateId);
    if (card?.kind !== "decision") continue;
    let best: { choiceId: string; value: number } | null = null;
    for (const choice of card.choices) {
      if (eventBlocker(current, world, event.id, choice.id) !== null) continue;
      if (!amend && choice.effects.some((effect) => effect.type === "ruleProposal")) continue;
      const cost = eventChoiceCost(current, world, card, choice.id);
      if (cost > 0 && current.pp - cost < reserve) continue;
      const value = choiceValue(current, world, event.id, choice.id, weights);
      const isDefault = choice.id === card.defaultChoice;
      if (best === null || value > best.value || (value === best.value && isDefault)) {
        best = { choiceId: choice.id, value };
      }
    }
    if (best === null || best.choiceId === card.defaultChoice) continue;
    const action: Action = { type: "chooseEvent", eventId: event.id, choiceId: best.choiceId };
    if (checkAction(current, world, action) !== null) continue;
    current = applyAction(current, world, action);
    actions.push(action);
  }
  return { state: current, actions };
}
