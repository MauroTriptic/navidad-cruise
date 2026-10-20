// Stores and serves the crew's "Proof of Legendary Behaviour" photos for Pueblo's Yuletide Voyage.
import { getStore } from "@netlify/blobs";

const ID = /^[a-z0-9]{8,24}$/;
const TYPES = /^image\/(jpeg|png|webp)$/;

export default async (req) => {
  const store = getStore({ name: "navidad-photos", consistency: "strong" });
  const id = new URL(req.url).searchParams.get("id") || "";

  if (req.method === "GET") {
    if (!ID.test(id)) return new Response("Not found", { status: 404 });
    const entry = await store.getWithMetadata(id, { type: "arrayBuffer" });
    if (!entry) return new Response("Not found", { status: 404 });
    return new Response(entry.data, {
      headers: { "content-type": entry.metadata?.type || "image/jpeg", "cache-control": "public, max-age=31536000, immutable" },
    });
  }

  if (req.method === "POST") {
    const type = (req.headers.get("content-type") || "").split(";")[0].trim();
    if (!TYPES.test(type)) return new Response("Photos only", { status: 415 });
    const body = await req.arrayBuffer();
    if (!body.byteLength) return new Response("Empty", { status: 400 });
    if (body.byteLength > 5_000_000) return new Response("Photo too large", { status: 413 });
    const newId = crypto.randomUUID().replace(/-/g, "").slice(0, 16);
    await store.set(newId, body, { metadata: { type } });
    return Response.json({ id: newId });
  }

  if (req.method === "DELETE") {
    if (ID.test(id)) await store.delete(id);
    return new Response(null, { status: 204 });
  }

  return new Response("Method not allowed", { status: 405 });
};

export const config = { path: "/api/photo" };
