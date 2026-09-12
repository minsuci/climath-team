// 팀체크 서비스 워커 — 앱을 닫아 둬도 알림이 오게 하는 유일한 길.
//
// ⚠ 이 파일은 **뿌리(/sw.js)에 있어야 한다.** 서비스 워커는 자기가 놓인 자리 아래만 맡는다.
//   하위 폴더에 두면 앱 전체를 못 맡아 푸시를 못 받는다.
// ⚠ 캐시는 하지 않는다. 앱이 51만 자짜리 한 파일이라 옛 판을 물고 있으면
//   고친 것이 안 보인다. 여기서는 **알림만** 다룬다.
//
// 브라우저마다 푸시를 나르는 회사가 다르다 — 크롬은 구글, 아이폰은 애플.
// 우리는 표준 웹푸시(VAPID)로 보내므로 양쪽 다 같은 코드로 받는다.

// 설치되면 기다리지 않고 바로 일한다. 안 그러면 옛 워커가 살아 있는 동안 새 판이 논다.
self.addEventListener("install", function () { self.skipWaiting(); });
self.addEventListener("activate", function (e) { e.waitUntil(self.clients.claim()); });

// ⚠ 아이폰·안드로이드 모두 «푸시를 받으면 반드시 알림을 띄워야» 한다(userVisibleOnly).
//   조용히 넘기면 브라우저가 구독을 끊어 버린다. 그래서 내용을 못 읽어도 무언가는 띄운다.
self.addEventListener("push", function (e) {
  var d = {};
  try { d = e.data ? e.data.json() : {}; } catch (err) {
    try { d = { body: e.data.text() }; } catch (e2) { d = {}; }
  }
  var title = d.title || "팀체크";
  var opt = {
    body: d.body || "새 소식이 있습니다",
    icon: "/icon-192.png",
    badge: "/icon-192.png",
    // 같은 tag 면 덮어쓴다 — 할 일 세 개가 한꺼번에 와도 알림이 세 줄로 쌓이지 않는다
    tag: d.tag || "teamcheck",
    renotify: true,
    data: { url: d.url || "/" },
  };
  e.waitUntil(self.registration.showNotification(title, opt));
});

// 알림을 누르면 이미 열어 둔 팀체크로 간다. 없을 때만 새로 연다 —
// 누를 때마다 창이 하나씩 늘면 못 쓴다.
self.addEventListener("notificationclick", function (e) {
  e.notification.close();
  var url = (e.notification.data && e.notification.data.url) || "/";
  e.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(function (list) {
    for (var i = 0; i < list.length; i++) {
      var c = list[i];
      if (c.url.indexOf(self.location.origin) === 0 && "focus" in c) {
        if ("navigate" in c && url !== "/") { try { c.navigate(url); } catch (err) {} }
        return c.focus();
      }
    }
    return self.clients.openWindow(url);
  }));
});

// 브라우저가 구독을 갈아 끼울 때가 있다. 앱이 다음에 열릴 때 다시 등록하므로
// 여기서는 조용히 넘긴다 — 워커에는 로그인 토큰이 없어 서버에 알릴 수 없다.
self.addEventListener("pushsubscriptionchange", function () {});
