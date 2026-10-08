import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { Names } from "../../../content";
import type { Action, CountrySnapshot, TurnSnapshot } from "../../../sim";
import { TrophyCard } from "../culture/TrophyCard";
import { DealsPanel } from "../deals/DealsPanel";
import { Seat } from "../flagship/FlagshipScreen";
import { StarsPanel } from "../flagship/StarsPanel";
import { AmendRules } from "../identity/AmendRules";
import { useTermVars } from "../identity/terms";
import { FrontPage } from "../press/FrontPage";
import { VenueCard } from "../venues/VenueCard";
import "../flagship/flagship.css";
import "./offseason.css";

interface Props {
  snapshot: TurnSnapshot;
  names: Names;
  busy: boolean;
  active: boolean;
  onAction: (action: Action) => void;
  /** Back to the world map, where the season's decisions wait. */
  onWorld: () => void;
}

// The offseason (GDD v1.24): once a year, after the flagship season ends, one screen holds the
// season in review and then all league business — stars, deals (GDD v1.28), the rules, the venue
// (GDD v1.30), promotions, the seat and the trophy — each priced against the PP on hand. The
// tabs keep read-only views; legality and prices stay in the simulation.
export function OffseasonScreen({ snapshot, names, busy, active, onAction, onWorld }: Props) {
  const { t } = useTranslation();
  const flagship = snapshot.flagship;
  const termVars = useTermVars(snapshot.identity.terms);
  const nouns = termVars();
  const country = (id: string) => names.countries[id] ?? id;
  const clubs = new Map(flagship.clubs.map((club) => [club.id, club]));
  const clubName = (id: number) => {
    const club = clubs.get(id);
    return club ? t("flagship.club", { place: club.place, nickname: club.nickname }) : "";
  };
  const decisions = snapshot.events.filter((event) => event.kind === "decision").length;

  return (
    <section
      className="offseason-screen"
      hidden={!active}
      aria-labelledby="offseason-title"
      data-testid="offseason-screen"
      data-open={snapshot.offseasonOpen}
    >
      <div className="offseason-heading">
        <div>
          <span className="eyebrow">{t("offseason.eyebrow")}</span>
          <h1 id="offseason-title">
            {t("offseason.title", { year: snapshot.year, country: country(flagship.countryId) })}
          </h1>
        </div>
        <p className="offseason-pp" data-testid="offseason-pp">
          {t("offseason.pp", { pp: snapshot.pp })}
        </p>
      </div>
      {!snapshot.offseasonOpen && (
        <p className="flagship-paused" role="status">
          {t("offseason.closed", nouns)}
        </p>
      )}
      <section className="flagship-card offseason-review" aria-labelledby="offseason-review">
        <h2 id="offseason-review">{t("offseason.review.heading", nouns)}</h2>
        <FrontPage snapshot={snapshot} clubName={clubName} />
        {decisions > 0 && (
          <p className="offseason-decisions">
            {t("offseason.review.decisions", { count: decisions })}{" "}
            <button type="button" className="flagship-back" onClick={onWorld}>
              {t("offseason.review.toMap")}
            </button>
          </p>
        )}
      </section>
      <div className="offseason-business">
        <div className="offseason-column">
          <StarsPanel
            snapshot={snapshot}
            names={names}
            busy={busy}
            clubName={clubName}
            onAction={onAction}
          />
          <DealsPanel snapshot={snapshot} names={names} busy={busy} onAction={onAction} />
          <div className="flagship-card">
            <AmendRules snapshot={snapshot} names={names} busy={busy} onAction={onAction} />
          </div>
        </div>
        <div className="offseason-column">
          <VenueCard snapshot={snapshot} names={names} busy={busy} onAction={onAction} />
          <Promotions snapshot={snapshot} country={country} busy={busy} onAction={onAction} />
          <Seat snapshot={snapshot} names={names} busy={busy} onAction={onAction} />
          <TrophyCard snapshot={snapshot} busy={busy} onAction={onAction} />
        </div>
      </div>
    </section>
  );
}

/** How many qualifying leagues show before "Show all". */
const PROMOTIONS_SHOWN = 5;

/**
 * Leagues that qualify for promotion this offseason, paid from the league's own cash: the biggest
 * followings first.
 */
function Promotions({
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
  const [confirming, setConfirming] = useState<string | null>(null);
  const [all, setAll] = useState(false);
  const ready = snapshot.countries
    .filter(
      (entry): entry is CountrySnapshot & { league: NonNullable<CountrySnapshot["league"]> } =>
        entry.league?.actions.promoteLeague.blocker === null,
    )
    .sort((a, b) => b.fandomScore - a.fandomScore || a.countryId.localeCompare(b.countryId));
  const shown = all ? ready : ready.slice(0, PROMOTIONS_SHOWN);
  return (
    <section
      className="flagship-card"
      aria-labelledby="offseason-promotions"
      data-testid="offseason-promotions"
    >
      <h2 id="offseason-promotions">{t("offseason.promotions.heading")}</h2>
      {ready.length === 0 ? (
        <p className="flagship-empty">{t("offseason.promotions.none")}</p>
      ) : (
        <ul className="offseason-promotions">
          {shown.map((entry) => {
            const terms = entry.league.actions.promoteLeague.terms;
            if (!terms) return null;
            const from = t(`league.tiers.${entry.league.tier}`);
            const to = t(`league.tiers.${terms.to}`);
            return (
              <li key={entry.countryId} data-country={entry.countryId}>
                <div>
                  <strong>{country(entry.countryId)}</strong>
                  <small>{t("offseason.promotions.step", { from, to })}</small>
                  <small>
                    {t("offseason.promotions.cost", {
                      cost: terms.cost,
                      cash: entry.league.cash,
                      running: terms.runningCostPerQuarter,
                    })}
                  </small>
                  {terms.revenuePerQuarter < terms.runningCostPerQuarter && (
                    <small className="warning" data-testid="offseason-promotion-shortfall">
                      {t("offseason.promotions.shortfall", {
                        income: terms.revenuePerQuarter,
                        gap: terms.runningCostPerQuarter - terms.revenuePerQuarter,
                      })}
                    </small>
                  )}
                </div>
                {confirming === entry.countryId ? (
                  <div className="offseason-confirm">
                    <button
                      type="button"
                      className="action-button"
                      disabled={busy}
                      data-testid="offseason-promote-confirm"
                      onClick={() => {
                        setConfirming(null);
                        onAction({ type: "promoteLeague", countryId: entry.countryId });
                      }}
                    >
                      {t("offseason.promotions.confirm", { to })}
                    </button>
                    <button
                      type="button"
                      className="flagship-back"
                      onClick={() => setConfirming(null)}
                    >
                      {t("offseason.promotions.cancel")}
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    className="action-button"
                    disabled={busy}
                    data-testid="offseason-promote"
                    onClick={() => setConfirming(entry.countryId)}
                  >
                    {t("offseason.promotions.promote", { to })}
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {ready.length > PROMOTIONS_SHOWN && (
        <button
          type="button"
          className="flagship-back"
          data-testid="offseason-promotions-all"
          onClick={() => setAll(!all)}
        >
          {t(all ? "offseason.promotions.fewer" : "offseason.promotions.all", {
            count: ready.length,
          })}
        </button>
      )}
    </section>
  );
}
