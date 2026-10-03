// 업무보고 명단 변동 — 학생 추가 (신입생)
// (2026-10-03 마왕님 «업무보고에 명단변동에 학생추가도 넣자. 신입생이 안들어와있을수도 있으니까»)
const fs = require("fs"), vm = require("vm");
const html = fs.readFileSync("index.html", "utf8");
const src = /<script>([\s\S]*?)<\/script>/.exec(html)[1];
const stub = `
var __writes = [];
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
  TODAY = "2026-10-03"; RP_START = "2026-09-14"; RP_SKIP_NAMES = []; RP_WORK_DOWS = {};
  S.teachers = [ { tid:"TC", name:"이현우", role:"teacher", classIds:["c1"] }, { tid:"TO", name:"한민수", role:"owner", classIds:[] } ];
  S.classes = [ { id:"c1", name:"예비고1S 월금", classDays:[1,5], roster:[ { id:"s1", pid:"p1", name:"가나", grade:"중3", school:"대청중" },
                                                                          { id:"s2", pid:"p2", name:"다라", grade:"중3", school:"휘문중" } ] },
                { id:"c2", name:"고1S", classDays:[2,4], roster:[] } ];
  S.students = [ { pid:"p1", name:"가나", grade:"중3", school:"대청중" }, { pid:"p2", name:"다라", grade:"중3", school:"휘문중" },
                 { pid:"p9", name:"마바", grade:"중3", school:"" } ];
  S.byPid = {}; S.students.forEach(function (x) { S.byPid[x.pid] = x; });
  S.tasks = []; S.marks = {}; S.events = []; S.rpLeave = {};
  S.claims = { role:"owner", tid:"TO", name:"한민수" }; S.ro = false;
`);

ok("명단 변동 종류에 «학생 추가»", run(`return RP_MOVE.add`) === "학생 추가" && run(`return rpMovePill({ kind:"add" })`) === "green");
ok("보고 판에 «＋ 학생 추가» 단추", /data-rpmadd="add"/.test(src) && /＋ 학생 추가/.test(src));

// 저장할 때 — 이름은 적은 그대로, 반 이름은 반 번호에서
const clean = JSON.parse(run(`return JSON.stringify(rpClean({ tid:"TC", name:"이현우", date:"2026-10-03", classes:[], tasks:[], extra:[], moves:[
  { kind:"add", name:" 사아 ", school:" 대청중 ", toCid:"c1", toName:"", date:"2026-10-05", note:"체험 후 등록", sid:"x", pid:"y" },
  { kind:"add", name:"  ", school:"", toCid:"c1" } ] }).moves)`));
ok("저장 — 이름 · 학교를 다듬고 반 이름을 채운다, sid·pid 는 비운다",
  clean.length === 1 && clean[0].name === "사아" && clean[0].school === "대청중" && clean[0].toName === "예비고1S 월금" &&
  clean[0].sid === "" && clean[0].pid === "" && clean[0].date === "2026-10-05", JSON.stringify(clean));
ok("저장 — 이름이 빈 줄은 버린다", clean.length === 1);

ok("글 — «대청중 · 새로 → 예비고1S 월금»", run(`return rpMoveText({ kind:"add", name:"사아", school:"대청중", toName:"예비고1S 월금" })`) === "대청중 · 새로 → 예비고1S 월금");
ok("상태 — 반 명단에 없으면 «앱 명단에 아직 없다»", run(`var s = rpMoveState({ kind:"add", name:"사아", toCid:"c1" }); return !s.done && /아직 없다/.test(s.text)`));
ok("상태 — 반 명단에 이름이 있으면 끝 (데스크가 먼저 넣었어도)", run(`return rpMoveState({ kind:"add", name:"가나", toCid:"c1" }).done`));
ok("상태 — 반이 없으면 끝나지 않았다", run(`return !rpMoveState({ kind:"add", name:"사아", toCid:"" }).done`));
ok("원장님 문서에 «(학생 추가) 사아 대청중 · 새로 → …»", /\(학생 추가\) 사아 대청중 · 새로 → 예비고1S 월금 · 10\/5\(월\)부터/.test(run(`
  S.reports = { TC:{ "2026-10-03": { submitted: 1, classes:[], tasks:[], extra:[], moves:[ { kind:"add", name:"사아", school:"대청중", toCid:"c1", toName:"예비고1S 월금", date:"2026-10-05", note:"" } ] } }, TO:{} };
  return rpDigest("2026-10-03");`)));
ok("알림 띠 — 앱에 아직 안 넣은 학생 추가도 센다", run(`return rpPendingMoves().length === 1 && rpPendingMoves()[0].m.kind === "add"`));

// 앱에 반영 — 학생 명단에 있으면 그 사람, 없으면 새로 만든다, 동명이인이 둘이면 멈춘다
run(`
  __made = []; __put = [];
  stCreate = async function (d) { var p = Object.assign({ pid:"new1" }, d); __made.push(p); S.students.push(p); return p; };
  stAssign = async function (cid, person, days) { __put.push({ cid:cid, pid:person.pid, days: days || null }); };
`);
(async () => {
  await run(`return rpApplyMove({ kind:"add", name:"마바", school:"", toCid:"c2", date:"2026-10-06" })`);
  ok("학생 명단에 있는 학생(마바)은 새로 안 만들고 그 사람을 넣는다",
    run(`return __made.length === 0 && __put.length === 1 && __put[0].pid === "p9" && __put[0].cid === "c2"`), run(`return JSON.stringify(__put)`));
  await run(`return rpApplyMove({ kind:"add", name:"사아", school:"대청중", toCid:"c1", date:"2026-10-05" })`);
  ok("없는 학생은 새로 만든다 — 학년은 그 반에 많은 학년(중3), 학교는 적은 것",
    run(`return __made.length === 1 && __made[0].name === "사아" && __made[0].grade === "중3" && __made[0].school === "대청중" && __put[1].pid === "new1"`),
    run(`return JSON.stringify(__made)`));
  ok("학교가 다르면 같은 이름이어도 다른 학생", run(`return rpAddMatches({ name:"가나", school:"휘문중" }).length === 0 && rpAddMatches({ name:"가나", school:"대청중" }).length === 1`));
  run(`S.students.push({ pid:"p10", name:"마바", grade:"고1", school:"" });`);
  let err = "";
  try { await run(`return rpApplyMove({ kind:"add", name:"마바", toCid:"c1", date:"2026-10-05" })`); } catch (e) { err = e.message; }
  ok("동명이인이 둘 이상이면 넣지 않고 멈춘다", /2명 있다/.test(err), err);
  err = "";
  try { await run(`return rpApplyMove({ kind:"add", name:"차카", toCid:"", date:"2026-10-05" })`); } catch (e) { err = e.message; }
  ok("반이 없으면 멈춘다", /반이 안 정해졌다/.test(err), err);
  ok("이미 반에 있으면 아무것도 안 한다", await run(`var n = __put.length; return rpApplyMove({ kind:"add", name:"가나", toCid:"c1" }).then(function () { return __put.length === n; })`));
  run(`S.classes.push({ id:"c3", name:"개진반 이현우", type:"individual", roster:[ { id:"t", teacher:true, name:"이현우" } ] });`);
  const ind = run(`return isIndividual(S.classes[2])`);
  if (ind) {
    await run(`return rpApplyMove({ kind:"add", name:"타파", toCid:"c3", date:"2026-10-06" })`);
    ok("개진반은 첫 수업 날의 요일로 넣는다 (10/6 화 = 2)", run(`var x = __put[__put.length - 1]; return x.cid === "c3" && JSON.stringify(x.days) === "[2]"`), run(`return JSON.stringify(__put)`));
  } else ok("개진반 판정 (isIndividual) — 시험 반 모양 확인", false, "isIndividual 가 kind:individual 을 개진반으로 안 본다");

  T.forEach((l) => console.log(l));
  const bad = T.filter((l) => l.startsWith("FAIL")).length;
  console.log(bad ? "\n" + bad + "개 실패" : "\n모두 통과 (" + T.length + ")");
  process.exit(bad ? 1 : 0);
})();
