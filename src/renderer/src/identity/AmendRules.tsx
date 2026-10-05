import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { Names } from "../../../content";
import type { Action, AxisId, TurnSnapshot } from "../../../sim";
import { useTraditionWords } from "../culture/traditions";
import { useTermVars } from "./terms";

// Rules evolution, first build (GDD v1.20): amend one rule trait a year in the offseason,
// through a review step showing the price, the purist backlash and fit hints for the anchor and the
// five biggest markets. Prices, backlash and legality come from the simulation.

const HINT_LABEL = { "++": "strong", "+": "good", "-": "poor" } as const;

interface Props {
  snapshot: TurnSnapshot;
  names: Names;
  busy: boolean;
  onAction: (action: Action) => void;
}

export function AmendRules({ snapshot, names, busy, onAction }: Props) {
  const { t, i18n } = useTranslation();
  const words = useTraditionWords(snapshot);
  const list = (items: string[]) => new Intl.ListFormat(i18n.language).format(items);
  const nouns = useTermVars(snapshot.identity.terms)();
  const rules = snapshot.rules;
  const [axis, setAxis] = useState<AxisId | null>(null);
  const [option, setOption] = useState<string | null>(null);
  const [reviewing, setReviewing] = useState(false);
  const country = (id: string) => names.countries[id] ?? id;
  const traitName = (id: AxisId) => t(`genome.axes.${id}`);
  const optionName = (id: AxisId, value: string) => t(`genome.options.${id}.${value}`);
  const trait = rules.traits.find((entry) => entry.axis === axis);
  const choice = trait?.options.find((entry) => entry.option === option);
  const status = !snapshot.offseasonOpen ? "closed" : rules.amendedThisYear ? "done" : "open";
  const reset = () => {
    setAxis(null);
    setOption(null);
    setReviewing(false);
  };

  return (
    <section className="amend-rules" aria-labelledby="amend-heading" data-testid="amend-rules">
      <h4 id="amend-heading">{t("rules.heading")}</h4>
      <p>{t("rules.intro", { anchor: country(snapshot.anchorCountryId) })}</p>
      <p className={status === "open" ? "amend-status open" : "amend-status"} role="status">
        {t(`rules.${status}`)}
      </p>
      <table className="amend-table">
        <thead>
          <tr>
            <th scope="col">{t("rules.trait")}</th>
            <th scope="col">{t("rules.current")}</th>
            <th scope="col" className="amend-since">
              {t("rules.inForce")}
            </th>
            <th scope="col">{t("rules.amend")}</th>
          </tr>
        </thead>
        <tbody>
          {rules.traits.map((entry) => (
            <tr key={entry.axis} className={entry.axis === axis ? "chosen" : undefined}>
              <th scope="row">{traitName(entry.axis)}</th>
              <td>{optionName(entry.axis, entry.option)}</td>
              <td className="amend-since">{t("rules.since", { year: entry.sinceYear })}</td>
              <td>
                <button
                  type="button"
                  className="amend-pick"
                  disabled={busy || status !== "open"}
                  aria-label={t("rules.change", { trait: traitName(entry.axis) })}
                  data-testid={`amend-${entry.axis}`}
                  onClick={() => {
                    setAxis(entry.axis);
                    setOption(null);
                    setReviewing(false);
                  }}
                >
                  {t("rules.changeShort")}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {trait && !reviewing && (
        <fieldset className="amend-options" disabled={busy} data-testid="amend-options">
          <legend>{t("rules.choose", { trait: traitName(trait.axis) })}</legend>
          {trait.options.map((entry) => (
            <label key={entry.option} className={entry.option === option ? "chosen" : undefined}>
              <input
                type="radio"
                name="amend-option"
                value={entry.option}
                checked={entry.option === option}
                onChange={() => setOption(entry.option)}
              />
              <span>
                <b>{optionName(trait.axis, entry.option)}</b>
                <small>{t("rules.optionCost", { price: entry.price, lost: entry.backlash })}</small>
                {entry.blocker && (
                  <small className="amend-reason">
                    {t(`rules.blockers.${entry.blocker}`, { price: entry.price, pp: snapshot.pp })}
                  </small>
                )}
              </span>
            </label>
          ))}
          <div>
            <button
              type="button"
              className="action-button"
              disabled={!choice || choice.blocker !== null}
              data-testid="amend-review"
              onClick={() => setReviewing(true)}
            >
              {t("rules.review")}
            </button>
            <button type="button" className="flagship-back" onClick={reset}>
              {t("rules.back")}
            </button>
          </div>
        </fieldset>
      )}
      {trait && choice && reviewing && (
        <div className="flagship-review amend-review" data-testid="amend-review-panel">
          <p>
            {t("rules.reviewText", {
              trait: traitName(trait.axis),
              from: optionName(trait.axis, trait.option),
              to: optionName(trait.axis, choice.option),
              price: choice.price,
            })}
          </p>
          <p className={choice.backlash > 0 ? "warning" : undefined}>
            {t("rules.reviewLoss", { count: choice.backlash })}
          </p>
          {choice.offended.length > 0 && (
            <p className="warning" data-testid="amend-offended">
              {t("culture.offended", {
                count: choice.offended.length,
                names: list(
                  snapshot.culture.traditions
                    .filter((tradition) => choice.offended.includes(tradition.id))
                    .map(words.name),
                ),
              })}
            </p>
          )}
          <p>{t("rules.reviewTiming", nouns)}</p>
          <h5>{t("rules.hintsHeading")}</h5>
          <ul className="amend-hints">
            {rules.previewMarkets.map((id, i) => {
              const hint = choice.hints[i] ?? null;
              const label = t(`rules.hintLabels.${hint ? HINT_LABEL[hint] : "neutral"}`);
              return (
                <li key={id}>
                  <span>{country(id)}</span>
                  <b
                    className={hint === "-" ? "hint-negative" : hint ? "hint-positive" : undefined}
                    role="img"
                    aria-label={label}
                    title={label}
                  >
                    {hint ?? "·"}
                  </b>
                </li>
              );
            })}
          </ul>
          <small>{t("rules.hintsNote")}</small>
          <div>
            <button
              type="button"
              className="action-button"
              disabled={busy || choice.blocker !== null}
              data-testid="amend-confirm"
              onClick={() => {
                onAction({ type: "amendRule", axis: trait.axis, option: choice.option });
                reset();
              }}
            >
              {t("rules.confirm")}
            </button>
            <button type="button" className="flagship-back" onClick={() => setReviewing(false)}>
              {t("rules.back")}
            </button>
          </div>
        </div>
      )}
      {rules.amendments.length > 0 && (
        <>
          <h5>{t("rules.amendmentsHeading")}</h5>
          <ol className="amendments" data-testid="amendments">
            {rules.amendments.map((amendment) => (
              <li key={`${amendment.year}-${amendment.axis}`}>
                {t(amendment.demoted > 0 ? "rules.amendmentObjection" : "rules.amendment", {
                  trait: traitName(amendment.axis),
                  from: optionName(amendment.axis, amendment.from),
                  to: optionName(amendment.axis, amendment.to),
                  year: amendment.year,
                })}
              </li>
            ))}
          </ol>
        </>
      )}
    </section>
  );
}
