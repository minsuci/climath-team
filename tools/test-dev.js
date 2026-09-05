// 개발 현황 — 커밋 한 줄을 기능·고침·문서·손질로 가르는 것.
//
// 분류가 틀리면 화면이 거짓말을 한다 ("이번 주 고침 0건"). 진짜 커밋 메시지로 시험한다.
// 메시지가 뭉뚱그려져 있으면 어차피 못 가른다 — 그건 규칙(커밋 한 줄 쓰기)으로 푼다.
const fs = require("fs"), vm = require("vm");
const src = /<script>([\s\S]*?)<\/script>/.exec(fs.readFileSync("index.html", "utf8"))[1];

const SAVED = [];
const teamDb = { collection: () => ({ doc: () => ({
  set: (d) => { SAVED.push(JSON.parse(JSON.stringify(d))); return Promise.resolve(); },
  get: () => Promise.resolve({ exists: false }) }),
  get: () => Promise.resolve({ forEach() {} }) }) };
const stub = `
var firebase={initializeApp:function(c,n){return n?{t:1}:{};},firestore:function(app){return app?TEAMDB:CLASSDB;},
  auth:()=>({onAuthStateChanged(){},currentUser:null,signOut:()=>Promise.resolve()})};
var document={querySelector:()=>null,querySelectorAll:()=>[],addEventListener(){}};
var window={addEventListener(){},scrollTo(){}},location={hash:""},history={replaceState(){}},localStorage={getItem:()=>null,setItem(){}};
var fetch=()=>Promise.reject(new Error("no net")); var alert=function(){},confirm=()=>true,prompt=()=>null;
`;
const ctx = vm.createContext({ console, setTimeout, clearTimeout, Date, Math, JSON, Object, Array, String, Number,
  Promise, RegExp, isNaN, parseInt, TEAMDB: teamDb, CLASSDB: { collection: () => ({ doc: () => ({ get: () => Promise.resolve({ exists: false }) }) }) } });
vm.runInContext(stub + "\n" + src, ctx);
const run = (code) => vm.runInContext("(function(){" + code + "})()", ctx);
const T = [];
const ok = (n, c, e) => T.push((c ? "  OK  " : "FAIL  ") + n + (e ? "   " + e : ""));
const kind = (m) => run("return devKind(" + JSON.stringify(m) + ")");

// ---- 진짜 커밋 메시지 (2026-09-04~05, 두 저장소) ----
const CASES = [
  ["학생 PIN 초기화 단추 — 앱과 같은 것", "feat"],
  ["로그인이 막히던 것 — 지운 함수를 boot 이 계속 불렀다", "fix"],
  ["구글시트를 «근거 자료» 로 다시 짬", "feat"],
  ["회의록 메뉴 — 볼트에 쓰면 자동으로 올라간다", "feat"],
  ["머리띠의 안내문 링크를 뺀다", "chore"],
  ["업무 달력에서 학교 내신 일정을 뺀다 · 막대 글씨 잘림", "fix"],
  ["겹치는 시험은 한 막대로 묶는다", "feat"],
  ["업무 달력에 월간 달력을 얹는다", "feat"],
  ["CLAUDE.md — 학교일정과 채우기는 여기서만", "docs"],
  ["학사일정을 못 찾은 이유를 화면에 보여준다", "feat"],
  ["반이 없어도 PIN 을 바꿀 수 있게 — 같은 뿌리의 네 번째", "fix"],
  ["반에 아직 안 넣은 학생도 로그인되게", "fix"],
  ["학생 명단에서 «이 화면은 뭔가요?» 상자를 뺀다", "chore"],
  ["학교일정을 대시보드로 넘긴다 — 앱에서 뺀다", "chore"],
  ["달력 그림이 배너에 밀려 AI에게 안 가던 것 (서운중)", "fix"],
  ["학사일정을 그림으로 붙여둔 학교 읽기 (서운중)", "feat"],
  ["운영DB 주소·토큰을 환경변수 없이도 넣을 수 있게", "fix"],
  ["fix: login loop on refresh", "fix"],
  ["docs: readme", "docs"],
  ["Update index.html", "feat"],     // 뭉뚱그린 메시지는 기본값으로 간다 — 그래서 규칙이 필요하다
];
CASES.forEach(([m, want]) => { const got = kind(m); ok("«" + m + "» → " + want, got === want, "got " + got); });

// ---- «못 …» 은 «못 …던» 일 때만 고침이다. «못 찾은 이유를 보여준다» 는 기능이다 ----
ok("«못 잡던» 은 고침", kind("동명이인을 못 잡던 것") === "fix");
ok("«못 읽던» 도 고침", kind("병합 셀을 못 읽던 시트") === "fix");

// ---- 제목 — 덧붙임 가르기 ----
const sp = (m) => JSON.parse(run("return JSON.stringify(devSplit(" + JSON.stringify(m) + "))"));
ok("— 로 가른다", JSON.stringify(sp("제목 — 덧붙임")) === '["제목","덧붙임"]');
ok("— 없으면 통째", JSON.stringify(sp("제목만")) === '["제목만",""]');
ok("첫 — 에서만 가른다", JSON.stringify(sp("a — b — c")) === '["a","b — c"]');

// ---- 깃허브 주소 읽기 ----
const rf = (s) => JSON.parse(run("return JSON.stringify(repoFrom(" + JSON.stringify(s) + "))"));
ok("주소창 주소", JSON.stringify(rf("https://github.com/minsuci/climath-team")) === '{"owner":"minsuci","repo":"climath-team"}');
ok(".git 붙어도", JSON.stringify(rf("https://github.com/minsuci/climath-team.git")) === '{"owner":"minsuci","repo":"climath-team"}');
ok("커밋 페이지 주소를 줘도", JSON.stringify(rf("https://github.com/minsuci/climath-team/commits/main")) === '{"owner":"minsuci","repo":"climath-team"}');
ok("owner/repo 만", JSON.stringify(rf("minsuci/climath-class")) === '{"owner":"minsuci","repo":"climath-class"}');
ok("엉뚱한 건 null", rf("https://vercel.com/x") === null);
ok("빈 건 null", rf("") === null);

// ---- 기간 세기 ----
const cnt = run(`
  var cs = [{date:"2026-09-05",kind:"feat"},{date:"2026-09-01",kind:"fix"},{date:"2026-08-01",kind:"docs"}];
  return JSON.stringify([devCount(cs, "2026-09-01"), devCount(cs, "")]);
`);
ok("기간 안만 센다", cnt === '[{"total":2,"feat":1,"fix":1,"docs":0,"chore":0},{"total":3,"feat":1,"fix":1,"docs":1,"chore":0}]', cnt);

// ---- 저장소 목록 — 없으면 기본, 저장은 repos 만 merge ----
ok("설정에 없으면 기본 목록 — 주소 있는 것은 내 둘", run("S.config={sources:{}}; return reposOf().filter(function(r){return !repoPending(r)}).length") === 2);
ok("빈 배열이어도 기본", run("S.config={repos:[]}; return reposOf()[0].key") === "class");
run(`saveRepos([{key:"a__b",app:"x",who:"y",owner:"a",repo:"b",url:""}])`);
ok("저장은 repos 만 merge 로", SAVED.length === 1 && SAVED[0].repos && SAVED[0].repos.length === 1 && !("sources" in SAVED[0]), JSON.stringify(SAVED));
ok("저장 뒤 목록이 바뀐다", run("return reposOf()[0].key") === "a__b");
// 근거 자료의 saveConfig 가 repos 를 지우지 않는다 (merge: true 에 sources 만 넘긴다)
run(`saveConfig()`);
ok("근거 자료 저장이 repos 를 안 건드린다", SAVED.length === 2 && !("repos" in SAVED[1]), JSON.stringify(SAVED[1]));

// ---- 카드가 div 를 닫는다 — 안 닫으면 다음 카드가 안으로 들어가 위아래 관계처럼 보인다 (2026-09-05에 그랬다) ----
const card = run(`S.devDays=14; return devCardHtml({cfg:{key:"t",app:"앱",who:"한민수",owner:"minsuci",repo:"r",url:"https://x"},err:"",commits:[{sha:"a",short:"a",date:"2026-09-05",kind:"feat"}],deploy:{sha:"a",short:"a",date:"2026-09-05"},description:"d"},"2026-08-22")`);
ok("카드가 연 div 를 다 닫는다", (card.match(/<div/g) || []).length === (card.match(/<\/div>/g) || []).length);
const cardErr = run(`return devCardHtml({cfg:{key:"t",app:"앱",who:"한민수",owner:"a",repo:"r"},err:"못 읽음",commits:[],deploy:null},"")`);
ok("못 읽은 카드도 다 닫는다", (cardErr.match(/<div/g) || []).length === (cardErr.match(/<\/div>/g) || []).length);
// ---- 저장소 주인이 커밋한 건 이름을 안 적는다 ----
const row = (a) => run("S.devApp=''; return devRowHtml({msg:'x',kind:'feat',app:'앱',who:'한민수',owner:'minsuci',author:" + JSON.stringify(a) + ",short:'abc',url:'u'})");
ok("주인 계정 커밋엔 이름 없음", row("minsuci").indexOf("minsuci ·") < 0);
ok("남이 커밋하면 이름이 붙는다", row("someone").indexOf("someone ·") >= 0);

// ---- 저장소 주소 없는 것 — 카드는 뜨되 깃허브는 안 부른다 ----
ok("기본 목록엔 주소 없는 것이 없다 — 받으면 그때 넣는다", run("S.config={}; return reposOf().filter(repoPending).length") === 0);
ok("주소 있는 건 pending 이 아니다", run("return repoPending({owner:'a',repo:'b'})") === false);
ok("owner 만 있어도 pending", run("return repoPending({owner:'a',repo:''})") === true);
const pend = run(`
  S.config={repos:[{key:"p",app:"학생 관리",who:"박준성",owner:"",repo:""},{key:"q",app:"x",who:"y",owner:"a",repo:"b"}]};
  var calls=0; githubApi=function(){ calls++; return Promise.reject(new Error("막힘")); };
  return loadDev().then(function(out){ return JSON.stringify({calls:calls, p:out[0].pending, pe:out[0].err, q:!!out[1].pending, qe:out[1].err}); });
`);
return pend.then((j) => {
  ok("주소 없는 건 깃허브를 안 부르고, 있는 것만 부른다", j === '{"calls":1,"p":true,"pe":"","q":false,"qe":"막힘"}', j);
  const c = run(`return devCardHtml({cfg:{key:"p",app:"학생 관리",who:"박준성",owner:"",repo:"",note:"설명"},pending:true,err:"",commits:[],deploy:null},"")`);
  ok("주소 없는 카드가 «저장소 주소 없음» 을 달고 div 를 다 닫는다", c.indexOf("저장소 주소 없음") >= 0 && (c.match(/<div/g) || []).length === (c.match(/<\/div>/g) || []).length);
  ok("담당 후보에 앱 선생님과 적힌 이름이 다 든다", run(`S.teachers=[{name:"이현우"}]; S.config={repos:[{key:"k",app:"x",who:"김효상",owner:"",repo:""}]}; var n=devWhoNames(); return n.indexOf("이현우")>=0 && n.indexOf("김효상")>=0 && n.length===2`) === true);

  // ---- 나스 쪽 합치기 (devAssemble) — 깃허브 카드 + 도구보고 + 일지 줄 ----
  const asm = (code) => JSON.parse(run(`
    var results = [
      { cfg:{key:"class",app:"수업관리 앱",who:"한민수",owner:"minsuci",repo:"climath-class",tool:"2026-09-04_한민수_학생앱",alias:"학생앱"}, err:"",
        commits:[{sha:"a1",short:"a1",date:"2026-09-05",msg:"학생 PIN 초기화",author:"minsuci",url:"u"}], deploy:null },
      { cfg:{key:"team",app:"한민수 대시보드",who:"한민수",owner:"minsuci",repo:"climath-team",tool:"",alias:"대시보드"}, err:"", commits:[], deploy:null },
    ];
    var tools = [
      { id:"2026-09-04_한민수_학생앱", who:"한민수", app:"CLIMATH 수업관리 (학생용 웹앱)", date:"2026-09-04", title:"도구보고 — 한민수 학생용 앱" },
      { id:"2026-09-11_정찬준_학생관리", who:"정찬준", app:"학생 관리 + 문제은행", date:"2026-09-11", title:"" },
    ];
    var logs = [
      { id:"l1", date:"2026-09-05", who:"한민수", app:"학생앱", msg:"운영DB 보내기 화면을 붙임", file:"업무기록/2026/2026-09-05_한민수.md" },
      { id:"l2", date:"2026-09-05", who:"한민수", app:"대시보드", msg:"개발 현황 메뉴", file:"업무기록/2026/2026-09-05_한민수.md" },
      { id:"l3", date:"2026-09-12", who:"정찬준", app:"학생관리", msg:"주간 리포트가 안 나가던 것", file:"업무기록/2026/2026-09-12_정찬준.md" },
      { id:"l4", date:"2026-09-12", who:"이현우", app:"질문앱", msg:"첫 화면", file:"업무기록/2026/2026-09-12_이현우.md" },
    ];
    var cards = devAssemble(results, tools, logs);
    ${code}
  `));
  const cards = asm("return JSON.stringify(cards.map(function(c){ return { key:c.cfg.key, who:c.cfg.who, app:c.cfg.app, nas:!!c.nas, tool:c.tool?c.tool.id:'', n:c.commits.length, srcs:c.commits.map(function(x){return x.src}).join(',') }; }))");
  const by = (k) => cards.filter((c) => c.key === k)[0];
  ok("도구보고가 설정의 tool 로 깃허브 카드에 붙는다", by("class") && by("class").tool === "2026-09-04_한민수_학생앱", JSON.stringify(by("class")));
  ok("일지 줄이 별칭으로 깃허브 카드에 붙는다 (학생앱 → 수업관리 앱)", by("class").n === 2 && by("class").srcs === "github,nas");
  ok("대시보드 별칭도 붙는다", by("team").n === 1 && by("team").srcs === "nas");
  const jcj = cards.filter((c) => c.who === "정찬준");
  ok("도구보고만 있는 사람은 «나스로만» 카드 하나", jcj.length === 1 && jcj[0].nas && jcj[0].tool === "2026-09-11_정찬준_학생관리", JSON.stringify(jcj));
  ok("일지 줄이 도구보고 파일 이름 꼬리(학생관리)로 그 카드에 붙는다", jcj[0].n === 1);
  const lhw = cards.filter((c) => c.who === "이현우");
  ok("도구보고도 없이 일지 줄만 있으면 그 이름으로 카드가 생긴다", lhw.length === 1 && lhw[0].nas && lhw[0].app === "질문앱" && lhw[0].n === 1);
  ok("카드는 넷", cards.length === 4, String(cards.length));
  ok("나스 줄도 종류가 갈린다", asm("return JSON.stringify(cards.filter(function(c){return c.cfg.who==='정찬준'})[0].commits[0].kind)") === "fix");
  ok("같은 사람이 아니면 별칭이 같아도 안 붙는다", JSON.stringify(asm(`
    var c2 = devAssemble([{cfg:{key:"x",app:"학생앱",who:"박준성",owner:"a",repo:"b"},err:"",commits:[],deploy:null}], [], [{id:"z",date:"2026-09-05",who:"한민수",app:"학생앱",msg:"m",file:"f"}]);
    return JSON.stringify(c2.map(function(c){return c.cfg.who+":"+c.commits.length}))`)) === '["박준성:0","한민수:1"]');
  const nasCard = run(`return devCardHtml({cfg:{key:"nas:a",app:"질문앱",who:"이현우",owner:"",repo:"",url:"",note:""},nas:true,err:"",commits:[{src:"nas",date:"2026-09-12",kind:"feat",msg:"첫 화면"}],deploy:null},"")`);
  ok("나스로만 카드가 «나스로만» 을 달고 div 를 다 닫는다", nasCard.indexOf("나스로만") >= 0 && (nasCard.match(/<div/g) || []).length === (nasCard.match(/<\/div>/g) || []).length);
  const nasRow = run(`S.devApp=''; return devRowHtml({src:"nas",msg:"첫 화면 — 설명",kind:"feat",app:"질문앱",who:"이현우",file:"업무기록/2026/2026-09-12_이현우.md",short:"",url:""})`);
  ok("나스 줄은 링크 없이 일지 파일 이름이 붙는다", nasRow.indexOf("<a ") < 0 && nasRow.indexOf("2026-09-12_이현우") >= 0 && nasRow.indexOf("설명") >= 0);
  ok("앱 이름 대조는 띄어쓰기·기호를 무시한다", run(`return normApp("학생 앱") === normApp("학생앱") && normApp("CLIMATH 수업관리 (학생용 웹앱)") === "climath수업관리학생용웹앱"`) === true);
  finish();
});

function finish() {
console.log(T.join("\n"));
const bad = T.filter((x) => x.startsWith("FAIL")).length;
console.log(bad ? "\n실패 " + bad + "건" : "\n전부 통과 (" + T.length + "건)");
process.exit(bad ? 1 : 0);
}
