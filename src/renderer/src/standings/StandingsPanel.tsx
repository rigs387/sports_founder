import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import type { Names } from "../../../content";
import type { TurnSnapshot } from "../../../sim";
import "./standings.css";

// Standings (GDD v1.35): the player's sport against the rival sports. Every number comes from
// the snapshot; the chart is the world Fandom Score of each sport by recorded year.

/** Fixed series colors by sport, never by rank (validated: tests the dataviz checks). */
export const SPORT_COLORS: Record<string, string> = {
  player: "var(--sport-player)",
  soccer: "var(--sport-soccer)",
  cricket: "var(--sport-cricket)",
};
const colorOf = (sportId: string) => SPORT_COLORS[sportId] ?? "var(--muted)";

/** A sport's display name: the player's own, or the rival's. */
export function sportName(snapshot: TurnSnapshot, names: Names | null, sportId: string): string {
  return sportId === "player" ? snapshot.identity.sportName : (names?.sports[sportId] ?? sportId);
}

/** The change a sport's world Fandom Score made over the last ten recorded years. */
function tenYearChange(snapshot: TurnSnapshot, sportId: string): number | null {
  const series = snapshot.standings.series;
  const now = snapshot.standings.sports.find((s) => s.sportId === sportId)?.fandomScore;
  const then = series.at(-10)?.scores[sportId];
  if (now === undefined || then === undefined || then <= 0) return null;
  return now / then - 1;
}

function Chart({ snapshot, names }: { snapshot: TurnSnapshot; names: Names | null }) {
  const { t } = useTranslation();
  const series = snapshot.standings.series;
  const sports = snapshot.standings.sports.map((s) => s.sportId);
  if (series.length < 2) return <p className="standings-empty">{t("standings.noHistory")}</p>;
  const width = 560;
  const height = 220;
  const pad = { left: 52, right: 96, top: 12, bottom: 26 };
  const max = Math.max(1, ...series.flatMap((point) => sports.map((id) => point.scores[id] ?? 0)));
  const x = (i: number) => pad.left + (i / (series.length - 1)) * (width - pad.left - pad.right);
  const y = (v: number) => pad.top + (1 - v / max) * (height - pad.top - pad.bottom);
  const compact = (value: number) => t("format.compact", { value });
  const first = series[0]?.year ?? 0;
  const last = series.at(-1)?.year ?? 0;
  return (
    <svg
      className="standings-chart"
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label={t("standings.chartLabel", { from: first, to: last })}
      data-testid="standings-chart"
    >
      {[0, 0.5, 1].map((share) => (
        <g key={share}>
          <line
            className="standings-grid"
            x1={pad.left}
            x2={width - pad.right}
            y1={y(max * share)}
            y2={y(max * share)}
          />
          <text className="standings-axis" x={pad.left - 6} y={y(max * share) + 4} textAnchor="end">
            {compact(max * share)}
          </text>
        </g>
      ))}
      <text className="standings-axis" x={pad.left} y={height - 6}>
        {first}
      </text>
      <text className="standings-axis" x={width - pad.right} y={height - 6} textAnchor="end">
        {last}
      </text>
      {sports.map((id) => {
        const points = series.map((point, i) => `${x(i)},${y(point.scores[id] ?? 0)}`).join(" ");
        const end = series.at(-1)?.scores[id] ?? 0;
        return (
          <g key={id}>
            <polyline className="standings-line" points={points} stroke={colorOf(id)} />
            <circle cx={x(series.length - 1)} cy={y(end)} r={4} fill={colorOf(id)} />
            <text className="standings-label" x={x(series.length - 1) + 8} y={y(end) + 4}>
              {sportName(snapshot, names, id)}
            </text>
          </g>
        );
      })}
      {/* The hover layer: one band a year, its title the year's scores. */}
      {series.map((point, i) => (
        <rect
          key={point.year}
          className="standings-hit"
          x={x(i) - (width - pad.left - pad.right) / (series.length - 1) / 2}
          y={pad.top}
          width={(width - pad.left - pad.right) / (series.length - 1)}
          height={height - pad.top - pad.bottom}
        >
          <title>
            {t("standings.year", {
              year: point.year,
              scores: sports
                .map((id) =>
                  t("standings.yearScore", {
                    sport: sportName(snapshot, names, id),
                    score: compact(point.scores[id] ?? 0),
                  }),
                )
                .join("\n"),
            })}
          </title>
        </rect>
      ))}
    </svg>
  );
}

/** The Standings panel, opened from the top bar's Fandom Score. */
export function StandingsPanel({
  snapshot,
  names,
  open,
  onClose,
}: {
  snapshot: TurnSnapshot;
  names: Names | null;
  open: boolean;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    if (open) dialog.current?.showModal();
    else dialog.current?.close();
  }, [open]);
  const { win } = snapshot;
  return (
    <dialog
      ref={dialog}
      className="standings-dialog"
      data-testid="standings"
      aria-labelledby="standings-heading"
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
    >
      <header>
        <span className="eyebrow">{t("standings.eyebrow")}</span>
        <button
          type="button"
          className="icon-button"
          aria-label={t("standings.close")}
          onClick={onClose}
        >
          &times;
        </button>
      </header>
      <h2 id="standings-heading">{t("standings.heading", { rank: win.rank })}</h2>
      <p className="standings-hold" data-testid="standings-hold">
        {win.won
          ? t("win.won", { turn: win.won.turn })
          : t("standings.hold", {
              held: win.turnsHeld,
              needed: win.holdTurns,
              tier: win.requiredTier,
            })}
      </p>
      <table className="standings-table">
        <thead>
          <tr>
            <th scope="col">{t("standings.sport")}</th>
            <th scope="col">{t("standings.score")}</th>
            <th scope="col">{t("standings.casual")}</th>
            <th scope="col">{t("standings.hardcore")}</th>
            <th scope="col">{t("standings.numberOne")}</th>
            <th scope="col">{t("standings.change")}</th>
          </tr>
        </thead>
        <tbody>
          {snapshot.standings.sports.map((sport) => {
            const change = tenYearChange(snapshot, sport.sportId);
            return (
              <tr key={sport.sportId} data-sport={sport.sportId}>
                <th scope="row">
                  <i style={{ background: colorOf(sport.sportId) }} aria-hidden="true" />
                  {sportName(snapshot, names, sport.sportId)}
                </th>
                <td>{t("format.compact", { value: sport.fandomScore })}</td>
                <td>{t("format.compact", { value: sport.casual })}</td>
                <td>{t("format.compact", { value: sport.hardcore })}</td>
                <td>{sport.numberOne}</td>
                <td>{change === null ? "—" : t("standings.changeValue", { value: change })}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <Chart snapshot={snapshot} names={names} />
      <p className="standings-note">{t("standings.note")}</p>
    </dialog>
  );
}
