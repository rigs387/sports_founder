import { useTranslation } from "react-i18next";
import type { Outlet } from "../../../sim";

// Press (GDD v1.33): the name of the paper a story runs in. A country's own outlet once its league
// forms ("The Graz Matchday"), the sport's own paper before, the wire for world championships.

export function useOutletName(sportName: string) {
  const { t } = useTranslation();
  return (outlet: Outlet) => {
    if (outlet.kind === "local")
      return t("press.local", { place: outlet.place, word: outlet.word });
    if (outlet.kind === "wire") return outlet.name;
    return t("events.mastheads.sport", { sport: sportName });
  };
}

/** A stable small hash of an event id, to pick a headline variant that never changes on reload. */
export function variantOf(id: number, count: number): number {
  let h = 0x811c_9dc5;
  const text = String(id);
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x0100_0193) >>> 0;
  }
  return h % count;
}
