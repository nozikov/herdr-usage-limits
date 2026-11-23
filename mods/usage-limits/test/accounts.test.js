import { test } from "node:test";
import assert from "node:assert/strict";
import { accountTag, claudeAccounts } from "../lib/accounts.js";
import { PROVIDERS, activeAccountId, claudeConfigDirs, providersFor } from "../providers/index.js";
import { barModel, cardModel, chooseDensity } from "../lib/view.js";
import { effectivePrefs } from "../lib/prefs.js";
import { settingsRows, spendBarOn } from "../lib/settings.js";
import { NOW, claudeReply } from "./_util.js";

const TWO = { claudeAccounts: [{ configDir: "~/.claude" }, { configDir: "~/.claude-work" }] };
const ids = (ps) => ps.map((p) => p.id);

test("accounts: no list, or nothing usable in it, gives today's providers as they are", () => {
  for (const props of [undefined, null, {}, { claudeAccounts: [] }, { claudeAccounts: "nope" }, { claudeAccounts: [{}, { configDir: "" }, { configDir: "  " }, null, 7] }]) {
    const ps = providersFor(props);
    assert.equal(ps, PROVIDERS, JSON.stringify(props));
    assert.deepEqual(claudeConfigDirs(ps), []);
  }
});

test("accounts: two accounts become two Claude providers in place of the one, first keeps claude", () => {
  const ps = providersFor(TWO);
  assert.deepEqual(ps.map((p) => [p.id, p.name]), [["claude", "Claude"], ["claude-work", "Claude Work"], ["codex", "Codex"], ["agy", "Antigravity"], ["opencode", "OpenCode"], ["opencode-go", "OpenCode Go"], ["pi", "Pi"]]);
  assert.deepEqual(ps.slice(0, 2).map((p) => p.args), [["~/.claude"], ["~/.claude-work"]]);
  assert.deepEqual(claudeConfigDirs(ps), ["~/.claude", "~/.claude-work"]);
  assert.equal(ps[1].helper, PROVIDERS[0].helper);
  assert.equal(ps[1].icon, PROVIDERS[0].icon);
  assert.equal(ps[1].parse(claudeReply({ limits: [{ kind: "session", percent: 40, resets_at: null }] }), NOW).windows[0].percent, 40);
});

test("accounts: the first account has no tag on the bar, the others a short one from their name", () => {
  const ps = providersFor({ claudeAccounts: [{ configDir: "~/.claude" }, { configDir: "~/.claude-work", name: "Claude Work" }, { configDir: "/opt/team", name: "Team Box" }] });
  assert.deepEqual(ps.slice(0, 3).map((p) => p.tag ?? null), [null, "work", "team box"]);
  assert.equal(Object.hasOwn(ps[0], "tag"), false);
  assert.equal(Object.hasOwn(PROVIDERS[0], "args"), false);
});

test("accounts: one account is asked with its folder and keeps today's id, name and look", () => {
  const ps = providersFor({ claudeAccounts: [{ configDir: "~/.claude-work" }] });
  assert.deepEqual(ids(ps), ids(PROVIDERS));
  assert.deepEqual([ps[0].name, ps[0].args, ps[0].tag], ["Claude", ["~/.claude-work"], undefined]);
});

test("account tag: a leading Claude goes, the rest trimmed and lowercased", () => {
  assert.equal(accountTag("Claude Work"), "work");
  assert.equal(accountTag("claude  Side "), "side");
  assert.equal(accountTag("Personal"), "personal");
  assert.equal(accountTag("Claude"), null);
  assert.equal(accountTag(""), null);
});

test("accounts: explicit id and name win; duplicates, option-looking dirs and taken ids are dropped", () => {
  assert.deepEqual(claudeAccounts([
    { configDir: "~/.claude" },
    { configDir: "~/.claude-work", id: "work", name: "Claude Work" },
    { configDir: "~/.claude-work2", id: "work" },
    { configDir: "--help" },
    { configDir: "-x" },
    { configDir: "/srv/other", id: "codex" },
    { configDir: "/opt/claude-home/" },
  ], ["codex", "opencode", "opencode-go", "pi"]), [
    { id: "claude", name: "Claude", configDir: "~/.claude" },
    { id: "work", name: "Claude Work", configDir: "~/.claude-work" },
    { id: "claude-home", name: "Claude Home", configDir: "/opt/claude-home/" },
  ]);
});

test("accounts: an id that isn't a plain slug is replaced; a folder with no suffix gets its place", () => {
  assert.deepEqual(claudeAccounts([
    { configDir: "~/.claude" },
    { configDir: "~/.config/claude", id: "Bad Id!" },
    { configDir: "~" },
    { configDir: "~/.claude--Side_Box--" },
  ]).map((a) => [a.id, a.name]), [["claude", "Claude"], ["claude-2", "Claude 2"], ["claude-3", "Claude 3"], ["claude-side-box", "Claude Side-box"]]);
});

test("active account: the place session.sh names, only with two accounts or more", () => {
  const ps = providersFor(TWO);
  assert.equal(activeAccountId(ps, 1), "claude");
  assert.equal(activeAccountId(ps, 2), "claude-work");
  assert.equal(activeAccountId(ps, 3), null);
  assert.equal(activeAccountId(ps, null), null);
  assert.equal(activeAccountId(providersFor({ claudeAccounts: [{ configDir: "~/.claude-work" }] }), 1), null);
  assert.equal(activeAccountId(PROVIDERS, 1), null);
});

const reading = (percent) => ({ status: "ok", plan: "max", observedAt: NOW, source: "t", windows: [{ id: "session", short: "5h", long: "5-hour", percent, resetsAt: null, durationSec: null }] });
const TWO_STATES = { claude: { report: reading(10), lastGood: null, installed: true }, "claude-work": { report: reading(70), lastGood: null, installed: true } };
const pick = (groups, keys) => groups.slice(0, 2).map((g) => Object.fromEntries(keys.filter((k) => Object.hasOwn(g, k)).map((k) => [k, g[k]])));

test("bar: each account its own group, the others tagged, the focused session's one marked", () => {
  const ps = providersFor(TWO);
  const keys = ["providerId", "name", "tag", "active"];
  assert.deepEqual(pick(barModel(TWO_STATES, effectivePrefs(), NOW, ps).groups, keys), [
    { providerId: "claude", name: "Claude" },
    { providerId: "claude-work", name: "Claude Work", tag: "work" },
  ]);
  assert.deepEqual(pick(barModel(TWO_STATES, effectivePrefs(), NOW, ps, "claude-work").groups, keys), [
    { providerId: "claude", name: "Claude" },
    { providerId: "claude-work", name: "Claude Work", tag: "work", active: true },
  ]);
  assert.deepEqual(pick(barModel(TWO_STATES, effectivePrefs(), NOW, ps, "claude").groups, keys)[0], { providerId: "claude", name: "Claude", active: true });
});

test("panel: each account its own group with its plan, the focused session's one marked", () => {
  const ps = providersFor(TWO);
  const groups = cardModel(TWO_STATES, NOW, ps, effectivePrefs(), "claude-work").groups;
  assert.deepEqual(pick(groups, ["providerId", "name", "plan", "active", "tag"]), [
    { providerId: "claude", name: "Claude", plan: "Max" },
    { providerId: "claude-work", name: "Claude Work", plan: "Max", active: true },
  ]);
  assert.equal(Object.hasOwn(cardModel(TWO_STATES, NOW, ps, effectivePrefs()).groups[1], "active"), false);
});

test("settings: each account is a provider row of its own", () => {
  assert.deepEqual(settingsRows(effectivePrefs(), TWO_STATES, providersFor(TWO)).map((r) => r.provider.name).slice(0, 3), ["Claude", "Claude Work", "Codex"]);
});

test("density: an account's tag and the in-use dot take room", () => {
  const ps = providersFor(TWO);
  const base = { groups: barModel(TWO_STATES, effectivePrefs(), NOW, ps).groups.map(({ tag: _tag, ...g }) => g) };
  const tagged = barModel(TWO_STATES, effectivePrefs(), NOW, ps);
  const marked = barModel(TWO_STATES, effectivePrefs(), NOW, ps, "claude-work");
  const fits = (model) => [...Array(400).keys()].find((w) => chooseDensity(model, w) === 0);
  assert.ok(fits(tagged) > fits(base), "the tag needs room");
  assert.ok(fits(marked) > fits(tagged), "the dot needs room");
  assert.ok(fits(tagged) - fits(base) >= 6.5 * "work".length, "about the tag's letters");
});

test("spend default: a second account's limits count as limits", () => {
  const ps = providersFor(TWO);
  const states = { claude: { report: null, lastGood: null, installed: false }, "claude-work": TWO_STATES["claude-work"], codex: { report: null, lastGood: null, installed: false }, "opencode-go": { report: null, lastGood: null, installed: false }, agy: { report: null, lastGood: null, installed: false } };
  assert.equal(spendBarOn(effectivePrefs(), states, "opencode", ps), false);
});
