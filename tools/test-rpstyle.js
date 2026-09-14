// 업무보고 화면 손질 (2026-09-14) — 간격 · 설명 글씨 · 단추 색.
//
// 마왕님: «명단변동·업무·할 일에 없던 업무 간격이 좁다» · «— 이후에 작은 설명글씨들 다 지워» ·
//         «색이 단조로워 눈에 하나도 안 띈다. 중요한 단추는 색을 입혀 손이 가게».
// 모양이라 눈으로 보는 게 맞지만, **설명 글씨가 다시 붙거나 단추 색 이름표가 떨어지는 것**은 시험으로 잡는다.
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

// 9/18(금) — 월수금 반의 그 주 마지막 수업이라 «이번 주» 칸까지 뜬다
run(`
  TODAY = "2026-09-18"; RP_START = "2026-09-14";
  S.teachers = [ { tid:"T2", name:"이현우", role:"teacher", classIds:["c2"] } ];
  S.classes = [ { id:"c2", name:"고2A", classDays:[1,3,5], roster:[ { id:"s1", name:"최하윤" }, { id:"s2", name:"안유진" } ] } ];
  S.tasks = [ { id:"a", text:"자료 만들기", who:"전원", due:"2026-09-18" } ]; S.marks = {}; S.events = []; S.reports = {}; S.claims = { tid:"T2" };
`);
const box = { innerHTML: "", querySelectorAll: () => [], querySelector: () => null };
ctx.__box = box;
run(`var r = rpDraft("T2","2026-09-18",null);
  rpApplyApp(r, { c2: { att:{ s1:true }, score:{ s1: 90 } } });
  r.tasks.forEach(function(t){ t.state = "done"; });
  r.moves.push({ kind:"leave", sid:"", pid:"", name:"", fromCid:"", fromName:"", toCid:"", toName:"", date:"2026-09-18", note:"" });
  r.extra.push({ kind:"기타", text:"" });
  S.rpEdit = { d:"2026-09-18", rep:r, app:true }; rpDrawMine(__box, "2026-09-18");`);
const h = box.innerHTML;

// ---- «—» 뒤 작은 설명 글씨 ----
ok("반 머리에 «이번 주» 칸이 떴다 (시험 무대 확인)", h.indexOf("rp-week") >= 0);
ok("할 일이 한 줄 떴다 (시험 무대 확인 — 비면 상태 단추가 안 그려진다)", (h.match(/class="rp-task"/g) || []).length === 1);
[["출결을 미리 채워 뒀다"], ["점수도 채워 뒀다"], ["직접 고른다"], ["세 줄만 적는다"], ["팀장이 보고 앱 명단에 옮긴다"], ["— 그 날까지 기한인 내 할 일"]]
  .forEach(([t]) => ok("설명 글씨가 없다 — «" + t + "»", h.indexOf(t) < 0));
ok("섹션 머리는 이름만 — 명단 변동", h.indexOf('<h3 class="rp-h">명단 변동</h3>') >= 0);
ok("섹션 머리는 이름만 — 업무", h.indexOf('<h3 class="rp-h">업무</h3>') >= 0);
ok("사실은 남긴다 — «앱에 출석 찍힌 학생 1명»", h.indexOf("앱에 출석 찍힌 학생 1명") >= 0);
ok("내기 전 경고 문구는 그대로 (설명 글씨가 아니라 알림이다)",
  run(`return rpCheck(S.rpEdit.rep).warn.some(function(w){ return /이번 주 마지막 수업이다/.test(w); })`) === true);

// ---- 단추 색 ----
ok("제출은 주황 큰 단추", /class="btn send" data-rpsave/.test(h));
ok("전체 출석은 초록", /class="mini go" data-rpall=/.test(h));
ok("＋ 반 이동 은 파란 테두리", /class="mini plus" data-rpmadd="move"/.test(h));
ok("＋ 퇴원 은 빨간 테두리", /class="mini plus leave" data-rpmadd="leave"/.test(h));
ok("＋ 한 줄 은 파란 테두리", /class="mini plus" data-rpxadd/.test(h));
ok("업무 상태 단추에 상태 이름표 (완료 켜짐)", /class="mini st-done on" data-rpk=/.test(h) && /class="mini st-doing" data-rpk=/.test(h) && /class="mini st-hold" data-rpk=/.test(h));
ok("색 이름표를 달아도 선생님 화면에서 안 잠긴다 (data-keep)", /data-rpsave data-keep/.test(h) && /data-rpmadd="leave" data-keep/.test(h));

// ---- CSS ----
const css = /<style>([\s\S]*?)<\/style>/.exec(html)[1];
ok("섹션 간격을 넓혔다 — 업무보고 안에서만", /#sec-report \.rp-h \{[^}]*margin: 30px 0 10px/.test(css));
ok("월간계획의 .rp-h 는 그대로", /\n  \.rp-h \{ font-size: 14px; margin: 16px 0 6px;/.test(css));
ok("명단 변동 · 업무 줄 간격", /\.rp-move \{[^}]*padding: 9px 0/.test(css) && /\.rp-task \{[^}]*padding: 9px 0/.test(css) && /\.rp-extra \{ margin-bottom: 8px; \}/.test(css));
["btn.send", "mini.go", "mini.plus", "mini.plus.leave", "st-done.on", "st-doing.on", "st-hold.on"].forEach((k) =>
  ok("색 규칙이 있다 — " + k, css.indexOf(k) >= 0));

// ---- 팀장 화면 ----
run(`S.reports = { T2: { "2026-09-18": { tid:"T2", name:"이현우", date:"2026-09-18", submitted:1, updated:1, classes:[], tasks:[], extra:[], moves:[] } } };
  S.rpDig = "2026-09-18"; rpDrawAll(__box, "2026-09-18", rpSummary("2026-09-18"));`);
ok("원장님께 올릴 문서는 주황 큰 단추", /class="btn send" data-rpdig/.test(box.innerHTML));
ok("복사는 파란 테두리", /class="mini plus" data-rpcopy/.test(box.innerHTML));

console.log(T.join("\n"));
const bad = T.filter((x) => x.startsWith("FAIL")).length;
console.log(bad ? "\n실패 " + bad + "건" : "\n전부 통과 (" + T.length + "건)");
process.exit(bad ? 1 : 0);
