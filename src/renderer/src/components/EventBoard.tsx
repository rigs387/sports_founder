import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { EventEffect } from "../../../content";
import type { EventRecord } from "../../../sim";
import { useGameStore } from "../state/game-store";
import { ActionFeedback } from "./ActionFeedback";
import "./events.css";

/** Names and numbers a star effect's line needs (GDD v1.16). */
interface StarValues {
  candidate?: string;
  cash?: number;
}

function Effect({ effect, star = {} }: { effect: EventEffect; star?: StarValues }) {
  const { t } = useTranslation();
  const { snapshot } = useGameStore();
  if (effect.type === "starHonors" || effect.type === "starMentor" || effect.type === "starKeep") {
    const stars = snapshot?.flagship.starRules;
    return (
      <li>
        {t(`events.effects.${effect.type}`, {
          seasons: stars?.afterglowSeasons ?? 0,
          share: stars?.mentorShare ?? 0,
          candidate: star.candidate ?? "",
          cash: star.cash ?? 0,
        })}
      </li>
    );
  }
  if (effect.type === "conversion" || effect.type === "spread")
    return (
      <li className={effect.factor < 1 ? "event-tradeoff" : undefined}>
        {t(`events.effects.${effect.type}`, {
          target: t(`events.targets.${effect.target}`),
          value: effect.factor - 1,
          quarters: effect.quarters,
        })}
      </li>
    );
  if (effect.type === "pp") return <li>{t("events.effects.pp", { amount: effect.amount })}</li>;
  if (effect.type === "leagueHealth")
    return <li>{t(effect.steps > 0 ? "events.effects.healthUp" : "events.effects.healthDown")}</li>;
  if (effect.type === "clubRating")
    return <li>{t(`events.effects.clubRating_${effect.target}`, { count: effect.steps })}</li>;
  return (
    <li className={effect.type === "hardcoreDemotion" ? "event-tradeoff" : undefined}>
      {t(`events.effects.${effect.type === "fanShift" ? effect.target : effect.type}`, {
        share: effect.share,
      })}
    </li>
  );
}

export function EventBoard() {
  const { t } = useTranslation();
  const { snapshot, names, status, dispatchAction } = useGameStore();
  const dialog = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<"pending" | "history">("pending");
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [review, setReview] = useState<string | null>(null);
  const busy = status !== "ready";
  useEffect(() => {
    if (open) dialog.current?.showModal();
    else dialog.current?.close();
  }, [open]);
  useEffect(() => {
    if (review) dialog.current?.querySelector<HTMLButtonElement>(".event-confirm button")?.focus();
  }, [review]);
  if (!snapshot) return null;
  const pending = snapshot.events;
  const history = [...snapshot.eventHistory].reverse();
  const decisions = pending.filter((event) => event.kind === "decision").length;
  const selected =
    pending.find((e) => e.id === selectedId) ?? history.find((e) => e.id === selectedId);
  const current = pending.find((e) => e.id === selectedId);
  const choice = current?.choices.find((c) => c.id === review);
  const country = (id: string) => names?.countries[id] ?? id;
  const club = (id: number | undefined) => {
    const found = snapshot.flagship.clubs.find((c) => c.id === id);
    return found ? t("flagship.club", { place: found.place, nickname: found.nickname }) : "";
  };
  const player = (id: number | null | undefined) =>
    snapshot.flagship.players.find((p) => p.id === id)?.name ?? "";
  // Star cards (GDD v1.16) name the player and clubs from the record.
  const starText = (event: EventRecord) => {
    const star = event.facts.star;
    if (!star) return {};
    return {
      player: player(star.playerId),
      club: club(star.clubId),
      otherClub: club(star.otherClubId ?? undefined),
      candidate: player(star.candidateId),
      season: star.season,
      count: star.scores,
      matches: star.matches,
      seasons: star.seasons,
      share: star.clubScores > 0 ? star.scores / star.clubScores : 0,
      context: star.candidateId === null ? undefined : "mentor",
    };
  };
  // Season cards (GDD v1.15) name the real clubs from the record; their text varies by format.
  const seasonText = (event: EventRecord) => {
    const season = event.facts.season;
    if (!season) return starText(event);
    return {
      champion: club(season.championId),
      runnerUp: club(season.runnerUpId),
      season: season.season,
      streak: season.streak,
      count: season.pointsGap,
      context:
        season.finalMargin === null
          ? "european"
          : season.finalMargin === 0
            ? "deciders"
            : "american",
    };
  };
  const title = (event: EventRecord) =>
    t(`events.cards.${event.templateId}.title`, {
      country: country(event.countryId),
      ...seasonText(event),
    });
  const chooseRecord = (event: EventRecord) => {
    setSelectedId(event.id);
    setReview(null);
    const moment = pending.find((p) => p.id === event.id && p.kind === "moment");
    if (moment && !busy && !snapshot.outcome)
      void dispatchAction({ type: "collectMoment", eventId: event.id });
  };
  const close = () => {
    setOpen(false);
    setReview(null);
  };
  return (
    <>
      <button
        type="button"
        className={`events-launcher${pending.length ? " has-events" : ""}`}
        data-testid="events-open"
        data-pending={pending.length}
        data-decisions={decisions}
        onClick={() => {
          setOpen(true);
          const first = pending.find((e) => e.kind === "decision") ?? pending[0] ?? history[0];
          setTab(pending.length ? "pending" : "history");
          if (first) chooseRecord(first);
        }}
      >
        <span className="events-badge" aria-hidden="true">
          {pending.length || "✦"}
        </span>
        <span>
          <strong>{t("events.launcher")}</strong>
          <small>
            {t(decisions ? "events.defaultHint" : "events.momentHint", {
              count: decisions || pending.length,
            })}
          </small>
        </span>
      </button>
      <dialog
        ref={dialog}
        className="event-board"
        data-testid="event-board"
        data-modifiers={snapshot.eventModifiers.length}
        aria-labelledby="events-title"
        onCancel={(event) => {
          event.preventDefault();
          close();
        }}
      >
        <header className="event-board-header">
          <div>
            <span className="eyebrow">{t("events.eyebrow")}</span>
            <h2 id="events-title">{t("events.heading")}</h2>
          </div>
          <div className="event-board-date">
            {t("turn.label", { turn: snapshot.turn })}
            <small>
              {t("turn.date", { quarter: snapshot.quarterOfYear, year: snapshot.year })}
            </small>
          </div>
          <button
            type="button"
            className="icon-button"
            data-testid="events-close"
            aria-label={t("events.close")}
            onClick={close}
          >
            &times;
          </button>
        </header>
        <div className="event-board-body">
          <aside className="event-inbox">
            <fieldset className="event-tabs" aria-label={t("events.sections")}>
              <button
                type="button"
                aria-pressed={tab === "pending"}
                onClick={() => setTab("pending")}
              >
                {t("events.pending", { count: pending.length })}
              </button>
              <button
                type="button"
                aria-pressed={tab === "history"}
                data-testid="events-history"
                onClick={() => setTab("history")}
              >
                {t("events.history")}
              </button>
            </fieldset>
            {(tab === "pending" ? pending : history).map((event) => (
              <button
                type="button"
                key={event.id}
                className={`event-ticket${selectedId === event.id ? " selected" : ""}`}
                aria-pressed={selectedId === event.id}
                data-event-id={event.id}
                data-event-template={event.templateId}
                data-event-kind={"kind" in event ? event.kind : "history"}
                onClick={() => chooseRecord(event)}
              >
                <small>{country(event.countryId)}</small>
                <strong>{title(event)}</strong>
                <span>
                  {event.resolution
                    ? t("events.recordedTurn", { turn: event.turn })
                    : t(
                        "kind" in event && event.kind === "moment"
                          ? "events.moment"
                          : "events.decision",
                      )}
                </span>
              </button>
            ))}
            {(tab === "pending" ? pending : history).length === 0 && (
              <p className="event-empty">{t("events.empty")}</p>
            )}
            <p className="event-inbox-note">{t("events.inboxNote")}</p>
          </aside>
          <section
            className="event-story"
            data-testid="event-story"
            data-event-id={selected?.id}
            data-resolved={!!selected?.resolution}
          >
            {selected ? (
              <>
                <div
                  className={`event-story-card${current?.tone === "pressure" ? " is-pressure" : ""}`}
                >
                  <div className="event-card-top">
                    <span>{country(selected.countryId)}</span>
                    <b>{t("events.edition", { turn: selected.turn })}</b>
                  </div>
                  <div className="event-stamp" aria-hidden="true">
                    {current?.tone === "pressure" ? "!" : "✦"}
                  </div>
                  <span className="eyebrow">
                    {t(
                      selected.resolution
                        ? "events.record"
                        : current?.kind === "moment"
                          ? "events.moment"
                          : "events.decision",
                    )}
                  </span>
                  <h3>{title(selected)}</h3>
                  <p>
                    {t(`events.cards.${selected.templateId}.body`, {
                      country: country(selected.countryId),
                      fans: selected.facts.casual + selected.facts.hardcore,
                      hardcore: selected.facts.hardcore,
                      rival: names?.sports[selected.facts.rivalId ?? ""] ?? "",
                      health: selected.facts.health
                        ? t(`league.health.${selected.facts.health}`)
                        : "",
                      tier: selected.facts.leagueTier
                        ? t(`league.tiers.${selected.facts.leagueTier}`)
                        : "",
                      ...seasonText(selected),
                    })}
                  </p>
                  {selected.facts.season?.championPlayerId != null && (
                    <p>
                      {t("events.seasonLeader", {
                        player: player(selected.facts.season.championPlayerId),
                        champion: club(selected.facts.season.championId),
                      })}
                    </p>
                  )}
                  {selected.facts.season?.topScorerId != null && (
                    <p>
                      {t("events.seasonScorer", {
                        player: player(selected.facts.season.topScorerId),
                        count: selected.facts.season.topScorerScores ?? 0,
                      })}
                    </p>
                  )}
                  <div className="event-facts">
                    <span>
                      {t("events.fans", { count: selected.facts.casual + selected.facts.hardcore })}
                    </span>
                    <span>{t("events.hardcore", { count: selected.facts.hardcore })}</span>
                  </div>
                </div>
                {current?.kind === "moment" && (
                  <div className="event-receipt">
                    <ul>
                      {current.effects.map((effect) => (
                        <Effect effect={effect} key={JSON.stringify(effect)} />
                      ))}
                    </ul>
                    <button
                      type="button"
                      className="action-button"
                      disabled={busy || !!snapshot.outcome}
                      onClick={() =>
                        void dispatchAction({ type: "collectMoment", eventId: current.id })
                      }
                    >
                      {t("events.collect")}
                    </button>
                  </div>
                )}
                {selected.resolution && (
                  <div className="event-receipt" role="status" data-testid="event-resolved">
                    <strong>
                      {selected.resolution.choiceId
                        ? t(
                            `events.cards.${selected.templateId}.choices.${selected.resolution.choiceId}`,
                          )
                        : t("events.collected")}
                    </strong>
                    <p>
                      {t(
                        selected.resolution.automatic
                          ? "events.autoResolution"
                          : "events.manualResolution",
                        {
                          turn: selected.resolution.turn,
                          cost: selected.resolution.cost,
                          gained: selected.resolution.ppGained,
                        },
                      )}
                    </p>
                  </div>
                )}
                {current?.kind === "decision" && (
                  <>
                    {current.arrivalEffects.length > 0 && (
                      <div className="event-receipt event-arrived" data-testid="event-arrived">
                        <strong>{t("events.arrived")}</strong>
                        <ul>
                          {current.arrivalEffects.map((effect) => (
                            <Effect effect={effect} key={JSON.stringify(effect)} />
                          ))}
                        </ul>
                      </div>
                    )}
                    <div className="event-choices">
                      {current.choices.map((option) => (
                        <article
                          className={option.id === review ? "reviewing" : ""}
                          key={option.id}
                          data-choice={option.id}
                          data-cost={option.cost}
                        >
                          <header>
                            <h4>{t(`events.cards.${current.templateId}.choices.${option.id}`)}</h4>
                            <b>
                              {t(option.cost ? "events.cost" : "events.free", {
                                amount: option.cost,
                              })}
                            </b>
                          </header>
                          <ul>
                            {option.effects.length ? (
                              option.effects.map((effect) => (
                                <Effect
                                  effect={effect}
                                  key={JSON.stringify(effect)}
                                  star={{
                                    candidate: player(current.facts.star?.candidateId),
                                    cash: option.leagueCash,
                                  }}
                                />
                              ))
                            ) : (
                              <li>{t("events.noChange")}</li>
                            )}
                          </ul>
                          {option.blocker && (
                            <p className="event-tradeoff">
                              {t(`events.blockers.${option.blocker}`)}
                            </p>
                          )}
                          <button
                            type="button"
                            className="action-button"
                            disabled={busy || !!option.blocker}
                            onClick={() => setReview(option.id)}
                          >
                            {t("events.review")}
                          </button>
                        </article>
                      ))}
                    </div>
                    <p className="event-default">
                      {t("events.default", {
                        choice: t(
                          `events.cards.${current.templateId}.choices.${current.defaultChoice}`,
                        ),
                      })}
                    </p>
                    {choice && (
                      <fieldset
                        className="event-confirm"
                        data-testid="event-confirm"
                        aria-label={t("events.confirmHeading")}
                      >
                        <strong>
                          {t("events.confirm", {
                            choice: t(`events.cards.${current.templateId}.choices.${choice.id}`),
                            country: country(current.countryId),
                            amount: choice.cost,
                          })}
                        </strong>
                        <div>
                          <button
                            type="button"
                            className="action-button"
                            disabled={busy}
                            onClick={() => setReview(null)}
                          >
                            {t("events.cancel")}
                          </button>
                          <button
                            type="button"
                            className="action-button"
                            data-testid="event-choose"
                            disabled={busy || !!choice.blocker}
                            onClick={() =>
                              void dispatchAction({
                                type: "chooseEvent",
                                eventId: current.id,
                                choiceId: choice.id,
                              })
                            }
                          >
                            {t("events.confirmChoice")}
                          </button>
                        </div>
                      </fieldset>
                    )}
                  </>
                )}
              </>
            ) : (
              <p className="event-empty">{t("events.select")}</p>
            )}
            <ActionFeedback />
            {snapshot.eventModifiers.length > 0 && (
              <details className="event-active">
                <summary>{t("events.active", { count: snapshot.eventModifiers.length })}</summary>
                {snapshot.eventModifiers.map((modifier) => (
                  <div key={`${modifier.eventId}-${JSON.stringify(modifier.effect)}`}>
                    <strong>{country(modifier.countryId)}</strong>
                    <ul>
                      <Effect
                        effect={{
                          ...modifier.effect,
                          quarters: modifier.endQuarter - snapshot.quarter,
                        }}
                      />
                    </ul>
                  </div>
                ))}
              </details>
            )}
          </section>
        </div>
        <footer className="event-board-footer">
          <p>{t("events.footer")}</p>
          <button type="button" className="action-button" onClick={close}>
            {t("events.back")}
          </button>
        </footer>
      </dialog>
    </>
  );
}
