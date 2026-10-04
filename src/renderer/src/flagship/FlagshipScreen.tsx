import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { Names } from "../../../content";
import type { Action, ClubSnapshot, MatchResult, TurnSnapshot } from "../../../sim";
import "./flagship.css";

interface Props {
  snapshot: TurnSnapshot;
  names: Names;
  busy: boolean;
  active: boolean;
  onAction: (action: Action) => void;
}

// The flagship league the player runs as commissioner (GDD v1.11, v1.14): this season's table,
// the latest round, the champions on record and the seat. Everything shown comes from the
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
        <div>
          <span className="eyebrow">{t("flagship.eyebrow")}</span>
          <h1 id="flagship-title">{t("flagship.title", { country: seatName })}</h1>
        </div>
        <div className="flagship-status">
          <strong>
            {t("flagship.status", {
              season: flagship.season,
              round: flagship.round,
              total: flagship.totalRounds,
            })}
          </strong>
          <p>
            {t(`flagship.formats.${flagship.format}`, { count: flagship.playoffClubs })}{" "}
            {t("flagship.seasonEnds", { count: flagship.quartersLeft })}
          </p>
        </div>
      </div>
      {!flagship.playing && (
        <p className="flagship-paused" role="status">
          {t("flagship.paused", { country: seatName })}
        </p>
      )}
      <div className="flagship-layout">
        <LeagueTable
          snapshot={snapshot}
          clubs={clubs}
          clubName={clubName}
          playoffClubs={flagship.playoffClubs}
        />
        <div className="flagship-side">
          <LatestRound results={flagship.lastRound} clubName={clubName} />
          <Seat snapshot={snapshot} names={names} busy={busy} onAction={onAction} />
          <Champions snapshot={snapshot} clubName={clubName} country={country} />
        </div>
      </div>
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
                    <span>{clubName(row.clubId)}</span>
                    {titles > 0 && (
                      <small className="titles">
                        <span aria-hidden="true">&#9733;</span>
                        {t("flagship.titles", { count: titles })}
                      </small>
                    )}
                  </span>
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
}: {
  results: MatchResult[];
  clubName: (id: number) => string;
}) {
  const { t } = useTranslation();
  return (
    <section className="flagship-card" aria-labelledby="flagship-round-heading">
      <h2 id="flagship-round-heading">{t("flagship.lastRound.heading")}</h2>
      {results.length === 0 ? (
        <p className="flagship-empty">{t("flagship.lastRound.none")}</p>
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
  return (
    <section className="flagship-card" aria-labelledby="flagship-champions-heading">
      <h2 id="flagship-champions-heading">{t("flagship.champions.heading")}</h2>
      {seasons.length === 0 ? (
        <p className="flagship-empty">{t("flagship.champions.none")}</p>
      ) : (
        <ol className="flagship-champions" data-testid="flagship-champions">
          {seasons.map((season) => {
            const final = season.playoffs.at(-1);
            return (
              <li key={season.season}>
                <small>{t("flagship.champions.season", season)}</small>
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

function Seat({
  snapshot,
  names,
  busy,
  onAction,
}: {
  snapshot: TurnSnapshot;
  names: Names;
  busy: boolean;
  onAction: (action: Action) => void;
}) {
  const { t } = useTranslation();
  const flagship = snapshot.flagship;
  const country = (id: string) => names.countries[id] ?? id;
  const [target, setTarget] = useState("");
  const [reviewing, setReviewing] = useState(false);
  const targets = flagship.seatTargets
    .map((id) => snapshot.countries.find((c) => c.countryId === id))
    .filter((c) => c?.league)
    .sort((a, b) => country(a?.countryId ?? "").localeCompare(country(b?.countryId ?? "")));
  const valid = targets.some((c) => c?.countryId === target);
  const open = snapshot.seasonalWindowOpen;

  return (
    <section className="flagship-card flagship-seat" aria-labelledby="flagship-seat-heading">
      <h2 id="flagship-seat-heading">{t("flagship.seat.heading")}</h2>
      <p>{t("flagship.seat.here", { country: country(flagship.countryId) })}</p>
      {flagship.pendingCountryId ? (
        <div className="flagship-pending" data-testid="flagship-pending">
          <p>{t("flagship.seat.pending", { country: country(flagship.pendingCountryId) })}</p>
          <button
            type="button"
            className="action-button"
            disabled={busy}
            onClick={() => onAction({ type: "moveSeat", countryId: flagship.countryId })}
          >
            {t("flagship.seat.cancel", { country: country(flagship.countryId) })}
          </button>
        </div>
      ) : targets.length === 0 ? (
        <p className="flagship-empty">{t("flagship.seat.none")}</p>
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
                  share: t("format.percent", { value: flagship.leaveCost }),
                  country: country(flagship.countryId),
                })}
              </p>
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
