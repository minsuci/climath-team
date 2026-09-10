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
  // 2026-09-07부터 할 일은 문서 둘로 나뉜다 — dash/tasks(공개분)와 dash/tasksLead(팀장 전용).
  // 여기서는 «달력에서 체크한 것이 저장까지 간다»만 본다. 가르는 규칙 자체는 test-tasks.js 가 지킨다.
  const items = SAVED.reduce((n, d) => n + (d.items || []).length, 0);
  ok("저장까지 간다 (문서 둘로 갈려도 하나도 안 샌다)", SAVED.length === 2 && items === 7,
    SAVED.length + "번 저장 · " + items + "건");

  // ---- 업무 달력은 «내 것»만 (2026-09-07) ----
  // "본인의 할 일이 뭔지 보기 편하려는 것이지 남의 일을 숙지하려는 게 아니다" — 마왕님.
  // 감추는 게 아니라 고르는 것이다. 여기서 빠진 할 일도 «할 일» 메뉴에는 그대로 있다.
  run(`
    S.claims = { tid: "t1", name: "한민수", role: "owner" }; S.ro = false;
    S.teachers = [{ tid:"t1", name:"한민수", role:"owner", classIds:[] },
                  { tid:"t2", name:"이창혁A", role:"teacher", classIds:[] }];
    S.tasks = [
      { id:"m1", text:"내 것",      who:"한민수",  due:"2026-09-04", status:"open" },
      { id:"m2", text:"남의 것",    who:"이창혁A", due:"2026-09-04", status:"open" },
      { id:"m3", text:"전원",       who:"전원",    due:"2026-09-04", status:"open" },
      { id:"m4", text:"담당 없음",  who:"",        due:"2026-09-04", status:"open" },
    ];
  `);
  const calIds = () => run(`return calTasks().map(function(t){return t.id;}).join(",")`);
  ok("팀장 달력엔 내 것 · 전원 · 담당 없는 것", calIds() === "m1,m3,m4", calIds());
  run(`S.claims = { tid:"t2", name:"이창혁A", role:"teacher" }; S.ro = true;`);
  // ⚠ 담당 없는 것을 선생님에게도 보이면 «아무 것도 아닌 일»이 다섯 사람 달력에 다 뜬다.
  //   담당을 정할 사람은 팀장이다.
  ok("선생님 달력엔 자기 것 · 전원만 (담당 없는 것은 안 뜬다)", calIds() === "m2,m3", calIds());
  const dueIds = run(`return dueThrough("전체", weekDays("2026-09-04")).map(function(x){return x.t.id;}).join(",")`);
  ok("«이번 주까지 해야 할 일»도 같은 잣대", dueIds === "m2,m3", dueIds);
  run(`S.claims = null;`);
  ok("누구인지 모르면 안 가린다 (빈 달력보다 낫다)", run(`return calTasks().length`) === 4);

  // ---- 한눈에 들어오게 (2026-09-10) — 쉬는 날 · 마감 · 칸 안의 글자 ----
  // 부원장님 「중등관 9월 운영 달력」을 보고 넣은 것들이다.
  run(`S.claims = null; S.ro = false;`);

  // 쉬는 날. 원장님 달력의 9월과 맞아야 한다 — 여기가 어긋나면 두 달력이 서로 다른 말을 한다.
  ok("추석 사흘이 들어 있다 (9/24~26)",
    run(`return [holidayOf("2026-09-24"), holidayOf("2026-09-25"), holidayOf("2026-09-26")].join("|")`) === "추석 연휴|추석|추석 연휴");
  ok("개천절·한글날", run(`return holidayOf("2026-10-03") && holidayOf("2026-10-09")`) === "한글날");
  ok("토요일에 걸린 개천절은 대체가 붙는다 (10/5 월)", run(`return holidayOf("2026-10-05")`) === "개천절 대체");
  ok("현충일은 대체가 없다 (대체공휴일 대상이 아니다)", run(`return holidayOf("2026-06-08")`) === "");
  ok("보통 날은 빈 글자", run(`return holidayOf("2026-09-22")`) === "");
  // ⚠ 안 적은 해를 «쉬는 날 없음» 으로 그리면 아무도 의심하지 않는다. 화면이 스스로 말해야 한다.
  ok("적어 둔 해는 안다", run(`return holidayKnown("2026-09")`) === true);
  ok("안 적은 해는 안 적었다고 한다", run(`return holidayKnown("2030-09")`) === false);

  // 마감과 ★ — 글자로 어림잡는다
  ok("«제출» 은 마감", run(`return taskMark({text:"1부 성적 취합표 제출"}).deadline`) === true);
  ok("«보고» 도 마감", run(`return taskMark({text:"한 달 그림 보고"}).deadline`) === true);
  ok("«개강» 은 ★", run(`return taskMark({text:"내신 2부 개강"}).star`) === true);
  ok("«설명회» 도 ★", run(`return taskMark({text:"10월 개강 설명회"}).star`) === true);
  ok("보통 할 일은 둘 다 아니다",
    run(`var m = taskMark({text:"학생 오답 정리"}); return m.deadline || m.star`) === false);
  ok("빈 할 일에도 안 터진다", run(`var m = taskMark({}); return m.deadline || m.star`) === false);

  // 칸 안의 글자 — 넘치면 접히되 **접히는 것은 늘 덜 급한 쪽**
  run(`S.tasks = [
    { id:"c1", text:"학생 오답 정리", due:"2026-09-16", status:"open" },
    { id:"c2", text:"저조자 통합 보고", due:"2026-09-16", status:"open" },
    { id:"c3", text:"채점 기준 영상 촬영", due:"2026-09-16", status:"open" },
    { id:"c4", text:"진도 확인", due:"2026-09-16", status:"done" },
    { id:"c5", text:"학부모 통보", due:"2026-09-16", status:"open" } ];`);
  const md = JSON.parse(run(`var m = monthDayTasks("2026-09-16","전체");
    return JSON.stringify({ show: m.show.map(function(t){return t.id;}), more: m.more, all: m.all.length });`));
  ok("칸에는 세 개까지", md.show.length === 3 && md.all === 5, JSON.stringify(md));
  ok("마감이 맨 앞에 남는다", md.show[0] === "c2", md.show.join(","));
  ok("끝낸 것은 맨 뒤로 밀린다 (접히는 쪽)", md.show.indexOf("c4") < 0, md.show.join(","));
  ok("접힌 개수를 말한다", md.more === 2, String(md.more));
  ok("아무 일 없는 날은 빈 것", run(`return monthDayTasks("2026-09-17","전체").all.length`) === 0);

  const chip = run(`return mchipHtml({id:"c2",text:"저조자 통합 보고",grade:"고1"},"2026-09-16")`);
  ok("마감 칩은 학년 색이 아니라 검정", chip.indexOf('class="mc dl"') >= 0, chip);
  const chip2 = run(`return mchipHtml({id:"c9",text:"내신 2부 개강",grade:"고1"},"2026-09-16")`);
  ok("★ 가 앞에 붙는다", chip2.indexOf(">★내신 2부 개강<") >= 0, chip2);
  ok("학년 색이 붙는다", chip2.indexOf("mc g1") >= 0, chip2);
  const chip3 = run(`return mchipHtml({id:"c4",text:"진도 확인",status:"done"},"2026-09-16")`);
  ok("끝낸 것은 ★ 도 마감도 안 붙는다", chip3.indexOf("mc done") >= 0 && chip3.indexOf("★") < 0, chip3);

  // 머리 한 줄 — 이 달이 어떤 달인가
  const sm = JSON.parse(run(`return JSON.stringify(calMonthSum("2026-09","전체"))`));
  ok("이 달 할 일을 센다 (끝낸 것은 따로)", sm.n === 4 && sm.done === 1, JSON.stringify(sm));
  ok("마감 개수를 센다", sm.dl === 1, String(sm.dl));
  ok("쉬는 날 셋 (추석)", sm.off === 3, String(sm.off));
  ok("기한 지난 것을 센다 (오늘은 9/4)", sm.late === 0, String(sm.late));
  run(`S.tasks = [{ id:"z1", text:"지난 일", due:"2026-09-01", status:"open" }];`);
  ok("오늘보다 앞선 것은 기한 지남", run(`return calMonthSum("2026-09","전체").late`) === 1);

  // ---- 손으로 넣는 달력 일정 (2026-09-10) ----
  // 할 일과 **다른 상자**다. 할 일은 담당인 사람에게만 보이고, 일정은 팀 전체가 같은 것을 본다.
  run(`S.claims = null; S.ro = false; S.tasks = [];
    S.events = [
      { id:"e1", text:"1부 시험", from:"2026-09-21", to:"2026-09-23", color:"red", grade:"고1" },
      { id:"e2", text:"통합 달력 배부", from:"2026-09-09", to:"", color:"black" },
      { id:"e3", text:"본사 워크샵", from:"2026-09-17", to:"2026-09-18", color:"purple" },
      { id:"e4", text:"중3 퍼펙트 마감", from:"2026-09-14", to:"", color:"green", grade:"중3" } ];`);

  ok("하루짜리는 칸 안의 칩", run(`return eventsOn("2026-09-09","전체").map(function(e){return e.id;}).join(",")`) === "e2");
  ok("이틀 이상은 칸에 안 뜬다 (막대로 간다)", run(`return eventsOn("2026-09-21","전체").length`) === 0);
  ok("이틀 이상만 막대가 된다",
    run(`return evRanges("전체").map(function(r){return r.id;}).sort().join(",")`) === "e1,e3");
  ok("«까지» 가 비면 하루짜리", run(`return evSpan({from:"2026-09-09", to:""})`) === false);
  ok("«까지» 가 시작과 같아도 하루짜리", run(`return evSpan({from:"2026-09-09", to:"2026-09-09"})`) === false);
  ok("학년 탭을 탄다 (중3 일정은 고1 탭에 안 뜬다)", run(`return eventsOn("2026-09-14","고1").length`) === 0);
  // 학년을 안 정한 일정은 «공통» 이다 — 할 일과 같은 규칙으로, 특정 학년 탭에서는 안 나온다.
  ok("학년 없는 일정은 «공통» 탭 것", run(`return eventsOn("2026-09-09","공통").length`) === 1);
  ok("학년 탭에는 그 학년 것만 (공통은 안 섞인다)", run(`return eventsOn("2026-09-09","고1").length`) === 0);
  ok("«전체» 탭에는 다 나온다", run(`return eventsOn("2026-09-09","전체").length + eventsOn("2026-09-14","전체").length`) === 2);
  ok("공통 탭에 학년 일정은 안 나온다", run(`return eventsOn("2026-09-14","공통").length`) === 0);

  // ⚠ 여기가 할 일과 갈리는 곳이다. 일정을 할 일에 섞었으면 담당이 아닌 사람 화면에서 사라졌다.
  run(`S.ro = true; S.claims = { role:"teacher", tid:"T2", name:"이현우" };`);
  ok("선생님에게도 일정은 그대로 보인다 (담당으로 안 가른다)",
    run(`return eventsOn("2026-09-09","전체").length`) === 1);
  ok("선생님에게도 막대는 그대로", run(`return evRanges("전체").length`) === 2);
  run(`S.ro = false; S.claims = null;`);

  // 색 — 모르는 이름이 와도 일정이 사라지면 안 된다
  ok("고른 색이 붙는다", run(`return evColor("red").fg`) === "#b42318");
  ok("모르는 색은 기본으로 (일정이 안 사라진다)", run(`return evColor("무지개").k`) === "gray");
  ok("색이 없어도 기본", run(`return evColor("").k`) === "gray");
  ok("칩이 색을 물고 나온다",
    run(`return evChipHtml({id:"e2",text:"통합 달력 배부",color:"black"})`).indexOf("background:#1f2937") >= 0);

  // ⚠ 시험 막대는 겹치면 묶지만 **일정은 안 묶는다** — 색과 글자를 사람이 고른 것이다
  run(`S.tests = []; S.classes = [];`);
  const mg = JSON.parse(run(`var m = mergeRanges(calRanges("전체"));
    return JSON.stringify(m.map(function(x){ return { t:x.text, c:x.color||"", n:x.n }; }));`));
  ok("겹치는 일정도 따로 남는다", mg.length === 2, JSON.stringify(mg));
  ok("«외 N» 으로 뭉치지 않는다", mg.every(function (x) { return x.n === 1 && x.t.indexOf("외 ") < 0; }), JSON.stringify(mg));
  ok("막대가 색을 들고 간다", mg.map(function (x) { return x.c; }).sort().join(",") === "purple,red", JSON.stringify(mg));

  const seg = JSON.parse(run(`var lay = weekSegments(mergeRanges(calRanges("전체")), weekDays("2026-09-21"));
    return JSON.stringify(lay.segs.map(function(g){ return { t:g.text, c:g.color, id:g.id }; }));`));
  ok("주에 눕혀도 색과 id 가 남는다 (눌러 고쳐야 한다)",
    seg.length === 1 && seg[0].c === "red" && seg[0].id === "e1", JSON.stringify(seg));
  const bh = run(`var lay = weekSegments(mergeRanges(calRanges("전체")), weekDays("2026-09-21"));
    return barHtml(lay.segs[0], 1);`);
  ok("막대에 색과 누를 표가 붙는다", bh.indexOf("data-cev=\"e1\"") >= 0 && bh.indexOf("#b42318") >= 0, bh);

  // 칸은 좁다 — 일정이 자리를 먹으면 할 일이 그만큼 접힌다. 일정이 먼저다.
  run(`S.tasks = [
    { id:"t1", text:"오답 정리", due:"2026-09-09", status:"open" },
    { id:"t2", text:"보충 과제", due:"2026-09-09", status:"open" },
    { id:"t3", text:"학부모 통보", due:"2026-09-09", status:"open" } ];`);
  const mt = JSON.parse(run(`var m = monthDayTasks("2026-09-09","전체", 3 - eventsOn("2026-09-09","전체").length);
    return JSON.stringify({ show: m.show.length, more: m.more });`));
  ok("일정 하나가 들어가면 할 일은 둘까지", mt.show === 2 && mt.more === 1, JSON.stringify(mt));
  ok("일정이 없는 날은 셋까지 그대로", run(`return monthDayTasks("2026-09-09","전체").show.length`) === 3);
  run(`S.tasks = []; S.events = [];`);

  // ---- 붙박이 쉬는 날을 손으로 고친다 (2026-09-10) ----
  // 마왕님 말씀 — «추석연휴도 고치고 싶어». 학원 사정은 나라 달력과 다르다.
  run(`S.ro = false; S.claims = null; S.tasks = []; S.events = [];`);
  ok("아무것도 안 고쳤으면 나라 달력 그대로", run(`return holidayOf("2026-09-25")`) === "추석");
  ok("그때는 «붙박이» 라고 말한다", run(`return holIsBuiltin("2026-09-25")`) === true);

  // 1) 연휴에 특강을 연다 — «쉬는 날» 을 끈다
  run(`S.events = [{ id:"h1", text:"추석 — 고1 특강 연다", from:"2026-09-25", to:"", color:"pink", over:true, off:false }];`);
  ok("내가 정한 것이 나라 달력을 이긴다 (안 쉬는 날이 된다)", run(`return holidayOf("2026-09-25")`) === "");
  ok("칸도 안 물든다", run(`return calMonthSum("2026-09","전체").off`) === 2, run(`return calMonthSum("2026-09","전체").off`));
  ok("더는 붙박이가 아니다", run(`return holIsBuiltin("2026-09-25")`) === false);
  // ⚠ over 는 «이 날을 내가 정한다» 는 표일 뿐이다. 칩으로도 막대로도 뜨면 같은 말이 두 번 적힌다.
  ok("칩으로 또 뜨지 않는다", run(`return eventsOn("2026-09-25","전체").length`) === 0);
  ok("막대로도 안 뜬다", run(`return evRanges("전체").length`) === 0);

  // 2) 이름만 바꾼다
  run(`S.events = [{ id:"h1", text:"추석 (본원 휴관)", from:"2026-09-25", to:"", color:"pink", over:true, off:true }];`);
  ok("고친 이름이 뜬다", run(`return holidayOf("2026-09-25")`) === "추석 (본원 휴관)");
  ok("여전히 쉬는 날", run(`return calMonthSum("2026-09","전체").off`) === 3);

  // 3) 나라 달력에 없는 날을 쉬는 날로 — 여러 날짜리도 그 사이를 전부 물들인다
  run(`S.events = [{ id:"h2", text:"본사 워크샵 휴관", from:"2026-09-17", to:"2026-09-18", color:"pink", off:true }];`);
  ok("없던 날이 쉬는 날이 된다", run(`return holidayOf("2026-09-17")`) === "본사 워크샵 휴관");
  ok("사이 날도 물든다", run(`return holidayOf("2026-09-18")`) === "본사 워크샵 휴관");
  ok("바깥 날은 그대로", run(`return holidayOf("2026-09-19")`) === "");
  ok("나라 달력 것도 그대로 남는다", run(`return holidayOf("2026-09-25")`) === "추석");
  ok("쉬는 날은 막대로 안 눕는다 (칸을 물들이는 것이다)", run(`return evRanges("전체").length`) === 0);
  ok("쉬는 날은 칩으로도 안 뜬다", run(`return eventsOn("2026-09-17","전체").length`) === 0);
  ok("추석 셋 + 워크샵 둘", run(`return calMonthSum("2026-09","전체").off`) === 5,
    run(`return String(calMonthSum("2026-09","전체").off)`));

  // 4) 지우면 나라 달력대로 돌아간다 — 되돌리는 길이 이것뿐이라 폼에도 그렇게 적었다
  run(`S.events = [];`);
  ok("지우면 원래대로", run(`return holidayOf("2026-09-25")`) === "추석" && run(`return holidayOf("2026-09-17")`) === "");

  // 5) 보통 일정에도 «쉬는 날» 을 켤 수 있다 — over 가 아니어도 된다
  run(`S.events = [{ id:"h3", text:"개원기념일", from:"2026-09-10", to:"", color:"pink", off:true }];`);
  ok("over 없이도 쉬는 날이 된다", run(`return holidayOf("2026-09-10")`) === "개원기념일");
  run(`S.events = []; S.tasks = [];`);

  console.log(T.join("\n"));
  const bad = T.filter((x) => x.startsWith("FAIL")).length;
  console.log(bad ? "\n실패 " + bad + "건" : "\n전부 통과 (" + T.length + "건)");
  process.exit(bad ? 1 : 0);
}).catch((e) => { console.error("터짐:", e); process.exit(1); });
