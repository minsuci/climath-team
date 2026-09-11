// 계정이 바뀔 때 앞사람 자료가 남지 않는가 (2026-09-11).
//
// 팀장이 로그아웃하고 같은 창에서 선생님으로 들어가니 간부회의록이 보였다. 새로고침하면 사라졌다.
// 규칙은 막고 있었다 — 회의록을 «처음 한 번만» 읽어서 팀장이 읽어 둔 S.minutes 를 그대로 썼다.
// 고친 것: 로그아웃은 새로 열기까지, boot() 은 다른 사람이면 새로 연다.
const fs = require("fs"), vm = require("vm");
const html = fs.readFileSync("index.html", "utf8");
const src = /<script>([\s\S]*?)<\/script>/.exec(html)[1];
const AUTH = { c: null, t: null };
const stub = `
var firebase={initializeApp:function(c,n){return n?{t:1}:{};},firestore:function(){return {collection:function(){return {doc:function(){return {get:function(){return Promise.resolve({exists:false});}};}};}};},
  auth:function(app){ return { onAuthStateChanged(){}, get currentUser(){ return app && app.t ? AUTH.t : AUTH.c; }, signOut:()=>Promise.resolve() }; } };
var document={querySelector:()=>null,querySelectorAll:()=>[],addEventListener(){}};
var window={addEventListener(){},scrollTo(){}},history={replaceState(){}},localStorage={getItem:()=>null,setItem(){}};
var RELOADS=0; var location={hash:"",reload:function(){RELOADS++;}};
var fetch=()=>Promise.reject(new Error("no net")); var alert=function(){},confirm=()=>true,prompt=()=>null;
`;
const ctx = vm.createContext({ console, setTimeout, clearTimeout, Date, Math, JSON, Object, Array, String, Number, Promise, RegExp, isNaN, parseInt, AUTH });
vm.runInContext(stub + "\n" + src, ctx);
const run = (code) => vm.runInContext("(function(){" + code + "})()", ctx);
const T = [];
const ok = (n, c, e) => T.push((c ? "  OK  " : "FAIL  ") + n + (e ? "   " + e : ""));

// 부팅의 무거운 곳은 비운다. 보는 것은 «누구로 부팅했나» 와 «새로 열었나» 뿐이다.
run(`
  SHELL = 0;
  loadCore = function () { return Promise.resolve(); }; renderShell = function () { SHELL++; };
  initNewTasks = renderBell = watchTasks = renderAll = loadSheetsAll = checkRosterSheet = function () {};
  loadReports = loadExams = loadScores = function () { return Promise.resolve(); };
  renderLogin = function () {};
`);
const user = (claims) => ({ getIdTokenResult: () => Promise.resolve({ claims }) });
const OWNER = { role: "owner", tid: "T1", name: "한민수" }, TEACHER = { role: "teacher", tid: "T2", name: "이현우" };

(async () => {
  AUTH.c = user(OWNER); AUTH.t = {};
  await run(`return boot()`);
  ok("팀장으로 부팅", run(`return S.claims.tid`) === "T1" && run(`return RELOADS`) === 0);
  run(`S.minutes = [{ id:"2026-09-07 간부회의", kind:"간부회의", open:false }];`);

  // 같은 창에서 선생님으로
  AUTH.c = user(TEACHER);
  await run(`return boot()`);
  ok("다른 사람으로 부팅하면 페이지를 새로 연다", run(`return RELOADS`) === 1, "reload " + run(`return RELOADS`));
  ok("새로 열기 전에 앞사람 자료로 화면을 그리지 않는다", run(`return S.claims.tid`) === "T1" && run(`return SHELL`) === 1,
    "claims " + run(`return S.claims.tid`) + " · 뼈대 " + run(`return SHELL`));

  // 같은 사람이 다시 부팅(토큰 갱신 따위)하면 새로 열 필요가 없다
  AUTH.c = user(OWNER);
  await run(`return boot()`);
  ok("같은 사람이면 새로 열지 않는다", run(`return RELOADS`) === 1);

  // 로그아웃 단추 — 새로 열기까지
  const btn = /\$\("#btn-out"\)\.onclick\s*=\s*function\s*\(\)\s*\{([^}]*\}[^}]*)\}/.exec(src);
  ok("로그아웃 단추는 로그아웃 뒤 페이지를 새로 연다", !!btn && /signOutAll\(\)/.test(btn[1]) && /location\.reload\(\)/.test(btn[1]), btn && btn[1]);

  console.log(T.join("\n"));
  const bad = T.filter((x) => x.startsWith("FAIL")).length;
  console.log(bad ? "\n실패 " + bad + "건" : "\n전부 통과 (" + T.length + "건)");
  process.exit(bad ? 1 : 0);
})().catch((e) => { console.log(T.join("\n")); console.log("\n시험이 도중에 터졌다: " + e.message); process.exit(1); });
