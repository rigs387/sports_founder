import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { Action, TurnSnapshot } from "../../../sim";
import { useTraditionWords } from "./traditions";

// The flagship's trophy (GDD v1.22): named free while its first champion card is open; renamed
// only in the offseason, which ends the old trophy as a tradition and costs its purists.
export function TrophyCard({
  snapshot,
  busy,
  onAction,
}: {
  snapshot: TurnSnapshot;
  busy: boolean;
  onAction: (action: Action) => void;
}) {
  const { t } = useTranslation();
  const words = useTraditionWords(snapshot);
  const { culture } = snapshot;
  const trophyId = culture.naming ?? culture.rename?.trophyId ?? null;
  const trophy = culture.traditions.find((tradition) => tradition.id === trophyId);
  const [name, setName] = useState("");
  const [reviewing, setReviewing] = useState(false);
  if (!trophy) return null;
  const current = words.name(trophy);
  const tidy = name.trim().replace(/\s+/g, " ");
  const valid =
    tidy.length >= culture.nameLimits.min &&
    tidy.length <= culture.nameLimits.max &&
    tidy !== current;
  const naming = culture.naming === trophy.id;
  const blocker = culture.rename?.blocker ?? null;

  return (
    <section
      className="flagship-card culture-section"
      aria-labelledby="flagship-trophy-heading"
      data-testid="flagship-trophy"
    >
      <h2 id="flagship-trophy-heading">{t("culture.trophy.heading")}</h2>
      <p data-testid="flagship-trophy-name">{t("culture.trophy.named", { name: current })}</p>
      {naming && <p className="culture-note">{t("culture.trophy.nameNow")}</p>}
      {!naming && blocker !== null && (
        <p className="flagship-empty">{t(`culture.trophy.blockers.${blocker}`)}</p>
      )}
      {(naming || blocker === null) && !reviewing && (
        <form
          className="flagship-picker"
          onSubmit={(event) => {
            event.preventDefault();
            if (!valid) return;
            if (naming) {
              onAction({ type: "nameTrophy", name: tidy });
              setName("");
            } else setReviewing(true);
          }}
        >
          <label>
            <span>{t("culture.trophy.nameLabel")}</span>
            <input
              value={name}
              maxLength={culture.nameLimits.max}
              placeholder={current}
              disabled={busy}
              data-testid="flagship-trophy-input"
              onChange={(event) => setName(event.currentTarget.value)}
            />
          </label>
          <button
            type="submit"
            className="action-button"
            disabled={busy || !valid}
            data-testid="flagship-trophy-submit"
          >
            {t(naming ? "culture.trophy.name" : "culture.trophy.rename")}
          </button>
        </form>
      )}
      {reviewing && (
        <div className="flagship-review" data-testid="flagship-trophy-review">
          <p className="warning">
            {t("culture.trophy.renameReview", {
              name: current,
              count: culture.rename?.hardcore ?? 0,
            })}
          </p>
          <div>
            <button
              type="button"
              className="action-button"
              disabled={busy || !valid}
              onClick={() => {
                onAction({ type: "renameTrophy", name: tidy });
                setReviewing(false);
                setName("");
              }}
            >
              {t("culture.trophy.confirmRename")}
            </button>
            <button type="button" className="flagship-back" onClick={() => setReviewing(false)}>
              {t("culture.trophy.cancel")}
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
