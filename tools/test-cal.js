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

// ---- 월간 격자 ----
// 그 달을 주 단위로 꽉 채운다. 월말 걸친 주를 잘라내면 그 주가 통째로 안 보인다.
const G9 = run(`return monthGrid("2026-09")`);
ok("월요일에서 시작한다", G9[0] === "2026-08-31", G9[0]);
ok("일요일에서 끝난다", G9[G9.length - 1] === "2026-10-04", G9[G9.length - 1]);
ok("주 단위로 딱 떨어진다", G9.length % 7 === 0, String(G9.length));
ok("그 달을 하루도 안 빠뜨린다",
  run(`return daysOfMonth("2026-09").every(function(d){ return monthGrid("2026-09").indexOf(d) >= 0; })`) === true);
ok("앞뒤로 딸려온 날은 그 달이 아니다",
  G9.filter((d) => d.slice(0, 7) !== "2026-09").join(",") === "2026-08-31,2026-10-01,2026-10-02,2026-10-03,2026-10-04",
  G9.filter((d) => d.slice(0, 7) !== "2026-09").join(","));
// 1일이 월요일인 달은 앞이 안 딸려온다
ok("1일이 월요일이면 그 날부터", run(`return monthGrid("2026-06")[0]`) === "2026-06-01",
  run(`return monthGrid("2026-06")[0] + " (1일 요일: " + DOW_KO[parseYmd("2026-06-01").getDay()] + ")"`));

// ---- 달 옮기기 — 날짜가 넘치면 붙든다 ----
ok("1/31 에서 한 달 뒤는 2/28", run(`return shiftAnchorMonth("2026-01-31",1)`) === "2026-02-28",
  run(`return shiftAnchorMonth("2026-01-31",1)`));
ok("3/31 에서 한 달 앞은 2/28", run(`return shiftAnchorMonth("2026-03-31",-1)`) === "2026-02-28",
  run(`return shiftAnchorMonth("2026-03-31",-1)`));
ok("12월 다음은 이듬해 1월", run(`return shiftAnchorMonth("2026-12-15",1)`) === "2027-01-15");
ok("1월 이전은 지난해 12월", run(`return shiftAnchorMonth("2026-01-15",-1)`) === "2025-12-15");
ok("넘치지 않으면 날짜를 지킨다", run(`return shiftAnchorMonth("2026-09-04",1)`) === "2026-10-04");

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
// ⚠ 학교 내신 일정은 **여기 안 나온다.** 학교가 서른 곳이면 달력이 시험 막대로 뒤덮인다.
//    그건 내신 참여표의 날짜 띠에서 본다 (2026-09-05 결정).
run(`
  S.term="2026 2학기 중간";
  S.schoolTerms={};
  S.schoolTerms["k1"]={term:"2026 2학기 중간",school:"중대부고",grade:"고1",
                       start:"2026-09-02",end:"2026-09-05",math:"2026-09-04",back:"2026-09-14",label:"중간고사"};
  S.tests=[{tid:"t1",kind:"mock",name:"9월 학평",grade:"고1",date:"2026-09-02"},
           {tid:"t2",kind:"midterm",name:"2학기 중간",grade:"중3",date:"2026-09-04"}];
  S.classes=[{id:"c1",name:"고1S",endDate:"2026-09-05",roster:[]}];
`);
const R = (want) => JSON.parse(run(`return JSON.stringify(calRanges("${want}"))`));
const all = R("전체");
const names = all.map((x) => x.text);
ok("학교 내신 기간은 안 나온다", !names.some((n) => n.indexOf("중간고사") >= 0 && n.indexOf("중대부고") >= 0), names.join(" | "));
ok("수학시험·복귀도 안 나온다", !names.some((n) => /수학시험|복귀/.test(n)), names.join(" | "));
ok("시험 성적에 만든 시험은 나온다", names.some((n) => n.indexOf("9월 학평") >= 0), names.join(" | "));
ok("반 종강도 나온다", names.some((n) => n.indexOf("종강") >= 0), names.join(" | "));
ok("만든 시험은 하루짜리", all.filter((x) => x.kind === "test").every((x) => x.s === x.e));
ok("학년으로 거른다", R("고1").every((x) => x.text.indexOf("2학기 중간") < 0),
  R("고1").map((x) => x.text).join(" | "));
ok("학년 없는 종강은 어느 학년에서나 보인다", R("고2").some((x) => x.kind === "class"),
  R("고2").map((x) => x.text).join(" | "));

// ---- 내신 시작에 붙는 학생 이름 ----
// "누가 언제 안 오나"가 «앞으로 2주» 의 물음이다. 학교 이름만 뜨면 매번 명단을 다시 뒤진다.
run(`
  S.students=[{pid:"p1",name:"김서진",school:"중대부고",grade:"고1"},
              {pid:"p2",name:"박준서",school:"중대부고",grade:"고1"},
              {pid:"p3",name:"임서윤",school:"중대부고",grade:"고2"},
              {pid:"p4",name:"설민준",school:"봉은중",grade:"중3"},
              {pid:"p5",name:"반없는",school:"중대부고",grade:"고1"}];
  S.classes=[{id:"c1",name:"고1S",roster:[{id:"r1",pid:"p1",name:"김서진"},{id:"r2",pid:"p2",name:"박준서"}]},
             {id:"c2",name:"고1T",roster:[{id:"r3",pid:"p2",name:"박준서"}]}];
`);
const WHO = JSON.parse(run(`return JSON.stringify(studentsAt("중대부고","고1"))`));
ok("그 학교·학년 학생만 고른다", WHO.map((x) => x.name).join(",") === "김서진,박준서,반없는",
  WHO.map((x) => x.name).join(","));
ok("다른 학년은 안 섞인다", !WHO.some((x) => x.name === "임서윤"));
ok("다른 학교도 안 섞인다", !WHO.some((x) => x.name === "설민준"));
ok("이름 가나다 차례", WHO.map((x) => x.name).join(",") === WHO.map((x) => x.name).slice().sort((a, b) => a.localeCompare(b, "ko")).join(","));
ok("어느 반인지 같이 준다", WHO.filter((x) => x.name === "김서진")[0].cls === "고1S",
  JSON.stringify(WHO.filter((x) => x.name === "김서진")[0]));
ok("반이 둘이면 둘 다", WHO.filter((x) => x.name === "박준서")[0].cls === "고1S, 고1T",
  WHO.filter((x) => x.name === "박준서")[0].cls);
// ⚠ 반이 없는 학생도 빼면 안 된다 — 그 학생도 시험 때 안 온다.
ok("반이 없어도 빠지지 않는다", WHO.filter((x) => x.name === "반없는")[0].cls === "",
  JSON.stringify(WHO.filter((x) => x.name === "반없는")));
ok("학생이 없으면 빈 목록", JSON.parse(run(`return JSON.stringify(studentsAt("없는고","고1"))`)).length === 0);

// ---- 이레에 눕히기 ----
// 막대 눕히는 규칙은 자료가 어디서 오든 같아야 한다. 손으로 만든 기간으로 시험한다.
// 그 주는 8/31(월) ~ 9/6(일). 칸 번호는 0부터 여섯까지.
const RNG = [
  { s: "2026-08-28", e: "2026-09-02", kind: "exam", text: "지난주부터" },   // 왼쪽이 잘린다
  { s: "2026-09-02", e: "2026-09-05", kind: "exam", text: "이 주 안" },     // 위와 겹쳐 묶인다
  { s: "2026-09-04", e: "2026-09-04", kind: "test", text: "모의" },
  { s: "2026-09-05", e: "2026-09-05", kind: "class", text: "종강" },
  { s: "2026-09-20", e: "2026-09-22", kind: "exam", text: "딴 주" },
];
const LAY = JSON.parse(run(`return JSON.stringify(weekSegments(mergeRanges(${JSON.stringify(RNG)}), weekDays("2026-09-04")))`));
const byKind = (k) => LAY.segs.filter((x) => x.kind === k)[0];
const EXBAR = byKind("exam");
ok("겹친 둘이 한 막대로 눕는다", EXBAR && EXBAR.n === 2, JSON.stringify(EXBAR));
ok("이 주 첫 칸부터 9/5 칸까지 덮는다", EXBAR.a === 0 && EXBAR.b === 5, JSON.stringify(EXBAR));
// ⚠ 주 경계. 지난주에 시작한 것은 왼쪽이 열려 있어야 "이어진다"가 보인다.
ok("지난주에 시작했으니 왼쪽이 열린다", EXBAR.head === false && EXBAR.tail === true, JSON.stringify(EXBAR));
ok("딴 주 것은 아예 안 눕는다", LAY.segs.every((x) => x.text.indexOf("딴 주") < 0),
  LAY.segs.map((x) => x.text).join(" | "));
ok("종류가 다르면 따로 눕는다", ["exam", "test", "class"].every(byKind), LAY.segs.map((x) => x.kind).join(","));
ok("겹치면 층을 달리한다", byKind("test").lane !== EXBAR.lane,
  LAY.segs.map((x) => x.text + "=" + x.lane).join(" | "));
ok("안 겹치는 것은 같은 층에 올라탄다", byKind("class").lane === byKind("test").lane,
  LAY.segs.map((x) => x.text + "=" + x.lane).join(" | "));
// 숫자를 못 박는 것보다 **규칙**을 보는 게 낫다 — 자료가 늘어도 시험이 안 깨진다.
ok("겹치는 막대가 같은 층에 놓이는 일은 없다", (function () {
  for (var i = 0; i < LAY.segs.length; i++) {
    for (var j = i + 1; j < LAY.segs.length; j++) {
      var x = LAY.segs[i], y = LAY.segs[j];
      if (x.lane === y.lane && !(x.b < y.a || x.a > y.b)) return false;
    }
  }
  return true;
})(), LAY.segs.map((x) => x.text + "=" + x.lane).join(" | "));
ok("층 수는 가장 높은 층 + 1", LAY.lanes === Math.max.apply(null, LAY.segs.map((x) => x.lane)) + 1, String(LAY.lanes));

// ---- 그리는 자리 ----
const H = run(`
  var lay = weekSegments(mergeRanges(${JSON.stringify(RNG)}), weekDays("2026-09-04"));
  var g = lay.segs.filter(function(x){return x.kind==="exam";})[0];
  return barHtml(g, 2);
`);
ok("막대가 첫 칸부터 여섯 칸을 차지한다", H.indexOf("grid-column:1/span 6") >= 0, H.slice(0, 150));
ok("층에 맞는 줄에 놓인다 (밑줄 2 + 층 0)", H.indexOf("grid-row:2") >= 0, H.slice(0, 150));
ok("묶인 개수를 앞에 단다", H.indexOf('<b class="n">2</b>') >= 0, H.slice(0, 150));
ok("이어지는 막대는 ◂ 를 달고 왼쪽 모서리를 안 둥글린다",
  H.indexOf("◂") >= 0 && H.indexOf('class="bar exam e"') >= 0, H.slice(0, 150));
ok("손 올리면 묶인 것이 전부 보인다", H.indexOf("지난주부터 · 이 주 안") >= 0, H.slice(0, 200));

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
