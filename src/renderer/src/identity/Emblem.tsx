import "./identity.css";

// The sport's preset emblem (GDD v1.18): a shape filled with the main color, edged and marked with
// the second color, and an icon. Drawn as inline SVG on a 100 × 100 grid; the editor is Phase 2.

const SHAPES: Record<string, string> = {
  shield: "M50 5 L91 17 V48 C91 73 72 89 50 96 C28 89 9 73 9 48 V17 Z",
  roundel: "M50 5 A45 45 0 1 1 49.99 5 Z",
  pennant: "M12 6 H88 V64 L50 95 L12 64 Z",
  diamond: "M50 4 L96 50 L50 96 L4 50 Z",
  crest: "M14 22 Q50 0 86 22 V58 Q86 86 50 97 Q14 86 14 58 Z",
};

const ICONS: Record<string, { d: string; stroke?: boolean }> = {
  star: {
    d: "M50 28 L56.5 43 L72 44 L60 54.5 L63.5 70 L50 61.5 L36.5 70 L40 54.5 L28 44 L43.5 43 Z",
  },
  ball: {
    d: "M50 32 A18 18 0 1 1 49.99 32 Z M36 42 Q50 50 64 42 M36 58 Q50 50 64 58",
    stroke: true,
  },
  crown: { d: "M30 64 L31 38 L42 50 L50 34 L58 50 L69 38 L70 64 Z" },
  bolt: { d: "M55 27 L35 55 H49 L43 75 L66 45 H52 Z" },
  wing: {
    d: "M28 62 C34 40 52 30 74 32 C66 38 64 42 62 46 C56 46 50 50 48 54 C44 54 38 58 28 62 Z",
  },
  oak: {
    d: "M50 28 C58 34 56 40 62 42 C58 48 64 52 58 58 C54 60 54 66 50 72 C46 66 46 60 42 58 C36 52 42 48 38 42 C44 40 42 34 50 28 Z M50 72 V78",
  },
  wave: { d: "M28 46 Q36 38 44 46 T60 46 T76 46 M28 58 Q36 50 44 58 T60 58 T76 58", stroke: true },
  tower: {
    d: "M34 72 V40 H40 V34 H46 V40 H54 V34 H60 V40 H66 V72 Z M46 72 V60 Q50 54 54 60 V72 Z",
  },
};

interface Props {
  shape: string;
  icon: string;
  primary: string;
  secondary: string;
  size?: number;
  /** The accessible name; omit for a decorative emblem. */
  label?: string;
}

export function Emblem({ shape, icon, primary, secondary, size = 48, label }: Props) {
  const mark = ICONS[icon] ?? ICONS.star;
  return (
    <svg
      className="emblem"
      viewBox="0 0 100 100"
      width={size}
      height={size}
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      data-shape={shape}
      data-icon={icon}
    >
      <path
        d={SHAPES[shape] ?? SHAPES.shield}
        fill={primary}
        stroke={secondary}
        strokeWidth="6"
        strokeLinejoin="round"
      />
      <path
        d={mark?.d}
        fill={mark?.stroke ? "none" : secondary}
        stroke={secondary}
        strokeWidth={mark?.stroke ? 5 : 2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
