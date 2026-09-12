// 새벽에 저 혼자 도는 길 — 수학시험 시간표가 올라왔는지 매일 아침 보고 알린다.
//
// 왜 이게 있나 (2026-09-13):
//   학교는 시험 **2주쯤 전에** 시간표를 올린다. 언제 올릴지는 학교마다 다르다.
//   그러니 사람이 «생각나서» 누르는 방식은 늦거나 헛돈다. 날마다 한 번 보는 것이 맞다.
//   앱은 시험이 언제인지 이미 알고 있으니, 때가 된 학교만 골라 볼 수 있다.
//
// ⚠ 여기서 **날짜를 저장하지는 못한다.** 학교 일정(appConfig/schoolTerms)은 *수업관리 앱*
//   (climath-class) DB 에 있는데, 이 서버는 climath-team 서비스 계정만 들고 있다.
//   그래서 찾은 것을 팀 DB(dash/mathFound)에 **적어만 두고**, 넣는 것은 앱이 한다.
//   거꾸로 보면 이게 안전장치다 — 새벽에 아무도 안 볼 때 조용히 들어가는 날짜가 없다.
//
// ⚠ AI 는 **하룻밤 몫만** 쓴다(AI_PER_NIGHT). 하루 한도를 새벽에 다 쓰면 낮에 팀장이 눌렀을 때 못 읽는다.
//   처음엔 아예 막았는데, 돌려 보니 스무 곳 중 **열둘이 링크만** 남았다 — 표를 재서 읽히는 학교가 소수다.
//   링크는 열어서 붙여넣어야 하고 날짜는 한 번 누르면 된다. 그 차이가 이 기능의 값이라 몫을 주는 쪽으로 바꿨다.
//   몫을 다 쓰면 «글은 올라왔다» 와 링크를 남긴다. 그것만으로도 할 일의 대부분은 끝난다.
//
// ⚠ **찾은 것이 없으면 알림을 안 보낸다.** 날마다 «없음» 이 오면 사람은 알림을 꺼 버린다.
//   같은 것을 두 번 알리지도 않는다(sig 비교).
//
// 환경변수 CRON_SECRET 이 있어야 돈다. 버셀이 크론을 부를 때 Authorization: Bearer 로 같이 보낸다.
// 없으면 아무나 부를 수 있는 주소가 되는데, 이건 남의 학교 홈페이지를 스무 곳씩 긁는 길이다.
// **안 돌고 있는 것은 앱이 알려 준다** — dash/mathFound.at 이 오래되면 학교 일정 화면에 뜬다.
import crypto from "crypto";
import { verifyIdToken, getDoc, patchDoc } from "./_google.js";
import { mathDates, BUDGET, WEB_BUDGET } from "./schedule.js";
import { vapidKeys, sendTo } from "./push.js";

export const maxDuration = 60;

// 60초 안에 끝내야 한다(버셀 Hobby). 45초에서 손을 떼고 나머지는 내일 본다 —
// 시간에 쫓겨 잘리면 그 학교는 «못 찾음» 으로 남는데, 사실은 안 본 것이다.
const DEADLINE_MS = 45000;
// ⚠ 그래서 **아침에 두 번 돈다**(vercel.json 의 crons 둘). 6시대에 못 본 학교를 7시대가 잇는다.
//   한 번만 돌면 45초에 못 들어간 학교가 **하루를 통째로 기다린다** — 시험이 사흘 앞이면 그게 치명적이다.
//   두 번째 판은 이미 찾아 둔 학교를 건너뛰므로(seen) 남은 곳만 본다.
//   Hobby 는 크론을 프로젝트당 둘까지, 각각 하루 한 번 허용한다. 시간대를 갈라 둬야 겹치지 않는다.
const CONC = 3;
// 시험이 이 날수 안에 있는 학교만 본다. 학교가 2주 전에 올리니 3주면 넉넉하다.
// 넓히면 아직 안 올린 학교를 날마다 헛되이 긁는다.
const SOON_DAYS = 21;
// 하룻밤에 AI 를 몇 번까지 부를까.
//
// 처음엔 «낮에 팀장이 쓸 몫을 남기자» 며 15 로 아꼈다. 마왕님이 정리해 주셨다 —
// "새벽에 토큰 써도돼 어차피 나는 오후에 주로써". 새벽과 오후는 서로 안 겹친다.
// 그래서 **때가 된 학교를 다 읽고도 남을 만큼** 준다. 아껴서 못 읽으면 링크만 남고,
// 링크는 사람이 열어 붙여넣어야 한다 — 그게 이 기능을 없애는 길이다.
//
// ⚠ 그래도 상한은 둔다. 볼 목록이 부풀거나 되풀이가 생겼을 때 하루치를 통째로 태우지 않으려는 못이다.
const AI_PER_NIGHT = 40;
// 이미 찾아 둔 학교는 다시 안 긁는다. 팀장이 «넣기» 를 안 눌렀으면 명단에 그대로 남아 있기 때문이다.
const KEEP_DAYS = 7;

// 버셀은 UTC 로 돈다. 우리가 말하는 «오늘» 은 한국 날짜다.
function kstToday() {
  const d = new Date(Date.now() + 9 * 3600 * 1000);
  return d.toISOString().slice(0, 10);
}
function addDays(ymd, n) {
  const d = new Date(ymd + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
const sigOf = (o) => crypto.createHash("sha256").update(JSON.stringify(o)).digest("hex").slice(0, 16);

// 버셀 크론인지 본다. 길이가 같을 때만 timingSafeEqual 이 되므로 먼저 길이를 맞춰 본다.
function isCron(req) {
  const want = process.env.CRON_SECRET || "";
  if (!want) return false;
  const got = String(req.headers.authorization || "").replace(/^Bearer\s+/i, "");
  if (got.length !== want.length) return false;
  return crypto.timingSafeEqual(Buffer.from(got), Buffer.from(want));
}

export async function runMathScan() {
  const watch = await getDoc("dash/mathWatch");
  const rows = (watch && Array.isArray(watch.rows) ? watch.rows : []).filter((r) => r && r.school && r.grade);
  const term = (watch && watch.term) || "";
  // 회차 이름(중간·기말)은 글 제목을 고를 때 한 점 더 준다. 앱이 적어 보낸다.
  const kind = (watch && watch.kind) || "";
  const lead = (watch && watch.by) || "";
  const now = new Date().toISOString();
  if (!rows.length) {
    await patchDoc("dash/mathFound", { at: now, term, note: "볼 학교가 없다", diffs: [], links: [], left: 0 },
      ["at", "term", "note", "diffs", "links", "left"]);
    return { ok: true, ran: 0, note: "볼 학교가 없다" };
  }

  // (1) 때가 된 줄만. 시험 기간이 비어 있으면 날짜를 놓을 자리가 없다 — 그건 «시험 기간 찾아오기» 일이다.
  const today = kstToday(), until = addDays(today, SOON_DAYS);
  const due = rows.filter((r) => r.start && r.end && r.end >= today && r.start <= until);

  // (2) 지난번에 찾아 둔 것을 들고 간다 — **아직 안 넣은 것만.**
  // ⚠ 볼 목록(rows)은 «수학 날짜가 빈 칸» 인 줄만 앱이 적어 보낸다. 그러니 볼 목록에 없어졌다는 것은
  //   팀장이 넣었다는 뜻이다. 안 걸러내면 다 한 일이 몇 주씩 화면에 남아 «또 하라» 고 내민다.
  const prev = (await getDoc("dash/mathFound")) || {};
  const want = {}, live = {};
  rows.forEach((r) => { want[r.school + "__" + r.grade] = 1; live[r.school] = 1; });
  const diffs = (prev.diffs || []).filter((d) => d && want[d.school + "__" + d.grade]);
  const links = (prev.links || []).filter((x) => x && live[x.school]);
  // ⚠ 아침에 두 번 도니까 **이번에 새로 알게 된 것**을 따로 들고 있어야 한다.
  //   지난 판에서 찾은 학교 이름이 두 번째 알림에 섞이면 «또 찾았나» 로 읽힌다.
  //   «새로» 의 잣대는 **내용**이다. 같은 학교가 또 바빴던 것은 새로 안 것이 아니다.
  const keyD = (d) => "d|" + d.school + "|" + d.grade + "|" + (d.dates || []).join(",");
  const keyL = (x) => "l|" + x.school + "|" + (x.retry ? "busy" : "post");
  const before = {};
  (prev.diffs || []).forEach((d) => { before[keyD(d)] = 1; });
  (prev.links || []).forEach((x) => { before[keyL(x)] = 1; });
  const addedD = [], addedL = [];

  // (3) 며칠 안에 이미 찾아 둔 학교는 다시 안 긁는다. 어제와 오늘 사이에 글이 바뀌지 않는다.
  const fresh = prev.at && prev.at > new Date(Date.now() - KEEP_DAYS * 86400000).toISOString();
  const seen = {};
  if (fresh) {
    diffs.forEach((d) => { seen[d.school] = 1; });
    links.forEach((x) => { if (!x.retry) seen[x.school] = 1; });
  }

  const bySchool = {};
  due.forEach((r) => { if (!seen[r.school]) (bySchool[r.school] = bySchool[r.school] || []).push(r); });
  const names = Object.keys(bySchool);
  // ⚠ 다시 긁을 학교의 **지난 자취를 먼저 지운다.** 안 그러면 판마다 같은 줄이 쌓인다 —
  //   6시대에 「AI가 바빴다」로 남은 학교를 7시대가 다시 보면서 한 줄을 더 얹는다(2026-09-12 실측).
  const redo = {};
  names.forEach((n) => { redo[n] = 1; });
  for (let i = links.length - 1; i >= 0; i--) if (redo[links[i].school]) links.splice(i, 1);
  for (let i = diffs.length - 1; i >= 0; i--) if (redo[diffs[i].school]) diffs.splice(i, 1);

  // 하룻밤 AI 몫. 학교마다 따로 주지 않고 **하나를 나눠 쓴다** — 그래야 밤 전체의 값이 정해진다.
  const ai = { n: AI_PER_NIGHT };
  let next = 0, ran = 0;

  const add = (x) => { links.push(x); if (!before[keyL(x)]) addedL.push(x); };
  async function one(school) {
    const mine = bySchool[school];
    const span = mine.filter((v) => v.start && v.end)[0];
    let r;
    // 학교마다 예산을 새로 준다. 한 곳이 다 써 버리면 뒤의 학교가 조용히 굶는다.
    try {
      r = await mathDates(school, span.start.replace(/-/g, ""), span.end.replace(/-/g, ""),
        kind, mine.map((v) => v.grade), { n: BUDGET }, { n: WEB_BUDGET }, ai);
    } catch (e) { return; }
    if (!r || r.error) return;
    // ⚠ AI 분당 한도(429)에 걸린 것은 **학교 탓이 아니다.** 글 링크는 남기되,
    //   내일 다시 긁도록 «찾았다» 로 세지 않는다 — 세면 다시 안 보고 링크만 영영 남는다.
    if (r.busy) { if (r.post) add({ school, post: r.post, url: r.url || "", note: "AI가 바빴다", retry: true }); return; }
    // 글은 찾았는데 표로 못 읽었다 — **링크를 남긴다.** 팀장이 열어 붙여넣으면 그 자리에서 읽힌다.
    if (r.post && !(r.rows || []).length) {
      add({ school, post: r.post, url: r.url || "", note: r.note || "" });
      return;
    }
    if (!(r.rows || []).length) return;              // 아직 안 올렸다. 조용히 지나간다
    for (const t of mine) {
      const gn = Number(String(t.grade).replace(/\D/g, "")) || 0;
      const hit = r.rows.filter((x) => Number(x.grade) === gn);
      const dates = [];
      hit.forEach((x) => { if (dates.indexOf(x.date) < 0) dates.push(x.date); });
      if (!dates.length) continue;
      if (t.math && dates.length === 1 && t.math === dates[0]) continue;
      const one2 = { kind: "math", school: t.school, grade: t.grade, mine: t.math || "",
        dates, why: hit.map((x) => x.subject).filter(Boolean).join(" · "),
        by: r.by || "", post: r.post || "", url: r.url || "",
        // 손으로 돌릴 때 저절로 채우는 것과 **같은 조건**이다. 앱이 이 표시만 보고 한꺼번에 넣는다.
        auto: !t.math && dates.length === 1 && r.by === "표" };
      diffs.push(one2); if (!before[keyD(one2)]) addedD.push(one2);
    }
  }
  const startedAt = Date.now();
  // 한 학교가 30초까지 걸린다. 8초 남았을 때 새로 집으면 시간에 쫓겨 잘린다 — 그 학교는
  // «못 찾음» 이 아니라 **안 본 것**인데, 그 둘이 화면에서 구별되지 않는다.
  async function worker() {
    while (next < names.length && Date.now() + 8000 < startedAt + DEADLINE_MS) {
      const school = names[next++];
      try { await one(school); } catch (e) {}
      ran++;
    }
  }
  await Promise.all(Array.from({ length: Math.min(CONC, names.length) }, worker));

  const left = names.length - ran;
  // ⚠ **어느 프로젝트가 돌렸는지 적어 둔다.** 이 저장소에 버셀 프로젝트가 셋 물려 있다
  //   (climath-team · climath-team-zu5m · climath-team1 — 2026-09-04부터 셋 다 118번씩 배포됐다).
  //   두 곳에 CRON_SECRET 을 넣으면 **아침마다 두 번 긁는다.** 줄이 쌓이지는 않지만 AI 하루치를 두 배로 태운다.
  //   화면에서 그게 안 보이면 영영 모른다. 어제와 다른 곳이 돌았으면 앱이 시끄럽게 말한다.
  const host = process.env.VERCEL_PROJECT_PRODUCTION_URL || process.env.VERCEL_URL || "";
  const out = { at: now, term, diffs: diffs.slice(0, 60), links: links.slice(0, 60),
                looked: ran, left, due: due.length, note: "", host,
                dup: !!(prev.host && host && prev.host !== host) };
  const sig = sigOf([out.diffs, out.links]);
  const found = addedD.length + addedL.length;

  // (4) 알린다 — **새로 생긴 것이 있을 때만.** 같은 것을 두 번 알리지 않는다.
  let sent = 0;
  if (found > 0 && lead && sig !== prev.sig) {
    const who = [];
    addedD.concat(addedL).forEach((x) => { if (who.indexOf(x.school) < 0) who.push(x.school); });
    const body = who.slice(0, 3).join(" · ") + (found > 3 ? " 등 " + found + "건" : "") + " — 눌러서 넣으세요";
    try {
      const r = await sendTo(lead, { title: "수학시험 날짜가 올라왔다", body: body.slice(0, 160),
        url: "/#terms", tag: "math" }, await vapidKeys());
      sent = (r && r.sent) || 0;
    } catch (e) {}
  }
  out.sig = sig;
  out.sent = sent;
  await patchDoc("dash/mathFound", out, Object.keys(out));
  return { ok: true, ran, left, found, sent, due: due.length, schools: names.length, aiLeft: ai.n, host };
}

export default async function handler(req, res) {
  try {
    // 버셀 크론이거나, 앱에서 팀장이 «지금 돌려보기» 를 누른 것이거나.
    let allowed = isCron(req);
    if (!allowed) {
      const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body || {});
      const claims = await verifyIdToken(body.idToken);
      allowed = !!(claims && claims.role === "owner");
    }
    if (!allowed) { res.status(401).json({ error: "혼자 도는 길입니다" }); return; }
    res.status(200).json(await runMathScan());
  } catch (e) {
    res.status(500).json({ error: e.message || "알 수 없는 오류" });
  }
}
