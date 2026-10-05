import { useTranslation } from "react-i18next";
import type { TraditionSnapshot, TurnSnapshot } from "../../../sim";
import { PLAIN_TERMS, useTermVars } from "../identity/terms";
import { useGameStore } from "../state/game-store";
import "./culture.css";

// Traditions as the player sees them (GDD v1.22): names and origin facts come only from what the
// simulation recorded; strength is a bar described in words, never a number.

/** How a strength reads in words. */
export function strengthWord(strength: number): "strong" | "steady" | "fading" {
  if (strength >= 0.75) return "strong";
  if (strength >= 0.35) return "steady";
  return "fading";
}

/** Names and origin facts of traditions, from the recorded clubs, players and countries. */
export function useTraditionWords(snapshot: TurnSnapshot | null) {
  const { t } = useTranslation();
  const { names } = useGameStore();
  const termVars = useTermVars(snapshot?.identity.terms ?? PLAIN_TERMS);
  const club = (id: number | undefined) => snapshot?.flagship.clubs.find((c) => c.id === id);
  const clubName = (id: number | undefined) => {
    const found = club(id);
    return found ? t("flagship.club", { place: found.place, nickname: found.nickname }) : "";
  };
  const player = (id: number | null) =>
    snapshot?.flagship.players.find((p) => p.id === id)?.name ?? "";
  const country = (id: string) => names?.countries[id] ?? id;

  const name = (tradition: TraditionSnapshot): string => {
    const [first, second] = tradition.clubIds;
    switch (tradition.type) {
      case "derby": {
        const a = club(first)?.place ?? "";
        const b = club(second)?.place ?? "";
        return a === b
          ? t("culture.names.derby_same", { place: a })
          : t("culture.names.derby", { a, b });
      }
      case "legacy":
        return t("culture.names.legacy", { player: player(tradition.playerId) });
      case "venue":
        return club(first)?.ground ?? "";
      case "trophy":
        return tradition.name ?? t("culture.names.trophy", { ground: club(first)?.ground ?? "" });
      default:
        return tradition.name ?? "";
    }
  };

  /** The facts that made it, as one line. */
  const fact = (tradition: TraditionSnapshot): string =>
    t(`culture.facts.${tradition.type}`, {
      ...termVars({ seasons: tradition.seasons.length }),
      year: tradition.bornYear,
      count: tradition.seasons.length,
      club: clubName(tradition.clubIds[0]),
      clubA: clubName(tradition.clubIds[0]),
      clubB: clubName(tradition.clubIds[1]),
      player: player(tradition.playerId),
      country: country(tradition.countryId),
    });

  return { name, fact, clubName, player, country };
}

interface ListProps {
  traditions: TraditionSnapshot[];
  /** The country the list is shown for: followers abroad hold it more lightly. */
  countryId?: string;
  testId?: string;
  /** Show the rules each tradition was born under (the Rulebook). */
  showRules?: boolean;
}

/** A list of traditions: name, type, origin fact and a strength bar (lost ones greyed). */
export function TraditionList({ traditions, countryId, testId, showRules }: ListProps) {
  const { t, i18n } = useTranslation();
  const rules = (tradition: TraditionSnapshot) =>
    new Intl.ListFormat(i18n.language).format(
      tradition.rules.map(({ axis, option }) =>
        t("culture.rule", {
          trait: t(`genome.axes.${axis}`),
          option: t(`genome.options.${axis}.${option}`),
        }),
      ),
    );
  const { snapshot } = useGameStore();
  const words = useTraditionWords(snapshot);
  return (
    <ul className="tradition-list" data-testid={testId}>
      {traditions.map((tradition) => {
        const abroad = countryId !== undefined && tradition.countryId !== countryId;
        const word = strengthWord(tradition.strength);
        return (
          <li
            key={tradition.id}
            className={tradition.lost ? "tradition lost" : "tradition"}
            data-type={tradition.type}
            data-testid="tradition"
          >
            <span className="tradition-pennant" aria-hidden="true" data-type={tradition.type} />
            <div>
              <strong>{words.name(tradition)}</strong>
              <small>
                {t(abroad ? "culture.typeAbroad" : "culture.typeHome", {
                  type: t(`culture.types.${tradition.type}`),
                  country: words.country(tradition.countryId),
                })}
              </small>
              <p>{words.fact(tradition)}</p>
              {showRules && !tradition.lost && tradition.rules.length > 0 && (
                <p className="culture-note">
                  {t("culture.offends", { name: words.name(tradition), rules: rules(tradition) })}
                </p>
              )}
              {tradition.lost ? (
                <p className="tradition-lost">
                  {t(`culture.lost.${tradition.lost.reason}`, { year: tradition.lost.year })}
                </p>
              ) : (
                <meter
                  min={0}
                  max={1}
                  low={0.35}
                  high={0.75}
                  optimum={1}
                  value={tradition.strength}
                  aria-label={t("culture.strength", {
                    name: words.name(tradition),
                    word: t(`culture.strengthWords.${word}`),
                  })}
                />
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}

/** The Rulebook's Traditions section (GDD v1.22): every tradition by type, lost ones last. */
export function TraditionsSection({ snapshot }: { snapshot: TurnSnapshot }) {
  const { t } = useTranslation();
  const { traditions } = snapshot.culture;
  const types = ["trophy", "rite", "derby", "venue", "legacy", "nationalName"] as const;
  return (
    <section className="culture-section" data-testid="rulebook-traditions">
      <h4>{t("culture.heading")}</h4>
      <p className="culture-note">{t("culture.intro")}</p>
      {traditions.length === 0 && <p>{t("culture.none")}</p>}
      {types.map((type) => {
        const ofType = traditions
          .filter((tradition) => tradition.type === type)
          .sort((a, b) => Number(a.lost !== null) - Number(b.lost !== null) || b.id - a.id);
        if (ofType.length === 0) return null;
        return (
          <div key={type}>
            <h3>{t(`culture.byType.${type}`)}</h3>
            <TraditionList traditions={ofType} showRules />
          </div>
        );
      })}
    </section>
  );
}
