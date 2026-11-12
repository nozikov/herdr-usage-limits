// Provider states for the "nothing changes for a Claude + Codex user" guard in view.test.js.
// test/fixtures/view-before.json is cardModel/barModel of these, from the code before spend.
import claude from "../providers/claude.js";
import codex from "../providers/codex.js";
import { read } from "./_util.js";

export const NOW = Date.UTC(2026, 10, 4, 8, 0, 0) / 1000;
const ok = (p, file, at = NOW) => ({ ...p.parse(read(file), at), observedAt: at });
const fresh = () => ({
  claude: { report: ok(claude, "claude-get-usage.max.json"), lastGood: ok(claude, "claude-get-usage.max.json"), installed: true },
  codex: { report: ok(codex, "codex-app-server.plus.json"), lastGood: ok(codex, "codex-app-server.plus.json"), installed: true },
});
const error = (message) => ({ status: "error", message, plan: null, observedAt: NOW, source: "x", windows: [] });

export const scenarios = {
  fresh,
  failingWithLastGood: () => {
    const s = fresh();
    s.claude.lastGood = { ...s.claude.lastGood, observedAt: NOW - 1200 };
    s.claude.report = error("Not logged in");
    return s;
  },
  failingNoLastGood: () => ({ ...fresh(), codex: { report: error("offline"), lastGood: null, installed: true } }),
  stale: () => {
    const s = fresh();
    s.codex.report = { ...s.codex.report, observedAt: NOW - 901 };
    return s;
  },
  loadingAndMissing: () => ({ claude: { report: null, lastGood: null, installed: null }, codex: { report: null, lastGood: null, installed: false } }),
  noState: () => ({}),
};
