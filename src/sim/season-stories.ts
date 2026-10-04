import type { SeasonStory } from "../content";
import type { SeasonFacts } from "./events-state";
import type { SeasonSummary, World } from "./types";

// The flagship season as cards (GDD v1.15). Every story is read from the recorded season summaries
// and nothing else; there is no randomness. Thresholds are config (flagship.stories).

/** The facts a season card records about `seasons[index]`. */
export function seasonFacts(seasons: readonly SeasonSummary[], index: number): SeasonFacts {
  const summary = seasons[index];
  if (!summary) throw new Error("No such flagship season");
  let streak = 1;
  for (let i = index - 1; i >= 0 && seasons[i]?.championId === summary.championId; i -= 1) {
    streak += 1;
  }
  const [first, second] = summary.standings;
  const final = summary.playoffs[summary.playoffs.length - 1];
  return {
    season: summary.season,
    format: summary.format,
    championId: summary.championId,
    runnerUpId: summary.runnerUpId,
    streak,
    pointsGap: first && second ? first.points - second.points : 0,
    finalMargin:
      summary.format === "american" && final ? Math.abs(final.homeScore - final.awayScore) : null,
  };
}

/**
 * Every story `seasons[index]` qualifies for, in the GDD's priority order (pressure first, then the
 * rarest story). The champion moment is not a story: every season has one.
 */
export function seasonStories(
  seasons: readonly SeasonSummary[],
  index: number,
  world: World,
): SeasonStory[] {
  const summary = seasons[index];
  if (!summary) throw new Error("No such flagship season");
  const facts = seasonFacts(seasons, index);
  const { stories, points } = world.config.flagship;
  const leader = summary.standings[0];
  const found: SeasonStory[] = [];

  if (facts.streak >= stories.foregoneTitles) found.push("foregone");
  // American format: a table leader beaten in the playoffs is no runaway story.
  if (
    leader &&
    leader.played > 0 &&
    leader.clubId === facts.championId &&
    facts.pointsGap >= stories.runawayShare * leader.played * points.win
  ) {
    found.push("runaway");
  }
  if (facts.streak >= stories.dynastyTitles && facts.streak < stories.foregoneTitles) {
    found.push("dynasty");
  }
  const previous = seasons[index - 1];
  if (
    previous &&
    previous.countryId === summary.countryId &&
    [previous.championId, previous.runnerUpId].sort().join() ===
      [facts.championId, facts.runnerUpId].sort().join()
  ) {
    found.push("repeatFinal");
  }
  const weakest = [...summary.startRatings]
    .sort((a, b) => a.rating - b.rating || a.clubId - b.clubId)
    .slice(0, Math.floor(summary.startRatings.length / stories.underdogDivisor));
  if (weakest.some((entry) => entry.clubId === facts.championId)) found.push("underdog");
  if (!seasons.slice(0, index).some((s) => s.championId === facts.championId)) {
    found.push("firstTitle");
  }
  const close =
    facts.finalMargin === null
      ? summary.standings.length > 1 && facts.pointsGap <= stories.closeFinishWins * points.win
      : facts.finalMargin <= stories.closeFinalMargin[summary.scoring];
  if (close) found.push("closeFinish");
  return found;
}
