/* 무대 배치: stage.json의 값대로 그림을 놓습니다. 첫 화면(index.html)과 배치 도구(tools/stage-editor.html)가 함께 씁니다.

   - maxWidth: 무대 틀의 최대 폭(px). 화면이 이보다 넓어도 커튼과 그림은 이 틀 안에서만 움직여요.
   - 각 그림(layers)
       anchor: 고정점. 첫 글자 l(왼쪽)·c(가운데)·r(오른쪽), 둘째 글자 t(위)·m(가운데)·b(아래).
               그림의 같은 점이 틀의 같은 점에 붙어 있어요. 예) "lt"는 그림 왼쪽 위 모서리를 틀 왼쪽 위에.
       x, y:   고정점에서 옮긴 거리(오른쪽·아래가 +). 단위는 무대 높이의 %.
       h:      그림 높이(무대 높이의 %). 폭은 그림 비율대로.
       o:      불투명도(0~1), hide: true면 숨김
   - valance(천장 커튼)는 무대 전체 폭에 가로로 반복돼요. h는 한 칸의 높이, y는 위에서 내린 거리. */
(function () {
  const DEFAULT = {
    maxWidth: 1180,
    layers: {
      valance:   { h: 24, y: 0 },
      world:     { anchor: "cb", x: 0, y: 0, h: 86 },
      sparkles:  { anchor: "ct", x: 0, y: 2, h: 72, o: .7 },
      cloudsL:   { anchor: "lb", x: 0, y: 6, h: 58 },
      cloudsR:   { anchor: "rb", x: 0, y: 6, h: 58 },
      drapeL:    { anchor: "lt", x: 0, y: 0, h: 100 },
      drapeR:    { anchor: "rt", x: 0, y: 0, h: 100 },
      title:     { anchor: "ct", x: 0, y: 24 },
    },
  };

  function merge(cfg) {
    const out = { maxWidth: (cfg && cfg.maxWidth) || DEFAULT.maxWidth, layers: {} };
    for (const k in DEFAULT.layers) out.layers[k] = Object.assign({}, DEFAULT.layers[k], cfg && cfg.layers && cfg.layers[k]);
    return out;
  }

  function place(scene, cfg) {
    const frame = scene.querySelector(".stage-frame");
    frame.style.width = `min(100%, ${cfg.maxWidth}px)`;
    const H = frame.clientHeight || scene.clientHeight;
    const px = v => (v || 0) * H / 100 + "px";
    for (const id in cfg.layers) {
      const el = scene.querySelector(`[data-layer="${id}"]`);
      if (!el) continue;
      const L = cfg.layers[id];
      el.style.display = L.hide ? "none" : "";
      el.style.opacity = L.o == null ? "" : L.o;
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

  // scene에 배치를 적용하고, 무대 크기가 바뀔 때마다 다시 맞춥니다. 돌려준 함수로 새 배치를 넣을 수 있어요.
  function attach(scene, cfg) {
    let cur = merge(cfg);
    const run = () => place(scene, cur);
    run();
    if (window.ResizeObserver) new ResizeObserver(run).observe(scene);
    else addEventListener("resize", run);
    return next => { cur = merge(next); run(); return cur; };
  }

  window.Stage = { DEFAULT, merge, place, attach };
})();
