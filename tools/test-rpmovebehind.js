// 시트 대조 — 업무보고로 이미 옮긴 학생을 되돌리는 줄은 «반영» 을 감춘다 (2026-09-22)
// 마왕님 «업무보고에서 명단이동을 앱에 반영하면 학생명단에도 반영되게 해. 지금 그렇게 안되어있지?»
// → 앱 명단은 이미 바뀐다. 데스크 시트가 옛 명단이라 대조에 «배정» 이 떠서, 누르면 도로 들어갈 뻔했다.
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
  S.teachers = [ { tid:"TC", name:"이창혁A", role:"teacher", classIds:["gj"] } ];
  S.classes = [
    { id:"gj", name:"개진반 이창혁A", classDays:[0], roster:[] },
    { id:"s1", name:"예비고1S 화목", classDays:[2,4], roster:[ { id:"r1", pid:"P1", name:"김초이" } ] },
    { id:"t1", name:"예비고1T 화목", classDays:[2,4], roster:[] } ];
  S.reports = { TC: { "2026-09-20": { submitted: 1, moves: [
    { kind:"move", pid:"P1", sid:"x", name:"김초이", fromCid:"gj", fromName:"개진반 이창혁A", toCid:"", toName:"종료", date:"2026-09-20" } ] } } };
`);
ok("보고로 뺀 반에 시트가 도로 넣으라는 «배정» — 되돌리는 줄로 잡는다",
  !!run(`return rpMoveBehind({ kind:"배정", name:"김초이", pid:"P1", to:"gj" })`));
ok("다른 반 배정은 아니다", !run(`return rpMoveBehind({ kind:"배정", name:"김초이", pid:"P1", to:"t1" })`));
ok("다른 학생은 아니다", !run(`return rpMoveBehind({ kind:"배정", name:"김예지", pid:"P2", to:"gj" })`));
// 새 반으로 옮긴 경우 — 시트엔 아직 옛 반: 대조는 «전반 새→옛» 또는 «퇴원(새 반)»
run(`S.classes[0].roster = []; S.classes[2].roster = [ { id:"r9", pid:"P1", name:"김초이" } ];
  S.reports.TC["2026-09-21"] = { submitted: 1, moves: [ { kind:"move", pid:"P1", name:"김초이", fromCid:"s1", toCid:"t1", toName:"예비고1T 화목" } ] };
  S.classes[1].roster = [];`);
ok("옮긴 새 반에서 빼라는 «퇴원» — 되돌리는 줄", !!run(`return rpMoveBehind({ kind:"퇴원", name:"김초이", pid:"P1", from:"t1" })`));
ok("새 반 → 옛 반 «전반» — 되돌리는 줄", !!run(`return rpMoveBehind({ kind:"전반", name:"김초이", pid:"P1", from:"t1", to:"s1" })`));
ok("앱에 아직 안 옮긴 보고는 상관없다", run(`
  S.reports = { TC: { "2026-09-21": { submitted: 1, moves: [ { kind:"move", pid:"P1", name:"김초이", fromCid:"s1", toCid:"t1" } ] } } };
  S.classes[1].roster = [ { id:"r1", pid:"P1", name:"김초이" } ]; S.classes[2].roster = [];
  return rpMoveBehind({ kind:"배정", name:"김초이", pid:"P1", to:"s1" });`) === null);
ok("대조 줄 — 되돌리는 줄이면 «업무보고로 옮김 · 시트가 옛 명단» 을 달고 «반영» 을 감춘다",
  /bh = rpMoveBehind\(it\)/.test(src) && /업무보고로 옮김 · 시트가 옛 명단/.test(src) && /\(it\.kind === "확인" \|\| bh \? "" : '<button class="mini" data-diff-apply=/.test(src));

T.forEach((l) => console.log(l));
const bad = T.filter((l) => l.startsWith("FAIL")).length;
console.log(bad ? "\n" + bad + "개 실패" : "\n모두 통과 (" + T.length + ")");
process.exit(bad ? 1 : 0);
