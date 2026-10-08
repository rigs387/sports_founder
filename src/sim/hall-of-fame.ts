import type { HallOfFameState } from "./types";

// The Hall of Fame (GDD v1.31): a class at each flagship season's end, read only from retained
// records. Players are inducted on points from their careers once they have retired and waited;
// the Moments wing inducts the sport's firsts. Each player inductee adds a permanent shrine weight
// to their home country's tradition weight. Every number is config (`hallOfFame`).

/**
 * The Hall at a campaign's start, or when an older save first gains it: only players retiring
 * from `startSeason` on, and firsts recorded from `landmarkStart` on, count.
 */
export function newHallOfFame(startSeason: number, landmarkStart: number): HallOfFameState {
  return { startSeason, landmarkStart, inductees: [], nextId: 1 };
}
