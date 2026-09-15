// 업무보고 출석 → 수업관리 앱 출석 (2026-09-15 마왕님 «업무보고에 출석으로 제출하면 클래스앱에도 출석으로»)
//
// 앱은 classes/{cid}/days/{date}/attendance/{sid} 문서가 있으면 출석이다. 낼 때 그 문서를 찍는다.
const fs = require("fs"), vm = require("vm");
const src = /<script>([\s\S]*?)<\/script>/.exec(fs.readFileSync("index.html", "utf8"))[1];
const stub = `
var firebase={initializeApp:function(c,n){return n?{t:1}:{};},firestore:function(){return {collection:function(){return {doc:function(){return {get:function(){return Promise.resolve({exists:false});}};}};}};},
  auth:()=>({onAuthStateChanged(){},currentUser:null,signOut:()=>Promise.resolve()})};
var document={querySelector:()=>null,querySelectorAll:()=>[],addEventListener(){}};
var window={addEventListener(){},scrollTo(){}},location={hash:""},history={replaceState(){}},localStorage={getItem:()=>null,setItem(){}};
var fetch=()=>Promise.reject(new Error("no net")); var alert=function(){},confirm=()=>true,prompt=()=>null;
`;
const W = [];
const ctx = vm.createContext({ console, setTimeout, clearTimeout, Date, Math, JSON, Object, Array, String, Number, Promise, RegExp, isNaN, parseInt, W });
vm.runInContext(stub + "\n" + src, ctx);
const run = (code) => vm.runInContext("(function(){" + code + "})()", ctx);
const T = [];
const ok = (n, c, e) => T.push((c ? "  OK  " : "FAIL  ") + n + (e ? "   " + e : ""));

// ---- 무대 — 이현우(T2) · 고2A(월수금) · 개별진도(월수 학생) ----
run(`
  TODAY = "2026-09-16"; RP_START = "2026-09-14";
  S.teachers = [ { tid:"T2", name:"이현우", role:"teacher", classIds:["c2","c3"] } ];
  S.classes = [
    { id:"c2", name:"고2A", classDays:[1,3,5], roster:[ { id:"s1", name:"최하윤" }, { id:"s2", name:"안유진" }, { id:"s3", name:"지각생" }, { id:"s4", name:"미정" } ] },
    { id:"c3", name:"개별진도", type:"individual", classDays:[], roster:[ { id:"i1", name:"월수학생", days:[1,3] } ] } ];
  S.tasks = []; S.marks = {}; S.events = []; S.reports = {};
  S.claims = { role:"teacher", tid:"T2", name:"이현우" }; S.ro = true;
  toggleMyMark = function () { return Promise.resolve(); };
  tdb = { collection: function (c) { return { doc: function (tid) { return { collection: function (sub) { return {
    doc: function (d) { return { set: function (data) { W.push({ report: c + "/" + tid + "/" + sub + "/" + d }); return Promise.resolve(); } }; }
  }; } }; } }; } };
  // 수업관리 앱 DB 흉내 — 쓸 때 passWrite 가 열려 있었나(RO_PASS)도 남긴다
  __APP = {}; __FAIL = {};
  var key = function (cid, d) { return cid + "|" + d; };
  db = { collection: function () { return { doc: function (cid) { return { collection: function () { return { doc: function (d) {
    var att = function () { return (__APP[key(cid, d)] = __APP[key(cid, d)] || {}); };
    return {
      set: function (data, opt) { W.push({ op:"day", cid:cid, d:d, merge: !!(opt && opt.merge), pass: RO_PASS }); return Promise.resolve(); },
      collection: function () { return {
        get: function () {
          if (__FAIL[cid]) return Promise.reject(new Error("Missing or insufficient permissions."));
          var m = att(); return Promise.resolve({ forEach: function (fn) { Object.keys(m).forEach(function (id) { fn({ id:id, data:function(){ return m[id]; } }); }); } });
        },
        doc: function (sid) { return {
          set: function (data) { W.push({ op:"set", cid:cid, sid:sid, data: JSON.parse(JSON.stringify(data)), pass: RO_PASS }); att()[sid] = data; return Promise.resolve(); },
          delete: function () { W.push({ op:"del", cid:cid, sid:sid, pass: RO_PASS }); delete att()[sid]; return Promise.resolve(); }
        }; }
      }; }
    }; } }; } }; } }; } };
`);
const sets = () => W.filter((x) => x.op === "set");
const dels = () => W.filter((x) => x.op === "del");
const draft = (atts, d) => `var r = rpDraft("T2", "${d || "2026-09-14"}", null);
  var A = ${JSON.stringify(atts)};
  r.classes.forEach(function (c) { c.students.forEach(function (s) { if (A[s.sid] !== undefined) s.att = A[s.sid]; }); });`;

(async () => {
  // ---- 출석·지각·조퇴는 찍고, 결석·미선택은 안 찍는다 ----
  W.length = 0;
  await run(draft({ s1: "출석", s2: "결석", s3: "지각", s4: "", i1: "조퇴" }) + ` return saveDailyReport(r);`);
  ok("보고는 그대로 저장된다", W.some((x) => x.report === "dailyReports/T2/days/2026-09-14"));
  ok("출석·지각·조퇴 셋을 앱에 찍는다", JSON.stringify(sets().map((x) => x.cid + "/" + x.sid).sort()) === '["c2/s1","c2/s3","c3/i1"]', JSON.stringify(sets().map((x) => x.sid)));
  ok("결석·미선택은 안 찍는다", !sets().some((x) => x.sid === "s2" || x.sid === "s4"));
  const s1 = sets().filter((x) => x.sid === "s1")[0];
  ok("앱 모양 그대로 — 이름 · 시각 · 선생님이 찍음 · 팀체크가 찍음", !!s1 && s1.data.name === "최하윤" && s1.data.time > 0 && s1.data.byTeacher === true && s1.data.byTeam === true, JSON.stringify(s1));
  ok("선생님(읽기 계정)도 쓰기마다 문을 연다 (passWrite)", sets().every((x) => x.pass === true) && W.filter((x) => x.op === "day").every((x) => x.pass === true));
  ok("쓰고 나면 문이 다시 닫힌다", run("return RO_PASS") === false);
  ok("그 날 문서에 updated 를 남긴다 (앱 월간 출석부 · touchDay) — 반마다 한 번 · merge",
    JSON.stringify(W.filter((x) => x.op === "day").map((x) => x.cid + (x.merge ? "+m" : "")).sort()) === '["c2+m","c3+m"]', JSON.stringify(W.filter((x) => x.op === "day")));
  ok("«냈다» 옆에 몇 명 찍었나", /수업관리 앱 출석 3명 찍음/.test(run(`return rpAttSyncNote(S.reports.T2["2026-09-14"])`)), run(`return rpAttSyncNote(S.reports.T2["2026-09-14"])`));

  // ---- 다시 내기 — 이미 찍힌 것은 안 건드린다 ----
  W.length = 0;
  await run(`var r = rpDraft("T2","2026-09-14", S.reports.T2["2026-09-14"]); return saveDailyReport(r);`);
  ok("같은 보고를 다시 내면 앱에 또 쓰지 않는다", sets().length === 0 && dels().length === 0 && !W.some((x) => x.op === "day"), JSON.stringify(W));
  ok("아무것도 안 바뀌었으면 «찍음» 글자도 없다", run(`return rpAttSyncNote(S.reports.T2["2026-09-14"])`) === "");

  // ---- 학생이 스스로 찍은 출석 ----
  W.length = 0;
  run(`__APP["c2|2026-09-16"] = { s1: { name:"최하윤", time: 111 }, s2: { name:"안유진", time: 222 } }`);
  await run(draft({ s1: "출석", s2: "결석" }, "2026-09-16") + ` return saveDailyReport(r);`);
  ok("학생이 찍어 둔 출석은 다시 쓰지 않는다 (찍은 시각이 남는다)", !sets().some((x) => x.sid === "s1") && run(`return __APP["c2|2026-09-16"].s1.time`) === 111);
  ok("⚠ 결석으로 내도 학생이 스스로 찍은 출석은 안 지운다", dels().length === 0 && !!run(`return __APP["c2|2026-09-16"].s2`));

  // ---- 출석으로 냈다가 결석으로 고치면 — 팀체크가 찍은 것만 되돌린다 ----
  W.length = 0;
  await run(`var r = rpDraft("T2","2026-09-14", S.reports.T2["2026-09-14"]);
    r.classes[0].students.filter(function(s){ return s.sid === "s1"; })[0].att = "결석"; return saveDailyReport(r);`);
  ok("팀체크가 찍은 출석은 결석으로 고치면 지운다", JSON.stringify(dels().map((x) => x.sid)) === '["s1"]' && dels()[0].pass === true, JSON.stringify(dels()));
  ok("지우기만 했으면 updated 는 안 쓴다", !W.some((x) => x.op === "day"));
  ok("«냈다» 옆에 지운 수", /1명 지움/.test(run(`return rpAttSyncNote(S.reports.T2["2026-09-14"])`)));

  // ---- 앞날짜 · 못 쓰는 반 ----
  W.length = 0;
  run(`TODAY = "2026-09-14"`);
  const fut = JSON.parse(await run(draft({ s1: "출석" }, "2026-09-16") + ` return rpSyncAppAtt(rpClean(r)).then(JSON.stringify);`));
  ok("앞날짜 보고는 앱에 안 찍는다", sets().length === 0 && fut.added === 0, JSON.stringify(fut));
  run(`TODAY = "2026-09-16"`);

  W.length = 0;
  run(`__FAIL = { c2: true }; __APP = {};`);
  let err = "";
  try { await run(draft({ s1: "출석", i1: "출석" }, "2026-09-14") + ` return saveDailyReport(r);`); } catch (e) { err = e.message; }
  ok("⚠ 한 반이 막혀도 보고 저장은 실패하지 않는다", err === "" && W.some((x) => x.report), err);
  ok("막힌 반만 빠지고 다른 반은 찍는다", JSON.stringify(sets().map((x) => x.sid)) === '["i1"]', JSON.stringify(sets()));
  ok("못 옮긴 반 이름을 남긴다", JSON.stringify(run(`return S.rpAttSync.failed`)) === '["고2A"]', JSON.stringify(run(`return S.rpAttSync.failed`)));
  ok("«냈다» 옆에 빨갛게 못 옮긴 반", /못 옮긴 반: 고2A/.test(run(`return rpAttSyncNote(S.reports.T2["2026-09-14"])`)));
  ok("다른 날 보고에는 이 글자가 안 붙는다", run(`return rpAttSyncNote({ tid:"T2", date:"2026-09-16" })`) === "");
  run(`__FAIL = {};`);

  // ---- 앱 DB 를 아예 못 부르는 경우(예전 흉내 DB) — 던지지 않는다 ----
  run(`__db = db; db = { collection: function () { return { doc: function () { return {}; } }; } };`);
  let err2 = "";
  try { await run(draft({ s1: "출석" }, "2026-09-14") + ` return saveDailyReport(r);`); } catch (e) { err2 = e.message; }
  ok("앱 DB 가 이상해도 보고는 낸다 (반마다 실패로만)", err2 === "" && run(`return S.rpAttSync.failed.length`) === 2, err2);
  run(`db = __db;`);

  console.log(T.join("\n"));
  const bad = T.filter((x) => x.indexOf("FAIL") === 0).length;
  console.log(bad ? "\n실패 " + bad + "건" : "\n전부 통과 (" + T.length + "건)");
  process.exitCode = bad ? 1 : 0;
})().catch((e) => { console.log(T.join("\n")); console.log("Error " + e.stack); process.exitCode = 1; });
