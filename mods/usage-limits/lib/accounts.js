const FIRST_ID = "claude";
const FIRST_NAME = "Claude";
const SLUG = /^[a-z0-9-]+$/;
const LEADING_CLAUDE = /^claude/i;
const FOLDER_PREFIX = /^\.?claude/i;

const text = (v) => (typeof v === "string" ? v.trim() : "");
const isPath = (dir) => dir !== "" && !dir.startsWith("-");
const capitalized = (s) => s.charAt(0).toUpperCase() + s.slice(1);

function folderSuffix(configDir) {
  const folder = configDir.replace(/\/+$/, "").split("/").pop();
  return folder.replace(FOLDER_PREFIX, "").replace(/[^A-Za-z0-9]+/g, "-").replace(/^-+|-+$/g, "").toLowerCase();
}

function idFor(entry, place, suffix) {
  if (SLUG.test(text(entry.id))) return text(entry.id);
  if (place === 1) return FIRST_ID;
  return `${FIRST_ID}-${suffix || place}`;
}

function nameFor(entry, id, place, suffix) {
  if (text(entry.name)) return text(entry.name);
  if (id === FIRST_ID) return FIRST_NAME;
  return `${FIRST_NAME} ${suffix ? capitalized(suffix) : place}`;
}

export function claudeAccounts(list, takenIds = []) {
  if (!Array.isArray(list)) return [];
  const out = [];
  for (const entry of list) {
    const configDir = text(entry?.configDir);
    if (!isPath(configDir)) continue;
    const place = out.length + 1;
    const suffix = folderSuffix(configDir);
    const id = idFor(entry, place, suffix);
    if (takenIds.includes(id) || out.some((a) => a.id === id)) continue;
    out.push({ id, name: nameFor(entry, id, place, suffix), configDir });
  }
  return out;
}

export function accountTag(name) {
  const tag = text(name).replace(LEADING_CLAUDE, "").trim().toLowerCase();
  return tag || null;
}
