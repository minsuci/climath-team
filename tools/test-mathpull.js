// 수학시험 날짜를 **나란히** 찾아오기 — 무엇을 저절로 넣고 무엇을 사람에게 묻는가 (2026-09-12).
//
// ⚠ 여기가 제일 위험한 자리다. 틀린 날짜가 조용히 들어가면 직보 날짜까지 따라 어긋난다.
//   그래서 «재서 읽었고 날이 하나일 때» 만 저절로 넣는다. 나머지는 전부 사람이 고른다.
const fs = require("fs"), vm = require("vm");
const src = /<script>([\s\S]*?)<\/script>/.exec(fs.readFileSync("index.html", "utf8"))[1];

const STORE = { appConfig: { schoolTerms: {} } };
const cp = (x) => JSON.parse(JSON.stringify(x));
function deepMerge(a, b) {
  const out = Object.assign({}, a);
  Object.keys(b).forEach((k) => {
    out[k] = (b[k] && typeof b[k] === "object" && !Array.isArray(b[k]) && a && a[k] && typeof a[k] === "object")
      ? deepMerge(a[k], b[k]) : cp(b[k]);
  });
  return out;
}
const classDb = { collection: (c) => ({ doc: (id) => ({
  set: (d, o) => { STORE[c] = STORE[c] || {};
    STORE[c][id] = (o && o.merge) ? deepMerge(STORE[c][id] || {}, d) : cp(d); return Promise.resolve(); },
  get: () => Promise.resolve({ exists: true, data: () => cp((STORE[c] || {})[id] || {}) }),
}) }) };
const stub = `
var firebase={initializeApp:function(c,n){return n?{t:1}:{};},firestore:function(app){return app?TEAMDB:CLASSDB;},
  auth:function(app){ return { onAuthStateChanged(){}, currentUser:{ getIdToken:()=>Promise.resolve("x") }, signOut:()=>Promise.resolve() }; }};
var document={querySelector:()=>null,querySelectorAll:()=>[],addEventListener(){}};
var window={addEventListener(){},scrollTo(){}},location={hash:""},history={replaceState(){}},localStorage={getItem:()=>null,setItem(){}};
var fetch=()=>Promise.reject(new Error("no net")); var alert=function(){},confirm=()=>true,prompt=()=>null;
`;
const ctx = vm.createContext({ console, setTimeout, clearTimeout, Date, Math, JSON, Object, Array, String, Number,
  Promise, RegExp, isNaN, parseInt, CLASSDB: classDb,
  TEAMDB: { collection: () => ({ doc: () => ({ get: () => Promise.resolve({ exists: false }) }) }) } });
vm.runInContext(stub + "\n" + src, ctx);
const T = [];
const ok = (n, c, e) => T.push((c ? "  OK  " : "FAIL  ") + n + (e ? "   " + e : ""));

// 서버가 돌려줄 법한 답을 학교마다 미리 적어 둔다. 전부 실제로 본 모양이다.
const ANSWER = {
  표학교:     { by: "표", post: "1학년 중간고사 시간표", url: "http://a", rows: [{ grade: 1, subject: "공통수학2", date: "2026-10-01" }] },
  AI학교:     { by: "AI", post: "중간고사 안내", url: "http://b", rows: [{ grade: 1, subject: "수학", date: "2026-10-02" }] },
  여러날학교: { by: "표", post: "시간표", url: "http://c", rows: [{ grade: 1, subject: "공통수학1", date: "2026-10-01" },
                                                                  { grade: 1, subject: "공통수학2", date: "2026-10-06" }] },
  이미맞는학교: { by: "표", post: "시간표", url: "http://d", rows: [{ grade: 1, subject: "공통수학2", date: "2026-10-03" }] },
  덮을뻔한학교: { by: "표", post: "시간표", url: "http://e", rows: [{ grade: 1, subject: "공통수학2", date: "2026-10-07" }] },
  글만학교:   { post: "2학기 중간고사 안내 가정통신문", url: "http://f", rows: [], note: "글자를 못 꺼냈어요" },
  아무것도학교: { rows: [], note: "시험 시간표 글을 못 찾았어요" },
  터지는학교: "throw",
  // AI 분당 한도 — 학교 탓이 아니다. 잠시 뒤 다시 돌리면 된다
  바쁜학교: { post: "중간고사 안내", url: "http://h", rows: [], busy: true, note: "AI가 지금 바빠요" },
  바쁜학교2: { post: "중간고사 안내", url: "http://i", rows: [], busy: true, note: "AI가 지금 바빠요" },
  // 우리 학년(고1)이 아닌 줄만 온 경우 — 열긴 열었는데 쓸 것이 없다
  남의학년학교: { by: "표", post: "3학년 시간표", url: "http://g", rows: [{ grade: 3, subject: "기하", date: "2026-10-05" }] },
};
const CALLS = [];
vm.runInContext(`
  S.term = "2026 2학기 중간"; S.ro = false;
  fetchMathDates = function (school, from, to, grades) {
    CALLS.push({ school: school, from: from, to: to, grades: grades.slice(), at: Date.now() });
    var a = ANSWER[school];
    if (a === "throw") return Promise.reject(new Error("서버가 500 로 답했습니다"));
    if (!a) return Promise.resolve({ error: "나이스에서 학교를 못 찾았어요" });
    // 한 번에 다 끝나면 «나란히» 를 못 본다. 조금씩 늦춘다
    return new Promise(function (r) { setTimeout(function () { r(a); }, 20); });
  };
`, Object.assign(ctx, { ANSWER, CALLS }));

const TARGETS = [
  { school: "표학교", grade: "고1", start: "2026-10-01", end: "2026-10-08", math: "" },
  { school: "AI학교", grade: "고1", start: "2026-10-01", end: "2026-10-08", math: "" },
  { school: "여러날학교", grade: "고1", start: "2026-10-01", end: "2026-10-08", math: "" },
  { school: "이미맞는학교", grade: "고1", start: "2026-10-01", end: "2026-10-08", math: "2026-10-03" },
  { school: "덮을뻔한학교", grade: "고1", start: "2026-10-01", end: "2026-10-08", math: "2026-10-02" },
  { school: "글만학교", grade: "고1", start: "2026-10-01", end: "2026-10-08", math: "" },
  { school: "아무것도학교", grade: "고1", start: "2026-10-01", end: "2026-10-08", math: "" },
  { school: "터지는학교", grade: "고1", start: "2026-10-01", end: "2026-10-08", math: "" },
  { school: "남의학년학교", grade: "고1", start: "2026-10-01", end: "2026-10-08", math: "" },
  { school: "바쁜학교", grade: "고1", start: "2026-10-01", end: "2026-10-08", math: "" },
  { school: "바쁜학교2", grade: "고1", start: "2026-10-01", end: "2026-10-08", math: "" },
  { school: "기간없는학교", grade: "고1", start: "", end: "", math: "" },
];
vm.runInContext(`globalThis.__run = (async function(){
  var t0 = Date.now();
  await runMathPull(S.term, TARGETS);
  return { msg: PULL_JOB.msg, diffs: PULL_JOB.diffs.slice(), links: PULL_JOB.links.slice(),
           running: PULL_JOB.running, total: PULL_JOB.total, done: PULL_JOB.done,
           ms: Date.now() - t0, saved: STORE_REF.appConfig.schoolTerms };
})();`, Object.assign(ctx, { TARGETS, STORE_REF: STORE }));

ctx.__run.then((r) => {
  const at = (s) => r.saved["2026_2학기_중간__" + s + "__고1"] || {};
  const diff = (s) => r.diffs.filter((d) => d.school === s)[0];

  // ---- 저절로 넣는 것은 하나뿐이다 ----
  ok("재서 읽었고 날이 하나면 빈 칸을 채운다", at("표학교").math === "2026-10-01", JSON.stringify(at("표학교")));
  // ⚠ AI 는 학년을 찍는다. 저절로 넣으면 안 된다 (2026-09-08 단대부고에서 고1 에 여섯 과목을 붙였다)
  ok("AI 가 읽은 것은 저절로 안 넣는다", !at("AI학교").math && !!diff("AI학교"), JSON.stringify(at("AI학교")));
  ok("대신 사람에게 묻는다 — AI 라고 밝히고", diff("AI학교").by === "AI" && diff("AI학교").dates.length === 1);
  ok("날이 여럿이면 저절로 안 넣는다", !at("여러날학교").math && diff("여러날학교").dates.length === 2);
  ok("여러 날은 고를 수 있게 다 준다",
    diff("여러날학교").dates.join(",") === "2026-10-01,2026-10-06", diff("여러날학교").dates.join(","));

  // ---- 이미 적어둔 것 ----
  ok("이미 같은 날이면 가만둔다", at("이미맞는학교").math === undefined && !diff("이미맞는학교"), JSON.stringify(at("이미맞는학교")));
  // ⚠ 손으로 넣었거나 학생이 알려 준 날짜다. 덮으면 조용히 사라진다
  ok("이미 다른 날이면 **덮지 않는다**", !at("덮을뻔한학교").math, JSON.stringify(at("덮을뻔한학교")));
  ok("대신 지금 값과 함께 묻는다", diff("덮을뻔한학교").mine === "2026-10-02" && diff("덮을뻔한학교").dates[0] === "2026-10-07");

  // ---- 못 찾은 것들을 갈라서 말한다 ----
  ok("글만 찾았으면 링크를 준다", r.links.length === 1 && r.links[0].school === "글만학교" && r.links[0].url === "http://f",
    JSON.stringify(r.links));
  ok("우리 학년이 없으면 채우지 않는다", !at("남의학년학교").math && !diff("남의학년학교"));
  ok("시간표 글이 아직 없는 학교를 따로 말한다", /시간표 글이 아직 없음: .*아무것도학교/.test(r.msg), r.msg);
  ok("시험 기간이 비면 먼저 채우라고 말한다", /시험 기간이 비어 있음.*기간없는학교/.test(r.msg), r.msg);
  ok("기간이 없으면 서버를 아예 안 부른다", !ctx.CALLS.some((c) => c.school === "기간없는학교"));
  // ⚠ AI 한도에 걸린 것을 학교 이름으로 늘어놓으면 못 찾은 학교처럼 보인다. 세어서 한 줄로
  ok("AI 가 바쁜 것은 세어서 한 줄로 말한다", /AI가 바빠 못 읽음 2곳/.test(r.msg), r.msg);
  ok("AI 가 바쁜 학교는 «못 찾음» 에 안 넣는다", !/못 찾음: .*바쁜학교/.test(r.msg), r.msg);
  ok("AI 가 바쁜 학교는 링크 목록에도 안 넣는다", !r.links.some((x) => /바쁜/.test(x.school)));
  ok("한 곳이 터져도 나머지는 끝까지 간다", /못 찾음: .*터지는학교/.test(r.msg) && at("표학교").math, r.msg);
  ok("끝나면 무슨 일이 있었는지 한 줄로", /채움 1칸/.test(r.msg) && /이미 맞음 1/.test(r.msg) && /눈으로 고를 것 3건/.test(r.msg), r.msg);

  // ---- 나란히 돈다 ----
  // ⚠ 이것이 이번 작업의 요점이다. 한 줄로 세우면 쉰일곱 학교가 스무 분이다
  ok("학교마다 한 번씩 부른다", ctx.CALLS.length === 11, String(ctx.CALLS.length));
  ok("넷씩 나란히 — 처음 넷이 거의 같이 나간다",
    ctx.CALLS[3].at - ctx.CALLS[0].at < 15, String(ctx.CALLS[3].at - ctx.CALLS[0].at) + "ms");
  ok("한 줄로 세운 것보다 빠르다 (11곳 × 20ms)", r.ms < 11 * 20, r.ms + "ms");
  ok("그 학교의 시험 기간을 그대로 넘긴다",
    ctx.CALLS[0].from === "2026-10-01" && ctx.CALLS[0].to === "2026-10-08", JSON.stringify(ctx.CALLS[0]));
  ok("그 학교의 학년만 넘긴다", ctx.CALLS[0].grades.join(",") === "고1");

  // ---- 일감 상자 ----
  ok("다 돌면 «도는 중» 이 꺼진다", r.running === false);
  // 서버를 안 부른 학교(시험 기간이 빈 곳)도 **센다.** 진행 막대가 열 곳 중 아홉에서 멈추면
  // 멈춘 것처럼 보인다 — 건너뛴 것도 «본 것» 이다.
  ok("본 학교를 다 센다 (건너뛴 곳까지)", r.total === 12 && r.done === 12, r.done + "/" + r.total);

  console.log(T.join("\n"));
  const bad = T.filter((x) => x.startsWith("FAIL")).length;
  console.log(bad ? "\n실패 " + bad + "건" : "\n전부 통과 (" + T.length + "건)");
  process.exit(bad ? 1 : 0);
}).catch((e) => { console.error("터짐:", e); console.log(T.join("\n")); process.exit(1); });
