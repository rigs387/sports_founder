import { useTranslation } from "react-i18next";
import type { Names } from "../../../content";
import type { AxisId, TimelineEntry, TurnSnapshot } from "../../../sim";
import { Emblem } from "../identity/Emblem";
import { StandingsChart } from "../standings/StandingsPanel";
import "../almanac/almanac.css";
import "./retrospective.css";

interface Props {
  snapshot: TurnSnapshot;
  names: Names;
  active: boolean;
  onWorld: () => void;
}

/** How many Hall of Fame players the page names. */
const HIGHLIGHTS = 6;

// The retrospective (GDD v1.38): the page a retired campaign ends on. One page, read from retained
// records only: the timeline of turning points, the fans by year, the rulebook's amendments, the
// Hall of Fame's most decorated, the world champions and the legacy goals met.
export function RetrospectiveScreen({ snapshot, names, active, onWorld }: Props) {
  const { t } = useTranslation();
  const retrospective = snapshot.retrospective;
  if (!retrospective) return null;
  const sport = snapshot.identity.sportName;
  const country = (id: string) => names.countries[id] ?? id;
  const player = (id: number) => snapshot.flagship.players.find((p) => p.id === id)?.name ?? "";
  const traitName = (id: AxisId) => t(`genome.axes.${id}`);
  const optionName = (id: AxisId, value: string) => t(`genome.options.${id}.${value}`);
  const own = snapshot.standings.sports.find((entry) => entry.sportId === "player");
  const goals = snapshot.legacy.goals;
  const met = goals.filter((goal) => goal.done);
  const { tournaments, founded } = snapshot.worldChampionship;
  const hall = snapshot.hallOfFame;
  // The most decorated first: titles, then star seasons, then the older class.
  const highlights = [...hall.inductees]
    .sort(
      (a, b) =>
        b.facts.titles + b.facts.worldTitles - (a.facts.titles + a.facts.worldTitles) ||
        b.facts.starSeasons - a.facts.starSeasons ||
        a.id - b.id,
    )
    .slice(0, HIGHLIGHTS);
  const line = (entry: TimelineEntry) =>
    t(`retrospective.timeline.${entry.kind}`, {
      sport,
      country: "countryId" in entry ? country(entry.countryId) : "",
      name: entry.kind === "tier" ? t(`tiers.${entry.tier}`) : (founded?.name ?? ""),
      player: entry.kind === "firstStar" ? player(entry.playerId) : "",
      rival: entry.kind === "rankOneLost" ? (names.sports[entry.sportId] ?? entry.sportId) : "",
      goal:
        entry.kind === "legacyGoal"
          ? t(`almanac.legacy.goals.${entry.goalId}`, {
              rival: names.sports[snapshot.legacy.heartlandSportId] ?? "",
            })
          : "",
    });
  const stats: [string, string][] = [
    [
      t("retrospective.stats.years"),
      t("format.count", { value: retrospective.retiredYear - retrospective.foundedYear }),
    ],
    [
      t("retrospective.stats.fans"),
      t("format.compact", { value: (own?.casual ?? 0) + (own?.hardcore ?? 0) }),
    ],
    [
      t("retrospective.stats.rank"),
      t("retrospective.stats.rankValue", { rank: snapshot.win.rank }),
    ],
    [
      t("retrospective.stats.leagues"),
      t("format.count", { value: snapshot.countries.filter((c) => c.league !== null).length }),
    ],
    [t("retrospective.stats.seasons"), t("format.count", { value: hall.records.champions.length })],
    [t("retrospective.stats.hall"), t("format.count", { value: hall.inductees.length })],
  ];

  return (
    <section
      className="almanac-screen retrospective-screen"
      hidden={!active}
      aria-labelledby="retrospective-title"
      data-testid="retrospective-screen"
      data-timeline={retrospective.timeline.length}
    >
      <div className="almanac-heading">
        <Emblem
          {...snapshot.identity.emblem}
          primary={snapshot.identity.colors.primary}
          secondary={snapshot.identity.colors.secondary}
          size={56}
          label={t("flagship.foundingEmblem", { sport })}
        />
        <div className="almanac-title">
          <span className="eyebrow">{t("retrospective.eyebrow")}</span>
          <h1 id="retrospective-title">
            {t("retrospective.title", {
              sport,
              from: retrospective.foundedYear,
              to: retrospective.retiredYear,
            })}
          </h1>
        </div>
        <button
          type="button"
          className="action-button"
          data-testid="retrospective-world"
          onClick={onWorld}
        >
          {t("retrospective.toWorld")}
        </button>
      </div>
      <p className="retrospective-lede">
        {t("retrospective.lede", {
          sport,
          country: country(snapshot.anchorCountryId),
          from: retrospective.foundedYear,
          to: retrospective.retiredYear,
        })}
      </p>
      <dl className="retrospective-stats" data-testid="retrospective-stats">
        {stats.map(([label, value]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
      <div className="almanac-layout">
        <div className="almanac-main">
          <section className="almanac-card" aria-labelledby="retrospective-fans-heading">
            <h2 id="retrospective-fans-heading">{t("retrospective.fans.heading")}</h2>
            <StandingsChart snapshot={snapshot} names={names} testId="retrospective-chart" />
            <p className="almanac-note">{t("retrospective.fans.note")}</p>
          </section>
          <section className="almanac-card" aria-labelledby="retrospective-timeline-heading">
            <h2 id="retrospective-timeline-heading">{t("retrospective.timeline.heading")}</h2>
            <ol className="retrospective-timeline" data-testid="retrospective-timeline">
              {retrospective.timeline.map((entry, index) => (
                // The timeline of a retired campaign never changes: the index is the entry.
                // biome-ignore lint/suspicious/noArrayIndexKey: entries are fixed and ordered
                <li key={index} data-kind={entry.kind}>
                  <span className="roll-year">{entry.year}</span>
                  <span>{line(entry)}</span>
                </li>
              ))}
            </ol>
          </section>
        </div>
        <div className="almanac-side">
          <section className="almanac-card" aria-labelledby="retrospective-legacy-heading">
            <h2 id="retrospective-legacy-heading">
              {t("retrospective.legacy.heading", { met: met.length, of: goals.length })}
            </h2>
            <ul className="legacy-goals" data-testid="retrospective-legacy">
              {goals.map((goal) => (
                <li key={goal.goalId} className={goal.done ? "met" : "unmet"}>
                  <span>
                    {t(`almanac.legacy.goals.${goal.goalId}`, {
                      rival: names.sports[snapshot.legacy.heartlandSportId] ?? "",
                    })}
                  </span>
                  <b>
                    {goal.done
                      ? t("almanac.legacy.met", { year: goal.done.year })
                      : t("almanac.legacy.progress", { have: goal.have, need: goal.need })}
                  </b>
                </li>
              ))}
            </ul>
          </section>
          <section className="almanac-card" aria-labelledby="retrospective-champions-heading">
            <h2 id="retrospective-champions-heading">{t("retrospective.champions.heading")}</h2>
            {tournaments.length === 0 ? (
              <p className="almanac-empty">
                {t(
                  founded
                    ? "retrospective.champions.unplayed"
                    : "retrospective.champions.unfounded",
                )}
              </p>
            ) : (
              <ol className="roll" data-testid="retrospective-champions">
                {tournaments.map((tournament) => (
                  <li key={tournament.season}>
                    <span className="roll-year">{tournament.year}</span>
                    <span>
                      <strong>{country(tournament.championId)}</strong>
                      <small>
                        {t("retrospective.champions.host", { country: country(tournament.hostId) })}
                      </small>
                    </span>
                  </li>
                ))}
              </ol>
            )}
          </section>
          <section className="almanac-card" aria-labelledby="retrospective-hall-heading">
            <h2 id="retrospective-hall-heading">{t("retrospective.hall.heading")}</h2>
            {highlights.length === 0 ? (
              <p className="almanac-empty">{t("retrospective.hall.empty")}</p>
            ) : (
              <ol className="roll" data-testid="retrospective-hall">
                {highlights.map((inductee) => (
                  <li key={inductee.id}>
                    <span className="roll-year">{inductee.year}</span>
                    <span>
                      <strong>{player(inductee.playerId)}</strong>
                      <small>
                        {t("retrospective.hall.facts", {
                          country: country(inductee.countryId),
                          titles: inductee.facts.titles,
                          starSeasons: inductee.facts.starSeasons,
                        })}
                      </small>
                    </span>
                  </li>
                ))}
              </ol>
            )}
          </section>
          <section className="almanac-card" aria-labelledby="retrospective-rules-heading">
            <h2 id="retrospective-rules-heading">{t("retrospective.rules.heading")}</h2>
            {snapshot.rules.amendments.length === 0 ? (
              <p className="almanac-empty">{t("retrospective.rules.empty")}</p>
            ) : (
              <ol className="roll" data-testid="retrospective-rules">
                {snapshot.rules.amendments.map((amendment) => (
                  <li key={`${amendment.year}-${amendment.axis}`}>
                    <span className="roll-year">{amendment.year}</span>
                    <span>
                      <strong>{traitName(amendment.axis)}</strong>
                      <small>
                        {t("retrospective.rules.change", {
                          from: optionName(amendment.axis, amendment.from),
                          to: optionName(amendment.axis, amendment.to),
                        })}
                      </small>
                    </span>
                  </li>
                ))}
              </ol>
            )}
          </section>
        </div>
      </div>
    </section>
  );
}
