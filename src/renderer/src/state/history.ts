import type { TurnSnapshot } from "../../../sim";

export interface HistoryPoint {
  turn: number;
  quarter: number;
  share: number;
}
export type CountryHistory = Record<string, HistoryPoint[]>;

/** Presentation history only; never feeds back into the simulation. */
export function recordHistory(
  history: CountryHistory,
  snapshot: TurnSnapshot,
  limit: number,
): CountryHistory {
  const next: CountryHistory = {};
  for (const country of snapshot.countries) {
    const previous = history[country.countryId] ?? [];
    const point = { turn: snapshot.turn, quarter: snapshot.quarter, share: country.share };
    // Repeated deliveries replace the current turn instead of inventing another observation.
    next[country.countryId] = [
      ...previous.filter((entry) => entry.turn < snapshot.turn),
      point,
    ].slice(-limit);
  }
  return next;
}
