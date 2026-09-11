// 업무보고 (2026-09-11 초안) — 누가 그날 수업했나, 8시 알림, 자기 칸만 쓰기, 원장님께 올리는 한 장.
//
// 마왕님 결정: 학생 단위 · 일일테스트 없음 · 마감 없음, 다음 날 아침 8시까지 안 내면 알림(팀장·본인) ·
// 원장님께 바로 · 선생님끼리는 서로 못 본다.
const fs = require("fs"), vm = require("vm");
const src = /<script>([\s\S]*?)<\/script>/.exec(fs.readFileSync("index.html", "utf8"))[1];
const stub = `
var firebase={initializeApp:function(c,n){return n?{t:1}:{};},firestore:function(){return {collection:function(){return {doc:function(){return {get:function(){return Promise.resolve({exists:false});}};}};}};},
  auth:()=>({onAuthStateChanged(){},currentUser:null,signOut:()=>Promise.resolve()})};
var document={querySelector:()=>null,querySelectorAll:()=>[],addEventListener(){}};
var window={addEventListener(){},scrollTo(){}},location={hash:""},history={replaceState(){}},localStorage={getItem:()=>null,setItem(){}};
var fetch=()=>Promise.reject(new Error("no net")); var alert=function(){},confirm=()=>true,prompt=()=>null;
`;
const W = [], Q = [];
const ctx = vm.createContext({ console, setTimeout, clearTimeout, Date, Math, JSON, Object, Array, String, Number, Promise, RegExp, isNaN, parseInt, W, Q });
vm.runInContext(stub + "\n" + src, ctx);
const run = (code) => vm.runInContext("(function(){" + code + "})()", ctx);
const T = [];
const ok = (n, c, e) => T.push((c ? "  OK  " : "FAIL  ") + n + (e ? "   " + e : ""));

// ---- 무대 ----
// 2026-09-14(월) ~ . 고1S 는 화·목 정규반, 개별 반은 학생마다 요일이 다르다.
run(`
  TODAY = "2026-09-16"; RP_START = "2026-09-14";
  S.teachers = [ { tid:"T1", name:"한민수", role:"owner", classIds:["c1"] },
                 { tid:"T2", name:"이현우", role:"teacher", classIds:["c2","c3"] },
                 { tid:"T3", name:"이창혁A", role:"teacher", classIds:[] } ];
  S.classes = [
    { id:"c1", name:"고1S", classDays:[2,4], roster:[
        { id:"r1", name:"김서진" }, { id:"r2", name:"박도윤", days:[] },
        { id:"r3", name:"늦게온", startDate:"2026-09-17" }, { id:"r4", name:"그만둔", endDate:"2026-09-14" },
        { id:"rt", name:"조교", teacher:true } ] },
    { id:"c2", name:"고2A", classDays:[1,3,5], roster:[ { id:"s1", name:"최하윤" }, { id:"s2", name:"안유진" } ] },
    { id:"c3", name:"개별진도", type:"individual", classDays:[], roster:[
        { id:"i1", name:"월수학생", days:[1,3] }, { id:"i2", name:"금학생", days:[5] } ] } ];
  S.tasks = []; S.marks = {}; S.events = []; S.reports = {};
  tdb = { collection: function (c) { return { doc: function (tid) { return { collection: function (sub) { return {
    doc: function (d) { return { set: function (data) { W.push({ path: c + "/" + tid + "/" + sub + "/" + d, data: JSON.parse(JSON.stringify(data)) }); return Promise.resolve(); } }; },
    where: function (f, op, v) { Q.push(c + "/" + tid + "/" + sub + " " + f + op + v); return { get: function () { return Promise.resolve({ forEach: function () {} }); } }; }
  }; }, set: function (data) { W.push({ path: c + "/" + tid, data: JSON.parse(JSON.stringify(data)) }); return Promise.resolve(); } }; } }; } };
`);

// ---- 그 날 누가 무엇을 가르쳤나 — 수업관리 앱의 판정 그대로 ----
const names = (cid, d) => run(`return rpStudentsOn(S.classes.filter(function(c){return c.id==="${cid}";})[0], "${d}").map(function(r){return r.name;}).join(",")`);
ok("정규반은 반 요일에 명단 전원 (화 9/15)", names("c1", "2026-09-15") === "김서진,박도윤", names("c1", "2026-09-15"));
ok("⚠ 정규반은 학생 요일을 안 본다 (요일 빈 박도윤도 온다)", names("c1", "2026-09-15").indexOf("박도윤") >= 0);
ok("등록 전인 학생은 안 뜬다 (9/17 부터)", names("c1", "2026-09-15").indexOf("늦게온") < 0 && names("c1", "2026-09-17").indexOf("늦게온") >= 0);
ok("수강이 끝난 학생은 안 뜬다", names("c1", "2026-09-15").indexOf("그만둔") < 0);
ok("명단의 선생님 줄은 안 뜬다", names("c1", "2026-09-15").indexOf("조교") < 0);
ok("개별진도반은 학생 요일로 (월 9/14)", names("c3", "2026-09-14") === "월수학생", names("c3", "2026-09-14"));
ok("개별진도반은 그 요일 학생이 없으면 수업이 없다 (화)",
  run(`return rpMeets(S.classes[2], "2026-09-15")`) === false && run(`return rpMeets(S.classes[2], "2026-09-18")`) === true);
const cls = (tid, d) => run(`return rpClassesOn("${tid}", "${d}").map(function(c){return c.name;}).join(",")`);
ok("담당 반만 (이현우 · 월)", cls("T2", "2026-09-14") === "고2A,개별진도", cls("T2", "2026-09-14"));
ok("남의 반은 안 뜬다", cls("T2", "2026-09-15") === "", cls("T2", "2026-09-15"));
ok("쉬는 날은 수업이 없다 (추석 9/25 금)", cls("T2", "2026-09-25") === "", cls("T2", "2026-09-25"));
ok("반이 없는 선생님은 보고할 날이 없다", run(`return rpExpected("T3", "2026-09-14")`) === false);
ok("기능을 올리기 전 날은 «안 냈다» 로 안 센다", run(`return rpExpected("T2", "2026-09-11")`) === false);

// ---- 8시 알림 ----
const at = (s) => "new Date(" + JSON.stringify(s) + ")";
ok("기한은 다음 날 아침 8시", run(`return new Date(rpDeadline("2026-09-14")).toString()`).indexOf("Sep 15 2026 08:00") >= 0);
ok("7:59 에는 아직 알림이 없다", run(`return rpOverdue("T2", ${at("2026-09-15T07:59:00")}).join()`) === "");
ok("8:00 이 되면 알림", run(`return rpOverdue("T2", ${at("2026-09-15T08:00:00")}).join()`) === "2026-09-14");
ok("수업 없는 날은 알림이 없다 (이현우 화요일)", run(`return rpOverdue("T2", ${at("2026-09-16T09:00:00")}).join()`) === "2026-09-14");
run(`S.reports = { T2: { "2026-09-14": { submitted: 1 } } };`);
ok("낸 날은 빠진다", run(`return rpOverdue("T2", ${at("2026-09-16T09:00:00")}).join()`) === "");
run(`S.reports = { T2: { "2026-09-14": { tomorrow: "x" } } };`);
ok("적다 만 것(안 낸 것)은 안 낸 것", run(`return rpOverdue("T2", ${at("2026-09-16T09:00:00")}).join()`) === "2026-09-14");
run(`S.reports = {};`);
const all = JSON.parse(run(`return JSON.stringify(rpOverdueAll(${at("2026-09-17T08:30:00")}))`));
ok("팀장에게는 사람마다 (한민수 화 · 이현우 월·수)",
  JSON.stringify(all.map(function (x) { return x.name + ":" + x.days.join("|"); })) === JSON.stringify(["한민수:2026-09-15", "이현우:2026-09-14|2026-09-16"]),
  JSON.stringify(all));
ok("8시 전에 열면 어제 것을 먼저 편다",
  run(`S.claims = { role:"teacher", tid:"T2", name:"이현우" }; return rpDefaultDate(${at("2026-09-15T07:30:00")})`) === "2026-09-14");
ok("8시가 넘으면 오늘 것을 편다", run(`return rpDefaultDate(${at("2026-09-15T09:00:00")})`) === "2026-09-15");

// ---- 쓰는 판 — 학생 단위 ----
run(`S.claims = { role:"teacher", tid:"T2", name:"이현우" }; S.ro = true;`);
const dr = JSON.parse(run(`return JSON.stringify(rpDraft("T2", "2026-09-14", null))`));
ok("반마다 명단이 쫙 뽑힌다", dr.classes.length === 2 && dr.classes[0].students.map(function (s) { return s.name; }).join() === "안유진,최하윤",
  JSON.stringify(dr.classes.map(function (c) { return c.students.map(function (s) { return s.name; }); })));
ok("앱을 읽기 전에는 출결이 비어 있다", dr.classes[0].students.every(function (s) { return s.att === ""; }));
const ap = JSON.parse(run(`var r = rpDraft("T2", "2026-09-14", null);
  rpApplyApp(r, { c2: { att: { s1: true }, consult: { s2: [{ risk: 2 }] }, makeup: { s2: { planned: "2026-09-19" } } }, c3: { att: null } });
  return JSON.stringify(r);`));
ok("앱에 출석 찍힌 학생은 출석", ap.classes[0].students.filter(function (s) { return s.sid === "s1"; })[0].att === "출석");
ok("안 찍힌 학생은 결석", ap.classes[0].students.filter(function (s) { return s.sid === "s2"; })[0].att === "결석");
ok("⚠ 앱 출석을 못 읽은 반은 결석으로 적지 않는다 (비워 둔다)", ap.classes[1].students.every(function (s) { return s.att === ""; }) && ap.classes[1].attRead === false);
ok("상담 기록이 위험도와 함께 붙는다", ap.classes[0].students.filter(function (s) { return s.sid === "s2"; })[0].consult === 2);
ok("보강 날짜가 붙는다", ap.classes[0].students.filter(function (s) { return s.sid === "s2"; })[0].makeup === "2026-09-19");
const kept = JSON.parse(run(`var r = rpDraft("T2", "2026-09-14", { classes: [{ cid:"c2", progress:"수열 3단원", students: [{ sid:"s2", att:"지각", note:"버스" }] }] });
  rpApplyApp(r, { c2: { att: { s1: true } } }); return JSON.stringify(r.classes[0]);`));
ok("⚠ 선생님이 고른 출결은 앱이 안 덮는다 (지각)", kept.students.filter(function (s) { return s.sid === "s2"; })[0].att === "지각", JSON.stringify(kept.students));
ok("적어 둔 진도·특이사항이 다시 붙는다", kept.progress === "수열 3단원" && kept.students.filter(function (s) { return s.sid === "s2"; })[0].note === "버스");
ok("그 사이 명단에 들어온 학생도 뜬다 (저장된 명단을 그대로 안 쓴다)", kept.students.length === 2);

// ---- 보고에 뜨는 할 일 ----
run(`S.tasks = [
  { id:"a", text:"지난 일", who:"이현우", due:"2026-09-10", status:"open" },
  { id:"b", text:"그 날 일", who:"이현우", due:"2026-09-14", status:"open" },
  { id:"c", text:"다음 일", who:"이현우", due:"2026-09-20", status:"open" },
  { id:"d", text:"끝난 일", who:"이현우", due:"2026-09-12", status:"done" },
  { id:"e", text:"남의 일", who:"이창혁A", due:"2026-09-14", status:"open" },
  { id:"f", text:"그 날 끝낸 일", who:"이현우", due:"2026-09-13", status:"open" },
  { id:"g", text:"매주 월", who:"이현우", repeat:{ dow:[1] } } ];
  S.marks = { T2: { done: { f: "2026-09-14" } } };`);
const tk = run(`return rpTasksFor("T2", "2026-09-14").map(function(t){return t.id;}).join(",")`);
ok("그 날까지 기한인 것 (지난 것 포함)", tk.indexOf("a") >= 0 && tk.indexOf("b") >= 0, tk);
ok("앞으로의 일은 안 뜬다", tk.indexOf("c") < 0, tk);
ok("끝난 일은 안 뜬다", tk.indexOf("d") < 0, tk);
ok("남의 일은 안 뜬다", tk.indexOf("e") < 0, tk);
ok("그 날 끝낸 일은 뜬다 (완료로)", tk.indexOf("f") >= 0 &&
  run(`return rpDraft("T2", "2026-09-14", null).tasks.filter(function(t){return t.id==="f";})[0].state`) === "done", tk);
ok("매주 하는 일은 그 요일에", tk.indexOf("g") >= 0 && run(`return rpTasksFor("T2","2026-09-15").map(function(t){return t.id;}).join()`).indexOf("g") < 0);

// ---- 내기 전에 ----
const ck = JSON.parse(run(`var r = rpDraft("T2", "2026-09-14", null); rpApplyApp(r, { c2: { att: { s1: true } } }); return JSON.stringify(rpCheck(r));`));
ok("내일 할 일이 비면 못 낸다", ck.stop.length === 1 && /내일 할 일/.test(ck.stop[0]), JSON.stringify(ck));
ok("결석인데 연락 안 한 학생을 알려 준다", ck.warn.some(function (w) { return /연락 안 한 학생 1명/.test(w); }), JSON.stringify(ck.warn));
ok("출결을 안 고른 반을 알려 준다 (못 읽은 반)", ck.warn.some(function (w) { return /개별진도 — 출결을 안 고른/.test(w); }), JSON.stringify(ck.warn));
ok("진도가 빈 반을 알려 준다", ck.warn.some(function (w) { return /진도가 비었다/.test(w); }));

// ---- 저장 — 자기 칸만 ----
(async () => {
  let e1 = "";
  try { await run(`var r = rpDraft("T2","2026-09-14",null); return saveDailyReport(r);`); } catch (e) { e1 = e.message; }
  ok("내일 할 일 없이는 저장도 안 된다", /내일 할 일/.test(e1), e1);
  W.length = 0;
  run(`toggleMyMark = function (id) { W.push({ mark: id }); return Promise.resolve(); };`);
  await run(`var r = rpDraft("T2","2026-09-14",null); rpApplyApp(r, { c2: { att: { s1: true } } });
    r.tomorrow = "고2A 오답 확인"; r.classes[0].students[0].note = "결석 — 병원"; r.classes[0].students[0].called = true;
    r.tasks.filter(function(t){ return t.id === "b"; })[0].state = "done";
    r.tasks.filter(function(t){ return t.id === "a"; })[0].state = "hold";
    r.tasks.filter(function(t){ return t.id === "a"; })[0].note = "자료 대기";
    r.extra.push({ kind:"학부모 연락", text:"안유진 어머니 통화" }, { kind:"기타", text:"   " });
    return saveDailyReport(r);`);
  const w = W.filter(function (x) { return x.path; })[0];
  ok("dailyReports/{내 tid}/days/{날짜} 에 쓴다", !!w && w.path === "dailyReports/T2/days/2026-09-14", w && w.path);
  ok("낸 시각이 남는다", !!w && w.data.submitted > 0 && w.data.updated > 0);
  ok("학생 단위로 남는다", !!w && w.data.classes[0].students.length === 2 && w.data.classes[0].students[0].note === "결석 — 병원");
  ok("화면에만 쓰는 칸은 안 남긴다", !!w && !("attRead" in w.data.classes[0]) && !("due" in (w.data.tasks[0] || {})));
  // 그 날 이미 끝낸 것(f)은 판을 열 때부터 «완료» 라 남는다. 손 안 댄 매주 일(g)은 안 남는다.
  ok("고른 것과 그 날 끝낸 것만 남긴다 (손 안 댄 것은 안 남긴다)", !!w && w.data.tasks.map(function (t) { return t.id; }).sort().join() === "a,b,f", w && JSON.stringify(w.data.tasks));
  ok("빈 줄은 안 남긴다", !!w && w.data.extra.length === 1);
  ok("«완료» 로 고른 할 일은 내 완료 표시로도 (할 일 메뉴와 같게)",
    W.some(function (x) { return x.mark === "b"; }) && !W.some(function (x) { return x.mark === "a"; }), JSON.stringify(W.filter(function (x) { return x.mark; })));
  ok("이미 내 완료가 된 것은 또 누르지 않는다 (누르면 풀린다)", !W.some(function (x) { return x.mark === "f"; }));
  const sub1 = w.data.submitted;
  W.length = 0;
  await run(`var r = rpDraft("T2","2026-09-14", S.reports.T2["2026-09-14"]); r.tomorrow = "바꿈"; return saveDailyReport(r);`);
  const w2 = W.filter(function (x) { return x.path; })[0];
  ok("다시 내면 처음 낸 시각은 그대로 (8시 넘어 고쳐도 늦게 낸 게 아니다)", !!w2 && w2.data.submitted === sub1 && w2.data.tomorrow === "바꿈");
  let e2 = "";
  try { await run(`var r = rpDraft("T1","2026-09-15",null); r.tomorrow = "x"; return saveDailyReport(r);`); } catch (e) { e2 = e.message; }
  ok("남의 보고는 못 쓴다", /남의 보고/.test(e2), e2);
  run(`S.claims = { role:"owner", tid:"T1", name:"한민수" }; S.ro = false;`);
  let e3 = "";
  try { await run(`var r = rpDraft("T2","2026-09-14",null); r.tomorrow = "x"; return saveDailyReport(r);`); } catch (e) { e3 = e.message; }
  ok("팀장도 남의 보고는 못 고친다", /남의 보고/.test(e3), e3);

  // ---- 읽기 — 선생님은 자기 칸만 부른다 ----
  Q.length = 0;
  run(`S.claims = { role:"teacher", tid:"T2", name:"이현우" }; S.ro = true;`);
  await run(`return loadReports("2026-09-01")`);
  ok("선생님은 자기 칸만 부른다 (남의 칸은 부르지도 않는다)", Q.length === 1 && Q[0].indexOf("dailyReports/T2/days") === 0, JSON.stringify(Q));
  Q.length = 0;
  run(`S.claims = { role:"owner", tid:"T1", name:"한민수" }; S.ro = false;`);
  await run(`return loadReports("2026-09-01")`);
  ok("팀장은 전원을 부른다", Q.length === 3, JSON.stringify(Q));

  // ---- 팀장 아침 정리 · 원장님께 올리는 한 장 ----
  run(`S.reports = { T2: { "2026-09-14": {
    submitted: 1, updated: 1, name:"이현우", tomorrow:"고2A 오답 확인", toLead:"프린터 토너",
    classes: [ { cid:"c2", name:"고2A", progress:"수열 3단원", homework:"워크북 12~15",
                 students: [ { sid:"s1", name:"최하윤", att:"출석", note:"" },
                             { sid:"s2", name:"안유진", att:"결석", called:false, note:"" } ] },
               { cid:"c3", name:"개별진도", progress:"", students: [ { sid:"i1", name:"월수학생", att:"출석", note:"질문 많음" } ] } ],
    tasks: [ { id:"a", text:"지난 일", state:"hold", note:"자료 대기" } ], extra: [ { kind:"학부모 연락", text:"안유진 어머니" } ] } } };`);
  const sm = JSON.parse(run(`return JSON.stringify(rpSummary("2026-09-14"))`));
  ok("월요일에 수업한 사람은 이현우뿐", sm.expect.join() === "T2" && sm.got.join() === "T2", JSON.stringify(sm.expect));
  ok("연락 안 된 결석을 모은다", sm.noCall.length === 1 && sm.noCall[0].name === "안유진");
  ok("특이사항을 모은다 (결석 + 적은 것)", sm.notes.map(function (x) { return x.name; }).join() === "안유진,월수학생", JSON.stringify(sm.notes));
  ok("팀장에게 온 요청을 모은다", sm.asks.length === 1 && sm.asks[0].text === "프린터 토너");
  const sm2 = JSON.parse(run(`return JSON.stringify(rpSummary("2026-09-15"))`));
  ok("안 낸 사람 (화요일 한민수)", sm2.missing.join() === "T1", JSON.stringify(sm2));
  const dg = run(`return rpDigest("2026-09-14")`);
  ok("원장님께 올리는 문서는 마크다운 제목으로 시작", dg.indexOf("# 고등부 업무보고 — 9/14(월)") === 0, dg.split("\n")[0]);
  ok("선생님마다 절이 있다", dg.indexOf("## 이현우") >= 0);
  ok("반마다 출석·진도·과제", dg.indexOf("**고2A** · 출석 1/2 · 진도: 수열 3단원 · 과제: 워크북 12~15") >= 0, dg);
  ok("연락 안 된 결석이 굵게 뜬다", dg.indexOf("안유진 — 결석(**연락 안 함**)") >= 0);
  ok("출석이고 적은 게 없는 학생은 원장님 문서에서 빠진다 (길어지지 않게)", dg.indexOf("최하윤") < 0);
  ok("업무·내일·요청이 들어간다", dg.indexOf("[보류] 지난 일 — 자료 대기") >= 0 && dg.indexOf("내일: 고2A 오답 확인") >= 0 && dg.indexOf("요청: 프린터 토너") >= 0);
  ok("일일테스트는 어디에도 없다 (마왕님 결정)", !/테스트|점수/.test(dg));

  // ---- 규칙 — 선생님끼리는 서로 못 본다 ----
  const rules = fs.readFileSync("firestore.rules", "utf8").replace(/\/\/[^\n]*/g, "");
  const blk = /match\s*\/dailyReports\/\{tid\}\/days\/\{date\}\s*\{([\s\S]*?)\n\s*\}/.exec(rules);
  ok("업무보고 규칙이 있다", !!blk);
  const b = blk ? blk[1] : "";
  ok("선생님 읽기는 자기 칸만 (tid == myTid())", /allow\s+read:[^;]*role\(\)\s*==\s*"teacher"\s*&&\s*tid\s*==\s*myTid\(\)/.test(b), b.trim());
  ok("⚠ 조건 없는 team() 읽기가 없다 — 있으면 서로의 보고가 다 열린다",
    !b.split("\n").some(function (l) { return /allow\s+read/.test(l) && /team\(\)/.test(l) && !/myTid/.test(l); }));
  ok("팀장은 전부 읽는다", /allow\s+read:\s*if\s+role\(\)\s*==\s*"owner"/.test(b));
  ok("쓰기는 누구든 자기 칸만 (팀장도)", /allow\s+write:\s*if\s+team\(\)\s*&&\s*tid\s*==\s*myTid\(\)/.test(b), b.trim());
  ok("재귀 와일드카드가 아니다", !/match\s*\/dailyReports\/\{[^}]*=\*\*\}/.test(rules));

  console.log(T.join("\n"));
  const bad = T.filter((x) => x.startsWith("FAIL")).length;
  console.log(bad ? "\n실패 " + bad + "건" : "\n전부 통과 (" + T.length + "건)");
  process.exit(bad ? 1 : 0);
})().catch((e) => { console.log(T.join("\n")); console.log("\n시험이 도중에 터졌다: " + e.message); process.exit(1); });
