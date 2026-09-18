// 특이사항 «주의» (2026-09-18 마왕님 «특이사항이 전부 다 한눈에로 가면 그게 부정적인 시그널인지 어떻게 구분하지?» → «1번으로 가자»)
//
// 선생님이 특이사항 옆 «주의» 를 켠다 → 학생 한눈에 빨간 점 · 받은 보고/원장님 문서에 «주의».
const fs = require("fs"), vm = require("vm");
const html = fs.readFileSync("index.html", "utf8");
const src = /<script>([\s\S]*?)<\/script>/.exec(html)[1];
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

run(`
  TODAY = "2026-09-16"; RP_START = "2026-09-14"; RP_WORK_DOWS = {}; RP_SKIP_NAMES = [];
  S.teachers = [ { tid:"T2", name:"이현우", role:"teacher", classIds:["c2"] } ];
  S.classes = [ { id:"c2", name:"고2A", classDays:[1,3,5], roster:[ { id:"s1", name:"최하윤", pid:"p1" }, { id:"s2", name:"안유진", pid:"p2" } ] } ];
  S.tasks = []; S.marks = {}; S.events = []; S.reports = {};
  S.claims = { role:"teacher", tid:"T2", name:"이현우" }; S.ro = true;
  // 판의 학생은 이름순이다(rpStudentsOn) — 순번으로 짚지 말고 이름으로
  __st = function (r, nm) { return r.classes[0].students.filter(function (s) { return s.name === nm; })[0]; };
`);

// ---- 판 ----
ok("특이사항 칸 옆에 «주의» 체크가 있다 (읽기 계정에서도 살아 있게 data-keep)",
  /data-rps="' \+ k \+ '\|warn"' \+ \(s\.warn \? " checked" : ""\) \+ RPK \+ '> 주의<\/label>/.test(src));
ok("체크를 누르면 그 학생의 warn 이 바뀐다", /else if \(k\[2\] === "warn"\) i\.onchange = function \(\) \{ s\.warn = i\.checked; re\(\); \};/.test(src));
ok("처음 여는 판은 꺼져 있다", run(`return rpDraft("T2","2026-09-14",null).classes[0].students[0].warn`) === false);

// ---- 저장 · 다시 열기 ----
run(`__r = rpDraft("T2","2026-09-14",null);
  __st(__r,"최하윤").att = "출석"; __st(__r,"최하윤").note = "과제 3주째 안 해옴"; __st(__r,"최하윤").warn = true;
  __st(__r,"안유진").att = "출석"; __st(__r,"안유진").note = "오늘 집중 잘함";
  __c = rpClean(__r);`);
ok("저장할 모양에 warn 이 남는다", run(`return __st(__c,"최하윤").warn`) === true && run(`return __st(__c,"안유진").warn`) === false);
ok("다시 열면 켜 둔 것이 그대로", run(`return __st(rpDraft("T2","2026-09-14",__c),"최하윤").warn`) === true);

// ---- 알려 주기 ----
const ck = JSON.parse(run(`var r = rpDraft("T2","2026-09-14",null); __st(r,"안유진").warn = true; return JSON.stringify(rpCheck(r));`));
ok("«주의» 만 켜고 안 적으면 알려 준다", ck.warn.some((w) => /주의.*안 적은 학생 1명 — 안유진/.test(w)), JSON.stringify(ck.warn));
ok("그래도 막지는 않는다", ck.stop.length === 0);
ok("적었으면 안 알린다", !JSON.parse(run(`return JSON.stringify(rpCheck(__r))`)).warn.some((w) => /주의/.test(w)));

// ---- 받은 보고 · 원장님 문서 (나스 취합도 rpDigest 를 쓴다) ----
run(`S.reports = { T2: { "2026-09-14": Object.assign({}, __c, { submitted: 1, updated: 1 }) } };`);
const sm = JSON.parse(run(`return JSON.stringify(rpSummary("2026-09-14").notes)`));
ok("받은 보고의 특이사항에 warn 이 실린다", sm.some((n) => n.name === "최하윤" && n.warn === true) && sm.some((n) => n.name === "안유진" && n.warn === false), JSON.stringify(sm));
const dg = run(`return rpDigest("2026-09-14")`);
ok("원장님 문서 — 주의 학생 줄에 «(주의)»", /- 최하윤 \*\*\(주의\)\*\* — .*과제 3주째 안 해옴/.test(dg), dg);
ok("원장님 문서 — 그냥 적은 것에는 안 붙는다", /- 안유진 — .*오늘 집중 잘함/.test(dg) && !/안유진 \*\*\(주의\)/.test(dg));
ok("받은 보고 표 — 주의 학생 칸에 빨간 «주의»", /\(s\.warn \? '<span class="pill red">주의<\/span> ' : ""\) \+ esc\(s\.note \|\| ""\)/.test(src));

// ---- 학생 한눈에 ----
const E = JSON.parse(run(`return JSON.stringify(boardEntries(S.reports))`));
ok("카드 자료에 warn 이 실린다", E.byPid.p1[0].warn === true && E.byPid.p2[0].warn === false, JSON.stringify(E.byPid));
const card = (list) => `var x = { p: { pid:"p1", name:"최하윤", grade:"고2" }, cls: [], list: ${JSON.stringify(list)} };`;
const e = (d, note, warn) => ({ date: d, tid: "T2", cid: "c2", cname: "고2A", att: "출석", called: false, score: null, note: note, warn: !!warn });
const miniW = run(card([e("2026-09-14", "과제 3주째 안 해옴", true), e("2026-09-16", "집중 잘함")]) + ` return boardMiniHtml(x);`);
ok("작은 카드 — 주의가 있으면 빨간 점 (class w)", /<i class="nt w" title="주의 1 · 특이사항 2">/.test(miniW), miniW);
const miniN = run(card([e("2026-09-16", "집중 잘함")]) + ` return boardMiniHtml(x);`);
ok("작은 카드 — 그냥 적은 것만 있으면 회색 점", /<i class="nt" title="특이사항 1">/.test(miniN), miniN);
const miniE = run(card([]) + ` return boardMiniHtml(x);`);
ok("작은 카드 — 없으면 점도 없다", miniE.indexOf('class="nt') < 0);
const big = run(card([e("2026-09-14", "과제 3주째 안 해옴", true), e("2026-09-16", "집중 잘함")]) + ` return boardCardHtml(x);`);
ok("큰 카드 — «주의 1» 이 뜬다", /<span class="bd-wn">주의 1<\/span>/.test(big), big);
ok("큰 카드 — 더 새 특이사항이 있어도 주의 한 줄을 먼저 보인다", /9\/14\(월\)<\/span> 과제 3주째 안 해옴/.test(big) && big.indexOf("집중 잘함") < 0, big);
const bigN = run(card([e("2026-09-16", "집중 잘함")]) + ` return boardCardHtml(x);`);
ok("큰 카드 — 주의가 없으면 가장 최근 특이사항 (전과 같다)", /9\/16\(수\)<\/span> 집중 잘함/.test(bigN) && bigN.indexOf("bd-wn") < 0);
const bigE = run(card([e("2026-09-14", "", true)]) + ` return boardCardHtml(x);`);
ok("큰 카드 — 적지 않은 주의도 사라지지 않는다 «(내용 없음)»", /주의 1<\/span>.*\(내용 없음\)/.test(bigE), bigE);
ok("작은 카드 — 적지 않은 주의에도 빨간 점", /class="nt w"/.test(run(card([e("2026-09-14", "", true)]) + ` return boardMiniHtml(x);`)));

// ---- 모양 ----
ok("빨간 점은 빨강(var(--red)) · 회색 점은 흐리게", /\.bd-mini \.bm \.nt\.w \{[^}]*background: var\(--red\)/.test(html) && /\.bd-mini \.bm \.nt \{[^}]*background: var\(--muted\)/.test(html));

console.log(T.join("\n"));
const bad = T.filter((x) => x.indexOf("FAIL") === 0).length;
console.log(bad ? "\n실패 " + bad + "건" : "\n전부 통과 (" + T.length + "건)");
process.exitCode = bad ? 1 : 0;
