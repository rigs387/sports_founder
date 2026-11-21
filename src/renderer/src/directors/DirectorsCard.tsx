import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { Action, TurnSnapshot } from "../../../sim";
import "./directors.css";

/**
 * League directors (GDD v1.40): who directs each focus country's league, their trait and salary,
 * and, on the offseason screen, this offseason's candidates to replace them with. Replacing goes
 * through a review step stating the severance. Elsewhere the card is read-only.
 */
export function DirectorsCard({
  snapshot,
  country,
  busy,
  onAction,
  readOnly = false,
}: {
  snapshot: TurnSnapshot;
  country: (id: string) => string;
  busy: boolean;
  onAction: (action: Action) => void;
  readOnly?: boolean;
}) {
  const { t } = useTranslation();
  const [reviewing, setReviewing] = useState<{ countryId: string; pick: number } | null>(null);
  const { serving, candidates } = snapshot.directors;
  return (
    <section
      className="flagship-card directors-card"
      aria-labelledby="directors-heading"
      data-testid="directors-card"
    >
      <h2 id="directors-heading">{t("directors.heading")}</h2>
      {serving.length === 0 ? (
        <p className="flagship-empty">{t("directors.none")}</p>
      ) : (
        <ul className="directors-list">
          {serving.map((director) => {
            const league = snapshot.countries.find((c) => c.countryId === director.countryId);
            const options = candidates.find((c) => c.countryId === director.countryId);
            const open = reviewing?.countryId === director.countryId ? reviewing : null;
            const chosen = open ? options?.options[open.pick] : undefined;
            const cash = league?.league?.cash ?? 0;
            const severance = options?.severance ?? 0;
            return (
              <li key={director.id} data-testid="director" data-country={director.countryId}>
                <p>
                  <strong>{director.name}</strong>{" "}
                  {t("directors.line", {
                    country: country(director.countryId),
                    trait: t(`directors.traits.${director.trait}.name`),
                    year: director.fromYear,
                    salary: director.salaryPerQuarter,
                  })}
                </p>
                <p className="flagship-empty">{t(`directors.traits.${director.trait}.effect`)}</p>
                <p className="flagship-empty" data-testid="director-patience">
                  {t("directors.patience", { count: director.patience })}
                </p>
                {!readOnly && options && options.options.length === 0 && (
                  <p className="flagship-empty">{t("directors.replaced")}</p>
                )}
                {!readOnly && options && options.options.length > 0 && !open && (
                  <div className="directors-candidates">
                    <p>{t("directors.candidates", { severance })}</p>
                    {options.options.map((option, pick) => (
                      <button
                        key={option.name}
                        type="button"
                        className="action-button"
                        disabled={busy || cash < severance}
                        data-testid="director-candidate"
                        onClick={() => setReviewing({ countryId: director.countryId, pick })}
                      >
                        {t("directors.candidate", {
                          name: option.name,
                          trait: t(`directors.traits.${option.trait}.name`),
                        })}
                      </button>
                    ))}
                    {cash < severance && (
                      <p className="flagship-empty" data-testid="director-blocker">
                        {t("directors.blockers.cash", { severance, cash })}
                      </p>
                    )}
                  </div>
                )}
                {!readOnly && open && chosen && (
                  <div className="flagship-review" data-testid="director-review">
                    <p>
                      {t("directors.review", {
                        old: director.name,
                        name: chosen.name,
                        trait: t(`directors.traits.${chosen.trait}.name`),
                        effect: t(`directors.traits.${chosen.trait}.effect`),
                        severance,
                        cash,
                      })}
                    </p>
                    <div>
                      <button
                        type="button"
                        className="action-button"
                        disabled={busy}
                        data-testid="director-confirm"
                        onClick={() => {
                          setReviewing(null);
                          onAction({
                            type: "replaceDirector",
                            countryId: director.countryId,
                            candidate: open.pick,
                          });
                        }}
                      >
                        {t("directors.confirm", { name: chosen.name })}
                      </button>
                      <button
                        type="button"
                        className="flagship-back"
                        onClick={() => setReviewing(null)}
                      >
                        {t("directors.back")}
                      </button>
                    </div>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {readOnly && serving.length > 0 && (
        <p className="flagship-empty">{t("directors.offseasonOnly")}</p>
      )}
    </section>
  );
}
