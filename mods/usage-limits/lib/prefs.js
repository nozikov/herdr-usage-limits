// What the person chose to see. Opt-out lists, so anything new shows by itself.
// Prefs: { hidden: [providerId], hiddenWindows: ["<providerId>:<windowId>"] }

const lists = (p) => ({ hidden: [...(p?.hidden ?? [])], hiddenWindows: [...(p?.hiddenWindows ?? [])] });

// Saved choices win once they exist; until then the layout's props preset them.
export function effectivePrefs(saved, props) {
  return saved ? lists(saved) : lists(props);
}

export function isShown(prefs, providerId, windowId) {
  if (prefs.hidden.includes(providerId)) return false;
  return windowId == null || !prefs.hiddenWindows.includes(`${providerId}:${windowId}`);
}

const flip = (list, item) => (list.includes(item) ? list.filter((x) => x !== item) : [...list, item]);

export function toggleProvider(prefs, providerId) {
  return { ...lists(prefs), hidden: flip(prefs.hidden, providerId) };
}

export function toggleWindow(prefs, providerId, windowId) {
  return { ...lists(prefs), hiddenWindows: flip(prefs.hiddenWindows, `${providerId}:${windowId}`) };
}
