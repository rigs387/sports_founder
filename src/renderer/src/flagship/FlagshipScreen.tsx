import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { Names } from "../../../content";
import type { Action, ClubSnapshot, MatchResult, TurnSnapshot } from "../../../sim";
import { TrophyCard } from "../culture/TrophyCard";
import { useTraditionWords } from "../culture/traditions";
import { DealsPanel } from "../deals/DealsPanel";
import { useDealPartnerName } from "../deals/partners";
import { Emblem } from "../identity/Emblem";
import { useTermVars } from "../identity/terms";
import { VenueCard } from "../venues/VenueCard";
import "./flagship.css";
import { StarsPanel } from "./StarsPanel";

interface Props {
  snapshot: TurnSnapshot;
  names: Names;
  busy: boolean;
  active: boolean;
  onAction: (action: Action) => void;
}

// The flagship league the player runs as commissioner (GDD v1.11, v1.14, v1.16): its stars, this
// season's table, the latest round, the champions on record and the seat. Everything shown comes from the
// snapshot; legality and costs stay in the simulation.
export function FlagshipScreen({ snapshot, names, busy, active, onAction }: Props) {
  const { t } = useTranslation();
  const flagship = snapshot.flagship;
  const country = (id: string) => names.countries[id] ?? id;
  const clubs = new Map(flagship.clubs.map((club) => [club.id, club]));
  const clubName = (id: number) => {
    const club = clubs.get(id);
    return club ? t("flagship.club", { place: club.place, nickname: club.nickname }) : "";
  };
  const seatName = country(flagship.countryId);
  const nouns = useTermVars(snapshot.identity.terms)();

  return (
    <section
      className="flagship-screen"
      hidden={!active}
      aria-labelledby="flagship-title"
      data-testid="flagship-screen"
      data-season={flagship.season}
      data-round={flagship.round}
      data-seat={flagship.countryId}
      data-format={flagship.format}
    >
      <div className="flagship-heading">
        <Emblem
          {...snapshot.identity.emblem}
          primary={snapshot.identity.colors.primary}
          secondary={snapshot.identity.colors.secondary}
          size={56}
          label={t("flagship.foundingEmblem", { sport: snapshot.identity.sportName })}
        />
        <div className="flagship-title">
          <span className="eyebrow">{t("flagship.eyebrow")}</span>
          <h1 id="flagship-title">{t("flagship.title", { country: seatName })}</h1>
        </div>
        <div className="flagship-status">
          <strong>
            {t("flagship.status", {
              ...nouns,
              season: flagship.season,
              round: flagship.round,
              total: flagship.totalRounds,
            })}
          </strong>
          <p>
            {t(`flagship.formats.${flagship.format}`, { count: flagship.playoffClubs })}{" "}
            {t("flagship.seasonEnds", { ...nouns, count: flagship.quartersLeft })}
          </p>
        </div>
      </div>
      {!flagship.playing && (
        <p className="flagship-paused" role="status">
          {t("flagship.paused", { ...nouns, country: seatName })}
        </p>
      )}
      <div className="flagship-layout">
        <div className="flagship-main">
          <StarsPanel
            snapshot={snapshot}
            names={names}
            busy={busy}
            clubName={clubName}
            onAction={onAction}
            readOnly
          />
          <LeagueTable
            snapshot={snapshot}
            clubs={clubs}
            clubName={clubName}
            playoffClubs={flagship.playoffClubs}
          />
        </div>
        <div className="flagship-side">
          <Broadcast snapshot={snapshot} seatName={seatName} nouns={nouns} />
          <VenueCard snapshot={snapshot} names={names} busy={busy} onAction={onAction} readOnly />
          <DealsPanel snapshot={snapshot} names={names} busy={busy} onAction={onAction} readOnly />
          <LatestRound results={flagship.lastRound} clubName={clubName} nouns={nouns} />
          <TrophyCard snapshot={snapshot} busy={busy} onAction={onAction} readOnly />
          <Seat snapshot={snapshot} names={names} busy={busy} onAction={onAction} readOnly />
          <Champions snapshot={snapshot} clubName={clubName} country={country} />
        </div>
      </div>
    </section>
  );
}

/**
 * The flagship's broadcast (GDD v1.23): how gripping last season was, what the league's health
 * lets through, and how far the seat's media carries.
 */
function Broadcast({
  snapshot,
  seatName,
  nouns,
}: {
  snapshot: TurnSnapshot;
  seatName: string;
  nouns: Record<string, string>;
}) {
  const { t } = useTranslation();
  const broadcast = snapshot.flagship.broadcast;
  const vars = { ...nouns, country: seatName };
  return (
    <section
      className="flagship-card flagship-broadcast"
      aria-labelledby="flagship-broadcast-heading"
      data-testid="flagship-broadcast"
      data-interest={broadcast.interest}
    >
      <h2 id="flagship-broadcast-heading">{t("flagship.broadcast.heading")}</h2>
      <p className="broadcast-interest">
        <strong>{t(`flagship.broadcast.interest.${broadcast.interest}`, vars)}</strong>{" "}
        {t(`flagship.broadcast.why.${broadcast.interest}`, vars)}
      </p>
      {broadcast.health === null ? (
        <p>{t("flagship.broadcast.noLeague", vars)}</p>
      ) : (
        <p>
          <strong>{t(`league.healthLevels.${broadcast.health}`)}</strong>{" "}
          {t(`flagship.broadcast.health.${broadcast.health}`, vars)}
        </p>
      )}
      {broadcast.reaches === 0 ? (
        <p className="broadcast-reach">{t("flagship.broadcast.smallMarket", vars)}</p>
      ) : broadcast.ripple ? (
        <p className="broadcast-reach broadcast-ripple">
          {t("flagship.broadcast.ripple", { ...vars, count: broadcast.reaches })}
        </p>
      ) : (
        <p className="broadcast-reach">
          {t("flagship.broadcast.reach", {
            ...vars,
            boost: broadcast.boost,
            count: broadcast.reaches,
          })}
          {broadcast.pulse > 0 &&
            ` ${t("flagship.broadcast.pulse", { ...vars, pulse: broadcast.pulse })}`}
        </p>
      )}
    </section>
  );
}

function LeagueTable({
  snapshot,
  clubs,
  clubName,
  playoffClubs,
}: {
  snapshot: TurnSnapshot;
  clubs: Map<number, ClubSnapshot>;
  clubName: (id: number) => string;
  playoffClubs: number;
}) {
  const { t } = useTranslation();
  const leaders = new Map(snapshot.flagship.leaders.map((leader) => [leader.clubId, leader]));
  const termVars = useTermVars(snapshot.identity.terms);
  const playerName = (id: number) => snapshot.flagship.players.find((p) => p.id === id)?.name;
  const words = useTraditionWords(snapshot);
  // Living traditions of this league's clubs (GDD v1.22), tagged on their rows.
  const living = snapshot.culture.traditions.filter(
    (tradition) => tradition.lost === null && tradition.countryId === snapshot.flagship.countryId,
  );
  const tags = (clubId: number) =>
    living.filter(
      (tradition) =>
        ["derby", "rite", "venue"].includes(tradition.type) && tradition.clubIds.includes(clubId),
    );
  const columns = [
    ["played", "playedFull"],
    ["won", "wonFull"],
    ["drawn", "drawnFull"],
    ["lost", "lostFull"],
  ] as const;
  return (
    <section className="flagship-card flagship-table" aria-labelledby="flagship-table-heading">
      <h2 id="flagship-table-heading">{t("flagship.table.heading")}</h2>
      <table data-testid="flagship-table">
        <thead>
          <tr>
            <th scope="col" className="position">
              <abbr title={t("flagship.table.position")}>#</abbr>
            </th>
            <th scope="col" className="club">
              {t("flagship.table.club")}
            </th>
            {columns.map(([short, full]) => (
              <th scope="col" key={short}>
                <abbr title={t(`flagship.table.${full}`)}>{t(`flagship.table.${short}`)}</abbr>
              </th>
            ))}
            <th scope="col" className="score">
              {t("flagship.table.scoreFor")}
            </th>
            <th scope="col" className="score">
              {t("flagship.table.scoreAgainst")}
            </th>
            <th scope="col" className="points">
              <abbr title={t("flagship.table.pointsFull")}>{t("flagship.table.points")}</abbr>
            </th>
          </tr>
        </thead>
        <tbody>
          {snapshot.flagship.table.map((row, index) => {
            const titles = clubs.get(row.clubId)?.titles ?? 0;
            const leader = leaders.get(row.clubId);
            const founding = row.clubId === snapshot.identity.foundingClubId;
            const leaderName = leader && playerName(leader.playerId);
            const lastPlayoff = playoffClubs > 0 && index === playoffClubs - 1;
            return (
              <tr
                key={row.clubId}
                className={lastPlayoff ? "playoff-line" : undefined}
                data-club={row.clubId}
              >
                <td className="position">{index + 1}</td>
                <th scope="row" className="club">
                  <span className="club-name">
                    {founding && (
                      <Emblem
                        {...snapshot.identity.emblem}
                        primary={snapshot.identity.colors.primary}
                        secondary={snapshot.identity.colors.secondary}
                        size={16}
                      />
                    )}
                    <span>{clubName(row.clubId)}</span>
                    {founding && (
                      <small className="founding" data-testid="flagship-founding">
                        {t("flagship.founding")}
                      </small>
                    )}
                    {tags(row.clubId).map((tradition) => (
                      <small
                        key={tradition.id}
                        className="culture-tag"
                        title={words.name(tradition)}
                        data-testid="flagship-tradition-tag"
                        data-type={tradition.type}
                      >
                        {t(`culture.tags.${tradition.type}`)}
                      </small>
                    ))}
                    {titles > 0 && (
                      <small className="titles">
                        <span aria-hidden="true">&#9733;</span>
                        {t("flagship.titles", { count: titles })}
                      </small>
                    )}
                  </span>
                  {leader && leaderName && (
                    <small
                      className="leader"
                      title={t("flagship.table.leader")}
                      data-testid="flagship-leader"
                    >
                      {leader.scores === null
                        ? leaderName
                        : t("flagship.table.leaderScores", {
                            ...termVars({ score: leader.scores }),
                            name: leaderName,
                            count: leader.scores,
                          })}
                    </small>
                  )}
                </th>
                <td>{row.played}</td>
                <td>{row.won}</td>
                <td>{row.drawn}</td>
                <td>{row.lost}</td>
                <td className="score">{row.scoreFor}</td>
                <td className="score">{row.scoreAgainst}</td>
                <td className="points">{row.points}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {playoffClubs > 0 && (
        <p className="flagship-legend">
          <i aria-hidden="true" />
          {t("flagship.table.playoffLine")}
        </p>
      )}
    </section>
  );
}

function LatestRound({
  results,
  clubName,
  nouns,
}: {
  results: MatchResult[];
  clubName: (id: number) => string;
  nouns: Record<string, string>;
}) {
  const { t } = useTranslation();
  return (
    <section className="flagship-card" aria-labelledby="flagship-round-heading">
      <h2 id="flagship-round-heading">{t("flagship.lastRound.heading")}</h2>
      {results.length === 0 ? (
        <p className="flagship-empty">{t("flagship.lastRound.none", nouns)}</p>
      ) : (
        <ul className="flagship-results" data-testid="flagship-results">
          {results.map((result) => (
            <li key={`${result.homeId}-${result.awayId}`}>
              <span className={result.homeScore > result.awayScore ? "winner" : undefined}>
                {clubName(result.homeId)}
              </span>
              <b>
                {t("flagship.lastRound.score", {
                  home: result.homeScore,
                  away: result.awayScore,
                })}
              </b>
              <span className={result.awayScore > result.homeScore ? "winner" : undefined}>
                {clubName(result.awayId)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function Champions({
  snapshot,
  clubName,
  country,
}: {
  snapshot: TurnSnapshot;
  clubName: (id: number) => string;
  country: (id: string) => string;
}) {
  const { t } = useTranslation();
  const seasons = snapshot.flagship.recentSeasons;
  const nouns = useTermVars(snapshot.identity.terms)();
  return (
    <section className="flagship-card" aria-labelledby="flagship-champions-heading">
      <h2 id="flagship-champions-heading">{t("flagship.champions.heading")}</h2>
      {seasons.length === 0 ? (
        <p className="flagship-empty">{t("flagship.champions.none", nouns)}</p>
      ) : (
        <ol className="flagship-champions" data-testid="flagship-champions">
          {seasons.map((season) => {
            const final = season.playoffs.at(-1);
            return (
              <li key={season.season}>
                <small>{t("flagship.champions.season", { ...nouns, ...season })}</small>
                <strong>
                  <span aria-hidden="true">&#9733;</span> {clubName(season.championId)}
                </strong>
                <span>
                  {final
                    ? t("flagship.champions.final", {
                        home: clubName(final.homeId),
                        away: clubName(final.awayId),
                        homeScore: final.homeScore,
                        awayScore: final.awayScore,
                      })
                    : t("flagship.champions.runnerUp", { club: clubName(season.runnerUpId) })}
                </span>
                {final?.decidedFor != null && (
                  <span>
                    {t("flagship.lastRound.decided", { club: clubName(final.decidedFor) })}
                  </span>
                )}
                {season.countryId !== snapshot.flagship.countryId && (
                  <span>
                    {t("flagship.champions.abroad", { country: country(season.countryId) })}
                  </span>
                )}
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}

/** The commissioner's seat; `readOnly` outside the offseason screen (GDD v1.24). */
export function Seat({
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
  const nouns = useTermVars(snapshot.identity.terms)();
  const flagship = snapshot.flagship;
  const country = (id: string) => names.countries[id] ?? id;
  const [target, setTarget] = useState("");
  const [reviewing, setReviewing] = useState(false);
  const targets = flagship.seatTargets
    .map((id) => snapshot.countries.find((c) => c.countryId === id))
    .filter((c) => c?.league)
    .sort((a, b) => country(a?.countryId ?? "").localeCompare(country(b?.countryId ?? "")));
  const valid = targets.some((c) => c?.countryId === target);
  const open = snapshot.offseasonOpen;
  const words = useTraditionWords(snapshot);
  const { i18n } = useTranslation();
  const leaving = snapshot.culture.traditions.filter((tradition) =>
    flagship.leaveTraditions.includes(tradition.id),
  );
  // Deals that demand the seat stays: moving breaks them (GDD v1.28).
  const partner = useDealPartnerName(names, snapshot.identity.sportName);
  const locked = flagship.deals.signed.filter((deal) => deal.demand?.kind === "seatLock");

  return (
    <section className="flagship-card flagship-seat" aria-labelledby="flagship-seat-heading">
      <h2 id="flagship-seat-heading">{t("flagship.seat.heading")}</h2>
      <p>{t("flagship.seat.here", { country: country(flagship.countryId) })}</p>
      {flagship.pendingCountryId ? (
        <div className="flagship-pending" data-testid="flagship-pending">
          <p>
            {t("flagship.seat.pending", {
              ...nouns,
              country: country(flagship.pendingCountryId),
            })}
          </p>
          {!readOnly && (
            <button
              type="button"
              className="action-button"
              disabled={busy}
              onClick={() => onAction({ type: "moveSeat", countryId: flagship.countryId })}
            >
              {t("flagship.seat.cancel", { country: country(flagship.countryId) })}
            </button>
          )}
        </div>
      ) : targets.length === 0 ? (
        <p className="flagship-empty">{t("flagship.seat.none")}</p>
      ) : readOnly ? (
        <p className="flagship-empty">{t("flagship.seat.elsewhere")}</p>
      ) : (
        <>
          <label className="flagship-picker">
            <span>{t("flagship.seat.choose")}</span>
            <select
              value={target}
              disabled={busy || !open}
              data-testid="flagship-seat-target"
              onChange={(event) => {
                setTarget(event.currentTarget.value);
                setReviewing(false);
              }}
            >
              <option value="" disabled>
                {t("flagship.seat.placeholder")}
              </option>
              {targets.map((c) =>
                c?.league ? (
                  <option key={c.countryId} value={c.countryId}>
                    {t("flagship.seat.target", {
                      country: country(c.countryId),
                      tier: t(`league.tiers.${c.league.tier}`),
                    })}
                  </option>
                ) : null,
              )}
            </select>
          </label>
          {!open && <p className="flagship-empty">{t("flagship.seat.closed")}</p>}
          {reviewing && valid ? (
            <div className="flagship-review" data-testid="flagship-review">
              <p>
                {t("flagship.seat.cost", {
                  ...nouns,
                  share: t("format.percent", { value: flagship.leaveCost }),
                  country: country(flagship.countryId),
                })}
              </p>
              {locked.length > 0 && (
                <p className="warning" data-testid="flagship-seat-deals">
                  {t("deals.warnSeat", {
                    count: locked.length,
                    partners: new Intl.ListFormat(i18n.language).format(
                      locked.map((deal) => partner(deal.partnerId)),
                    ),
                    country: country(flagship.countryId),
                  })}
                </p>
              )}
              {leaving.length > 0 && (
                <p className="warning" data-testid="flagship-seat-traditions">
                  {t("culture.leaving", {
                    count: leaving.length,
                    names: new Intl.ListFormat(i18n.language).format(leaving.map(words.name)),
                  })}
                </p>
              )}
              <div>
                <button
                  type="button"
                  className="action-button"
                  disabled={busy}
                  data-testid="flagship-seat-confirm"
                  onClick={() => {
                    onAction({ type: "moveSeat", countryId: target });
                    setReviewing(false);
                    setTarget("");
                  }}
                >
                  {t("flagship.seat.confirm")}
                </button>
                <button type="button" className="flagship-back" onClick={() => setReviewing(false)}>
                  {t("flagship.seat.back")}
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              className="action-button"
              disabled={busy || !open || !valid}
              data-testid="flagship-seat-review"
              onClick={() => setReviewing(true)}
            >
              {t("flagship.seat.review")}
            </button>
          )}
        </>
      )}
    </section>
  );
}
