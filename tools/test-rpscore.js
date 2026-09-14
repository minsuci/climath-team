// 업무보고 테스트 점수 (2026-09-14) — 특이사항 앞에 점수 한 칸.
//
// 마왕님: «나중에 점수 보고 퇴원위험도 판단할 수 있게끔. 클래스앱처럼» · «맞은 수/총 문항 말고 그냥 점수».
// 쓰일 곳이 **퇴원위험 판단**이라, 틀린 값이 조용히 들어가는 것이 제일 나쁘다:
//   · 빈 칸이 0점으로 저장되면 안 본 학생이 «점수 급락» 으로 뜬다
//   · 학생이 앱에서 낸 점수가 선생님이 고친 값을 덮으면 안 된다
//   · «85점» 「구십」 같은 글이 숫자 자리에 들어가면 나중에 셈이 깨진다
const fs = require("fs"), vm = require("vm");
const src = /<script>([\s\S]*?)<\/script>/.exec(fs.readFileSync("index.html", "utf8"))[1];
const stub = `
var firebase={initializeApp:function(c,n){return n?{t:1}:{};},firestore:function(){return FAKEDB;},
  auth:()=>({onAuthStateChanged(){},currentUser:null,signOut:()=>Promise.resolve()})};
var document={querySelector:()=>null,querySelectorAll:()=>[],addEventListener(){}};
var window={addEventListener(){},scrollTo(){}},location={hash:""},history={replaceState(){}},localStorage={getItem:()=>null,setItem(){}};
var fetch=()=>Promise.reject(new Error("no net")); var alert=function(){},confirm=()=>true,prompt=()=>null;
`;
// 수업관리 앱 DB 흉내 — 반 c2 의 9/14 점수만 들어 있다
const APPDB = {
  "classes/c2/days/2026-09-14/scores": [
    { sid: "s1", name: "최하윤", score: 70, time: 1 },
    { sid: "s1", name: "최하윤", score: 90, time: 5 },     // 같은 날 다시 냈다 — 마지막 것
    { sid: "s1", name: "최하윤", score: 40, time: 3 },
    { sid: "s2", name: "안유진", score: 55, time: 2 },
    { name: "번호없음", score: 99, time: 9 },               // sid 가 없으면 누구 것인지 모른다
  ],
};
function coll(path) {
  const api = {
    doc: (id) => ({ collection: (c) => coll(path + "/" + id + "/" + c), get: () => Promise.resolve({ exists: false, data: () => ({}) }) }),
    get: () => {
      const rows = APPDB[path];
      if (!rows) return Promise.resolve({ forEach() {}, empty: true });
      return Promise.resolve({ empty: !rows.length, forEach: (f) => rows.forEach((r, i) => f({ id: "x" + i, data: () => JSON.parse(JSON.stringify(r)) })) });
    },
    where: () => ({ get: () => Promise.resolve({ forEach() {} }) }),
  };
  return api;
}
const FAKEDB = { collection: (c) => coll(c) };
const ctx = vm.createContext({ console, setTimeout, clearTimeout, Date, Math, JSON, Object, Array, String, Number, Promise, RegExp, isNaN, parseInt, FAKEDB });
vm.runInContext(stub + "\n" + src, ctx);
const run = (code) => vm.runInContext("(function(){" + code + "})()", ctx);
// ⚠ 보고 명단은 **이름순**이다(박도윤·안유진·최하윤). 순번으로 짚으면 엉뚱한 학생을 본다 — 번호로 찾는다.
const by = (arr) => { const m = {}; arr.forEach((x) => { m[x.sid] = x; }); return m; };
const T = [];
const ok = (n, c, e) => T.push((c ? "  OK  " : "FAIL  ") + n + (e ? "   " + e : ""));

run(`
  TODAY = "2026-09-16"; RP_START = "2026-09-14";
  S.teachers = [ { tid:"T2", name:"이현우", role:"teacher", classIds:["c2"] } ];
  S.classes = [ { id:"c2", name:"고2A", classDays:[1,3,5], roster:[ { id:"s1", name:"최하윤" }, { id:"s2", name:"안유진" }, { id:"s3", name:"박도윤" } ] } ];
  S.tasks = []; S.marks = {}; S.events = []; S.reports = {}; S.claims = { tid:"T2" };
`);

// ---- 점수 칸 읽기 ----
const val = (v) => run(`var x = rpScoreVal(${JSON.stringify(v)}); return isNaN(x) && x !== null ? "NaN" : x;`);
ok("빈 칸은 «안 봤다» (null) — 0점이 아니다", val("") === null && val("   ") === null && val(null) === null);
ok("⚠ 0점은 0점이다 (빈 칸과 다르다)", val("0") === 0 && val(0) === 0, String(val("0")));
ok("숫자는 그 수", val("85") === 85 && val(" 90 ") === 90 && val("72.5") === 72.5);
ok("100 까지", val("100") === 100);
ok("100 을 넘으면 잘못 적은 것", val("120") === "NaN");
ok("글이 섞이면 잘못 적은 것", val("85점") === "NaN" && val("구십") === "NaN" && val("-5") === "NaN");

// ---- 초안 ----
const d0 = JSON.parse(run(`return JSON.stringify(rpDraft("T2","2026-09-14",null).classes[0].students)`));
ok("처음엔 점수 칸이 비어 있다", d0.every((s) => s.score === ""), JSON.stringify(d0.map((s) => s.score)));
const d1 = by(JSON.parse(run(`return JSON.stringify(rpDraft("T2","2026-09-14",{ classes:[{ cid:"c2", students:[{ sid:"s1", score:88 }, { sid:"s2", score:0 }] }] }).classes[0].students)`)));
ok("저장된 점수를 이어 쓴다", d1.s1.score === 88, String(d1.s1.score));
ok("⚠ 저장된 0점도 이어 쓴다 (비우지 않는다)", d1.s2.score === 0, String(d1.s2.score));

// ---- 앱에서 학생이 낸 점수 얹기 ----
const ap = by(JSON.parse(run(`var r = rpDraft("T2","2026-09-14",{ classes:[{ cid:"c2", students:[{ sid:"s2", score:60 }] }] });
  rpApplyApp(r, { c2: { att: { s1:true, s2:true }, score: { s1: 90, s2: 55 } } });
  return JSON.stringify(r.classes[0].students);`)));
ok("빈 칸은 앱 점수로 채운다", ap.s1.score === "90", String(ap.s1.score));
ok("⚠ 선생님이 적은 점수는 앱 점수가 안 덮는다", ap.s2.score === 60, String(ap.s2.score));
ok("앱 점수는 따로 들고 있다 (다르면 «앱: 55» 로 보인다)", ap.s2.autoScore === 55);
ok("앱에 점수가 없는 학생은 그대로 비어 있다", ap.s3.score === "" && ap.s3.autoScore === null);
const ap2 = JSON.parse(run(`var r = rpDraft("T2","2026-09-14",null); rpApplyApp(r, { c2: { att: null, score: null } }); return JSON.stringify(r.classes[0].students);`));
ok("앱 점수를 못 읽었으면 아무것도 안 채운다", ap2.every((s) => s.score === ""));

// ---- 앱 점수가 기본값 — 출결이 넘어오는 것처럼 (9/14 마왕님) ----
// 보고를 한 번 낸 뒤에 학생이 앱에 점수를 다시 내는 일이 있다. 선생님이 손대지 않은 칸은 따라가야 한다.
const fol = by(JSON.parse(run(`var r = rpDraft("T2","2026-09-14",{ classes:[{ cid:"c2", students:[
    { sid:"s1", score:70, autoScore:70 },      // 지난번 앱 점수 그대로 냈다
    { sid:"s2", score:75, autoScore:55 } ] }] });   // 선생님이 55 를 75 로 고쳐 냈다
  rpApplyApp(r, { c2: { att: { s1:true, s2:true }, score: { s1: 90, s2: 60 } } });
  return JSON.stringify(r.classes[0].students);`)));
ok("손대지 않은 점수는 앱의 새 점수를 따라간다", fol.s1.score === "90" && fol.s1.autoScore === 90, JSON.stringify(fol.s1));
ok("⚠ 선생님이 고친 점수는 앱이 다시 바뀌어도 안 덮는다", fol.s2.score === 75 && fol.s2.autoScore === 60, JSON.stringify(fol.s2));
const kept = JSON.parse(run(`var r = rpDraft("T2","2026-09-14",null); rpApplyApp(r, { c2: { att:{ s1:true }, score:{ s1: 90 } } });
  var o = {}; rpClean(r).classes[0].students.forEach(function(s){ o[s.sid] = [s.score, s.autoScore]; }); return JSON.stringify(o);`));
ok("앱 점수를 따로 저장한다 (출결의 auto 처럼 — 누가 적었는지 남는다)", JSON.stringify(kept.s1) === "[90,90]", JSON.stringify(kept));
ok("앱 점수가 없으면 null 로 저장", kept.s3[1] === null, JSON.stringify(kept.s3));

// ---- 내기 전 검사 ----
const stopOf = (scores) => JSON.parse(run(`var r = rpDraft("T2","2026-09-14",null), m = ${JSON.stringify(scores)};
  r.classes[0].students.forEach(function(s){ s.score = m[s.sid]; });
  return JSON.stringify(rpCheck(r).stop);`));
ok("빈 칸은 막지 않는다 (안 본 학생도 있다)", stopOf({ s1: "", s2: "", s3: "" }).length === 0);
ok("제대로 적으면 막지 않는다", stopOf({ s1: "85", s2: "0", s3: "100" }).length === 0);
const bad = stopOf({ s1: "85점", s2: "", s3: "130" });
ok("잘못 적은 점수는 막는다 — 누구인지 짚는다", bad.length === 2 && bad.some((x) => /최하윤/.test(x)) && bad.some((x) => /박도윤/.test(x)) && !bad.some((x) => /안유진/.test(x)), JSON.stringify(bad));

// ---- 저장 모양 ----
const cl = JSON.parse(run(`var r = rpDraft("T2","2026-09-14",null);
  var m = { s1: " 88 ", s2: "0", s3: "" }; r.classes[0].students.forEach(function(s){ s.score = m[s.sid]; });
  var o = {}; rpClean(r).classes[0].students.forEach(function(s){ o[s.sid] = s.score; }); return JSON.stringify(o);`));
ok("숫자로 저장한다 (글자로 두면 나중에 셈이 깨진다)", cl.s1 === 88, JSON.stringify(cl));
ok("⚠ 0점은 0 으로", cl.s2 === 0, JSON.stringify(cl));
ok("⚠ 빈 칸은 null 로 — 0 이 아니다", cl.s3 === null, JSON.stringify(cl));

// ---- 평균 ----
ok("평균은 적힌 사람만 센다", run(`return JSON.stringify(rpScoreAvg([{score:80},{score:""},{score:null},{score:"90"}]))`) === '{"n":2,"avg":85}');
ok("0점도 평균에 든다", run(`return JSON.stringify(rpScoreAvg([{score:0},{score:100}]))`) === '{"n":2,"avg":50}');
ok("아무도 안 적었으면 평균이 없다", run(`return rpScoreAvg([{score:""},{score:null}])`) === null);

// ---- 원장님 문서 ----
run(`S.reports = { T2: { "2026-09-14": { tid:"T2", name:"이현우", date:"2026-09-14", submitted: 1, updated: 1,
  classes: [ { cid:"c2", name:"고2A", progress:"수열", homework:"",
    students: [ { sid:"s1", name:"최하윤", att:"출석", score: 90, note:"" },
                { sid:"s2", name:"안유진", att:"결석", called:true, score: null, note:"" },
                { sid:"s3", name:"박도윤", att:"출석", score: 40, note:"오답 많음" } ] } ],
  tasks: [], extra: [], moves: [] } } };`);
const dg = run(`return rpDigest("2026-09-14")`);
ok("반 줄에 테스트 평균 (적힌 사람 수와 함께)", dg.indexOf("**고2A** · 출석 2/3 · 테스트 평균 65점(2명) · 진도: 수열") >= 0, dg.split("\n").filter((l) => /고2A/.test(l)).join(" / "));
ok("특이사항이 있는 학생 줄에 점수가 붙는다", dg.indexOf("- 박도윤 — 40점 · 오답 많음") >= 0, dg.split("\n").filter((l) => /박도윤/.test(l)).join(" / "));
ok("결석한 학생은 점수 없이", dg.indexOf("- 안유진 — 결석(연락함)") >= 0 && dg.indexOf("안유진 — 결석(연락함) · ") < 0);
ok("출석이고 적은 게 없으면 점수만으로는 문서에 안 뜬다 (길어지지 않게)", dg.indexOf("최하윤") < 0);

// ---- 선생님 입력 화면 ----
const box = { innerHTML: "", querySelectorAll: () => [], querySelector: () => null };
run(`var r = rpDraft("T2","2026-09-14",null); rpApplyApp(r, { c2: { att:{ s1:true }, score:{ s1: 90 } } });
  r.classes[0].students.forEach(function(s){ if (s.sid === "s1") s.score = "85"; });
  S.rpEdit = { d:"2026-09-14", rep:r, app:true };`);
ctx.__box = box;
run(`rpDrawMine(__box, "2026-09-14");`);
const h = box.innerHTML;
ok("점수 칸이 특이사항 바로 앞에 있다",
  h.indexOf("<th>점수</th>") > 0 && h.indexOf("<th>점수</th>") < h.indexOf("특이사항</th>") && h.indexOf("<th>점수</th>") > h.indexOf("앱에 적힌 것"),
  h.slice(h.indexOf("<thead>"), h.indexOf("</thead>")));
ok("학생마다 점수 칸", (h.match(/\|score"/g) || []).length === 3);
ok("반 머리에 «앱에 점수 낸 학생 n명 — 점수도 채워 뒀다» (출결 안내 옆)", /앱에 점수 낸 학생 1명 — 점수도 채워 뒀다/.test(h), h.slice(h.indexOf("학생 3명"), h.indexOf("학생 3명") + 120));
ok("선생님이 고친 점수와 앱 점수가 다르면 «앱: 90» 을 옆에 적는다", /85"[^>]*>\s*<span class="rp-auto">앱: 90<\/span>/.test(h));
ok("점수 칸도 선생님 화면에서 안 잠긴다 (data-keep)", /class="rp-score" data-rps="[^"]*" value="[^"]*" placeholder="—" data-keep/.test(h));

// ---- 앱에서 읽기 ----
(async () => {
  const app = await vm.runInContext(`rpLoadApp("T2", "2026-09-14")`, ctx);
  ok("같은 날 여러 번 낸 학생은 **마지막 것** (시각 기준)", app.c2.score.s1 === 90, JSON.stringify(app.c2.score));
  ok("다른 학생도 읽는다", app.c2.score.s2 === 55);
  ok("번호 없는 제출은 버린다 (누구 것인지 모른다)", Object.keys(app.c2.score).length === 2, JSON.stringify(app.c2.score));

  console.log(T.join("\n"));
  const badN = T.filter((x) => x.startsWith("FAIL")).length;
  console.log(badN ? "\n실패 " + badN + "건" : "\n전부 통과 (" + T.length + "건)");
  process.exit(badN ? 1 : 0);
})().catch((e) => { console.log(T.join("\n")); console.log("\n시험이 도중에 터졌다: " + e.message); process.exit(1); });
