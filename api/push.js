// 휴대폰 알림 — 앱을 닫아 둬도 오는 알림(웹 푸시).
//
// 종(🔔)은 앱을 열고 있을 때만 보인다. 이건 그 바깥이다.
// 브라우저가 «구독» 을 만들어 주면 그걸 여기에 맡겨 두고, 알릴 일이 생기면 서버가 보낸다.
//
// ⚠ **아이폰은 홈 화면에 추가해야만 된다**(iOS 16.4+). 사파리 탭에서는 구독이 아예 안 만들어진다.
//   이건 애플의 제약이라 코드로 못 넘는다. 앱이 그 사정을 화면에 적어 준다.
//
// 두는 곳:
//   secrets/vapid          : 보내는 쪽 열쇠 한 쌍. **규칙에 안 적은 컬렉션이라 아무도 못 읽는다**
//                            (서비스 계정만 본다). 없으면 여기서 만들어 넣는다 — 사람이 손댈 곳이 없다.
//   push/{tid}.subs.{키}   : 사람마다 기기 목록. 자기 것만 읽고 쓴다(firestore.rules).
import crypto from "crypto";
import { verifyIdToken, getDoc, patchDoc } from "./_google.js";
import { newVapidKeys, sendOne } from "./_webpush.js";

// 보내는 사람을 밝히는 자리. 푸시 회사(구글·애플)가 문제가 생겼을 때 연락할 곳이다.
// ⚠ 메일 주소 대신 앱 주소를 쓴다 — 규격이 https 주소를 허용하고, 남의 서버에 개인 메일을 남길 이유가 없다.
const SUBJECT = "https://climath-team1.vercel.app";
const subKey = (endpoint) => crypto.createHash("sha256").update(String(endpoint)).digest("hex").slice(0, 24);

let _keys = null;
async function vapidKeys() {
  if (_keys) return _keys;
  const d = await getDoc("secrets/vapid");
  if (d && d.pub && d.d) { _keys = { pub: d.pub, d: d.d, x: d.x, y: d.y }; return _keys; }
  // 처음 한 번. 두 사람이 같은 순간에 부르면 하나가 덮어쓸 수 있는데,
  // 그래도 뒤에 남는 한 쌍으로 모두가 다시 구독하면 되므로 잠금까지 걸지 않는다.
  const k = newVapidKeys();
  await patchDoc("secrets/vapid", { ...k, made: new Date().toISOString() }, ["pub", "d", "x", "y", "made"]);
  _keys = k;
  return _keys;
}

async function subsOf(tid) {
  const d = await getDoc("push/" + tid);
  const subs = (d && d.subs) || {};
  const out = [];
  for (const k of Object.keys(subs)) if (subs[k] && subs[k].endpoint) out.push({ k, ...subs[k] });
  return out;
}

// 한 사람에게 보낸다. 죽은 구독은 그 자리에서 지운다 — 안 그러면 매번 실패를 되풀이한다.
async function sendTo(tid, payload, keys) {
  const list = await subsOf(tid);
  if (!list.length) return { tid, sent: 0, none: true };
  let sent = 0; const dead = []; const errs = [];
  for (const s of list) {
    const r = await sendOne(s, payload, keys, SUBJECT);
    if (r.ok) sent++;
    else if (r.gone) dead.push(s.k);
    else errs.push(r.error);
  }
  if (dead.length) {
    const left = {};
    for (const s of list) if (dead.indexOf(s.k) < 0) left[s.k] = { endpoint: s.endpoint, p256dh: s.p256dh, auth: s.auth, ua: s.ua || "", at: s.at || "" };
    await patchDoc("push/" + tid, { subs: left }, ["subs"]).catch(() => {});
  }
  return { tid, sent, dropped: dead.length, errors: errs };
}

export default async function handler(req, res) {
  if (req.method !== "POST") { res.status(405).json({ error: "POST만 받습니다" }); return; }
  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body || {});
    const claims = await verifyIdToken(body.idToken);
    const role = claims && claims.role;
    if (role !== "owner" && role !== "teacher") { res.status(403).json({ error: "팀만 쓸 수 있습니다" }); return; }
    const me = String(claims.tid || "");
    if (!me) { res.status(403).json({ error: "누구인지 모르겠습니다" }); return; }
    const want = String(body.want || "");

    // (1) 구독할 때 필요한 공개 열쇠. 브라우저가 이걸로 푸시 회사에 등록한다.
    if (want === "key") { res.status(200).json({ pub: (await vapidKeys()).pub }); return; }

    // (2) 이 기기를 맡아 둔다.
    if (want === "sub") {
      const s = body.sub || {};
      if (!s.endpoint || !s.p256dh || !s.auth) { res.status(400).json({ error: "구독 정보가 모자랍니다" }); return; }
      const k = subKey(s.endpoint);
      await patchDoc("push/" + me,
        { subs: { [k]: { endpoint: s.endpoint, p256dh: s.p256dh, auth: s.auth,
                         ua: String(body.ua || "").slice(0, 120), at: new Date().toISOString() } } },
        ["subs." + k]);
      res.status(200).json({ ok: true, key: k }); return;
    }

    // (3) 이 기기는 그만 받는다.
    if (want === "off") {
      const k = subKey(body.endpoint || "");
      const list = await subsOf(me);
      const left = {};
      for (const s of list) if (s.k !== k) left[s.k] = { endpoint: s.endpoint, p256dh: s.p256dh, auth: s.auth, ua: s.ua || "", at: s.at || "" };
      await patchDoc("push/" + me, { subs: left }, ["subs"]);
      res.status(200).json({ ok: true }); return;
    }

    // (4) 내 기기에 시험 삼아 하나. 누구나 자기 것만.
    if (want === "test") {
      const r = await sendTo(me, { title: "팀체크", body: body.text || "알림이 켜졌습니다 🎉", url: "/", tag: "test" }, await vapidKeys());
      res.status(200).json(r); return;
    }

    // (5) 팀장이 팀에게. 새 할 일이 생겼을 때 앱이 부른다.
    if (want === "send") {
      if (role !== "owner") { res.status(403).json({ error: "보내는 것은 팀장만 합니다" }); return; }
      const to = (Array.isArray(body.to) ? body.to : []).map(String).filter(Boolean).slice(0, 30);
      if (!to.length) { res.status(400).json({ error: "받을 사람이 없습니다" }); return; }
      const payload = { title: String(body.title || "팀체크").slice(0, 60),
                        body: String(body.body || "").slice(0, 160),
                        url: String(body.url || "/").slice(0, 200), tag: String(body.tag || "teamcheck").slice(0, 40) };
      const keys = await vapidKeys();
      const out = [];
      for (const tid of to) { if (tid === me) continue; out.push(await sendTo(tid, payload, keys)); }
      res.status(200).json({ ok: true, each: out }); return;
    }

    // (6) 누구든 팀장에게. 보고가 올라왔다·한 줄 보고가 왔다처럼 **팀장이 기다리는 것**만.
    // ⚠ 글은 여기서 만든다. 보내는 쪽이 적은 글을 그대로 띄우면 알림이 아무 말이나 나르는 통로가 된다.
    if (want === "lead") {
      const leads = (Array.isArray(body.leads) ? body.leads : []).map(String).filter(Boolean).slice(0, 5);
      const kind = String(body.kind || "");
      const who = String(claims.name || me).slice(0, 20);
      const TEXT = {
        report: { title: "업무보고 도착", body: who + " 선생님이 업무보고를 올렸습니다", url: "/#report", tag: "report" },
        done:   { title: "한 줄 보고 도착", body: who + " 선생님이 할 일에 보고를 남겼습니다", url: "/#tasks", tag: "done" },
      };
      const p = TEXT[kind];
      if (!p) { res.status(400).json({ error: "무엇을 알릴지 모르겠습니다" }); return; }
      const keys = await vapidKeys();
      const out = [];
      for (const tid of leads) { if (tid === me) continue; out.push(await sendTo(tid, p, keys)); }
      res.status(200).json({ ok: true, each: out }); return;
    }

    res.status(400).json({ error: "무엇을 할지 모르겠습니다" });
  } catch (e) {
    res.status(500).json({ error: e.message || "알 수 없는 오류" });
  }
}
