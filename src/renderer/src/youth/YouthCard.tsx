import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { Names } from "../../../content";
import type { Action, TurnSnapshot, YouthRow } from "../../../sim";
import { useTermVars } from "../identity/terms";
import "./youth.css";

/**
 * Youth programs (GDD v1.40, v1.42): one row a league, the seat first, then focus countries, then
 * programs kept after focus left (read-only). Each shows its level, a level being set up, upkeep,
 * the next level's price and why it cannot be bought. Building happens only on the offseason
 * screen, through a review step; elsewhere the card passes `readOnly`.
 */
export function YouthCard({
  snapshot,
  names,
  busy,
  onAction,
  readOnly = false,
}: {
  snapshot: TurnSnapshot;
  names: Names;
  busy: boolean;
  onAction: (action: Action) => void;
  readOnly?: boolean;
}) {
  const { t } = useTranslation();
  const [reviewing, setReviewing] = useState<string | null>(null);
  const rows = snapshot.youth;
  return (
    <section
      className="flagship-card youth-card"
      aria-labelledby="youth-heading"
      data-testid="youth-card"
    >
      <h2 id="youth-heading">{t("youth.heading")}</h2>
      <p className="flagship-empty">{t("youth.intro")}</p>
      {rows.length === 0 ? (
        <p className="flagship-empty">{t("youth.none")}</p>
      ) : (
        <ul className="youth-rows">
          {rows.map((row) => (
            <YouthRowItem
              key={row.countryId}
              row={row}
              snapshot={snapshot}
              name={names.countries[row.countryId] ?? row.countryId}
              busy={busy}
              readOnly={readOnly}
              reviewing={reviewing === row.countryId}
              onReview={(open) => setReviewing(open ? row.countryId : null)}
              onAction={onAction}
            />
          ))}
        </ul>
      )}
      {readOnly && <p className="flagship-empty">{t("youth.offseasonOnly")}</p>}
    </section>
  );
}

function YouthRowItem({
  row,
  snapshot,
  name,
  busy,
  readOnly,
  reviewing,
  onReview,
  onAction,
}: {
  row: YouthRow;
  snapshot: TurnSnapshot;
  name: string;
  busy: boolean;
  readOnly: boolean;
  reviewing: boolean;
  onReview: (open: boolean) => void;
  onAction: (action: Action) => void;
}) {
  const { t } = useTranslation();
  const nouns = useTermVars(snapshot.identity.terms)();
  const cash = snapshot.countries.find((c) => c.countryId === row.countryId)?.league?.cash ?? 0;
  const seat = row.countryId === snapshot.flagship.countryId;
  const { terms, blocker } = row;
  return (
    <li className="youth-row" data-testid="youth-row" data-country={row.countryId}>
      <p>
        <strong>{t(seat ? "youth.rowSeat" : "youth.row", { country: name })}</strong>{" "}
        {(row.cap > 0 || row.level > 0) && t("youth.level", { level: row.level, cap: row.cap })}
      </p>
      {row.level > 0 && <p>{t("youth.running", { upkeep: row.upkeep, lift: row.conversion })}</p>}
      {row.building ? (
        <p className="youth-building" data-testid="youth-building">
          {t("youth.building", {
            ...nouns,
            level: row.building.level,
            season: row.building.opensSeason,
          })}
        </p>
      ) : !row.operated ? (
        <p className="flagship-empty">{t("youth.kept")}</p>
      ) : row.cap === 0 ? (
        <p className="flagship-empty">{t("youth.closedTier")}</p>
      ) : terms === null ? (
        <p className="flagship-empty">{t("youth.top")}</p>
      ) : (
        <>
          <p data-testid="youth-next">
            {t("youth.next", {
              level: terms.level,
              price: terms.price,
              upkeep: terms.upkeep,
              lift: terms.conversion,
            })}
          </p>
          {readOnly ? null : reviewing && blocker === null ? (
            <div className="flagship-review" data-testid="youth-review">
              <p>
                {t("youth.review", {
                  ...nouns,
                  price: terms.price,
                  cash,
                  level: terms.level,
                  season: terms.opensSeason,
                  upkeep: terms.upkeep,
                })}
              </p>
              <p>{t("youth.reviewFuture")}</p>
              <div>
                <button
                  type="button"
                  className="action-button"
                  disabled={busy}
                  data-testid="youth-confirm"
                  onClick={() => {
                    onReview(false);
                    onAction({ type: "buildYouth", countryId: row.countryId });
                  }}
                >
                  {t("youth.confirm", { level: terms.level })}
                </button>
                <button type="button" className="flagship-back" onClick={() => onReview(false)}>
                  {t("youth.back")}
                </button>
              </div>
            </div>
          ) : (
            <>
              {blocker !== null && (
                <p className="flagship-empty" data-testid="youth-blocker">
                  {t(`youth.blockers.${blocker}`, { price: terms.price, cash })}
                </p>
              )}
              <button
                type="button"
                className="action-button"
                disabled={busy || blocker !== null}
                data-testid="youth-build"
                onClick={() => onReview(true)}
              >
                {t("youth.build", { level: terms.level })}
              </button>
            </>
          )}
        </>
      )}
    </li>
  );
}
