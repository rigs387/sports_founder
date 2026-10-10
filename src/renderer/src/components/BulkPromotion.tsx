import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { LeagueTierId } from "../../../content";
import type { Action, TurnSnapshot } from "../../../sim";

/**
 * Bulk promotion (GDD v1.34): one button per tier some leagues could step up into this offseason,
 * with a review listing each league, what investors put in and its projected cash flow a quarter at
 * the new tier, flagging the ones that would lose money (GDD v1.35). Each league is promoted exactly as
 * on its own; the flagship is never included (its promotion is the seat's decision).
 */
export function BulkPromotion({
  snapshot,
  country,
  busy,
  onAction,
}: {
  snapshot: TurnSnapshot;
  country: (id: string) => string;
  busy: boolean;
  onAction: (action: Action) => void;
}) {
  const { t, i18n } = useTranslation();
  const [reviewing, setReviewing] = useState<LeagueTierId | null>(null);
  if (!snapshot.offseasonOpen) return <p className="flagship-empty">{t("league.bulk.window")}</p>;
  if (snapshot.bulkPromotions.length === 0)
    return <p className="flagship-empty">{t("league.bulk.none")}</p>;
  const name = country;
  const terms = (id: string) =>
    snapshot.countries.find((c) => c.countryId === id)?.league?.actions.promoteLeague.terms;
  const entry = snapshot.bulkPromotions.find((item) => item.to === reviewing);
  const losing = entry
    ? entry.countryIds.filter((id) => (terms(id)?.flowPerQuarter ?? 0) < 0).length
    : 0;
  return (
    <div className="bulk-promotion" data-testid="bulk-promotion">
      {entry ? (
        <div className="flagship-review" data-testid="bulk-review">
          <p>
            {t("league.bulk.review", {
              count: entry.countryIds.length,
              tier: t(`league.tiers.${entry.to}`),
            })}
          </p>
          {losing > 0 ? (
            <p className="bulk-warning" data-testid="bulk-losing">
              {t("league.bulk.losing", { count: losing })}
            </p>
          ) : null}
          <ul className="bulk-list">
            {[...entry.countryIds]
              .sort((a, b) => name(a).localeCompare(name(b), i18n.language))
              .map((id) => {
                const flow = terms(id)?.flowPerQuarter ?? 0;
                const tier = t(`league.tiers.${entry.to}`);
                return (
                  <li key={id} className={flow < 0 ? "is-losing" : undefined}>
                    <span>{name(id)}</span>
                    <small>
                      {t(flow < 0 ? "league.bulk.loss" : "league.bulk.flow", {
                        cash: terms(id)?.investment ?? 0,
                        flow: Math.abs(flow),
                        tier,
                      })}
                    </small>
                  </li>
                );
              })}
          </ul>
          <div className="bulk-actions">
            <button
              type="button"
              className="action-button"
              data-testid="bulk-confirm"
              disabled={busy}
              onClick={() => {
                onAction({ type: "promoteLeagues", to: entry.to });
                setReviewing(null);
              }}
            >
              {t("league.bulk.confirm", {
                count: entry.countryIds.length,
                tier: t(`league.tiers.${entry.to}`),
              })}
            </button>
            <button type="button" className="flagship-back" onClick={() => setReviewing(null)}>
              {t("league.bulk.back")}
            </button>
          </div>
        </div>
      ) : (
        <div className="bulk-actions">
          {snapshot.bulkPromotions.map((item) => (
            <button
              type="button"
              key={item.to}
              className="action-button"
              data-testid={`bulk-${item.to}`}
              disabled={busy}
              onClick={() => setReviewing(item.to)}
            >
              {t("league.bulk.button", {
                count: item.countryIds.length,
                tier: t(`league.tiers.${item.to}`),
              })}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
