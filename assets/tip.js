/* 维度说明气泡：点 ? 展开，再点收起；同时只开一个。
   文案来自 assets/dims-data.js 的 window.VELAB_TIPS。 */
(function () {
  "use strict";

  var open = null;   // 当前打开的 { btn, tip }

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c];
    });
  }

  function build(key) {
    var d = (window.VELAB_TIPS || {})[key];
    if (!d) return "";

    var points = (d.points || []).map(function (p) {
      return "<li>" + esc(p) + "</li>";
    }).join("");

    var anchors = (d.anchors || []).map(function (a, i) {
      var n = [1, 3, 5][i] || i + 1;
      return '<div class="tip-anc"><em>' + n + "</em><span>" + esc(a) + "</span></div>";
    }).join("");

    return '' +
      '<div class="tip-h"><b>' + esc(d.name) + "</b>" +
        '<i>' + esc(d.en || "") + "</i>" +
        (d.gate ? '<span class="tip-gate">门槛维</span>' : "") +
      "</div>" +
      '<div class="tip-lb">定义</div>' +
      "<p>" + esc(d.def) + "</p>" +
      (d.not ? '<p class="tip-muted">不管：' + esc(d.not) + "</p>" : "") +
      (points ? '<div class="tip-lb">观察点</div><ul class="tip-ul">' + points + "</ul>" : "") +
      (anchors ? '<div class="tip-lb">锚点</div>' + anchors : "") +
      (d.warn ? '<div class="tip-warn">' + esc(d.warn) + "</div>" : "");
  }

  function close() {
    if (!open) return;
    open.tip.remove();
    open.btn.classList.remove("on");
    open.btn.setAttribute("aria-expanded", "false");
    open = null;
  }

  function place(tip, btn) {
    var r = btn.getBoundingClientRect();
    var w = tip.offsetWidth || 344;
    var pad = 10;
    var vh = window.innerHeight;

    /* 高度上限：上下留边距，超高就在气泡内部滚动，避免整块跳到屏幕顶部 */
    var maxH = Math.min(420, vh - pad * 2);
    tip.style.maxHeight = maxH + "px";
    var h = Math.min(tip.offsetHeight || 320, maxH);

    var left = r.left - 12;
    if (left + w > window.innerWidth - pad) left = window.innerWidth - pad - w;
    if (left < pad) left = pad;

    var below = vh - r.bottom - 8 - pad;
    var above = r.top - 8 - pad;
    var top;
    if (below >= Math.min(h, 240) || below >= above) {
      top = r.bottom + 8;
    } else {
      top = Math.max(pad, r.top - 8 - h);
    }
    if (top + h > vh - pad) top = Math.max(pad, vh - pad - h);

    tip.style.left = Math.round(left) + "px";
    tip.style.top = Math.round(top) + "px";
  }

  function show(btn) {
    var key = btn.getAttribute("data-tip");
    var html = build(key);
    if (!html) return;

    if (open && open.btn === btn) { close(); return; }
    close();

    var tip = document.createElement("div");
    tip.className = "tip";
    tip.setAttribute("role", "dialog");
    tip.innerHTML = html;
    document.body.appendChild(tip);

    btn.classList.add("on");
    btn.setAttribute("aria-expanded", "true");
    open = { btn: btn, tip: tip };
    place(tip, btn);
  }

  document.addEventListener("click", function (e) {
    var btn = e.target.closest ? e.target.closest(".q[data-tip]") : null;
    if (btn) {
      e.preventDefault();
      e.stopPropagation();
      show(btn);
      return;
    }
    if (open && !e.target.closest(".tip")) close();
  });

  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape") close();
  });

  window.addEventListener("scroll", close, true);
  window.addEventListener("resize", close);

})();
