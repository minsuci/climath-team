// 가정통신문에서 수학시험 날짜 찾아오기 — 규칙만 돌려본다 (2026-09-08).
//
// ⚠ 이 규칙들은 **실제 열 학교를 훑어 보고** 만들었다. 흉내 자료도 그때 받은 진짜 글자다.
//   지어낸 자료로 시험을 짜면 규칙이 현실과 어긋난 채로 통과한다.
const fs = require("fs"), vm = require("vm");
const src = fs.readFileSync(__dirname + "/../api/schedule.js", "utf8");
const body = src.replace(/^import[\s\S]*?;$/m, "")
  .replace(/^export default /gm, "").replace(/^export (const |let |async |function )/gm, "$1");
const ctx = vm.createContext({ console, fetch: () => Promise.reject(new Error("no net")), Buffer, URL,
  URLSearchParams, setTimeout, clearTimeout, process: { env: {} },
  getDoc: async () => null, patchDoc: async () => {}, verifyIdToken: async () => null });
vm.runInContext(body, ctx);
const g = (n) => vm.runInContext(n, ctx);
const T = [];
const ok = (n, c, e) => T.push((c ? "  OK  " : "FAIL  ") + n + (e ? "   " + e : ""));

// ---- 게시판 메뉴 고르기 ----
// 학교마다 이름이 다르다: 가정통신문(단대부고·중대부고) · 학교소식(세화고) · 알림마당(은광여고)
{
  const findNoticeMenus = g("findNoticeMenus");
  const html = ["가정통신문", "학교소식", "알림마당", "공지사항", "급식소식", "입학게시판",
                "가정통신문(교육청)", "방과후학교소식", "보건소식", "채용공고"]
    .map((t, i) => '<a href="/' + (100 + i) + '/subMenu.do">' + t + "</a>").join("");
  const got = findNoticeMenus(html, "https://x.sen.hs.kr/");
  const n = (u) => Number(u.match(/\/(\d+)\/subMenu/)[1]) - 100;
  const names = got.map((u) => ["가정통신문", "학교소식", "알림마당", "공지사항", "급식소식", "입학게시판",
    "가정통신문(교육청)", "방과후학교소식", "보건소식", "채용공고"][n(u)]);
  ok("가정통신문·학교소식·알림마당·공지사항을 고른다", names.join(",") === "가정통신문,학교소식,알림마당,공지사항", names.join(","));
  ok("급식·입학·보건·채용은 안 본다", !/급식|입학|보건|채용/.test(names.join(",")));
  // ⚠ 교육청 가정통신문은 학교가 낸 것이 아니다. 시험 시간표가 거기 있을 리 없고 예산만 태운다
  ok("교육청 가정통신문은 뺀다", !/교육청/.test(names.join(",")));
  ok("많아야 넷만 본다 (예산)", got.length <= 4, String(got.length));
}

// ---- 어느 회차의 글인가 ----
{
  const fit = g("titleFitsTerm");
  ok("2학기를 찾는데 1학기 글은 안 받는다", !fit("2026학년도 1학기 중간고사 시간표 안내", "20260915"));
  ok("2학기 글은 받는다", fit("2026학년도 2학기 중간고사 시간표 안내 가정통신문", "20260915"));
  // ⚠ 실제로 물어 왔다 — 은광여고의 «2025학년도 2학기 기말고사 시간표». 지난해 날짜를 넣을 뻔했다
  ok("지난 학년도 글은 안 받는다", !fit("[1,2학년] 2025학년도 2학기 기말고사 시간표", "20260915"));
  ok("1학기를 찾을 때 2학기 글은 안 받는다", !fit("2026학년도 2학기 중간고사 안내", "20260410"));
  // 학년도는 3월에 바뀐다 — 1·2월 시험은 앞 해 학년도 글이다
  ok("1월 시험은 앞 해 학년도 글을 받는다", fit("2026학년도 2학기 기말고사 시간표", "20270115"));
  ok("학년도가 안 적힌 제목은 그냥 받는다", fit("중간고사 시간표 안내", "20260915"));
}

// ---- 제목이 시간표 글인가 ----
{
  const re = g("TIME_TITLE");
  const yes = ["2026학년도 2학기 중간고사 시간표 안내 가정통신문",
               "2026학년도 2학기 중간고사 안내 가정통신문",
               "2026학년도 1학기 기말고사 시간표 및 시험범위표(1)",
               "1학기 중간고사 시간표, 범위표 안내"];
  const no = ["2026학년도 2학기 3학년 평가계획 안내 가정통신문",
              "학교운영위원회 위원 선출 공고", "9월 급식 안내", "교복 공동구매 안내"];
  ok("시간표 글 제목을 잡는다", yes.every((t) => re.test(t)), yes.filter((t) => !re.test(t)).join(" / "));
  ok("상관없는 글은 안 잡는다", no.every((t) => !re.test(t)), no.filter((t) => re.test(t)).join(" / "));
}

// ---- 시간표처럼 생겼나 ----
// ⚠ 여기가 제일 중요하다. 세화고 첨부는 **범위표**였다 — 과목은 있는데 날짜가 없다.
//   그걸 시간표로 받으면 엉뚱한 날이 들어간다.
{
  const looks = g("looksLikeTimetable");
  // 단대부고에서 실제로 받은 글자 (줄인 것)
  const REAL = "2026학년도2학기중간고사시간표안내안녕하십니까?월/일(요일)교시시험시간1학년2학년3학년" +
    "10/1(목)108:30~09:20(50)영어Ⅱ[35]*언어와매체[17]*화법과작문[18]311:00~11:50(50)공통수학2[22]*인문학과윤리[52]" +
    "10/6(화)108:30~09:20(50)미적분Ⅰ[25]*확률과통계[27]10/7(수)108:30~09:20(50)*문학과영상[16]*기하[26]";
  // 세화고에서 실제로 받은 글자 (범위표. 날짜도 교시도 없다)
  const SCOPE = "과목시험범위-교과서(단원및페이지)시험범위-보완교재배점(선택형)배점(서답형)공통국어11.(1)나는오늘~1.(3)소곤소곤(15~45쪽)" +
    "공통수학1Ⅰ.다항식~Ⅱ.3.2.연립이차방정식(8~72쪽)과이범위에해당되는중단원,대단원,익힘책문항-5050공통영어1Lesson1~Lesson2(10~51쪽)";
  ok("진짜 시간표는 통과한다 (단대부고)", looks(REAL) === true);
  ok("범위표는 안 받는다 — 날짜도 교시도 없다 (세화고)", looks(SCOPE) === false);
  ok("첨부 변환 실패로 온 오류 쪽은 안 받는다",
    looks("<div><linkhref=/css/egovframework/com/cmm/com.css;jsessionid=abc rel=stylesheet>".repeat(20)) === false);
  ok("짧은 글자는 안 받는다", looks("10/1 수학 1교시") === false);
  ok("수학 과목이 없으면 안 받는다",
    looks(("월/일(요일)교시시험시간1학년10/1(목)108:30~09:20국어2교시영어3교시한국사" + "x".repeat(300))) === false);
}

// ---- 첨부 번호 ----
// ⚠ 이번 작업에서 제일 큰 고침. 단대부고 시간표는 fileSn 이 **0** 이라 1·2·3 만 찍던 옛 코드에서 통째로 안 보였다.
{
  const sns = g("fileSnsIn");
  const html0 = 'serverFileObj["name"] = "시간표.hwp"; serverFileObj["atchFileId"] = "FILE_1"; serverFileObj["fileSn"] = "0";';
  ok("글에 적힌 번호를 먼저 쓴다 (0부터인 학교)", sns(html0)[0] === "0", sns(html0).join(","));
  const html2 = ["0", "1", "2"].map((n) => 'serverFileObj["fileSn"] = "' + n + '";').join(" ");
  ok("여러 개면 다 쓴다", sns(html2).slice(0, 3).join(",") === "0,1,2", sns(html2).join(","));
  ok("못 읽으면 0·1·2 를 찍어 본다", sns("아무것도 없음").join(",") === "0,1,2", sns("").join(","));
  ok("목록이 있어도 0·1·2 를 뒤에 붙여 둔다 (변환 실패 대비)",
    sns('serverFileObj["fileSn"] = "5";').indexOf("0") > 0, sns('serverFileObj["fileSn"] = "5";').join(","));
  const names = g("fileNamesIn");
  ok("파일 이름도 읽는다", names(html0)[0] === "시간표.hwp", JSON.stringify(names(html0)));
}

// ---- AI 가 지어낸 날짜를 거른다 ----
// 원문에 없는 날짜를 그대로 받으면 직보까지 어긋난다.
{
  const v = g("verifyMath");
  const text = "월/일(요일)10/1(목)공통수학2[22]10/6(화)미적분Ⅰ[25]";
  ok("원문에 있는 날짜는 통과", v({ date: "2026-10-06" }, text, "20260915", "20261120"));
  ok("원문에 없는 날짜는 버린다", !v({ date: "2026-10-05" }, text, "20260915", "20261120"));
  ok("기간 밖이면 버린다", !v({ date: "2026-12-01" }, text, "20260915", "20261120"));
  ok("날짜 꼴이 아니면 버린다", !v({ date: "10/6" }, text, "20260915", "20261120"));
  ok("«10월 6일» 로 적힌 원문도 알아본다",
    v({ date: "2026-10-06" }, "10월 6일 미적분", "20260915", "20261120"));
}

// ---- AI 키가 없으면 조용히 «없다» 가 아니라 그렇게 말한다 ----
{
  const mathFromDoc = g("mathFromDoc");
  mathFromDoc("아무 글", "학교", "20260915", "20261120", ["고1"]).then((r) => {
    ok("AI 키가 없으면 그렇게 적어 준다", r.error === "AI 키 없음", JSON.stringify(r));
    done();
  });
}

function done() {
  console.log(T.join("\n"));
  const bad = T.filter((x) => x.startsWith("FAIL")).length;
  console.log(bad ? "\n실패 " + bad + "건" : "\n전부 통과 (" + T.length + "건)");
  process.exit(bad ? 1 : 0);
}
