import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import type { QuarterFrame } from "../../../sim";
import { mapSettings } from "../map/model";
import { pendingDecisions } from "../state/clock";
import { useGameStore } from "../state/game-store";
import "./turn-clock.css";

/**
 * The quarter of the last turn shown now while it replays (GDD v1.24), or null once the replay is
 * over. Ends the replay when its last quarter has had its time on screen.
 */
export function useReplayFrame(): QuarterFrame | null {
  const replay = useGameStore((state) => state.replay);
  const finishReplay = useGameStore((state) => state.finishReplay);
  const [index, setIndex] = useState(0);
  useEffect(() => {
    if (!replay) return;
    let frame = 0;
    const tick = () => {
      const shown = Math.floor((performance.now() - replay.startedAt) / replay.quarterMs);
      if (shown >= replay.frames.length) {
        finishReplay();
        return;
      }
      setIndex(shown);
      frame = requestAnimationFrame(tick);
    };
    tick();
    return () => cancelAnimationFrame(frame);
  }, [replay, finishReplay]);
  return replay ? (replay.frames[Math.min(index, replay.frames.length - 1)] ?? null) : null;
}

/**
 * Plays turns while the clock runs: the next turn starts once the last one's replay is over. It
 * never plays past an unanswered decision (End Turn would settle it with its free default).
 */
export function useClockLoop() {
  const { status, snapshot, replay, clock, endTurn, pause } = useGameStore();
  useEffect(() => {
    if (!clock.playing || status !== "ready" || replay || !snapshot) return;
    if (snapshot.outcome) {
      pause();
      return;
    }
    if (pendingDecisions(snapshot) > 0) {
      useGameStore.setState({
        clock: { ...clock, playing: false, pausedFor: ["decision"], resumeAfterAnswer: true },
      });
      return;
    }
    void endTurn();
  }, [clock, status, replay, snapshot, endTurn, pause]);
}

/** Play / Pause, the three speeds, the date and why the clock stopped. */
export function TurnClock({ frame }: { frame: QuarterFrame | null }) {
  const { t } = useTranslation();
  const { status, snapshot, clock, play, pause, setSpeed, endTurn, finishReplay } = useGameStore();
  if (!snapshot) return null;
  const date = frame ?? snapshot;
  const over = !!snapshot.outcome;
  return (
    <div
      className="turn-clock"
      data-testid="turn-clock"
      data-playing={clock.playing}
      data-speed={clock.speed}
      data-paused-for={clock.pausedFor.join(" ")}
      data-replaying={frame !== null}
    >
      <div className="clock-date" aria-live="off">
        <b data-testid="clock-date">
          {t("turn.date", { quarter: date.quarterOfYear, year: date.year })}
        </b>
        <small>{t("turn.label", { turn: snapshot.turn })}</small>
      </div>
      <div className="clock-controls">
        <button
          type="button"
          className="clock-play"
          data-testid="clock-play"
          aria-pressed={clock.playing}
          disabled={over}
          onClick={() => (clock.playing ? pause() : play())}
        >
          <span aria-hidden="true">{clock.playing ? "❚❚" : "▶"}</span>
          {t(clock.playing ? "clock.pause" : "clock.play")}
        </button>
        <fieldset className="clock-speeds" aria-label={t("clock.speed")}>
          {mapSettings.clock.quarterMs.map((ms, index) => (
            <button
              type="button"
              key={ms}
              data-testid={`clock-speed-${index}`}
              aria-pressed={clock.speed === index}
              title={t("clock.speedTitle", { seconds: ms / 1000 })}
              onClick={() => setSpeed(index)}
            >
              {"›".repeat(index + 1)}
            </button>
          ))}
        </fieldset>
        <button
          type="button"
          className="advance-turn clock-step"
          data-testid="end-turn"
          title={t("clock.stepTitle")}
          disabled={status !== "ready" || over || clock.playing}
          onClick={() => {
            finishReplay();
            void endTurn();
          }}
        >
          <span>{t(status === "simulating" ? "status.simulating" : "clock.step")}</span>
          <b aria-hidden="true">&#8594;</b>
        </button>
      </div>
      {!clock.playing && clock.pausedFor.length > 0 && (
        <p className="clock-paused" role="status" data-testid="clock-paused">
          {t("clock.pausedFor", {
            reasons: clock.pausedFor.map((kind) => t(`clock.interrupts.${kind}`)).join(" · "),
          })}
        </p>
      )}
    </div>
  );
}
