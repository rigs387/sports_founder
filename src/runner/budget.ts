import { performance } from "node:perf_hooks";
import type { PlayedCampaign } from "./campaign";

// Keeps runner jobs short enough to see their results. A run states its plan before it starts,
// prints progress while it plays, and stops early when it is projected to run over its time
// budget, saying how to make it smaller. Results nobody waits for are worth nothing.

export class BudgetExceededError extends Error {
  override name = "BudgetExceededError";
}

/** When the projection is checked: after the first campaign, then once the estimate settles. */
const CHECK_AFTER = [1, 5];
const PROGRESS_EVERY_MS = 15_000;

const minutes = (ms: number) => `${(ms / 60_000).toFixed(1)} min`;

export class RunBudget {
  private played = 0;
  private turnsPlayed = 0;
  private playMs = 0;
  private readonly started = performance.now();
  private lastProgress = this.started;

  constructor(
    /** Campaigns the run will play. */
    private readonly planned: number,
    /** Turns per campaign at most; projections assume every remaining campaign plays them all. */
    private readonly turns: number,
    private readonly maxMinutes: number,
    private readonly log: (line: string) => void = console.log,
  ) {}

  start(description: string): void {
    this.log(
      `Plan: ${this.planned} campaign(s) of up to ${this.turns} turns (${description}); budget ${this.maxMinutes} min. Progress every ${PROGRESS_EVERY_MS / 1000} s.`,
    );
  }

  /** Projected total run time in ms, from the time per turn so far. */
  projectedMs(): number {
    const perTurn = this.playMs / Math.max(1, this.turnsPlayed);
    return this.elapsedMs() + (this.planned - this.played) * this.turns * perTurn;
  }

  elapsedMs(): number {
    return performance.now() - this.started;
  }

  campaignPlayed(played: PlayedCampaign, ms: number): void {
    this.played += 1;
    this.turnsPlayed += Math.max(1, played.result.turnsPlayed);
    this.playMs += ms;
    const projected = this.projectedMs();
    if (CHECK_AFTER.includes(this.played) && projected > this.maxMinutes * 60_000) {
      throw new BudgetExceededError(
        `Stopped after ${this.played} of ${this.planned} campaigns: the run is projected to take about ${minutes(projected)}, over its ${this.maxMinutes} min budget.\n` +
          "Make it smaller (fewer --campaigns, --turns, --anchors or --bots, or one --experiment at a time), " +
          "or raise --max-minutes if the long run is really needed.",
      );
    }
    const now = performance.now();
    if (now - this.lastProgress >= PROGRESS_EVERY_MS) {
      this.lastProgress = now;
      this.log(
        `  ... ${this.played}/${this.planned} campaigns, ${minutes(this.elapsedMs())} elapsed, about ${minutes(Math.max(0, projected - this.elapsedMs()))} left at most`,
      );
    }
  }
}
