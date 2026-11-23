const listOf = (p, key) => [...(p?.[key] ?? [])];

const normalize = (p) => ({
  hidden: listOf(p, "hidden"),
  hiddenWindows: listOf(p, "hiddenWindows"),
  shownWindows: listOf(p, "shownWindows"),
  showResetTime: p?.showResetTime === true,
  showBars: p?.showBars !== false,
  sessionOnBar: listOf(p, "sessionOnBar"),
  panelHidden: listOf(p, "panelHidden"),
  folded: listOf(p, "folded"),
  spendOnBar: { ...(p?.spendOnBar ?? {}) },
});

export function effectivePrefs(saved, layoutPresets) {
  return normalize(saved ?? layoutPresets);
}

const windowKey = (providerId, windowId) => `${providerId}:${windowId}`;

export function isShown(prefs, providerId, windowId, offBarByDefault = false) {
  if (prefs.hidden.includes(providerId)) return false;
  if (windowId == null) return true;
  const key = windowKey(providerId, windowId);
  return offBarByDefault ? (prefs.shownWindows ?? []).includes(key) : !prefs.hiddenWindows.includes(key);
}

const flip = (list, item) => (list.includes(item) ? list.filter((x) => x !== item) : [...list, item]);

export function toggleProvider(prefs, providerId) {
  return { ...normalize(prefs), hidden: flip(prefs.hidden, providerId) };
}

export function toggleWindow(prefs, providerId, windowId, offBarByDefault = false) {
  const n = normalize(prefs);
  const key = windowKey(providerId, windowId);
  return offBarByDefault ? { ...n, shownWindows: flip(n.shownWindows, key) } : { ...n, hiddenWindows: flip(n.hiddenWindows, key) };
}

export function toggleShowResetTime(prefs) {
  return { ...normalize(prefs), showResetTime: !prefs.showResetTime };
}

export function toggleShowBars(prefs) {
  return { ...normalize(prefs), showBars: !prefs.showBars };
}

export const isOnBar = (prefs, row) => prefs.sessionOnBar.includes(row);

export function toggleOnBar(prefs, row) {
  return { ...normalize(prefs), sessionOnBar: flip(prefs.sessionOnBar, row) };
}

export const inPanel = (prefs, id) => !(prefs.panelHidden ?? []).includes(id);

export function togglePanel(prefs, id) {
  const n = normalize(prefs);
  return { ...n, panelHidden: flip(n.panelHidden, id) };
}

export const isFolded = (prefs, providerId) => (prefs.folded ?? []).includes(providerId);

export function toggleFolded(prefs, providerId) {
  const n = normalize(prefs);
  return { ...n, folded: flip(n.folded, providerId) };
}

export function spendOnBar(prefs, providerId, byDefault) {
  const v = prefs.spendOnBar?.[providerId];
  return typeof v === "boolean" ? v : byDefault;
}

export function toggleSpendOnBar(prefs, providerId, current) {
  const n = normalize(prefs);
  return { ...n, spendOnBar: { ...n.spendOnBar, [providerId]: !current } };
}
