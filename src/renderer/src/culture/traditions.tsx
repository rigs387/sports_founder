import { type ReactNode, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { TraditionType } from "../../../content";
import type { TraditionSnapshot, TurnSnapshot } from "../../../sim";
import { PLAIN_TERMS, useTermVars } from "../identity/terms";
import { useGameStore } from "../state/game-store";
import "./culture.css";

/** Seasons a redemption's curse lasted: its first season to the title's (GDD v1.36). */
export function cursedSeasons(tradition: TraditionSnapshot): number {
  return Math.max(0, (tradition.seasons.at(-1) ?? 0) - (tradition.seasons[0] ?? 0));
}

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
      case "chant":
        return t("culture.names.chant", { song: tradition.name ?? "" });
      // GDD v1.35: named from the club, the year or the star's family name (the last word).
      case "curse":
      case "era":
      case "redemption":
        return t(`culture.names.${tradition.type}`, { nickname: club(first)?.nickname ?? "" });
      case "invincibles":
        return t("culture.names.invincibles", { year: tradition.bornYear });
      case "signatureMove":
        return t("culture.names.signatureMove", {
          family: player(tradition.playerId).split(" ").at(-1) ?? "",
          move: tradition.name ?? "",
        });
      default:
        return tradition.name ?? "";
    }
  };

  /** The facts that made it, as one line. */
  const fact = (tradition: TraditionSnapshot): string =>
    t(`culture.facts.${tradition.type}`, {
      ...termVars({
        seasons:
          tradition.type === "redemption" ? cursedSeasons(tradition) : tradition.seasons.length,
      }),
      year: tradition.bornYear,
      count: tradition.seasons.length,
      cursed: cursedSeasons(tradition),
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
  /** Makes each name a button that opens the tradition's page (the Rulebook). */
  onOpen?: (tradition: TraditionSnapshot) => void;
}

/** A list of traditions: name, type, origin fact and a strength bar (lost ones greyed). */
export function TraditionList({ traditions, countryId, testId, showRules, onOpen }: ListProps) {
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
              {onOpen ? (
                <button
                  type="button"
                  className="tradition-open"
                  data-testid="tradition-open"
                  onClick={() => onOpen(tradition)}
                >
                  {words.name(tradition)}
                </button>
              ) : (
                <strong>{words.name(tradition)}</strong>
              )}
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

/**
 * The Traditions section's groups, by kind (GDD v1.36): what a tradition is about decides where
 * it is listed, so later content can add to a whole group or one tradition.
 */
export const TRADITION_GROUPS = [
  { id: "rivalries", types: ["derby"] },
  { id: "people", types: ["legacy", "signatureMove"] },
  { id: "clubs", types: ["rite", "chant", "venue"] },
  { id: "records", types: ["era", "invincibles", "curse", "redemption"] },
  { id: "country", types: ["nationalName", "trophy", "matchdayFood"] },
] as const satisfies readonly { id: string; types: readonly TraditionType[] }[];

/**
 * A part of a tradition's page. The page lists every section that applies, in order: later
 * content adds its own here (a story, an item, a choice) and reads the tradition's recorded
 * facts. The first section is what is on record already.
 */
export interface TraditionPageSection {
  id: string;
  applies: (tradition: TraditionSnapshot) => boolean;
  render: (tradition: TraditionSnapshot, words: TraditionWords) => ReactNode;
}

export type TraditionWords = ReturnType<typeof useTraditionWords>;

function History({ tradition, words }: { tradition: TraditionSnapshot; words: TraditionWords }) {
  const { t, i18n } = useTranslation();
  const list = (items: string[]) => new Intl.ListFormat(i18n.language).format(items);
  const abroad = tradition.followers.filter((id) => id !== tradition.countryId);
  return (
    <dl className="tradition-history">
      <dt>{t("culture.page.born")}</dt>
      <dd>
        {t("culture.page.bornIn", {
          year: tradition.bornYear,
          country: words.country(tradition.countryId),
        })}
      </dd>
      <dt>{t("culture.page.origin")}</dt>
      <dd>{words.fact(tradition)}</dd>
      {tradition.seasons.length > 0 && (
        <>
          <dt>{t("culture.page.seasons")}</dt>
          <dd>{list(tradition.seasons.map(String))}</dd>
        </>
      )}
      {abroad.length > 0 && (
        <>
          <dt>{t("culture.page.followers")}</dt>
          <dd>{list(abroad.map((id) => words.country(id)))}</dd>
        </>
      )}
      {tradition.lost && (
        <>
          <dt>{t("culture.page.lost")}</dt>
          <dd>{t(`culture.lost.${tradition.lost.reason}`, { year: tradition.lost.year })}</dd>
        </>
      )}
    </dl>
  );
}

export const TRADITION_PAGE_SECTIONS: TraditionPageSection[] = [
  {
    id: "history",
    applies: () => true,
    render: (tradition, words) => <History tradition={tradition} words={words} />,
  },
];

/** One tradition's page (GDD v1.36): its name and standing, then every section that applies. */
function TraditionPage({
  tradition,
  onBack,
}: {
  tradition: TraditionSnapshot;
  onBack: () => void;
}) {
  const { t } = useTranslation();
  const { snapshot } = useGameStore();
  const words = useTraditionWords(snapshot);
  // The dialog keeps its scroll when the list gives way to the page: bring the page up once.
  const page = useRef<HTMLDivElement>(null);
  useEffect(() => {
    page.current?.scrollIntoView({ block: "start" });
  }, []);
  return (
    <div
      className="tradition-page"
      data-testid="tradition-page"
      data-type={tradition.type}
      ref={page}
    >
      <button type="button" className="tradition-back" onClick={onBack}>
        {t("culture.page.back")}
      </button>
      <h3>{words.name(tradition)}</h3>
      <small>
        {t("culture.typeHome", {
          type: t(`culture.types.${tradition.type}`),
          country: words.country(tradition.countryId),
        })}
      </small>
      {!tradition.lost && (
        <meter
          min={0}
          max={1}
          low={0.35}
          high={0.75}
          optimum={1}
          value={tradition.strength}
          aria-label={t("culture.strength", {
            name: words.name(tradition),
            word: t(`culture.strengthWords.${strengthWord(tradition.strength)}`),
          })}
        />
      )}
      {TRADITION_PAGE_SECTIONS.filter((section) => section.applies(tradition)).map((section) => (
        <section key={section.id} data-testid={`tradition-${section.id}`}>
          {section.render(tradition, words)}
        </section>
      ))}
    </div>
  );
}

/**
 * The Rulebook's Traditions section (GDD v1.22, v1.36): grouped by kind, the living and strongest
 * first, lost ones last; a tradition's name opens its page.
 */
export function TraditionsSection({ snapshot }: { snapshot: TurnSnapshot }) {
  const { t } = useTranslation();
  const { traditions } = snapshot.culture;
  const [openId, setOpenId] = useState<number | null>(null);
  const open = traditions.find((tradition) => tradition.id === openId);
  if (open)
    return (
      <section className="culture-section" data-testid="rulebook-traditions">
        <TraditionPage tradition={open} onBack={() => setOpenId(null)} />
      </section>
    );
  return (
    <section className="culture-section" data-testid="rulebook-traditions">
      <h4>{t("culture.heading")}</h4>
      <p className="culture-note">{t("culture.intro")}</p>
      {traditions.length === 0 && <p>{t("culture.none")}</p>}
      {TRADITION_GROUPS.map((group) => {
        const held = traditions
          .filter((tradition) => (group.types as readonly string[]).includes(tradition.type))
          .sort(
            (a, b) =>
              Number(a.lost !== null) - Number(b.lost !== null) ||
              b.strength - a.strength ||
              b.id - a.id,
          );
        if (held.length === 0) return null;
        return (
          <details key={group.id} className="tradition-group" open data-testid="tradition-group">
            <summary>
              {t(`culture.groups.${group.id}`)} <span className="culture-tag">{held.length}</span>
            </summary>
            <TraditionList traditions={held} showRules onOpen={(item) => setOpenId(item.id)} />
          </details>
        );
      })}
    </section>
  );
}
