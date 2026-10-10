import type { EventEffect, EventTemplate, StarCard } from "../content";
import type { EventRecord, EventState, StarFacts } from "./events-state";
import { backStarBlocker, clubSeasonScores } from "./flagship";
import { runningCostPerQuarter } from "./leagues";
import { type GameState, type Landmark, PLAYER_INDEX, type Player, type World } from "./types";

// Flagship stars as cards (GDD v1.16). Every card is built from recorded facts: a season summary's
// new star, or a star landmark (final season announced, retirement, move, scoring record, a drop
// at full influence). The breakout moment takes no moment slot; the other moments use moment
// slots and the decisions count against the decision cap, offered after the season cards. Every
// decision's free default has no effect: an unanswered succession lets the star go, an unanswered
// move lets it stand. Since GDD v1.35 a season can make several stars: the sport's first star is
// the headline breakout moment; every later one is a backable breakout, a decision that offers
// Back at the backing price (its free default backs no one) and takes no slot.

/** Career totals in the flagship league: scores, matches and seasons played. */
function careerTotals(player: Player) {
  return {
    scores: player.career.reduce((sum, line) => sum + line.scores, 0),
    matches: player.career.reduce((sum, line) => sum + line.matches, 0),
    seasons: player.career.length,
  };
}

/**
 * The successor a succession card names (GDD v1.16): the season's top-scoring leading player at
 * the star's league who is no star, unbacked, not in their own final season and younger than
 * mentorMaxAge next season.
 */
export function mentorCandidate(state: GameState, world: World, star: Player, season: number) {
  const { mentorMaxAge } = world.config.flagship.stars;
  const lines = state.flagship.players.flatMap((player) => {
    const line = player.career.find((l) => l.season === season);
    const eligible =
      player.id !== star.id &&
      player.retiredSeason === null &&
      !player.finalSeason &&
      player.starSince === null &&
      player.backing === null &&
      season + 1 - player.birthSeason < mentorMaxAge;
    return line && eligible ? [{ player, scores: line.scores }] : [];
  });
  lines.sort((a, b) => b.scores - a.scores || a.player.id - b.player.id);
  return lines[0]?.player ?? null;
}

type StarFactCard = { card: StarCard; facts: StarFacts; countryId: string };

/** The cards a star fact calls for, and the facts each records (none, or several breakouts). */
function starFacts(state: GameState, world: World, landmark: Landmark): StarFactCard[] {
  if (landmark.kind !== "seasonChampion") {
    const one = starFact(state, world, landmark);
    return one ? [one] : [];
  }
  const summary = state.flagship.seasons.find((s) => s.season === landmark.season);
  if (!summary) return [];
  const first = state.landmarks.find((l) => l.kind === "firstStar");
  return summary.newStarIds.flatMap((starId): StarFactCard[] => {
    const star = state.flagship.players.find((p) => p.id === starId);
    const line = star?.career.find((l) => l.season === landmark.season);
    if (!star || !line) return [];
    const career = careerTotals(star);
    return [
      {
        card: first?.kind === "firstStar" && first.playerId === star.id ? "breakout" : "backable",
        countryId: summary.countryId,
        // Key order follows the save schema (starFactsSchema).
        facts: {
          playerId: star.id,
          clubId: line.clubId,
          otherClubId: null,
          candidateId: null,
          season: summary.season,
          scores: line.scores,
          matches: line.matches,
          clubScores: clubSeasonScores(summary, line.clubId),
          seasons: career.seasons,
        },
      },
    ];
  });
}

/** The card a star landmark other than a season's end calls for, and its facts; null if none. */
function starFact(state: GameState, world: World, landmark: Landmark): StarFactCard | null {
  const players = state.flagship.players;
  const find = (id: number) => players.find((player) => player.id === id);
  // Key order follows the save schema (starFactsSchema), so saves re-serialize byte-identically.
  const base = (player: Player, clubId: number, season: number): StarFacts => {
    const career = careerTotals(player);
    return {
      playerId: player.id,
      clubId,
      otherClubId: null,
      candidateId: null,
      season,
      scores: career.scores,
      matches: career.matches,
      clubScores: 0,
      seasons: career.seasons,
    };
  };
  switch (landmark.kind) {
    case "starFinalSeason": {
      const star = find(landmark.playerId);
      if (!star) return null;
      const candidate = landmark.backed
        ? mentorCandidate(state, world, star, landmark.season)
        : null;
      return {
        card: landmark.backed ? "succession" : "finalSeason",
        countryId: landmark.countryId,
        facts: {
          ...base(star, landmark.clubId, landmark.season),
          candidateId: candidate?.id ?? null,
        },
      };
    }
    case "starRetired": {
      const star = find(landmark.playerId);
      if (!star) return null;
      return {
        card: "retired",
        countryId: landmark.countryId,
        facts: base(star, landmark.clubId, landmark.season),
      };
    }
    case "starMoved": {
      const star = find(landmark.playerId);
      if (!star) return null;
      return {
        card: landmark.backed ? "keepOrMove" : "moved",
        countryId: landmark.countryId,
        facts: { ...base(star, landmark.to, landmark.season), otherClubId: landmark.from },
      };
    }
    case "scoringRecord": {
      const star = find(landmark.playerId);
      if (!star) return null;
      return {
        card: "record",
        countryId: landmark.countryId,
        facts: { ...base(star, star.clubId, landmark.season), scores: landmark.scores },
      };
    }
    case "starDropped": {
      const star = find(landmark.playerId);
      if (!star) return null;
      return {
        card: "dropped",
        countryId: landmark.countryId,
        facts: base(star, star.clubId, landmark.season),
      };
    }
    default:
      return null;
  }
}

/** Whether a card is offered without taking a slot (the season's champion and a star's breakout). */
export function takesNoSlot(card: EventTemplate | undefined): boolean {
  // Deal news never waits for a slot: a breach must reach the player (GDD v1.28).
  // Nor does a Hall of Fame class (GDD v1.31), nor a minor first marked noSlot (GDD v1.34).
  return (
    card?.noSlot === true ||
    card?.story === "champion" ||
    card?.star === "breakout" ||
    card?.star === "backable" ||
    card?.deal != null ||
    card?.trigger === "hall" ||
    card?.trigger === "award" ||
    card?.trigger === "countermove"
  );
}

/**
 * Offers the star cards the recent landmarks call for, within the moment and decision caps
 * (`room` counts what is left of each); the breakout moment takes no slot.
 */
export function offerStarCards(
  state: GameState,
  world: World,
  recent: readonly Landmark[],
  events: EventState,
  room: { moment: number; decision: number },
): EventState {
  const pending = [...events.pending];
  const modifiers = [...events.modifiers];
  let nextId = events.nextId;
  const left = { ...room };
  for (const landmark of recent)
    for (const fact of starFacts(state, world, landmark)) {
      const card = world.events.cards.find((c) => c.star === fact.card);
      if (!card || state.ppTier < card.minTier) continue;
      if (!takesNoSlot(card)) {
        if (left[card.kind] <= 0) continue;
        left[card.kind] -= 1;
      }
      const country = state.countries.find((c) => c.countryId === fact.countryId);
      const fans = country?.fans[PLAYER_INDEX];
      if (!country || !fans) continue;
      const id = nextId++;
      pending.push({
        id,
        templateId: card.id,
        countryId: country.countryId,
        turn: state.turn,
        // When the star's fact happened (GDD v1.24).
        quarter: landmark.quarter,
        facts: {
          casual: fans.casual,
          hardcore: fans.hardcore,
          leagueTier: country.league?.tier ?? null,
          health: country.league?.health ?? null,
          rivalId: null,
          season: null,
          star: fact.facts,
          tradition: null,
          deal: null,
          venue: null,
          hall: null,
          countermove: null,
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
    }
  return { ...events, pending, modifiers, nextId };
}

/** The league cash a keep-or-let-move card's keep choice costs now. */
export function keepCost(state: GameState, world: World, countryId: string): number {
  const index = world.countries.findIndex((country) => country.id === countryId);
  const league = state.countries[index]?.league;
  if (!league) return 0;
  const quarters = world.config.flagship.stars.keepCashQuarters;
  return quarters * runningCostPerQuarter(world, index, league.tier, state.growthNodes);
}

/** The breakout moment's PP by league tier. */
export function breakoutPP(world: World, event: Pick<EventRecord, "facts">): number {
  return world.config.flagship.stars.breakoutPP[event.facts.leagueTier ?? "amateur"];
}

/**
 * Why a star effect cannot be chosen now ("star", "league", or "slots" when every backing slot is
 * taken), or null if it can.
 */
export function starEffectBlocker(
  state: GameState,
  world: World,
  event: EventRecord,
  effect: EventEffect,
): "star" | "league" | "slots" | null {
  const facts = event.facts.star;
  if (!facts) return effect.type.startsWith("star") ? "star" : null;
  const find = (id: number | null) => state.flagship.players.find((p) => p.id === id);
  const star = find(facts.playerId);
  const playing = (player: Player | undefined): player is Player =>
    player !== undefined && player.retiredSeason === null;
  switch (effect.type) {
    case "starHonors":
      // Only while the star is still backed and playing their final season.
      return playing(star) && star.finalSeason && star.backing !== null ? null : "star";
    case "starMentor": {
      const candidate = find(facts.candidateId);
      if (!playing(star) || !star.finalSeason || star.backing === null) return "star";
      return playing(candidate) &&
        !candidate.finalSeason &&
        candidate.backing === null &&
        candidate.starSince === null
        ? null
        : "star";
    }
    case "starBack": {
      // The backing rules (GDD v1.16); the price is the choice's cost (eventChoiceCost).
      const blocker = backStarBlocker(state, world, facts.playerId);
      if (blocker === "slots") return "slots";
      return blocker === null || blocker === "pp" ? null : "star";
    }
    case "starKeep": {
      // Both clubs must still have the players the move swapped.
      const other = state.flagship.players.find(
        (p) => p.retiredSeason === null && p.clubId === facts.otherClubId,
      );
      if (!playing(star) || star.clubId !== facts.clubId || !other) return "star";
      const index = world.countries.findIndex((c) => c.id === event.countryId);
      const league = state.countries[index]?.league;
      if (!league) return "league";
      return league.cash >= keepCost(state, world, event.countryId) ? null : "league";
    }
    default:
      return null;
  }
}

/** Applies a star effect (checked by starEffectBlocker). */
export function applyStarEffect(
  state: GameState,
  world: World,
  event: EventRecord,
  effect: EventEffect,
): GameState {
  const facts = event.facts.star;
  if (!facts) throw new Error("Star effect without star facts");
  const players = state.flagship.players.map((player) => ({ ...player }));
  const star = players.find((p) => p.id === facts.playerId);
  if (!star) throw new Error("Star effect names an unknown player");
  if (effect.type === "starBack") {
    // Paid as the choice's cost; influence starts at 0, as on the offseason screen.
    star.backing = { season: state.flagship.season, influence: 0, honors: false, mentee: null };
  } else if (effect.type === "starHonors" && star.backing) {
    star.backing = { ...star.backing, honors: true };
  } else if (effect.type === "starMentor" && star.backing) {
    star.backing = { ...star.backing, mentee: facts.candidateId };
  } else if (effect.type === "starKeep") {
    const other = players.find((p) => p.retiredSeason === null && p.clubId === facts.otherClubId);
    if (!other) throw new Error("Keep effect without the other club's player");
    const cost = keepCost(state, world, event.countryId);
    other.clubId = star.clubId;
    star.clubId = facts.otherClubId ?? star.clubId;
    const index = world.countries.findIndex((c) => c.id === event.countryId);
    const countries = state.countries.map((country, i) =>
      i === index && country.league
        ? { ...country, league: { ...country.league, cash: country.league.cash - cost } }
        : country,
    );
    return { ...state, countries, flagship: { ...state.flagship, players } };
  }
  return { ...state, flagship: { ...state.flagship, players } };
}
