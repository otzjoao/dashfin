const crypto = require("crypto");
const U = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
const K = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;

const redis = async (cmd) => {
  const r = await fetch(U, {
    method: "POST",
    headers: { Authorization: "Bearer " + K },
    body: JSON.stringify(cmd),
  });
  return (await r.json()).result;
};

const ok = (a, b) => {
  const x = Buffer.from(String(a || "")), y = Buffer.from(String(b || ""));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
};

module.exports = async (req, res) => {
  const pw = process.env.DASH_PASSWORD;
  if (!pw || !ok(req.headers["x-pass"], pw)) return res.status(401).json({ error: "unauthorized" });

  const KEY = req.query && req.query.k === "plan" ? "plan" : "tx";

  if (req.method === "GET") {
    const r = (await redis(["HGETALL", KEY])) || [];
    const out = [];
    for (let i = 1; i < r.length; i += 2) out.push(JSON.parse(r[i]));
    return res.json(out);
  }

  const b = req.body || {};
  if (req.method === "POST") {
    const list = Array.isArray(b.items) ? b.items : [b];
    const args = [];
    for (const x of list.slice(0, 500)) {
      const a = Number(x.a);
      if (!x.i || !x.s || !["e", "s"].includes(x.t) || !(a > 0)) continue;
      const base = { i: Number(x.i), s: String(x.s).slice(0, 80), c: String(x.c || "Outros").slice(0, 40), t: x.t, a };
      if (KEY === "plan") {
        args.push(String(x.i), JSON.stringify({
          ...base, s: base.s.slice(0, 60),
          day: Math.min(31, Math.max(0, parseInt(x.day) || 0)),
          kw: String(x.kw || "").slice(0, 40),
          m: /^\d{4}-\d{2}$/.test(x.m) ? x.m : "",
        }));
      } else {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(x.d)) continue;
        args.push(String(x.i), JSON.stringify({ ...base, d: x.d, b: String(x.b || "Outro").slice(0, 20) }));
      }
    }
    if (!args.length) return res.status(400).json({ error: "invalid" });
    await redis(["HSET", KEY, ...args]);
    return res.json({ ok: true, n: args.length / 2 });
  }
  if (req.method === "DELETE") {
    const ids = (Array.isArray(b.ids) ? b.ids : [b.i]).slice(0, 500).map(String);
    if (!ids.length) return res.status(400).json({ error: "invalid" });
    await redis(["HDEL", KEY, ...ids]);
    return res.json({ ok: true });
  }
  res.status(405).end();
};
