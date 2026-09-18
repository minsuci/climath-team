// 업무보고 팀장 코멘트 (2026-09-18 마왕님 «선생님들이 업무보고 올린거 보고 내가 코멘트를 달면 선생님들이 볼 수 있도록 하자. 그리고 알림에 코멘트 달렸다고 뜨게해»)
//
// 팀장이 받은 보고에 코멘트 → 서버(api/push.js want=comment)가 leadNotes 칸만 고치고 그 선생님 폰을 울린다
// → 선생님 종에 «업무보고 코멘트» → 그 날 보고를 열면 leadSeen 이 적혀 꺼지고, 팀장 쪽에 «읽음».
const fs = require("fs"), vm = require("vm");
const html = fs.readFileSync("index.html", "utf8");
const src = /<script>([\s\S]*?)<\/script>/.exec(html)[1];
const api = fs.readFileSync("api/push.js", "utf8");
const stub = `
var __writes = [];
var __doc = function (path) { return { get:function(){return Promise.resolve({exists:false});}, collection:function(c){ return __col(path + "/" + c); },
  set:function(d,o){ __writes.push({ path:path, d:JSON.parse(JSON.stringify(d)), o:o||null }); return Promise.resolve(); } }; };
var __col = function (path) { return { doc:function(id){ return __doc(path + "/" + id); },
  collection:function(c){ return __col(path + "/" + c); }, where:function(){ return { get:function(){ return Promise.resolve({ forEach(){} }); } }; } }; };
var firebase={initializeApp:function(c,n){return n?{t:1}:{};},firestore:function(){return {collection:function(c){return __col(c);}};},
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

// ---- 서버: leadNotes 고치기 (순수 함수) ----
const fnSrc = /export function applyLeadNote[\s\S]*?\n\}\r?\n/.exec(api)[0].replace("export ", "");
const applyLeadNote = new Function(fnSrc + "; return applyLeadNote;")();
const a1 = applyLeadNote(undefined, { text: "  진도 좋습니다  " }, 1000, "한민수");
ok("첫 코멘트 — 글은 다듬고 때·쓴 사람이 붙는다", a1.length === 1 && a1[0].text === "진도 좋습니다" && a1[0].at === 1000 && a1[0].by === "한민수" && /^n/.test(a1[0].id), JSON.stringify(a1));
const a2 = applyLeadNote(a1, { text: "과제 확인 부탁" }, 2000, "한민수");
ok("다음 코멘트는 뒤에 붙고 앞의 것은 그대로", a2.length === 2 && a2[0].id === a1[0].id && a2[1].text === "과제 확인 부탁");
ok("지우기 — 그 id 만 빠진다", JSON.stringify(applyLeadNote(a2, { del: a1[0].id }, 3000, "")) === JSON.stringify([a2[1]]));
let threw = ""; try { applyLeadNote(a2, { text: "   " }, 1, ""); } catch (e) { threw = e.message; }
ok("빈 코멘트는 거절", /비었/.test(threw));
threw = ""; try { applyLeadNote(Array.from({ length: 30 }, (_, i) => ({ id: "x" + i, text: "a" })), { text: "b" }, 1, ""); } catch (e) { threw = e.message; }
ok("한 보고에 30개까지", /30개/.test(threw));
ok("1000자에서 자른다", applyLeadNote([], { text: "가".repeat(1200) }, 1, "")[0].text.length === 1000);

// ---- 서버: 문 ----
ok("팀장만 단다", /if \(want === "comment"\) \{\s*if \(role !== "owner"\)/.test(api));
ok("안 낸 보고에는 못 단다", /if \(!rep \|\| !rep\.submitted\) \{ res\.status\(404\)/.test(api));
ok("leadNotes 칸 하나만 고친다 (선생님이 쓴 칸은 그대로)", /patchDoc\(path, \{ leadNotes: notes \}, \["leadNotes"\]\)/.test(api));
ok("달 때만 그 선생님 폰을 울린다 — 지울 때·내 보고엔 안 울린다", /if \(!body\.del && tid !== me\) \{[\s\S]*?sendTo\(tid, \{ title: "업무보고에 코멘트"/.test(api));
ok("tid·날짜 모양을 본다 (경로에 아무거나 못 넣게)", /\/\^\[A-Za-z0-9_-\]\{1,40\}\$\/\.test\(tid\)/.test(api) && /\\d\{4\}-\\d\{2\}-\\d\{2\}/.test(api));

// ---- 다시 내도 코멘트가 안 지워진다 ----
ok("보고 저장은 merge — 서버가 쓴 leadNotes·leadSeen 을 덮지 않는다", /rpCol\(tid\)\.doc\(rep\.date\)\.set\(doc, \{ merge: true \}\)/.test(src));
ok("rpClean 에는 leadNotes 가 없다 (merge 가 옛 칸을 건드릴 일이 없다)", !/leadNotes/.test(/function rpClean[\s\S]*?\n\}/.exec(src)[0]));

// ---- 선생님 쪽 ----
run(`
  TODAY = "2026-09-18"; RP_START = "2026-09-14"; RP_WORK_DOWS = {}; RP_SKIP_NAMES = [];
  S.teachers = [ { tid:"T2", name:"이현우", role:"teacher", classIds:[] }, { tid:"T1", name:"한민수", role:"owner", classIds:[] } ];
  S.classes = []; S.tasks = []; S.marks = {}; S.events = []; S.newIds = []; S.newSeen = true;
  S.claims = { role:"teacher", tid:"T2", name:"이현우" }; S.ro = true;
  S.reports = { T2: {
    "2026-09-16": { submitted:1, leadNotes:[ { id:"a", text:"옛 것", at:100, by:"한민수" } ], leadSeen:100 },
    "2026-09-17": { submitted:1, leadNotes:[ { id:"b", text:"과제 확인 부탁", at:500, by:"한민수" }, { id:"c", text:"잘했어요", at:600, by:"한민수" } ], leadSeen:500 },
    "2026-09-15": { submitted:1, leadNotes:[ { id:"d", text:"상담 기록 남겨 주세요", at:700, by:"한민수" } ] },
    "2026-09-14": { submitted:1 } } };
`);
ok("안 읽은 코멘트가 있는 날 — 최근 것부터", run(`return rpNoteDates().join(",")`) === "2026-09-17,2026-09-15", run(`return rpNoteDates().join(",")`));
ok("종 숫자 — 안 읽은 코멘트 수 (9/17 은 하나만 새것)", run(`return rpNoteBellN()`) === 2);
const mine = run(`return rpNotesMineHtml(S.reports.T2["2026-09-17"])`);
ok("선생님 화면 — 팀장 코멘트 둘 다 보이고 새것에만 «새»", /팀장 코멘트/.test(mine) && /과제 확인 부탁/.test(mine) && /<b>새<\/b> 잘했어요/.test(mine) && !/<b>새<\/b> 과제/.test(mine), mine);
ok("코멘트 없는 보고엔 아무것도 안 그린다", run(`return rpNotesMineHtml(S.reports.T2["2026-09-14"])`) === "");
run(`__writes.length = 0; rpMarkNotesSeen("2026-09-17");`);
ok("그 날 보고를 열면 leadSeen 이 가장 늦은 코멘트 때로", run(`return S.reports.T2["2026-09-17"].leadSeen`) === 600);
ok("…종에서 빠진다", run(`return rpNoteDates().join(",")`) === "2026-09-15" && run(`return rpNoteBellN()`) === 1);
const w = JSON.parse(run(`return JSON.stringify(__writes)`));
ok("적는 것은 내 문서의 leadSeen 한 칸만 (merge)", w.length === 1 && /dailyReports\/T2\/days\/2026-09-17$/.test(w[0].path) && JSON.stringify(w[0].d) === '{"leadSeen":600}' && w[0].o && w[0].o.merge === true, JSON.stringify(w));
run(`__writes.length = 0; rpMarkNotesSeen("2026-09-17"); rpMarkNotesSeen("2026-09-14");`);
ok("이미 읽었거나 코멘트가 없으면 안 적는다", run(`return __writes.length`) === 0);
ok("내 보고 화면 머리에 코멘트 · 열면 읽음으로", /rpNotesMineHtml\(saved\);[\s\S]{0,400}rpMarkNotesSeen\(d\);/.test(src));
ok("다른 날 새 코멘트로 가는 단추 (읽기 계정에서도 눌리게 data-keep)", /data-rpngo="' \+ x \+ '"' \+ RPK/.test(src));

// ---- 종 ----
ok("종 숫자에 코멘트가 더해진다", /\+ \(diffUnseen\(\) \? 1 : 0\) \+ rpNoteBellN\(\);/.test(src));
ok("종 줄을 누르면 그 날 내 보고로", /data-bell-rpn[\s\S]{0,300}S\.rpDate = b\.getAttribute\("data-bell-rpn"\); S\.rpTab = "mine"[\s\S]{0,80}showPage\("report"\)/.test(src));
ok("종을 여는 것(markTasksSeen)으로는 코멘트가 안 꺼진다", !/leadSeen/.test(/function markTasksSeen[\s\S]*?\n\}/.exec(src)[0]));
ok("앱을 연 채로도 — 내 보고 칸을 지켜본다", /rpCol\(myTid\(\)\)\.where\("date", ">=", addDays\(TODAY, -21\)\)[\s\S]{0,120}on\(myRp,/.test(src));

// ---- 팀장 쪽 ----
run(`S.claims = { role:"owner", tid:"T1", name:"한민수" }; S.ro = false;`);
const lead = run(`return rpNotesLeadHtml("T2", "2026-09-17", { submitted:1, leadNotes:[ { id:"b", text:"과제 확인", at:500 }, { id:"c", text:"잘했어요", at:600 } ], leadSeen:500 })`);
ok("팀장 카드 — 읽은 것 «읽음», 아닌 것 «안 읽음»", /과제 확인[\s\S]*?읽음<\/span>/.test(lead) && /잘했어요[\s\S]*?안 읽음/.test(lead), lead);
ok("팀장 카드 — 적는 칸 · 달기 · 지우기", /data-rpnt="T2"/.test(lead) && /data-rpnadd="T2"/.test(lead) && /data-rpndel="T2\|c"/.test(lead));
ok("내 보고 카드엔 코멘트 칸이 없다", run(`return rpNotesLeadHtml("T1", "2026-09-17", { submitted:1 })`) === "");
ok("받은 보고 카드 끝에 붙고, 그린 뒤 단추를 잇는다", /\+ rpNotesLeadHtml\(tid, d, rep\) \+ '<\/div>';\s*\}\);\s*box\.innerHTML = h;\s*rpNotesWire\(box, d\);/.test(src));
ok("달기 — 서버로 (브라우저로는 남의 보고를 못 쓴다)", /pushApi\("comment", \{ tid: tid, date: d, text: text \}\)/.test(src));

T.forEach((l) => console.log(l));
const bad = T.filter((l) => l.startsWith("FAIL")).length;
console.log(bad ? "\n" + bad + "개 실패" : "\n모두 통과 (" + T.length + ")");
process.exit(bad ? 1 : 0);
