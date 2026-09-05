// 대시보드가 깃허브 커밋 이력을 읽는 통로 — «개발 현황» 메뉴.
//
// 브라우저가 api.github.com 을 바로 불러도 되지만(CORS 열려 있다) 두 가지 때문에 서버를 거친다.
// (1) 선생님들 저장소가 비공개면 토큰이 있어야 하고, 토큰은 브라우저에 못 둔다.
// (2) 토큰 없이는 IP 당 한 시간에 60번이다. 서버에서 5분 캐시를 두면 화면을 여러 번 열어도 한 번만 센다.
//
// 요청: POST { idToken, action: "repo", owner, repo }
// 응답: { full, url, description, pushed, commits: [{sha, short, date, msg, author, url}], deploy: {sha, date, env} | null }
//
// 환경변수 `GITHUB_TOKEN`(선택) — 비공개 저장소를 읽거나 제한을 시간당 5000번으로 올린다.
// 개인 토큰(fine-grained) 에 Contents:read 만 주면 된다. 없으면 공개 저장소만 읽는다.

import { verifyIdToken } from "./_google.js";

const API = "https://api.github.com";
const PAGES = 2;                    // 100 × 2 = 최근 200건. 그 앞은 «전부 보기» 가 아니라 저장소로 간다
const TTL = 5 * 60 * 1000;
const cache = new Map();            // 함수 인스턴스가 살아 있는 동안만. 그래도 연타는 막는다

export default async function handler(req, res) {
  if (req.method !== "POST") { res.status(405).json({ error: "POST만 받습니다" }); return; }
  let body = req.body;
  if (typeof body === "string") { try { body = JSON.parse(body); } catch (e) { body = null; } }
  body = body || {};

  try {
    const claims = await verifyIdToken(body.idToken);
    if (!claims || claims.role !== "owner") { res.status(403).json({ error: "관리자만 쓸 수 있습니다" }); return; }
    if (body.action !== "repo") { res.status(400).json({ error: "알 수 없는 요청입니다" }); return; }

    const owner = String(body.owner || "").trim(), repo = String(body.repo || "").trim();
    if (!/^[\w.-]{1,60}$/.test(owner) || !/^[\w.-]{1,100}$/.test(repo)) { res.status(400).json({ error: "저장소 이름이 이상합니다" }); return; }

    const key = owner + "/" + repo;
    const hit = cache.get(key);
    if (hit && Date.now() - hit.at < TTL && !body.fresh) { res.status(200).json(Object.assign({ cached: true }, hit.data)); return; }

    const data = await readRepo(owner, repo);
    cache.set(key, { at: Date.now(), data });
    res.status(200).json(data);
  } catch (e) {
    if (e.status) { res.status(e.status).json({ error: e.message }); return; }
    console.error("[github]", e);
    res.status(500).json({ error: "서버 오류: " + e.message });
  }
}

function headers() {
  const h = { Accept: "application/vnd.github+json", "User-Agent": "climath-team-dashboard", "X-GitHub-Api-Version": "2022-11-28" };
  if (process.env.GITHUB_TOKEN) h.Authorization = "Bearer " + process.env.GITHUB_TOKEN;
  return h;
}

async function gh(path) {
  const r = await fetch(API + path, { headers: headers() });
  const j = await r.json().catch(() => null);
  if (!r.ok) {
    const err = new Error(explain(r, j));
    err.status = r.status === 404 ? 404 : r.status === 403 || r.status === 429 ? 429 : 502;
    throw err;
  }
  return j;
}

export async function readRepo(owner, repo) {
  const base = "/repos/" + owner + "/" + repo;
  const meta = await gh(base);
  const commits = [];
  for (let p = 1; p <= PAGES; p++) {
    const page = await gh(base + "/commits?per_page=100&page=" + p);
    for (const c of page) {
      commits.push({
        sha: c.sha, short: c.sha.slice(0, 7),
        date: ((c.commit && c.commit.author && c.commit.author.date) || "").slice(0, 10),
        msg: ((c.commit && c.commit.message) || "").split("\n")[0].trim(),
        author: (c.commit && c.commit.author && c.commit.author.name) || (c.author && c.author.login) || "",
        url: c.html_url,
      });
    }
    if (page.length < 100) break;
  }
  // 버셀이 깃허브 연동으로 배포하면 deployments 에 남는다. 최근 하나면 «마지막 배포» 로 충분하다.
  let deploy = null;
  try {
    const d = await gh(base + "/deployments?per_page=1");
    if (d && d[0]) deploy = { sha: d[0].sha, short: String(d[0].sha).slice(0, 7), date: String(d[0].created_at || "").slice(0, 10), env: d[0].environment || "" };
  } catch (e) { /* 배포 기록이 없거나 못 읽으면 그냥 없는 것 */ }
  return {
    full: meta.full_name, url: meta.html_url, description: meta.description || "", private: !!meta.private,
    pushed: String(meta.pushed_at || "").slice(0, 10), branch: meta.default_branch || "",
    commits, deploy, more: commits.length >= PAGES * 100,
  };
}

// 깃허브가 주는 오류를 "그래서 뭘 하면 되는지"로 바꾼다.
function explain(r, j) {
  const msg = (j && j.message) || ("" + r.status);
  const remain = r.headers.get("x-ratelimit-remaining");
  if ((r.status === 403 || r.status === 429) && remain === "0") {
    const reset = Number(r.headers.get("x-ratelimit-reset") || 0) * 1000;
    const min = reset ? Math.max(1, Math.round((reset - Date.now()) / 60000)) : "?";
    return "깃허브 읽기 한도(토큰 없이 시간당 60번)에 걸렸다. " + min + "분 뒤에 풀린다. " +
      "Vercel 환경변수 GITHUB_TOKEN 을 넣으면 5000번으로 늘고 비공개 저장소도 읽는다.";
  }
  if (r.status === 404) return "저장소를 찾을 수 없다. 주소를 확인하거나, 비공개 저장소면 GITHUB_TOKEN 이 있어야 한다.";
  if (r.status === 401) return "GITHUB_TOKEN 이 잘못됐거나 만료됐다.";
  return "깃허브 오류 " + r.status + ": " + msg;
}
