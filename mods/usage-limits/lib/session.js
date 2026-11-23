import { level, tokens } from "./format.js";
import { isOnBar } from "./prefs.js";

export const AGENT_NAMES = { opencode: "OpenCode", pi: "Pi" };
const MODEL_ID = /^[A-Za-z0-9._:/-]+$/;

export function parseSession(text, app) {
  const f = Object.fromEntries((text ?? "").trim().split(/\s+/).map((kv) => kv.split("=")));
  const n = (k) => (/^\d+$/.test(f[k] ?? "") ? Number(f[k]) : null);
  if (!n("tokens")) return null;
  const model = Object.hasOwn(AGENT_NAMES, app) ? { model: MODEL_ID.test(f.model ?? "") ? f.model : null } : {};
  return {
    app,
    tokens: n("tokens"),
    window: n("window") || null,
    calls: n("calls") ?? 0,
    compactions: n("compactions"),
    last: f.lastTrigger ? { trigger: f.lastTrigger, pre: n("lastPre"), post: n("lastPost") } : null,
    ...model,
  };
}

const percent = (s) => Math.round((s.tokens / s.window) * 100);
const plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;

function context(s) {
  if (!s.window) return { text: tokens(s.tokens), detail: null, fill: null, level: "ok" };
  const p = percent(s);
  return { text: `${p}%`, detail: `${tokens(s.tokens)} of ${tokens(s.window)}`, fill: Math.min(1, s.tokens / s.window), level: level(p) };
}

function who(s) {
  const name = Object.hasOwn(AGENT_NAMES, s.app) ? AGENT_NAMES[s.app] : null;
  return name && s.model ? `${name} · ${s.model}` : name;
}

export function sessionView(s, title) {
  if (!s) return null;
  return {
    title,
    who: who(s),
    context: context(s),
    calls: plural(s.calls, "call"),
    compactions: s.compactions != null ? plural(s.compactions, "compaction") : null,
    last: s.last ? `last: ${s.last.trigger}, ${tokens(s.last.pre)} → ${tokens(s.last.post)}` : null,
  };
}

export function sessionOnBar(s, prefs) {
  if (!s) return [];
  const c = context(s);
  return [
    { id: "context", label: "ctx", icon: null, text: c.text, fill: c.fill, level: c.level },
    { id: "calls", label: null, icon: "calls", text: String(s.calls), fill: null, level: "ok" },
    s.compactions != null ? { id: "compactions", label: null, icon: "compactions", text: String(s.compactions), fill: null, level: "ok" } : null,
  ].filter((n) => n && isOnBar(prefs, n.id));
}
