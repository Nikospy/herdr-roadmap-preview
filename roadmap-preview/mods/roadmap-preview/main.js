// roadmap-preview: a 10x roadmap (context/foundation/roadmap.md) as a map, in a pane beside the
// terminal. Milestones run left to right; an item is a station, a line is a prerequisite.
//
// Reading it
//   station   filled green: done · blue with a ring: in progress · bright ring: ready to start ·
//             dim ring: waiting · dim square: parked
//   line      solid: the requirement is met · dashed: it still blocks the item on the right
//   number    red bar and ground: the roadmap's table and the item's own Status disagree, or a
//             closed milestone still lists the item as unfinished
//   top band  what is in progress, what can start, what waits and for what
// Closed milestones are folded to dots (one per item). Click one to unfold it in place: its items
// come from the roadmap file's git history (the last version before the next milestone opened).
//
// Grid (8 px module): header 32, left axis 24, columns 200, rows 104, label 176 wide above its
// station. Type: 16 semibold for "now", 13 for names and titles, 11 for the rest.
//
// Opened with
//   herdr-app do pane.split '{"direction":"right","mod":"roadmap-preview"}'
// It finds the roadmap from props.file, props.folder, or the folder of the terminal beside it.
// In a layout it can sit as a side panel next to Files and Changes: a block with
// { "mod": "roadmap-preview", "props": { "role": "panel" } }; there it follows the project you're in.
// Commands: roadmap-preview.open:/abs/path/roadmap.md (or a project folder),
// roadmap-preview.unfold:5 and roadmap-preview.fold:5 (a closed milestone), roadmap-preview.follow
// (the side panel goes back to following the project you're in).
import { View, div } from "gpui-kit";
import { v_flex, h_flex } from "gpui-base";
import { props, panes, focused, spaces, readTextFile, watchFolder, theme, exec, run, nextCommand, home } from "herdr";
import { parse, resolve, layout, counts } from "./parse.js";

const MOD = "roadmap-preview";
const REL = "context/foundation/roadmap.md";
const AXIS = 24, HEAD = 32, COL = 200, ROW = 104, TOP = 128, LABEL = 176, FOLDED = 64, GAP = 64;
const BIG = 16, MID = 13, SMALL = 11;

const dirname = (p) => p.slice(0, Math.max(1, p.lastIndexOf("/")));
const alpha = (c, a) => String(c ?? "#888888").slice(0, 7) + Math.round(a * 255).toString(16).padStart(2, "0");

export default class RoadmapPreview extends View {
  init(p, cx) {
    this.file = null;      // the roadmap shown
    this.data = null;      // parse() of it
    this.error = null;
    this.loading = true;
    this.past = new Map(); // milestone seq → its items, from git history
    this.open = new Set(); // unfolded closed milestones
    this.watch = null;
    // In a layout's side panel (props.role "panel") it follows the project you're in: every 2 s it
    // checks the focused terminal's folder and space, and switches when they lead to another roadmap.
    this.panel = (props()?.role ?? p?.role) === "panel";
    this.pinned = false;   // an open: command keeps that roadmap until the next one
    this.where = null;
    const hint = props()?.file ?? p?.file ?? props()?.folder ?? p?.folder ?? null;
    if (hint) this.pinned = true;
    this.start(cx, hint);
    if (this.panel) cx.timer.every(2000, (cx) => this.follow(cx));
    cx.spawn(async (cx) => {
      for (;;) {
        const c = String(await nextCommand());
        if (c.startsWith("open:")) { this.pinned = true; this.start(cx, c.slice(5).trim()); }
        // follow: back to the project you're in (the side panel's default).
        else if (c === "follow") { this.pinned = false; this.where = null; this.follow(cx); }
        // unfold:5 / fold:5: a closed milestone, by its number.
        else if (c.startsWith("unfold:")) this.open.add(Number(c.slice(7)));
        else if (c.startsWith("fold:")) this.open.delete(Number(c.slice(5)));
        cx.notify();
      }
    });
  }

  follow(cx) {
    if (this.pinned) return;
    const f = focused(), where = `${f?.space}|${f?.cwd}`;
    if (where === this.where) return;
    this.where = where;
    cx.spawn(async (cx) => {
      const file = await this.locate(null);
      if (file && file !== this.file) this.start(cx, file);
      else if (!file && !this.file) cx.notify();
    });
  }

  myPane() {
    const f = focused(), mine = panes().filter((x) => x.mod === MOD && x.tab === f?.tab);
    return mine.find((x) => x.pane === f?.pane)?.pane ?? (mine.length === 1 ? mine[0].pane : null);
  }

  // A roadmap file, a project folder, or nothing: then the folders of the terminals in this tab.
  start(cx, hint) {
    this.watch?.cancel();
    this.watch = null;
    this.loading = true; this.error = null; this.data = null; this.past = new Map(); this.open = new Set();
    cx.spawn(async (cx) => {
      const file = await this.locate(hint);
      this.file = file;
      if (!file) { this.loading = false; this.error = "none"; return cx.notify(); }
      await this.read(cx);
      this.history(cx);
      const dir = dirname(file);
      this.watch = cx.spawn(async (cx) => {
        for (;;) {
          const changed = await watchFolder(dir);
          if (this.file !== file) return;
          if (changed.some((c) => c === file || c === dir)) await this.read(cx);
        }
      });
    });
  }

  async locate(hint) {
    let h = hint ? String(hint).replace(/^file:\/\//, "") : null;
    if (h?.startsWith("~/")) h = home() + h.slice(1);
    if (h && /\.md$/i.test(h)) return h;
    const f = focused();
    const starts = h ? [h] : [f?.cwd, ...panes().filter((x) => x.tab === f?.tab).map((x) => x.cwd), spaces().find((s) => s.active)?.folder];
    for (const start of starts) {
      let dir = start;
      for (let up = 0; dir && dir.length > 1 && up < 8; up++, dir = dirname(dir)) {
        const text = await readTextFile(`${dir}/${REL}`).catch(() => null);
        if (text !== null) return `${dir}/${REL}`;
      }
    }
    return null;
  }

  async read(cx) {
    const text = await readTextFile(this.file).catch(() => null);
    this.loading = false;
    if (text === null) { this.error = "gone"; this.data = null; return cx.notify(); }
    this.error = null;
    this.data = parse(text);
    cx.notify();
  }

  // Closed milestones: the commits that changed `milestone_seq`; the version just before each one
  // is the last state of the milestone it closed.
  history(cx) {
    if (!this.data?.history.length) return;
    const file = this.file;
    cx.spawn(async (cx) => {
      try {
        const top = await exec("git", ["-C", dirname(file), "rev-parse", "--show-toplevel"]);
        if (top.code !== 0) return;
        const root = top.stdout.trim(), rel = file.startsWith(root + "/") ? file.slice(root.length + 1) : null;
        if (!rel) return;
        const log = await exec("git", ["-C", root, "log", "--format=%H", "-G", "^milestone_seq:", "--", rel]);
        for (const c of log.stdout.split("\n").filter(Boolean)) {
          const old = await exec("git", ["-C", root, "show", `${c}^:${rel}`]);
          if (old.code !== 0 || this.file !== file) continue;
          const was = parse(old.stdout), h = this.data?.history.find((x) => x.seq === was.seq);
          const m = was.milestones.find((x) => x.seq === was.seq);
          if (!h || !m?.items.length || this.past.has(was.seq)) continue;
          // A closed milestone whose items were never ticked: done, and the records disagree.
          for (const it of m.items) {
            if (it.status === "done" || it.status === "parked") continue;
            if (h.state === "closed") { it.status = "done"; it.mismatch = true; } else it.status = "parked";
          }
          resolve(m.items);
          this.past.set(was.seq, m.items);
          cx.notify();
        }
      } catch {}
    });
  }

  // ---- drawing -------------------------------------------------------------------------------

  station(it, x, y, t, c) {
    const ring = (el) => h_flex().absolute().left(x - 11).top(y - 11).size(22).rounded(11).bg(t.background).items_center().justify_center().child(el);
    if (it.kind === "done") return ring(div().size(12).rounded(6).bg(c.done));
    if (it.kind === "active") return h_flex().absolute().left(x - 11).top(y - 11).size(22).rounded(11).bg(t.background)
      .border(2).border_color(c.active).items_center().justify_center().child(div().size(12).rounded(6).bg(c.active));
    if (it.kind === "ready") return ring(div().size(12).rounded(6).border(2).border_color(t.foreground));
    if (it.kind === "parked") return ring(div().size(12).rounded(2).border(1).border_color(c.quiet));
    return ring(div().size(12).rounded(6).border(1).border_color(c.quiet));
  }

  label(it, x, y, h, t, c) {
    const strong = it.kind === "ready" || it.kind === "active";
    const id = it.mismatch
      ? h_flex().child(div().ml(-8).pl(6).pr(6).border_l(2).border_color(c.bad).bg(alpha(c.bad, 0.18)).text_color(t.foreground).child(it.label))
      : div().text_color(t.muted).child(it.label);
    return v_flex().absolute().left(x - 6).bottom(h - y + 14).w(LABEL)
      .child(id.text_size(SMALL).font_semibold().line_height("16px"))
      .child(div().max_h(32).overflow_hidden().text_size(MID).line_height("16px")
        .text_color(strong ? t.foreground : t.muted).child(it.title));
  }

  under(it, x, y, t, c) {
    const text = it.kind === "active" ? (it.note || "in progress")
      : it.kind === "waiting" ? (it.waits.length ? `waits for ${it.waits.join(", ")}` : "blocked")
      : it.kind === "parked" ? "parked"
      : it.kind === "ready" && !["ready", "proposed"].includes(it.status) ? (it.status === "other" ? it.raw : it.status) : "";
    if (!text) return null;
    return div().absolute().left(x - 6).top(y + 12).w(LABEL).truncate().text_size(SMALL).line_height("16px")
      .text_color(it.kind === "active" ? c.active : t.muted).child(text);
  }

  // A prerequisite: right along the source's row, then down or up, then into the target.
  // `lane` shifts the vertical run, so two links into one column don't share a line.
  link(a, b, t, c, lane = 0) {
    const met = a.status === "done", color = met ? c.quiet : t.foreground;
    const hl = (x, y, w) => div().absolute().left(x).top(y - 1).w(w).h(0).border_t(met ? 1 : 2).border_color(color).when(!met, (el) => el.border_dashed());
    const vl = (x, y1, y2) => div().absolute().left(x - 1).top(Math.min(y1, y2)).w(0).h(Math.abs(y2 - y1)).border_l(met ? 1 : 2).border_color(color).when(!met, (el) => el.border_dashed());
    if (a.y === b.y) return [hl(a.x, a.y, b.x - a.x)];
    const xm = b.x - 24 - 8 * lane;
    return [hl(a.x, a.y, xm - a.x), vl(xm, a.y, b.y), hl(xm, b.y, b.x - xm)];
  }

  render(cx) {
    const t = theme();
    const c = { done: t.ansi2, active: t.ansi4, bad: t.ansi1, quiet: t.dim };
    const d = this.data;

    const close = div().id("rm-close").w(16).h(HEAD).flex_none().cursor_pointer().text_size(SMALL).text_color(t.muted)
      .hover((s) => s.text_color(t.foreground)).on_mouse_down("left", (_e, cx) => cx.stop_propagation())
      .on_click(() => {
        if (this.panel) return run("layout.hide", { id: "panel" });
        const pane = this.myPane(); run("pane.close", pane ? { pane } : {});
      })
      .child(h_flex().size_full().items_center().justify_end().child("×"));
    const frame = (header, ...rest) => v_flex().id("roadmap-preview").size_full().min_h(0).overflow_hidden()
      .bg(t.background).text_color(t.foreground).text_size(MID).child(header).children(rest);
    const bar = (...kids) => h_flex().h(HEAD).flex_none().px(AXIS).gap(16).items_center().bg(t.chrome).children(kids).child(close);
    const message = (title, text) => frame(bar(div().flex_1().text_color(t.muted).child("Roadmap")),
      v_flex().flex_1().p(AXIS).gap(8).child(div().text_size(BIG).font_semibold().child(title))
        .child(div().max_w(528).text_color(t.muted).line_height("20px").child(text)));

    if (this.loading) return message("Loading the roadmap…", "");
    if (this.error === "none") return message("No roadmap here", this.panel
      ? `Switch to a terminal inside a project with ${REL}. The panel follows the project you're in.`
      : `Open this pane beside a terminal that sits in a project with ${REL}, or run ${MOD}.open:/path/to/project.`);
    if (this.error === "gone" || !d) return message("The roadmap file is gone", this.file ?? "");

    // Every milestone, oldest first: the closed ones (folded or not), then the open and queued.
    const blocks = [
      ...d.history.map((h) => ({ ...h, past: true, items: this.past.get(h.seq) ?? null, unfolded: this.open.has(h.seq) && this.past.has(h.seq) })),
      ...d.milestones.map((m) => ({ ...m, past: false, unfolded: true })),
    ];
    const live = d.milestones.flatMap((m) => m.items);
    const known = [...blocks.flatMap((b) => b.items ?? [])];
    const total = counts(known), wrong = live.filter((i) => i.mismatch).length;
    if (!live.length && !d.history.length) return message("This roadmap has no items",
      "The file has no “At a glance” table with ID, Prerequisites and Status columns, and no item sections.");

    // Geometry first: each block's width and each item's place.
    let x = AXIS, rows = 1;
    for (const b of blocks) {
      b.x = x;
      if (!b.unfolded) { x += FOLDED; continue; }
      const g = layout(b.items);
      rows = Math.max(rows, g.rows);
      for (const it of b.items) { it.x = b.x + 6 + it.d * COL; it.y = TOP + it.r * ROW; }
      b.w = g.cols * COL;
      x += b.w + (b.past ? GAP - 16 : GAP);
    }
    const lastPast = blocks.filter((b) => b.past).pop();
    if (lastPast && !lastPast.unfolded) for (const b of blocks.filter((b) => !b.past)) { b.x += 48; for (const it of b.items) it.x += 48; }
    const W = Math.max(x + 48, 480), H = TOP + (rows - 1) * ROW + 56;

    const els = [];
    for (const b of blocks) {
      const n = b.items ? counts(b.items) : null;
      const count = n ? (n.done === n.total ? String(n.total) : `${n.done} of ${n.total}`) : "";
      const state = b.past ? `${b.state} ${b.date}` : b.state;
      if (!b.unfolded) {
        const can = Boolean(b.items);
        els.push(v_flex().id(`rm-m-${b.seq}`).absolute().left(b.x - 4).top(0).w(FOLDED - 8).pl(4).text_size(SMALL).text_color(t.muted)
          .when(can, (el) => el.cursor_pointer().hover((s) => s.text_color(t.foreground))
            .on_click((_e, cx) => { this.open.add(b.seq); cx.notify(); }))
          .child(div().line_height("16px").child(`${can ? "▸ " : ""}M-${b.seq}`))
          .child(div().h(20))
          .child(div().line_height("16px").child(count || " "))
          .child(h_flex().mt(12).w(40).flex_wrap().gap(4).children((b.items ?? []).map((it) =>
            div().size(6).rounded(3).flex_none().when(it.status === "done", (el) => el.bg(alpha(c.done, 0.8)))
              .when(it.status !== "done", (el) => el.border(1).border_color(c.quiet))))));
        continue;
      }
      els.push(v_flex().id(`rm-m-${b.seq}`).absolute().left(b.x).top(0).w(Math.max(b.w, 240))
        .when(b.past, (el) => el.cursor_pointer().on_click((_e, cx) => { this.open.delete(b.seq); cx.notify(); }))
        .child(div().text_size(SMALL).line_height("16px").text_color(t.muted).child(`${b.past ? "▾ " : ""}M-${b.seq} · ${state}`))
        .child(div().mt(4).h(16).truncate().line_height("16px").when(!b.past, (el) => el.font_semibold())
          .text_color(b.past ? t.muted : t.foreground).child(b.name || (b.state === "queued" ? "Queued" : " ")))
        .child(div().mt(4).text_size(SMALL).line_height("16px").text_color(t.muted).child(n.total ? `${n.done} of ${n.total}` : "no items")));
      const mine = new Map(b.items.map((it) => [it.id, it]));
      for (const it of b.items) it.pre.filter((p) => mine.has(p) && mine.get(p).d < it.d).forEach((p, lane) => els.push(...this.link(mine.get(p), it, t, c, lane)));
      for (const it of b.items) {
        els.push(this.station(it, it.x, it.y, t, c), this.label(it, it.x, it.y, H, t, c));
        const u = this.under(it, it.x, it.y, t, c);
        if (u) els.push(u);
      }
    }

    // The band on top: now, ready to start, waiting.
    const now = live.filter((i) => i.kind === "active"), ready = live.filter((i) => i.kind === "ready"), wait = live.filter((i) => i.kind === "waiting");
    const cap = (s) => div().text_size(SMALL).line_height("16px").text_color(t.muted).child(s.toUpperCase());
    const none = div().line_height("24px").text_color(t.muted).child("nothing");
    const band = h_flex().flex_none().items_start().gap(GAP).px(AXIS).py(24).bg(t.chrome).border_t(1).border_b(1).border_color(t.border)
      .child(v_flex().flex_none().max_w(560).gap(4).child(cap("Now")).children(now.length ? now.slice(0, 4).map((i) =>
        h_flex().gap(8).items_center().child(div().truncate().text_size(BIG).font_semibold().line_height("24px").child(`${i.label} ${i.title}`))
          .when(Boolean(i.note), (el) => el.child(div().flex_none().text_color(c.active).child(i.note)))) : [none])
        .when(now.length > 4, (el) => el.child(div().text_size(SMALL).text_color(t.muted).child(`and ${now.length - 4} more`))))
      .child(v_flex().flex_none().max_w(320).gap(4).child(cap("Ready to start"))
        .child(ready.length ? div().line_height("24px").child(ready.map((i) => i.label).join(" · ")) : none))
      .child(v_flex().flex_1().min_w(0).gap(4).child(cap("Waiting"))
        .child(wait.length ? div().line_height("24px").text_color(t.muted)
          .child(wait.map((i) => `${i.label} for ${i.waits.join(", ") || "a decision"}`).join(" · ")) : none));

    const header = bar(
      div().flex_none().child(d.project),
      div().flex_1().min_w(0).truncate().text_size(SMALL).text_color(t.dim).child(this.file.replace(home(), "~")),
      div().flex_none().text_size(SMALL).text_color(t.muted).child(`${total.done} of ${total.total} done`),
      div().flex_none().text_size(SMALL).text_color(wrong ? c.bad : t.muted).child(wrong === 1 ? "1 mismatch" : `${wrong} mismatches`));

    const key = (mark, text) => h_flex().flex_none().gap(8).items_center().child(mark).child(text);
    const dot = (el) => h_flex().size(12).items_center().justify_center().child(el);
    const footer = h_flex().h(HEAD).flex_none().px(AXIS).gap(24).items_center().overflow_hidden().border_t(1).border_color(t.border)
      .text_size(SMALL).text_color(t.muted)
      .child(key(dot(div().size(10).rounded(5).bg(c.active)), "in progress"))
      .child(key(dot(div().size(12).rounded(6).border(2).border_color(t.foreground)), "ready to start"))
      .child(key(dot(div().size(12).rounded(6).border(1).border_color(c.quiet)), "waiting"))
      .child(key(dot(div().size(12).rounded(6).bg(c.done)), "done"))
      .child(key(dot(div().size(12).rounded(2).border(1).border_color(c.quiet)), "parked"))
      .child(key(div().w(24).h(0).border_t(1).border_color(c.quiet), "requirement met"))
      .child(key(div().w(24).h(0).border_t(2).border_dashed().border_color(t.foreground), "still blocking"))
      .child(key(div().pl(6).pr(6).border_l(2).border_color(c.bad).bg(alpha(c.bad, 0.18)).font_semibold().text_color(t.foreground).child("S-01"), "records disagree"));

    const map = div().id("rm-scroll").flex_1().min_h(0).overflow_scroll()
      .child(div().relative().flex_none().w(W).h(H + 32).child(div().absolute().left(0).top(32).w(W).h(H).children(els)));

    return frame(header, band, map, footer);
  }
}
