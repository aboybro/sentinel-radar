// Sentinel Radar's model: a risk-adjusted token launch radar.
//
// The question this radar answers is not "which pre-token protocol is biggest" or "which is
// moving fastest" — it is "which pre-token protocol is worth trusting with your money while you
// farm it". A huge protocol that swung 400% in a week, runs on one chain and has been tracked for
// six weeks is a worse farm than a smaller one that has held its TVL for three years across five
// chains. So every protocol gets a Safety Score (0-100) from four pillars that the snapshot itself
// carries, and the implied value is the market's value for its TVL, discounted by that score.
//
//   safety  = scale + stability + endurance + breadth            (0..100, higher is safer)
//   scale       30 pts: log10(TVL) from the $5M snapshot floor to $10B
//   stability   30 pts: 30 x (1 - min(|7d change|, 100%) / 100); unknown change scores 15
//   endurance   25 pts: 25 x min(age_days, 1095) / 1095; unknown age scores 12.5
//   breadth     15 pts: 15 x min(chains - 1, 5) / 5
//   risk      = 0.55 + 0.65 x safety / 100                        (0.55..1.20)
//   base      = TVL x GLOBAL_MEDIAN, the median mcap/TVL of the snapshot's live-token
//               protocols, computed from the snapshot, never a fixed number and never a
//               per-category anchor: one market, one multiple, for every protocol alike
//   growth    = 1 + clamp(change_7d, -50%, +100%) / 100 x 0.4
//   endurance = 0.75 + min(age_days, 1095) / 1095 x 0.25          (unknown age: 365 days)
//   implied   = max(1, round(TVL x GLOBAL_MEDIAN x growth x endurance x risk))
//
// Tiers from the same safety score: FORTRESS >= 75, SOLID 60-75, WATCH 45-60, FRAGILE < 45.
// The board ranks by the risk-adjusted implied value, so a fragile giant can sit below a solid
// mid-size protocol — that is the radar's whole point, and the detail view shows the arithmetic.
//
// A protocol is pre-token when its record carries no token (no market cap, no CoinGecko id, no
// symbol). The board covers every slug on the snapshot's watchlist (the floor, never the ceiling)
// plus every other rankable pre-token protocol below the floor. Rankable excludes what cannot be
// a launch of its own: exchanges, bridges, liquid-staking and restaking products, wrapped and
// staked products of a token that already trades, and versioned pools of another protocol.
// Protocols whose token already trades are kept apart as the live reference set; the board never
// mixes the market's own value with a model's claim. No protocol name is ever special-cased.

/** The snapshot's protocol entry: exactly the ten fields the sealed input carries. */
export interface SnapshotProtocol {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
}

/** The whole snapshot document. */
export interface Snapshot {
  as_of: string;
  source: string;
  floor_usd: number;
  protocols: SnapshotProtocol[];
  watchlist: string[];
}

/** The model's constants, as the dashboard states them. */
export interface ModelConstants {
  base_fallback: number;
  growth_weight: number;
  growth_floor: number;
  growth_cap: number;
  endurance_floor: number;
  endurance_range: number;
  endurance_days: number;
  unknown_age_days: number;
  risk_floor: number;
  risk_range: number;
}

export const MODEL: ModelConstants = {
  base_fallback: 0.2,
  growth_weight: 0.4,
  growth_floor: -50,
  growth_cap: 100,
  endurance_floor: 0.75,
  endurance_range: 0.25,
  endurance_days: 1095,
  unknown_age_days: 365,
  risk_floor: 0.55,
  risk_range: 0.65,
};

/** The model's version label: the dashboard names it. */
export const MODEL_VERSION = 'sentinel-1';

/** How many live-token protocols the Live token view carries, by market cap. */
export const LIVE_ROWS = 16;

/** The four safety tiers, best first. */
export type RiskTier = 'FORTRESS' | 'SOLID' | 'WATCH' | 'FRAGILE';

/** One farm step: the action, what it costs, and how long it takes. */
export interface FarmStep {
  text: string;
  cost: string;
  time: string;
}

/** The four pillars of a protocol's Safety Score, each 0..its weight, plus the total 0..100. */
export interface SafetyBreakdown {
  scale: number;
  stability: number;
  endurance: number;
  breadth: number;
  total: number;
  tier: RiskTier;
  flags: string[];
}

/** One row of board.json: the ranked board's row. */
export interface BoardRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
  token_status: 'pre-token';
  age_days: number | null;
  implied_value_usd: number;
  safety_score: number;
  risk_tier: RiskTier;
  model: {
    base_multiple: number;
    growth_pct: number;
    growth_multiplier: number;
    endurance_multiplier: number;
    risk_multiplier: number;
    safety: SafetyBreakdown;
    age_days: number | null;
  };
  farm_steps: string[];
}

/** The dashboard's compact view of one row. */
export interface RadarRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  listed_at: string | null;
  age_days: number | null;
  implied_value_usd: number;
  safety_score: number;
  risk_tier: RiskTier;
  watchlist: boolean;
  flags: string[];
  safety: SafetyBreakdown;
  growth_multiplier: number;
  endurance_multiplier: number;
  risk_multiplier: number;
  farm_steps: string[];
}

/** A live-token protocol: it already trades, so the board shows the market's own value. */
export interface LiveRow {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  mcap_usd: number | null;
  change_7d: number | null;
}

/** Everything the dashboard needs: the board, the live set, and the model it runs. */
export interface RadarData {
  as_of: string;
  source: string;
  floor_usd: number;
  model: ModelConstants;
  model_version: string;
  base_multiple: number;
  watchlist_size: number;
  board_size: number;
  early_size: number;
  live_size: number;
  tier_counts: Record<RiskTier, number>;
  rows: RadarRow[];
  live: LiveRow[];
}

/** Why the snapshot is not one this model can score. */
export class SnapshotError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SnapshotError';
  }
}

const DAY_MS = 86_400_000;

/** A finite number, else `fallback`. */
function finite(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

/** Clamp `n` into [lo, hi]. */
function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}

/** Round to 4 decimal places, for the breakdown the reader checks. */
const round4 = (n: number): number => Math.round(n * 1e4) / 1e4;

/** A whole day count from `from` to `to`, clamped at zero; null when either date is absent or bad. */
export function ageDays(asOf: string, listedAt: string | null): number | null {
  if (listedAt === null) return null;
  const a = Date.parse(`${asOf}T00:00:00Z`);
  const b = Date.parse(`${listedAt}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.max(0, Math.floor((a - b) / DAY_MS));
}

/**
 * The market's own multiple: the median mcap/TVL of the snapshot's live-token protocols. One
 * multiple for the whole market, computed from the snapshot at run time — never a fixed number,
 * never a per-category anchor. Falls back to MODEL.base_fallback when no live protocol carries
 * both a market cap and a TVL.
 */
export function globalBaseMultiple(snapshot: Snapshot): number {
  const ratios = snapshot.protocols
    .filter((p) => p.mcap_usd !== null && p.mcap_usd > 0 && p.tvl_usd > 0)
    .map((p) => (p.mcap_usd as number) / p.tvl_usd)
    .sort((a, b) => a - b);
  if (ratios.length === 0) return MODEL.base_fallback;
  const mid = Math.floor(ratios.length / 2);
  return ratios.length % 2 === 1 ? ratios[mid]! : (ratios[mid - 1]! + ratios[mid]!) / 2;
}

/** The risk tier a Safety Score falls in. */
export function tierOf(score: number): RiskTier {
  if (score >= 75) return 'FORTRESS';
  if (score >= 60) return 'SOLID';
  if (score >= 45) return 'WATCH';
  return 'FRAGILE';
}

/**
 * The Safety Score: four pillars from the snapshot's own figures. Scale rewards size on a log
 * scale (a $10B protocol is not 2,000x safer than a $5M one); stability punishes wild weeks
 * (a protocol that doubled or halved in seven days is not a safe farm, whichever way it moved);
 * endurance rewards time tracked with no token; breadth rewards running on more than one chain.
 * Unknown figures score half their pillar: the radar says what it does not know.
 */
export function safetyScore(p: SnapshotProtocol, asOf: string): SafetyBreakdown {
  const age = ageDays(asOf, p.listed_at);
  const scale = 30 * clamp((Math.log10(Math.max(p.tvl_usd, 1)) - Math.log10(5_000_000)) / (Math.log10(10_000_000_000) - Math.log10(5_000_000)), 0, 1);
  const stability = p.change_7d === null ? 15 : 30 * (1 - Math.min(Math.abs(p.change_7d), 100) / 100);
  const endurance = age === null ? 12.5 : 25 * Math.min(age, 1095) / 1095;
  const breadth = 15 * Math.min(Math.max(p.chains.length - 1, 0), 5) / 5;
  const total = Math.round((scale + stability + endurance + breadth) * 10) / 10;
  const flags: string[] = [];
  if (p.chains.length <= 1) flags.push('Single chain: all of its TVL sits on one chain.');
  if (p.change_7d !== null && Math.abs(p.change_7d) >= 50) flags.push(`TVL moved ${p.change_7d > 0 ? '+' : ''}${p.change_7d.toFixed(1)}% in 7 days: a wild week, not a steady one.`);
  if (p.change_7d === null) flags.push('No 7-day TVL change reported: stability cannot be checked.');
  if (age !== null && age < 90) flags.push(`Tracked for only ${age} days: barely any record to judge.`);
  if (age === null) flags.push('No listing date reported: its age cannot be checked.');
  if (p.tvl_usd < 100_000_000) flags.push('TVL under $100M: small enough that one whale leaving moves it.');
  if (flags.length === 0) flags.push('No red flags on the four pillars: size, stability, age and chains all check out.');
  return { scale: round4(scale), stability: round4(stability), endurance: round4(endurance), breadth: round4(breadth), total, tier: tierOf(total), flags };
}

/** The risk-adjusted implied value and every multiplier behind it. */
export function impliedValue(
  p: SnapshotProtocol,
  asOf: string,
  baseMultiple: number,
  model: ModelConstants,
): { implied: number; growthPct: number; growthMult: number; enduranceMult: number; riskMult: number; safety: SafetyBreakdown; age: number | null } {
  const age = ageDays(asOf, p.listed_at);
  const safety = safetyScore(p, asOf);
  const rawGrowth = finite(p.change_7d, 0);
  const growthPct = clamp(rawGrowth, model.growth_floor, model.growth_cap);
  const growthMult = 1 + (growthPct / 100) * model.growth_weight;
  const ageForModel = age ?? model.unknown_age_days;
  const enduranceMult = model.endurance_floor + (Math.min(Math.max(ageForModel, 0), model.endurance_days) / model.endurance_days) * model.endurance_range;
  const riskMult = model.risk_floor + model.risk_range * (safety.total / 100);
  const implied = Math.max(1, Math.round(p.tvl_usd * baseMultiple * growthMult * enduranceMult * riskMult));
  return { implied, growthPct, growthMult, enduranceMult, riskMult, safety, age };
}

/** DefiLlama's version-marker rule: a name ending in a release is a pool of another protocol. */
const VERSIONED = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;

/** Whole-word wrapped / staked / staking in a name: a product of a token that already trades. */
const WRAPPED_OR_STAKED = /\b(wrapped|staked|staking)\b/i;

/** Exchange names a protocol name must not begin with: an exchange is not a launch to farm. */
const EXCHANGE_START = /^(Binance|Coinbase|Bybit|Kraken|Bitget|OKX|Bitfinex|Gemini)\b/i;

/** Categories that are a wrapped, staked or bridged product, not a protocol awaiting its own launch. */
const EXCLUDED_CATEGORIES = new Set([
  'Bridge',
  'Canonical Bridge',
  'Cross Chain Bridge',
  'Liquid Staking',
  'Liquid Restaking',
  'Restaked BTC',
  'Staking Pool',
  'Stablecoin Wrapper',
  'Anchor BTC',
  'Decentralized BTC',
  'CEX',
]);

/** Whether a protocol records no token at all. */
export function isPreToken(p: SnapshotProtocol): boolean {
  return p.mcap_usd === null && p.gecko_id === null && p.symbol === null;
}

/** Whether a protocol is one the board may rank: pre-token, and not a product of a token that trades. */
export function isRankable(p: SnapshotProtocol): boolean {
  if (!isPreToken(p)) return false;
  if (p.category !== null && EXCLUDED_CATEGORIES.has(p.category)) return false;
  if (VERSIONED.test(p.name)) return false;
  if (WRAPPED_OR_STAKED.test(p.name)) return false;
  if (EXCHANGE_START.test(p.name)) return false;
  return true;
}

/** The snapshot's protocol by slug. */
function bySlug(protocols: SnapshotProtocol[]): Map<string, SnapshotProtocol> {
  return new Map(protocols.map((p) => [p.slug, p]));
}

/** The protocols the board ranks, strongest first, with ranks 1..n. */
export function buildBoard(snapshot: Snapshot, model: ModelConstants = MODEL): BoardRow[] {
  const baseMultiple = globalBaseMultiple(snapshot);
  const index = bySlug(snapshot.protocols);
  const chosen = new Map<string, SnapshotProtocol>();
  // The watchlist is the floor: every slug on it is ranked, whatever its figures say.
  for (const slug of snapshot.watchlist) {
    const p = index.get(slug);
    if (p !== undefined) chosen.set(slug, p);
  }
  // The early radar: every other rankable pre-token protocol, at any TVL. No cap by count: a
  // protocol the floor leaves out is no worse a subject, and the board's job is to find it early.
  for (const p of snapshot.protocols) {
    if (!chosen.has(p.slug) && isRankable(p)) chosen.set(p.slug, p);
  }

  const scored = [...chosen.values()].map((p) => {
    const v = impliedValue(p, snapshot.as_of, baseMultiple, model);
    return { p, ...v };
  });
  scored.sort((a, b) => b.implied - a.implied || b.safety.total - a.safety.total || (a.p.slug < b.p.slug ? -1 : a.p.slug > b.p.slug ? 1 : 0));
  return scored.map((s, i) => ({
    rank: i + 1,
    slug: s.p.slug,
    name: s.p.name,
    category: s.p.category,
    chains: s.p.chains,
    tvl_usd: s.p.tvl_usd,
    change_7d: s.p.change_7d,
    mcap_usd: s.p.mcap_usd,
    listed_at: s.p.listed_at,
    gecko_id: s.p.gecko_id,
    symbol: s.p.symbol,
    token_status: 'pre-token',
    age_days: s.age,
    implied_value_usd: s.implied,
    safety_score: s.safety.total,
    risk_tier: s.safety.tier,
    model: {
      base_multiple: round4(baseMultiple),
      growth_pct: round4(s.growthPct),
      growth_multiplier: round4(s.growthMult),
      endurance_multiplier: round4(s.enduranceMult),
      risk_multiplier: round4(s.riskMult),
      safety: s.safety,
      age_days: s.age,
    },
    farm_steps: farmSteps(s.p, s.age, s.safety.tier).map(stepText),
  }));
}

/** A step as one string: its action, then its cost and time, within the gate's 20..600 characters. */
export function stepText(step: FarmStep): string {
  let s = `${step.text} Cost: ${step.cost}. Time: ${step.time}.`;
  if (s.length > 600) s = `${s.slice(0, 596)}...`;
  if (s.length < 20) s = `${s} Hold the position and check the protocol's own page.`;
  return s;
}

/** The first chain a protocol names, or a neutral phrase. */
function chainOf(p: SnapshotProtocol): string {
  return p.chains.length > 0 ? p.chains[0]! : 'its main chain';
}

/** How much capital one farm position gets, from the protocol's own risk tier. */
export function capitalFor(tier: RiskTier): number {
  if (tier === 'FORTRESS') return 250;
  if (tier === 'SOLID') return 150;
  if (tier === 'WATCH') return 100;
  return 25;
}

/** How long to hold, from the protocol's age: younger protocols get a longer qualifying window. */
function holdDaysFor(age: number | null): number {
  if (age === null) return 30;
  if (age < 180) return 60;
  if (age < 365) return 45;
  return 30;
}

/** The category's one action, in the words a farmer can follow. */
function actionFor(p: SnapshotProtocol, capital: number, chain: string): string {
  const c = (p.category ?? '').toLowerCase();
  const name = p.name;
  if (c.includes('lend') || c.includes('cdp') || c.includes('collateral')) return `Supply $${capital} of USDC to ${name} on ${chain} and keep the position open.`;
  if (c.includes('dex') || c.includes('yield') || c.includes('leveraged farm')) return `Provide $${capital} of liquidity to ${name}'s main pool on ${chain} and keep the position open.`;
  if (c.includes('perpetual') || c.includes('derivative') || c.includes('options')) return `Deposit $${capital} of USDC as margin on ${name} and open one small hedged position.`;
  if (c.includes('prediction')) return `Fund $${capital} and place one market position on ${name}.`;
  if (c.includes('curator') || c.includes('allocator') || c.includes('manager')) return `Deposit $${capital} into a ${name} vault on ${chain} and keep the shares.`;
  if (c.includes('stable')) return `Mint or deposit $${capital} of the stable asset through ${name} on ${chain}.`;
  if (c.includes('rwa')) return `Mint $${capital} of the protocol's yield-bearing asset on ${chain} and hold it.`;
  if (c.includes('insurance')) return `Buy $${capital} of cover from ${name} on ${chain} and keep the policy active.`;
  if (c.includes('farm')) return `Deposit $${capital} into ${name}'s farm on ${chain} and keep the position staked.`;
  return `Deposit $${capital} of USDC into ${name} on ${chain} and keep the position open.`;
}

/** The safety check a tier demands before the full position goes in. */
function safetyCheckFor(tier: RiskTier, p: SnapshotProtocol): string {
  if (tier === 'FRAGILE') return `Test first: deposit only $25, wait 7 days, and confirm you can withdraw it in full before you add the rest — a fragile protocol earns trust in small steps.`;
  if (tier === 'WATCH') return `Before the full deposit, read ${p.name}'s docs for its audit, admin keys and withdrawal rules, and confirm withdrawals work with a $10 test first.`;
  if (tier === 'SOLID') return `Before the full deposit, check ${p.name}'s docs for its audit and admin-key notes and confirm the withdrawal path works.`;
  return `Before the full deposit, skim ${p.name}'s audit and admin-key notes on its docs page; a fortress still deserves one read.`;
}

/**
 * A protocol's farm plan: six steps, each an action with a cost and a time. The plan is derived
 * from the protocol's own record (category, chains, TVL, age, risk tier), never from a hand-written
 * list of names. Position size follows the tier: a fragile protocol is farmed with $25, a fortress
 * with $250 — the radar sizes the bet to the risk it measured.
 */
export function farmSteps(p: SnapshotProtocol, age: number | null, tier: RiskTier): FarmStep[] {
  const chain = chainOf(p);
  const capital = capitalFor(tier);
  const hold = holdDaysFor(age);
  const action = actionFor(p, capital, chain);
  return [
    {
      text: `Use a fresh wallet that holds only the funds you plan to farm, and keep its seed phrase offline where nobody else can read it.`,
      cost: 'under $3 of gas for the first transaction',
      time: '5 minutes',
    },
    {
      text: safetyCheckFor(tier, p),
      cost: tier === 'FRAGILE' ? '$25 test deposit' : 'about $10 for the test',
      time: tier === 'FRAGILE' ? '7 days' : '20 minutes',
    },
    {
      text: action,
      cost: `$${capital} of capital and about $${capital >= 150 ? 8 : 4} of gas`,
      time: '15 minutes to set up',
    },
    {
      text: `Make one qualifying action each week, such as a deposit, a borrow, a swap or a vote, so the activity spans more than one snapshot.`,
      cost: 'about $2 of gas a week',
      time: '10 minutes a week',
    },
    {
      text: `Hold the position for at least ${hold} days and do not chase the token: a protocol that records no token may never issue one, and the position must be worth holding on its own.`,
      cost: `the $${capital} stays in the position`,
      time: `${hold} days`,
    },
    {
      text: `Before you withdraw, open the protocol's own points or rewards page and claim only from the link it publishes; never pay anyone to claim for you.`,
      cost: 'no fee to check, and never pay to claim',
      time: '10 minutes',
    },
  ];
}

/** The live-token protocols, by market cap, for the dashboard's Live token view. */
export function liveRows(snapshot: Snapshot): LiveRow[] {
  return snapshot.protocols
    .filter((p) => !isPreToken(p) && p.category !== 'CEX')
    .sort((a, b) => (b.mcap_usd ?? 0) - (a.mcap_usd ?? 0) || b.tvl_usd - a.tvl_usd)
    .slice(0, LIVE_ROWS)
    .map((p) => ({
      slug: p.slug,
      name: p.name,
      category: p.category,
      chains: p.chains,
      tvl_usd: p.tvl_usd,
      mcap_usd: p.mcap_usd,
      change_7d: p.change_7d,
    }));
}

/** A board row's compact form for data.js. `onWatchlist` is the snapshot's own list. */
export function radarRow(row: BoardRow, onWatchlist: boolean): RadarRow {
  return {
    rank: row.rank,
    slug: row.slug,
    name: row.name,
    category: row.category,
    chains: row.chains,
    tvl_usd: row.tvl_usd,
    change_7d: row.change_7d,
    listed_at: row.listed_at,
    age_days: row.age_days,
    implied_value_usd: row.implied_value_usd,
    safety_score: row.safety_score,
    risk_tier: row.risk_tier,
    watchlist: onWatchlist,
    flags: row.model.safety.flags,
    safety: row.model.safety,
    growth_multiplier: row.model.growth_multiplier,
    endurance_multiplier: row.model.endurance_multiplier,
    risk_multiplier: row.model.risk_multiplier,
    farm_steps: row.farm_steps,
  };
}

/** Everything the dashboard renders, from the snapshot. */
export function buildRadar(snapshot: Snapshot, model: ModelConstants = MODEL): { board: BoardRow[]; radar: RadarData } {
  const board = buildBoard(snapshot, model);
  const live = liveRows(snapshot);
  const early = board.filter((r) => !snapshot.watchlist.includes(r.slug)).length;
  const tierCounts: Record<RiskTier, number> = { FORTRESS: 0, SOLID: 0, WATCH: 0, FRAGILE: 0 };
  for (const r of board) tierCounts[r.risk_tier]++;
  const radar: RadarData = {
    as_of: snapshot.as_of,
    source: snapshot.source,
    floor_usd: snapshot.floor_usd,
    model,
    model_version: MODEL_VERSION,
    base_multiple: round4(globalBaseMultiple(snapshot)),
    watchlist_size: snapshot.watchlist.length,
    board_size: board.length,
    early_size: early,
    live_size: live.length,
    tier_counts: tierCounts,
    rows: board.map((r) => radarRow(r, snapshot.watchlist.includes(r.slug))),
    live,
  };
  return { board, radar };
}

/** The snapshot out of a file's text, refused unless it is the shape the model scores. */
export function parseSnapshot(text: string): Snapshot {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new SnapshotError('snapshot.json is not JSON');
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) throw new SnapshotError('snapshot.json is not a JSON object');
  const o = raw as Record<string, unknown>;
  if (typeof o.as_of !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(o.as_of)) throw new SnapshotError('snapshot.json has no as_of date');
  if (typeof o.source !== 'string') throw new SnapshotError('snapshot.json has no source');
  if (typeof o.floor_usd !== 'number' || !Number.isSafeInteger(o.floor_usd) || o.floor_usd <= 0) throw new SnapshotError('snapshot.json has no floor_usd');
  if (!Array.isArray(o.protocols)) throw new SnapshotError('snapshot.json has no protocols array');
  if (!Array.isArray(o.watchlist) || o.watchlist.some((s) => typeof s !== 'string')) throw new SnapshotError('snapshot.json has no watchlist of slugs');
  const protocols = o.protocols.map((v, i) => {
    if (typeof v !== 'object' || v === null || Array.isArray(v)) throw new SnapshotError(`snapshot.json's protocol ${i} is not an object`);
    const p = v as Record<string, unknown>;
    if (typeof p.slug !== 'string' || typeof p.name !== 'string' || typeof p.tvl_usd !== 'number' || !Number.isFinite(p.tvl_usd)) {
      throw new SnapshotError(`snapshot.json's protocol ${i} lacks a slug, a name or a TVL`);
    }
    return {
      slug: p.slug,
      name: p.name,
      category: typeof p.category === 'string' ? p.category : null,
      chains: Array.isArray(p.chains) ? p.chains.filter((c): c is string => typeof c === 'string') : [],
      tvl_usd: p.tvl_usd,
      change_7d: typeof p.change_7d === 'number' && Number.isFinite(p.change_7d) ? p.change_7d : null,
      mcap_usd: typeof p.mcap_usd === 'number' && Number.isFinite(p.mcap_usd) ? p.mcap_usd : null,
      listed_at: typeof p.listed_at === 'string' ? p.listed_at : null,
      gecko_id: typeof p.gecko_id === 'string' ? p.gecko_id : null,
      symbol: typeof p.symbol === 'string' ? p.symbol : null,
    };
  });
  return {
    as_of: o.as_of,
    source: o.source,
    floor_usd: o.floor_usd,
    protocols,
    watchlist: o.watchlist as string[],
  };
}

/** Why a board is not one the gate will take, or null: coverage, ranks, order, one shared implied value, and farm steps. */
export function boardIssue(board: BoardRow[], snapshot: Snapshot): string | null {
  const slugs = new Set(board.map((r) => r.slug));
  const missing = snapshot.watchlist.filter((s) => !slugs.has(s));
  if (missing.length > 0) return `the board misses ${missing.length} watchlist slug${missing.length === 1 ? '' : 's'}: ${missing.slice(0, 5).join(', ')}`;
  const ranks = board.map((r) => r.rank).sort((a, b) => a - b);
  for (let i = 0; i < ranks.length; i++) if (ranks[i] !== i + 1) return `rank ${i + 1} is ${ranks[i]}`;
  for (let i = 1; i < board.length; i++) if (board[i]!.implied_value_usd > board[i - 1]!.implied_value_usd) return `row ${i + 1} outranks row ${i} on implied value`;
  if (board.length >= 2 && board[0]!.implied_value_usd === board[board.length - 1]!.implied_value_usd) {
    return `all ${board.length} rows share the same implied value $${board[0]!.implied_value_usd}: a board that ranks nothing by value is not a ranking`;
  }
  for (const r of board) {
    const steps = r.farm_steps;
    if (steps.length < 3 || steps.length > 12) return `${r.slug} has ${steps.length} farm steps`;
    for (const s of steps) if (s.length < 20 || s.length > 600) return `${r.slug} has a farm step of ${s.length} characters`;
    if (!Number.isSafeInteger(r.implied_value_usd) || r.implied_value_usd <= 0) return `${r.slug} has implied value ${r.implied_value_usd}`;
  }
  return null;
}

/** A compact data.js: the dashboard's whole dataset as one script, no fetch and no network. */
export function dataScript(radar: RadarData): string {
  return `window.RADAR=${JSON.stringify(radar)};\n`;
}
