// Usage limits: every Claude Code / Codex limit window in the status bar,
// with a checkbox popup (click the block) to choose what shows.
//
// Data comes from small helpers that run the CLIs themselves (helpers/*.sh);
// this mod never reads a token. Everything below main.js is pure and tested.
import { View, div, image, svg } from "gpui-kit";
import { h_flex, v_flex } from "gpui-base";
import { exec, theme, run, props, shared, setShared, appHome, openOverlay, closeOverlay } from "herdr";
import { PROVIDERS } from "./providers/index.js";
import { barModel, chooseDensity, tooltipText } from "./lib/view.js";
import { effectivePrefs, isShown, toggleProvider, toggleWindow } from "./lib/prefs.js";

const MOD = "usage-limits";
const KEY_STATE = "usage-limits.state";
const KEY_PREFS = "usage-limits.prefs";
const KEY_REFRESH = "usage-limits.refresh";
const FETCH_EVERY = 5 * 60;       // s, installed providers
const MISSING_EVERY = 60 * 60;    // s, not-installed providers
const REFRESH_COOLDOWN = 30;      // s
const BAR_W = 30;

const now = () => Math.floor(Date.now() / 1000);
const states = () => shared(KEY_STATE) ?? {};
const presets = (p) => ({ hidden: p?.hidden ?? [], hiddenWindows: p?.hiddenWindows ?? [] });

function levelColor(level, t) {
  if (level === "hot") return t.ansi1 ?? t.blocked;
  if (level === "warn") return t.ansi3 ?? t.done;
  return t.ansi2 ?? t.working;
}

export default class UsageLimits extends View {
  init(p, cx) {
    this.isSettings = p?.view === "settings";
    if (this.isSettings) return;
    this.width = 0;
    this.lastFetch = {};   // providerId → epoch s of last attempt
    this.busy = {};        // providerId → fetch in flight
    this.seenRefresh = shared(KEY_REFRESH) ?? 0;
    this.tick(cx, true);
    cx.timer.every(60 * 1000, (cx) => this.tick(cx, false));
  }

  // Fetch whatever is due, then redraw (countdowns and pace move every minute).
  tick(cx, force) {
    const prefs = this.prefs();
    const st = states();
    for (const p of PROVIDERS) {
      if (!isShown(prefs, p.id)) continue;
      const every = st[p.id]?.installed === false ? MISSING_EVERY : FETCH_EVERY;
      if (force || now() - (this.lastFetch[p.id] ?? 0) >= every) this.fetch(p, cx);
    }
    cx.notify();
  }

  fetch(p, cx) {
    if (this.busy[p.id]) return;
    this.busy[p.id] = true;
    this.lastFetch[p.id] = now();
    cx.spawn(async (cx) => {
      let next;
      const prev = states()[p.id] ?? { report: null, lastGood: null, installed: null };
      try {
        const r = await exec("sh", [`${appHome()}/mods/${MOD}/${p.helper}`]);
        if (r.code === 127) {
          next = { report: null, lastGood: prev.lastGood, installed: false };
        } else {
          const report = p.parse(r.stdout, now());
          next = { report, lastGood: report.status === "ok" ? report : prev.lastGood, installed: true };
        }
      } catch (e) {
        next = { ...prev, report: { status: "error", message: String(e?.message ?? e), plan: null, observedAt: now(), source: p.helper, windows: [] } };
      }
      this.busy[p.id] = false;
      setShared(KEY_STATE, { ...states(), [p.id]: next });
      cx.notify();
    });
  }

  prefs() {
    return effectivePrefs(shared(KEY_PREFS), this.isSettings ? props()?.presets : props());
  }

  openSettings() {
    const rows = PROVIDERS.reduce((n, p) => {
      const s = states()[p.id];
      return n + 1 + ((s?.report?.status === "ok" ? s.report : s?.lastGood)?.windows.length ?? 0);
    }, 0);
    openOverlay({ kind: "popup", mod: MOD, props: { view: "settings", presets: presets(props()) }, width: 300, height: 96 + rows * 24 });
  }

  // ---------- status bar ----------

  segment(s, density, t) {
    const color = levelColor(s.level, t);
    return h_flex().gap(5).items_center().flex_none()
      .when(density < 2, (e) => e.child(div().text_size(10.5).text_color(t.dim).child(s.short)))
      .when(density === 0, (e) => e.child(
        div().relative().w(BAR_W).h(4).rounded(2).bg(t.border)
          .child(div().absolute().left(0).top(0).h(4).rounded(2).w(Math.round(BAR_W * s.fill)).bg(color))
          .when(s.tick != null, (b) => b.child(div().absolute().top(-2).left(Math.round(BAR_W * s.tick)).w(1).h(8).bg(t.foreground).opacity(0.75)))))
      .child(div().whitespace_nowrap().text_color(s.level === "ok" ? (s.text === "—" ? t.dim : t.foreground) : color).child(s.text));
  }

  renderBar(cx) {
    const t = theme();
    const st = states();
    const model = barModel(st, this.prefs(), now());
    const density = this.width ? chooseDensity(model, this.width - 24) : 0;
    const root = h_flex().id("root").size_full().px(12).gap(14).items_center().justify_end().overflow_hidden()
      .bg(t.chrome).border_t(1).border_color(t.border).text_size(11.8).text_color(t.muted)
      .on_size_change((size, cx) => { this.width = size.width; cx.notify(); })
      .on_click(() => this.openSettings());
    if (model.empty) {
      return root.child(div().id("ul-empty").tooltip("Usage limits: everything is hidden. Click to choose.").child(svg(`mods/${MOD}/icons/gauge.svg`).size(14)));
    }
    model.groups.forEach((g, i) => {
      const p = PROVIDERS.find((x) => x.id === g.providerId);
      if (i > 0) root.child(div().w(1).h(14).bg(t.border).flex_none());
      root.child(
        h_flex().id(`ul-${g.providerId}`).gap(density === 0 ? 10 : 8).items_center().flex_none()
          .opacity(g.dim ? 0.55 : 1)
          .tooltip(tooltipText(p, st[g.providerId] ?? { report: null, lastGood: null, installed: null }, now()))
          .child(image(g.icon).size(13))
          .when(g.mark != null, (e) => e.child(div().text_color(t.dim).child(g.mark)))
          .children(g.segments.map((s) => this.segment(s, density, t))));
    });
    return root;
  }

  // ---------- settings popup ----------

  check(id, on, label, onToggle, t, indent = 0, extra = null) {
    return h_flex().id(id).gap(8).items_center().pl(indent).py(3).rounded(4).cursor_pointer()
      .hover((s) => s.bg(t.hover))
      .on_click((_e, cx) => { onToggle(); cx.notify(); })
      .child(div().size(13).rounded(3).border(1).border_color(on ? t.accent : t.input).bg(on ? t.accent : t.popover)
        .flex().items_center().justify_center().text_size(9).text_color(t.accent_foreground).child(on ? "✓" : ""))
      .children(label)
      .when(extra != null, (e) => e.child(div().text_color(t.dim).truncate().child(extra)));
  }

  renderSettings(cx) {
    const t = theme();
    const prefs = this.prefs();
    const st = states();
    const save = (p) => setShared(KEY_PREFS, p);
    const sinceRefresh = now() - Math.floor((shared(KEY_REFRESH) ?? 0) / 1000);
    const cooling = sinceRefresh < REFRESH_COOLDOWN;
    const rows = [];
    for (const p of PROVIDERS) {
      const s = st[p.id] ?? {};
      const on = isShown(prefs, p.id);
      const reason = s.installed === false ? "not installed" : s.report && s.report.status !== "ok" ? s.report.message : null;
      rows.push(this.check(`p-${p.id}`, on, [image(p.icon).size(13), div().text_color(s.installed === false ? t.dim : t.foreground).child(p.name)],
        () => save(toggleProvider(this.prefs(), p.id)), t, 0, reason));
      const windows = (s.report?.status === "ok" ? s.report : s.lastGood)?.windows ?? [];
      for (const w of windows) {
        rows.push(this.check(`w-${p.id}-${w.id}`, on && isShown(prefs, p.id, w.id), [div().text_color(on ? t.muted : t.dim).child(w.long)],
          () => save(toggleWindow(this.prefs(), p.id, w.id)), t, 21));
      }
    }
    return v_flex().id("settings").size_full().p(12).gap(6).bg(t.popover).text_size(12.5).text_color(t.foreground)
      .child(h_flex().justify_between().items_center()
        .child(div().font_semibold().child("Usage limits"))
        .child(div().id("refresh").px(8).py(3).rounded(5).border(1).border_color(t.border).text_size(11.5)
          .text_color(cooling ? t.dim : t.foreground)
          .when(!cooling, (e) => e.cursor_pointer().hover((s) => s.bg(t.hover))
            .on_click((_e, cx) => { setShared(KEY_REFRESH, Date.now()); cx.notify(); }))
          .child(cooling ? "Refreshing…" : "Refresh now")))
      .child(v_flex().gap(1).children(rows))
      .child(div().flex_1())
      .child(div().text_size(10.5).text_color(t.dim).child("Data: claude CLI · codex app-server. No tokens are read."));
  }

  render(cx) {
    if (this.isSettings) return this.renderSettings(cx);
    const asked = shared(KEY_REFRESH) ?? 0;
    if (asked !== this.seenRefresh) {
      this.seenRefresh = asked;
      for (const p of PROVIDERS) if (isShown(this.prefs(), p.id)) this.fetch(p, cx);
    }
    return this.renderBar(cx);
  }
}
