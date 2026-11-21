import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { Names, TicketStance } from "../../../content";
import type { Action, TurnSnapshot } from "../../../sim";
import "./tickets.css";

/**
 * Ticket prices at the seat (GDD v1.40): the stance in force, the one asked for next season, and
 * the three stances with what each does to gate and conversion. A raise goes through a review
 * that states the hardcore fans it turns casual. Setting happens only on the offseason screen;
 * the Flagship tab passes `readOnly`.
 */
export function TicketsCard({
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
  const [reviewing, setReviewing] = useState<TicketStance | null>(null);
  const { tickets, countryId } = snapshot.flagship;
  const country = names.countries[countryId] ?? countryId;
  const stanceName = (stance: TicketStance) => t(`tickets.stances.${stance}`);
  const review = tickets.options.find((option) => option.stance === reviewing);
  const ask = (stance: TicketStance) => onAction({ type: "setTickets", stance });

  return (
    <section
      className="flagship-card tickets-card"
      aria-labelledby="tickets-heading"
      data-testid="tickets-card"
      data-stance={tickets.stance}
    >
      <h2 id="tickets-heading">{t("tickets.heading")}</h2>
      <p>{t("tickets.now", { stance: stanceName(tickets.stance), country })}</p>
      {tickets.pending !== null && (
        <p data-testid="tickets-pending">
          {t("tickets.pending", { stance: stanceName(tickets.pending) })}
        </p>
      )}
      <ul className="tickets-options">
        {tickets.options.map((option) => (
          <li key={option.stance}>
            <strong>{stanceName(option.stance)}</strong>{" "}
            {t("tickets.effects", { gate: option.gate, conversion: option.conversion })}
          </li>
        ))}
      </ul>
      {readOnly ? (
        <p className="flagship-empty">{t("tickets.offseasonOnly")}</p>
      ) : tickets.blocker !== null ? (
        <p className="flagship-empty" data-testid="tickets-blocker">
          {t(`tickets.blockers.${tickets.blocker}`)}
        </p>
      ) : review ? (
        <div className="flagship-review" data-testid="tickets-review">
          <p>
            {t("tickets.review", {
              stance: stanceName(review.stance),
              count: review.demoted,
            })}
          </p>
          <div>
            <button
              type="button"
              className="action-button"
              disabled={busy}
              data-testid="tickets-confirm"
              onClick={() => {
                setReviewing(null);
                ask(review.stance);
              }}
            >
              {t("tickets.confirm", { stance: stanceName(review.stance) })}
            </button>
            <button type="button" className="flagship-back" onClick={() => setReviewing(null)}>
              {t("tickets.back")}
            </button>
          </div>
        </div>
      ) : (
        <div className="tickets-choices">
          {tickets.options.map((option) => {
            const asked = (tickets.pending ?? tickets.stance) === option.stance;
            return (
              <button
                key={option.stance}
                type="button"
                className="action-button"
                disabled={busy || asked}
                aria-pressed={asked}
                data-testid="tickets-choice"
                data-stance={option.stance}
                // A raise is reviewed first; a cut, or going back to the stance in force, is free.
                onClick={() =>
                  option.demoted > 0 ? setReviewing(option.stance) : ask(option.stance)
                }
              >
                {stanceName(option.stance)}
              </button>
            );
          })}
        </div>
      )}
    </section>
  );
}
