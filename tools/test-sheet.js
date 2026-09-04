// 성적 시트 읽기를 확인한다. 머리글이 두 줄이고 칸이 묶여 있어서, 묶임을 잘못 풀면
// 점수가 **다른 시험 칸에서** 딸려온다. 실제 시트의 머리글 모양을 그대로 놓고 시험한다.
//
// ⚠ 구글 시트 API 는 묶인 칸의 값을 **맨 왼쪽 칸에만** 주고 나머지는 빈 칸으로 준다.
//   (드라이브 텍스트 내보내기는 [merged] 로 반복해 보여주므로 그걸 보고 짜면 틀린다)
const fs = require("fs"), vm = require("vm");
const src = /<script>([\s\S]*?)<\/script>/.exec(fs.readFileSync("index.html", "utf8"))[1];
const stub = `
var firebase={initializeApp:function(c,n){return n?{t:1}:{};},firestore:()=>({collection:()=>({doc:()=>({}),where:()=>({get:()=>Promise.resolve({forEach(){}})})})}),
  auth:()=>({onAuthStateChanged(){},currentUser:null,signOut:()=>Promise.resolve()})};
var document={querySelector:()=>null,querySelectorAll:()=>[],addEventListener(){}};
var window={addEventListener(){},scrollTo(){}},location={hash:""},history={replaceState(){}},localStorage={getItem:()=>null,setItem(){}};
var fetch=()=>Promise.reject(new Error("no net")); var alert=function(){},confirm=()=>true,prompt=()=>null;
`;
const ctx = vm.createContext({ console, setTimeout, clearTimeout, Date, Math, JSON, Object, Array, String, Number, Promise, RegExp, isNaN, parseInt });
vm.runInContext(stub + "\n" + src, ctx);
const run = (code) => vm.runInContext("(function(){" + code + "})()", ctx);
const T = [];
const ok = (n, c, e) => T.push((c ? "  OK  " : "FAIL  ") + n + (e ? "   " + e : ""));

// ---- 실제 시트 1번 탭의 머리글 (묶인 칸은 맨 왼쪽에만 값) ----
const TAB1 = [
  ["연번", "이름", "학교/학년", "소속", "담임", "3월 모의고사", "", "", "2026-1학기 중간고사", "", "6월 모의고사", "", "", "2026-1학기 기말고사", ""],
  ["", "", "", "", "", "수학(원점수)", "예상등급", "비고", "수학(예상등급)", "비고", "수학(원점수)", "예상등급", "비고", "수학(예상등급)", "비고"],
  ["3", "류승우", "세화고1", "", "김재헌", "88", "", "", "2", "수학 70.8", "", "", "", "", ""],
  ["12", "김동규", "상문고1", "", "김효상", "60", "4", "국어 66", "4", "수학 49", "58", "3", "국어 76", "", ""],
  ["14", "한수연", "동덕여고1", "", "김효상", "76", "2", "", "1", "수학 75", "76", "2", "", "", ""],
];
ctx.TAB1 = TAB1;
const p1 = JSON.parse(run(`return JSON.stringify(parseScoreSheet(TAB1))`));
ok("머리글 두 줄을 찾는다", !!p1);
ok("시험 묶음 넷을 찾는다", p1.groups.length === 4, p1.groups.map((g) => g.name).join(" / "));
const g3 = p1.groups.filter((g) => g.name === "3월 모의고사")[0];
ok("3월 모의고사 — 원점수 칸", g3 && g3.raw === 5, JSON.stringify(g3));
ok("3월 모의고사 — 예상등급 칸", g3 && g3.grade === 6);
const g6 = p1.groups.filter((g) => g.name === "6월 모의고사")[0];
ok("6월 모의고사 — 묶임을 풀어 오른쪽 칸을 맞게 잡는다", g6 && g6.raw === 10 && g6.grade === 11, JSON.stringify(g6));
const gm = p1.groups.filter((g) => g.name === "2026-1학기 중간고사")[0];
ok("중간고사는 원점수 칸이 없다 (등급만)", gm && gm.raw === -1 && gm.grade === 8, JSON.stringify(gm));
ok("연번·소속·담임은 시험으로 안 센다",
  p1.groups.every((g) => !/연번|소속|담임|학교/.test(g.name)), p1.groups.map((g) => g.name).join("/"));
ok("학생 줄만 읽는다", p1.rows.length === 3, String(p1.rows.length));
ok("이름·학교·담임을 읽는다",
  p1.rows[0].name === "류승우" && p1.rows[0].school === "세화고1" && p1.rows[0].homeroom === "김재헌",
  JSON.stringify(p1.rows[0]).slice(0, 90));

// ---- 2번 탭: 학교와 학년이 따로, 과목 칸이 섞여 있다 ----
const TAB2 = [
  ["연번", "이름", "학교", "학년", "담임", "3월 모의고사", "", "2026-1학기 중간고사", "", "6월 모의고사", "", "", "2026-1학기 기말고사", "", "", "", "", "", "", ""],
  ["", "", "", "", "", "수학(원점수)", "예상등급", "수학(예상등급)", "비고", "수학(원점수)", "예상등급", "비고", "수학(원점수)", "예상등급", "국", "영", "수", "사", "과", "한", "정보"],
  ["1", "박서준", "휘문고", "고2", "한민수", "90", "1", "1", "", "88", "1", "", "95", "1", "", "", "", "", "", "", ""],
];
ctx.TAB2 = TAB2;
const p2 = JSON.parse(run(`return JSON.stringify(parseScoreSheet(TAB2))`));
ok("학교·학년이 따로여도 읽는다", p2.rows[0].school === "휘문고" && p2.rows[0].grade === "고2",
  JSON.stringify(p2.rows[0]).slice(0, 80));
const f2 = p2.groups.filter((g) => g.name === "2026-1학기 기말고사")[0];
ok("과목 칸(국·영·수)은 점수 칸으로 안 센다", f2 && f2.raw === 12 && f2.grade === 13, JSON.stringify(f2));

// ---- 머리글이 없으면 조용히 포기한다 ----
ok("머리글이 없으면 null", run(`return parseScoreSheet([["아무","말"],["1","2"]])`) === null);
ok("빈 시트도 null", run(`return parseScoreSheet([])`) === null);

// ---- 시험 이름으로 묶음 찾기 ----
run(`globalThis.FOUND=[
  {tab:"고1", g:{name:"3월 모의고사",raw:5,grade:6}},
  {tab:"고1", g:{name:"9월 모의고사",raw:5,grade:6}},
  {tab:"고2", g:{name:"2026-1학기 중간고사",raw:-1,grade:8}}];`);
ok("이름이 같으면 그것을", run(`return matchGroup(FOUND,{name:"9월 모의고사"}).g.name`) === "9월 모의고사");
ok("띄어쓰기가 달라도 찾는다", run(`return matchGroup(FOUND,{name:"9월모의고사"}).g.name`) === "9월 모의고사");
ok("일부만 겹쳐도 찾는다", run(`return matchGroup(FOUND,{name:"모의고사"}) !== null`) === true);
ok("아예 없으면 null", run(`return matchGroup(FOUND,{name:"수능"})`) === null);

// ---- 학생 잇기 ----
run(`
  S.students=[{pid:"p1",name:"김동규",grade:"고1",school:"상문고"},
              {pid:"p2",name:"한수연",grade:"고1",school:"동덕여고"},
              {pid:"p3",name:"이서우",grade:"고2",school:"반포고"},
              {pid:"p4",name:"이서우",grade:"고1",school:"세화고"}];
`);
ok("이름 하나면 잇는다", run(`return matchStudent({name:"김동규",school:"상문고1"},"고1").p.pid`) === "p1");
ok("학년이 다르면 안 잇고 이유를 준다",
  run(`return matchStudent({name:"이서우",school:"반포고2"},"중3").err`).indexOf("학년이 다름") === 0,
  run(`return matchStudent({name:"이서우",school:"반포고2"},"중3").err`));
ok("명단에 없으면 이유를 준다", run(`return matchStudent({name:"모르는이",school:""},"고1").err`) === "명단에 없음");
ok("동명이인은 시트의 학교로 가른다", run(`return matchStudent({name:"이서우",school:"반포고2"},"").p.pid`) === "p3");
ok("학교로도 못 가르면 안 잇는다",
  run(`return matchStudent({name:"이서우",school:""},"").err`).indexOf("동명이인") === 0,
  run(`return matchStudent({name:"이서우",school:""},"").err`));

// ---- 미리보기 — 빈 줄은 안 가져오고, 이미 넣은 것은 표시만 ----
run(`
  S.testScores={ p2:{ raw:"70", grade:"3" } };
  S.pullPick={ tab:"고1", g:{name:"3월 모의고사",raw:5,grade:6,note:7}, rows:[
    {name:"김동규",school:"상문고1",row:["12","김동규","상문고1","","김효상","60","4","비고"]},
    {name:"한수연",school:"동덕여고1",row:["14","한수연","동덕여고1","","김효상","76","2",""]},
    {name:"류승우",school:"세화고1",row:["3","류승우","세화고1","","김재헌","","",""]},
    {name:"모르는이",school:"어디고1",row:["9","모르는이","어디고1","","","55","5",""]}
  ]};
`);
const pv = JSON.parse(run(`return JSON.stringify(pullPreview({grade:"고1",name:"3월 모의고사"}))`));
ok("빈 줄은 안 가져온다", pv.list.every((x) => x.p.name !== "류승우"), pv.list.map((x) => x.p.name).join(","));
ok("점수와 등급을 가져온다", pv.list[0].raw === "60" && pv.list[0].grade === "4", JSON.stringify(pv.list[0]).slice(0, 70));
ok("이미 넣은 사람은 표시된다", pv.list.filter((x) => x.had).length === 1);
ok("못 찾은 사람은 이유와 함께 따로", pv.skip.length === 1 && pv.skip[0].name === "모르는이", JSON.stringify(pv.skip));

console.log(T.join("\n"));
const bad = T.filter((x) => x.startsWith("FAIL")).length;
console.log(bad ? "\n실패 " + bad + "건" : "\n전부 통과 (" + T.length + "건)");
process.exit(bad ? 1 : 0);
