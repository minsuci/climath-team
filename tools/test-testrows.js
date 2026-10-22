// 시험 성적 — 시험 고르기 줄을 내신·모의고사로 나누고 순서대로 (2026-10-22)
const fs = require("fs"), vm = require("vm");
const src = /<script>([\s\S]*?)<\/script>/.exec(fs.readFileSync("index.html", "utf8"))[1];
const stub = `
var firebase={initializeApp:function(c,n){return n?{t:1}:{};},firestore:function(){return {collection:function(){return {doc:function(){return {get:function(){return Promise.resolve({exists:false});}};}};}};},
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
// 시험 고르기 줄 (2026-10-22 «내신이랑 모의고사 따로 · 순서대로 정렬»)
run(`S.tests = [
  { tid:"m9", kind:"mock", name:"2026 9월 모의고사", grade:"고1", date:"2026-09-02" },
  { tid:"k2", kind:"midterm", name:"2026 고1 2학기", grade:"고1", date:"2026-10-01" },
  { tid:"m3", kind:"mock", name:"2026 3월 모의고사", grade:"고1", date:"2026-03-24" },
  { tid:"p1", kind:"midterm", name:"2026 예비고1 9월 중간고사", grade:"중3", date:"2026-10-01" },
  { tid:"f1", kind:"final", name:"2026 고1 1학기 기말", grade:"고1", date:"2026-07-03" },
  { tid:"k1", kind:"midterm", name:"2026 고1 1학기 중간", grade:"고1", date:"2026-04-30" },
  { tid:"m6", kind:"mock", name:"2026 6월 모의고사", grade:"고1", date:"2026-06-04" } ]; S.testPick = "";`);
const ids = (k) => JSON.stringify(run(`return testRowList(${JSON.stringify(k)}).map(function (x) { return x.tid; })`));
ok("내신 줄: 고1 1학기 중간 → 기말 → 2학기, 중3 은 뒤", ids(["midterm", "final"]) === JSON.stringify(["k1", "f1", "k2", "p1"]), ids(["midterm", "final"]));
ok("모의고사 줄: 3월 → 6월 → 9월", ids(["mock"]) === JSON.stringify(["m3", "m6", "m9"]), ids(["mock"]));
const h = run(`return testChipRows()`);
ok("줄 두 개, 이름표 «내신» · «모의고사»", (h.match(/class="chips"/g) || []).length === 2 && h.indexOf(">내신<") < h.indexOf(">모의고사<"));
ok("S.tests 순서는 건드리지 않는다", run(`return S.tests[0].tid`) === "m9");
ok("모의고사가 하나도 없으면 그 줄은 안 그린다", (function () {
  run(`S.__keep = S.tests; S.tests = S.tests.filter(function (x) { return x.kind !== "mock"; })`);
  const r = run(`return testChipRows()`); run(`S.tests = S.__keep`);
  return (r.match(/class="chips"/g) || []).length === 1; })());
// 기말 합산등급 (2026-10-22 «기말탭에는 합산등급도 넣자»)
ok("기말 칸: 원점수 · 성취도 · 등급 · 합산등급", JSON.stringify(run(`return TEST_KINDS.final.cols`)) === JSON.stringify(["raw", "ach", "grade", "sem"]));
ok("중간·모의에는 합산등급 없음", run(`return TEST_KINDS.midterm.cols.indexOf("sem") < 0 && TEST_KINDS.mock.cols.indexOf("sem") < 0`));
ok("합산등급 칸 이름 · 1~9", run(`return TEST_COLS.sem.label === "합산등급" && TEST_COLS.sem.max === 9`));
ok("붙여넣기: 이름 원점수 성취도 등급 합산등급", JSON.stringify(run(`return parseScoreLine("홍길동 88 B 3 2", TEST_KINDS.final.cols).vals`)) === JSON.stringify({ ach: "B", raw: "88", grade: "3", sem: "2" }),
  JSON.stringify(run(`return parseScoreLine("홍길동 88 B 3 2", TEST_KINDS.final.cols).vals`)));
ok("합산등급만 적어도 빈 문서로 안 지운다", run(`return Object.keys(TEST_COLS).indexOf("sem") >= 0`));
console.log(T.join("\n"));
if (T.some((x) => x.startsWith("FAIL"))) process.exitCode = 1;
