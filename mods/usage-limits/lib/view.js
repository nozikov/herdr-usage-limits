import { timeLeft, level, pace, ago, tokens } from "./format.js";
import { isShown, inPanel, isFolded, spendOnBar, effectivePrefs } from "./prefs.js";
import { PROVIDERS } from "../providers/index.js";

const STALE_AFTER_S = 15 * 60;
const NO_READING = "—";
const FAILED_MARK = "!";
const LOADING_MARK = "…";

export const DENSITY = { FULL: 0, NO_BARS: 1, NO_LABELS: 2, BRIEF: 3 };

const fillOf = (percent) => Math.min(1, Math.max(0, percent / 100));
const passed = (w, now) => w.resetsAt != null && w.resetsAt <= now;
const isSpend = (p) => p.kind === "spend";
const usedThisWeek = (reading) => reading?.spend?.week > 0;
const isStale = (reading, now) => now - reading.observedAt > STALE_AFTER_S;
const shownReading = (st) => (st?.report?.status === "ok" ? st.report : st?.lastGood ?? null);

export function segmentView(w, now, showResetTime = false) {
  if (passed(w, now)) {
    return { id: w.id, short: w.short, text: NO_READING, brief: NO_READING, level: "ok", fill: 0, tick: null, expired: true };
  }
  const lv = level(w.percent);
  const timeToReset = w.resetsAt != null ? ` · ${timeLeft(w.resetsAt - now)}` : "";
  const brief = `${w.percent}%${lv !== "ok" ? timeToReset : ""}`;
  return {
    id: w.id,
    short: w.short,
    text: showResetTime ? `${w.percent}%${timeToReset}` : brief,
    brief,
    level: lv,
    fill: fillOf(w.percent),
    tick: pace(w, now)?.elapsed ?? null,
    expired: false,
  };
}

const capitalized = (s) => s.charAt(0).toUpperCase() + s.slice(1);

const VERDICT = { "on pace": "you're on pace", ahead: "you're using it up too fast", under: "you have room to spare" };

function tickHint(percent, p) {
  if (!p) return null;
  return `Tick: ${Math.round(p.elapsed * 100)}% of the time has passed.\nYou've used ${percent}%, so ${VERDICT[p.verdict]}.`;
}

function cardRow(w, now) {
  if (passed(w, now)) {
    return { id: w.id, long: w.long, percent: NO_READING, level: "ok", fill: 0, tick: null, hint: null, left: "", detail: "reset, waiting for a new reading" };
  }
  const p = pace(w, now);
  return {
    id: w.id,
    long: w.long,
    percent: `${w.percent}%`,
    level: level(w.percent),
    fill: fillOf(w.percent),
    tick: p?.elapsed ?? null,
    hint: tickHint(w.percent, p),
    left: w.resetsAt != null ? timeLeft(w.resetsAt - now) : "",
    detail: "",
  };
}

const resetOrLater = (w) => w.resetsAt ?? Infinity;

function closerToRunningOut(w, best, now) {
  if (passed(w, now) !== passed(best, now)) return passed(best, now);
  return w.percent > best.percent || (w.percent === best.percent && resetOrLater(w) < resetOrLater(best));
}

export function tightest(windows, now) {
  return (windows ?? []).reduce((best, w) => (best == null || closerToRunningOut(w, best, now) ? w : best), null);
}

export function hasLimits(states, providers = PROVIDERS) {
  return providers.some((p) => !isSpend(p) && states[p.id]?.installed !== false && (shownReading(states[p.id])?.windows.length ?? 0) > 0);
}

export function limitsSettled(states, prefs, providers = PROVIDERS) {
  return providers.every((p) => isSpend(p) || !wanted(prefs, p, states, providers) || states[p.id]?.installed === false || states[p.id]?.report != null);
}

const spendDefault = (states, prefs, providers) => limitsSettled(states, prefs, providers) && !hasLimits(states, providers);

export function wanted(prefs, p, states, providers = PROVIDERS) {
  if (inPanel(prefs, p.id)) return true;
  return isSpend(p) ? spendOnBar(prefs, p.id, spendDefault(states, prefs, providers)) : isShown(prefs, p.id);
}

function readingStatus(report, lastGood, now) {
  if (report.status === "ok") return { status: `updated ${ago(report.observedAt, now)}`, failed: false, dim: isStale(report, now), age: null };
  return {
    status: report.message ?? report.status,
    failed: true,
    dim: true,
    age: lastGood ? `Last reading ${ago(lastGood.observedAt, now)}` : null,
  };
}

function spendGroup(p, st, now) {
  const { report = null, lastGood = null } = st ?? {};
  if (!report) return null;
  const source = shownReading(st);
  if (source && !usedThisWeek(source)) return null;
  return {
    providerId: p.id, name: p.name, icon: p.icon, kind: "spend", plan: null, rows: [], folded: false, summary: null,
    ...readingStatus(report, lastGood, now),
    today: source ? tokens(source.spend.today) : null,
    week: source ? tokens(source.spend.week) : null,
  };
}

const LOADING = { status: "loading…", failed: false, dim: false, age: null };

const FOLDED_ROOM_W = 121;
const NAME_CHAR_W = 7.5;
const PLAN_CHAR_W = 6;
const PLAN_PAD_W = 16;
const FOLDED_LABEL_CHAR_W = 6;

function foldedLabel(name, plan, w) {
  if (!w) return null;
  const header = NAME_CHAR_W * name.length + (plan ? PLAN_CHAR_W * plan.length + PLAN_PAD_W : 0);
  return FOLDED_LABEL_CHAR_W * w.long.length <= FOLDED_ROOM_W - header ? w.long : w.short;
}

const planOf = (report) => (report?.status === "ok" && report.plan ? capitalized(report.plan) : null);

function limitsGroup(p, st, now, prefs) {
  const { report = null, lastGood = null } = st ?? {};
  const windows = (report?.status === "ok" ? report.windows : lastGood?.windows) ?? [];
  const closest = tightest(windows, now);
  const plan = planOf(report);
  return {
    providerId: p.id, name: p.name, icon: p.icon,
    plan,
    ...(report ? readingStatus(report, lastGood, now) : LOADING),
    rows: report ? windows.map((w) => cardRow(w, now)) : [],
    kind: "limits",
    folded: isFolded(prefs, p.id),
    summary: report && closest ? cardRow(closest, now) : null,
    foldedLabel: foldedLabel(p.name, plan, closest),
  };
}

const marked = (p, active) => (p.id === active ? { active: true } : {});
const tagged = (p) => (p.tag ? { tag: p.tag } : {});

function panelGroup(p, st, now, prefs) {
  if (!inPanel(prefs, p.id) || st?.installed === false) return null;
  return isSpend(p) ? spendGroup(p, st, now) : limitsGroup(p, st, now, prefs);
}

export function cardModel(states, now, providers = PROVIDERS, prefs = effectivePrefs(), active = null) {
  const groups = providers.map((p) => {
    const g = panelGroup(p, states[p.id], now, prefs);
    return g && { ...g, ...marked(p, active) };
  }).filter(Boolean);
  return { groups, empty: groups.length === 0, arrows: groups.length >= 3 };
}

export const PANEL = { LIMITS: "limits", SETTINGS: "settings" };

export const closedSinceLeft = (leftAt, nowMs, closeDelay) => leftAt != null && nowMs - leftAt > closeDelay;

export function panelOnEnter(panel, leftAt, nowMs, closeDelay) {
  return closedSinceLeft(leftAt, nowMs, closeDelay) ? PANEL.LIMITS : panel;
}

export function hoveredAfter(hovered, id, on) {
  if (on) return id;
  return hovered === id ? null : hovered;
}

function spendBarGroup(p, st, now, spendShown) {
  const source = shownReading(st);
  if (!st?.report || st.installed === false || !usedThisWeek(source) || !spendShown()) return null;
  const failing = st.report.status !== "ok";
  return {
    providerId: p.id, name: p.name, icon: p.icon,
    mark: failing ? FAILED_MARK : null,
    dim: failing || isStale(source, now),
    segments: [],
    spend: tokens(source.spend.today),
  };
}

function barReading(report, lastGood) {
  if (!report) return { mark: LOADING_MARK, source: null };
  if (report.status !== "ok") return { mark: FAILED_MARK, source: lastGood };
  return { mark: null, source: report };
}

function limitsBarGroup(p, st, now, prefs, active) {
  if (!isShown(prefs, p.id) || st?.installed === false) return null;
  const { mark, source } = barReading(st?.report ?? null, st?.lastGood ?? null);
  const segments = (source?.windows ?? [])
    .filter((w) => isShown(prefs, p.id, w.id, w.offBarByDefault === true))
    .map((w) => segmentView(w, now, prefs.showResetTime));
  const dim = mark === FAILED_MARK || (source != null && isStale(source, now));
  return { providerId: p.id, name: p.name, icon: p.icon, mark, dim, segments, ...tagged(p), ...marked(p, active) };
}

export function barModel(states, prefs, now, providers = PROVIDERS, active = null) {
  let spendDefaultOn = null;
  const spendShown = (id) => () => {
    spendDefaultOn ??= spendDefault(states, prefs, providers);
    return spendOnBar(prefs, id, spendDefaultOn);
  };
  const groups = providers
    .map((p) => (isSpend(p) ? spendBarGroup(p, states[p.id], now, spendShown(p.id)) : limitsBarGroup(p, states[p.id], now, prefs, active)))
    .filter(Boolean);
  return { groups, empty: groups.length === 0 };
}

const GROUP_W = 20;
const CHAR_W = 7;
const LABEL_CHAR_W = 6.5;
const SEGMENT_BAR_W = 30;
const GAP_W = 12;
const LABEL_GAP_W = 8;

const spendWidth = (g) => LABEL_GAP_W + LABEL_CHAR_W * "today".length + CHAR_W * g.spend.length + GAP_W;

function segmentWidth(s, density) {
  const text = CHAR_W * (density === DENSITY.BRIEF ? s.brief : s.text).length + GAP_W;
  if (density >= DENSITY.NO_LABELS) return text;
  const label = LABEL_GAP_W + LABEL_CHAR_W * s.short.length;
  return density === DENSITY.NO_BARS ? label + text : label + SEGMENT_BAR_W + text;
}

const TAG_GAP_W = 4;
const ACTIVE_DOT_W = 6 + 10;

const tagWidth = (g) => (g.tag != null ? TAG_GAP_W + LABEL_CHAR_W * g.tag.length : 0);
const activeWidth = (g) => (g.active ? ACTIVE_DOT_W : 0);

const groupWidth = (g, density) => GROUP_W + tagWidth(g) + activeWidth(g) + (g.spend != null ? spendWidth(g) : 0) + g.segments.reduce((a, s) => a + segmentWidth(s, density), 0);

export function chooseDensity(model, widthPx, showBars = true) {
  const steps = showBars ? [DENSITY.FULL, DENSITY.NO_BARS, DENSITY.NO_LABELS, DENSITY.BRIEF] : [DENSITY.NO_BARS, DENSITY.NO_LABELS, DENSITY.BRIEF];
  return steps.find((d) => model.groups.reduce((sum, g) => sum + groupWidth(g, d), 0) <= widthPx) ?? DENSITY.BRIEF;
}

const SESSION_NUMBER_GAP_W = 14;
const SESSION_ICON_W = 18;

function sessionNumberWidth(n) {
  const label = n.label != null ? LABEL_GAP_W + LABEL_CHAR_W * n.label.length : 0;
  const icon = n.icon != null ? SESSION_ICON_W : 0;
  const bar = n.fill != null ? SEGMENT_BAR_W + 5 : 0;
  return CHAR_W * n.text.length + SESSION_NUMBER_GAP_W + label + icon + bar;
}

export function sessionNumbersWidth(numbers) {
  return numbers.reduce((w, n) => w + sessionNumberWidth(n), numbers.length ? SESSION_NUMBER_GAP_W : 0);
}
