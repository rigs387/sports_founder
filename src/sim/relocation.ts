import { offseasonOpen } from "./calendar";
import { betrayClub } from "./culture";
import type { EventRecord } from "./events-state";
import { activeClubs } from "./flagship";
import { demoteHardcore, runningCostPerQuarter } from "./leagues";
import { landmarks } from "./records";
import { type GameState, PLAYER_INDEX, type World } from "./types";

// Club relocation (GDD v1.41, tech plan 2.33): a seat club in the bottom two of the table for
// `relocation.badSeasons` seasons running, with a bigger real town in the seat country that has no
// club, has its owners ask to move. At most one ask an offseason, as a decision (no slot). Moving
// (the card's clubMove effect) keeps the nickname and record, lifts the club's rating, betrays its
// traditions in the old town and turns some of the seat's hardcore fans casual; the card's own
// conversion effect is the year of faster casual conversion. Staying, the default, costs the seat
// league the owners' losses, read back when End Turn starts; the ask returns after the next bad
// season, never sooner.

/** The ask the seat's table makes now: the failing club and the bigger town, or null. */
export function relocationAsk(
  state: GameState,
  world: World,
): { clubId: number; from: string; to: string; season: number } | null {
  if (!offseasonOpen(state) || state.outcome !== null) return null;
  const { flagship } = state;
  const config = world.config.flagship.relocation;
  if (flagship.relocation?.open) return null;
  const seat = state.countries.find((c) => c.countryId === flagship.countryId);
  if (!seat?.league) return null;
  // Lost seasons are gaps: the last summaries played at the seat count as running.
  const summaries = flagship.seasons
    .filter((s) => s.countryId === flagship.countryId)
    .slice(-config.badSeasons);
  const last = summaries.at(-1);
  if (summaries.length < config.badSeasons || !last) return null;
  // Asked once an offseason, and again only after a further bad season.
  if (flagship.relocation !== null && flagship.relocation.season >= last.season) return null;
  const bottom = (clubId: number) =>
    summaries.every((s) => {
      const at = s.standings.findIndex((row) => row.clubId === clubId);
      return at >= 0 && at >= s.standings.length - 2;
    });
  const places = world.places[flagship.countryId] ?? [];
  const size = (name: string) => places.find((p) => p.name === name)?.population ?? 0;
  const taken = new Set(
    flagship.clubs.filter((c) => c.countryId === flagship.countryId).map((c) => c.place),
  );
  // The worst-placed failing club last season asks first.
  const failing = activeClubs(flagship)
    .filter((club) => bottom(club.id))
    .sort(
      (a, b) =>
        last.standings.findIndex((r) => r.clubId === b.id) -
        last.standings.findIndex((r) => r.clubId === a.id),
    );
  for (const club of failing) {
    const to = places.find((p) => p.population > size(club.place) && !taken.has(p.name));
    if (to) return { clubId: club.id, from: club.place, to: to.name, season: last.season };
  }
  return null;
}

/** Offers the relocation card at End Turn's end when the owners ask (one an offseason). */
export function offerRelocation(state: GameState, world: World): GameState {
  const ask = relocationAsk(state, world);
  const card = world.events.cards.find((c) => c.trigger === "relocation");
  const seat = state.countries.find((c) => c.countryId === state.flagship.countryId);
  const fans = seat?.fans[PLAYER_INDEX];
  if (!ask || !card || !seat || !fans || state.ppTier < card.minTier) return state;
  const events = state.events;
  return {
    ...state,
    flagship: {
      ...state.flagship,
      // Key order follows the save schema, so a loaded state re-serializes identically.
      relocation: {
        clubId: ask.clubId,
        from: ask.from,
        to: ask.to,
        quarter: state.quarter,
        season: ask.season,
        open: true,
      },
    },
    events: {
      ...events,
      nextId: events.nextId + 1,
      pending: [
        ...events.pending,
        {
          id: events.nextId,
          templateId: card.id,
          countryId: seat.countryId,
          turn: state.turn,
          quarter: state.quarter,
          facts: {
            casual: fans.casual,
            hardcore: fans.hardcore,
            leagueTier: seat.league?.tier ?? null,
            health: seat.league?.health ?? null,
            rivalId: null,
            season: null,
            star: null,
            tradition: null,
            deal: null,
            venue: null,
            hall: null,
            countermove: null,
            championship: null,
            legacy: null,
            stoppage: null,
            relocation: {
              clubId: ask.clubId,
              from: ask.from,
              to: ask.to,
              loss: ownersLoss(state, world),
              seasons: world.config.flagship.relocation.badSeasons,
            },
          },
          resolution: null,
        },
      ],
    },
  };
}

/** Why the move cannot happen now: the club left the seat's league or the town has a club. */
export function relocationBlocker(state: GameState, event: EventRecord): "flagship" | null {
  const told = event.facts.relocation;
  const club = activeClubs(state.flagship).find((c) => c.id === told?.clubId);
  if (!told || !club || club.place !== told.from) return "flagship";
  const taken = state.flagship.clubs.some(
    (c) => c.countryId === state.flagship.countryId && c.place === told.to,
  );
  return taken ? "flagship" : null;
}

/** The clubMove effect: the club moves, lifted; its old town's traditions are betrayed. */
export function moveClub(state: GameState, world: World, event: EventRecord): GameState {
  const told = event.facts.relocation;
  if (!told || relocationBlocker(state, event) !== null) return state;
  const { ratingLift, hardcoreLoss } = world.config.flagship.relocation;
  const { min, max } = world.config.flagship.rating;
  const flagship = {
    ...state.flagship,
    clubs: state.flagship.clubs.map((club) =>
      club.id === told.clubId
        ? {
            ...club,
            place: told.to,
            rating: Math.min(max, Math.max(min, club.rating + ratingLift)),
          }
        : club,
    ),
  };
  const countries = state.countries.map((c) =>
    c.countryId === flagship.countryId
      ? {
          ...c,
          fans: c.fans.map((f, i) => (i === PLAYER_INDEX ? demoteHardcore(f, hardcoreLoss) : f)),
        }
      : c,
  );
  const moved = betrayClub({ ...state, flagship, countries }, world, told.clubId);
  return {
    ...moved,
    landmarks: [
      ...moved.landmarks,
      landmarks.clubMoved(
        state.turn,
        state.quarter,
        flagship.countryId,
        told.clubId,
        told.from,
        told.to,
      ),
    ],
  };
}

/** The owners' losses a refusal costs the seat league now (league cash, sim units). */
export function ownersLoss(state: GameState, world: World): number {
  const index = world.countries.findIndex((c) => c.id === state.flagship.countryId);
  const tier = state.countries[index]?.league?.tier;
  if (tier === undefined) return 0;
  return (
    world.config.flagship.relocation.ownersLoss *
    runningCostPerQuarter(world, index, tier, state.growthNodes)
  );
}

/**
 * When End Turn starts: the open ask's answer, read from the journal. Staying costs the seat
 * league the owners' losses.
 */
export function settleRelocation(state: GameState, world: World): GameState {
  const open = state.flagship.relocation;
  if (!open?.open) return state;
  const isCard = (e: EventRecord) =>
    e.facts.relocation?.clubId === open.clubId && e.quarter === open.quarter;
  if (state.events.pending.some(isCard)) return state;
  const answered = state.events.history.find(isCard);
  const closed = {
    ...state,
    flagship: { ...state.flagship, relocation: { ...open, open: false } },
  };
  if (answered?.resolution?.choiceId === "move") return closed;
  const loss = ownersLoss(state, world);
  return {
    ...closed,
    countries: closed.countries.map((c) =>
      c.countryId === closed.flagship.countryId && c.league
        ? { ...c, league: { ...c.league, cash: c.league.cash - loss } }
        : c,
    ),
  };
}
