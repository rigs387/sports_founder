import type { ClockInterrupt } from "../../../content/map";
import { ESCALATION_LEVELS, type TurnSnapshot } from "../../../sim";

// The clock (GDD v1.24): Play / Pause over End Turn. A played turn is checked against the one
// before it, and any interrupt in the configured list pauses the clock. Unanswered decisions always
// pause it: End Turn would settle them with their free default, which the player never chose.

/** Unanswered decisions waiting for the player. */
export function pendingDecisions(snapshot: TurnSnapshot): number {
  return snapshot.events.filter((event) => event.kind === "decision").length;
}

/** The interrupts a turn brought, in list order, keeping only the enabled ones. */
export function turnInterrupts(
  before: TurnSnapshot,
  after: TurnSnapshot,
  enabled: readonly ClockInterrupt[],
): ClockInterrupt[] {
  const level = (name: string) => ESCALATION_LEVELS.indexOf(name as never);
  const focus = new Set(after.focus.filter((id): id is string => id !== null));
  const previous = new Map(before.countries.map((country) => [country.countryId, country]));
  const healthChanged = (id: string) => {
    const now = after.countries.find((country) => country.countryId === id)?.league?.health;
    return (previous.get(id)?.league?.health ?? null) !== (now ?? null);
  };
  const found: Record<ClockInterrupt, boolean> = {
    decision: pendingDecisions(after) > 0,
    offseason: after.offseasonOpen && !before.offseasonOpen,
    tierChange: after.ppTier !== before.ppTier,
    anchorHealth: healthChanged(after.anchorCountryId),
    focusHealth: [...focus].some((id) => id !== after.anchorCountryId && healthChanged(id)),
    focusRival: after.countries.some((country) => {
      if (!focus.has(country.countryId)) return false;
      const was = previous.get(country.countryId);
      return country.rivals.some((rival) => {
        const old = was?.rivals.find((entry) => entry.sportId === rival.sportId);
        if (!old) return false;
        return (
          level(rival.level) > level(old.level) ||
          rival.countermoves.some((move) => !old.countermoves.includes(move))
        );
      });
    }),
    winHold: after.win.holding && !before.win.holding,
    win: after.win.won !== null && before.win.won === null,
  };
  return enabled.filter((kind) => found[kind]);
}
