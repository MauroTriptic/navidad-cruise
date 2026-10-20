// Shared crew board for Pueblo's Yuletide Voyage:
// votes, plans, "where I'm at" check-ins, achievements, witnesses, equipped titles,
// proof photos (the images themselves live in photo.mjs) and Defining Moment pins.
import { getStore } from "@netlify/blobs";

const CREW = ["Mauro", "Syd", "Abby", "Carly"];
const ID = /^[a-z0-9-]{1,40}$/;
const ACH_ID = /^a-[a-z0-9-]{1,40}$/;
const VENUE_ID = /^v-[a-z0-9-]{1,40}$/;
const PHOTO_REF = /^n:[a-z0-9]{8,24}$/;
// Side quests ticked on the first version of the site, carried over to their achievement.
const LEGACY = {
  cq1: "a-cabo-arch", cq2: "a-cabo-seal", cq3: "a-cabo-marg", cq4: "a-cabo-pelican", cq5: "a-cabo-sunset", cq6: "a-cabo-tacos",
  mq1: "a-maz-pulmonia", mq2: "a-maz-glass", mq3: "a-maz-dive", mq4: "a-maz-pacifico", mq5: "a-maz-blueline", mq6: "a-maz-banda",
  pq1: "a-pv-seahorse", pq2: "a-pv-whale", pq3: "a-pv-huichol", pq4: "a-pv-agave", pq5: "a-pv-pier", pq6: "a-pv-mirador",
  sq1: "a-sh-movie", sq2: "a-sh-sing", sq3: "a-sh-ginger", sq4: "a-sh-casino", sq5: "a-sh-toast", sq6: "a-sh-gps",
};
const empty = () => ({ picks: {}, plans: [], status: {}, ach: {}, titles: {}, proofs: [], pins: {} });
const clip = (v, n) => String(v ?? "").trim().slice(0, n);

function migrate(st) {
  st.picks ||= {}; st.plans ||= []; st.status ||= {}; st.ach ||= {}; st.titles ||= {}; st.proofs ||= []; st.pins ||= {};
  if (st.quests) {
    for (const [q, names] of Object.entries(st.quests)) {
      const id = LEGACY[q];
      if (!id) continue;
      for (const n of names || []) {
        if (!CREW.includes(n)) continue;
        st.ach[n] ||= {};
        st.ach[n][id] ||= { ts: Date.now() };
      }
    }
    delete st.quests;
  }
  return st;
}

function apply(st, op) {
  const who = op.who;
  if (!CREW.includes(who)) throw new Error("Pick your name first");
  switch (op.op) {
    case "pick": {
      if (!ID.test(String(op.id))) throw new Error("Unknown item");
      const set = new Set(st.picks[op.id] || []);
      op.on ? set.add(who) : set.delete(who);
      if (set.size) st.picks[op.id] = [...set]; else delete st.picks[op.id];
      return;
    }
    case "status": {
      const where = clip(op.where, 80);
      if (!where) throw new Error("Empty status");
      const venue = VENUE_ID.test(String(op.venue || "")) ? op.venue : null;
      st.status[who] = { who, where, venue, ts: Date.now() };
      return;
    }
    case "plan": {
      const what = clip(op.what, 90);
      if (!what) throw new Error("Empty plan");
      if (st.plans.length >= 300) throw new Error("Too many plans");
      const id = /^[a-z0-9]{4,12}$/.test(String(op.pid || "")) ? op.pid : crypto.randomUUID().slice(0, 8);
      st.plans.push({ id, day: clip(op.day, 4), time: clip(op.time, 12), what, who, ts: Date.now() });
      return;
    }
    case "unplan":
      st.plans = st.plans.filter(p => !(p.id === op.id && p.who === who));
      return;
    case "ach": {
      if (!ACH_ID.test(String(op.id))) throw new Error("Unknown achievement");
      const mine = (st.ach[who] ||= {});
      if (op.on) {
        if (!mine[op.id]) mine[op.id] = op.pending ? { ts: Date.now(), pending: true } : { ts: Date.now() };
      } else {
        delete mine[op.id];
        if (st.titles[who] === op.id) delete st.titles[who];
      }
      return;
    }
    case "witness": {
      if (!CREW.includes(op.target) || op.target === who) throw new Error("Can't witness that");
      const e = st.ach[op.target]?.[op.id];
      if (e && e.pending) { delete e.pending; e.wit = who; e.ts = Date.now(); }
      return;
    }
    case "title": {
      if (!op.id) { delete st.titles[who]; return; }
      const e = st.ach[who]?.[op.id];
      if (e && !e.pending) st.titles[who] = op.id;
      return;
    }
    case "proof": {
      if (!CREW.includes(op.about)) throw new Error("Unknown profile");
      if (!PHOTO_REF.test(String(op.photo || ""))) throw new Error("Bad photo");
      if (st.proofs.length >= 400) throw new Error("Too many photos");
      const id = /^[a-z0-9]{4,12}$/.test(String(op.pid || "")) ? op.pid : crypto.randomUUID().slice(0, 8);
      st.proofs.push({ id, about: op.about, by: who, ach: ACH_ID.test(String(op.ach || "")) ? op.ach : null, caption: clip(op.caption, 140), photo: op.photo, ts: Date.now() });
      return;
    }
    case "unproof": {
      const p = st.proofs.find(x => x.id === op.id);
      if (!p || (p.by !== who && p.about !== who)) return;
      st.proofs = st.proofs.filter(x => x !== p);
      if (st.pins[p.about] === p.id) delete st.pins[p.about];
      return;
    }
    case "pin": {
      if (!op.id) { delete st.pins[who]; return; }
      if (st.proofs.some(x => x.id === op.id && x.about === who)) st.pins[who] = op.id;
      return;
    }
    default:
      throw new Error("Unknown action");
  }
}

export default async (req) => {
  const store = getStore({ name: "navidad-crew", consistency: "strong" });
  const headers = { "cache-control": "no-store" };

  if (req.method === "GET") {
    const data = await store.get("state", { type: "json" });
    return Response.json(migrate(data || empty()), { headers });
  }
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });

  let op;
  try { op = await req.json(); } catch { return new Response("Bad request", { status: 400 }); }

  // Read, change, write only if nobody else wrote in between; retry a few times if they did.
  for (let i = 0; i < 6; i++) {
    const cur = await store.getWithMetadata("state", { type: "json" });
    const st = migrate(cur?.data || empty());
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
