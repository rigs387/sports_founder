import type { SeasonStory } from "../content";
import { seasonStories } from "./season-stories";
import type { GameState, World } from "./types";

// Press (GDD v1.33): presentation only. Every country gets an invented outlet once its league
// forms: its biggest real place and a sports-paper word from the names file, picked by a stable
// key from the seed and the country. Before that its stories run in the sport's own paper; rival
// world championships run on one invented international wire. Nothing here is saved or changes a
// number.

export type Outlet =
  | { kind: "local"; place: string; word: string }
  | { kind: "sport" }
  | { kind: "wire"; name: string };

/** A small stable hash of a string (FNV-1a), so outlets never consume a random stream. */
function hash(text: string): number {
  let h = 0x811c_9dc5;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x0100_0193) >>> 0;
  }
  return h;
}

/**
 * The outlet a country's news runs in by `quarter`: its own once a league has formed there (a
 * `leagueFormed` landmark by then), else the sport's paper.
 */
export function outletOf(
  state: Pick<GameState, "seed" | "landmarks">,
  world: World,
  countryId: string,
  quarter: number,
): Outlet {
  const formed = state.landmarks.some(
    (l) => l.kind === "leagueFormed" && l.countryId === countryId && l.quarter <= quarter,
  );
  const place = world.places[countryId]?.[0]?.name;
  const { words } = world.names.press;
  if (!formed || !place || words.length === 0) return { kind: "sport" };
  const word = words[hash(`${state.seed}|${countryId}`) % words.length] ?? "";
  return { kind: "local", place, word };
}

/** The international wire rival world championships run on. */
export function wireOutlet(world: World): Outlet {
  return { kind: "wire", name: world.names.press.wire };
}

/**
 * The rare story the season's front page leads with (GDD v1.32, v1.33): the first of the
 * configured headline stories the season tells, or null for an ordinary title.
 */
export function leadStory(
  state: Pick<GameState, "flagship">,
  world: World,
  index: number,
): SeasonStory | null {
  const { headlineStories } = world.events.settings;
  const told = seasonStories(state.flagship.seasons, index, world);
  return headlineStories.find((story) => told.includes(story)) ?? null;
}
