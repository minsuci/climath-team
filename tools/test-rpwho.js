// 받은 보고 — 누가 냈고 안 냈나 한 줄 · 안 낸 사람은 맨 아래 · «내라고 알림»
// (2026-09-19 마왕님 «박준성 선생님한테 업무보고 내라고 알림 보내줘. 그리고 업무보고 안낸사람은 아래 모아서 볼 수 있게 해. 누가 냈고 안냈는지 한 눈에 보게»)
const fs = require("fs"), vm = require("vm");
const html = fs.readFileSync("index.html", "utf8");
const src = /<script>([\s\S]*?)<\/script>/.exec(html)[1];
const stub = `
var __calls = [];
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
  TODAY = "2026-09-19"; RP_START = "2026-09-14"; RP_WORK_DOWS = {}; RP_SKIP_NAMES = [];
  S.teachers = [
    { tid:"TA", name:"박준성", role:"teacher", classIds:["c1"] },
    { tid:"TB", name:"정찬준", role:"teacher", classIds:["c1"] },
    { tid:"TC", name:"이현우", role:"teacher", classIds:["c1"] },
    { tid:"TO", name:"한민수", role:"owner", classIds:[] } ];
  S.classes = [ { id:"c1", name:"고1S", classDays:[5], roster:[ { id:"s1", name:"가" } ] } ];
  S.tasks = []; S.marks = {}; S.events = []; S.newIds = []; S.newSeen = true;
  S.claims = { role:"owner", tid:"TO", name:"한민수" }; S.ro = false;
  S.reports = { TA:{}, TB:{ "2026-09-18": { submitted: new Date("2026-09-18T22:10:00").getTime(), classes:[], tasks:[], extra:[] } },
                TC:{ "2026-09-18": { submitted: new Date("2026-09-18T23:40:00").getTime(), classes:[], tasks:[], extra:[] } } };
  __box = { innerHTML:"", querySelector:()=>null, querySelectorAll:()=>[] };
  __draw = function (now) { var real = Date.now; Date.now = function () { return now; };
    try { rpDrawAll(__box, "2026-09-18", rpSummary("2026-09-18")); } finally { Date.now = real; } return __box.innerHTML; };
`);
const before = run(`return __draw(new Date("2026-09-19T00:30:00").getTime())`);
const who = /<div class="rp-who">([\s\S]*?)<\/div>/.exec(before);
ok("한 줄에 셋 다 — 낸 사람 먼저, 안 낸 사람 뒤", who && /✓ 정찬준[\s\S]*✓ 이현우[\s\S]*박준성/.test(who[1]), who && who[1]);
ok("낸 사람은 낸 시각", who && /✓ 정찬준 <span class="muted">22:10<\/span>/.test(who[1]), who && who[1]);
ok("기한(아침 8시) 전이면 «아직» (노랑)", who && /class="wait" data-rpgo="TA">… 박준성 아직/.test(who[1]), who && who[1]);
const after = run(`return __draw(new Date("2026-09-19T08:30:00").getTime())`);
ok("기한이 지나면 «안 냄» (빨강)", /class="no" data-rpgo="TA">✗ 박준성 안 냄/.test(after));
const iMiss = after.indexOf('id="rp-miss"'), iA = after.indexOf('id="rp-card-TA"'), iB = after.indexOf('id="rp-card-TB"'), iC = after.indexOf('id="rp-card-TC"');
ok("안 낸 사람은 맨 아래에 모인다 («안 낸 사람 1» 머리 밑)", iB > 0 && iC > iB && iMiss > iC && iA > iMiss, [iB, iC, iMiss, iA].join(","));
ok("머리에 수", /<h3 class="rp-h" id="rp-miss">안 낸 사람 1<\/h3>/.test(after));
ok("안 낸 카드에 «내라고 알림»", /id="rp-card-TA"[\s\S]*?data-rpnudge="TA">내라고 알림/.test(after));
run(`S.reports.TA["2026-09-18"] = { submitted: 1, classes:[], tasks:[], extra:[] };`);
const all = run(`return __draw(new Date("2026-09-19T08:30:00").getTime())`);
ok("다 냈으면 «안 낸 사람» 머리가 없다", all.indexOf('id="rp-miss"') < 0);
run(`delete S.reports.TA["2026-09-18"];`);

// 알림
run(`pushApi = function (want, x) { __calls.push({ want: want, x: x }); return Promise.resolve({ ok: true, each: [{ tid: x.to[0], sent: 1 }] }); };`);
(async () => {
  const realNow = Date.now;
  ctx.Date.now = () => new Date("2026-09-19T00:30:00").getTime();
  await run(`return rpNudge("TA", "2026-09-18")`);
  ctx.Date.now = realNow;
  const c = JSON.parse(run(`return JSON.stringify(__calls[0])`));
  ok("팀장 보내기 길(want=send)로 그 한 사람에게", c.want === "send" && JSON.stringify(c.x.to) === '["TA"]' && c.x.url === "/#report", JSON.stringify(c));
  ok("글 — 날짜 · 기한 전이면 아침 8시까지", /^9\/18\(금\) 업무보고를 아직 안 내셨습니다\. 다음 날 아침 8시까지 내 주세요\.$/.test(c.x.body), c.x.body);
  ok("받은 결과를 한 줄로 — 보냄 / 폰 알림 안 켬",
    /^폰으로 보냈다 \d\d:\d\d$/.test(run(`return rpNudgeMsg({ each:[{ sent:1 }] })`)) &&
    /안 켠 선생님/.test(run(`return rpNudgeMsg({ each:[{ none:true }] })`)), run(`return rpNudgeMsg({ each:[{ sent:1 }] })`));
  T.forEach((l) => console.log(l));
  const bad = T.filter((l) => l.startsWith("FAIL")).length;
  console.log(bad ? "\n" + bad + "개 실패" : "\n모두 통과 (" + T.length + ")");
  process.exit(bad ? 1 : 0);
})();
