import { TICKET_STANCES, type TicketStance } from "../content";
import { offseasonOpen } from "./calendar";
import { traditionWeights } from "./culture";
import { demoteHardcore } from "./leagues";
import { landmarks } from "./records";
import { type GameState, PLAYER_INDEX, type World } from "./types";

// Flagship ticket pricing (GDD v1.40, tech plan 2.29): three stances at the seat only. A stance
// multiplies gate per seated fan (`leagueIncomePerQuarter`) and casual → hardcore conversion at
// the seat (`quarter.ts`). It is asked for in the offseason and applied when the offseason closes;
// each step up turns a share of the seat's hardcore fans casual, heavier with its tradition
// weight; lowering is free. A new seat starts at standard.

/** The stance in force at the seat now: a seat that moved plays at standard. */
export function ticketStance(state: Pick<GameState, "flagship">): TicketStance {
  const { tickets, countryId } = state.flagship;
  return tickets.countryId === countryId ? tickets.stance : "standard";
}

/** Gate and conversion factors for a country: the seat's stance, 1 elsewhere. */
export function ticketFactors(
  state: Pick<GameState, "flagship">,
  world: World,
  countryId: string,
): { gate: number; conversion: number } {
  if (countryId !== state.flagship.countryId) return { gate: 1, conversion: 1 };
  return world.config.flagship.tickets.stances[ticketStance(state)];
}

/**
 * The share of the seat's hardcore fans a change from `from` to `to` turns casual: raiseDemotion
 * per step up × (1 + the seat's tradition weight), at most all of them; nothing for a cut.
 */
export function raiseShare(
  state: Pick<GameState, "culture" | "growthNodes" | "hallOfFame" | "flagship">,
  world: World,
  from: TicketStance,
  to: TicketStance,
): number {
  const steps = TICKET_STANCES.indexOf(to) - TICKET_STANCES.indexOf(from);
  if (steps <= 0) return 0;
  const index = world.countries.findIndex((c) => c.id === state.flagship.countryId);
  const weight = traditionWeights(state, world)[index] ?? 0;
  return Math.min(1, world.config.flagship.tickets.raiseDemotion * steps * (1 + weight));
}

/** Why a stance cannot be asked for now. */
export function ticketsBlocker(
  state: GameState,
  world: World,
  stance: TicketStance,
): "window" | "league" | null {
  if (!offseasonOpen(state)) return "window";
  const seat = state.countries.find((c) => c.countryId === state.flagship.countryId);
  if (!seat?.league || !world.config.flagship.tickets.stances[stance]) return "league";
  return null;
}

/** The setTickets action: next season's stance (asking for the one in force clears a change). */
export function setTickets(state: GameState, stance: TicketStance): GameState {
  const current = ticketStance(state);
  return {
    ...state,
    flagship: {
      ...state.flagship,
      tickets: {
        countryId: state.flagship.countryId,
        stance: current,
        pending: stance === current ? null : stance,
      },
    },
  };
}

/**
 * When the offseason closes, after any seat move: the asked-for stance takes effect at the seat
 * (from standard at a new seat), a raise turning its share of the hardcore fans casual.
 */
export function applyTickets(state: GameState, world: World): GameState {
  const { tickets, countryId } = state.flagship;
  const from = ticketStance(state);
  const to = tickets.countryId === countryId ? (tickets.pending ?? from) : from;
  const settled = { ...state.flagship, tickets: { countryId, stance: to, pending: null } };
  if (to === from) return { ...state, flagship: settled };
  const share = raiseShare(state, world, from, to);
  let demoted = 0;
  const countries = state.countries.map((c) => {
    const fans = c.fans[PLAYER_INDEX];
    if (c.countryId !== countryId || !fans || share <= 0) return c;
    const after = demoteHardcore(fans, share);
    demoted = fans.hardcore - after.hardcore;
    return { ...c, fans: c.fans.map((f, i) => (i === PLAYER_INDEX ? after : f)) };
  });
  return {
    ...state,
    countries,
    flagship: settled,
    landmarks: [
      ...state.landmarks,
      landmarks.ticketsSet(state.turn, state.quarter, countryId, from, to, demoted),
    ],
  };
}
