import { div, svg } from "gpui-kit";
import { h_flex, v_flex } from "gpui-base";
import { DIMMED, LEFT_COLUMN_W, NO_READING, PERCENT_COLUMN_W, activeAccountDot, levelColor, limitNumberColor, modIcon, numberCell, providerIcon, usageBar } from "./kit.js";

const PANEL_BAR_W = 110;
const FOLDED_BAR_W = 44;
const THIS_SESSION = "this session";

const thisSession = (folded, t) => h_flex().gap(4).items_center().flex_none().text_size(10.5).text_color(t.accent)
  .child(activeAccountDot(t)).when(!folded, (e) => e.child(THIS_SESSION));

function cardRow(r, providerId, t) {
  return v_flex().gap(3)
    .child(h_flex().id(`ul-row-${providerId}-${r.id}`).gap(8).items_center()
      .when(r.hint != null, (e) => e.tooltip(r.hint))
      .child(div().flex_1().min_w(0).truncate().text_color(t.muted).child(r.long))
      .child(usageBar(PANEL_BAR_W, r.fill, r.tick, levelColor(r.level, t), t))
      .child(numberCell(PERCENT_COLUMN_W, r.percent).text_color(limitNumberColor(r.level, r.percent, t)))
      .child(numberCell(LEFT_COLUMN_W, r.left).text_size(11).text_color(t.dim)))
    .when(r.detail !== "", (e) => e.child(div().text_size(11).text_color(t.dim).truncate().child(r.detail)));
}

function groupBody(g, t) {
  const body = [];
  if (g.age != null) body.push(div().text_size(11).text_color(t.dim).child(g.age));
  body.push(v_flex().gap(6).opacity(g.dim ? DIMMED : 1).children(g.rows.map((r) => cardRow(r, g.providerId, t))));
  return body;
}

export function failure(text, t) {
  return div().flex_1().min_w(0).truncate().text_size(11).text_color(levelColor("hot", t)).child(`! ${text}`);
}

export function rightLabel(text, t) {
  return div().flex_1().min_w(0).flex().justify_end()
    .child(div().min_w(0).truncate().text_size(11).text_color(t.dim).child(text));
}

function header(g, arrows, panel) {
  const { t, act } = panel;
  const id = g.providerId;
  const arrow = g.folded ? "chevron-right" : "chevron-down";
  return h_flex().id(`ul-head-${id}`).gap(6).items_center().cursor_pointer()
    .on_hover((on, cx) => act.hoverHeader(id, on, cx))
    .on_click((_e, cx) => act.fold(id, cx))
    .child(providerIcon(id, g.icon, t.foreground))
    .child(div().flex_none().font_semibold().child(g.name))
    .when(g.plan != null, (e) => e.child(div().flex_none().px(5).rounded(4).bg(t.raised).text_size(10).text_color(t.accent).child(g.plan)))
    .when(g.active === true, (e) => e.child(thisSession(g.folded, t)))
    .when(g.folded || arrows || panel.hovered === id, (e) => e.child(svg(modIcon(arrow)).size(12).text_color(t.dim)));
}

function foldedNumbers(g, s, t) {
  const opacity = g.dim ? DIMMED : 1;
  return h_flex().gap(8).items_center().flex_none()
    .when(!g.failed, (e) => e.child(div().opacity(opacity).child(usageBar(FOLDED_BAR_W, s.fill, s.tick, levelColor(s.level, t), t))))
    .child(numberCell(PERCENT_COLUMN_W, s.percent).opacity(opacity).text_color(limitNumberColor(s.level, s.percent, t)))
    .child(numberCell(LEFT_COLUMN_W, s.left).opacity(opacity).text_size(11).text_color(t.dim));
}

function groupWithoutSummary(g, head, panel) {
  const { t } = panel;
  if (g.folded && g.failed) return v_flex().gap(8).child(head.child(failure(g.status, t)));
  head.child(div().flex_1())
    .when(g.failed || g.active !== true, (e) => e.child(div().min_w(0).truncate().text_size(11).text_color(g.failed ? levelColor("hot", t) : t.dim).child(g.status)));
  if (g.folded) return v_flex().gap(8).child(head);
  return v_flex().gap(8).child(head).children(groupBody(g, t));
}

export function limitsGroup(g, arrows, panel) {
  const head = header(g, arrows, panel);
  const s = g.folded ? g.summary : null;
  if (!s) return groupWithoutSummary(g, head, panel);
  const { t } = panel;
  return v_flex().gap(8).child(head
    .child(g.failed ? failure(g.status, t) : rightLabel(g.foldedLabel ?? s.long, t))
    .child(foldedNumbers(g, s, t)));
}

export function spendLine(g, t) {
  const opacity = g.failed ? DIMMED : 1;
  return h_flex().gap(6).items_center().opacity(g.dim && !g.failed ? DIMMED : 1)
    .child(providerIcon(g.providerId, g.icon, t.foreground))
    .child(div().flex_none().font_semibold().child(g.name))
    .child(g.failed ? failure(g.status, t) : rightLabel("Tokens today / 7d", t))
    .child(h_flex().gap(8).items_center().flex_none()
      .child(numberCell(PERCENT_COLUMN_W, g.today ?? NO_READING).opacity(opacity).text_color(g.today == null ? t.dim : t.foreground))
      .child(numberCell(LEFT_COLUMN_W, g.week ?? NO_READING).opacity(opacity).text_color(g.week == null ? t.dim : t.muted)));
}
