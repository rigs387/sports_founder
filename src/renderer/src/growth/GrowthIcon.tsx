import type { GrowthIconName } from "./model";

const paths: Record<GrowthIconName, React.ReactNode> = {
  ball: (
    <>
      <circle cx="16" cy="16" r="11" />
      <path d="m16 10 6 4-2 7h-8l-2-7zM16 5v5m11 3-5 1m1 11-3-4m-11 4 3-4M5 13l5 1" />
    </>
  ),
  voice: <path d="m5 13 17-7v20L5 19zm0 0v6m4 2 2 7h5l-3-5M26 10l3-2m-3 8h4m-4 6 3 2" />,
  trophy: <path d="M9 5h14v8c0 12-14 12-14 0zM9 8H4v5q0 6 7 6m12-11h5v5q0 6-7 6M16 23v5m-6 0h12" />,
  court: (
    <>
      <path d="M4 7h24v18H4zM16 7v18M4 12h5v8H4m24-8h-5v8h5" />
      <circle cx="16" cy="16" r="4" />
    </>
  ),
  club: <path d="m4 14 12-9 12 9M7 12v15h18V12M13 27V17h6v10M16 5V2h7v5" />,
  fans: (
    <>
      <circle cx="16" cy="9" r="4" />
      <circle cx="5" cy="13" r="3" />
      <circle cx="27" cy="13" r="3" />
      <path d="M9 28v-7a7 7 0 0 1 14 0v7M1 25v-5q4-5 8 0m14 0q4-5 8 0v5" />
    </>
  ),
  flag: <path d="M8 29V4m0 1q5-4 10 0t10 0v13q-5 4-10 0t-10 0" />,
  shield: <path d="m16 3 12 5v9c0 7-12 13-12 13S4 24 4 17V8zM10 16l4 4 8-9" />,
  radio: (
    <>
      <rect x="4" y="10" width="24" height="18" rx="3" />
      <path d="m8 10 16-7M8 16h8m-8 5h8" />
      <circle cx="23" cy="19" r="3" />
    </>
  ),
  screen: (
    <>
      <rect x="3" y="7" width="26" height="18" rx="3" />
      <path d="m13 12 8 4-8 4zm-3 18h12M12 2l4 5 4-5" />
    </>
  ),
};

export function GrowthIcon({ name }: { name: GrowthIconName }) {
  return (
    <svg
      viewBox="0 0 32 32"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {paths[name]}
    </svg>
  );
}
