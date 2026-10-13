import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { Action, TurnSnapshot } from "../../../sim";
import "./championship.css";

// The World Championship on the offseason screen (GDD v1.37): founded and named here for PP,
// then, in the offseason before each tournament, its host is picked from the bids.
export function ChampionshipCard({
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
  const { t } = useTranslation();
  const championship = snapshot.worldChampionship;
  const suggested = t("championship.defaultName", { sport: snapshot.identity.sportName });
  const [name, setName] = useState("");
  const [reviewing, setReviewing] = useState(false);
  const [picking, setPicking] = useState<string | null>(null);
  const tidy = (name.trim() === "" ? suggested : name).trim().replace(/\s+/g, " ");
  const valid =
    tidy.length >= championship.nameLimits.min && tidy.length <= championship.nameLimits.max;
  const { founded } = championship;

  return (
    <section
      className="flagship-card"
      aria-labelledby="championship-heading"
      data-testid="championship"
      data-founded={founded !== null}
    >
      <h2 id="championship-heading">{founded?.name ?? t("championship.heading")}</h2>
      {founded === null && (
        <>
          <p>
            {t("championship.pitch", {
              count: championship.everySeasons,
              teams: championship.teamsNeeded,
            })}
          </p>
          <p data-testid="championship-teams">
            {t("championship.teams", {
              count: championship.teams,
              needed: championship.teamsNeeded,
            })}
          </p>
          {championship.blocker !== null && (
            <p className="flagship-empty" data-testid="championship-blocker">
              {t(`championship.blockers.${championship.blocker}`, { price: championship.price })}
            </p>
          )}
          {championship.blocker === null && !reviewing && (
            <form
              className="flagship-picker"
              onSubmit={(event) => {
                event.preventDefault();
                if (valid) setReviewing(true);
              }}
            >
              <label>
                <span>{t("championship.nameLabel")}</span>
                <input
                  value={name}
                  maxLength={championship.nameLimits.max}
                  placeholder={suggested}
                  disabled={busy}
                  data-testid="championship-input"
                  onChange={(event) => setName(event.currentTarget.value)}
                />
              </label>
              <button
                type="submit"
                className="action-button"
                disabled={busy || !valid}
                data-testid="championship-found"
              >
                {t("championship.found", { price: championship.price })}
              </button>
            </form>
          )}
          {championship.blocker === null && reviewing && (
            <div className="flagship-review" data-testid="championship-review">
              <p>
                {t("championship.review", {
                  name: tidy,
                  price: championship.price,
                  count: championship.everySeasons,
                })}
              </p>
              <div>
                <button
                  type="button"
                  className="action-button"
                  disabled={busy || !valid}
                  data-testid="championship-confirm"
                  onClick={() => {
                    onAction({ type: "foundChampionship", name: tidy });
                    setReviewing(false);
                    setName("");
                  }}
                >
                  {t("championship.confirm")}
                </button>
                <button type="button" className="flagship-back" onClick={() => setReviewing(false)}>
                  {t("championship.cancel")}
                </button>
              </div>
            </div>
          )}
        </>
      )}
      {founded !== null && (
        <>
          <p data-testid="championship-next">
            {championship.nextYear === null
              ? t("championship.founded", { year: founded.year })
              : t("championship.next", { year: championship.nextYear, founded: founded.year })}
          </p>
          {championship.hostId !== null && (
            <p data-testid="championship-host">
              {t("championship.host", { country: country(championship.hostId) })}
            </p>
          )}
          {championship.bids.length > 0 && (
            <>
              <p>{t("championship.bidsIntro", { count: championship.bids.length })}</p>
              <ul className="championship-bids" data-testid="championship-bids">
                {championship.bids.map((bid) => (
                  <li key={bid.countryId}>
                    <span>
                      <strong>{country(bid.countryId)}</strong>{" "}
                      <small>
                        {t("map.wealthLevel", { level: t(`map.wealthLevels.${bid.wealthLevel}`) })}
                      </small>
                    </span>
                    {picking === bid.countryId ? (
                      <span>
                        <button
                          type="button"
                          className="action-button"
                          disabled={busy || !championship.canPick}
                          data-testid="championship-pick-confirm"
                          onClick={() => {
                            onAction({ type: "pickHost", countryId: bid.countryId });
                            setPicking(null);
                          }}
                        >
                          {t("championship.pickConfirm")}
                        </button>
                        <button
                          type="button"
                          className="flagship-back"
                          onClick={() => setPicking(null)}
                        >
                          {t("championship.cancel")}
                        </button>
                      </span>
                    ) : (
                      <button
                        type="button"
                        className="action-button"
                        disabled={busy || !championship.canPick}
                        data-testid="championship-pick"
                        onClick={() => setPicking(bid.countryId)}
                      >
                        {t("championship.pick")}
                      </button>
                    )}
                  </li>
                ))}
              </ul>
              <p className="flagship-empty">{t("championship.bidsNote")}</p>
            </>
          )}
          {championship.hostId === null && championship.bids.length === 0 && (
            <p className="flagship-empty">{t("championship.bidsLater")}</p>
          )}
          {championship.tournaments.length > 0 && (
            <p data-testid="championship-past">
              {t("championship.past", {
                hosts: championship.tournaments.map((tournament) =>
                  t("championship.pastOne", {
                    year: tournament.year,
                    champion: country(tournament.championId),
                    country: country(tournament.hostId),
                  }),
                ),
              })}
            </p>
          )}
        </>
      )}
    </section>
  );
}
