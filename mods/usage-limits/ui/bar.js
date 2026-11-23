import { div, svg } from "gpui-kit";
import { HoverCard, h_flex } from "gpui-base";
import { DIMMED, ICON_SIZE, activeAccountDot, divider, levelColor, limitNumberColor, modIcon, providerIcon, sessionNumberColor, usageBar } from "./kit.js";
import { DENSITY } from "../lib/view.js";
import { PANEL_CLOSE_DELAY_MS } from "../lib/mod.js";

const BAR_W = 30;
const PANEL_OPEN_DELAY_MS = 350;

const ACCOUNT_TAG_GAP = 4;

const label = (text, t) => div().text_size(10.5).text_color(t.dim).child(text);

const accountTag = (tag, t) => div().flex_none().whitespace_nowrap().text_size(10.5).text_color(t.foreground).font_semibold().child(tag);

function groupIcon(g, t) {
  const icon = providerIcon(g.providerId, g.icon, t.foreground);
  if (g.tag == null) return icon;
  return h_flex().gap(ACCOUNT_TAG_GAP).items_center().flex_none().child(icon).child(accountTag(g.tag, t));
}

function segment(s, density, t) {
  return h_flex().gap(5).items_center().flex_none()
    .when(density < DENSITY.NO_LABELS, (e) => e.child(label(s.short, t)))
    .when(density === DENSITY.FULL, (e) => e.child(usageBar(BAR_W, s.fill, s.tick, levelColor(s.level, t), t)))
    .child(div().whitespace_nowrap().text_color(limitNumberColor(s.level, s.text, t)).child(density === DENSITY.BRIEF ? s.brief : s.text));
}

function spendSegment(today, t) {
  return h_flex().gap(5).items_center().flex_none()
    .child(label("today", t))
    .child(div().whitespace_nowrap().text_color(t.foreground).child(today));
}

function providerGroup(g, density, t) {
  return h_flex().id(`ul-${g.providerId}`).gap(density === DENSITY.FULL ? 10 : 8).items_center().flex_none()
    .opacity(g.dim ? DIMMED : 1)
    .when(g.active === true, (e) => e.child(activeAccountDot(t)))
    .child(groupIcon(g, t))
    .when(g.mark != null, (e) => e.child(div().text_color(t.dim).child(g.mark)))
    .children(g.segments.map((s) => segment(s, density, t)))
    .when(g.spend != null, (e) => e.child(spendSegment(g.spend, t)));
}

function sessionSegment(n, density, t) {
  return h_flex().gap(5).items_center().flex_none()
    .when(n.label != null, (e) => e.child(label(n.label, t)))
    .when(n.icon != null, (e) => e.child(svg(modIcon(n.icon)).size(ICON_SIZE).text_color(t.dim)))
    .when(n.fill != null && density === DENSITY.FULL, (e) => e.child(usageBar(BAR_W, n.fill, null, levelColor(n.level, t), t)))
    .child(div().whitespace_nowrap().text_color(n.fill != null ? levelColor(n.level, t) : sessionNumberColor(n.level, n.text, t)).child(n.text));
}

function sessionNumbers(numbers, density, t) {
  return h_flex().gap(density === DENSITY.FULL ? 10 : 8).items_center().flex_none()
    .children(numbers.map((n) => sessionSegment(n, density, t)));
}

function limitsTrigger({ model, numbers, density, onHover }, t) {
  const content = h_flex().id("ul-content").gap(14).items_center().flex_none().on_hover(onHover);
  if (numbers.length) {
    content.child(sessionNumbers(numbers, density, t));
    if (!model.empty) content.child(divider(t));
  }
  if (model.empty) content.child(div().id("ul-empty").child(svg(modIcon("gauge")).size(14)));
  model.groups.forEach((g, i) => {
    if (i > 0) content.child(divider(t));
    content.child(providerGroup(g, density, t));
  });
  return content;
}

export function statusBar(bar, t) {
  return h_flex().id("root").size_full().px(12).items_center().justify_end().overflow_hidden()
    .bg(t.chrome).when(bar.border !== false, (e) => e.border_t(1).border_color(t.border)).text_size(11.8).text_color(t.muted)
    .on_size_change(bar.onResize)
    .child(HoverCard.new("ul-panel").anchor("bottom_right").open_delay(PANEL_OPEN_DELAY_MS).close_delay(PANEL_CLOSE_DELAY_MS)
      .trigger(limitsTrigger(bar, t))
      .content(bar.panel));
}
