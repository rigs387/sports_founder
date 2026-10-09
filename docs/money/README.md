# Money

GDD v1.34 topics B and C; build plan 2.21 steps 2–4. The simulation counts cash in its own unit;
the UI shows US dollars (`money.dollarsPerCash` in `content/config.yaml`, the `money` formatter in
`src/renderer/src/i18n/index.ts`).

## Real-league benchmarks (researched 2026-10-08)

| Game tier | Benchmark | Revenue a year | Mix | Top deals as a share of revenue |
|---|---|---|---|---|
| Elite | NFL | US$23B (2024) | national TV about $12B (~52%); team sponsorship $2.5B (~11%); gate, local media and licensing the rest | Anheuser-Busch about $250M (1.1%); SoFi Stadium naming about $31M (0.13%); NFL naming deals average about $10M (0.04%) |
| Elite | Premier League | £6.3B (2023/24) | broadcast ~53%, commercial £2.0B (~32%), matchday £0.9B (~14%) | Barclays about £19M (0.3%) |
| Professional | MLS | about $2.5B (2024, clubs) plus Apple | Apple's minimum $250M (~10%); clubs mostly gate and sponsors | Adidas about $138M (~5.5%) |
| Semi-pro | USL Championship, English National League | roughly $50–200M a league; clubs £3–10M | tickets ~40% of club revenue, 60%+ with concessions; little media | local sponsors |
| Amateur | local leagues | thousands to tens of thousands of dollars | registration fees, small sponsors | $500–5,000 sponsors (hand estimate) |

Sources: Deloitte Annual Review of Football Finance (Premier League clubs); SportsPro on NFL revenue
for 2024 and the business of the NFL in 2025; Sportico MLS team valuations 2024 and 2025; Front
Office Sports and Fortune on MLS and Apple; Sportico on the Adidas–MLS extension; NBC Sports on the
Bud Light deal; SportsPro and Sports-King on stadium naming rights; SportsPro on Barclays and the
Premier League; Backheeled on USL attendance and club revenue; Insider Media on National League and
EFL club revenues.

## What the game does (calibrated 2026-10-08)

- **Dollars:** `dollarsPerCash` 9,100. A United States Elite flagship with a full deal slate at PP
  tier 5 earned 2.52M cash a year in the playtest save, US$23B, the NFL's revenue.
- **Tiers:** revenue per fan is 0.02 / 0.15 / 0.5 / 1 of Elite's (Amateur / Semi-Pro /
  Professional / Elite), and each tier's running costs were scaled with its revenue, so a tier's
  margins are what they were. An Amateur league of 3.4M fans earns about $2.7M a year.
- **Promotion is funded by investors:** the league gains one quarter of its new running cost and
  must be Healthy. Amateur leagues can no longer save up for a step up (measured 40/60 naive-bot
  collapses with savings, 12/60 with the investment, against 10/60 before).
- **Media outgrows gate as the sport goes global:** the PP tier's `mediaRevenueMultiplier` is 1,
  1.25, 2.5, 6 and 17. Gate and media rates per fan are otherwise as before (×2.5 for the tier
  rescale); cutting the gate starved young leagues.
- **Deals:** sponsors ×3.5 and naming rights ×0.1 against the media line. The playtest seat with a
  full slate: gate 20%, media 55% (kept line plus TV), sponsors and naming 25%; each ground's
  naming rights about 0.1%. The main sponsor is about 15% of revenue, far above any real single
  sponsor, because three slots carry what real leagues spread over hundreds of partners.
- **Targets:** `balanceTargets.money` (Elite seat at the top tier: gate 15–35%, media 40–65%,
  sponsors and naming 10–30%) and `dealSlateShare` 110–160%. Measured (builder, 5 campaigns, 200
  turns): gate 33%, media 44%, sponsors and naming 23%; slate 113–153% by tier.
- **No offer under $10,000 a season** (`flagship.deals.minOfferDollars`).

The sim itself in dollars is parked (GDD parking lot).
