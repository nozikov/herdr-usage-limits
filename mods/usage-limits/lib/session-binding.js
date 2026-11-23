import { parseSession } from "./session.js";

const ID = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/;
const MAX_CHOICES = 12;
const MAX_TEXT = 100;
const CHOICES_EXIT_CODE = 2;
const NO_READING_EXIT_CODE = 1;
export const KEY_BINDINGS = "usage-limits.session-bindings";

const isSessionId = (id) => ID.test(id ?? "");
const isOwnChoice = (b, pid) => b?.pid === pid && isSessionId(b.id) && typeof b.identity === "string" && Boolean(b.identity);
const isPatchbayChoice = (p, pid) => p?.pid === pid && p.manual === true && isSessionId(p.id);
const hasStartTime = (p) => Number.isSafeInteger(p.startedAt) && p.startedAt > 0;

export function codexBinding(bindings, terminal, pid, patchbay, boot) {
  const own = bindings?.[terminal];
  if (isOwnChoice(own, pid)) return { id: own.id, identity: own.identity, manual: true };
  const p = patchbay?.[terminal];
  if (!isPatchbayChoice(p, pid)) return null;
  if (hasStartTime(p)) return { id: p.id, identity: `started:${p.startedAt}`, manual: false };
  if (boot && p.boot === boot) return { id: p.id, identity: "", manual: false };
  return null;
}

const isChoiceList = (v, pid) => v?.pid === pid && typeof v.identity === "string" && Boolean(v.identity) && v.identity.length <= MAX_TEXT && Array.isArray(v.choices);
const isChoice = (c) => c && isSessionId(c.id) && typeof c.title === "string";

export function parseSessionChoices(text, pid) {
  try {
    const v = JSON.parse(text);
    if (!isChoiceList(v, pid)) return null;
    const choices = v.choices.filter(isChoice).slice(0, MAX_CHOICES).map((c) => ({ id: c.id, title: c.title.slice(0, MAX_TEXT) }));
    return { pid, identity: v.identity, choices };
  } catch { return null; }
}

const ACCOUNT_LINE = /(?:^|\s)account=([1-9]\d{0,2})(?:\s|$)/;
const ACCOUNT_EXIT_CODES = [0, NO_READING_EXIT_CODE];

export function sessionAccount(result, app) {
  if (app !== "claude" || !ACCOUNT_EXIT_CODES.includes(result.code)) return null;
  const m = ACCOUNT_LINE.exec(result.stdout ?? "");
  return m ? Number(m[1]) : null;
}

export function sessionReadResult(result, app, binding, pid, title) {
  const data = result.code === 0 ? parseSession(result.stdout, app) : null;
  const account = sessionAccount(result, app);
  return {
    session: data ? { data, title } : null,
    choices: app === "codex" && result.code === CHOICES_EXIT_CODE ? parseSessionChoices(result.stdout, pid) : null,
    manual: Boolean(binding?.manual),
    ...(account != null ? { account } : {}),
  };
}
