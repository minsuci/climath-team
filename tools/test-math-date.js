// 수학시험 날짜 넣기 — 가정통신문·공지의 시험 시간표를 붙여넣어 «수학 보는 날»을 찾는다 (2026-09-08).
//
// 학사일정에는 과목별 시간표가 없다. 학교가 따로 내는 글을 붙여넣는 것이라
// **모양이 학교마다 다르다** — 표를 복사한 것(칸이 탭), 줄글, 학년별로 갈린 것.
// 잘못 읽으면 직보(수학시험 전날)까지 어긋나고 참여표가 그 날짜로 돈다. 그래서 찾기만 하고 넣는 것은 사람이 누른다.
const fs = require("fs"), vm = require("vm");
const src = /<script>([\s\S]*?)<\/script>/.exec(fs.readFileSync("index.html", "utf8"))[1];

const stub = `
var firebase={initializeApp:function(c,n){return n?{t:1}:{};},firestore:function(app){return {collection:()=>({doc:()=>({get:()=>Promise.resolve({exists:false}),set:()=>Promise.resolve()})})};},
  auth:function(){ return { onAuthStateChanged(){}, currentUser:null, signOut:()=>Promise.resolve() }; }};
var document={querySelector:()=>null,querySelectorAll:()=>[],addEventListener(){}};
var window={addEventListener(){},scrollTo(){}},location={hash:""},history={replaceState(){}},localStorage={getItem:()=>null,setItem(){}};
var fetch=()=>Promise.reject(new Error("no net")); var alert=function(){},confirm=()=>true,prompt=()=>null;
`;
const ctx = vm.createContext({ console, setTimeout, clearTimeout, Date, Math, JSON, Object, Array, String, Number,
  Promise, RegExp, isNaN, parseInt });
vm.runInContext(stub + "\n" + src, ctx);
const run = (code) => vm.runInContext("(function(){" + code + "})()", ctx);
const val = (e) => JSON.parse(vm.runInContext("JSON.stringify(" + e + ")", ctx) || "null");
const T = [];
const ok = (n, c, e) => T.push((c ? "  OK  " : "FAIL  ") + n + (e ? "   " + e : ""));

const hits = (text, year) => val(`mathExamHits(${JSON.stringify(text)}, ${year || 2026})`);
const dates = (text, year) => hits(text, year).map((h) => h.date).join(",");

// ---- 날짜 한 조각 읽기 ----
ok("10월 15일", run(`return pickDate("10월 15일(수)", 2026)`) === "2026-10-15");
ok("10/15", run(`return pickDate("10/15(수) 1교시", 2026)`) === "2026-10-15");
ok("10.15", run(`return pickDate("10.15.", 2026)`) === "2026-10-15");
ok("해가 적혀 있으면 그 해로", run(`return pickDate("2025-10-15", 2026)`) === "2025-10-15");
ok("2025.10.15 도", run(`return pickDate("2025.10.15", 2026)`) === "2025-10-15");
ok("13월은 날짜가 아니다", run(`return pickDate("13/15", 2026)`) === "");
ok("교시 숫자를 날짜로 읽지 않는다", run(`return pickDate("1교시", 2026)`) === "");
ok("숫자가 없으면 빈 값", run(`return pickDate("수학", 2026)`) === "");

// ---- 수학 과목 가려내기 ----
ok("수학", run(`return hasMath("수학")`) === true);
ok("미적분·확률과 통계·기하·대수·공통수학", ["미적분", "확률과 통계", "확통", "기하", "대수", "공통수학"].every((w) => run(`return hasMath(${JSON.stringify(w)})`)));
// ⚠ 가정통신문에 «수학여행» 이 흔하다. 그걸 시험 날로 읽으면 엉뚱한 날이 들어간다
ok("«수학여행» 은 수학이 아니다", run(`return hasMath("수학여행 사전답사")`) === false);
ok("«수학능력시험» 도 아니다", run(`return hasMath("대학수학능력시험 예비소집")`) === false);
ok("«수학여행» 옆에 진짜 수학이 있으면 잡는다", run(`return hasMath("수학여행 안내 / 2교시 수학")`) === true);
ok("국어만 있으면 아니다", run(`return hasMath("1교시 국어 2교시 영어")`) === false);

// ---- 줄 모양 — 한 줄에 날짜와 과목 ----
ok("한 줄에 날짜와 수학", dates("10/15(수) 1교시 국어 2교시 수학 3교시 영어") === "2026-10-15");
// 날짜 줄이 머리로 서고 과목이 그 아래 오는 글
ok("바로 위 날짜 줄을 쓴다", dates("■ 10월 16일(목)\n 1교시 한국사\n 2교시 수학") === "2026-10-16");
ok("멀리 떨어진 날짜는 안 끌어온다 (7줄 넘게)",
  dates("10월 16일(목)\n\n\n\n\n\n\n\n수학 특강 안내") === "");
ok("날짜 없는 수학 줄만 있으면 아무것도 안 준다", dates("2교시 수학") === "");

// ---- 칸 모양 — 표를 복사하면 칸이 탭으로 온다 ----
// 날짜가 머리줄에 가로로 서고 과목이 그 아래 **같은 칸 번호**에 온다. 줄만 보면 날짜가 셋이라 못 고른다.
const TABLE = [
  "\t10월 15일(수)\t10월 16일(목)\t10월 17일(금)",
  "1교시\t국어\t수학\t영어",
  "2교시\t통합사회\t한국사\t물리학",
].join("\n");
ok("표에서 수학이 있는 칸의 날짜를 고른다", dates(TABLE) === "2026-10-16", dates(TABLE));
ok("표에서 다른 과목 날짜는 안 따라온다", hits(TABLE).length === 1, JSON.stringify(hits(TABLE)));

// ---- 학년이 갈린 시간표 ----
const BYGRADE = [
  "[1학년]",
  "10/15(수) 1교시 국어 2교시 수학",
  "[2학년]",
  "10/16(목) 1교시 영어 2교시 수학",
  "[3학년]",
  "10/17(금) 1교시 수학 2교시 사회",
].join("\n");
ok("학년마다 다른 날을 가른다",
  hits(BYGRADE).map((h) => h.num + ":" + h.date).join(",") === "1:2026-10-15,2:2026-10-16,3:2026-10-17",
  JSON.stringify(hits(BYGRADE)));
ok("«고2» 처럼 급까지 적혀도 읽는다", val(`pickGrade("고2 시간표")`).kind === "고" && val(`pickGrade("고2 시간표")`).num === 2);
ok("«3학년» 은 급이 없다", val(`pickGrade("3학년 지필평가")`).kind === "" && val(`pickGrade("3학년 지필평가")`).num === 3);
ok("학년이 없으면 null", val(`pickGrade("중간고사 시간표")`) === null);

// ---- 이 회차의 줄에 붙이기 (mathPlan) ----
run(`
  S.term = "2026 2학기 중간";
  S.students = [
    { pid:"p1", name:"가", school:"중대부고", grade:"고1" },
    { pid:"p2", name:"나", school:"중대부고", grade:"고2" },
    { pid:"p3", name:"다", school:"단대부고", grade:"고1" }
  ];
  S.schoolTerms = {
    "k1": { term:"2026 2학기 중간", school:"중대부고", grade:"고1", start:"2026-10-14", end:"2026-10-17" },
    "k2": { term:"2026 2학기 중간", school:"중대부고", grade:"고2", start:"2026-10-14", end:"2026-10-17" },
    "k3": { term:"2026 2학기 중간", school:"단대부고", grade:"고1", start:"2026-10-20", end:"2026-10-23" }
  };
`);
const plan = (text, school) => val(`mathPlan(${JSON.stringify(text)}, ${JSON.stringify(school || "중대부고")})`);
{
  const p = plan(BYGRADE);
  ok("고른 학교의 줄만 나온다", p.length === 2 && p.every((x) => x.school === "중대부고"), JSON.stringify(p.map((x) => x.school + x.grade)));
  ok("고1 은 1학년 날, 고2 는 2학년 날", p[0].date === "2026-10-15" && p[1].date === "2026-10-16", JSON.stringify(p.map((x) => x.grade + ":" + x.date)));
  ok("어디서 읽었는지 한 줄 남는다", /수학/.test(p[0].why), p[0].why);
}
// 학년 표시가 아예 없으면 그 학교 모든 학년에 같은 날 (한 학년만 다니는 학교가 흔하다)
ok("학년 표시가 없으면 모든 학년에 같은 날",
  plan("10월 16일(목) 2교시 수학").every((x) => x.date === "2026-10-16"),
  JSON.stringify(plan("10월 16일(목) 2교시 수학").map((x) => x.grade + ":" + x.date)));
// ⚠ 한 학년에 날짜가 둘이면 고르지 않는다. 아무거나 넣으면 직보까지 어긋난다
{
  const p = plan("10/15(수) 2교시 수학\n10/16(목) 1교시 수학");
  ok("날짜가 여럿이면 안 넣고 보여만 준다", p[0].date === "" && p[0].many.length === 2, JSON.stringify(p[0]));
}
// ⚠ 지난 회차 시간표를 붙여넣는 실수가 제일 흔하다 — 기간 밖이면 짚어 준다
{
  const p = plan("9월 20일(금) 2교시 수학");
  ok("시험 기간 밖이면 빨갛게 짚는다", p[0].warn === "시험 기간 밖", JSON.stringify(p[0]));
  ok("그래도 날짜는 준다 (사람이 판단한다)", p[0].date === "2026-09-20");
}
ok("기간 안이면 짚지 않는다", !plan("10/15(수) 2교시 수학")[0].warn);
ok("이미 적힌 값을 들고 온다 (덮어쓰는 줄 알 수 있게)", (() => {
  run(`S.schoolTerms.k1.math = "2026-10-14"`);
  const p = plan("10/15(수) 2교시 수학");
  const r = p[0].cur === "2026-10-14";
  run(`delete S.schoolTerms.k1.math`);
  return r;
})());
ok("해는 이 회차 시험의 해로 채운다 («10/15» 에는 해가 없다)", plan("10/15 2교시 수학")[0].date.slice(0, 4) === "2026");
ok("못 찾으면 빈 채로 준다", plan("중간고사 안내 — 시간표는 추후 공지")[0].date === "");

// ---- 찾기만 하고 아무것도 안 쓴다 ----
// 이 시험 전체가 mathExamHits·mathPlan 만 부른다. 저장은 «넣기» 를 눌러야 saveSchoolTerm 이 돈다.
ok("대조만으로는 명단에 아무것도 안 쓴다",
  JSON.stringify(val(`S.schoolTerms`)).indexOf('"math"') < 0, JSON.stringify(val(`S.schoolTerms`)));

console.log(T.join("\n"));
const bad = T.filter((x) => x.startsWith("FAIL")).length;
console.log(bad ? "\n실패 " + bad + "건" : "\n전부 통과 (" + T.length + "건)");
process.exit(bad ? 1 : 0);
