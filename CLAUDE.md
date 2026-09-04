# climath-team — 한민수의 대시보드

대치 클라이매쓰 고등부 교무팀장(한민수)이 **혼자** 쓰는 화면. 수업관리 앱(`climath-class`)과
**별개의 앱**이다. 저장소·Vercel·Firebase 프로젝트가 따로 있고, 앱 DB는 **읽기만** 한다.

```
repo/
├── index.html        # 대시보드 전체. 순수 JS, 빌드 없음
├── api/auth.js       # 로그인 — 수업관리 앱 /api/auth 에 PIN 확인을 맡기고 토큰 둘을 준다
├── api/sheets.js     # 구글시트 읽기 (서비스 계정, 읽기 전용)
├── api/_google.js    # 커스텀 토큰 발급 · ID 토큰 검증 · 구글 API 토큰
├── firestore.rules   # climath-team DB 규칙 — owner 만. 콘솔에 붙여넣어 게시
└── vercel.json       # icn1
```

- 배포: https://climath-team1.vercel.app — Vercel 프로젝트 `climath-team1` (GitHub `minsuci/climath-team` main → 자동 배포)
- Firebase: `climath-team` (Firestore 서울, Authentication은 커스텀 토큰만 — 익명 켜지 말 것)
- 환경변수: `TEAM_SERVICE_ACCOUNT` = climath-team 서비스 계정 JSON 한 줄. Production/Preview/Development 셋 다.
  선택: `CLASS_API_URL` (기본 `https://climath-class.vercel.app/api/auth`)

## 구조 — Firebase 프로젝트 둘

| | 프로젝트 | 무엇 | 쓰기 |
|---|---|---|---|
| `firebase.app()` 기본 | climath-class | teachers · classes · appConfig · exams · scores | 읽기만 |
| 〃 | 〃 | **students · classes.roster** | **쓴다** — 학생 명단이 이 앱에서 관리된다 |
| `teamApp` | climath-team | `dash/tasks`(할 일) · `dash/config`(시트) · `dash/students`(메모) | 여기만 |

브라우저가 두 프로젝트에 따로 로그인한다. `/api/auth login` 이 `classToken`(수업관리 앱이 발급)과
`teamToken`(이 프로젝트 서비스 계정이 서명)을 함께 주고, 각각 `signInWithCustomToken` 한다.
**둘 다 첫 `onAuthStateChanged`를 준 뒤에만 `boot()`** — 한쪽만 복구된 순간 로그인 화면이 깜빡인다.

> [!warning] 로그인하는 동안 boot 을 막아야 한다 (`LOGGING_IN`)
> 두 프로젝트에 차례로 로그인하는데, **첫 번째가 끝나면 그 자리에서 `onAuthStateChanged` 가 돈다.**
> 그때 `boot()` 이 돌면 "한쪽만 로그인됨"으로 보고 `signOutAll()` 로 방금 된 로그인을 도로 끊는다.
> 화면은 오류 없이 로그인 창으로 되돌아가서, 무엇이 틀렸는지 알 길이 없다 (2026-09-04에 이걸로 막혔다).
> 실패 메시지도 전역 `LOGIN_ERR` 에 둔다 — 실패 직후의 signOut 이 `renderLogin` 을 한 번 더 돌려
> 인자로 넘긴 메시지를 지운다.

PIN 대조·시도 제한·선생님 명단은 수업관리 앱에만 있다. 이 앱은 그 서비스 계정 키를 갖지 않는다.
앱이 `role: "owner"` 라고 답할 때만 teamToken 을 발급한다.

## 학생 명단 — 이 앱이 근거지 (2026-09-04)

만들기·고치기·반 배정·지우기를 여기서 한다. 수업관리 앱의 학생 명단 화면은 그 결과를 비출 뿐이다.

> [!warning] 사본을 여기 두지 않는다
> "여기서 만들고 앱으로 보낸다"를 **두 벌**로 만들면 주인이 둘이 된다. 다른 선생님이 앱에서 넣은
> 학생이 이쪽에 안 보이고 다음 보내기에 조용히 덮인다. 학생 로그인·출결·참여표가 전부
> climath-class 를 보므로 진실은 거기 하나여야 한다. **이 앱은 고치는 자리이고 저장은 앱 DB 한 곳.**
> 앱에 없는 칸(메모)만 `dash/students` 에 붙인다.

관리자 토큰이면 앱 규칙이 이미 `students` 쓰기와 `classes` 갱신을 허용한다 — **앱 규칙은 안 건드렸다.**

- `stSave/stCreate/stDelete` — `students/{pid}`. 지우기는 **앱과 같은 방식**으로 사람 문서만 지운다.
  반 명단 항목과 출결·과제는 남는다(그래야 기록이 안 묻힌다). 확인창에 그렇게 적어 뒀다.
- `stSyncRosters(person)` — 이름·학교·학년을 그 사람이 든 모든 반의 `roster` 미러에 흘려보낸다.
  **이름을 빼먹으면** 출석부·참여표가 옛 이름을 계속 쓴다.
- `withFreshRoster(cid, fn)` — 반 명단은 배열 하나라 통째로 다시 쓴다. 그래서 **쓰기 직전에 반 문서를
  다시 읽고** 그 위에 얹는다. 화면이 들고 있던 사본으로 쓰면 그 사이 다른 선생님이 넣은 학생이 날아간다.
- `rosterDrift()` / `fixDrift()` — 미러가 어긋난 것을 찾아 다시 보낸다. 편집 화면 위 배너.
- `looseRosterRows()` / `linkLoose()` — 반에만 있고 사람 정보가 없는 옛 항목. **이름이 하나뿐일 때만**
  잇는다. 겹치면 건너뛴다 — 동명이인을 섞으면 되돌리기 어렵다.

### 시험

```bash
node tools/test-roster.js
```

가짜 Firestore로 쓰기 로직을 돌린다(20건). **운영 DB를 건드리는 코드라 고치면 반드시 돌린다.**
"남이 그 사이 넣은 학생이 안 지워지는가"까지 본다 — 이건 눈으로는 못 잡는다.

## 함정

- 앱 데이터의 칸 이름은 수업관리 앱 CLAUDE.md 가 원본이다. 특히 학생 명단의 담임은 `students.homeroom`(tid),
  roster 의 `teacher` 는 "이 항목이 선생님"이라는 불리언. 앱이 칸을 바꾸면 여기가 조용히 빈다.
- 상자 일곱 개를 `render*()` 가 각각 innerHTML 로 다시 그린다. 상자를 통째로 다시 그리면 입력 포커스가
  날아가므로 시트 찾기 칸은 표만 다시 그린다(`renderSheetTable`).
- 성적은 반마다 `days` 문서를 모두 나열한 뒤 최근 14개 날짜만 `scores` 를 읽는다. 반이 늘면 느리다.
  앱 쪽에 `collectionGroup("scores")` 규칙을 열면 한 번에 되지만 그건 앱 규칙을 건드리는 일이라 안 했다.
- 시트 id 는 저장소에 적지 않는다(공개). 대시보드 안에서 주소를 붙여넣어 `dash/config` 에 둔다.
- 구글시트는 시트마다 서비스 계정 이메일을 **뷰어**로 공유해야 한다. 처음엔 구글 클라우드 콘솔에서
  climath-team 의 Google Sheets API 를 켜야 한다. `api/sheets.js` 의 `explain()` 이 그 링크를 돌려준다.
- 로컬에서 켜볼 수 없다. `/api` 가 Vercel 에만 있고 Firestore 는 로그인이 있어야 열린다.
  구문 검사: `node --check api/*.js`, index.html 은 `<script>` 를 뽑아 `new vm.Script()`.
  **그리기 함수는 가짜 데이터로 돌려볼 수 있다** — `<script>` 를 vm 컨텍스트에 넣고(firebase·document·
  location 은 빈 껍데기로) `S` 에 반·학생을 손으로 채운 뒤 `classGridHtml()` 같은 걸 불러 HTML 을 본다.
  브라우저 없이 배치표가 실제로 그려지는지 확인하는 유일한 방법이다.

## 볼트

작업 노트: `민수의 뇌/20 작업/한민수 대시보드.md` — 켜는 순서, 연동 후보 시트 목록.
