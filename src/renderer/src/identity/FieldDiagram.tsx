import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import type { Genome } from "../../../content/genome-axes";

// The field diagram (GDD v1.18), drawn from the genome: the surface sets the ground's look, the
// footprint its size, team size the players a side, the structure the markings (goals at each end,
// set-piece lines, or a central strip for innings), the scoring frequency the goal size and the
// equipment what players carry. A picture of the rules, not a simulation: nothing here is played.

const SURFACES: Record<string, { ground: string; line: string; stripe: string | null }> = {
  grass: { ground: "#5c9e57", line: "#f4f7ef", stripe: "#67aa61" },
  indoor: { ground: "#d6a46a", line: "#fff8ec", stripe: "#cf9c61" },
  street: { ground: "#6b7079", line: "#f2d36b", stripe: null },
  ice: { ground: "#e9f5fb", line: "#c0392b", stripe: null },
};

const FOOTPRINT: Record<string, { w: number; h: number }> = {
  small: { w: 196, h: 118 },
  medium: { w: 244, h: 146 },
  large: { w: 292, h: 172 },
};

const GOAL: Record<string, number> = { low: 0.18, medium: 0.26, high: 0.38 };

const VIEW = { w: 320, h: 196 };

/** Spreads n players over one half, in columns from the back. */
function formation(
  n: number,
  half: "home" | "away",
  box: { x: number; y: number; w: number; h: number },
) {
  const columns = n <= 5 ? 2 : n <= 8 ? 3 : 4;
  const perColumn = Math.ceil(n / columns);
  const spots: { x: number; y: number }[] = [];
  for (let i = 0; i < n; i += 1) {
    const column = Math.floor(i / perColumn);
    const inColumn = Math.min(perColumn, n - column * perColumn);
    const row = i % perColumn;
    const depth = (column + 0.6) / (columns + 0.4);
    const x = half === "home" ? box.x + (box.w / 2) * depth : box.x + box.w - (box.w / 2) * depth;
    const y = box.y + (box.h * (row + 1)) / (inColumn + 1);
    spots.push({ x, y });
  }
  return spots;
}

interface Props {
  genome: Genome;
  playersPerSide: number;
  homeColor: string;
  awayColor: string;
  homeName: string;
}

export function FieldDiagram({ genome, playersPerSide, homeColor, awayColor, homeName }: Props) {
  const { t } = useTranslation();
  const surface = SURFACES[genome.surface] ?? SURFACES.grass;
  const size = FOOTPRINT[genome.footprint] ?? FOOTPRINT.medium;
  if (!surface || !size) return null;
  const box = { x: (VIEW.w - size.w) / 2, y: 10 + (172 - size.h) / 2, w: size.w, h: size.h };
  const cx = box.x + box.w / 2;
  const cy = box.y + box.h / 2;
  const goal = box.h * (GOAL[genome.scoring] ?? 0.26);
  const marks: ReactNode[] = [];

  if (surface.stripe) {
    for (let i = 0; i < 8; i += 2) {
      marks.push(
        <rect
          key={`stripe-${i}`}
          x={box.x + (box.w / 8) * i}
          y={box.y}
          width={box.w / 8}
          height={box.h}
          fill={surface.stripe}
        />,
      );
    }
  }
  if (genome.structure === "innings") {
    // A central strip where the batting side stands, fielders spread around it.
    marks.push(
      <ellipse
        key="boundary"
        cx={cx}
        cy={cy}
        rx={box.w / 2 - 6}
        ry={box.h / 2 - 6}
        fill="none"
        stroke={surface.line}
        strokeWidth="1.5"
      />,
      <rect
        key="strip"
        x={cx - 6}
        y={cy - 22}
        width="12"
        height="44"
        fill={genome.surface === "grass" ? "#d9c58a" : surface.line}
        opacity="0.85"
      />,
    );
  } else {
    marks.push(
      <line
        key="half"
        x1={cx}
        y1={box.y}
        x2={cx}
        y2={box.y + box.h}
        stroke={surface.line}
        strokeWidth="1.5"
      />,
      <circle
        key="centre"
        cx={cx}
        cy={cy}
        r={box.h / 7}
        fill="none"
        stroke={surface.line}
        strokeWidth="1.5"
      />,
    );
    if (genome.structure === "stop-start") {
      for (let i = 1; i < 8; i += 1) {
        if (i === 4) continue;
        const x = box.x + (box.w / 8) * i;
        marks.push(
          <line
            key={`yard-${i}`}
            x1={x}
            y1={box.y}
            x2={x}
            y2={box.y + box.h}
            stroke={surface.line}
            strokeWidth="0.8"
            strokeDasharray="4 4"
          />,
        );
      }
    }
    for (const side of [0, 1]) {
      const x = side === 0 ? box.x - 6 : box.x + box.w;
      marks.push(
        <rect
          key={`goal-${side}`}
          x={x}
          y={cy - goal / 2}
          width="6"
          height={goal}
          fill="none"
          stroke={surface.line}
          strokeWidth="2"
        />,
      );
    }
  }

  const playerSpots = (half: "home" | "away") =>
    genome.structure === "innings" && half === "away"
      ? // Fielders ring the strip; the batting side waits at one end.
        Array.from({ length: playersPerSide }, (_, i) => {
          const angle = (2 * Math.PI * i) / playersPerSide;
          return { x: cx + Math.cos(angle) * box.w * 0.32, y: cy + Math.sin(angle) * box.h * 0.32 };
        })
      : genome.structure === "innings"
        ? Array.from({ length: playersPerSide }, (_, i) => ({
            x: box.x + 10 + (i % 6) * 9,
            y: box.y + box.h - 10 - Math.floor(i / 6) * 9,
          }))
        : formation(playersPerSide, half, box);
  const gear = genome.equipment === "protective-gear";
  const stick = genome.equipment === "stick-or-bat";
  const players = (["home", "away"] as const).flatMap((half) =>
    playerSpots(half).map((spot, i) => (
      // biome-ignore lint/suspicious/noArrayIndexKey: players are positions, fixed per genome
      <g key={`${half}-${i}`} data-side={half}>
        {stick && (
          <line
            x1={spot.x + 3}
            y1={spot.y + 3}
            x2={spot.x + 9}
            y2={spot.y + 7}
            stroke="#3b2f22"
            strokeWidth="1.6"
            strokeLinecap="round"
          />
        )}
        <circle
          cx={spot.x}
          cy={spot.y}
          r="4.2"
          fill={half === "home" ? homeColor : awayColor}
          stroke={gear ? "#1b1b1f" : "#ffffff"}
          strokeWidth={gear ? 2.2 : 1}
        />
      </g>
    )),
  );

  return (
    <figure className="field-diagram" data-testid="field-diagram" data-players={playersPerSide}>
      <svg
        viewBox={`0 0 ${VIEW.w} ${VIEW.h}`}
        role="img"
        aria-label={t("identity.diagram.label", {
          surface: t(`identity.diagram.surfaces.${genome.surface}`),
          size: t(`identity.diagram.sizes.${genome.footprint}`),
          count: playersPerSide,
        })}
      >
        <rect
          x={box.x}
          y={box.y}
          width={box.w}
          height={box.h}
          rx={genome.surface === "ice" ? 26 : 3}
          fill={surface.ground}
          stroke={surface.line}
          strokeWidth="2"
        />
        {marks}
        {genome.surface === "street" && (
          <line
            x1={box.x}
            y1={box.y + 4}
            x2={box.x + box.w}
            y2={box.y + 4}
            stroke="#d9dbe0"
            strokeWidth="3"
            strokeDasharray="10 8"
          />
        )}
        {players}
        <circle cx={cx + 8} cy={cy - 6} r="2.8" fill="#ffffff" stroke="#1b1b1f" strokeWidth="1" />
      </svg>
      <figcaption>
        <span>
          <i style={{ background: homeColor }} aria-hidden="true" />
          {t("identity.diagram.legendHome", { club: homeName })}
        </span>
        <span>
          <i style={{ background: awayColor }} aria-hidden="true" />
          {t("identity.diagram.legendAway")}
        </span>
        <span>{t("identity.diagram.perSide", { count: playersPerSide })}</span>
      </figcaption>
    </figure>
  );
}
