import { appHome, exec, shared } from "herdr";
import { runSh } from "./sh.js";
import { KEY_BINDINGS, codexBinding, sessionReadResult } from "../lib/session-binding.js";
import { MOD } from "../lib/mod.js";

const SPEND_HELPER_DEADLINE_MS = 15 * 1000;
const SESSION_HELPER_DEADLINE_MS = 15 * 1000;
const SESSION_MODE_BY_APP = { "claude-code": "claude", codex: "codex", opencode: "opencode", pi: "pi" };
const CLAUDE_MODE = SESSION_MODE_BY_APP["claude-code"];
const NO_SESSION = { session: null, choices: null, manual: false };

const helperPath = (helper) => `${appHome()}/mods/${MOD}/${helper}`;
const folderName = (cwd) => (cwd ?? "").split("/").pop();

export function runProviderHelper(p) {
  const args = [helperPath(p.helper), ...(p.args ?? [])];
  return p.kind === "spend" ? runSh(args, { timeout: SPEND_HELPER_DEADLINE_MS }) : runSh(args);
}

function bindingFor(app, terminal, pid) {
  if (app !== "codex") return null;
  return codexBinding(shared(KEY_BINDINGS), terminal, pid, shared("patchbay.chat.bindings"), shared("patchbay.sessions")?.boot);
}

export async function readTerminalSession(terminal, { claudeDirs = [], numbers = true } = {}) {
  try {
    const info = JSON.parse((await exec("hc", ["get", terminal])).stdout);
    const app = SESSION_MODE_BY_APP[info.status?.app];
    const pid = info.foreground?.pid;
    if (!app || !pid || (!numbers && app !== CLAUDE_MODE)) return NO_SESSION;
    const binding = bindingFor(app, terminal, pid);
    const args = [helperPath("helpers/session.sh"), app, String(pid)];
    if (binding) args.push(binding.id, binding.identity);
    if (app === CLAUDE_MODE) args.push(...claudeDirs);
    const result = await runSh(args, { timeout: SESSION_HELPER_DEADLINE_MS });
    return sessionReadResult(result, app, binding, pid, folderName(info.cwd));
  } catch {
    return NO_SESSION;
  }
}
