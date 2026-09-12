// 새벽에 저 혼자 도는 수학시험 날짜 찾기 (2026-09-13).
//
// ⚠ 여기서 제일 중요한 것은 **안 하는 것들**이다:
//   AI 를 안 부르고, 저장을 안 하고, 찾은 것이 없으면 알림을 안 보내고, 같은 것을 두 번 안 알린다.
//   하나라도 무너지면 «알림을 꺼 버리는» 쪽으로 간다. 그러면 기능이 통째로 없는 것과 같다.
const fs = require("fs"), vm = require("vm"), crypto = require("crypto");

const csrc = fs.readFileSync(__dirname + "/../api/cron.js", "utf8")
  .replace(/^import .*;$/gm, "")
  .replace(/^export default /gm, "").replace(/^export (const |let |async |function )/gm, "$1");

const T = [];
const ok = (n, c, e) => T.push((c ? "  OK  " : "FAIL  ") + n + (e ? "   " + e : ""));
const day = (n) => new Date(Date.now() + n * 86400000 + 9 * 3600000).toISOString().slice(0, 10);

// 서버를 한 번 돌린다. 무엇을 물어봤고(asked) 무엇을 적었고(wrote) 무엇을 보냈나(pushed).
function run(opt) {
  const wrote = {}, pushed = [], asked = [];
  const ctx = vm.createContext({
    console, crypto, Buffer, Date, Math, JSON, Object, Array, String, Number, Promise, RegExp, setTimeout,
    process: { env: opt.env || {} },
    getDoc: async (p) => (p === "dash/mathWatch" ? (opt.watch || null) : (opt.prev || null)),
    patchDoc: async (p, d) => { wrote[p] = d; },
    verifyIdToken: async () => opt.claims || null,
    BUDGET: 12, WEB_BUDGET: 40,
    mathDates: async (school, from, to, kind, grades, budget, web, ai) => {
      asked.push({ school, from, to, kind, grades, ai, left: ai && ai.n });
      const r = (opt.answer || {})[school] || { school, rows: [] };
      // 진짜 mathDates 는 AI 를 부를 때만 몫을 깎는다. 흉내도 그렇게 한다.
      if (r.by === "AI" || r.busy) { if (ai && ai.n <= 0) return { school, post: r.post, url: r.url, rows: [] }; if (ai) ai.n--; }
      return r;
    },
    vapidKeys: async () => ({ pub: "p" }),
    sendTo: async (tid, payload) => { pushed.push({ tid, payload }); return { sent: 1 }; },
  });
  vm.runInContext(csrc, ctx);
  return vm.runInContext("runMathScan()", ctx)
    .then(() => ({ wrote: wrote["dash/mathFound"] || {}, pushed, asked }));
}
const WATCH = (rows, by) => ({ by: by === undefined ? "t1" : by, term: "2학기 중간", kind: "중간", rows });
const ROW = (school, grade, inDays, math) =>
  ({ school, grade, start: day(inDays), end: day(inDays + 2), math: math || "" });
const G = (d) => ({ by: "표", post: "1학년 중간고사 시간표", url: "http://a",
                    rows: [{ grade: 1, subject: "공통수학2", date: d }] });

(async () => {
  // ---- 무엇을 긁고 무엇을 안 긁나 ----
  {
    const a = await run({ watch: WATCH([]) });
    ok("볼 학교가 없으면 아무 데도 안 간다", a.asked.length === 0);
    ok("볼 학교가 없으면 알림도 없다", a.pushed.length === 0);
  }
  {
    const a = await run({ watch: WATCH([ROW("가고", "고1", 5), ROW("나고", "고1", 60)]) });
    ok("시험이 닷새 앞이면 본다", a.asked.some((x) => x.school === "가고"));
    // ⚠ 학교는 2주 전에 올린다. 두 달 뒤 시험을 날마다 긁는 것은 남의 서버를 헛되이 때리는 짓이다
    ok("시험이 두 달 뒤면 안 본다", !a.asked.some((x) => x.school === "나고"));
  }
  {
    const a = await run({ watch: WATCH([{ school: "다고", grade: "고1", start: "", end: "", math: "" }]) });
    ok("시험 기간이 비어 있으면 안 본다(날짜를 놓을 자리가 없다)", a.asked.length === 0);
  }
  {
    const a = await run({ watch: WATCH([ROW("라고", "고1", -10)]) });
    ok("이미 끝난 시험은 안 본다", a.asked.length === 0);
  }
  {
    const a = await run({ watch: WATCH([ROW("마고", "고1", 3)]) });
    // ⚠ 하루 한도를 새벽에 다 쓰면 낮에 팀장이 눌렀을 때 못 읽는다
    // 마왕님: "새벽에 토큰 써도돼 어차피 나는 오후에 주로써" — 때가 된 학교를 다 읽고도 남을 만큼 준다
    ok("AI 몫을 넉넉히 넘긴다 (때가 된 학교를 다 읽고도 남게)",
       !!a.asked[0].ai && a.asked[0].ai.n >= 30, JSON.stringify(a.asked[0].ai));
    ok("그래도 상한은 있다 (되풀이가 하루치를 태우지 않게)", a.asked[0].ai.n <= 60);
    ok("회차 이름을 같이 넘긴다", a.asked[0].kind === "중간");
    ok("날짜는 YYYYMMDD 로 넘긴다", /^\d{8}$/.test(a.asked[0].from), a.asked[0].from);
    ok("학년도 같이 넘긴다", a.asked[0].grades.join() === "고1");
  }

  // ---- 무엇을 «저절로 넣어도 되는 것» 으로 표시하나 ----
  {
    const a = await run({ watch: WATCH([ROW("표고", "고1", 3)]), answer: { 표고: G("2026-10-01") } });
    ok("표를 재서 읽고 날이 하나고 빈 칸이면 auto", a.wrote.diffs[0].auto === true);
    ok("찾은 날짜를 그대로 들고 간다", a.wrote.diffs[0].dates[0] === "2026-10-01");
  }
  {
    const a = await run({ watch: WATCH([ROW("표고", "고1", 3, "2026-09-30")]), answer: { 표고: G("2026-10-01") } });
    // ⚠ 손으로 넣었거나 학생이 알려 준 날짜다. 새벽에 조용히 덮으면 아무도 모른다
    ok("이미 적어둔 값이 있으면 auto 가 아니다", a.wrote.diffs[0].auto === false);
    ok("지금 값을 나란히 들고 간다", a.wrote.diffs[0].mine === "2026-09-30");
  }
  {
    const a = await run({ watch: WATCH([ROW("표고", "고1", 3, "2026-10-01")]), answer: { 표고: G("2026-10-01") } });
    ok("이미 같은 날이면 내밀지 않는다", (a.wrote.diffs || []).length === 0);
    ok("이미 같은 날이면 알림도 없다", a.pushed.length === 0);
  }
  {
    const many = { by: "표", post: "p", url: "u", rows: [{ grade: 1, subject: "대수", date: "2026-10-01" },
                                                        { grade: 1, subject: "미적분", date: "2026-10-02" }] };
    const a = await run({ watch: WATCH([ROW("여럿고", "고1", 3)]), answer: { 여럿고: many } });
    ok("날이 여럿이면 auto 가 아니다", a.wrote.diffs[0].auto === false);
    ok("날은 둘 다 들고 간다 (사람이 고른다)", a.wrote.diffs[0].dates.length === 2);
  }
  {
    const ai = { by: "AI", post: "p", url: "u", rows: [{ grade: 1, subject: "수학", date: "2026-10-01" }] };
    const a = await run({ watch: WATCH([ROW("에이고", "고1", 3)]), answer: { 에이고: ai } });
    ok("AI 가 읽은 것은 auto 가 아니다", a.wrote.diffs[0].auto === false);
  }
  {
    const other = { by: "표", post: "p", url: "u", rows: [{ grade: 3, subject: "미적분", date: "2026-10-01" }] };
    const a = await run({ watch: WATCH([ROW("학년고", "고1", 3)]), answer: { 학년고: other } });
    ok("다른 학년 날짜는 안 가져온다", (a.wrote.diffs || []).length === 0);
  }

  // ---- 못 읽었을 때 ----
  {
    const link = { post: "2학기 중간고사 시간표 안내", url: "http://x", rows: [], note: "표로는 못 읽었어요" };
    const a = await run({ watch: WATCH([ROW("링크고", "고1", 3)]), answer: { 링크고: link } });
    ok("글은 찾았는데 못 읽으면 링크를 남긴다", a.wrote.links.length === 1 && a.wrote.links[0].url === "http://x");
    ok("링크만 있어도 알린다 (열어서 붙여넣으면 된다)", a.pushed.length === 1);
  }
  {
    const a = await run({ watch: WATCH([ROW("없고", "고1", 3)]), answer: { 없고: { rows: [] } } });
    // ⚠ 아직 안 올린 학교가 제일 많다. 이걸 날마다 알리면 «없음» 알림이 날마다 온다
    ok("아직 글이 없으면 조용하다", a.pushed.length === 0 && (a.wrote.diffs || []).length === 0);
  }
  {
    const a = await run({ watch: WATCH([ROW("터진고", "고1", 3)]),
                          answer: { 터진고: { error: "학교 홈페이지를 못 열었어요" } } });
    ok("못 열린 학교는 조용히 지나간다", a.pushed.length === 0);
  }

  // ---- AI 몫 ----
  {
    const AI = (d) => ({ by: "AI", post: "p", url: "u", rows: [{ grade: 1, subject: "수학", date: d }] });
    const rows = [], answer = {};
    for (let i = 0; i < 20; i++) { rows.push(ROW("학교" + i, "고1", 3)); answer["학교" + i] = AI("2026-10-01"); }
    const a = await run({ watch: WATCH(rows), answer });
    const read = (a.wrote.diffs || []).length, link = (a.wrote.links || []).length;
    // 때가 된 학교가 스무 곳쯤인 것이 실제 숫자다(2026-09-12 실측). 이만큼은 몫이 남아 다 읽어야 한다
    ok("스무 곳이면 AI 몫이 남아 전부 읽는다", read === 20 && link === 0, "읽음 " + read + " · 링크 " + link);
  }
  {
    // 몫을 다 쓰는 상황도 본다 — 링크로 남아야지 «못 찾음» 이 되면 안 된다
    const AI = () => ({ by: "AI", post: "p", url: "u", rows: [{ grade: 1, subject: "수학", date: "2026-10-01" }] });
    const rows = [], answer = {};
    for (let i = 0; i < 50; i++) { rows.push(ROW("학교" + i, "고1", 3)); answer["학교" + i] = AI(); }
    const a = await run({ watch: WATCH(rows), answer });
    const read = (a.wrote.diffs || []).length, link = (a.wrote.links || []).length;
    ok("몫이 다하면 나머지는 링크로 남는다", read > 0 && link > 0, "읽음 " + read + " · 링크 " + link);
    // ⚠ 몫이 다한 것은 «못 찾음» 이 아니다. 팀장이 열어 붙여넣을 수 있게 링크로 남는다
    ok("몫이 다해도 한 곳도 안 잃는다", read + link === 50, "읽음 " + read + " · 링크 " + link);
  }
  {
    // 분당 한도에 걸린 것은 학교 탓이 아니다 — 내일 다시 봐야 한다
    const busy = { post: "중간고사 시간표", url: "http://b", rows: [], busy: true };
    const first = await run({ watch: WATCH([ROW("바쁜고", "고1", 3)]), answer: { 바쁜고: busy } });
    ok("AI 가 바빴으면 링크를 남긴다", first.wrote.links.length === 1);
    ok("«다시 볼 것» 이라고 표시해 둔다", first.wrote.links[0].retry === true);
    const again = await run({ watch: WATCH([ROW("바쁜고", "고1", 3)]), prev: first.wrote,
                             answer: { 바쁜고: G("2026-10-01") } });
    ok("다음 날 다시 긁는다 (링크만 영영 남지 않게)", again.asked.length === 1);
    ok("다시 긁어 찾으면 날짜가 된다", (again.wrote.diffs || []).length === 1);
  }

  // ---- 알림 ----
  {
    const a = await run({ watch: WATCH([ROW("표고", "고1", 3)]), answer: { 표고: G("2026-10-01") } });
    ok("찾으면 팀장에게 알린다", a.pushed.length === 1 && a.pushed[0].tid === "t1");
    ok("알림은 학교 일정 화면으로 연다", a.pushed[0].payload.url === "/#terms");
    ok("알림 글에 학교 이름이 있다", /표고/.test(a.pushed[0].payload.body));
    ok("적은 것에 sig 가 남는다 (두 번 안 알리려고)", !!a.wrote.sig);
  }
  {
    const watch = WATCH([ROW("표고", "고1", 3)]);
    const first = await run({ watch, answer: { 표고: G("2026-10-01") } });
    // 어제 적은 것을 그대로 다시 넣고 돌린다 — 새로 찾은 것이 없다
    const again = await run({ watch, prev: first.wrote, answer: { 표고: G("2026-10-01") } });
    ok("같은 것을 두 번 알리지 않는다", again.pushed.length === 0);
    ok("이미 찾아 둔 학교는 다시 안 긁는다", again.asked.length === 0);
    ok("찾아 둔 것은 그대로 들고 있다", again.wrote.diffs.length === 1);
  }
  {
    // 팀장이 넣었다 → 앱이 볼 목록에서 그 줄을 뺀다 → 서버도 버려야 한다
    const first = await run({ watch: WATCH([ROW("표고", "고1", 3)]), answer: { 표고: G("2026-10-01") } });
    const after = await run({ watch: WATCH([ROW("다른고", "고1", 3)]), prev: first.wrote });
    ok("팀장이 넣은 줄은 다음 날 사라진다", (after.wrote.diffs || []).length === 0);
  }
  {
    const old = { at: "2020-01-01T00:00:00.000Z",
                  diffs: [{ kind: "math", school: "표고", grade: "고1", dates: ["x"] }], links: [] };
    const a = await run({ watch: WATCH([ROW("표고", "고1", 3)]), prev: old, answer: { 표고: G("2026-10-01") } });
    ok("오래된 결과는 믿지 않고 다시 긁는다", a.asked.length === 1);
  }
  {
    const a = await run({ watch: WATCH([ROW("표고", "고1", 3)], ""), answer: { 표고: G("2026-10-01") } });
    ok("받을 사람이 없으면 안 보낸다 (적어는 둔다)", a.pushed.length === 0 && a.wrote.diffs.length === 1);
  }

  // ---- 아침에 두 번 돈다 ----
  {
    const rows = [ROW("먼저고", "고1", 3), ROW("나중고", "고1", 3)];
    const first = await run({ watch: WATCH(rows), answer: { 먼저고: G("2026-10-01") } });
    ok("첫 판은 찾은 학교만 알린다", /먼저고/.test(first.pushed[0].payload.body));
    const second = await run({ watch: WATCH(rows), prev: first.wrote, answer: { 나중고: G("2026-10-02") } });
    ok("둘째 판은 첫 판에서 본 학교를 안 긁는다", second.asked.length === 1 && second.asked[0].school === "나중고");
    ok("둘째 판도 알린다 (새로 찾았으므로)", second.pushed.length === 1);
    // ⚠ 지난 판 학교 이름이 섞이면 «또 찾았나» 로 읽힌다
    ok("둘째 알림에 첫 판 학교가 안 섞인다",
       /나중고/.test(second.pushed[0].payload.body) && !/먼저고/.test(second.pushed[0].payload.body),
       second.pushed[0].payload.body);
    ok("찾은 것은 둘 다 남는다", second.wrote.diffs.length === 2);
  }

  {
    // 6시대에 바빴던 학교를 7시대가 다시 본다. 그런데 또 바빴다 — 줄이 쌓이면 안 된다
    const busy = { post: "중간고사 시간표", url: "http://b", rows: [], busy: true };
    const rows = [ROW("바쁜고", "고1", 3)];
    const p1 = await run({ watch: WATCH(rows), answer: { 바쁜고: busy } });
    const p2 = await run({ watch: WATCH(rows), prev: p1.wrote, answer: { 바쁜고: busy } });
    ok("또 바빠도 줄이 쌓이지 않는다", p2.wrote.links.length === 1, "줄 " + p2.wrote.links.length);
    // ⚠ 같은 학교가 또 바빴던 것은 **새로 안 것이 아니다.** 세면 아침마다 같은 알림이 온다
    ok("또 바빴던 것으로는 안 알린다", p2.pushed.length === 0);
    const p3 = await run({ watch: WATCH(rows), prev: p2.wrote, answer: { 바쁜고: G("2026-10-01") } });
    ok("다시 긁어 날짜가 나오면 그때 알린다", p3.pushed.length === 1);
    ok("링크는 날짜로 바뀌고 남지 않는다",
       (p3.wrote.links || []).length === 0 && p3.wrote.diffs.length === 1,
       "링크 " + (p3.wrote.links || []).length + " · 날짜 " + p3.wrote.diffs.length);
  }

  // ---- 어느 프로젝트가 돌렸나 ----
  // ⚠ 이 저장소에 버셀 프로젝트가 셋 물려 있다(2026-09-12에 알았다). 두 곳에 열쇠를 넣으면 두 번 긁는다
  {
    const rows = [ROW("가고", "고1", 3)];
    const A = { CRON_SECRET: "x", VERCEL_PROJECT_PRODUCTION_URL: "climath-team1.vercel.app" };
    const B = { CRON_SECRET: "x", VERCEL_PROJECT_PRODUCTION_URL: "climath-team-zu5m.vercel.app" };
    const p1 = await run({ watch: WATCH(rows), env: A, answer: { 가고: G("2026-10-01") } });
    ok("어느 곳이 돌렸는지 적어 둔다", p1.wrote.host === "climath-team1.vercel.app", p1.wrote.host);
    ok("한 곳만 돌면 조용하다", p1.wrote.dup === false);
    const p2 = await run({ watch: WATCH([ROW("나고", "고1", 3)]), prev: p1.wrote, env: B });
    ok("다른 곳이 돌면 표시가 붙는다", p2.wrote.dup === true);
    const p3 = await run({ watch: WATCH([ROW("다고", "고1", 3)]), prev: p1.wrote, env: A });
    ok("같은 곳이 다시 돌면 표시가 안 붙는다", p3.wrote.dup === false);
  }

  // ---- 문 ----
  {
    const mk = (env, headers, claims) => {
      const ctx = vm.createContext({ console, crypto, Buffer, Date, Math, JSON, Object, Array, String, Number,
        Promise, RegExp, setTimeout, process: { env },
        getDoc: async () => null, patchDoc: async () => {},
        verifyIdToken: async () => claims || null,
        BUDGET: 12, WEB_BUDGET: 40, mathDates: async () => ({ rows: [] }),
        vapidKeys: async () => ({}), sendTo: async () => ({ sent: 0 }) });
      vm.runInContext(csrc, ctx);
      let code = 0;
      const res = { status: (c) => { code = c; return { json: () => {} }; } };
      return vm.runInContext("handler", ctx)({ headers, body: {} }, res).then(() => code);
    };
    ok("열쇠 없이 부르면 막는다", (await mk({ CRON_SECRET: "s3cret" }, {})) === 401);
    ok("틀린 열쇠면 막는다", (await mk({ CRON_SECRET: "s3cret" }, { authorization: "Bearer nope!!" })) === 401);
    // ⚠ timingSafeEqual 은 길이가 다르면 **던진다.** 먼저 길이를 봐야 500 이 안 난다
    ok("길이가 다른 열쇠도 얌전히 막는다", (await mk({ CRON_SECRET: "s3cret" }, { authorization: "Bearer x" })) === 401);
    ok("맞는 열쇠면 돈다", (await mk({ CRON_SECRET: "s3cret" }, { authorization: "Bearer s3cret" })) === 200);
    // ⚠ CRON_SECRET 을 안 넣어 두면 아무나 부를 수 있는 주소가 된다 — 남의 학교 홈페이지를 스무 곳씩 긁는 길
    ok("CRON_SECRET 이 아예 없으면 아무나 못 연다", (await mk({}, { authorization: "Bearer " })) === 401);
    ok("팀장 토큰이면 손으로도 돌릴 수 있다", (await mk({}, {}, { role: "owner" })) === 200);
    ok("선생님 토큰으로는 못 돌린다", (await mk({}, {}, { role: "teacher" })) === 401);
  }

  // ---------- 앱(index.html) ----------
  {
    const src = /<script>([\s\S]*?)<\/script>/.exec(fs.readFileSync(__dirname + "/../index.html", "utf8"))[1];
    const cp = (x) => JSON.parse(JSON.stringify(x));
    const STUB = [
      'var firebase={initializeApp:function(c,n){return n?{t:1}:{};},firestore:function(){return DB;},',
      '  auth:function(){return {onAuthStateChanged(){},currentUser:null,signOut:()=>Promise.resolve()};}};',
      'var document={querySelector:()=>null,querySelectorAll:()=>[],addEventListener(){}};',
      'var window={addEventListener(){},scrollTo(){}},location={hash:""},history={replaceState(){}};',
      'var localStorage={getItem:()=>null,setItem(){}};',
      'var fetch=()=>Promise.reject(new Error("no net")); var alert=function(){},confirm=()=>true;',
    ].join("\n");
    const app = (found, terms) => {
      const written = {};
      const DB = { collection: () => ({ doc: () => ({
        set: (d) => { written.doc = cp(d); return Promise.resolve(); },
        get: () => Promise.resolve({ exists: false }) }) }) };
      const ctx = vm.createContext({ console, setTimeout, clearTimeout, Date, Math, JSON, Object, Array, String,
        Number, Promise, RegExp, isNaN, parseInt, DB });
      vm.runInContext(STUB + "\n" + src, ctx);
      vm.runInContext("S.term='2학기 중간'; S.students=[]; S.teamOk=true; S.ro=false; S.claims={tid:'t1'};", ctx);
      ctx.__t = cp(terms || {}); vm.runInContext("S.schoolTerms=__t;", ctx);
      ctx.__f = found ? cp(found) : null; vm.runInContext("S.mathFound=__f;", ctx);
      return { ctx, written, g: (e) => vm.runInContext(e, ctx) };
    };
    const TERMS = (list) => {
      const o = {};
      list.forEach((v, i) => { o["k" + i] = Object.assign({ term: "2학기 중간" }, v); });
      return o;
    };
    const FOUND = (diffs, links) => ({ at: new Date().toISOString(), diffs: diffs || [], links: links || [],
                                       looked: 5, left: 0 });
    const D = (school, grade, dates, auto) =>
      ({ kind: "math", school, grade, mine: "", dates, auto: !!auto, by: "표" });
    const ONE = (extra) => TERMS([Object.assign({ school: "표고", grade: "고1", start: day(3), end: day(5) }, extra || {})]);

    {
      const a = app(FOUND([D("표고", "고1", ["2026-10-01"], true)]), ONE());
      a.g("adoptMathFound()");
      ok("[앱] 새벽에 찾은 것이 일감 상자에 들어온다", a.g("PULL_JOB.diffs.length") === 1);
      ok("[앱] 어디서 왔는지 밝힌다", /새벽/.test(a.g("PULL_JOB.msg")), a.g("PULL_JOB.msg"));
      ok("[앱] auto 는 그대로 살아 있다", a.g("PULL_JOB.diffs[0].auto") === true);
    }
    {
      const a = app(FOUND([D("표고", "고1", ["2026-10-01"], true)]), ONE({ math: "2026-10-01" }));
      a.g("adoptMathFound()");
      ok("[앱] 그 사이 손으로 넣은 줄은 다시 안 내민다", a.g("PULL_JOB.diffs.length") === 0);
    }
    {
      const a = app(FOUND([D("표고", "고1", ["2026-10-01"], true)]), ONE({ math: "2026-09-30" }));
      a.g("adoptMathFound()");
      ok("[앱] 값이 다르면 나란히 놓고 묻는다", a.g("PULL_JOB.diffs.length") === 1);
      ok("[앱] «지금 값» 을 새벽 것이 아니라 지금 것으로 다시 적는다", a.g("PULL_JOB.diffs[0].mine") === "2026-09-30");
      // ⚠ 여기가 무너지면 «한꺼번에 넣기» 가 사람이 적어 둔 날짜를 덮는다
      ok("[앱] 이미 값이 있으면 auto 를 끈다", a.g("PULL_JOB.diffs[0].auto") === false);
    }
    {
      const a = app(FOUND([D("없어진고", "고1", ["2026-10-01"], true)]), ONE());
      a.g("adoptMathFound()");
      ok("[앱] 이 회차에 없는 학교는 버린다", a.g("PULL_JOB.diffs.length") === 0);
    }
    {
      const a = app(FOUND([D("표고", "고1", ["2026-10-01"], true)]), ONE());
      a.g("S.ro=true; adoptMathFound()");
      ok("[앱] 선생님에게는 안 내민다 (넣을 수도 없다)", a.g("PULL_JOB.diffs.length") === 0);
    }
    {
      const a = app(null, TERMS([{ school: "가고", grade: "고1", start: day(3), end: day(5) },
                                 { school: "나고", grade: "고1", start: day(3), end: day(5), math: "2026-10-01" },
                                 { school: "다고", grade: "고1", start: "", end: "" }]));
      a.g("saveMathWatch()");
      const w = a.written.doc;
      ok("[앱] 볼 목록에 빈 칸만 넣는다", w.rows.length === 1 && w.rows[0].school === "가고", JSON.stringify(w.rows));
      ok("[앱] 알림 받을 사람을 적는다", w.by === "t1");
      ok("[앱] 회차 이름에서 중간·기말을 가른다", w.kind === "중간");
      a.written.doc = null;
      a.g("saveMathWatch()");
      ok("[앱] 안 바뀌었으면 두 번 안 쓴다", a.written.doc === null);
    }
    {
      const a = app(null, ONE());
      a.g("S.term='2학기 기말'; saveMathWatch()");
      ok("[앱] 기말이면 기말로 적는다", a.written.doc.kind === "기말");
    }
    {
      const a = app(null, ONE());
      a.g("S.ro=true; saveMathWatch()");
      ok("[앱] 선생님은 볼 목록을 안 쓴다", !a.written.doc);
    }
    {
      const a = app(null, {});
      ctxSet(a, "__n", [{ school: "가고", grade: "고1", start: day(3), end: day(5), math: "" }]);
      ok("[앱] 새벽 찾기가 한 번도 안 돌았으면 화면이 알린다",
         /안 돌고 있다/.test(a.g("nightlyHtml(__n)")) && /CRON_SECRET/.test(a.g("nightlyHtml(__n)")));
      a.g("S.mathFound={at:new Date().toISOString(),looked:7,left:0}");
      ok("[앱] 돌고 있으면 조용한 한 줄",
         /새벽 찾기/.test(a.g("nightlyHtml(__n)")) && !/안 돌고/.test(a.g("nightlyHtml(__n)")));
      a.g("S.mathFound={at:new Date(Date.now()-4*86400000).toISOString()}");
      ok("[앱] 며칠째 안 돌면 알린다", /안 돌고 있다/.test(a.g("nightlyHtml(__n)")));
      ctxSet(a, "__far", [{ school: "가고", grade: "고1", start: day(60), end: day(62), math: "" }]);
      ok("[앱] 때가 안 된 학교뿐이면 아무 말도 안 한다", a.g("nightlyHtml(__far)") === "");
    }
  }

  console.log(T.join("\n"));
  const bad = T.filter((x) => x.startsWith("FAIL")).length;
  console.log("\n" + T.length + "건 중 " + (T.length - bad) + "건 통과" + (bad ? " · " + bad + "건 실패" : ""));
  process.exit(bad ? 1 : 0);
})();

// vm 안으로 값을 넣는다. 바깥 객체를 그대로 두면 안쪽 코드가 다른 realm 의 Array 를 보게 된다.
function ctxSet(a, name, v) {
  a.ctx.__in = JSON.stringify(v);
  vm.runInContext("var " + name + " = JSON.parse(__in);", a.ctx);
}
