import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { Names } from "../../../content";
import type { Action, StarSnapshot, TurnSnapshot } from "../../../sim";

interface Props {
  snapshot: TurnSnapshot;
  names: Names;
  busy: boolean;
  clubName: (id: number) => string;
  onAction: (action: Action) => void;
}

// The flagship's stars (GDD v1.16): recorded facts only (name, club, age, birthplace, tallies,
// star since, final season) and the player's backing. Skill and star strength stay in the
// simulation. Backing and dropping go through applyAction after a review step; the simulation
// decides legality and price, and the panel shows its reasons.
export function StarsPanel({ snapshot, names, busy, clubName, onAction }: Props) {
  const { t } = useTranslation();
  const flagship = snapshot.flagship;
  const backing = flagship.backing;
  const country = (id: string) => names.countries[id] ?? id;
  const [review, setReview] = useState<{ id: number; kind: "back" | "drop" } | null>(null);
  const playerName = (id: number) => flagship.players.find((p) => p.id === id)?.name ?? "";

  return (
    <section
      className="flagship-card flagship-stars"
      aria-labelledby="flagship-stars-heading"
      data-testid="flagship-stars"
      data-slots={backing.slots}
      data-used={backing.used}
    >
      <div className="stars-heading">
        <h2 id="flagship-stars-heading">{t("flagship.stars.heading")}</h2>
        <div className="stars-slots">
          <span className="slot-pips" aria-hidden="true">
            {Array.from({ length: Math.max(backing.slots, backing.used) }, (_, index) => (
              <i
                // biome-ignore lint/suspicious/noArrayIndexKey: slots have no identity but position
                key={index}
                className={index < backing.used ? "used" : undefined}
                title={t(
                  index < backing.used ? "flagship.stars.slotUsed" : "flagship.stars.slotFree",
                )}
              />
            ))}
          </span>
          <span data-testid="flagship-stars-slots">
            {t("flagship.stars.slots", { count: backing.slots, used: backing.used })}
          </span>
        </div>
      </div>
      <p className="stars-intro">
        {t("flagship.stars.intro", { country: country(flagship.countryId) })}{" "}
        {t("flagship.stars.price", { price: backing.price })}
      </p>
      {backing.used > backing.slots && <p className="stars-over">{t("flagship.stars.over")}</p>}
      {flagship.stars.length === 0 ? (
        <p className="flagship-empty">{t("flagship.stars.none")}</p>
      ) : (
        <ul className="stars-list">
          {flagship.stars.map((star) => (
            <StarCard
              key={star.id}
              star={star}
              snapshot={snapshot}
              country={country}
              clubName={clubName}
              playerName={playerName}
              busy={busy}
              review={review?.id === star.id ? review.kind : null}
              onReview={(kind) => setReview(kind ? { id: star.id, kind } : null)}
              onAction={(action) => {
                setReview(null);
                onAction(action);
              }}
            />
          ))}
        </ul>
      )}
    </section>
  );
}

function StarCard({
  star,
  snapshot,
  country,
  clubName,
  playerName,
  busy,
  review,
  onReview,
  onAction,
}: {
  star: StarSnapshot;
  snapshot: TurnSnapshot;
  country: (id: string) => string;
  clubName: (id: number) => string;
  playerName: (id: number) => string;
  busy: boolean;
  review: "back" | "drop" | null;
  onReview: (kind: "back" | "drop" | null) => void;
  onAction: (action: Action) => void;
}) {
  const { t } = useTranslation();
  const flagship = snapshot.flagship;
  const backing = flagship.backing;
  const seat = country(flagship.countryId);
  const kind = star.backing ? "drop" : "back";
  const blocker = kind === "drop" ? star.dropBlocker : star.backBlocker;
  const blockerText =
    kind === "drop"
      ? star.dropBlocker && t(`flagship.stars.blockers.drop.${star.dropBlocker}`)
      : star.backBlocker &&
        t(`flagship.stars.blockers.back.${star.backBlocker}`, {
          country: seat,
          price: backing.price,
          pp: snapshot.pp,
        });
  const reasonId = `star-${star.id}-reason`;

  return (
    <li
      className={star.backing ? "star backed" : "star"}
      data-testid="flagship-star"
      data-player={star.id}
      data-backed={star.backing !== null}
    >
      <div className="star-title">
        <strong>{star.name}</strong>
        <span className="star-tags">
          {star.starSince !== null ? (
            <small className="tag">
              <span aria-hidden="true">&#9733;</span>{" "}
              {t("flagship.stars.starSince", { season: star.starSince })}
            </small>
          ) : (
            <small className="tag">{t("flagship.stars.successor")}</small>
          )}
          {star.finalSeason && (
            <small className="tag final" data-testid="flagship-star-final">
              {t("flagship.stars.finalSeason")}
            </small>
          )}
        </span>
      </div>
      <p className="star-meta">
        {t("flagship.stars.club", { club: clubName(star.clubId), age: star.age })}
        <br />
        {t("flagship.stars.born", { place: star.birthplace, country: country(star.countryId) })}
      </p>
      <dl className="star-tallies">
        <div>
          <dt>{t("flagship.stars.seasonTally")}</dt>
          <dd>
            {star.season
              ? t("flagship.stars.scores", {
                  count: star.season.scores,
                  matches: star.season.matches,
                })
              : t("flagship.stars.untallied")}
          </dd>
        </div>
        <div>
          <dt>{t("flagship.stars.careerTally")}</dt>
          <dd>
            {star.career.seasons === 0 ? (
              t("flagship.stars.rookie")
            ) : (
              <>
                {t("flagship.stars.scores", {
                  count: star.career.scores,
                  matches: star.career.matches,
                })}
                <small>{t("flagship.stars.careerSeasons", { count: star.career.seasons })}</small>
              </>
            )}
          </dd>
        </div>
      </dl>
      {star.backing && (
        <div className="star-influence">
          <span>{t("flagship.stars.influence")}</span>
          <meter
            min={0}
            max={1}
            value={star.backing.influence}
            aria-label={t("flagship.stars.influenceLabel", {
              name: star.name,
              value: star.backing.influence,
            })}
            data-testid="flagship-star-influence"
          />
          <b>{t("flagship.stars.influenceValue", { value: star.backing.influence })}</b>
          {star.backing.mentee !== null && (
            <small className="star-mentee">
              {t("flagship.stars.mentoring", { name: playerName(star.backing.mentee) })}
            </small>
          )}
        </div>
      )}
      {review ? (
        <div className="flagship-review" data-testid="flagship-star-review">
          {review === "back" ? (
            <p>
              {t("flagship.stars.reviewBack", {
                name: star.name,
                price: backing.price,
                country: seat,
              })}
            </p>
          ) : (
            <>
              <p>
                {t("flagship.stars.reviewDrop", {
                  name: star.name,
                  influence: star.backing?.influence ?? 0,
                })}
              </p>
              {(star.backing?.influence ?? 0) >= 1 && (
                <>
                  <p className="warning">
                    {t("flagship.stars.reviewDropFull", {
                      share: backing.dropHardcoreShare,
                      country: seat,
                    })}
                  </p>
                  {backing.dropPressure && (
                    <p className="warning">
                      {t("flagship.stars.reviewDropCard", {
                        card: t("events.cards.star-dropped.title"),
                        country: seat,
                        drain: 1 - backing.dropPressure.factor,
                        quarters: backing.dropPressure.quarters,
                      })}
                    </p>
                  )}
                </>
              )}
            </>
          )}
          <div>
            <button
              type="button"
              className="action-button"
              disabled={busy || blocker !== null}
              data-testid="flagship-star-confirm"
              onClick={() =>
                onAction(
                  review === "back"
                    ? { type: "backStar", playerId: star.id }
                    : { type: "dropStar", playerId: star.id },
                )
              }
            >
              {t(review === "back" ? "flagship.stars.confirmBack" : "flagship.stars.confirmDrop")}
            </button>
            <button type="button" className="flagship-back" onClick={() => onReview(null)}>
              {t("flagship.stars.cancel")}
            </button>
          </div>
        </div>
      ) : (
        <div className="star-action">
          <button
            type="button"
            className={kind === "drop" ? "flagship-drop" : "action-button"}
            disabled={busy || blocker !== null}
            aria-describedby={blockerText ? reasonId : undefined}
            data-testid={`flagship-star-${kind}`}
            onClick={() => onReview(kind)}
          >
            {t(kind === "drop" ? "flagship.stars.drop" : "flagship.stars.back", {
              name: star.name,
            })}
          </button>
          {blockerText && (
            <small id={reasonId} className="star-reason" data-testid="flagship-star-reason">
              {blockerText}
            </small>
          )}
        </div>
      )}
    </li>
  );
}

/** The flagship country's backed stars, named in its map tooltip. Nothing when none is backed. */
export function BackedStars({ stars }: { stars: StarSnapshot[] }) {
  const { t } = useTranslation();
  const backed = stars.filter((star) => star.backing !== null).map((star) => star.name);
  if (backed.length === 0) return null;
  return (
    <p className="quick-stars" data-testid="map-tooltip-stars">
      <span aria-hidden="true">&#9733;</span>{" "}
      {t("map.backedStars", { count: backed.length, names: backed })}
    </p>
  );
}
