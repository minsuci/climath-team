// 퇴원 위험 · 팀장 지시 · 학교 일정 선생님 입력 (2026-10-06)
//
// 마왕님 — «학교일정기간도 선생님들이 넣을 수 있게» · «퇴원위험 알림은 나한테 강하게 오게» ·
//          «내가 직접 내린 업무도 선생님들이 가장 먼저 처리할 수 있게 상단에 크게».
const fs = require("fs"), vm = require("vm");
const html = fs.readFileSync("index.html", "utf8");
const push = fs.readFileSync("api/push.js", "utf8");
const sw = fs.readFileSync("sw.js", "utf8");
const src = /<script>([\s\S]*?)<\/script>/.exec(html)[1];
const stub = `
var firebase={initializeApp:function(c,n){return n?{t:1}:{};},firestore:function(){return {collection:function(){return {doc:function(){return {get:function(){return Promise.resolve({exists:false});},set:function(v,o){__SETS.push({v:v,o:o});return Promise.resolve();}};}};}};},
  auth:()=>({onAuthStateChanged(){},currentUser:null,signOut:()=>Promise.resolve()})};
var __SETS=[];
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
  TODAY = "2026-10-06"; RP_START = "2026-09-14"; RP_WORK_DOWS = {}; RP_SKIP_NAMES = [];
  S.teachers = [ { tid:"T1", name:"한민수", role:"owner", classIds:[] },
                 { tid:"T2", name:"이현우", role:"teacher", classIds:["c2"] },
                 { tid:"T3", name:"정찬준", role:"teacher", classIds:[] } ];
  S.classes = [ { id:"c2", name:"예비고1 S", classDays:[1,2,3,4,5], roster:[ { id:"s1", name:"최하윤", pid:"p1" }, { id:"s2", name:"안유진", pid:"p2" } ] } ];
  S.tasks = []; S.marks = {}; S.events = []; S.reports = {};
  S.claims = { role:"teacher", tid:"T2", name:"이현우" }; S.ro = true;
  __st = function (r, nm) { return r.classes[0].students.filter(function (s) { return s.name === nm; })[0]; };
`);

// ================= 퇴원 위험 — 선생님 쪽 =================
ok("학생 줄에 «퇴원 위험» 체크가 있다 (읽기 계정에서도 살아 있게 RPK)",
  /data-rps="' \+ k \+ '\|risk"' \+ \(s\.risk \? " checked" : ""\) \+ RPK \+ '> 퇴원 위험<\/label>/.test(src));
ok("체크를 누르면 그 학생의 risk 가 바뀐다", /else if \(k\[2\] === "risk"\) i\.onchange = function \(\) \{ s\.risk = i\.checked; re\(\); \};/.test(src));
ok("처음 여는 판은 꺼져 있다", run(`return rpDraft("T2","2026-10-06",null).classes[0].students[0].risk`) === false);
run(`__r = rpDraft("T2","2026-10-06",null);
  __st(__r,"최하윤").att = "출석"; __st(__r,"최하윤").note = "어머니가 다른 학원 상담 다녀옴"; __st(__r,"최하윤").risk = true;
  __st(__r,"안유진").att = "출석";
  __c = rpClean(__r);`);
ok("저장할 모양에 risk 가 남는다", run(`return __st(__c,"최하윤").risk`) === true && run(`return __st(__c,"안유진").risk`) === false);
ok("다시 열면 켜 둔 것이 그대로", run(`return __st(rpDraft("T2","2026-10-06",__c),"최하윤").risk`) === true);
const stopNo = JSON.parse(run(`var r = rpDraft("T2","2026-10-06",null); __st(r,"안유진").risk = true; return JSON.stringify(rpCheck(r));`));
ok("퇴원 위험인데 특이사항이 비면 **못 낸다**", stopNo.stop.some((w) => /퇴원 위험 — 안유진/.test(w)), JSON.stringify(stopNo));
ok("적었으면 막지 않는다", !JSON.parse(run(`return JSON.stringify(rpCheck(__r))`)).stop.some((w) => /퇴원 위험/.test(w)));

// 폰은 «새로 켠 학생» 이 있을 때만
ok("처음 낼 때 켜 둔 학생 → 울린다", JSON.stringify(run(`return rpRiskNew(null, __c)`)) === '["최하윤"]');
ok("고쳐 낼 때 이미 켜져 있던 학생 → 다시 안 울린다",
  run(`return rpRiskNew(Object.assign({ submitted: 1 }, __c), __c).length`) === 0);
ok("고쳐 내면서 새로 켠 학생만 울린다", JSON.stringify(run(`
  var nx = JSON.parse(JSON.stringify(__c)); __st(nx,"안유진").risk = true; __st(nx,"안유진").note = "그만둘까 말함";
  return rpRiskNew(Object.assign({ submitted: 1 }, __c), nx);`)) === '["안유진"]');
ok("saveDailyReport 가 새로 켠 것이 있으면 pingLead(\"risk\", {date})",
  /if \(rpRiskNew\(prev, doc\)\.length\) pingLead\("risk", \{ date: rep\.date \}\);/.test(src));
ok("pingLead 가 날짜를 서버에 넘긴다", /pushApi\("lead", Object\.assign\(\{ kind: kind, leads: leads \}, extra \|\| \{\}\)\)/.test(src));

// ================= 퇴원 위험 — 팀장 쪽 =================
run(`S.reports = { T2: { "2026-10-06": Object.assign({}, __c, { submitted: 1, updated: 1 }) } };`);
ok("선생님 화면에는 빨간 띠가 없다", run(`return riskBannerHtml()`) === "");
run(`S.claims = { role:"owner", tid:"T1", name:"한민수" }; S.ro = false;`);
const band = run(`return riskBannerHtml()`);
ok("팀장 맨 위 — 진한 빨간 띠에 학생 · 반 · 선생님 · 특이사항", /rk-band/.test(band) && /퇴원 위험 1명/.test(band) && /최하윤/.test(band) &&
  /예비고1 S · 이현우 · 10\/6\(화\)/.test(band) && /다른 학원 상담/.test(band), band);
ok("«확인함» · «보고 보기» 단추", /data-rkok="T2\|2026-10-06\|s1"/.test(band) && /data-rkgo="2026-10-06"/.test(band));
ok("안 켠 학생은 안 뜬다", band.indexOf("안유진") < 0);
run(`__SETS.length = 0; riskSee("T2|2026-10-06|s1");`);
ok("«확인함» 을 누르면 띠에서 빠진다", run(`return riskBannerHtml()`) === "");
ok("확인은 marks/<팀장>.riskSeen 에 merge 로 적는다 (done · seenTasks 를 안 지운다)",
  run(`return __SETS.length === 1 && __SETS[0].o && __SETS[0].o.merge === true && !!__SETS[0].v.riskSeen["T2|2026-10-06|s1"] && !__SETS[0].v.done`) === true);
ok("화면은 바로 바뀐다 (S.marks 에도 적힌다)", run(`return !!S.marks.T1.riskSeen["T2|2026-10-06|s1"]`) === true);
ok("맨 위 띠는 어느 메뉴에 있든 — renderBanner 가 붙인다", /el\.innerHTML = rd \+ riskBannerHtml\(\) \+ leadBoxHtml\(\) \+ rpBannerHtml\(\) \+ ro;/.test(src));

const dg = run(`return rpDigest("2026-10-06")`);
ok("원장님 문서(나스 취합) — «(퇴원 위험)»", /- 최하윤 \*\*\(퇴원 위험\)\*\* — .*다른 학원 상담/.test(dg), dg);
ok("받은 보고 표 — «퇴원 위험» 빨간 칩", /\(s\.risk \? '<span class="pill rk">퇴원 위험<\/span> ' : ""\)/.test(src));
const E = JSON.parse(run(`return JSON.stringify(boardEntries(S.reports))`));
ok("학생 한눈에 — 퇴원 위험도 «주의» 로 센다(빨간 점)", E.byPid.p1[0].warn === true && E.byPid.p1[0].risk === true, JSON.stringify(E.byPid.p1));

// 서버 · 서비스 워커
ok("서버 — kind risk 는 보고 문서를 읽어 글을 만든다 (보내는 쪽 글을 안 나른다)",
  /if \(kind === "risk"\)/.test(push) && /getDoc\("dailyReports\/" \+ me \+ "\/days\/" \+ date\)/.test(push) && /s\.risk/.test(push));
ok("서버 — 날짜 모양이 아니면 거절", /if \(!\/\^\\d\{4\}-\\d\{2\}-\\d\{2\}\$\/\.test\(date\)\)/.test(push));
ok("서버 — 강한 알림 표시(strong)", /title: "🚨 퇴원 위험"[^}]*strong: true/.test(push));
ok("서비스 워커 — strong 이면 닫을 때까지 남고 길게 떤다", /if \(d\.strong\) \{ opt\.requireInteraction = true; opt\.vibrate = \[/.test(sw));

// ================= 팀장 지시 — 선생님 맨 위 =================
run(`S.claims = { role:"teacher", tid:"T2", name:"이현우" }; S.ro = true; S.marks = {};
  S.tasks = [
    { id:"a", text:"디스쿨 강사회원 신청", who:"이현우", due:"2026-10-07", status:"open" },
    { id:"b", text:"카카오채널 가입 안내", who:"이현우 · 정찬준", due:"2026-10-05", status:"open" },
    { id:"c", text:"내가 적은 메모", who:"이현우", own:"T2", due:"2026-10-01", status:"open" },
    { id:"d", text:"초안", who:"이현우", draft:true, status:"open" },
    { id:"e", text:"교재 업로드", who:"이현우", repeat:{ dow:[0,3] }, status:"open" },
    { id:"f", text:"팀장이 닫은 것", who:"이현우", status:"done" },
    { id:"g", text:"정찬준 것", who:"정찬준", status:"open" },
    { id:"h", text:"반별 한 달 운영 방향 보고", who:"이현우", due:"2026-10-06", status:"open", report:true },
    { id:"i", text:"기한 없는 일", who:"이현우", status:"open" }
  ];`);
const mine = JSON.parse(run(`return JSON.stringify(leadTasksMine().map(function (t) { return t.id; }))`));
ok("팀장이 내린 내 몫만 — 내 메모 · 초안 · 매주 하는 일 · 닫힌 것 · 남의 것은 뺀다", JSON.stringify(mine) === '["b","h","a","i"]', JSON.stringify(mine));
ok("기한 순, 기한 없는 것은 맨 뒤", mine[0] === "b" && mine[mine.length - 1] === "i");
const box = run(`return leadBoxHtml()`);
ok("맨 위 큰 상자 — «팀장 지시 4건»", /lead-box/.test(box) && /📌 팀장 지시 <span class="lb-n">4건<\/span>/.test(box), box.slice(0, 300));
ok("기한 지난 줄은 빨갛게", /lb-row late"><div class="lb-t">카카오채널 가입 안내/.test(box) && /기한 지남/.test(box));
ok("«내 완료» 단추가 그 자리에 (읽기 계정에서도 data-keep)", /data-keep data-mk="a"/.test(box));
ok("보고받는 일은 그 자리에서 한 줄 적어 낸다", /data-rep-in="h"/.test(box) && /data-rep="h"/.test(box));
run(`S.marks = { T2: { done: { a: "2026-10-06" } } };`);
ok("«내 완료» 를 누른 것은 빠진다", JSON.stringify(JSON.parse(run(`return JSON.stringify(leadTasksMine().map(function (t) { return t.id; }))`))) === '["b","h","i"]');
run(`S.tasks = S.tasks.concat([1,2,3,4,5].map(function (n) { return { id:"x" + n, text:"일 " + n, who:"이현우", due:"2026-10-2" + n, status:"open" }; }));`);
const many = run(`return leadBoxHtml()`);
ok("여섯 건까지 보이고 나머지는 «할 일에서 보기»", (many.match(/class="lb-row/g) || []).length === 6 && /그 밖에 2건 — 할 일에서 보기/.test(many), String((many.match(/class="lb-row/g) || []).length));
run(`S.claims = { role:"owner", tid:"T1", name:"한민수" }; S.ro = false;`);
ok("팀장 화면에는 안 뜬다 (내린 사람이다)", run(`return leadBoxHtml()`) === "");
ok("할 일 · 완료 표시가 바뀌면 상자도 다시 (적는 중이면 건너뛴다)",
  /renderTasksSafe\(\);\r?\n  renderBannerSafe\(\);/.test(src) && /renderTasksSafe\(\); renderDone\(\); renderExec\(\); renderBannerSafe\(\);/.test(src));

// ================= 학교 일정 — 선생님도 넣는다 =================
ok("학교 일정 칸에 data-keep (읽기 계정에서 안 잠긴다)", /data-f="' \+ f \+ '" value="' \+ esc\(v\[f\] \|\| ""\) \+ '" data-keep>/.test(src));
ok("고친 칸은 passWrite 로 저장 — 선생님 쓰기 문턱을 이 자리만 지나간다",
  /await passWrite\(function \(\) \{ return saveSchoolTerm\(S\.term, kk\[0\], kk\[1\], patch\); \}\);/.test(src));
ok("누가 고쳤는지 남긴다", /patch\.by = myName\(\);/.test(src));
ok("찾아오기 · 붙여넣기는 그대로 팀장 것 (단추에 data-keep 없음)", /'<button class="mini" id="tm-pull">시험 기간 찾아오기<\/button>'/.test(src));

console.log(T.join("\n"));
const bad = T.filter((x) => x.indexOf("FAIL") === 0).length;
console.log(bad ? "\n" + bad + "건 실패" : "\n전부 통과 (" + T.length + "건)");
process.exit(bad ? 1 : 0);
