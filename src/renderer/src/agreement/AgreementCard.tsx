import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { Action, AgreementTerms, MinWage, TurnSnapshot } from "../../../sim";
import { useTermVars } from "../identity/terms";
import "./agreement.css";

const MIN_WAGES: readonly MinWage[] = ["low", "standard", "high"];

/**
 * The players' agreement at the flagship (GDD v1.39): the terms in force, and while talks are
 * open the four levers with the union's read of the offer as they move, then a review step and
 * one confirmation. The read, the ask and legality come from the simulation.
 */
export function AgreementCard({
  snapshot,
  busy,
  onAction,
}: {
  snapshot: TurnSnapshot;
  busy: boolean;
  onAction: (action: Action) => void;
}) {
  const { t } = useTranslation();
  const nouns = useTermVars(snapshot.identity.terms)();
  const agreement = snapshot.agreement;
  const [offer, setOffer] = useState<AgreementTerms | null>(null);
  const [reviewing, setReviewing] = useState(false);
  const terms = offer ?? agreement.ask ?? agreement.terms;
  const read = agreement.offers.find(
    (entry) =>
      entry.terms.share === terms.share &&
      entry.terms.term === terms.term &&
      entry.terms.cap === terms.cap &&
      entry.terms.minWage === terms.minWage,
  );
  const pay = (choice: AgreementTerms) => choice.share + agreement.minWages[choice.minWage];
  const set = (change: Partial<AgreementTerms>) => {
    setOffer({ ...terms, ...change });
    setReviewing(false);
  };
  const season = snapshot.flagship.season;
  const summary = (choice: AgreementTerms) =>
    t("agreement.summary", {
      ...nouns,
      share: choice.share,
      count: choice.term,
      cap: t(choice.cap ? "agreement.capOn" : "agreement.capOff"),
      minWage: t(`agreement.minWage.${choice.minWage}`),
    });

  return (
    <section
      className="flagship-card agreement-card"
      aria-labelledby="agreement-heading"
      data-testid="agreement-card"
      data-talks={agreement.talksOpen}
    >
      <h2 id="agreement-heading">{t("agreement.heading")}</h2>
      {!agreement.formed ? (
        <p className="flagship-empty">{t("agreement.noUnion", nouns)}</p>
      ) : agreement.fromSeason !== null && agreement.throughSeason !== null ? (
        <p data-testid="agreement-in-force">
          {t("agreement.inForce", {
            ...nouns,
            terms: summary(agreement.terms),
            from: agreement.fromSeason,
            through: agreement.throughSeason,
          })}
        </p>
      ) : (
        <p>{t("agreement.default", { terms: summary(agreement.terms) })}</p>
      )}
      {agreement.stoppageSeason !== null && (
        <p className="warning">
          {t("agreement.stopped", { ...nouns, season: agreement.stoppageSeason })}
        </p>
      )}
      {agreement.formed && !agreement.talksOpen && agreement.throughSeason !== null && (
        <p className="flagship-empty">
          {t("agreement.nextTalks", { ...nouns, season: agreement.throughSeason + 1 })}
        </p>
      )}
      {agreement.talksOpen && agreement.ask && read && (
        <>
          <p className="agreement-ask" data-testid="agreement-ask">
            {t("agreement.ask", { ...nouns, terms: summary(agreement.ask), season })}
          </p>
          {!reviewing ? (
            <fieldset className="amend-options agreement-levers" disabled={busy}>
              <legend>{t("agreement.levers")}</legend>
              <label className="agreement-share">
                <span>
                  <b>{t("agreement.share", { share: terms.share })}</b>
                  <small>{t("agreement.shareHint")}</small>
                </span>
                <input
                  type="range"
                  min={agreement.shares[0]}
                  max={agreement.shares[1]}
                  step={1}
                  value={terms.share}
                  data-testid="agreement-share"
                  onChange={(event) => set({ share: Number(event.target.value) })}
                />
              </label>
              <Choices
                legend={t("agreement.term")}
                hint={t("agreement.termHint")}
                name="agreement-term"
                options={agreement.termOptions.map((term) => ({
                  value: String(term),
                  label: t("agreement.seasons", { ...nouns, count: term }),
                }))}
                value={String(terms.term)}
                onChange={(value) => set({ term: Number(value) })}
              />
              <Choices
                legend={t("agreement.cap")}
                hint={t("agreement.capHint")}
                name="agreement-cap"
                options={[
                  { value: "off", label: t("agreement.off") },
                  { value: "on", label: t("agreement.on") },
                ]}
                value={terms.cap ? "on" : "off"}
                onChange={(value) => set({ cap: value === "on" })}
              />
              <Choices
                legend={t("agreement.minWageLabel")}
                hint={t("agreement.minWageHint")}
                name="agreement-min-wage"
                options={MIN_WAGES.map((wage) => ({
                  value: wage,
                  label: t(`agreement.minWageOption.${wage}`),
                }))}
                value={terms.minWage}
                onChange={(value) => set({ minWage: value as MinWage })}
              />
              <p
                className={`agreement-read agreement-read-${read.read}`}
                role="status"
                data-testid="agreement-read"
                data-read={read.read}
              >
                {t(`agreement.read.${read.read}`, { chance: read.chance })}
              </p>
              <p>
                {t("agreement.pay", {
                  share: pay(terms),
                  value: (pay(terms) / 100) * agreement.incomePerQuarter,
                })}
              </p>
              <div>
                <button
                  type="button"
                  className="action-button"
                  data-testid="agreement-review"
                  onClick={() => setReviewing(true)}
                >
                  {t("agreement.review")}
                </button>
                {offer && (
                  <button type="button" className="flagship-back" onClick={() => setOffer(null)}>
                    {t("agreement.toAsk")}
                  </button>
                )}
              </div>
            </fieldset>
          ) : (
            <div className="flagship-review amend-review" data-testid="agreement-review-panel">
              <p>{t("agreement.reviewText", { ...nouns, terms: summary(terms), season })}</p>
              <p className={read.chance > 0 ? "warning" : undefined}>
                {t(`agreement.reviewRead.${read.read}`, { ...nouns, chance: read.chance, season })}
              </p>
              <div>
                <button
                  type="button"
                  className="action-button"
                  disabled={busy}
                  data-testid="agreement-confirm"
                  onClick={() => {
                    setReviewing(false);
                    setOffer(null);
                    onAction({ type: "proposeAgreement", terms });
                  }}
                >
                  {t("agreement.confirm")}
                </button>
                <button type="button" className="flagship-back" onClick={() => setReviewing(false)}>
                  {t("agreement.back")}
                </button>
              </div>
            </div>
          )}
          <p className="flagship-empty">{t("agreement.endTurnDefault", nouns)}</p>
        </>
      )}
    </section>
  );
}

function Choices({
  legend,
  hint,
  name,
  options,
  value,
  onChange,
}: {
  legend: string;
  hint: string;
  name: string;
  options: { value: string; label: string }[];
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="agreement-choices" role="radiogroup" aria-label={legend}>
      <span>
        <b>{legend}</b>
        <small>{hint}</small>
      </span>
      <div>
        {options.map((option) => (
          <label key={option.value} className={option.value === value ? "chosen" : undefined}>
            <input
              type="radio"
              name={name}
              value={option.value}
              checked={option.value === value}
              data-testid={`${name}-${option.value}`}
              onChange={() => onChange(option.value)}
            />
            {option.label}
          </label>
        ))}
      </div>
    </div>
  );
}
