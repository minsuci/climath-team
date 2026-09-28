// 업무보고 — 하루 휴무(연차 · 병가)
// (2026-09-28 마왕님 «지난주 토요일 이현우선생님 안냈다고 되어있는데 그날은 연차써서 휴무셨으니까 없애»)
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
  TODAY = "2026-09-28"; RP_START = "2026-09-14"; RP_SKIP_NAMES = [];
  RP_WORK_DOWS = { "이현우": [1, 2, 3, 4, 5, 6] };
  S.teachers = [
    { tid:"TC", name:"이현우", role:"teacher", classIds:["c1"] },
    { tid:"TB", name:"정찬준", role:"teacher", classIds:["c1"] },
    { tid:"TO", name:"한민수", role:"owner", classIds:[] } ];
  S.classes = [ { id:"c1", name:"예비고1S", classDays:[6], roster:[ { id:"s1", name:"가" } ] } ];
  S.tasks = []; S.marks = {}; S.newIds = []; S.newSeen = true;
  // 9/26 은 나라 달력으로 추석 연휴지만 학원은 수업했다 (over · off:false)
  S.events = [ { from:"2026-09-26", over:true, off:false, text:"수업" } ];
  S.claims = { role:"owner", tid:"TO", name:"한민수" }; S.ro = false;
  S.reports = { TC:{}, TB:{ "2026-09-26": { submitted: new Date("2026-09-26T22:00:00").getTime(), classes:[], tasks:[], extra:[] } } };
  S.rpLeave = {};
  __box = { innerHTML:"", querySelector:()=>null, querySelectorAll:()=>[] };
  __draw = function () { rpDrawAll(__box, "2026-09-26", rpSummary("2026-09-26")); return __box.innerHTML; };
`);
ok("휴무를 안 적었으면 9/26 이현우는 안 낸 사람", run(`return rpSummary("2026-09-26").missing.join()`) === "TC");
ok("알림 띠에도 걸린다 (8시 지남)", run(`return rpOverdue("TC", new Date("2026-09-28T09:00:00")).indexOf("2026-09-26") >= 0`));
const h0 = run(`return __draw()`);
ok("안 낸 사람 카드에 «휴무로» 단추", /data-rpleave="TC"/.test(h0));

run(`S.rpLeave = { "TC|2026-09-26": { note:"연차", by:"TO", at:1 } };`);
ok("휴무로 적으면 보고할 날이 아니다", run(`return rpExpected("TC", "2026-09-26")`) === false);
ok("안 낸 사람에서 빠진다 · 보고 대상에서도", run(`var s = rpSummary("2026-09-26"); return s.missing.length === 0 && s.expect.join() === "TB"`));
ok("알림 띠(8시 지남)에서도 빠진다", run(`return rpOverdue("TC", new Date("2026-09-28T09:00:00")).indexOf("2026-09-26") < 0`));
ok("다른 날은 그대로 — 하루만이다", run(`return rpExpected("TC", "2026-09-19")`) === true);
ok("다른 선생님은 그대로", run(`return rpExpected("TB", "2026-09-26")`) === true);
const h1 = run(`return __draw()`);
ok("받은 보고에 «휴무 — 이현우 (연차) · 되돌리기»", /<b>휴무<\/b> — 이현우 <span class="pill">연차<\/span> <button class="mini" data-rpleavex="TC"/.test(h1), h1.slice(0, 400));
ok("안 낸 사람 카드는 없다", !/id="rp-card-TC"/.test(h1) && !/id="rp-miss"/.test(h1));
ok("휴무 날에는 매주 하는 일도 안 걸린다", run(`
  S.tasks = [ { id:"r1", text:"교재 업로드", who:"전원", repeat:{ dow:[6] }, status:"open" } ];
  var n = rpTasksFor("TC", "2026-09-26").length; S.tasks = []; return n;`) === 0);
ok("원장님 문서에서도 빠진다", !/안 낸 사람: 이현우/.test(run(`return rpDigest("2026-09-26")`)));

// 나스 자동 취합도 같은 문서를 읽는다
const dg = fs.readFileSync("tools/nas-daily-digest.mjs", "utf8");
ok("nas-daily-digest 가 dash/rpLeave 를 읽고 rpExpected 에서 뺀다",
  /\/dash\/rpLeave/.test(dg) && /!S\.rpLeave\[tid \+ "\|" \+ day\]/.test(dg));
ok("앱이 시작할 때 dash/rpLeave 를 읽는다", /dashDoc\("rpLeave"\)\.get\(\)\.then\(function \(d\) \{ S\.rpLeave =/.test(src));

T.forEach((l) => console.log(l));
const bad = T.filter((l) => l.startsWith("FAIL")).length;
console.log(bad ? "\n" + bad + "개 실패" : "\n모두 통과 (" + T.length + ")");
process.exit(bad ? 1 : 0);
