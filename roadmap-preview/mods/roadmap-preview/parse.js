// Reads a 10x roadmap (context/foundation/roadmap.md) into milestones and items, and lays the
// items of one milestone out on a grid. Pure: no herdr imports, so `node` can run it.

const IDS = /[FS]-\d+/g;
const KEYS = { implemented: "done", gotowe: "done", paused: "parked", abandoned: "parked", "in progress": "in-progress" };

// "done (2026-11-09, archived in …)" → { key: "done", note: "2026-11-09, archived in …" }
export function status(raw) {
  const text = String(raw ?? "").replace(/[`*]/g, "").trim();
  const note = /\(([^)]*)\)/.exec(text)?.[1]?.trim() ?? "";
  const head = text.replace(/\(.*$/, "").toLowerCase().replace(/^([fs]-\d+[\s…–.,-]*)+/, "").trim();
  const m = /^(done|in[- ]progress|planning|ready|proposed|blocked|parked|paused|abandoned|implemented|gotowe)\b/.exec(head);
  const key = m ? (KEYS[m[1]] ?? m[1]) : "other";
  return { key, note, text };
}

const cells = (line) => line.split("|").slice(1, -1).map((c) => c.trim());

export function parse(md) {
  const lines = String(md ?? "").split("\n");
  const fm = {};
  if (lines[0]?.trim() === "---") {
    for (let i = 1; i < lines.length && lines[i].trim() !== "---"; i++) {
      const m = /^([a-z_]+):\s*(.*?)\s*(#.*)?$/.exec(lines[i]);
      if (m) fm[m[1]] = m[2].replace(/^"(.*)"$/, "$1");
    }
  }
  const seq = Number(fm.milestone_seq) || 1;
  const charter = /\*\*M-?0*(\d+):\s*(.+?)\*\*\s*—\s*Status:\s*([\w-]+)/.exec(md ?? "");
  const out = {
    project: fm.project || "Roadmap", seq, legacy: !fm.milestone_id,
    milestones: [{ seq, name: charter?.[2] ?? fm.milestone_id ?? "", state: fm.milestone_status === "done" ? "done" : "open", items: [] }],
    history: [],
  };
  const byId = new Map(), order = [];
  const item = (id, ms) => {
    if (!byId.has(id)) { byId.set(id, { id, title: "", ms, table: null, body: null, tablePre: null, bodyPre: null }); order.push(id); }
    return byId.get(id);
  };

  // The index table: the first table whose head names ID, Prerequisites and Status.
  for (let i = 0; i < lines.length; i++) {
    if (!lines[i].startsWith("|")) continue;
    const head = cells(lines[i]).map((c) => c.toLowerCase());
    const cId = head.indexOf("id"), cPre = head.findIndex((c) => c.startsWith("prerequisite")), cSt = head.indexOf("status");
    if (cId < 0 || cPre < 0 || cSt < 0) continue;
    const cOut = head.findIndex((c) => c.startsWith("outcome"));
    for (let j = i + 2; j < lines.length && lines[j].startsWith("|"); j++) {
      const c = cells(lines[j]);
      if (!/^[FS]-\d+$/.test(c[cId] ?? "")) continue;
      const it = item(c[cId], seq);
      it.table = c[cSt]; it.tablePre = c[cPre];
      if (cOut >= 0) it.outcome = c[cOut].replace(/^\(foundation\)\s*/, "");
    }
    break;
  }

  // The bodies: "### S-49: Title" with "- **Status:** …" under "## Slices", or under
  // "## Slices of M-7 (queued)", which opens another milestone. History lines sit under their own head.
  let ms = seq, cur = null, h2 = "";
  for (const line of lines) {
    if (line.startsWith("## ")) {
      h2 = line.slice(3).trim(); cur = null;
      const q = /\bM-?0*(\d+)\b/.exec(h2);
      ms = q && !/^milestone/i.test(h2) ? Number(q[1]) : seq;
      if (ms !== seq && !out.milestones.some((m) => m.seq === ms))
        out.milestones.push({ seq: ms, name: "", state: /\(([^)]+)\)/.exec(h2)?.[1] ?? "queued", items: [] });
      continue;
    }
    if (/^milestone history/i.test(h2)) {
      const m = /^- \*\*M-?0*(\d+):\s*(.+?)\*\*.*?—\s*(closed|parked|abandoned|done)\s+(\d{4})-(\d\d)-(\d\d)/.exec(line);
      if (m) out.history.push({ seq: Number(m[1]), name: m[2], state: m[3] === "done" ? "closed" : m[3], date: `${Number(m[6])}.${m[5]}`, items: null });
      continue;
    }
    const h = /^### ([FS]-\d+)(?:\s*[…–-]+\s*[FS]-(\d+))?:\s*(.+)$/.exec(line);
    if (h) {
      cur = item(h[1], ms); cur.ms = ms; cur.title = h[3].trim();
      if (h[2]) cur.label = `${h[1]}…${h[2]}`;
      continue;
    }
    if (line.startsWith("#")) { cur = null; continue; }
    if (!cur) continue;
    const f = /^- \*\*(Status|Prerequisites|Change ID):\*\*\s*(.*)$/.exec(line);
    if (!f) continue;
    if (f[1] === "Status") cur.body = f[2]; else if (f[1] === "Prerequisites") cur.bodyPre = f[2]; else cur.change = f[2].replace(/`/g, "").trim();
  }

  for (const id of order) {
    const it = byId.get(id);
    const t = it.table === null ? null : status(it.table), b = it.body === null ? null : status(it.body);
    const s = b ?? t ?? status("");
    it.status = s.key; it.note = s.note; it.raw = s.text;
    it.mismatch = Boolean(t && b && t.key !== b.key);
    it.pre = [...new Set((it.bodyPre ?? it.tablePre ?? "").match(IDS) ?? [])].filter((p) => p !== id && byId.has(p));
    it.title ||= it.outcome ? it.outcome[0].toUpperCase() + it.outcome.slice(1) : id;
    it.label ||= id;
    (out.milestones.find((m) => m.seq === it.ms) ?? out.milestones[0]).items.push(it);
  }
  out.milestones.sort((a, b) => a.seq - b.seq);
  out.history = out.history.filter((h) => !out.milestones.some((m) => m.seq === h.seq)).sort((a, b) => a.seq - b.seq);
  for (const m of out.milestones) resolve(m.items, byId);
  return out;
}

// What an item is for the eye: done, active, parked, waiting (something before it isn't done) or ready.
export function resolve(items, byId = new Map(items.map((i) => [i.id, i]))) {
  for (const it of items) {
    it.waits = it.pre.filter((p) => byId.get(p)?.status !== "done");
    it.kind = it.status === "done" ? "done" : it.status === "in-progress" ? "active" : it.status === "parked" ? "parked"
      : it.waits.length || it.status === "blocked" ? "waiting" : "ready";
  }
  return items;
}

// Columns by dependency depth; a chain keeps its row, a branch takes the next one; items with no
// links at all fill a block under the chains, five to a column.
export function layout(items) {
  const mine = new Map(items.map((i) => [i.id, i]));
  const pre = (it) => it.pre.filter((p) => mine.has(p));
  const depth = (it, seen = new Set()) => {
    if (it.d != null) return it.d;
    if (seen.has(it.id)) return 0;
    seen.add(it.id);
    const ps = pre(it);
    return (it.d = ps.length ? 1 + Math.max(...ps.map((p) => depth(mine.get(p), seen))) : 0);
  };
  for (const it of items) { it.d = null; it.r = null; }
  items.forEach((it) => depth(it));
  const linked = new Set();
  for (const it of items) for (const p of pre(it)) { linked.add(it.id); linked.add(p); }
  let rows = 0;
  const place = (it, row) => {
    it.r = row;
    let first = true;
    for (const kid of items) {
      if (kid.r != null || pre(kid)[0] !== it.id) continue;
      place(kid, first ? row : rows++);
      first = false;
    }
  };
  for (const it of items) if (linked.has(it.id) && it.r == null && !pre(it).length) place(it, rows++);
  for (const it of items) if (linked.has(it.id) && it.r == null) place(it, rows++); // a cycle's leftovers
  const loose = items.filter((it) => !linked.has(it.id));
  const lcols = Math.ceil(loose.length / 5), lrows = lcols ? Math.ceil(loose.length / lcols) : 0;
  loose.forEach((it, n) => { it.d = Math.floor(n / lrows); it.r = rows + (n % lrows); });
  const cols = Math.max(1, lcols, ...items.filter((it) => linked.has(it.id)).map((it) => it.d + 1));
  return { cols, rows: rows + lrows };
}

export const counts = (items) => ({ done: items.filter((i) => i.status === "done").length, total: items.length });
