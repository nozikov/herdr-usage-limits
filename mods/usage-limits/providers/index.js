import claude, { claudeAccount } from "./claude.js";
import codex from "./codex.js";
import agy from "./agy.js";
import opencode from "./opencode.js";
import opencodeGo from "./opencode-go.js";
import pi from "./pi.js";
import { accountTag, claudeAccounts } from "../lib/accounts.js";

export const PROVIDERS = [claude, codex, agy, opencode, opencodeGo, pi];

const OTHERS = PROVIDERS.filter((p) => p !== claude);
const MARKED_FROM_ACCOUNTS = 2;

const asProvider = (account, i) => claudeAccount(account, i === 0 ? null : accountTag(account.name));

export function providersFor(props) {
  const accounts = claudeAccounts(props?.claudeAccounts, OTHERS.map((p) => p.id));
  if (accounts.length === 0) return PROVIDERS;
  return [...accounts.map(asProvider), ...OTHERS];
}

const accountsOf = (providers) => providers.filter((p) => p.configDir != null);

export const claudeConfigDirs = (providers) => accountsOf(providers).map((p) => p.configDir);

export const marksActiveAccount = (providers) => accountsOf(providers).length >= MARKED_FROM_ACCOUNTS;

export function activeAccountId(providers, place) {
  if (!marksActiveAccount(providers) || !Number.isInteger(place)) return null;
  const accounts = accountsOf(providers);
  return accounts[place - 1]?.id ?? null;
}
