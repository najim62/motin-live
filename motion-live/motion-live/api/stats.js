// Fetches YouTube stats, stores a snapshot history in Upstash Redis, returns both.
const HANDLES = [
  "IShowSpeed","mkbhd","gregisenberg","loganpaulvlogs","jakepaul","djakademikstv2",
  "garyvee","daveportnoy","ThePatMcAfeeShow","bryanjohnson","druski"
];
const YT = process.env.YOUTUBE_API_KEY;
const RURL = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
const RTOK = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
let memIds = null; // warm-instance cache of handle -> channel id

const redis = async (cmds) => {
  if (!RURL) return null;
  const r = await fetch(RURL + "/pipeline", {
    method: "POST",
    headers: { Authorization: "Bearer " + RTOK },
    body: JSON.stringify(cmds),
  });
  return (await r.json()).map((x) => x.result);
};
const yt = async (params) => {
  const u = new URL("https://www.googleapis.com/youtube/v3/channels");
  Object.entries({ ...params, key: YT }).forEach(([k, v]) => u.searchParams.set(k, v));
  const r = await fetch(u);
  const j = await r.json();
  if (j.error) throw new Error(j.error.message);
  return j.items || [];
};

async function getIds(errors) {
  if (memIds) return memIds;
  const saved = await redis([["GET", "ids"]]);
  let ids = saved && saved[0] ? JSON.parse(saved[0]) : {};
  for (const h of HANDLES) {
    if (ids[h]) continue;
    try {
      const it = await yt({ part: "id", forHandle: "@" + h }); // 1 quota unit, done once per handle
      if (it[0]) ids[h] = it[0].id; else errors.push("Handle not found: " + h);
    } catch (e) { errors.push(h + ": " + e.message); }
  }
  await redis([["SET", "ids", JSON.stringify(ids)]]);
  return (memIds = ids);
}

module.exports = async (req, res) => {
  try {
    if (!YT) throw new Error("YOUTUBE_API_KEY is not set");
    const errors = [];
    const ids = await getIds(errors);
    const list = Object.entries(ids);
    const items = await yt({ part: "snippet,statistics", id: list.map((x) => x[1]).join(",") }); // 1 call, 1 unit
    const now = Date.now();
    const channels = items.map((c) => ({
      id: c.id,
      name: c.snippet.title,
      handle: c.snippet.customUrl,
      avatar: c.snippet.thumbnails.default.url,
      subs: +c.statistics.subscriberCount,
      views: +c.statistics.viewCount,
    }));
    const snap = JSON.stringify({ t: now, d: Object.fromEntries(channels.map((c) => [c.id, [c.subs, c.views]])) });
    const out = await redis([["LPUSH", "snaps", snap], ["LTRIM", "snaps", 0, 1499], ["LRANGE", "snaps", 0, 1499]]);
    const history = out ? out[2].map((s) => JSON.parse(s)).reverse() : [];
    res.setHeader("Cache-Control", "s-maxage=60, stale-while-revalidate=30"); // shared by all visitors
    res.status(200).json({ now, channels, history, errors, storage: !!RURL });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
};
