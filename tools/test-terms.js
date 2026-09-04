// 학교 일정 — 저장 열쇠와 "찾아오기"의 판단 규칙을 확인한다.
// 이미 적어둔 값을 덮어쓰면 사람이 고쳐놓은 날짜가 소리 없이 사라진다. 거기가 제일 위험하다.
const fs = require("fs"), vm = require("vm");
const src = /<script>([\s\S]*?)<\/script>/.exec(fs.readFileSync("index.html", "utf8"))[1];

const STORE = { appConfig: { schoolTerms: {} } };
const cp = (x) => JSON.parse(JSON.stringify(x));
// Firestore 의 merge:true 는 지도(map) 안까지 합친다. 그걸 흉내내야 "넘긴 칸만 쓴다"가 시험된다.
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
  Promise, RegExp, isNaN, parseInt, CLASSDB: classDb, TEAMDB: { collection: () => ({ doc: () => ({ get: () => Promise.resolve({ exists: false }) }) }) } });
vm.runInContext(stub + "\n" + src, ctx);
const run = (code) => vm.runInContext("(function(){" + code + "})()", ctx);
const T = [];
const ok = (n, c, e) => T.push((c ? "  OK  " : "FAIL  ") + n + (e ? "   " + e : ""));

// 1. 저장 열쇠가 수업관리 앱과 같아야 한다 — 다르면 서로 다른 칸에 쓴다
ok("열쇠 — 회차의 공백·기호가 _ 로",
  run(`return schedKey("2026 2학기 중간","중대부고","고1")`) === "2026_2학기_중간__중대부고__고1",
  run(`return schedKey("2026 2학기 중간","중대부고","고1")`));
ok("열쇠 — 한글은 그대로", run(`return termKeyOf("2026-2학기 기말")`) === "2026_2학기_기말",
  run(`return termKeyOf("2026-2학기 기말")`));

// 2. 학기 계획 한 줄
ok("학기 계획을 한 줄로",
  run(`return planNote({blocks:[{name:"중간고사",start:"2026-10-12",end:"2026-10-16"},{name:"기말고사",start:"2026-12-08",end:"2026-12-08"}]})`) ===
  "중간고사 10/12~16 · 기말고사 12/08",
  run(`return planNote({blocks:[{name:"중간고사",start:"2026-10-12",end:"2026-10-16"},{name:"기말고사",start:"2026-12-08",end:"2026-12-08"}]})`));
ok("한 번뿐이면 기말 아직",
  run(`return planNote({blocks:[{name:"중간고사",start:"2026-10-12",end:"2026-10-12"}],pending:true})`) === "중간고사 10/12 · 기말 아직");
ok("계획이 없으면 빈 줄", run(`return planNote(null)`) === "");

// 3. 줄 모으기 — 학생이 다니는 학교 + 이미 적어둔 것
run(`
  S.term="2026 2학기 중간";
  S.students=[{pid:"p1",name:"가",school:"중대부고",grade:"고1"},
              {pid:"p2",name:"나",school:"중대부고",grade:"고1"},
              {pid:"p3",name:"다",school:"경기고",grade:"고2"},
              {pid:"p4",name:"라",school:"",grade:"고1"}];
  S.schoolTerms={};
  S.schoolTerms[schedKey(S.term,"휘문고","고1")]={term:S.term,school:"휘문고",grade:"고1",start:"2026-09-28"};
`);
const rows = JSON.parse(run(`return JSON.stringify(termRows())`));
ok("학생 학교와 적어둔 학교를 합친다", rows.length === 3, rows.map((r) => r.school + r.grade).join(","));
ok("같은 학교·학년 학생 수를 센다", rows.filter((r) => r.school === "중대부고")[0].n === 2);
ok("학교가 빈 학생은 줄을 안 만든다", rows.every((r) => r.school));
ok("학년 → 학교 차례로 늘어놓는다", rows.map((r) => r.grade).join(",") === "고1,고1,고2", rows.map((r) => r.school + r.grade).join(","));

// 4. 찾아오기 판단 — 여기가 핵심이다
const RESP = {
  "빈학교": { hasAny: true, via: "neis", src: { url: "http://a", name: "학교 학사일정" },
    plan: { blocks: [{ name: "중간고사", start: "2026-10-12", end: "2026-10-16" }] },
    byGrade: { "고1": { start: "2026-10-12", end: "2026-10-16", name: "중간고사" } } },
  "같은학교": { hasAny: true, via: "neis", src: { url: "http://b", name: "학교 학사일정" },
    byGrade: { "고1": { start: "2026-10-12", end: "2026-10-16", name: "중간고사" } } },
  "다른학교": { hasAny: true, via: "neis", src: { url: "http://c", name: "학교 학사일정" },
    byGrade: { "고1": { start: "2026-11-02", end: "2026-11-06", name: "중간고사" } } },
  "시험없는학교": { hasAny: true, via: "neis", src: { url: "http://d", name: "학교 학사일정" },
    plan: { blocks: [{ name: "졸업고사", start: "2026-10-28", end: "2026-10-28" }] }, byGrade: {} },
  "일정없는학교": { hasAny: false },
};
ctx.RESP = RESP;
run(`
  S.term="2026 2학기 중간"; S.schoolTerms={};
  // 이미 적어둔 것들
  S.schoolTerms[schedKey(S.term,"같은학교","고1")]={term:S.term,school:"같은학교",grade:"고1",
    start:"2026-10-12",end:"2026-10-16",label:"3학년기말고사"};      // 옛 나이스 이름
  S.schoolTerms[schedKey(S.term,"다른학교","고1")]={term:S.term,school:"다른학교",grade:"고1",
    start:"2026-10-05",end:"2026-10-08",label:"중간고사"};           // 사람이 적은 값
  fetchSchedule = function (school) { return Promise.resolve(RESP[school] || { error: "없음" }); };
`);
// 가짜 서버에도 같은 값을 심는다 — 안 심으면 "덮지 않았다"가 "원래 없었다"와 구별이 안 된다
STORE.appConfig.schoolTerms["2026_2학기_중간__같은학교__고1"] =
  { term: "2026 2학기 중간", school: "같은학교", grade: "고1", start: "2026-10-12", end: "2026-10-16", label: "3학년기말고사" };
STORE.appConfig.schoolTerms["2026_2학기_중간__다른학교__고1"] =
  { term: "2026 2학기 중간", school: "다른학교", grade: "고1", start: "2026-10-05", end: "2026-10-08", label: "중간고사" };
vm.runInContext(`globalThis.__run = (async function(){
  var targets = ["빈학교","같은학교","다른학교","시험없는학교","일정없는학교"].map(function(s){
    var k = schedKey(S.term, s, "고1");
    return { school: s, grade: "고1", cur: S.schoolTerms[k] || {} };
  });
  await runPull(S.term, targets, "2026-09-01", "2026-12-31", "중간");
  return { msg: PULL_JOB.msg, diffs: PULL_JOB.diffs.length,
           saved: STORE_REF.appConfig.schoolTerms };
})();`, Object.assign(ctx, { STORE_REF: STORE }));

ctx.__run.then((r) => {
  const at = (school) => r.saved[school ? `2026_2학기_중간__${school}__고1` : ""] || {};
  ok("빈 줄은 찾은 값으로 채운다",
    at("빈학교").start === "2026-10-12" && at("빈학교").end === "2026-10-16", JSON.stringify(at("빈학교")));
  ok("채운 줄에 시험 이름도 넣는다", at("빈학교").label === "중간고사");
  ok("학기 계획과 근거 링크를 적어둔다",
    at("빈학교").plan === "중간고사 10/12~16" && at("빈학교").srcUrl === "http://a", JSON.stringify(at("빈학교")));
  ok("날짜가 같으면 옛 이름만 고친다", at("같은학교").label === "중간고사" && at("같은학교").start === "2026-10-12",
    JSON.stringify(at("같은학교")));
  ok("이미 적어둔 값이 다르면 **덮지 않는다**",
    at("다른학교").start === "2026-10-05" && at("다른학교").end === "2026-10-08", JSON.stringify(at("다른학교")));
  ok("대신 다른 값으로 알려준다", r.diffs === 1, String(r.diffs));
  ok("시험을 못 찾아도 학기 계획은 적어둔다",
    at("시험없는학교").plan === "졸업고사 10/28" && !at("시험없는학교").start, JSON.stringify(at("시험없는학교")));
  ok("시험을 못 찾아도 근거 링크는 적어둔다", at("시험없는학교").srcUrl === "http://d");
  ok("학사일정 자체가 없는 학교는 아무것도 안 쓴다", !r.saved["2026_2학기_중간__일정없는학교__고1"]);
  ok("끝나면 무슨 일이 있었는지 한 줄로", /채움 1칸/.test(r.msg) && /시험 이름 정리 1칸/.test(r.msg), r.msg);
  ok("다섯 학교를 하나도 안 빠뜨린다", /이 회차 시험 없음/.test(r.msg) && /학사일정 자체가 없음/.test(r.msg), r.msg);

  console.log(T.join("\n"));
  const bad = T.filter((x) => x.startsWith("FAIL")).length;
  console.log(bad ? "\n실패 " + bad + "건" : "\n전부 통과 (" + T.length + "건)");
  process.exit(bad ? 1 : 0);
}).catch((e) => { console.error("터짐:", e); process.exit(1); });
