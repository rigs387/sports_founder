import { useState } from "react";
import { useTranslation } from "react-i18next";
import { GEAR_BRAND_ID, type Names } from "../../../content";
import type {
  Action,
  DealDemandTerms,
  DealOffer,
  DealSlot,
  SignedDealSnapshot,
  TurnSnapshot,
} from "../../../sim";
import { useTraditionWords } from "../culture/traditions";
import { useTermVars } from "../identity/terms";
import { useDealPartnerName } from "./partners";
import "./deals.css";

interface Props {
  snapshot: TurnSnapshot;
  names: Names;
  busy: boolean;
  onAction: (action: Action) => void;
  /** The Flagship tab's view: deals are signed only on the offseason screen (GDD v1.24). */
  readOnly?: boolean;
}

// The flagship's deals (GDD v1.28): every slot with its signed deal, or this offseason's offers.
// Values, legality and what a breach costs come from the snapshot; signing goes through
// applyAction. Signing asks first only for a demand or a betrayal.
export function DealsPanel({ snapshot, names, busy, onAction, readOnly = false }: Props) {
  const { t } = useTranslation();
  const termVars = useTermVars(snapshot.identity.terms);
  const nouns = termVars();
  const { deals, countryId } = snapshot.flagship;
  const partner = useDealPartnerName(names, snapshot.identity.sportName);
  const words = useTraditionWords(snapshot);
  const country = names.countries[countryId] ?? countryId;
  const [reviewing, setReviewing] = useState<number | null>(null);

  const ground = (clubId: number) =>
    snapshot.flagship.clubs.find((club) => club.id === clubId)?.ground ?? "";
  const slotName = (slot: DealSlot, position: number) =>
    slot === "tv"
      ? t("deals.slotNames.tv")
      : slot === "sponsor"
        ? position === 0
          ? t("deals.slotNames.sponsorMain")
          : t("deals.slotNames.sponsor", { n: position + 1 })
        : t("deals.slotNames.namingRights", { ground: ground(position) });
  const demandText = (demand: DealDemandTerms) =>
    demand.kind === "tierFloor"
      ? t("deals.demand.tierFloor", { tier: t(`league.tiers.${demand.tier}`) })
      : demand.kind === "seatLock"
        ? t("deals.demand.seatLock", {
            country: names.countries[demand.countryId] ?? demand.countryId,
          })
        : demand.kind === "exclusivity"
          ? t("deals.demand.exclusivity")
          : t("deals.demand.ruleChange", {
              ...nouns,
              trait: t(`genome.axes.${demand.axis}`),
              option: t(`genome.options.${demand.axis}.${demand.option}`),
              season: demand.dueSeason,
            });
  /**
   * The living tradition a naming deal on this ground would betray, if any (GDD v1.28): its fame
   * first, then the founding club's rite.
   */
  const betrayed = (offer: DealOffer) =>
    offer.slot !== "namingRights"
      ? undefined
      : [...snapshot.culture.traditions]
          .sort((a, b) => Number(b.type === "venue") - Number(a.type === "venue"))
          .find(
            (tradition) =>
              tradition.lost === null &&
              tradition.countryId === countryId &&
              tradition.clubIds.includes(offer.position) &&
              (tradition.type === "venue" ||
                (tradition.type === "rite" && offer.position === snapshot.identity.foundingClubId)),
          );

  const signedRow = (deal: SignedDealSnapshot) => (
    <div className="deal-signed" data-testid="deal-signed" data-deal={deal.id}>
      <strong>
        {t("deals.signed", {
          ...nouns,
          partner: partner(deal.partnerId),
          value: deal.annualValue,
          last: deal.lastSeason,
        })}
      </strong>
      {!deal.paying && <small>{t("deals.notPaying", { ...nouns, first: deal.firstSeason })}</small>}
      {deal.demand && (
        <small className={deal.ruleDueNow ? "deal-due" : undefined}>
          {deal.ruleDueNow && deal.demand.kind === "ruleChange"
            ? t("deals.due", {
                trait: t(`genome.axes.${deal.demand.axis}`),
                option: t(`genome.options.${deal.demand.axis}.${deal.demand.option}`),
              })
            : deal.demand.kind === "ruleChange" && !deal.ruleOpen
              ? t("deals.met")
              : demandText(deal.demand)}
        </small>
      )}
    </div>
  );

  const offerCard = (offer: DealOffer) => {
    const tradition = betrayed(offer);
    const needsReview = offer.demand !== null || tradition !== undefined;
    const sign = () => {
      setReviewing(null);
      onAction({ type: "signDeal", offerId: offer.id });
    };
    return (
      <li
        key={offer.id}
        className="deal-offer"
        data-testid="deal-offer"
        data-offer={offer.id}
        data-demand={offer.demand?.kind ?? "none"}
      >
        <div className="deal-offer-head">
          <strong>{partner(offer.partnerId)}</strong>
          {offer.renewal && <span className="deal-tag">{t("deals.renewal")}</span>}
          {offer.partnerId === GEAR_BRAND_ID && (
            <span className="deal-tag">{t("deals.homegrown")}</span>
          )}
        </div>
        <p className="deal-value">
          {t("deals.offerValue", { ...nouns, value: offer.annualValue })}{" "}
          {t("deals.offerLength", {
            ...termVars({ seasons: offer.seasons }),
            count: offer.seasons,
          })}
        </p>
        <p className={offer.demand ? "deal-demand" : "deal-quiet"}>
          {offer.demand ? demandText(offer.demand) : t("deals.noDemand")}
        </p>
        {tradition && (
          <p className="deal-betrayal" data-testid="deal-betrayal">
            {t("deals.betrayal", {
              context: tradition.type,
              ground: ground(offer.position),
              tradition: words.name(tradition),
              country,
            })}
          </p>
        )}
        {reviewing === offer.id ? (
          <div className="deal-review">
            {offer.demand && offer.demand.kind !== "exclusivity" && (
              <p>
                {t("deals.breach", {
                  ...termVars({ seasons: deals.breach.shunSeasons }),
                  penalty: offer.annualValue * deals.breach.penaltySeasons,
                  partner: partner(offer.partnerId),
                  seasons: deals.breach.shunSeasons,
                })}
              </p>
            )}
            <div className="deal-buttons">
              <button
                type="button"
                className="action-button"
                disabled={busy}
                data-testid="deal-sign-confirm"
                onClick={sign}
              >
                {t("deals.confirm", { partner: partner(offer.partnerId) })}
              </button>
              <button type="button" className="flagship-back" onClick={() => setReviewing(null)}>
                {t("deals.back")}
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            className="action-button"
            disabled={busy}
            data-testid="deal-sign"
            onClick={() => (needsReview ? setReviewing(offer.id) : sign())}
          >
            {t(needsReview ? "deals.review" : "deals.sign")}
          </button>
        )}
      </li>
    );
  };

  // Signed deals outside today's slots (a sponsor slot lost to a step-down, a ground no longer
  // famous) still pay out their terms: they are listed after the slots.
  const inSlots = new Set(
    deals.slots.flatMap((slot) => (slot.dealId === null ? [] : [slot.dealId])),
  );
  const extra = deals.signed.filter((deal) => !inSlots.has(deal.id));

  return (
    <section
      className="flagship-card deals-panel"
      aria-labelledby="deals-heading"
      data-testid="deals-panel"
    >
      <h2 id="deals-heading">{t("deals.heading")}</h2>
      <p>{t("deals.intro", nouns)}</p>
      <p className="deals-baseline">
        {deals.mediaShare < 1
          ? t("deals.baseline", { share: deals.mediaShare })
          : t("deals.baselineFull")}{" "}
        {deals.incomePerQuarter > 0 && t("deals.income", { value: deals.incomePerQuarter })}
      </p>
      <ul className="deals-slots">
        {deals.slots.map((slot) => {
          const signed = deals.signed.find((deal) => deal.id === slot.dealId);
          const offers = deals.offers.filter(
            (offer) => offer.slot === slot.slot && offer.position === slot.position,
          );
          return (
            <li
              key={`${slot.slot}:${slot.position}`}
              className="deal-slot"
              data-slot={slot.slot}
              data-open={signed === undefined}
            >
              <h3>{slotName(slot.slot, slot.position)}</h3>
              {signed ? (
                signedRow(signed)
              ) : readOnly ? (
                <p className="flagship-empty">
                  {snapshot.offseasonOpen && offers.length > 0
                    ? t("deals.elsewhere")
                    : t("deals.open")}
                </p>
              ) : offers.length > 0 ? (
                <ul className="deal-offers">{offers.map(offerCard)}</ul>
              ) : (
                <p className="flagship-empty">
                  {snapshot.offseasonOpen ? t("deals.noOffers") : t("deals.open")}
                </p>
              )}
            </li>
          );
        })}
        {extra.map((deal) => (
          <li key={deal.id} className="deal-slot" data-slot={deal.slot}>
            <h3>{slotName(deal.slot, deal.position)}</h3>
            {signedRow(deal)}
          </li>
        ))}
      </ul>
      {deals.shunned.length > 0 && (
        <p className="deals-shunned">
          {t("deals.shunned", {
            partners: deals.shunned.map((entry) => partner(entry.partnerId)).join(", "),
          })}
        </p>
      )}
    </section>
  );
}
