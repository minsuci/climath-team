// 월간계획 (2026-09-11) — 업무 달력과 따로. 팀 단위로 이 달에 끝낼 것만.
//
// 마왕님: «반 단위가 아니고 팀 단위» · «내신 일정은 뺀다» (9/10) · «업무 달력 말고 월간계획 메뉴 따로» (9/11).
// 원장님(9/11 간부회의): 상담도 달력에 · 마크다운으로 AI 가 읽게.
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

run(`
  TODAY = "2026-09-11";
  S.teachers = [ { tid:"T1", name:"한민수", role:"owner" }, { tid:"T2", name:"이현우", role:"teacher" } ];
  S.tasks = [ { id:"t1", text:"할 일에만 있는 것", due:"2026-09-15", who:"이현우" } ];
  S.events = [ { id:"e1", text:"정상수업", from:"2026-09-26", over:true, off:false } ];   // 9/26 은 안 쉰다
  tdb = { collection: function (c) { return { doc: function (id) { return {
    set: function (data) { W.push({ path: c + "/" + id, data: JSON.parse(JSON.stringify(data)) }); return Promise.resolve(); },
    get: function () { return Promise.resolve({ exists:false }); } }; } }; } };
  S.plan = { months: {
    "2026-08": { items: [
      { id:"a1", kind:"goal", text:"근태 기준 문서화", state:"진행" },
      { id:"a2", kind:"goal", text:"8월 끝난 일", state:"완료" },
      { id:"a3", kind:"goal", text:"추석 특강 확정", state:"결정 필요" } ] },
    "2026-09": { goal:"추석 전후 이탈 막기", items: [
      { id:"g1", kind:"goal", text:"예비고1 내신 방침 확정", desc:"대비 없는 반 두 곳", from:"2026-09-14", who:"팀 전원", state:"결정 필요" },
      { id:"g2", kind:"goal", text:"고1 학교별 교재 배부", from:"2026-09-14", to:"2026-09-15", who:"고1 담당", state:"예정" },
      { id:"g3", kind:"goal", text:"추석 특강 확정", from:"2026-09-23", to:"2026-09-24", tent:true, who:"한민수", state:"결정 필요" },
      { id:"g4", kind:"goal", text:"수학시험 날짜 → 직보 확정", when:"중산고 9/15 · 나머지 9/18", who:"담임 → 한민수", state:"진행" },
      { id:"g5", kind:"goal", text:"끝난 것", from:"2026-09-01", state:"완료" },
      { id:"g6", kind:"goal", text:"날짜 없는 것", state:"예정" },
      { id:"e1", kind:"event", text:"팀회의", from:"2026-09-14" },
      { id:"c1", kind:"consult", text:"저조자 상담", from:"2026-09-21", to:"2026-09-22", who:"담임" } ],
      notes: [ { id:"n1", title:"추석 휴강", text:"9/24·25, 9/26 정상수업" } ] } } };
`);

// ---- 한 달 ----
ok("없는 달은 빈 판", run(`var m = plMonth("2026-11"); return m.goal === "" && m.items.length === 0 && m.notes.length === 0`));
ok("달 넘기기 (12월 → 1월)", run(`return plYmShift("2026-12", 1) + "|" + plYmShift("2026-01", -1)`) === "2027-01|2025-12");
ok("plMonth 는 사본을 준다 (고쳐도 원본이 안 바뀐다)", run(`var m = plMonth("2026-09"); m.items.push({}); return plMonth("2026-09").items.length`) === 8);

// ---- 달력 칸 ----
const on = (d) => run(`return plOn("2026-09", "${d}").map(function (x) { return x.id; }).join()`);
ok("그 날의 것 — 상담·일정이 위, 끝낼 것이 아래", on("2026-09-14") === "e1,g2,g1", on("2026-09-14"));
ok("기간짜리는 사이 날 전부 (9/15)", on("2026-09-15") === "g2", on("2026-09-15"));
ok("상담도 달력에 (원장님 9/11)", on("2026-09-22") === "c1");
ok("날짜 없는 끝낼 것은 달력에 안 놓인다", !/g4|g6/.test(on("2026-09-15") + on("2026-09-18")));
ok("⚠ 할 일은 자동으로 안 얹는다 (팀 단위만 — 9/10 마왕님)", on("2026-09-15").indexOf("t1") < 0);

// ---- 언제 ----
const when = (id) => run(`return plWhen(plMonth("2026-09").items.filter(function (x) { return x.id === "${id}"; })[0])`);
ok("하루짜리", when("g1") === "9/14(월)", when("g1"));
ok("기간짜리", when("g2") === "9/14(월) ~ 9/15(화)", when("g2"));
ok("잠정은 (잠정)", when("g3") === "9/23(수) ~ 9/24(목) (잠정)", when("g3"));
ok("글자로 적은 언제가 이긴다", when("g4") === "중산고 9/15 · 나머지 9/18");
ok("날짜 없으면 미정", when("g6") === "미정");

// ---- 끝낼 것 표 ----
const gs = run(`return plGoals("2026-09").map(function (x) { return x.id; }).join()`);
ok("날짜 순 → 날짜 없는 것 → 끝난 것", gs === "g1,g2,g3,g4,g6,g5", gs);

// ---- 지난달에서 가져오기 ----
const cr = run(`return plCarryable("2026-09").map(function (x) { return x.text; }).join()`);
ok("지난달 못 끝낸 것 — 끝난 것과 이미 옮긴 것(추석 특강)은 빼고", cr === "근태 기준 문서화", cr);

// ---- 쉬는 날 — 업무 달력의 것을 그대로 ----
const hs = JSON.parse(run(`return JSON.stringify(plHolidays("2026-09"))`));
ok("추석을 한 덩어리로, 9/26 «정상수업» 으로 고친 날은 빠진다",
  JSON.stringify(hs) === JSON.stringify([{ from: "2026-09-24", to: "2026-09-24", text: "추석 연휴" }, { from: "2026-09-25", to: "2026-09-25", text: "추석" }]), JSON.stringify(hs));

// ---- 마크다운 ----
const md = run(`return plMarkdown("2026-09")`);
ok("제목", md.indexOf("# 고등팀 2026년 9월 계획") === 0, md.split("\n")[0]);
ok("한 달 그림이 인용으로", md.indexOf("> 추석 전후 이탈 막기") >= 0);
ok("끝낼 것 — [상태] 굵게 — 언제 · 누가", md.indexOf("- [결정 필요] **예비고1 내신 방침 확정** — 9/14(월) · 팀 전원") >= 0, md);
ok("설명은 한 단 들여서", md.indexOf("  - 대비 없는 반 두 곳") >= 0);
ok("상담은 (상담) 을 붙여 일정 절에", md.indexOf("- 9/21(월) ~ 9/22(화) — (상담) 저조자 상담 · 담임") >= 0);
ok("쉬는 날 절", md.indexOf("## 쉬는 날") >= 0 && md.indexOf("- 9/25(금) 추석") >= 0);
ok("규칙 절", md.indexOf("- **추석 휴강** — 9/24·25, 9/26 정상수업") >= 0);
ok("할 일·학생 시험은 문서에도 없다", md.indexOf("할 일에만 있는 것") < 0);

// ---- 넣기 · 고치기 ----
ok("무엇이 없으면 안 된다", run(`return plCheckItem(plCleanItem({ kind:"goal", text:" " }))`) === "무엇을 적어야 한다");
ok("일정·상담은 날짜가 있어야 한다", /날짜가 있어야/.test(run(`return plCheckItem(plCleanItem({ kind:"consult", text:"상담" }))`)));
ok("끝낼 것은 날짜 없이도 된다", run(`return plCheckItem(plCleanItem({ kind:"goal", text:"x" }))`) === "");
ok("끝이 시작보다 앞이면 버린다", run(`return plCleanItem({ kind:"event", text:"x", from:"2026-09-10", to:"2026-09-09" }).to`) === "");
ok("일정에는 상태가 없다, 끝낼 것은 기본 «예정»",
  run(`return plCleanItem({ kind:"event", text:"x", from:"2026-09-10", state:"진행" }).state + "|" + plCleanItem({ kind:"goal", text:"x" }).state`) === "|예정");

(async () => {
  run(`S.ro = true;`);
  const e1 = await run(`return plSaveMonth("2026-09", plMonth("2026-09")).then(function(){return "됨";}, function(e){return e.message;})`);
  ok("선생님은 못 고친다", e1 === "월간계획은 팀장만 고친다", e1);
  ok("선생님 쪽에서는 아무것도 안 썼다", W.length === 0);
  run(`S.ro = false;`);
  await run(`var m = plMonth("2026-09"); m.goal = "  바꿈  "; m.items = m.items.filter(function (x) { return x.id !== "g6"; }); return plSaveMonth("2026-09", m);`);
  const w = W[0];
  ok("dash/monthPlan 한 문서에 (새 규칙이 필요 없다)", !!w && w.path === "dash/monthPlan", w && w.path);
  ok("다른 달은 그대로 남는다", !!w && !!w.data.months["2026-08"] && w.data.months["2026-08"].items.length === 3);
  ok("고친 달이 바뀐다 (한 달 그림 다듬기 · 지운 것 빠짐)", !!w && w.data.months["2026-09"].goal === "바꿈" && w.data.months["2026-09"].items.length === 7);
  ok("화면 상태도 바로 바뀐다", run(`return plMonth("2026-09").goal`) === "바꿈");

  // 규칙 — dash 는 선생님 읽기 · 팀장 쓰기
  const rules = fs.readFileSync("firestore.rules", "utf8");
  const blk = /match\s*\/dash\/\{doc\}\s*\{([\s\S]*?)\}/.exec(rules);
  ok("dash 는 선생님이 읽는다 (tasksLead 만 빼고)", !!blk && /role\(\)\s*==\s*"teacher"\s*&&\s*doc\s*!=\s*"tasksLead"/.test(blk[1]));
  ok("dash 쓰기는 팀장만", !!blk && /allow write:\s*if role\(\)\s*==\s*"owner"/.test(blk[1]));

  console.log(T.join("\n"));
  const bad = T.filter((x) => x.startsWith("FAIL")).length;
  console.log(bad ? "\n실패 " + bad + "건" : "\n전부 통과 (" + T.length + "건)");
  process.exit(bad ? 1 : 0);
})().catch((e) => { console.log(T.join("\n")); console.log("\n시험이 도중에 터졌다: " + e.message); process.exit(1); });
