// Shared crew board: votes, side quests, plans and "where I'm at" for the Navidad cruise site.
import { getStore } from "@netlify/blobs";

const CREW = ["Mauro", "Syd", "Abby", "Carly"];
const ID = /^[a-z0-9-]{1,40}$/;
const empty = () => ({ picks: {}, quests: {}, plans: [], status: {} });
const clip = (v, n) => String(v ?? "").trim().slice(0, n);

function apply(st, op) {
  const who = op.who;
  if (!CREW.includes(who)) throw new Error("Pick your name first");
  switch (op.op) {
    case "pick":
    case "quest": {
      if (!ID.test(String(op.id))) throw new Error("Unknown item");
      const key = op.op === "pick" ? "picks" : "quests";
      const set = new Set(st[key][op.id] || []);
      op.on ? set.add(who) : set.delete(who);
      if (set.size) st[key][op.id] = [...set]; else delete st[key][op.id];
      return;
    }
    case "status": {
      const where = clip(op.where, 60);
      if (!where) throw new Error("Empty status");
      st.status[who] = { who, where, ts: Date.now() };
      return;
    }
    case "plan": {
      const what = clip(op.what, 90);
      if (!what) throw new Error("Empty plan");
      if (st.plans.length >= 300) throw new Error("Too many plans");
      st.plans.push({ id: crypto.randomUUID().slice(0, 8), day: clip(op.day, 4), time: clip(op.time, 12), what, who, ts: Date.now() });
      return;
    }
    case "unplan":
      st.plans = st.plans.filter(p => !(p.id === op.id && p.who === who));
      return;
    default:
      throw new Error("Unknown action");
  }
}

export default async (req) => {
  const store = getStore({ name: "navidad-crew", consistency: "strong" });
  const headers = { "cache-control": "no-store" };

  if (req.method === "GET") {
    const data = await store.get("state", { type: "json" });
    return Response.json(data || empty(), { headers });
  }
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });

  let op;
  try { op = await req.json(); } catch { return new Response("Bad request", { status: 400 }); }

  // Read, change, write only if nobody else wrote in between; retry a few times if they did.
  for (let i = 0; i < 6; i++) {
    const cur = await store.getWithMetadata("state", { type: "json" });
    const st = cur?.data || empty();
    try { apply(st, op); } catch (e) { return new Response(e.message, { status: 400 }); }
    const res = cur
      ? await store.setJSON("state", st, { onlyIfMatch: cur.etag })
      : await store.setJSON("state", st, { onlyIfNew: true });
    if (res?.modified !== false) return Response.json(st, { headers });
    await new Promise(r => setTimeout(r, 50 + Math.random() * 200));
  }
  return new Response("Busy, try again", { status: 409 });
};

export const config = { path: "/api/crew" };
