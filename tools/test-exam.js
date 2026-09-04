// 내신 참여표 계산을 확인한다. 등원 회차는 **수강료에 쓰는 숫자**라 조용히 틀리면 안 된다.
// 수업관리 앱 CLAUDE.md 에 적힌 함정들을 그대로 시험한다.
const fs = require("fs"), vm = require("vm");
const src = /<script>([\s\S]*?)<\/script>/.exec(fs.readFileSync("index.html", "utf8"))[1];
const stub = `
var firebase={initializeApp:()=>({}),firestore:()=>({collection:()=>({doc:()=>({get:()=>Promise.resolve({exists:false})})})}),
  auth:()=>({onAuthStateChanged(){},currentUser:null,signOut:()=>Promise.resolve()})};
var document={querySelector:()=>null,querySelectorAll:()=>[],addEventListener(){}};
var window={addEventListener(){},scrollTo(){}},location={hash:""},history={replaceState(){}},localStorage={getItem:()=>null,setItem(){}};
var fetch=()=>Promise.reject(new Error("no net")); var alert=function(){},confirm=()=>true,prompt=()=>null;
`;
const ctx = vm.createContext({ console, setTimeout, clearTimeout, Date, Math, JSON, Object, Array, String, Number, Promise, RegExp, isNaN, parseInt });
vm.runInContext(stub + "\n" + src, ctx);
const run = (code) => vm.runInContext("(function(){" + code + "})()", ctx);

const T = [];
const ok = (name, cond, extra) => T.push((cond ? "  OK  " : "FAIL  ") + name + (extra ? "   " + extra : ""));

// 1. 문서 열쇠가 수업관리 앱과 같아야 한다 — 다르면 서로 다른 문서에 쓴다
ok("문서 열쇠 — 공백이 _ 로", run(`return examKey("2026 2학기 중간","s1")`) === "2026_2학기_중간__s1");
ok("문서 열쇠 — 슬래시도 _ 로", run(`return examKey("2026/2학기","s1")`) === "2026_2학기__s1");

// 2. 안 오는 구간 = 직보 다음날 ~ 복귀 전날 (내신기간이 아니다)
const V = { start: "2026-09-14", end: "2026-09-23", math: "2026-09-22", prep: "2026-09-21", back: "2026-09-29" };
ctx.V = V;
ok("안 오는 구간은 직보 다음날부터", run(`return JSON.stringify(outRange(V))`) === '{"s":"2026-09-22","e":"2026-09-28"}',
  run(`return JSON.stringify(outRange(V))`));
ok("시험이 끝나도 복귀 전이면 안 온다 (9/24)", run(`return isOutOn(V,"2026-09-24")`) === true);
ok("내신기간으로 쟀다면 9/24는 오는 날로 잘못 잡힌다",
  run(`return "2026-09-24" > V.end`) === true, "— 그래서 outRange 를 따로 둔다");
ok("복귀일은 오는 날", run(`return isOutOn(V,"2026-09-29")`) === false);
ok("직보일은 오는 날", run(`return isOutOn(V,"2026-09-21")`) === false);

// 3. 등원 회차 — 화목반 9월
const CLS = { id: "c1", name: "고1S", classDays: [2, 4] };      // 화·목
ctx.CLS = CLS; ctx.ST = { id: "r1", name: "김서진" };
const md = run(`return JSON.stringify(daysOfMonth("2026-09"))`);
ok("9월은 30일", JSON.parse(md).length === 30);
const ac = JSON.parse(run(`return JSON.stringify(attendCount(CLS, ST, V, daysOfMonth("2026-09"), "2026-09"))`));
const allTueThu = JSON.parse(md).filter((d) => [2, 4].indexOf(new Date(d + "T00:00:00").getDay()) >= 0);
ok("그 달 수업일 수가 맞다", ac.total === allTueThu.length, ac.total + " / " + allTueThu.length);
ok("빠지는 날이 잡힌다", ac.skip > 0, "skip=" + ac.skip);
ok("등원 = 수업일 − 빠지는 날 + 직보·복귀", ac.come === ac.total - ac.skip +
  [V.prep, V.back].filter((d) => allTueThu.indexOf(d) < 0).length, JSON.stringify(ac));

// 4. 반 요일이 비면 그 달 전체가 수업일이 되면 안 된다 (attendsOn 함정)
ctx.EMPTY = { id: "c9", name: "요일없음", classDays: [] };
const ac2 = JSON.parse(run(`return JSON.stringify(attendCount(EMPTY, ST, {}, daysOfMonth("2026-09"), "2026-09"))`));
ok("요일이 없으면 수업일 0 (31회로 안 튄다)", ac2.total === 0 && ac2.come === 0, JSON.stringify(ac2));

// 5. 제출에 적힌 요일이 반 요일보다 우선 — 반 요일이 바뀌어도 그때 센 회차가 재현된다
ctx.V2 = Object.assign({}, V, { days: [1, 5] });   // 월·금
const ac3 = JSON.parse(run(`return JSON.stringify(attendCount(CLS, ST, V2, daysOfMonth("2026-09"), "2026-09"))`));
const allMonFri = JSON.parse(md).filter((d) => [1, 5].indexOf(new Date(d + "T00:00:00").getDay()) >= 0);
ok("제출의 요일을 먼저 쓴다", ac3.total === allMonFri.length, ac3.total + " / " + allMonFri.length);

// 6. 수강기간이 끝난 학생은 안 센다
ctx.ST2 = { id: "r2", name: "그만둔학생", endDate: "2026-09-10" };
const ac4 = JSON.parse(run(`return JSON.stringify(attendCount(CLS, ST2, V, daysOfMonth("2026-09"), "2026-09"))`));
ok("수강종료 뒤는 안 센다", ac4.total < ac.total, ac4.total + " < " + ac.total);

// 7. 표식 우선순위 — 수학시험이 내신기간보다 위
ok("수학시험 표식", run(`return markOf(V,"2026-09-22").t`) === "수");
ok("직보 표식", run(`return markOf(V,"2026-09-21").t`) === "직");
ok("복귀 표식", run(`return markOf(V,"2026-09-29").t`) === "첫");
ok("내신기간 표식", run(`return markOf(V,"2026-09-16").t`) === "시");
ok("기간 밖은 표식 없음", run(`return markOf(V,"2026-09-05")`) === null);

// 8. 달력 칠하기
ok("시험기간은 두 번 눌러 정한다", run(`
  S.exForm={school:"",grade:"",start:"",end:"",math:"",prep:"",back:"",note:""}; S.exMode="exam"; S.exAnchor="";
  paint("2026-09-14"); var mid=S.exForm.start+"~"+S.exForm.end;
  paint("2026-09-23");
  return mid+" → "+S.exForm.start+"~"+S.exForm.end;
`) === "2026-09-14~2026-09-14 → 2026-09-14~2026-09-23");
ok("거꾸로 눌러도 앞뒤가 맞는다", run(`
  S.exForm={start:"",end:"",math:"",prep:"",back:""}; S.exMode="exam"; S.exAnchor="";
  paint("2026-09-23"); paint("2026-09-14");
  return S.exForm.start+"~"+S.exForm.end;
`) === "2026-09-14~2026-09-23");
ok("수학시험을 정하면 직보가 전날로 따라온다", run(`
  S.exForm={start:"",end:"",math:"",prep:"",back:""}; S.exMode="math"; S.exAnchor="";
  paint("2026-09-22"); return S.exForm.math+"/"+S.exForm.prep;
`) === "2026-09-22/2026-09-21");
ok("직보를 손으로 고쳤으면 안 따라간다", run(`
  S.exForm={start:"",end:"",math:"2026-09-22",prep:"2026-09-18",back:""}; S.exMode="math"; S.exAnchor="";
  paint("2026-09-25"); return S.exForm.math+"/"+S.exForm.prep;
`) === "2026-09-25/2026-09-18");
ok("같은 날 다시 누르면 지워진다", run(`
  S.exForm={start:"",end:"",math:"2026-09-22",prep:"2026-09-21",back:""}; S.exMode="math"; S.exAnchor="";
  paint("2026-09-22"); return S.exForm.math;
`) === "");
ok("지우개는 시험기간을 통째로 지운다", run(`
  S.exForm={start:"2026-09-14",end:"2026-09-23",math:"2026-09-22",prep:"",back:""}; S.exMode="erase"; S.exAnchor="";
  paint("2026-09-16");
  return S.exForm.start+"/"+S.exForm.end+"/"+S.exForm.math;
`) === "//2026-09-22");

// 9. 같은 학교·학년인데 갈린 일정 찾기
ok("일정 지문이 시작·끝·수학으로 만들어진다",
  run(`return examSig({start:"a",end:"b",math:"c",back:"z"})`) === "a~b~c", "복귀는 학생마다 달라도 된다");

// 10. 달 이동
ok("달 넘기기 — 12월 다음은 이듬해 1월", run(`return shiftMonth("2026-12",1)`) === "2027-01");
ok("달 넘기기 — 1월 이전은 지난해 12월", run(`return shiftMonth("2026-01",-1)`) === "2025-12");

// 11. 정렬 — 오름 → 내림 → 원래 순서, 빈 칸은 늘 아래
run(`
  S.teachers=[{tid:"T1",name:"한민수"},{tid:"T2",name:"이창혁A"}];
  S.byPid={p1:{pid:"p1",homeroom:"T2"},p2:{pid:"p2",homeroom:"T1"},p3:{pid:"p3",homeroom:"T1"}};
  globalThis.ROWS=[
    {cls:{id:"c2",name:"고1T"}, st:{id:"r1",name:"김서진",pid:"p1"}, school:"중대부고", v:{start:"2026-09-14",math:"2026-09-22",school:"중대부고"}},
    {cls:{id:"c1",name:"고1S"}, st:{id:"r2",name:"임서윤",pid:"p2"}, school:"경기고",   v:{start:"2026-09-07",math:"2026-09-15",school:"경기고"}},
    {cls:{id:"c1",name:"고1S"}, st:{id:"r3",name:"박준서",pid:"p3"}, school:"",        v:null}
  ];
`);
const order = (key, dir) => run(
  'S.exSort=' + (key ? '{key:"' + key + '",dir:"' + dir + '"}' : "null") + ';' +
  'return examSortRows(ROWS, daysOfMonth("2026-09"), "2026-09").map(function(x){return x.st.name;}).join(",");');
ok("정렬 없으면 원래 순서", order(null) === "김서진,임서윤,박준서", order(null));
ok("수학시험 날짜 오름차순", order("math", "asc") === "임서윤,김서진,박준서", order("math", "asc"));
ok("수학시험 날짜 내림차순", order("math", "desc") === "김서진,임서윤,박준서", order("math", "desc"));
ok("안 낸 사람은 내림차순에서도 맨 아래", order("math", "desc").endsWith("박준서"));
ok("내신 시작일 오름차순", order("start", "asc") === "임서윤,김서진,박준서", order("start", "asc"));
ok("반 이름순 (같은 반은 이름 가나다)", order("cls", "asc") === "박준서,임서윤,김서진", order("cls", "asc"));
ok("담임순", order("homeroom", "asc") === "김서진,박준서,임서윤", order("homeroom", "asc"));
ok("이름순", order("name", "asc") === "김서진,박준서,임서윤", order("name", "asc"));
ok("학교순 (빈 학교는 아래)", order("school", "asc") === "임서윤,김서진,박준서", order("school", "asc"));
ok("등원 회차순도 숫자로 (글자로 세면 10이 9보다 앞)", run(`
  S.exSort={key:"come",dir:"asc"};
  var a={cls:{name:"A",classDays:[1,2,3,4,5]}, st:{id:"a",name:"많이"}, v:{start:"2026-09-01",end:"2026-09-01"}};
  var b={cls:{name:"B",classDays:[1]},         st:{id:"b",name:"적게"}, v:{start:"2026-09-01",end:"2026-09-01"}};
  return examSortRows([a,b], daysOfMonth("2026-09"), "2026-09").map(function(x){return x.st.name;}).join(",");
`) === "적게,많이");
// 띠와 표는 **같은 목록**을 써야 한다. 정렬한 배열에서 낸 사람만 걸러 내므로 순서가 어긋날 수 없다 —
// 따로 걸면 이름은 같은 줄인데 날짜 칸이 다른 사람 것이 된다.
ok("띠에 쓰는 목록이 표와 같은 순서", run(`
  S.exSort={key:"math",dir:"asc"};
  var sorted=examSortRows(ROWS, daysOfMonth("2026-09"), "2026-09");
  var done=sorted.filter(function(x){return x.v;}).map(function(x){return x.st.name;}).join(",");
  var table=sorted.map(function(x){return x.st.name;}).join(",");
  return done + " | " + table;
`) === "임서윤,김서진 | 임서윤,김서진,박준서");

console.log(T.join("\n"));
const bad = T.filter((x) => x.startsWith("FAIL")).length;
console.log(bad ? "\n실패 " + bad + "건" : "\n전부 통과 (" + T.length + "건)");
process.exit(bad ? 1 : 0);
