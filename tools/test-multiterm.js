// 회차 여러 개 (2026-10-05) — 탭을 바꾸거나 회차를 열고 닫을 때 다른 회차의 것이 사라지거나 섞이면 안 된다.
// 고1 중간 직보가 남아 있는 동안 중3 기말을 열어야 했던 것이 시작이다.
const fs = require("fs"), vm = require("vm");
const src = /<script>([\s\S]*?)<\/script>/.exec(fs.readFileSync("index.html", "utf8"))[1];

const STORE = {};
const cp = (x) => JSON.parse(JSON.stringify(x));
// merge:true — 지도는 합치고 배열은 통째로 바꾼다 (Firestore 와 같다)
function merge(a, b) {
  const out = Object.assign({}, a);
  Object.keys(b).forEach((k) => {
    out[k] = (b[k] && typeof b[k] === "object" && !Array.isArray(b[k]) && a && a[k] && typeof a[k] === "object")
      ? merge(a[k], b[k]) : cp(b[k]);
  });
  return out;
}
const classDb = { collection: (c) => ({ doc: (id) => ({
  set: (d, o) => { STORE[c] = STORE[c] || {};
    STORE[c][id] = (o && o.merge) ? merge(STORE[c][id] || {}, d) : cp(d); return Promise.resolve(); },
  get: () => Promise.resolve({ exists: !!(STORE[c] || {})[id], data: () => cp((STORE[c] || {})[id] || {}) }),
}) }) };
const LS = {};
const stub = `
var firebase={initializeApp:function(c,n){return n?{t:1}:{};},firestore:function(app){return app?TEAMDB:CLASSDB;},
  auth:function(app){ return { onAuthStateChanged(){}, currentUser:null, signOut:()=>Promise.resolve() }; }};
var document={querySelector:()=>null,querySelectorAll:()=>[],addEventListener(){}};
var window={addEventListener(){},scrollTo(){}},location={hash:""},history={replaceState(){}};
var localStorage={getItem:(k)=>LS[k]||null,setItem:(k,v)=>{LS[k]=String(v);}};
var fetch=()=>Promise.reject(new Error("no net")); var alert=function(){},confirm=()=>true,prompt=()=>null;
`;
const ctx = vm.createContext({ console, setTimeout, clearTimeout, Date, Math, JSON, Object, Array, String, Number,
  Promise, RegExp, isNaN, parseInt, LS, CLASSDB: classDb,
  TEAMDB: { collection: () => ({ doc: () => ({ get: () => Promise.resolve({ exists: false }), set: () => Promise.resolve() }) }) } });
vm.runInContext(stub + "\n" + src, ctx);
const run = (code) => vm.runInContext("(function(){" + code + "})()", ctx);
const runA = (code) => vm.runInContext("(async function(){" + code + "})()", ctx);
const T = [];
const ok = (n, c, e) => T.push((c ? "  OK  " : "FAIL  ") + n + (e ? "   " + e : ""));

(async () => {
  // 1. 옛 문서(term 하나) 를 그대로 읽는다
  ok("옛 문서 — term 하나가 목록 하나로", run(`return JSON.stringify(termsOfDoc({term:"2026 2학기 중간"}))`) === '["2026 2학기 중간"]');
  ok("빈 문서 — 빈 목록", run(`return termsOfDoc({}).length`) === 0);
  ok("terms 가 있으면 그것을 — 겹친 것은 하나로",
    run(`return JSON.stringify(termsOfDoc({term:"A",terms:["A","B","A"]}))`) === '["A","B"]');

  // 2. 기말을 열어도 중간은 남는다
  run(`setOpenTerms({term:"2026 2학기 중간"})`);
  await runA(`await saveExamTerm("2026 2학기 기말")`);
  const doc = STORE.appConfig.examTerm;
  ok("열기 — 목록에 붙는다", JSON.stringify(doc.terms) === '["2026 2학기 중간","2026 2학기 기말"]', JSON.stringify(doc.terms));
  ok("열기 — 옛 판이 보는 term 은 첫 회차 그대로", doc.term === "2026 2학기 중간", doc.term);
  ok("열기 — 연 탭을 본다", run(`return S.term`) === "2026 2학기 기말");
  ok("탭은 이 컴퓨터에 기억된다", LS["dash.examTerm"] === "2026 2학기 기말");
  await runA(`await saveExamTerm("2026 2학기 기말")`);
  ok("같은 회차를 또 열어도 하나", STORE.appConfig.examTerm.terms.length === 2);

  // 3. 다시 읽으면 기억한 탭으로
  run(`S.term=""; setOpenTerms({terms:["2026 2학기 중간","2026 2학기 기말"]})`);
  ok("다시 읽기 — 기억한 탭", run(`return S.term`) === "2026 2학기 기말");
  LS["dash.examTerm"] = "닫힌 회차";
  run(`S.term=""; setOpenTerms({terms:["2026 2학기 중간","2026 2학기 기말"]})`);
  ok("기억한 탭이 닫혔으면 첫 회차", run(`return S.term`) === "2026 2학기 중간");

  // 4. 탭마다 쓰는 자리가 다르다
  run(`pickTerm("2026 2학기 중간")`);
  ok("중간 탭의 참여표 열쇠", run(`return examKey(S.term,"s1")`) === "2026_2학기_중간__s1");
  run(`S.schoolTerms = {}; S.students = [{school:"경기고",grade:"고1"}]`);
  await runA(`await saveSchoolTerm("2026 2학기 기말","경기고","고1",{start:"2026-12-07"})`);
  ok("학교 일정 — 지금 탭(중간)에는 기말 날짜가 안 보인다", run(`return termRows()[0].start||""`) === "");
  ok("학교 일정 — 기말을 짚으면 보인다", run(`return termRows("2026 2학기 기말")[0].start`) === "2026-12-07");
  ok("탭을 바꾸면 읽어 둔 참여표를 비운다 — 다른 회차 것이 섞이지 않게",
    run(`S.exams={c1:{s1:{term:"2026 2학기 중간"}}}; pickTerm("2026 2학기 기말"); return Object.keys(S.exams).length`) === 0);

  // 5. 닫기 — 목록에서만 뺀다
  run(`pickTerm("2026 2학기 중간")`);
  await runA(`await closeExamTerm("2026 2학기 중간")`);
  ok("닫기 — 목록에서 빠진다", JSON.stringify(STORE.appConfig.examTerm.terms) === '["2026 2학기 기말"]');
  ok("닫기 — 옛 판의 term 도 남은 첫 회차로", STORE.appConfig.examTerm.term === "2026 2학기 기말");
  ok("닫기 — 보던 탭이 닫혔으면 남은 것으로", run(`return S.term`) === "2026 2학기 기말");
  ok("닫기 — 학교 일정은 그대로", !!STORE.appConfig.schoolTerms["2026_2학기_기말__경기고__고1"]);

  // 6. 이름 고치기 — 자리 그대로
  run(`setOpenTerms({terms:["2026 2학기 중간","2026 2학기 기멀"]}); pickTerm("2026 2학기 기멀")`);
  await runA(`await renameExamTerm("2026 2학기 기멀","2026 2학기 기말")`);
  ok("이름 고치기 — 순서 그대로", JSON.stringify(STORE.appConfig.examTerm.terms) === '["2026 2학기 중간","2026 2학기 기말"]');

  // 7. 종류 · 다음 회차 짐작
  ok("기말 종류", run(`return termKind("2026 2학기 기말")`) === "기말");
  ok("졸업고사도 기말 쪽", run(`return termKind("2026 중3 졸업고사")`) === "기말");
  ok("중간 종류", run(`return termKind("2026 2학기 중간")`) === "중간");
  ok("다음 회차 짐작", run(`pickTerm("2026 2학기 중간"); return nextTermGuess()`) === "2026 2학기 기말");

  // 8. 탭 줄 — 선생님은 바꿔 보기만
  run(`S.terms=["2026 2학기 중간","2026 2학기 기말"]; S.ro=false`);
  ok("팀장 — 열기·닫기 단추", run(`var h=termTabsHtml(); return /data-term-open/.test(h) && /data-term-close/.test(h)`) === true);
  run(`S.ro=true`);
  ok("선생님 — 탭은 보이고 열기·닫기는 없다",
    run(`var h=termTabsHtml(); return /data-term="2026 2학기 기말"/.test(h) && !/data-term-open/.test(h) && !/data-term-close/.test(h)`) === true);
  run(`S.ro=false; S.terms=["2026 2학기 중간"]`);
  ok("하나만 열려 있으면 닫기 단추가 없다", run(`return /data-term-close/.test(termTabsHtml())`) === false);

  // 9. 새벽 찾기 목록 — 열린 회차 모두, 줄마다 회차가 달린다
  run(`S.terms=["2026 2학기 중간","2026 2학기 기말"]; S.term="2026 2학기 중간";
       S.schoolTerms={ a:{term:"2026 2학기 중간",school:"경기고",grade:"고1",start:"2026-10-14",end:"2026-10-16"},
                       b:{term:"2026 2학기 기말",school:"서초중",grade:"중3",start:"2026-10-28",end:"2026-10-30"} };
       S.students=[]`);
  const rows = run(`var out=[]; S.terms.forEach(function(tm){ termRows(tm).forEach(function(v){ out.push(tm+"|"+v.school); }); }); return out.join(",")`);
  ok("두 회차의 학교가 다 나온다", rows === "2026 2학기 중간|경기고,2026 2학기 기말|서초중", rows);

  console.log(T.join("\n"));
  const bad = T.filter((x) => x.startsWith("FAIL")).length;
  console.log(bad ? "\n" + bad + "건 실패" : "\n전부 통과 (" + T.length + "건)");
  process.exit(bad ? 1 : 0);
})();
