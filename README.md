[![make.fun](https://make.fun/badge/token-radar-01.svg)](https://make.fun/c/token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/aboybro/sentinel-radar/rank.svg)](https://make.fun/c/token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/aboybro/sentinel-radar/reward.svg)](https://make.fun/c/token-radar-01)

# Sentinel Radar — pre-token protocols ranked by risk-adjusted value

An entry for make.fun's [token-radar-01](https://make.fun/bounty/token-radar-01) bounty
([bounty page](https://make.fun/bounty/token-radar-01)): a token launch radar that reads a frozen
DefiLlama snapshot of 758 protocols, ranks the pre-token ones by **risk-adjusted implied value**,
and shows a reader how to farm each one — with the position sized to the risk the radar measured.

## How it differs from the sibling entries

- [Pulse Radar](https://github.com/aboybro/pulse-radar) anchors implied value in each category's
  live-token market (median mcap/TVL per category). Sentinel uses **one global multiple** — the
  median mcap/TVL of the snapshot's live-token protocols, computed at run time — and never prices
  a category differently from another.
- [Velocity Radar](https://github.com/aboybro/velocity-radar) prices a protocol on its momentum:
  a surging protocol outranks a still one. Sentinel does the opposite on purpose: a wild week is
  **a risk, not a reward**. A protocol that doubled its TVL in seven days is discounted for
  instability, and a huge but fragile protocol can rank below a smaller, steadier one.

The question Sentinel answers is not "which is biggest" or "which is moving fastest" — it is
"which pre-token protocol is safe enough to trust with your money while you farm it".

## The model (sentinel-1)

Every protocol gets a **Safety Score (0–100)** from four pillars, all read from the snapshot's
own figures:

```
safety  = scale + stability + endurance + breadth
scale       30 pts: log10(TVL), from the $5M snapshot floor to $10B
stability   30 pts: 30 x (1 - min(|7d change|, 100%) / 100); unknown change scores 15
endurance   25 pts: 25 x min(age_days, 1095) / 1095; unknown age scores 12.5
breadth     15 pts: 15 x min(chains - 1, 5) / 5
risk      = 0.55 + 0.65 x safety / 100              (0.55..1.20)
base      = TVL x GLOBAL_MEDIAN, the median mcap/TVL of the snapshot's live-token
            protocols, computed from the snapshot (0.2049x on this snapshot)
growth    = 1 + clamp(change_7d, -50%, +100%) / 100 x 0.4
endurance = 0.75 + min(age_days, 1095) / 1095 x 0.25  (unknown age: 365 days)
implied   = TVL x GLOBAL_MEDIAN x growth x endurance x risk
```

Tiers from the same score: **FORTRESS ≥ 75, SOLID 60–75, WATCH 45–60, FRAGILE < 45**. The board
ranks by the risk-adjusted implied value. Each row also carries the red flags the radar found —
single chain, a ≥50% weekly swing, tracked under 90 days, TVL under $100M, or an unreported
figure — so the reader sees *why* a protocol was discounted.

The board covers all 40 watchlist protocols (the floor, never the ceiling) plus every other
rankable pre-token protocol below the floor. Excluded, as products of a token that already trades
rather than launches of their own: exchanges, bridges, liquid-staking and restaking products,
wrapped/staked products, and versioned pools. Protocols whose token already trades are kept apart
as a live reference set; the board never mixes the market's own value with a model's claim. No
protocol name is ever special-cased.

## The dashboard

A static page, no framework and no network — every byte it shows ships with it:

- **Board**: sortable (risk-adjusted value, TVL, Safety Score, 7d growth, age), filterable by
  search, category, chain, risk tier, and watchlist-only; each row carries a tier badge, a
  WATCHLIST badge, a safety bar and a value bar.
- **Tier cards**: one click filters the board to FORTRESS, SOLID, WATCH or FRAGILE, with the
  count and what the tier means for your money.
- **Detail drawer**: click any row for the full breakdown — each pillar's points, the implied
  value's arithmetic (recomputed live in the page, so the number checks against board.json),
  the red flags, and a six-step farm plan with what each step costs and how long it takes.
- **Farm plans sized to risk**: FORTRESS farms up to $250, SOLID $150, WATCH $100 after a $10
  withdrawal test, FRAGILE $25 only after a 7-day test withdrawal. Every plan opens with a
  safety check and warns that a protocol that records no token may never issue one.
- **Model card + live tokens**: the formula and the tier rules stated on the page, and the
  largest tokens already trading at market value — the market the base multiple came from.

## How to run

Requires Node 22+ (standard library only, no install):

```sh
mkdir -p out
MAKEFUN_OUTPUT_DIR=out node main.ts --input <snapshot.json|directory>
# then serve out/ and open dashboard/index.html
```

`main.ts` reads the snapshot, writes `board.json`, `data.js`, `dashboard/` and `screenshots/`
into the output directory, and writes `dossier.json` with the vendored make.fun library. The
program is deterministic: two runs write the same bytes.
