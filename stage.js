/* 무대 배치: stage.json의 값대로 그림을 놓습니다. 첫 화면(index.html)과 배치 도구(tools/stage-editor.html)가 함께 씁니다.

   stage.json은 화면 규격마다 배치를 하나씩 가져요: { "phone": {...}, "tabletP": {...}, "tabletL": {...}, "wide": {...} }
   규격 고르기: 폭 640 미만은 phone, 세로로 긴 화면은 tabletP, 폭 1400 미만은 tabletL, 그보다 넓으면 wide.

   배치 하나의 모양
   - maxWidth: 무대 틀의 최대 폭(px). 화면이 이보다 넓어도 커튼과 그림은 이 틀 안에서만 움직여요.
   - layers: 그림마다
       anchor: 고정점. 첫 글자 l(왼쪽)·c(가운데)·r(오른쪽), 둘째 글자 t(위)·m(가운데)·b(아래).
               그림의 같은 점이 틀의 같은 점에 붙어 있어요. 예) "lt"는 그림 왼쪽 위 모서리를 틀 왼쪽 위에.
       x, y:   고정점에서 옮긴 거리(오른쪽·아래가 +). 단위는 무대 높이의 %.
       h:      그림 높이(무대 높이의 %). 폭은 그림 비율대로.
       o:      불투명도(0~1), hide: true면 숨김
   - order: 그림 순서(앞쪽이 뒤에, 끝쪽이 맨 앞에 보여요). fade는 무대 아래를 어둡게 덮는 그라데이션.
     valance(천장 커튼)는 무대 전체 폭에 가로로 반복돼요. h는 한 칸의 높이, y는 위에서 내린 거리. */
(function () {
  const SIZES = [
    { key: "phone", name: "아이폰" },
    { key: "tabletP", name: "아이패드 세로" },
    { key: "tabletL", name: "아이패드 가로" },
    { key: "wide", name: "넓은 화면" },
  ];
  const DEFAULT = {
    maxWidth: 1180,
    layers: {
      valance:  { h: 24, y: 0 },
      worldL:   { anchor: "lb", x: 10, y: -12, h: 62 },
      worldR:   { anchor: "rb", x: -10, y: -12, h: 70 },
      sparkles: { anchor: "ct", x: 0, y: 2, h: 72, o: .7 },
      cloudsL:  { anchor: "lb", x: 0, y: 6, h: 58 },
      cloudsR:  { anchor: "rb", x: 0, y: 6, h: 58 },
      book:     { anchor: "cb", x: 0, y: -2, h: 44 },
      drapeL:   { anchor: "lt", x: 0, y: 0, h: 100 },
      drapeR:   { anchor: "rt", x: 0, y: 0, h: 100 },
      title:    { anchor: "ct", x: 0, y: 24 },
      fade:     {},
    },
    order: ["worldL", "worldR", "sparkles", "cloudsL", "cloudsR", "book", "fade", "drapeL", "drapeR", "valance", "title"],
  };

  function sizeKey(w, portrait) {
    if (w < 640) return "phone";
    if (portrait) return "tabletP";
    return w < 1400 ? "tabletL" : "wide";
  }

  // 배치 하나: 빠진 값은 기본값으로
  function merge(cfg) {
    const out = { maxWidth: (cfg && cfg.maxWidth) || DEFAULT.maxWidth, layers: {} };
    for (const k in DEFAULT.layers) out.layers[k] = Object.assign({}, DEFAULT.layers[k], cfg && cfg.layers && cfg.layers[k]);
    // 순서: 저장된 순서를 따르고, 새로 생긴 그림은 기본 순서의 자리에 끼워 넣기
    const order = ((cfg && cfg.order) || []).filter((k, i, a) => k in DEFAULT.layers && a.indexOf(k) === i);
    DEFAULT.order.forEach((k, i) => { if (!order.includes(k)) order.splice(Math.min(i, order.length), 0, k); });
    out.order = order;
    return out;
  }
  // 파일 전체: 규격마다 배치 하나씩(없는 규격은 다른 규격이나 예전 한 장짜리 배치를 따라감)
  function normalize(file) {
    file = file || {};
    const any = file.layers ? file : SIZES.map(s => file[s.key]).find(Boolean);
    const out = {};
    for (const s of SIZES) out[s.key] = merge(file[s.key] || any);
    return out;
  }

  function place(scene, cfg) {
    const frame = scene.querySelector(".stage-frame");
    frame.style.width = `min(100%, ${cfg.maxWidth}px)`;
    const H = frame.clientHeight || scene.clientHeight;
    const px = v => (v || 0) * H / 100 + "px";
    cfg.order.forEach((id, i) => { const el = scene.querySelector(`[data-layer="${id}"]`); if (el) el.style.zIndex = 2 + i; });
    for (const id in cfg.layers) {
      const el = scene.querySelector(`[data-layer="${id}"]`);
      if (!el) continue;
      const L = cfg.layers[id];
      el.style.display = L.hide ? "none" : "";
      el.style.opacity = L.o == null ? "" : L.o;
      if (id === "fade") continue;
      if (id === "valance") {
        el.style.top = px(L.y); el.style.height = px(L.h);
        continue;
      }
      const a = L.anchor || "ct", hx = a[0], vy = a[1];
      el.style.left = el.style.right = el.style.top = el.style.bottom = "auto";
      if (L.h != null) { el.style.height = px(L.h); el.style.width = "auto"; }
      if (hx === "l") el.style.left = px(L.x);
      else if (hx === "r") el.style.right = px(-L.x);
      else el.style.left = `calc(50% + ${px(L.x)})`;
      if (vy === "t") el.style.top = px(L.y);
      else if (vy === "b") el.style.bottom = px(-L.y);
      else el.style.top = `calc(50% + ${px(L.y)})`;
      el.style.translate = `${hx === "c" ? "-50%" : "0"} ${vy === "m" ? "-50%" : "0"}`;
    }
  }

  // 첫 화면용: 화면 규격에 맞는 배치를 놓고, 크기가 바뀔 때마다 다시 맞춥니다. 돌려준 함수로 새 파일 내용을 넣어요.
  function attach(scene, file) {
    let all = normalize(file);
    const run = () => place(scene, all[sizeKey(scene.clientWidth, innerHeight > innerWidth)]);
    run();
    if (window.ResizeObserver) new ResizeObserver(run).observe(scene);
    addEventListener("resize", run);
    return next => { all = normalize(next); run(); };
  }

  window.Stage = { SIZES, DEFAULT, sizeKey, merge, normalize, place, attach };
})();
