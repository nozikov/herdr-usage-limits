import { div, image, svg } from "gpui-kit";
import { PROVIDERS } from "../providers/index.js";
import { MOD } from "../lib/mod.js";

export const NO_READING = "—";
export const SESSION_TITLE = "This session";
export const DIMMED = 0.55;
export const LEFT_COLUMN_W = 48;
export const PERCENT_COLUMN_W = 36;
export const ICON_SIZE = 13;

export const modIcon = (name) => `mods/${MOD}/icons/${name}.svg`;

const ONE_COLOR_GLYPHS = new Set(PROVIDERS.filter((p) => p.oneColorGlyph).map((p) => p.id));

export function providerIcon(id, path, color) {
  return ONE_COLOR_GLYPHS.has(id) ? svg(path).size(ICON_SIZE).text_color(color) : image(path).size(ICON_SIZE);
}

export function levelColor(level, t) {
  if (level === "hot") return t.ansi1 ?? t.blocked;
  if (level === "warn") return t.ansi3 ?? t.done;
  return t.ansi2 ?? t.working;
}

export function sessionNumberColor(level, text, t) {
  if (level !== "ok") return levelColor(level, t);
  return text === NO_READING ? t.dim : t.foreground;
}

export const limitNumberColor = (level, text, t) => (text === NO_READING ? t.dim : levelColor(level, t));

export function usageBar(width, fill, tick, color, t) {
  return div().relative().w(width).h(4).rounded(2).bg(t.border).flex_none()
    .child(div().absolute().left(0).top(0).h(4).rounded(2).w(Math.round(width * fill)).bg(color))
    .when(tick != null, (b) => b.child(div().absolute().top(-2).left(Math.round(width * tick)).w(1).h(8).bg(t.foreground).opacity(0.75)));
}

const ACTIVE_ACCOUNT_DOT_SIZE = 6;
export const activeAccountDot = (t) => div().size(ACTIVE_ACCOUNT_DOT_SIZE).rounded(ACTIVE_ACCOUNT_DOT_SIZE / 2).bg(t.accent).flex_none();

export const divider = (t) => div().w(1).h(14).bg(t.border).flex_none();

export const rule = (t) => div().h(1).bg(t.border).flex_none();

export function iconButton({ id, icon, label, enabled, onClick }, t) {
  return div().id(id).size(24).rounded(5).flex().items_center().justify_center().tooltip(label)
    .when(enabled, (e) => e.cursor_pointer().hover((s) => s.bg(t.hover)).on_click((_e, cx) => onClick(cx)))
    .child(svg(modIcon(icon)).size(14).text_color(enabled ? t.muted : t.dim));
}

export function numberCell(width, text) {
  return div().w(width).flex_none().flex().justify_end().whitespace_nowrap().child(text);
}
