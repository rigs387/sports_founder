import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { Names } from "../../../content";
import type { Action, TurnSnapshot } from "../../../sim";
import { useTraditionWords } from "../culture/traditions";
import { useTermVars } from "../identity/terms";
import "./venues.css";

/**
 * The seat's venue (GDD v1.30): its level, how many hardcore fans it seats against how many there
 * are, the record crowd, a level being built, and the next level's terms. Building happens only on
 * the offseason screen, through a review step; the Flagship tab passes `readOnly`.
 */
export function VenueCard({
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
  const { t, i18n } = useTranslation();
  const nouns = useTermVars(snapshot.identity.terms)();
  const words = useTraditionWords(snapshot);
  const [reviewing, setReviewing] = useState(false);
  const flagship = snapshot.flagship;
  const seat = snapshot.countries.find((c) => c.countryId === flagship.countryId);
  const league = seat?.league;
  const country = names.countries[flagship.countryId] ?? flagship.countryId;
  if (!seat || !league) {
    return (
      <section className="flagship-card" aria-labelledby="venue-heading">
        <h2 id="venue-heading">{t("venue.heading")}</h2>
        <p className="flagship-empty">{t("venue.noLeague", { country })}</p>
      </section>
    );
  }
  const { venue } = league;
  const { terms, blocker } = flagship.venue;
  const overflow = venue.turnedAway;
  const filled = venue.groundSize > 0 ? Math.min(1, venue.matchCrowd / venue.groundSize) : 0;
  const famous = snapshot.culture.traditions.filter(
    (tradition) =>
      tradition.type === "venue" &&
      tradition.lost === null &&
      tradition.countryId === flagship.countryId,
  );
  const promotion = league.actions.promoteLeague.blocker;

  return (
    <section
      className="flagship-card venue-card"
      aria-labelledby="venue-heading"
      data-testid="venue-card"
      data-level={venue.level}
    >
      <h2 id="venue-heading">{t("venue.heading")}</h2>
      <p>
        <strong>{t("venue.level", { level: venue.level })}</strong>{" "}
        {t("venue.capacity", { ...nouns, ground: venue.groundSize })}
      </p>
      {/* The numbers are in the line below; the bar only shows them. */}
      <div
        className={overflow > 0 ? "venue-meter venue-meter-full" : "venue-meter"}
        aria-hidden="true"
      >
        <span style={{ width: `${filled * 100}%` }} />
      </div>
      <p className={overflow > 0 ? "warning" : undefined} data-testid="venue-seated">
        {t(overflow > 0 ? "venue.soldOut" : "venue.attendance", {
          ...nouns,
          crowd: venue.matchCrowd,
          season: venue.seasonAttendance,
          overflow,
          hardcore: seat.hardcore,
        })}
      </p>
      {venue.recordMatchCrowd !== null && (
        <p className="venue-record">{t("venue.record", { crowd: venue.recordMatchCrowd })}</p>
      )}
      {promotion?.kind === "venue" && (
        <p className="warning" data-testid="venue-promotion">
          {t("venue.promotion", {
            tier: t(`league.tiers.${promotion.to}`),
            level: promotion.needed,
          })}
        </p>
      )}
      {venue.building ? (
        <p className="venue-building" data-testid="venue-building">
          {t("venue.building", {
            ...nouns,
            level: venue.building.level,
            season: venue.building.opensSeason,
          })}
        </p>
      ) : terms === null ? (
        <p className="flagship-empty">{t("venue.top")}</p>
      ) : (
        <>
          <p data-testid="venue-next">
            {t("venue.next", {
              ...nouns,
              level: terms.level,
              ground: terms.groundSize,
              price: terms.price,
              count: terms.seasons,
              upkeep: terms.upkeep,
            })}
          </p>
          {terms.modernizes && (
            <p className="warning" data-testid="venue-tears-down">
              {t("venue.tearsDown")}
            </p>
          )}
          {readOnly ? (
            <p className="flagship-empty">{t("venue.offseasonOnly")}</p>
          ) : reviewing && blocker === null ? (
            <div className="flagship-review" data-testid="venue-review">
              <p>
                {t("venue.review", {
                  ...nouns,
                  price: terms.price,
                  cash: league.cash,
                  level: terms.level,
                  season: terms.opensSeason,
                })}
              </p>
              {terms.modernizes && (
                <p className="warning" data-testid="venue-modernize">
                  {famous.length > 0
                    ? t("venue.modernize", {
                        level: terms.level,
                        names: new Intl.ListFormat(i18n.language).format(famous.map(words.name)),
                      })
                    : t("venue.modernizeNone", { level: terms.level })}
                </p>
              )}
              <div>
                <button
                  type="button"
                  className="action-button"
                  disabled={busy}
                  data-testid="venue-confirm"
                  onClick={() => {
                    setReviewing(false);
                    onAction({ type: "buildVenue" });
                  }}
                >
                  {t("venue.confirm", { level: terms.level })}
                </button>
                <button type="button" className="flagship-back" onClick={() => setReviewing(false)}>
                  {t("venue.back")}
                </button>
              </div>
            </div>
          ) : (
            <>
              {blocker !== null && (
                <p className="flagship-empty" data-testid="venue-blocker">
                  {t(`venue.blockers.${blocker}`, { price: terms.price, cash: league.cash })}
                </p>
              )}
              <button
                type="button"
                className="action-button"
                disabled={busy || blocker !== null}
                data-testid="venue-build"
                onClick={() => setReviewing(true)}
              >
                {t("venue.build", { level: terms.level })}
              </button>
            </>
          )}
        </>
      )}
    </section>
  );
}
