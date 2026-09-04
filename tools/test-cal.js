// 학년 업무 달력 — 주 계산과 "이번 주까지 해야 할 일"을 확인한다.
// 반복 업무를 status 하나로 다루면 이번 주에 했다고 다음 주도 끝난 게 된다. 거기가 제일 위험하다.
const fs = require("fs"), vm = require("vm");
const src = /<script>([\s\S]*?)<\/script>/.exec(fs.readFileSync("index.html", "utf8"))[1];

const SAVED = [];
const teamDb = { collection: () => ({ doc: () => ({
  set: (d) => { SAVED.push(JSON.parse(JSON.stringify(d))); return Promise.resolve(); },
  get: () => Promise.resolve({ exists: false }) }) }) };
const stub = `
var firebase={initializeApp:function(c,n){return n?{t:1}:{};},firestore:function(app){return app?TEAMDB:CLASSDB;},
  auth:()=>({onAuthStateChanged(){},currentUser:null,signOut:()=>Promise.resolve()})};
var document={querySelector:()=>null,querySelectorAll:()=>[],addEventListener(){}};
var window={addEventListener(){},scrollTo(){}},location={hash:""},history={replaceState(){}},localStorage={getItem:()=>null,setItem(){}};
var fetch=()=>Promise.reject(new Error("no net")); var alert=function(){},confirm=()=>true,prompt=()=>null;
`;
const ctx = vm.createContext({ console, setTimeout, clearTimeout, Date, Math, JSON, Object, Array, String, Number,
  Promise, RegExp, isNaN, parseInt, TEAMDB: teamDb, CLASSDB: { collection: () => ({ doc: () => ({ get: () => Promise.resolve({ exists: false }) }) }) } });
vm.runInContext(stub + "\n" + src, ctx);
const run = (code) => vm.runInContext("(function(){" + code + "})()", ctx);
const T = [];
const ok = (n, c, e) => T.push((c ? "  OK  " : "FAIL  ") + n + (e ? "   " + e : ""));

// 오늘을 못 박는다. 2026-09-04 는 금요일이고, 그 주는 8/31(월) ~ 9/6(일).
run(`TODAY = "2026-09-04";`);

// ---- 주 계산 ----
ok("금요일의 주는 그 주 월요일부터", run(`return weekStart("2026-09-04")`) === "2026-08-31");
ok("월요일은 그대로", run(`return weekStart("2026-08-31")`) === "2026-08-31");
// ⚠ 일요일이 함정이다. getDay()가 0이라 그냥 빼면 **다음 주 월요일**이 나온다.
ok("일요일은 그 주 월요일로 (다음 주가 아니라)", run(`return weekStart("2026-09-06")`) === "2026-08-31",
  run(`return weekStart("2026-09-06")`));
ok("주는 월~일 이레", run(`return weekDays("2026-09-04").join(",")`) ===
  "2026-08-31,2026-09-01,2026-09-02,2026-09-03,2026-09-04,2026-09-05,2026-09-06",
  run(`return weekDays("2026-09-04").join(",")`));

// ---- 어느 날에 놓이는가 ----
ok("기한이 그날이면 놓인다", run(`return taskOnDate({due:"2026-09-04"},"2026-09-04")`) === true);
ok("기한이 다른 날이면 안 놓인다", run(`return taskOnDate({due:"2026-09-04"},"2026-09-05")`) === false);
ok("매주 금요일은 금요일에만", run(`
  var t={repeat:{dow:[5]}};
  return taskOnDate(t,"2026-09-04")+"/"+taskOnDate(t,"2026-09-03");`) === "true/false");
ok("기한 없는 한 번짜리는 아무 날에도 안 놓인다", run(`return taskOnDate({},"2026-09-04")`) === false);

// ---- 반복은 날짜마다 따로 끝난다 (핵심) ----
ok("한 번짜리는 status 로 끝난다", run(`
  return taskDoneOn({status:"done"},"2026-09-04")+"/"+taskDoneOn({status:"open"},"2026-09-04");`) === "true/false");
ok("반복은 체크한 날만 끝난다", run(`
  var t={repeat:{dow:[5]},doneOn:{"2026-09-04":true}};
  return taskDoneOn(t,"2026-09-04")+"/"+taskDoneOn(t,"2026-09-11");`) === "true/false",
  run(`var t={repeat:{dow:[5]},doneOn:{"2026-09-04":true}}; return taskDoneOn(t,"2026-09-04")+"/"+taskDoneOn(t,"2026-09-11");`));
ok("반복은 status 를 안 본다 (이번 주 했다고 영영 끝나면 안 된다)",
  run(`return taskDoneOn({repeat:{dow:[5]},status:"done"},"2026-09-04")`) === false);

// ---- 이번 주까지 해야 할 일 ----
run(`
  S.tasks = [
    {id:"a", text:"지난 주에 했어야 할 것", due:"2026-08-25", status:"open", grade:"고1"},
    {id:"b", text:"이번 주 금요일", due:"2026-09-04", status:"open", grade:"고1"},
    {id:"c", text:"다음 주", due:"2026-09-10", status:"open", grade:"고1"},
    {id:"d", text:"이미 끝낸 것", due:"2026-09-02", status:"done", grade:"고1"},
    {id:"e", text:"매주 월·금 강사 공지", repeat:{dow:[1,5]}, doneOn:{}, grade:""},
    {id:"f", text:"중3 것", due:"2026-09-03", status:"open", grade:"중3"},
    {id:"g", text:"기한 없음", status:"open", grade:"고1"}
  ];
`);
const DAYS = `weekDays("2026-09-04")`;
const list = (want) => run(`return dueThrough(${want ? '"' + want + '"' : '""'}, ${DAYS}).map(function(x){return x.t.id+"@"+x.date;}).join(",")`);
ok("기한 지난 것이 들어온다", list("").includes("a@2026-08-25"), list(""));
ok("이번 주 것이 들어온다", list("").includes("b@2026-09-04"));
ok("다음 주 것은 안 들어온다", !list("").includes("c@"), list(""));
ok("끝낸 것은 안 들어온다", !list("").includes("d@"));
ok("기한 없는 것은 안 들어온다", !list("").includes("g@"));
ok("반복은 그 주의 요일마다 한 건씩", list("").includes("e@2026-08-31") && list("").includes("e@2026-09-04"), list(""));
ok("날짜 차례로 늘어놓는다",
  list("").split(",").map((x) => x.split("@")[1]).join("|") ===
  list("").split(",").map((x) => x.split("@")[1]).slice().sort().join("|"), list(""));
ok("기한 지난 것에 late 표시", run(`return dueThrough("", ${DAYS}).filter(function(x){return x.late;}).map(function(x){return x.t.id;}).join(",")`)
  .split(",").includes("a"), run(`return dueThrough("", ${DAYS}).filter(function(x){return x.late;}).map(function(x){return x.t.id;}).join(",")`));

// ---- 학년으로 가르기 ----
ok("고1만 고르면 중3 것은 빠진다", !list("고1").includes("f@"), list("고1"));
ok("고1을 고르면 학년 없는 반복도 빠진다 (그건 공통이다)", !list("고1").includes("e@"), list("고1"));
ok("공통을 고르면 학년 없는 것만", list("공통").includes("e@") && !list("공통").includes("b@"), list("공통"));
ok("전체는 다 본다", list("전체").includes("f@") && list("전체").includes("b@"), list("전체"));

// ---- 반복 체크는 그날만 뒤집는다 ----
vm.runInContext(`globalThis.__t = (async function(){
  await toggleTask("e","2026-09-04");
  var t = S.tasks.filter(function(x){return x.id==="e";})[0];
  var after = dueThrough("", weekDays("2026-09-04")).map(function(x){return x.t.id+"@"+x.date;}).join(",");
  return JSON.stringify(t.doneOn) + " | " + after;
})();`, ctx);

// ---- 앱이 아는 일정 ----
run(`
  S.term="2026 2학기 중간";
  S.schoolTerms={};
  S.schoolTerms["k1"]={term:"2026 2학기 중간",school:"중대부고",grade:"고1",start:"2026-09-02",math:"2026-09-04",end:"2026-09-05",back:"2026-09-14"};
  S.schoolTerms["k2"]={term:"2026 2학기 중간",school:"봉은중",grade:"중3",start:"2026-09-03"};
  S.schoolTerms["k3"]={term:"옛 회차",school:"딴학교",grade:"고1",start:"2026-09-01"};
  S.tests=[{tid:"t1",kind:"mock",name:"9월 학평",grade:"고1",date:"2026-09-02"}];
  S.classes=[{id:"c1",name:"고1S",endDate:"2026-09-05",roster:[]}];
`);
const auto = (want) => run(`return calAuto("${want}","2026-08-31","2026-09-06").map(function(a){return a.kind+":"+a.text+"@"+a.date;}).join(" | ")`);
ok("학교 시험 날짜가 달력에 뜬다", auto("전체").includes("중대부고 수학시험@2026-09-04"), auto("전체"));
ok("복귀가 이 주 밖이면 안 뜬다", !auto("전체").includes("복귀"), auto("전체"));
ok("다른 회차는 안 뜬다", !auto("전체").includes("딴학교"), auto("전체"));
ok("시험 성적의 시험 날짜도 뜬다", auto("전체").includes("test:모의 9월 학평@2026-09-02"), auto("전체"));
ok("반 종강도 뜬다", auto("전체").includes("고1S 종강"));
ok("학년으로 거른다", !auto("고1").includes("봉은중") && auto("고1").includes("중대부고"), auto("고1"));

ctx.__t.then((r) => {
  const [doneOn, after] = r.split(" | ");
  ok("반복을 체크하면 그날만 끝난다", doneOn === '{"2026-09-04":true}', doneOn);
  ok("체크한 날은 목록에서 빠지고 다른 날은 남는다",
    !after.includes("e@2026-09-04") && after.includes("e@2026-08-31"), after);
  ok("저장까지 간다", SAVED.length === 1 && SAVED[0].items.length === 7, String(SAVED.length));

  console.log(T.join("\n"));
  const bad = T.filter((x) => x.startsWith("FAIL")).length;
  console.log(bad ? "\n실패 " + bad + "건" : "\n전부 통과 (" + T.length + "건)");
  process.exit(bad ? 1 : 0);
}).catch((e) => { console.error("터짐:", e); process.exit(1); });
