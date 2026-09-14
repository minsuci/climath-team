// 업무보고 «전체 출석» (2026-09-14) — 반마다 한 번에 출석.
//
// 마왕님: «출결 하나하나 누르기 귀찮으니까 한 번에 출결 누르기».
// 앱 출석을 안 찍은 반이면 전원이 «결석» 으로 채워져 온다 — 그걸 하나씩 풀던 것을 한 번에.
// 한 번에 바꾸는 단추라 **선생님이 손으로 고른 것을 날리면** 안 된다:
//   · 지각·조퇴로 고친 학생 · «연락함» 까지 체크한 결석 · 이 화면에서 직접 고른 출결
// 그리고 잘못 눌렀으면 되돌릴 수 있어야 한다.
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
// ⚠ 보고 명단은 이름순이다 — 학생 번호로 짚는다
const by = (arr) => { const m = {}; arr.forEach((x) => { m[x.sid] = x; }); return m; };

run(`
  TODAY = "2026-09-16"; RP_START = "2026-09-14";
  S.teachers = [ { tid:"T2", name:"이현우", role:"teacher", classIds:["c2"] } ];
  S.classes = [ { id:"c2", name:"고2A", classDays:[1,3,5], roster:[
    { id:"s1", name:"가빈칸" }, { id:"s2", name:"나앱결석" }, { id:"s3", name:"다지각" },
    { id:"s4", name:"라연락함" }, { id:"s5", name:"마앱출석" }, { id:"s6", name:"바손결석" } ] } ];
  S.tasks = []; S.marks = {}; S.events = []; S.reports = {}; S.claims = { tid:"T2" };
`);
// 한 반을 이렇게 차린다:
//   s1 빈 칸(앱 출석 못 읽음) · s2 앱이 결석으로 채움 · s3 선생님이 지각으로 고침
//   s4 앱 결석 + «연락함» 체크 · s5 앱 출석 · s6 이 화면에서 선생님이 결석을 직접 고름
const stage = `var r = rpDraft("T2","2026-09-14",null), c = r.classes[0], m = {};
  c.students.forEach(function(s){ m[s.sid] = s; });
  m.s1.att = ""; m.s1.auto = "";
  m.s2.att = "결석"; m.s2.auto = "결석";
  m.s3.att = "지각"; m.s3.auto = "결석";
  m.s4.att = "결석"; m.s4.auto = "결석"; m.s4.called = true;
  m.s5.att = "출석"; m.s5.auto = "출석";
  m.s6.att = "결석"; m.s6.auto = "결석"; m.s6.attTouched = true;`;

const after = JSON.parse(run(stage + ` var n = rpAllPresent(c); return JSON.stringify({ n: n, st: c.students, undo: c.allUndo });`));
const A = by(after.st);
ok("빈 칸은 출석으로", A.s1.att === "출석", A.s1.att);
ok("앱이 채운 결석(손 안 댄 것)은 출석으로", A.s2.att === "출석", A.s2.att);
ok("⚠ 선생님이 지각으로 고친 학생은 그대로", A.s3.att === "지각", A.s3.att);
ok("⚠ «연락함» 까지 체크한 결석은 그대로 (결석을 확인한 것이다)", A.s4.att === "결석" && A.s4.called === true, JSON.stringify(A.s4));
ok("이미 출석이면 그대로", A.s5.att === "출석");
ok("⚠ 이 화면에서 직접 고른 결석은 그대로", A.s6.att === "결석", A.s6.att);
ok("바꾼 수를 돌려준다 (둘)", after.n === 2, String(after.n));
ok("되돌릴 거리를 들고 있다 — 바꾼 둘만", after.undo && after.undo.length === 2, JSON.stringify(after.undo));

const back = by(JSON.parse(run(stage + ` rpAllPresent(c); rpAllUndo(c); return JSON.stringify(c.students);`)));
ok("되돌리면 빈 칸은 빈 칸으로", back.s1.att === "", back.s1.att);
ok("되돌리면 앱 결석은 결석으로", back.s2.att === "결석", back.s2.att);
ok("되돌려도 손 안 댄 학생은 그대로", back.s3.att === "지각" && back.s4.called === true && back.s6.att === "결석");
ok("되돌린 뒤엔 되돌릴 거리가 없다", run(stage + ` rpAllPresent(c); rpAllUndo(c); return c.allUndo == null;`) === true);

ok("다 출석이면 바꿀 게 없다 — 0 · 되돌릴 거리도 안 만든다",
  run(`var r = rpDraft("T2","2026-09-14",null), c = r.classes[0]; c.students.forEach(function(s){ s.att = "출석"; s.auto = "출석"; });
       var n = rpAllPresent(c); return n + "|" + (c.allUndo == null);`) === "0|true");
ok("결석에서 출석으로 바꾸면 «연락함» 은 풀린다 (결석일 때만 뜨는 칸)",
  run(stage + ` m.s2.called = false; rpAllPresent(c); return m.s2.called;`) === false);

// 저장에는 화면용 칸이 안 남는다
const saved = JSON.parse(run(stage + ` rpAllPresent(c); return JSON.stringify(rpClean(r).classes[0]);`));
ok("저장에 되돌릴 거리(allUndo)가 안 남는다", !("allUndo" in saved));
ok("저장에 «손으로 고름» 표시(attTouched)가 안 남는다", saved.students.every((s) => !("attTouched" in s)));

// ---- 화면 ----
const box = { innerHTML: "", querySelectorAll: () => [], querySelector: () => null };
ctx.__box = box;
run(stage + ` S.rpEdit = { d:"2026-09-14", rep:r, app:true }; rpDrawMine(__box, "2026-09-14");`);
let h = box.innerHTML;
ok("반마다 «전체 출석» 단추", /data-rpall="0"[^>]*>전체 출석</.test(h), (h.match(/<button[^>]*data-rpall[^>]*>[^<]*</) || [""])[0]);
ok("단추가 선생님 화면에서 안 잠긴다 (data-keep)", /data-rpall="0" data-keep/.test(h));
ok("누르기 전엔 «되돌리기» 가 없다", h.indexOf("data-rpundo") < 0);
run(stage + ` rpAllPresent(c); S.rpEdit = { d:"2026-09-14", rep:r, app:true }; rpDrawMine(__box, "2026-09-14");`);
h = box.innerHTML;
ok("누른 뒤엔 «되돌리기» 단추가 뜬다", /data-rpundo="0" data-keep[^>]*>되돌리기</.test(h), (h.match(/<button[^>]*data-rpundo[^>]*>[^<]*</) || [""])[0]);
run(`var r = rpDraft("T2","2026-09-14",null), c = r.classes[0]; c.students.forEach(function(s){ s.att = "출석"; s.auto = "출석"; });
     S.rpEdit = { d:"2026-09-14", rep:r, app:true }; rpDrawMine(__box, "2026-09-14");`);
ok("이미 다 출석이면 단추를 흐리게 (눌러도 바뀔 게 없다)", /data-rpall="0" data-keep disabled/.test(box.innerHTML));

console.log(T.join("\n"));
const bad = T.filter((x) => x.startsWith("FAIL")).length;
console.log(bad ? "\n실패 " + bad + "건" : "\n전부 통과 (" + T.length + "건)");
process.exit(bad ? 1 : 0);
