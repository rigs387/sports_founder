import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type {
  Action,
  CountrySnapshot,
  LeagueActionBlocker,
  LeagueActionKind,
  TurnSnapshot,
} from "../../../sim";
import { ActionFeedback } from "./ActionFeedback";
import "./league-controls.css";

interface Props {
  country: CountrySnapshot;
  countryName: string;
  snapshot: TurnSnapshot;
  busy: boolean;
  onAction: (action: Action) => void;
}

const kinds: LeagueActionKind[] = ["promoteLeague", "stepDownLeague", "bailoutLeague"];

/** One set of real quotes and controls, shared by the map card and league overview. */
export function LeagueControls({ country, countryName, snapshot, busy, onAction }: Props) {
  const { t } = useTranslation();
  const [pending, setPending] = useState<LeagueActionKind | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const league = country.league;
  const hasLeague = !!league;
  useEffect(() => {
    const element = dialog.current;
    if (pending && hasLeague) {
      element?.showModal();
      element?.querySelector<HTMLButtonElement>("[data-cancel]")?.focus();
    }
    return () => element?.close();
  }, [pending, hasLeague]);
  if (!league) return <p>{t("league.none")}</p>;
  const tier = (value: string) => t(`league.tiers.${value}`);
  const reason = (blocker: LeagueActionBlocker | null) => {
    if (!blocker) return t("league.manage.ready");
    switch (blocker.kind) {
      case "topTier":
        return t("league.manage.blockers.topTier", { tier: tier(blocker.tier) });
      case "hardcore":
        return t("league.manage.blockers.hardcore", {
          needed: blocker.needed,
          current: blocker.current,
        });
      case "reserve":
        return t("league.manage.blockers.reserve", {
          needed: blocker.needed,
          current: blocker.current,
        });
      case "notNearCollapse":
        return t("league.manage.blockers.notNearCollapse", {
          health: t(`league.healthLevels.${blocker.health}`),
        });
      case "cooldown":
        return t("league.manage.blockers.cooldown", { count: blocker.remainingQuarters });
      case "prestige":
        return t("league.manage.blockers.prestige", {
          cost: blocker.cost,
          current: blocker.current,
        });
      default:
        return t(`league.manage.blockers.${blocker.kind}`);
    }
  };
  const summary = (kind: LeagueActionKind) => {
    if (kind === "promoteLeague") {
      const terms = league.actions.promoteLeague.terms;
      return terms
        ? t("league.manage.promotionPrice", { tier: tier(terms.to), cash: terms.cost })
        : t("league.manage.blockers.topTier", { tier: tier(league.tier) });
    }
    if (kind === "stepDownLeague") {
      const terms = league.actions.stepDownLeague.terms;
      return terms
        ? t("league.manage.restructurePrice", {
            tier: tier(terms.to),
            count: terms.hardcoreDemoted,
          })
        : t("league.manage.blockers.bottomTier");
    }
    const terms = league.actions.bailoutLeague.terms;
    return t("league.manage.bailoutPrice", { pp: terms.ppCost, cash: terms.cash });
  };
  const terms = (kind: LeagueActionKind) => {
    if (kind === "promoteLeague") {
      const offer = league.actions.promoteLeague.terms;
      return (
        offer && (
          <ul className="league-terms">
            <li>
              {t(
                snapshot.seasonalWindowOpen
                  ? "league.manage.windowOpen"
                  : "league.manage.blockers.window",
              )}
            </li>
            <li>
              {t("league.manage.fansRequired", {
                needed: offer.hardcoreNeeded,
                current: country.hardcore,
              })}
            </li>
            <li>
              {t("league.manage.reserveRequired", {
                needed: offer.reserveNeeded,
                current: league.cash,
              })}
            </li>
            <li>
              {t("league.manage.promotionDeduction", {
                cost: offer.cost,
                remaining: league.cash - offer.cost,
              })}
            </li>
            <li>
              {t("league.manage.newRunningCosts", {
                current: league.runningCostPerQuarter,
                next: offer.runningCostPerQuarter,
              })}
            </li>
          </ul>
        )
      );
    }
    if (kind === "stepDownLeague") {
      const offer = league.actions.stepDownLeague.terms;
      return (
        offer && (
          <ul className="league-terms">
            <li>
              {t("league.manage.restructureLoss", {
                count: offer.hardcoreDemoted,
                share: offer.hardcoreDemotionShare,
              })}
            </li>
            <li>
              {t("league.manage.newRunningCosts", {
                current: league.runningCostPerQuarter,
                next: offer.runningCostPerQuarter,
              })}
            </li>
            <li>{t("league.manage.restructureCash")}</li>
            <li>{t("league.manage.restructureHealth")}</li>
          </ul>
        )
      );
    }
    const offer = league.actions.bailoutLeague.terms;
    return (
      <ul className="league-terms">
        <li>
          {t("league.manage.bailoutBalance", {
            cash: league.cash + offer.cash,
            pp: snapshot.pp - offer.ppCost,
          })}
        </li>
        <li>{t("league.manage.cooldown", { count: offer.cooldownQuarters })}</li>
        <li>{t("league.manage.bailoutHealth")}</li>
      </ul>
    );
  };
  const available = (kind: LeagueActionKind) =>
    !busy && !snapshot.outcome && !league.actions[kind].blocker;
  return (
    <section
      className="league-management"
      data-testid="league-management"
      data-country={country.countryId}
      data-tier={league.tier}
      data-cash={league.cash}
      data-hardcore={country.hardcore}
      data-health={league.health}
      aria-label={t("league.manage.named", { country: countryName })}
    >
      <dl className="league-finances">
        <div>
          <dt>{t("league.manage.cash")}</dt>
          <dd>{t("league.manage.money", { value: league.cash })}</dd>
        </div>
        <div>
          <dt>{t("league.manage.income")}</dt>
          <dd>{t("league.manage.money", { value: league.revenuePerQuarter })}</dd>
        </div>
        <div>
          <dt>{t("league.manage.costs")}</dt>
          <dd>{t("league.manage.money", { value: league.runningCostPerQuarter })}</dd>
        </div>
        <div>
          <dt>{t("league.manage.net")}</dt>
          <dd
            className={
              league.revenuePerQuarter < league.runningCostPerQuarter ? "negative" : "positive"
            }
          >
            {t("league.manage.signedMoney", {
              value: league.revenuePerQuarter - league.runningCostPerQuarter,
            })}
          </dd>
        </div>
      </dl>
      <p className="league-finance-note">{t("league.manage.forecastNote")}</p>
      {country.countryId === snapshot.anchorCountryId && !snapshot.win.won && (
        <p className="league-anchor-note">{t("league.manage.anchorWarning")}</p>
      )}
      {kinds.map((kind) => (
        <details
          className="league-action"
          key={kind}
          data-league-action={kind}
          data-cash-cost={
            kind === "promoteLeague" ? league.actions.promoteLeague.terms?.cost : undefined
          }
          data-pp-cost={
            kind === "bailoutLeague" ? league.actions.bailoutLeague.terms.ppCost : undefined
          }
          data-cash-grant={
            kind === "bailoutLeague" ? league.actions.bailoutLeague.terms.cash : undefined
          }
          data-hardcore-demoted={
            kind === "stepDownLeague"
              ? league.actions.stepDownLeague.terms?.hardcoreDemoted
              : undefined
          }
        >
          <summary>
            <strong>{t(`league.manage.actions.${kind}`)}</strong>
            <span>
              {t(
                league.actions[kind].blocker ? "league.manage.unavailable" : "league.manage.ready",
              )}
            </span>
          </summary>
          <p className="league-quote">{summary(kind)}</p>
          {terms(kind)}
          <p className="league-blocker" data-testid="league-blocker">
            {reason(league.actions[kind].blocker)}
          </p>
          <button
            type="button"
            className="action-button"
            data-testid={`review-${kind}`}
            disabled={!available(kind)}
            onClick={() => setPending(kind)}
          >
            {t("league.manage.review", { action: t(`league.manage.actions.${kind}`) })}
          </button>
        </details>
      ))}
      <ActionFeedback />
      {pending && (
        <dialog
          className="league-confirm"
          ref={dialog}
          aria-labelledby={`league-confirm-title-${country.countryId}`}
          onCancel={(event) => {
            event.preventDefault();
            event.stopPropagation();
            setPending(null);
          }}
        >
          <span className="eyebrow">{countryName}</span>
          <h2 id={`league-confirm-title-${country.countryId}`}>
            {t(`league.manage.actions.${pending}`)}
          </h2>
          <p className="league-quote">{summary(pending)}</p>
          {terms(pending)}
          <p className="league-blocker">{reason(league.actions[pending].blocker)}</p>
          <div className="league-confirm-buttons">
            <button type="button" data-cancel onClick={() => setPending(null)}>
              {t("league.manage.cancel")}
            </button>
            <button
              type="button"
              className="action-button"
              data-testid="confirm-league-action"
              disabled={!available(pending)}
              onClick={() => {
                if (!available(pending)) return;
                onAction({ type: pending, countryId: country.countryId });
                setPending(null);
              }}
            >
              {t("league.manage.confirm", { action: t(`league.manage.actions.${pending}`) })}
            </button>
          </div>
        </dialog>
      )}
    </section>
  );
}
