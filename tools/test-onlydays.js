// 정규반 «나오는 요일» (2026-09-18 마왕님 «S반에 윤지섭 진유준은 월목으로 오는데, 오늘 내 업무보고에 진유준 윤지섭이 뜨네?»)
//
// 월은 고1S(월금), 목은 개진반. 정규반 줄에 onlyDays:[1] 이면 금요일 고1S 에는 안 온다.
const fs = require("fs"), vm = require("vm");
const html = fs.readFileSync("index.html", "utf8");
const src = /<script>([\s\S]*?)<\/script>/.exec(html)[1];
const stub = `
var firebase={initializeApp:function(c,n){return n?{t:1}:{};},firestore:function(){return {collection:function(){return {doc:function(){return {get:function(){return Promise.resolve({exists:false});}};}};}};},
  auth:()=>({onAuthStateChanged(){},currentUser:null,signOut:()=>Promise.resolve()})};
var document={querySelector:()=>null,querySelectorAll:()=>[],addEventListener(){}};
var window={addEventListener(){},scrollTo(){}},location={hash:""},history={replaceState(){}},localStorage={getItem:()=>null,setItem(){}};
var fetch=()=>Promise.reject(new Error("no net")); var alert=function(){},confirm=()=>true,prompt=()=>null;
`;
const LOG = [];
const ctx = vm.createContext({ console, setTimeout, clearTimeout, Date, Math, JSON, Object, Array, String, Number, Promise, RegExp, isNaN, parseInt, LOG });
vm.runInContext(stub + "\n" + src, ctx);
const run = (code) => vm.runInContext("(function(){" + code + "})()", ctx);
const T = [];
const ok = (n, c, e) => T.push((c ? "  OK  " : "FAIL  ") + n + (e ? "   " + e : ""));

run(`
  TODAY = "2026-09-18"; RP_START = "2026-09-14"; RP_WORK_DOWS = {}; RP_SKIP_NAMES = [];
  S.teachers = [ { tid:"T1", name:"한민수", role:"owner", classIds:["c1","k1","j1"] } ];
  S.classes = [
    { id:"c1", name:"고1S", classDays:[1,5], roster:[
        { id:"r1", pid:"p1", name:"진유준", onlyDays:[1] }, { id:"r2", pid:"p2", name:"윤지섭", onlyDays:[1] },
        { id:"r3", pid:"p3", name:"김서진" }, { id:"r4", pid:"p4", name:"빈칸", onlyDays:[] },
        { id:"r5", pid:"p5", name:"옛요일", days:[4] } ] },
    { id:"k1", name:"개진반 한민수", type:"individual", classDays:[], roster:[ { id:"i1", pid:"p1", name:"진유준", days:[4] } ] },
    { id:"j1", name:"고1자사고반", classDays:[6], roster:[ { id:"j1r", pid:"p3", name:"김서진" } ] } ];
  S.students = [ { pid:"p1", name:"진유준" }, { pid:"p2", name:"윤지섭" }, { pid:"p3", name:"김서진" }, { pid:"p4", name:"빈칸" }, { pid:"p5", name:"옛요일" } ];
  S.byPid = {}; S.students.forEach(function (p) { S.byPid[p.pid] = p; });
  S.tasks = []; S.marks = {}; S.events = []; S.reports = {};
  S.claims = { role:"owner", tid:"T1", name:"한민수" }; S.ro = false;
`);
const names = (cid, d) => run(`return rpStudentsOn(S.classes.filter(function(c){return c.id==="${cid}";})[0], "${d}").map(function(r){return r.name;}).join(",")`);

// ---- 업무보고 명단 ----
ok("금요일(9/18) 고1S — 월요일만 오는 진유준·윤지섭은 안 뜬다", names("c1", "2026-09-18") === "김서진,빈칸,옛요일", names("c1", "2026-09-18"));
ok("월요일(9/14) 고1S — 둘 다 뜬다", names("c1", "2026-09-14") === "김서진,빈칸,옛요일,윤지섭,진유준", names("c1", "2026-09-14"));
ok("나오는 요일이 빈 칸이면 반 요일 전부 (지금까지와 같다)", names("c1", "2026-09-18").indexOf("빈칸") >= 0);
ok("⚠ 정규반 줄에 남은 옛 days 는 안 본다 (개진반에서 옮겨 온 줄)", names("c1", "2026-09-18").indexOf("옛요일") >= 0 && names("c1", "2026-09-14").indexOf("옛요일") >= 0);
ok("개진반은 그대로 학생 요일 (목 9/17 진유준)", names("k1", "2026-09-17") === "진유준" && names("k1", "2026-09-18") === "");
ok("반 자체는 금요일에도 수업이 있다 (김서진이 온다)", run(`return rpMeets(S.classes[0], "2026-09-18")`) === true);

// ---- 오는 요일 · 등원 회차 (수강료) ----
ok("rosterDows — 월금 반 · 월만", JSON.stringify(run(`return rosterDows(S.classes[0], S.classes[0].roster[0])`)) === "[1]");
ok("rosterDows — 칸 없으면 반 요일 전부", JSON.stringify(run(`return rosterDows(S.classes[0], S.classes[0].roster[2])`)) === "[1,5]");
ok("rosterDows — 반 요일 밖 요일이 적혀 있어도 반 요일 안에서만", JSON.stringify(run(`return rosterDows(S.classes[0], { onlyDays:[1,3] })`)) === "[1]");
ok("rosterDows — 개진반은 학생 요일", JSON.stringify(run(`return rosterDows(S.classes[1], S.classes[1].roster[0])`)) === "[4]");
const sept = [];
for (let i = 1; i <= 30; i++) sept.push("2026-09-" + String(i).padStart(2, "0"));
const cnt = (ri) => run(`var D = ${JSON.stringify(sept)}; return D.filter(function (d) { return isClassDay(S.classes[0], S.classes[0].roster[${ri}], d, null); }).length`);
ok("9월 수업일 — 월요일만 오는 학생은 4번 (7·14·21·28)", cnt(0) === 4, String(cnt(0)));
ok("9월 수업일 — 월금 전부 오는 학생은 8번", cnt(2) === 8, String(cnt(2)));
ok("참여표 대신 입력의 기본 요일도 같은 셈 (rosterDows)", /S\.exDays = \(cur && cur\.days && cur\.days\.length\) \? cur\.days\.slice\(\)\s*: rosterDows\(cls, st\)\.slice\(\);/.test(src));

// ---- 학생 명단에서 고르기 ----
const row = run(`return clsRowHtml("p1")`);
ok("정규반(월금)에 «나오는 요일» 단추 — 반 요일 둘만 (월·금)", /<div class="onlypick" data-oc="c1"[^>]*><b>고1S<\/b> 나오는 요일 <button class="mini on" data-odow="1">월<\/button><button class="mini " data-odow="5">금<\/button>/.test(row), row);
ok("켜진 것 설명 — «월 에만 온다»", /<b>월<\/b> 에만 온다/.test(row));
ok("개진반은 전처럼 등원 요일 (나오는 요일 단추가 아니다)", /data-dc="k1"/.test(row) && !/data-oc="k1"/.test(row));
ok("하루짜리 반(자사고반 토)은 고를 것이 없어 안 뜬다", !/data-oc="j1"/.test(run(`return clsRowHtml("p3")`)));
ok("아무것도 안 끈 학생 — «반 요일 전부»", /반 요일 전부 — 끄면/.test(run(`return clsRowHtml("p3")`)));

// ---- stSetOnly — 반 명단을 다시 읽어 그 줄만 ----
run(`withFreshRoster = function (cid, fn) {
  var c = S.classes.filter(function (x) { return x.id === cid; })[0];
  try { var next = fn(JSON.parse(JSON.stringify(c.roster))); } catch (e) { return Promise.reject(e); }
  if (next) c.roster = next; return Promise.resolve(next);
};
logStudentChange = function (kind, pid, nm, what) { LOG.push(kind + "|" + nm + "|" + what); };`);
const rowOf = (pid) => JSON.stringify(run(`return S.classes[0].roster.filter(function (r) { return r.pid === "${pid}"; })[0]`));
(async () => {
  await run(`return stSetOnly("c1", "p3", 5, false)`);
  ok("금을 끄면 onlyDays:[1]", JSON.parse(rowOf("p3")).onlyDays.join() === "1", rowOf("p3"));
  ok("기록에 «고1S 월만»", LOG[LOG.length - 1] === "나오는 요일|김서진|고1S 월만", LOG[LOG.length - 1]);
  await run(`return stSetOnly("c1", "p3", 5, true)`);
  ok("다시 켜서 반 요일 전부가 되면 칸을 지운다 («제한 없음» 은 한 모양)", !("onlyDays" in JSON.parse(rowOf("p3"))), rowOf("p3"));
  ok("기록에 «반 요일 전부»", LOG[LOG.length - 1] === "나오는 요일|김서진|고1S 반 요일 전부");
  let e1 = "";
  try { await run(`return stSetOnly("c1", "p1", 1, false)`); } catch (e) { e1 = e.message; }
  ok("마지막 요일은 못 끈다 — 반에서 빼기를 쓴다", /반에서 빼기/.test(e1) && JSON.parse(rowOf("p1")).onlyDays.join() === "1", e1);
  let e2 = "";
  try { await run(`return stSetOnly("k1", "p1", 4, false)`); } catch (e) { e2 = e.message; }
  ok("개진반에는 안 쓴다", /개진반/.test(e2), e2);
  let e3 = "";
  try { await run(`return stSetOnly("c1", "zz", 1, false)`); } catch (e) { e3 = e.message; }
  ok("명단에 없는 학생은 알린다", /명단에 그 학생이 없다/.test(e3), e3);
  ok("다른 칸은 그대로 (이름·id·pid)", (() => { const r = JSON.parse(rowOf("p1")); return r.id === "r1" && r.name === "진유준" && r.pid === "p1"; })());
  ok("단추를 누르면 stSetOnly 로 간다", /try \{ await stSetOnly\(cid, pid, dow, !on\); redraw\(pid\); \}/.test(src));

  console.log(T.join("\n"));
  const bad = T.filter((x) => x.indexOf("FAIL") === 0).length;
  console.log(bad ? "\n실패 " + bad + "건" : "\n전부 통과 (" + T.length + "건)");
  process.exitCode = bad ? 1 : 0;
})().catch((e) => { console.log(T.join("\n")); console.log("Error " + e.stack); process.exitCode = 1; });
