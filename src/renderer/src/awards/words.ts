import { useTranslation } from "react-i18next";
import type { TurnSnapshot } from "../../../sim";
import { PLAIN_TERMS, useTerms } from "../identity/terms";

// Award names (GDD v1.33). Player of the Season is plain until the Hall of Fame inducts its first
// player, then carries their name ("the Huber Medal"); the top scorer's prize is "the {Score}
// Crown" in the sport's own term. Names come only from the record.

export function useAwardWords(snapshot: TurnSnapshot | null) {
  const { t } = useTranslation();
  const { title } = useTerms(snapshot?.identity.terms ?? PLAIN_TERMS);
  const namerId = snapshot?.hallOfFame.awardNamerId ?? null;
  const namer = snapshot?.flagship.players.find((p) => p.id === namerId)?.name ?? "";
  // A medal carries the family name: the last word of the recorded name.
  const name = namer.trim().split(/\s+/).at(-1) ?? "";
  const named = name !== "";
  return {
    /** The award as it reads mid-sentence ("Player of the Season", "the Huber Medal"). */
    award: named ? t("awards.named", { name }) : t("awards.plain"),
    /** The award at the start of a sentence or a heading. */
    Award: named ? t("awards.named_start", { name }) : t("awards.plain"),
    /** The top scorer's prize mid-sentence ("the Goal Crown"). */
    crown: t("awards.crown", { Score: title("score") }),
  };
}
