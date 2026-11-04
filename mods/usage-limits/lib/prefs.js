// What the person chose to see. Opt-out lists, so anything new shows by itself.
// Prefs: { hidden: [providerId], hiddenWindows: ["<providerId>:<windowId>"], showResetTime: bool }
// showResetTime: every window shows its time to reset, not only amber and red ones.

const normalize = (p) => ({
  hidden: [...(p?.hidden ?? [])],
  hiddenWindows: [...(p?.hiddenWindows ?? [])],
  showResetTime: p?.showResetTime === true,
});

// Saved choices win once they exist; until then the layout's props preset them.
export function effectivePrefs(saved, props) {
  return normalize(saved ?? props);
}

export function isShown(prefs, providerId, windowId) {
  if (prefs.hidden.includes(providerId)) return false;
  return windowId == null || !prefs.hiddenWindows.includes(`${providerId}:${windowId}`);
}

const flip = (list, item) => (list.includes(item) ? list.filter((x) => x !== item) : [...list, item]);

export function toggleProvider(prefs, providerId) {
  return { ...normalize(prefs), hidden: flip(prefs.hidden, providerId) };
}

export function toggleWindow(prefs, providerId, windowId) {
  return { ...normalize(prefs), hiddenWindows: flip(prefs.hiddenWindows, `${providerId}:${windowId}`) };
}

export function toggleShowResetTime(prefs) {
  return { ...normalize(prefs), showResetTime: !prefs.showResetTime };
}
