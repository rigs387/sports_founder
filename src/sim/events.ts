import type { EventEffect, EventTemplate, MomentWeight } from "../content";
import { costMultiplier } from "./calendar";
import { venueStrength } from "./culture";
import { offerDealCards } from "./deal-cards";
import type { EventRecord, EventState } from "./events-state";
import { activeClubs, moveClubRatings } from "./flagship";
import { nodeSizeFactor } from "./growth";
import { offerHallCards } from "./hall-cards";
import { classHeadline, classPP } from "./hall-of-fame";
import { seasonFacts, seasonStories } from "./season-stories";
import {
  applyStarEffect,
  breakoutPP,
  keepCost,
  offerStarCards,
  starEffectBlocker,
  takesNoSlot,
} from "./star-cards";
import { birthPP, offerTraditionCards } from "./tradition-cards";
import { type GameState, HEALTH_LEVELS, PLAYER_INDEX, type World } from "./types";
import { offerVenueCards } from "./venue-cards";

export function eventFactors(
  state: Pick<GameState, "events" | "quarter">,
  world: World,
  countryId: string,
) {
  const factors = { casual: 1, hardcore: 1, proximity: 1, language: 1, media: 1 };
  if (state.events.modifiers.length === 0) return factors;
  for (const modifier of state.events.modifiers)
    if (modifier.countryId === countryId && modifier.endQuarter > state.quarter)
      factors[modifier.effect.target] *= modifier.effect.factor;
  const { minFactor, maxFactor } = world.events.settings;
  for (const key of Object.keys(factors) as (keyof typeof factors)[])
    factors[key] = Math.max(minFactor, Math.min(maxFactor, factors[key]));
  return factors;
}

const keyFor = (card: EventTemplate, countryId: string) =>
  card.scope === "campaign" ? card.id : `${card.id}/${countryId}`;

/**
 * The flagship season as cards (GDD v1.15), offered before every other card. Each season that ended
 * since the last offer brings its champion moment and at most one story card: the first story it
 * qualifies for, in priority order, that is off cooldown (counted in seasons). A pressure card's
 * arrival effects land now and are never cancelled.
 */
function offerSeasonCards(
  state: GameState,
  world: World,
  recent: GameState["landmarks"],
  events: EventState,
): EventState {
  const pending = [...events.pending];
  const seasonOffered = { ...events.seasonOffered };
  const modifiers = [...events.modifiers];
  let nextId = events.nextId;
  const seasons = state.flagship.seasons;
  for (const landmark of recent) {
    if (landmark.kind !== "seasonChampion") continue;
    const index = seasons.findIndex((summary) => summary.season === landmark.season);
    const summary = seasons[index];
    const country = state.countries.find((c) => c.countryId === summary?.countryId);
    const fans = country?.fans[PLAYER_INDEX];
    if (!summary || !country || !fans) continue;
    const facts = seasonFacts(seasons, index, state.flagship.players);
    const offer = (card: EventTemplate) => {
      const id = nextId++;
      pending.push({
        id,
        templateId: card.id,
        countryId: country.countryId,
        turn: state.turn,
        // When the season ended, so the turn's replay can show the card there (GDD v1.24).
        quarter: landmark.quarter,
        facts: {
          casual: fans.casual,
          hardcore: fans.hardcore,
          leagueTier: country.league?.tier ?? null,
          health: country.league?.health ?? null,
          rivalId: null,
          season: facts,
          star: null,
          tradition: null,
          deal: null,
          venue: null,
          hall: null,
        },
        resolution: null,
      });
      for (const effect of card.arrivalEffects)
        modifiers.push({
          eventId: id,
          countryId: country.countryId,
          effect,
          endQuarter: state.quarter + effect.quarters,
        });
    };
    const champion = world.events.cards.find((card) => card.story === "champion");
    if (champion && state.ppTier >= champion.minTier) offer(champion);
    for (const story of seasonStories(seasons, index, world)) {
      const card = world.events.cards.find((c) => c.story === story);
      if (!card || state.ppTier < card.minTier) continue;
      // Unlike turn cooldowns, no cooldown means the story may come back every season.
      const last = seasonOffered[card.id];
      if (
        last !== undefined &&
        card.cooldownSeasons !== null &&
        summary.season - last < card.cooldownSeasons
      )
        continue;
      offer(card);
      seasonOffered[card.id] = summary.season;
      break;
    }
  }
  return { ...events, pending, seasonOffered, modifiers, nextId };
}

/** Priority then audience then content order: no wall clock or extra random stream. */
export function offerEvents(state: GameState, world: World, elapsedQuarters: number): GameState {
  if (state.outcome) return state;
  const settings = world.events.settings;
  const recent = state.landmarks.slice(state.events.landmarkCursor);
  // A Hall of Fame class (GDD v1.31) follows the champion card and takes no slot.
  const seasonEvents = offerHallCards(
    state,
    world,
    recent,
    offerSeasonCards(state, world, recent, state.events),
  );
  const ranked = state.countries
    .map((country, index) => ({ country, index }))
    .sort((a, b) => {
      const aFans = a.country.fans[PLAYER_INDEX];
      const bFans = b.country.fans[PLAYER_INDEX];
      return (
        (bFans?.casual ?? 0) +
          (bFans?.hardcore ?? 0) -
          ((aFans?.casual ?? 0) + (aFans?.hardcore ?? 0)) || a.index - b.index
      );
    });
  const activeMarkets = ranked.filter(({ country }) => {
    const fans = country.fans[PLAYER_INDEX];
    return (fans?.casual ?? 0) + (fans?.hardcore ?? 0) >= settings.activeFans;
  }).length;
  const caps = {
    moment: Math.min(
      settings.maxMoments,
      Math.floor(
        settings.baseMoments +
          settings.momentsPerQuarter * elapsedQuarters +
          activeMarkets / settings.marketsPerExtraMoment,
      ),
    ),
    decision: settings.maxDecisions,
  };
  // Star cards (GDD v1.16) follow the season cards, inside the caps.
  const used = (kind: "moment" | "decision", list: typeof seasonEvents.pending) =>
    list.filter((event) => {
      const card = world.events.cards.find((c) => c.id === event.templateId);
      return card?.kind === kind && !takesNoSlot(card);
    }).length;
  const starEvents = offerStarCards(state, world, recent, seasonEvents, {
    moment: caps.moment - used("moment", seasonEvents.pending),
    decision: caps.decision - used("decision", seasonEvents.pending),
  });
  // Tradition moments (GDD v1.22) follow, in the moment slots left.
  const traditionEvents = offerTraditionCards(
    state,
    world,
    recent,
    starEvents,
    caps.moment - used("moment", starEvents.pending),
  );
  // Deal news (GDD v1.28) and venue news (GDD v1.30) take no slot.
  const dealEvents = offerVenueCards(
    state,
    world,
    recent,
    offerDealCards(state, world, recent, traditionEvents),
  );
  const pending = [...dealEvents.pending];
  const offered = { ...state.events.offered };
  let nextId = dealEvents.nextId;
  for (const card of [...world.events.cards].sort((a, b) => b.priority - a.priority)) {
    if (
      card.trigger === "seasonEnd" ||
      card.trigger === "star" ||
      card.trigger === "tradition" ||
      card.trigger === "deal" ||
      card.trigger === "venue" ||
      card.trigger === "hall"
    )
      continue;
    if (state.quarter < card.minQuarter || state.ppTier < card.minTier) continue;
    for (const { country } of ranked) {
      // The champion and breakout moments never take a moment slot; a season story counts as a
      // decision.
      if (
        pending.filter((event) => {
          const other = world.events.cards.find((c) => c.id === event.templateId);
          return other?.kind === card.kind && !takesNoSlot(other);
        }).length >= caps[card.kind]
      )
        break;
      if (card.anchorOnly && country.countryId !== state.anchorCountryId) continue;
      const key = keyFor(card, country.countryId);
      const last = offered[key];
      if (
        last !== undefined &&
        (card.cooldownTurns === null || state.turn - last < card.cooldownTurns)
      )
        continue;
      const fans = country.fans[PLAYER_INDEX];
      if (!fans || fans.casual + fans.hardcore < card.minFans || fans.hardcore < card.minHardcore)
        continue;
      if (card.health.length && (!country.league || !card.health.includes(country.league.health)))
        continue;
      const fact = recent.find((landmark) =>
        card.trigger === "rivalReclaim"
          ? landmark.kind === "rivalCountermove" &&
            landmark.move === "reclaim" &&
            landmark.countryId === country.countryId
          : card.trigger === "rivalTournament"
            ? // A world championship is global: told in the player's biggest market.
              landmark.kind === "rivalTournament" && country === ranked[0]?.country
            : landmark.kind === card.trigger &&
              "countryId" in landmark &&
              landmark.countryId === country.countryId,
      );
      if (card.trigger !== "audience" && card.trigger !== "leaguePressure" && !fact) continue;
      if (
        ["leaguePressure", "leagueFormed", "leaguePromoted"].includes(card.trigger) &&
        !country.league
      )
        continue;
      pending.push({
        id: nextId++,
        templateId: card.id,
        countryId: country.countryId,
        turn: state.turn,
        // The quarter of the fact behind the card; audience and pressure cards are judged at the
        // turn's end (GDD v1.24).
        quarter: fact?.quarter ?? state.quarter,
        facts: {
          casual: fans.casual,
          hardcore: fans.hardcore,
          leagueTier: country.league?.tier ?? null,
          health: country.league?.health ?? null,
          rivalId: fact && "sportId" in fact ? fact.sportId : null,
          season: null,
          star: null,
          tradition: null,
          deal: null,
          venue: null,
          hall: null,
        },
        resolution: null,
      });
      offered[key] = state.turn;
    }
  }
  return {
    ...state,
    events: {
      ...traditionEvents,
      pending,
      offered,
      nextId,
      landmarkCursor: state.landmarks.length,
    },
  };
}

/** The state a card's PP depends on: its own facts, and the sport's size and peak tier. */
type CardState = Pick<GameState, "culture" | "hallOfFame" | "tierTrack" | "sports" | "countries">;

/**
 * Card PP grows with the sport (GDD v1.32): rewards and choice costs scale by the same factor as
 * growth node prices, the peak tier's cost multiplier × the sport's size factor.
 */
export function cardPPFactor(state: CardState, world: World): number {
  return costMultiplier(state, world.config) * nodeSizeFactor(state, world);
}

/**
 * A card's effects for one answer, PP scaled by `cardPPFactor`. The champion moment's PP follows
 * the league tier (config), raised by the famous grounds of the league's country (GDD v1.22).
 */
export function eventEffects(
  state: CardState,
  world: World,
  card: EventTemplate,
  event: Pick<EventRecord, "facts" | "countryId">,
  choiceId: string | null,
): EventEffect[] {
  const factor = cardPPFactor(state, world);
  return baseEffects(state, world, card, event, choiceId).map((effect) =>
    effect.type === "pp" ? { ...effect, amount: effect.amount * factor } : effect,
  );
}

function baseEffects(
  state: CardState,
  world: World,
  card: EventTemplate,
  event: Pick<EventRecord, "facts" | "countryId">,
  choiceId: string | null,
): EventEffect[] {
  if (choiceId !== null)
    return card.choices.find((choice) => choice.id === choiceId)?.effects ?? [];
  if (card.star === "breakout")
    return [{ type: "pp", amount: breakoutPP(world, event) }, ...card.effects];
  if (card.tradition === "born")
    return [{ type: "pp", amount: birthPP(world, event) }, ...card.effects];
  if (card.trigger === "hall")
    return [{ type: "pp", amount: classPP(state, world, event) }, ...card.effects];
  if (card.story !== "champion") return card.effects;
  const base = world.config.flagship.stories.championPP[event.facts.leagueTier ?? "amateur"];
  const fame = Math.min(1, venueStrength(state, event.countryId));
  const amount = base * (1 + world.config.culture.championBonus * fame);
  return [{ type: "pp", amount }, ...card.effects];
}
export function eventChoiceCost(
  state: GameState,
  world: World,
  card: EventTemplate,
  choiceId: string | null,
): number {
  return (
    (card.choices.find((choice) => choice.id === choiceId)?.cost ?? 0) * cardPPFactor(state, world)
  );
}
export type EventBlocker =
  | "missing"
  | "choice"
  | "prestige"
  | "league"
  | "rival"
  | "flagship"
  | "star"
  | "ended";
export function eventBlocker(
  state: GameState,
  world: World,
  eventId: number,
  choiceId: string | null,
): EventBlocker | null {
  if (state.outcome) return "ended";
  const event = state.events.pending.find((entry) => entry.id === eventId);
  const card = world.events.cards.find((entry) => entry.id === event?.templateId);
  if (!event || !card) return "missing";
  if (card.kind === "moment" ? choiceId !== null : !card.choices.some((c) => c.id === choiceId))
    return "choice";
  if (state.pp < eventChoiceCost(state, world, card, choiceId)) return "prestige";
  const country = state.countries.find((c) => c.countryId === event.countryId);
  for (const effect of eventEffects(state, world, card, event, choiceId)) {
    if (effect.type === "leagueHealth" && !country?.league) return "league";
    // The champion must still play in the commissioner's league (the seat may have gone home).
    if (
      effect.type === "clubRating" &&
      !activeClubs(state.flagship).some((club) => club.id === event.facts.season?.championId)
    )
      return "flagship";
    if (
      effect.type === "rivalSetback" &&
      !state.rivals.some((r) => r.sportId === event.facts.rivalId)
    )
      return "rival";
    const star = starEffectBlocker(state, world, event, effect);
    if (star !== null) return star;
  }
  return null;
}

function applyEffects(
  state: GameState,
  world: World,
  event: EventRecord,
  effects: EventEffect[],
): GameState {
  let next = state;
  const index = world.countries.findIndex((country) => country.id === event.countryId);
  const population = world.countries[index]?.population;
  if (population === undefined) throw new Error("Unknown event market");
  for (const effect of effects) {
    if (effect.type === "pp") {
      next = { ...next, pp: next.pp + effect.amount };
      continue;
    }
    if (
      effect.type === "starHonors" ||
      effect.type === "starMentor" ||
      effect.type === "starKeep"
    ) {
      next = applyStarEffect(next, world, event, effect);
      continue;
    }
    if (effect.type === "derbyStoke") {
      // One extra meeting toward a derby between the season's top two (GDD v1.22).
      const season = event.facts.season;
      if (!season) throw new Error("Derby stoke without a season");
      const clubIds = [season.championId, season.runnerUpId].sort((a, b) => a - b);
      next = {
        ...next,
        culture: {
          ...next.culture,
          stokes: [...next.culture.stokes, { clubIds, season: season.season }],
        },
      };
      continue;
    }
    if (effect.type === "clubRating") {
      const championId = event.facts.season?.championId;
      if (championId === undefined) throw new Error("Club rating effect without a season");
      next = {
        ...next,
        flagship: moveClubRatings(next.flagship, world, championId, effect.target, effect.steps),
      };
      continue;
    }
    if (effect.type === "conversion" || effect.type === "spread") {
      next = {
        ...next,
        events: {
          ...next.events,
          modifiers: [
            ...next.events.modifiers,
            {
              eventId: event.id,
              countryId: event.countryId,
              effect,
              endQuarter: next.quarter + effect.quarters,
            },
          ],
        },
      };
      continue;
    }
    const current = next.countries[index];
    if (!current) throw new Error("Missing event market");
    let country = { ...current, fans: current.fans.map((fans) => ({ ...fans })) };
    const player = country.fans[PLAYER_INDEX];
    if (!player) throw new Error("Missing player fan bucket");
    if (effect.type === "leagueHealth" && country.league) {
      // HEALTH_LEVELS run from strongest to weakest.
      const rung = HEALTH_LEVELS.indexOf(country.league.health);
      const health =
        HEALTH_LEVELS[Math.max(0, Math.min(HEALTH_LEVELS.length - 1, rung - effect.steps))];
      if (health) country = { ...country, league: { ...country.league, health } };
    } else if (effect.type === "hardcoreDemotion" || effect.type === "rivalSetback") {
      const fans =
        effect.type === "hardcoreDemotion"
          ? player
          : country.fans.find((f) => f.sportId === event.facts.rivalId);
      if (fans) {
        const moved = Math.floor(fans.hardcore * effect.share);
        fans.hardcore -= moved;
        fans.casual += moved;
      }
    } else if (effect.type === "fanShift") {
      if (effect.target === "uninterestedToCasual")
        player.casual += Math.floor((population - player.casual - player.hardcore) * effect.share);
      else {
        const free = Math.max(0, population - country.fans.reduce((sum, f) => sum + f.hardcore, 0));
        const moved = Math.min(free, Math.floor(player.casual * effect.share));
        player.casual -= moved;
        player.hardcore += moved;
      }
    }
    const countries = [...next.countries];
    countries[index] = country;
    next = { ...next, countries };
  }
  return next;
}

/** Called only after action validation, or for a content-validated no-cost default. */
export function resolveEvent(
  state: GameState,
  world: World,
  eventId: number,
  choiceId: string | null,
  automatic = false,
): GameState {
  const event = state.events.pending.find((e) => e.id === eventId);
  const card = world.events.cards.find((c) => c.id === event?.templateId);
  if (!event || !card) throw new Error("Missing event");
  const cost = eventChoiceCost(state, world, card, choiceId);
  const effects = eventEffects(state, world, card, event, choiceId);
  const ppGained = effects.reduce(
    (sum, effect) => sum + (effect.type === "pp" ? effect.amount : 0),
    0,
  );
  const next = applyEffects({ ...state, pp: state.pp - cost }, world, event, effects);
  const settled: EventRecord = {
    ...event,
    resolution: { choiceId, automatic, turn: state.turn, quarter: state.quarter, cost, ppGained },
  };
  return {
    ...next,
    events: {
      ...next.events,
      pending: next.events.pending.filter((e) => e.id !== eventId),
      history: [...next.events.history, settled].slice(-world.events.settings.historyLimit),
    },
  };
}

/** Uncollected rewards are never lost. Unresolved decisions take their advertised neutral option. */
export function settleEvents(state: GameState, world: World): GameState {
  let next = state;
  for (const event of state.events.pending) {
    const card = world.events.cards.find((c) => c.id === event.templateId);
    if (!card) throw new Error("Missing event template");
    next = resolveEvent(next, world, event.id, card.defaultChoice, true);
  }
  return next;
}

/** Which news section a card belongs to (GDD v1.26): each family has its own look. */
export type EventFamily = "season" | "star" | "tradition" | "hall" | "rival" | "business" | "sport";
function eventFamily(event: EventRecord): EventFamily {
  if (event.facts.hall) return "hall";
  if (event.facts.deal || event.facts.venue) return "business";
  if (event.facts.season) return "season";
  if (event.facts.star) return "star";
  if (event.facts.tradition) return "tradition";
  if (event.facts.rivalId) return "rival";
  return "sport";
}

/**
 * A moment's weight on the world map (GDD v1.26, v1.32): the card's own, raised to a headline for
 * a season's champion at a headline tier when the season tells a rare story, the breakout of the
 * sport's first star, the first Hall of Fame class (or one inducting the current scoring record
 * holder) and the anthem's birth. Decisions have none.
 */
function momentWeight(
  state: GameState,
  world: World,
  card: EventTemplate,
  event: EventRecord,
): MomentWeight | null {
  if (card.weight !== "big") return card.weight;
  // The first Hall of Fame class, or one with a scoring record holder; the anthem (GDD v1.31).
  if (card.trigger === "hall") return classHeadline(state, event) ? "headline" : "big";
  const told = event.facts.tradition;
  if (card.tradition === "born" && told?.type === "chant") {
    const anthem = state.culture.traditions.find((t) => t.type === "chant");
    return anthem?.id === told.traditionId ? "headline" : "big";
  }
  // A season at a headline tier is front-page news only when it tells a rare story (GDD v1.32).
  const season = event.facts.season;
  const tier = event.facts.leagueTier;
  const { flagshipHeadlineTiers, headlineStories } = world.events.settings;
  if (season && tier && flagshipHeadlineTiers.includes(tier)) {
    const seasons = state.flagship.seasons;
    const index = seasons.findIndex((s) => s.season === season.season);
    if (index >= 0 && seasonStories(seasons, index, world).some((s) => headlineStories.includes(s)))
      return "headline";
  }
  const first = state.landmarks.find((landmark) => landmark.kind === "firstStar");
  if (
    card.star === "breakout" &&
    first?.kind === "firstStar" &&
    first.playerId === event.facts.star?.playerId
  )
    return "headline";
  return "big";
}

export function eventSnapshots(state: GameState, world: World) {
  return state.events.pending.map((event) => {
    const card = world.events.cards.find((c) => c.id === event.templateId);
    if (!card) throw new Error("Missing event template");
    return {
      ...event,
      kind: card.kind,
      weight: momentWeight(state, world, card, event),
      family: eventFamily(event),
      tone: card.tone,
      story: card.story,
      star: card.star,
      effects: eventEffects(state, world, card, event, null),
      arrivalEffects: card.arrivalEffects,
      defaultChoice: card.defaultChoice,
      choices: card.choices.map((choice) => ({
        ...choice,
        cost: eventChoiceCost(state, world, card, choice.id),
        /** League cash the choice spends (keeping a star from moving). */
        leagueCash: choice.effects.some((effect) => effect.type === "starKeep")
          ? keepCost(state, world, event.countryId)
          : 0,
        blocker: eventBlocker(state, world, event.id, choice.id),
      })),
    };
  });
}
export type EventSnapshot = ReturnType<typeof eventSnapshots>[number];

export function eventProblems(state: GameState, world: World): string[] {
  const problems: string[] = [];
  const countries = new Set(world.countries.map((c) => c.id));
  if (state.events.landmarkCursor > state.landmarks.length)
    problems.push("Event fact cursor is in the future");
  const seen = new Set<number>();
  for (const event of [...state.events.pending, ...state.events.history]) {
    const card = world.events.cards.find((c) => c.id === event.templateId);
    if (!card || !countries.has(event.countryId)) {
      problems.push("Unknown event content or market");
      continue;
    }
    if (seen.has(event.id) || event.id >= state.events.nextId)
      problems.push("Invalid event sequence");
    seen.add(event.id);
    if (event.turn > state.turn || event.quarter > state.quarter)
      problems.push("Event occurs in the future");
    if (event.facts.rivalId && !state.rivals.some((r) => r.sportId === event.facts.rivalId))
      problems.push("Unknown event rival");
    const season = event.facts.season;
    if ((card.story !== null) !== (season !== null))
      problems.push("Season facts on the wrong card");
    const star = event.facts.star;
    if ((card.star !== null) !== (star !== null)) problems.push("Star facts on the wrong card");
    const told = event.facts.tradition;
    if ((card.tradition !== null) !== (told !== null))
      problems.push("Tradition facts on the wrong card");
    if (told && told.traditionId >= state.culture.nextId)
      problems.push("Event names an unknown tradition");
    if (
      star &&
      (star.playerId >= state.flagship.nextPlayerId ||
        (star.candidateId ?? 0) >= state.flagship.nextPlayerId ||
        star.clubId >= state.flagship.nextClubId ||
        (star.otherClubId ?? 0) >= state.flagship.nextClubId ||
        star.season >= state.flagship.season)
    )
      problems.push("Event names an unknown flagship player, club or season");
    if (
      season &&
      (season.season >= state.flagship.season ||
        season.championId >= state.flagship.nextClubId ||
        season.runnerUpId >= state.flagship.nextClubId)
    )
      problems.push("Event names an unknown flagship season or club");
    if (
      event.resolution &&
      (event.resolution.turn < event.turn ||
        event.resolution.turn > state.turn ||
        event.resolution.quarter < event.quarter ||
        event.resolution.quarter > state.quarter)
    )
      problems.push("Invalid event resolution date");
    const choiceId = event.resolution?.choiceId;
    if (
      event.resolution &&
      (card.kind === "moment" ? choiceId !== null : !card.choices.some((c) => c.id === choiceId))
    )
      problems.push("Unknown resolved choice");
  }
  if (
    state.events.pending.some((e) => e.resolution) ||
    state.events.history.some((e) => !e.resolution)
  )
    problems.push("Invalid event queue membership");
  for (const [key, turn] of Object.entries(state.events.offered)) {
    const [templateId, countryId] = key.split("/");
    const card = world.events.cards.find((c) => c.id === templateId);
    if (
      !card ||
      (card.scope === "country"
        ? !countryId || !countries.has(countryId)
        : countryId !== undefined) ||
      turn > state.turn
    )
      problems.push("Invalid event cooldown");
  }
  for (const [templateId, season] of Object.entries(state.events.seasonOffered)) {
    const card = world.events.cards.find((c) => c.id === templateId);
    if (!card || card.story === null || season >= state.flagship.season)
      problems.push("Invalid season card cooldown");
  }
  for (const modifier of state.events.modifiers)
    if (
      !countries.has(modifier.countryId) ||
      modifier.endQuarter <= state.quarter ||
      modifier.eventId >= state.events.nextId
    )
      problems.push("Invalid active event modifier");
  return problems;
}
