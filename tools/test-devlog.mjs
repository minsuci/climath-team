// 나스 허브 읽기 — 도구보고 머리말과 일지의 «개발 [앱]» 줄.
//
// 일지 전체가 아니라 표시된 줄만 올라가야 한다 (학생ID 가 적힌 줄이 따라오면 안 된다).
// 실제 허브 파일과 같은 모양으로 시험한다.
import { parseToolReport, parseLogLines } from "./push-devlog.mjs";

const T = [];
const ok = (n, c, e) => T.push((c ? "  OK  " : "FAIL  ") + n + (e ? "   " + e : ""));

// ---- 도구보고 ----
const tool = parseToolReport("2026-09-04_한민수_학생앱.md", `---
제목: 도구보고 — 한민수 학생용 앱
작성: 2026-09-04
작성자: 한민수
도구: CLIMATH 수업관리 (학생용 웹앱)
---

# 학생용 앱 — 지금 무엇을 무슨 이름으로 저장하는가
`);
ok("도구보고 머리말을 읽는다", tool.id === "2026-09-04_한민수_학생앱" && tool.who === "한민수" && tool.app === "CLIMATH 수업관리 (학생용 웹앱)" && tool.date === "2026-09-04", JSON.stringify(tool));
ok("파일 경로가 붙는다", tool.file === "개발노트/도구보고/2026-09-04_한민수_학생앱.md");
const bare = parseToolReport("2026-09-11_정찬준_학생관리.md", "# 내 도구\n\n설명");
ok("머리말이 없으면 파일 이름에서 읽는다", bare.who === "정찬준" && bare.app === "학생관리" && bare.date === "2026-09-11" && bare.title === "내 도구", JSON.stringify(bare));
const bom = parseToolReport("2026-09-11_이현우_질문앱.md", "﻿---\n작성자: 이현우\n도구: 질문 앱\n---\n");
ok("BOM 이 있어도 머리말을 읽는다", bom.app === "질문 앱");

// ---- 일지 ----
const log = `---
날짜: 2026-09-05
작성: 한민수
---

## 오늘 한 것

- S26-013 상담 — 진로 얘기
- 개발 [학생앱] 운영DB 보내기 화면을 붙임
- **개발 [대시보드]** 개발 현황 메뉴 — 깃허브 커밋을 앱별로
* 개발 «대시보드» 회의록 메뉴
- 개발[학생앱]: 반이 없어도 로그인되게
- 개발 [학생앱]
- 개발 계획만 세움

## 막힌 것

- 개발 [학생앱] 이건 막힌 것 칸이지만 개발 줄이면 올린다
`;
const lines = parseLogLines("2026/2026-09-05_한민수.md", log);
ok("개발 줄만 뽑는다 — 상담 줄·앱 없는 줄·빈 줄은 안 올라간다", lines.length === 5, JSON.stringify(lines.map((l) => l.msg)));
ok("날짜·작성자는 머리말에서", lines.every((l) => l.date === "2026-09-05" && l.who === "한민수"));
ok("앱 이름과 메시지가 갈린다", lines[0].app === "학생앱" && lines[0].msg === "운영DB 보내기 화면을 붙임");
ok("굵게 감싼 것도 받는다", lines[1].app === "대시보드" && lines[1].msg === "개발 현황 메뉴 — 깃허브 커밋을 앱별로");
ok("« » 와 * 목록도 받는다", lines[2].app === "대시보드" && lines[2].msg === "회의록 메뉴");
ok("띄어쓰기 없이 콜론이 붙어도 받는다", lines[3].app === "학생앱" && lines[3].msg === "반이 없어도 로그인되게");
ok("학생ID 줄은 안 올라간다", !lines.some((l) => /S26-/.test(l.msg)));
ok("파일 경로는 연도 폴더째", lines[0].file === "업무기록/2026/2026-09-05_한민수.md");
ok("지문은 파일·앱·메시지로 — 같은 줄은 같은 지문", parseLogLines("2026/2026-09-05_한민수.md", log)[0].id === lines[0].id);
ok("다른 날 같은 문장은 다른 지문", parseLogLines("2026/2026-09-06_한민수.md", log.replace("2026-09-05", "2026-09-06"))[0].id !== lines[0].id);
const noFm = parseLogLines("2026/2026-09-06_박준성.md", "- 개발 [학생관리] 첫 화면\n");
ok("머리말 없으면 파일 이름에서 날짜·이름", noFm.length === 1 && noFm[0].who === "박준성" && noFm[0].date === "2026-09-06", JSON.stringify(noFm));

console.log(T.join("\n"));
const bad = T.filter((x) => x.startsWith("FAIL")).length;
console.log(bad ? "\n실패 " + bad + "건" : "\n전부 통과 (" + T.length + "건)");
process.exit(bad ? 1 : 0);
