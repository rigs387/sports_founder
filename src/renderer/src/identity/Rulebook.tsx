import { useTranslation } from "react-i18next";
import type { Names } from "../../../content";
import type { Action, TurnSnapshot } from "../../../sim";
import { TraditionsSection } from "../culture/traditions";
import { useDealPartnerName } from "../deals/partners";
import { AmendRules } from "./AmendRules";
import { Emblem } from "./Emblem";
import { FieldDiagram } from "./FieldDiagram";
import { useTerms, useTermVars } from "./terms";

// The Rulebook (GDD v1.18): the sport as an almanac page. Its name and emblem, how it was founded,
// its character, every genome trait as a sentence, the odd pairings' deadpan lines, the sport's
// terms, and the field diagram. Rule amendments join it with rules evolution, and the sport's
// traditions with Culture (GDD v1.22).

/** Visiting players are drawn in a neutral color so the founding club stands out. */
export const VISITORS = "#8f99a6";

const AXIS_SENTENCES = [
  "surface",
  "equipment",
  "physical",
  "footprint",
  "contact",
  "complexity",
  "structure",
] as const;

export function Rulebook({
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
  const { identity, genome } = snapshot;
  const terms = useTerms(identity.terms);
  const club = snapshot.flagship.clubs.find((c) => c.id === identity.foundingClubId);
  const clubName = club ? t("flagship.club", { place: club.place, nickname: club.nickname }) : "";
  const sport = identity.sportName;
  // Only renamed terms are worth a sentence: a score called a score goes without saying.
  const renamed = (["score", "match", "season"] as const).filter(
    (kind) => identity.terms[kind] !== kind,
  );
  return (
    <section className="rulebook" aria-labelledby="rulebook-heading" data-testid="rulebook">
      <div className="rulebook-heading">
        <Emblem
          {...identity.emblem}
          primary={identity.colors.primary}
          secondary={identity.colors.secondary}
          size={72}
          label={t("identity.emblemLabel", {
            sport,
            color: t(`identity.colors.${identity.emblem.primary}`).toLowerCase(),
            shape: t(`identity.shapes.${identity.emblem.shape}`).toLowerCase(),
            icon: t(`identity.icons.${identity.emblem.icon}`).toLowerCase(),
          })}
        />
        <div>
          <span className="eyebrow">{t("identity.rulebook.eyebrow", { sport })}</span>
          <h3 id="rulebook-heading">{sport}</h3>
          <p className="rulebook-ethos">{t(`identity.ethos.${identity.ethos}`)}</p>
        </div>
      </div>
      <div className="rulebook-body">
        <div className="rulebook-prose">
          <p>
            {t("identity.rulebook.founded", {
              sport,
              year: identity.foundedYear,
              place: club?.place ?? "",
              country: names.countries[snapshot.anchorCountryId] ?? snapshot.anchorCountryId,
              club: clubName,
              ground: identity.groundName,
            })}{" "}
            {t("identity.rulebook.origin", {
              birthplace: t(`identity.birthplaces.${identity.birthplace}`),
            })}{" "}
            {t(`identity.rulebook.ethos.${identity.ethos}`)}
          </p>
          <p>
            {AXIS_SENTENCES.map((axis) => t(`identity.rulebook.${axis}.${genome[axis]}`)).join(" ")}{" "}
            {t("identity.rulebook.teamSize", { count: identity.playersPerSide })}{" "}
            {t(`identity.rulebook.matchLength.${genome.matchLength}`, {
              match: terms.noun("match"),
            })}{" "}
            {t(`identity.rulebook.scoring.${genome.scoring}`, {
              scores: terms.titlePlural("score"),
            })}
          </p>
          {renamed.length > 0 && (
            <p>
              {renamed
                .map((kind) => t(`identity.rulebook.terms.${kind}`, { noun: terms.noun(kind) }))
                .join(" ")}
            </p>
          )}
          {identity.oddPairings.length > 0 && (
            <ul className="rulebook-odd" data-testid="rulebook-odd">
              {identity.oddPairings.map((id) => (
                <li key={id}>{t(`identity.rulebook.odd.${id}`)}</li>
              ))}
            </ul>
          )}
        </div>
        <div className="rulebook-field">
          <h4>{t("identity.diagram.heading")}</h4>
          <FieldDiagram
            genome={genome}
            playersPerSide={identity.playersPerSide}
            homeColor={identity.colors.primary}
            awayColor={VISITORS}
            homeName={clubName}
          />
        </div>
      </div>
      <AmendRules snapshot={snapshot} names={names} busy={busy} onAction={onAction} readOnly />
      <RuleDemands snapshot={snapshot} names={names} />
      <TraditionsSection snapshot={snapshot} />
    </section>
  );
}

/** Rule changes that signed deals still ask for, with the season they are due by (GDD v1.28). */
function RuleDemands({ snapshot, names }: { snapshot: TurnSnapshot; names: Names }) {
  const { t } = useTranslation();
  const nouns = useTermVars(snapshot.identity.terms)();
  const partner = useDealPartnerName(names, snapshot.identity.sportName);
  const open = snapshot.flagship.deals.signed.filter((deal) => deal.ruleOpen);
  if (open.length === 0) return null;
  return (
    <ul className="rulebook-demands" data-testid="rulebook-demands">
      {open.map((deal) =>
        deal.demand?.kind === "ruleChange" ? (
          <li key={deal.id} className={deal.ruleDueNow ? "deal-due" : undefined}>
            {t("deals.rulebookDue", {
              ...nouns,
              partner: partner(deal.partnerId),
              trait: t(`genome.axes.${deal.demand.axis}`),
              option: t(`genome.options.${deal.demand.axis}.${deal.demand.option}`),
              season: deal.demand.dueSeason,
            })}
          </li>
        ) : null,
      )}
    </ul>
  );
}
