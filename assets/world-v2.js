/* 世界模型评测 · v2 预览
   与 v1 的三点不同：
   1. 维度有第三态 N/A（不可比），必须选原因，不进均分、不进多数票
   2. 能力矩阵 + 模型档案：先说「这组能比什么」，再打分
   3. 逐维 A/B 证据：每维两侧各一个下拉 + 依据 + 记录时间戳
   数据优先读 models.json / cases.json；失败（file:// 打开）用内置兜底。 */
(() => {
  "use strict";

  const KEY = "velab_world_v3";
  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
  const esc = (v) => String(v == null ? "" : v).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const toast = (msg) => {
    if (window.VELAB && typeof window.VELAB.toast === "function") window.VELAB.toast(msg);
  };

  const DIMS = [
    { key: "instruction", name: "指令遵循", why: "动作序列 / 位移要求" },
    { key: "physics", name: "物理合理性", why: "碰撞、重力、材质" },
    { key: "camera", name: "相机控制", why: "视角是否可控" },
    { key: "memory", name: "记忆一致性", why: "回访位置是否复原" },
  ];

  // 三档量表：1/3/5 各有锚点，2/4 无定义 → 评分者自由发挥，属噪声。
  const SCALE = [1, 3, 5];
  const SCALE_HINT = {
    1: "1 分 · 明显不成立（锚点见方法页）",
    3: "3 分 · 部分成立 / 有明显但非致命的缺陷",
    5: "5 分 · 完全成立（锚点见方法页）",
  };

  const NA_REASONS = [
    "不具备该能力",
    "范式不同（引擎辅助 / 非生成）",
    "输入被拒（参考图 / prompt 不支持）",
    "入口未开放",
  ];

  /* 兜底数据：能力事实来自 models.json / 实测记录，接入真实数据后可整体改为读 JSON */
  let MODELS = [
    {
      id: "genie-4", name: "Genie 4", vendor: "Google DeepMind",
      access: "AI Ultra 会员（美区 Project Genie）",
      res: "720p", fps: 24, session_limit_sec: 120,
      controls: "实时漫游（WASD + 视角）",
      paradigm: "generative", rate: null, na: {},
    },
    {
      id: "hy-nomas", name: "Hy-Nomas", vendor: "腾讯混元",
      access: "官方 demo（网页：先生成世界，再进相机控制实时驱动）",
      res: "1280x704", fps: 24, session_limit_sec: 60,
      controls: "两段式：prompt 生成世界 → 相机控制 WASD + 方向键（可录制）",
      paradigm: "generative", rate: null, na: {},
    },
    {
      id: "matrix-game-4", name: "Matrix-Game 4.0", vendor: "昆仑万维 Skywork",
      access: "自部署 / 研究入口",
      res: "864x480", fps: 60, session_limit_sec: null,
      controls: "实时漫游（WASD + 视角）",
      paradigm: "engine-assisted", rate: null,
      na: { physics: "范式不同（引擎辅助 / 非生成）", memory: "范式不同（引擎辅助 / 非生成）" },
    },
    {
      id: "happy-oyster", name: "HappyOyster", vendor: "阿里巴巴",
      access: "Reactor 托管（按会话计费）",
      res: "720p", fps: null, session_limit_sec: 180,
      controls: "起始帧 + 第一人称 + WASD",
      paradigm: "generative", rate: 1.668, na: {},
    },
    {
      id: "zing-0.5", name: "Zing-0.5", vendor: "Loopit（开源）",
      access: "Hugging Face Space（ZeroGPU 排队）/ 自部署",
      res: "832x480", fps: 24, session_limit_sec: null,
      controls: "参考图 + 动作/文本条件（非实时漫游）",
      paradigm: "generative", rate: null, na: {},
    },
  ];

  let CLIPS = {};

  let SCENES = [
    {
      id: "S02", name: "S02 · 绕桌一圈回起点", duration_sec: 10,
      action: "沿桌子右侧绕行 6s → 回到起点，面向桌子",
      expect: "回到起点时桌子、杯子的位置与初始一致；遮挡关系正确",
    },
    {
      id: "S05", name: "S05 · 180 度转身", duration_sec: 8,
      action: "原地 180 度转身 → 停 2s",
      expect: "转身后同一位置的地标与转身前一致；无新增 / 消失物体",
    },
  ];

  async function loadData() {
    /* 真实录屏（4 场景 × 2 模型）：优先接管场景与配对 */
    try {
      const r = await fetch("assets/world/clips.json", { cache: "no-store" });
      if (r.ok) {
        const j = await r.json();
        if (j && Array.isArray(j.scenes) && j.scenes.length) {
          CLIPS = {};
          SCENES = j.scenes.map((s) => {
            CLIPS[s.id] = s.clips || {};
            const durs = Object.values(s.clips || {}).map((c) => Number(c.dur) || 0);
            return {
              id: s.id,
              name: s.name,
              duration_sec: durs.length ? Math.round(Math.max.apply(null, durs)) : (s.duration_sec || 0),
              action: s.action || "",
              expect: s.expect || "",
              ref: s.ref || "",
              pair: Array.isArray(s.pair) && s.pair.length ? s.pair : null,
            };
          });
        }
      }
    } catch (e) { /* 兜底 */ }

    try {
      const [mr, cr] = await Promise.all([
        fetch("models.json", { cache: "no-store" }).then((r) => (r.ok ? r.json() : null)),
        fetch("cases.json", { cache: "no-store" }).then((r) => (r.ok ? r.json() : null)),
      ]);
      const list = (mr && (mr.models || mr)) || null;
      const inter = Array.isArray(list) ? list.filter((m) => m && m.kind !== "t2v" && m.paradigm) : null;
      const live = (mr && mr.interactive) || inter;
      if (Array.isArray(live) && live.length) {
        const fb = MODELS;
        MODELS = live.map((x) => {
          const base = MODELS.find((b) => b.id === x.id) || {};
          return {
            ...base,
            id: x.id,
            name: x.name || base.name || x.id,
            vendor: x.vendor || base.vendor || "",
            access: x.access || base.access || "",
            res: x.resolution || base.res || "—",
            fps: x.fps === undefined ? base.fps : x.fps,
            session_limit_sec: x.session_limit_sec === undefined ? base.session_limit_sec : x.session_limit_sec,
            controls: x.controls || base.controls || "",
            paradigm: x.paradigm || base.paradigm || "generative",
            na: base.na || {},
            rate: base.rate === undefined ? null : base.rate,
          };
        });
        /* clips.json 里出现、但 models.json 没登记的模型，用兜底档案补齐 */
        Object.values(CLIPS).forEach((clips) => {
          Object.keys(clips || {}).forEach((id) => {
            if (!MODELS.find((m) => m.id === id)) {
              const b = fb.find((m) => m.id === id);
              if (b) MODELS.push(b);
            }
          });
        });
      }
      if (cr && Array.isArray(cr.interactive_scenes) && cr.interactive_scenes.length) {
        SCENES = SCENES.map((s) => {
          const j = cr.interactive_scenes.find((x) => x.id === s.id);
          if (!j) return s;
          return {
            ...s,
            duration_sec: j.duration_sec || s.duration_sec,
            action: j.action || s.action,
            expect: j.expect || s.expect,
          };
        });
      }
    } catch (e) {
      /* 兜底数据即可，不打断页面 */
    }
  }

  const fresh = () => ({
    scene: "S02",
    side: "A",
    slots: { A: "hy-nomas", B: "happy-oyster" },
    cells: {},
    votes: {},
  });

  let state = fresh();
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) state = Object.assign(fresh(), JSON.parse(raw));
    if (!state.slots || !state.slots.A) state.slots = { A: "hy-nomas", B: "happy-oyster" };
  } catch (e) {}
  const persist = () => {
    try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) {}
  };

  const modelOf = (id) => MODELS.find((m) => m.id === id) || MODELS[0];
  const sceneOf = (id) => SCENES.find((s) => s.id === id) || SCENES[0];
  const scenePair = () => {
    const s = sceneOf(state.scene);
    if (Array.isArray(s.pair) && s.pair.length >= 2) return s.pair;
    const clips = CLIPS[state.scene];
    if (clips) {
      const ids = Object.keys(clips);
      if (ids.length >= 2) return ids.slice(0, 2);
    }
    return null;
  };
  const clipOf = (modelId) => (CLIPS[state.scene] || {})[modelId] || null;
  /* 「单模型 Rubric」模式已下线：绝对分本身就是 A/B 两侧独立打分的副产品。
     只在对手缺失时降级为单侧评分——此时不产生 GSB。 */
  const pairKey = () => state.scene + "|" + state.slots.A + "~" + state.slots.B;

  /* 格子按「场景 × 模型」存：换模型不会把上一个模型的分数和 N/A 带过来 */
  function modelCell(modelId) {
    const k = state.scene + "|" + modelId;
    if (!state.cells[k]) state.cells[k] = { dims: {}, na: {}, fields: {} };
    if (!state.cells[k].fields) state.cells[k].fields = {};
    if (!state.cells[k].notes) state.cells[k].notes = {};
    return state.cells[k];
  }
  const cellOf = (side) => modelCell(state.slots[side]);
  const currentSide = () => state.side;
  const currentModel = () => modelOf(state.slots[currentSide()]);
  const currentCell = () => cellOf(currentSide());

  /* 模型自带的「这一维不适用」，先预置；评的人可以点数字覆盖 */
  function seedInto(model, c) {
    Object.entries(model.na || {}).forEach(([dim, reason]) => {
      if (c.dims[dim] === undefined && c.na[dim] === undefined) c.na[dim] = reason;
    });
  }

  const numDims = (c) => DIMS.filter((d) => typeof c.dims[d.key] === "number");
  const naDims = (c) => DIMS.filter((d) => c.dims[d.key] === undefined && c.na[d.key]);
  const absentDims = (c) => DIMS.filter((d) => c.dims[d.key] === undefined && !c.na[d.key]);
  const avgOf = (c) => {
    const ns = numDims(c);
    return ns.length ? ns.reduce((s, d) => s + c.dims[d.key], 0) / ns.length : null;
  };
  const sideComplete = (c) => DIMS.every((d) => typeof c.dims[d.key] === "number" || c.na[d.key]);

  /* ---------------- 渲染 ---------------- */

  function renderScenes() {
    const cnt = document.querySelector(".queue-head .count");
    if (cnt) cnt.textContent = String(SCENES.length);
    $("#scene-list").innerHTML = SCENES.map((s) => {
      const on = s.id === state.scene ? "active" : "";
      return `<div class="case ${on}" data-scene="${s.id}">
        <strong>${esc(s.name)}</strong>
        <span>${s.duration_sec}s · ${DIMS.length} 维</span>
      </div>`;
    }).join("");
  }

  function renderMatrix() {
    const a = modelOf(state.slots.A);
    const b = modelOf(state.slots.B);
    const row = (d) => {
      const dot = (m) => (m.na && m.na[d.key]
        ? `<td><span class="dot na" title="不可比：${esc(m.na[d.key])}">○</span></td>`
        : `<td><span class="dot ok" title="可比">●</span></td>`);
      return `<tr><th>${esc(d.name)}</th>${dot(a)}${dot(b)}</tr>`;
    };
    $("#matrix").innerHTML = `<table class="matrix-table">
      <thead><tr><th>维度</th><th>${esc(a.name)}</th><th>${esc(b.name)}</th></tr></thead>
      <tbody>${DIMS.map(row).join("")}</tbody>
    </table>`;
  }

  function renderArchive() {
    $("#archive").innerHTML = MODELS.map((m) => {
      const na = Object.keys(m.na || {});
      return `<details class="arc">
        <summary>${esc(m.name)}<span class="tag">${esc(m.vendor)} ›</span></summary>
        <dl>
          <dt>入口</dt><dd>${esc(m.access)}</dd>
          <dt>画质</dt><dd>${esc(m.res)}${m.fps ? " · " + m.fps + "fps" : ""}${m.session_limit_sec ? " · 单次 " + m.session_limit_sec + "s" : ""}</dd>
          <dt>控制</dt><dd>${esc(m.controls)}</dd>
          <dt>范式</dt><dd>${m.paradigm === "engine-assisted" ? "引擎辅助（状态不由模型持有）" : "纯生成"}</dd>
          <dt>计价</dt><dd>${m.rate ? "$" + m.rate.toFixed(3) + " / 分钟（按会话时长）" : "免费 demo / 未知"}</dd>
          ${na.length ? `<dt>不可比</dt><dd>${na.map((k) => (DIMS.find((d) => d.key === k) || {}).name + "（" + esc(m.na[k]) + "）").join("<br>")}</dd>` : ""}
        </dl>
      </details>`;
    }).join("");
  }

  function renderPairControls() {
    const pair = scenePair();
    const list = pair ? pair.map(modelOf) : MODELS;
    const opts = (sel) => list.map((m) => `<option value="${esc(m.id)}" ${m.id === sel ? "selected" : ""}>${esc(m.name)}</option>`).join("");
    $("#pair-a").innerHTML = opts(state.slots.A);
    $("#pair-b").innerHTML = opts(state.slots.B);
  }

  function renderStageHead() {
    const s = sceneOf(state.scene);
    $("#world-title").textContent = s.name;
    $("#world-action").textContent = s.action;
    $("#world-expect").textContent = s.expect;
  }

  function revealedNow() {
    return !!(state.votes[pairKey()] || {}).revealed;
  }

  /* ---------------- 播放器：caption 式时间轴 ---------------- */

  const T = { time: 0, playing: false, rate: 1, fps: 24, raf: 0, keybound: false };

  const slotVids = () => Array.prototype.slice.call(document.querySelectorAll("#slots video"));
  const durOf = (v) => (v && Number.isFinite(v.duration) && v.duration > 0 ? v.duration : 0);
  const spanOf = () => {
    const ds = slotVids().map(durOf).filter((d) => d > 0);
    return ds.length ? Math.min.apply(null, ds) : 0;
  };
  const tcOf = (sec) => {
    const s = Math.max(0, sec || 0);
    const m = Math.floor(s / 60);
    const r = s - m * 60;
    const w = Math.floor(r);
    const ms = Math.round((r - w) * 1000);
    return String(m).padStart(2, "0") + ":" + String(w).padStart(2, "0") + "." + String(ms).padStart(3, "0");
  };
  function rulerTicks(total) {
    const step = total <= 8 ? 1 : total <= 20 ? 2 : 5;
    const out = [];
    for (let t = 0; t < total - 0.02; t += step) out.push(t);
    out.push(total);
    return out;
  }

  function paintTransport() {
    const total = spanOf();
    const pos = Math.max(0, Math.min(T.time, total || 0));
    const read = $("#tp-read");
    if (read) read.textContent = tcOf(pos) + " / " + tcOf(total);
    const head = $("#tp-playhead");
    if (head) head.style.left = (total > 0 ? (pos / total) * 100 : 0) + "%";
    const ruler = $("#tp-ruler");
    if (ruler && ruler.dataset.total !== String(total)) {
      ruler.dataset.total = String(total);
      ruler.innerHTML = rulerTicks(total)
        .map((t) => `<span style="left:${total > 0 ? (t / total) * 100 : 0}%">${tcOf(t)}</span>`)
        .join("");
    }
    const seg = $("#tp-seg");
    if (seg) seg.textContent = sceneOf(state.scene).name;
    const hint = $("#tp-hint");
    if (hint) {
      hint.textContent = total > 0
        ? `共同区间 0–${total.toFixed(3)} 秒 · 帧步 1/${T.fps} 秒 · 空格播放，←→ 走一帧`
        : "本场景还没有可用的片段";
    }
    const play = $("#tp-play");
    if (play) play.textContent = T.playing ? "⏸ 暂停" : "▶ 播放";
  }

  function seekAll(t) {
    const total = spanOf();
    T.time = Math.max(0, total > 0 ? Math.min(t, total) : t);
    slotVids().forEach((v) => {
      try { v.currentTime = Math.min(T.time, durOf(v) || T.time); } catch (e) {}
    });
    paintTransport();
    paintCompare(true);
  }

  function pauseAll() {
    T.playing = false;
    cancelAnimationFrame(T.raf);
    slotVids().forEach((v) => { try { v.pause(); } catch (e) {} });
    paintTransport();
    paintCompare(true);
  }

  function probeFps(v) {
    if (!v || !v.requestVideoFrameCallback) return;
    let last = -1;
    const deltas = [];
    const step = (now, meta) => {
      if (last >= 0) {
        const d = meta.mediaTime - last;
        if (d > 0.005 && d < 0.2) deltas.push(d);
      }
      last = meta.mediaTime;
      if (deltas.length >= 8) {
        deltas.sort((a, b) => a - b);
        const med = deltas[Math.floor(deltas.length / 2)];
        if (med > 0) {
          const fps = Math.round(1 / med);
          if (fps >= 12 && fps <= 60 && fps !== T.fps) { T.fps = fps; paintTransport(); }
        }
        return;
      }
      if (T.playing) v.requestVideoFrameCallback(step);
    };
    v.requestVideoFrameCallback(step);
  }

  function startTick() {
    const vs = slotVids();
    if (!vs.length) return;
    const lead = vs[0];
    cancelAnimationFrame(T.raf);
    const tick = () => {
      if (!T.playing) return;
      const total = spanOf();
      T.time = Math.max(0, Math.min(lead.currentTime, total || lead.currentTime));
      vs.forEach((v) => {
        if (v !== lead && !v.paused && Math.abs(v.currentTime - lead.currentTime) > 0.12) {
          try { v.currentTime = lead.currentTime; } catch (e) {}
        }
      });
      paintTransport();
      paintCompare(false);
      if (total > 0 && T.time >= total - 0.03) { seekAll(total); pauseAll(); return; }
      T.raf = requestAnimationFrame(tick);
    };
    T.raf = requestAnimationFrame(tick);
  }

  function playAll() {
    const vs = slotVids();
    if (!vs.length || !spanOf()) { toast("本场景还没有可用的片段"); return; }
    if (T.time >= spanOf() - 0.02) T.time = 0;
    T.playing = true;
    vs.forEach((v) => {
      try {
        v.currentTime = Math.min(T.time, durOf(v) || T.time);
        v.playbackRate = T.rate;
      } catch (e) {}
      const p = v.play();
      if (p && p.catch) p.catch(() => {});
    });
    probeFps(vs[0]);
    startTick();
    paintTransport();
  }

  function stepFrames(n) {
    pauseAll();
    seekAll(T.time + n / T.fps);
  }

  function bindTransport() {
    const play = $("#tp-play");
    const back = $("#tp-back");
    const fwd = $("#tp-fwd");
    const home = $("#tp-home");
    const rate = $("#tp-rate");
    const track = $("#tp-track");
    if (play) play.onclick = () => (T.playing ? pauseAll() : playAll());
    if (back) back.onclick = () => stepFrames(-1);
    if (fwd) fwd.onclick = () => stepFrames(1);
    if (home) home.onclick = () => { pauseAll(); seekAll(0); };
    if (rate) {
      rate.onchange = (e) => {
        T.rate = Number(e.target.value) || 1;
        slotVids().forEach((v) => { try { v.playbackRate = T.rate; } catch (err) {} });
      };
    }
    if (track) {
      const jump = (e) => {
        const r = track.getBoundingClientRect();
        if (!r.width) return;
        const x = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width));
        pauseAll();
        seekAll(x * spanOf());
      };
      track.onpointerdown = (e) => {
        e.preventDefault();
        jump(e);
        const move = (ev) => jump(ev);
        const up = () => {
          window.removeEventListener("pointermove", move);
          window.removeEventListener("pointerup", up);
        };
        window.addEventListener("pointermove", move);
        window.addEventListener("pointerup", up);
      };
    }
    if (!T.keybound) {
      T.keybound = true;
      document.addEventListener("keydown", (e) => {
        const tag = (e.target.tagName || "").toUpperCase();
        if (["INPUT", "TEXTAREA", "SELECT", "BUTTON"].indexOf(tag) >= 0) return;
        if (e.key === "ArrowLeft") { e.preventDefault(); stepFrames(-1); }
        else if (e.key === "ArrowRight") { e.preventDefault(); stepFrames(1); }
        else if (e.key === " ") { e.preventDefault(); if (T.playing) pauseAll(); else playAll(); }
      });
    }
  }

  /* ---------------- 同位姿取帧 ---------------- */

  const CMP = { base: {}, cur: {}, ready: {}, last: 0 };

  function small(side, key) {
    if (!CMP[key][side]) {
      const c = document.createElement("canvas");
      c.width = 64;
      c.height = 36;
      CMP[key][side] = c;
    }
    return CMP[key][side];
  }

  function baseBlank(canvas) {
    const d = canvas.getContext("2d").getImageData(0, 0, 64, 36).data;
    for (let i = 0; i < d.length; i += 4) {
      if (d[i] + d[i + 1] + d[i + 2] + d[i + 3] > 0) return false;
    }
    return true;
  }

  function captureBase(side, v) {
    if (!v || !v.videoWidth || v.readyState < 2) return;
    const c = small(side, "base");
    c.getContext("2d").drawImage(v, 0, 0, 64, 36);
    if (baseBlank(c)) return;
    const full = document.querySelector('[data-frame="' + side + '0"]');
    if (full) full.getContext("2d").drawImage(v, 0, 0, full.width, full.height);
    CMP.ready[side] = true;
  }

  function paintCompare(force) {
    const now = performance.now();
    if (!force && now - CMP.last < 120) return;
    CMP.last = now;
    const vs = slotVids();
    ["A", "B"].forEach((side, i) => {
      const v = vs[i];
      if (!v || !v.videoWidth) return;
      if (!CMP.ready[side] && v.readyState >= 2 && v.currentTime < 0.12) captureBase(side, v);
      const full = document.querySelector('[data-frame="' + side + 't"]');
      if (full) full.getContext("2d").drawImage(v, 0, 0, full.width, full.height);
      const tLab = document.querySelector('[data-t="' + side + '"]');
      if (tLab) tLab.textContent = tcOf(v.currentTime);
      const lab = document.querySelector('[data-diff="' + side + '"]');
      if (!CMP.ready[side]) { if (lab) lab.textContent = "—"; return; }
      const cur = small(side, "cur");
      cur.getContext("2d").drawImage(v, 0, 0, 64, 36);
      const a = small(side, "base").getContext("2d").getImageData(0, 0, 64, 36).data;
      const b = cur.getContext("2d").getImageData(0, 0, 64, 36).data;
      let sum = 0;
      for (let k = 0; k < a.length; k += 4) {
        sum += Math.abs(a[k] - b[k]) + Math.abs(a[k + 1] - b[k + 1]) + Math.abs(a[k + 2] - b[k + 2]);
      }
      const pct = (sum / (64 * 36 * 3 * 255)) * 100;
      if (lab) lab.textContent = "差异 " + pct.toFixed(1) + "%";
    });
  }

  let slotsKey = "";

  function chipOf(side) {
    const c = cellOf(side);
    const avg = avgOf(c);
    const n = numDims(c).length;
    const naN = naDims(c).length;
    return avg === null ? "—" : "均分 " + avg.toFixed(2) + " · " + n + "/" + DIMS.length + (naN ? " · " + naN + " N/A" : "");
  }

  function renderSlots() {
    const revealed = revealedNow();
    const sides = ["A", "B"];
    const key = state.scene + "|" + state.slots.A + "~" + state.slots.B;
    const host = $("#slots");
    /* 只换分数胶囊，不重建 <video>：重建会打断播放与取帧 */
    if (key === slotsKey && host.children.length === 2) {
      sides.forEach((side, i) => {
        const chip = host.children[i].querySelector(".avg");
        if (chip) chip.textContent = chipOf(side);
      });
      return;
    }
    slotsKey = key;
    host.className = "world-grid two-col";
    host.innerHTML = sides.map((side) => {
      const m = modelOf(state.slots[side]);
      const clip = clipOf(m.id);
      const who = revealed ? esc(m.name) : "模型 " + side;
      const sub = revealed
        ? esc([m.vendor, clip ? clip.res : m.res, clip ? clip.dur + "s" : ""].filter(Boolean).join(" · "))
        : "同场景 · 同初始帧 · 名称隐藏";
      const stage = clip
        ? `<video class="slot-video" controls preload="auto" playsinline poster="${esc(String(clip.video).replace(/\.mp4$/, ".jpg"))}" src="${esc(clip.video)}"></video>`
        : `<div class="ph"><em>会话回放占位</em><br>接入真实录屏后替换</div>`;
      return `<div class="slot" data-side="${side}">
        <div class="slot-stage">
          <span class="badge">${side}</span>
          ${stage}
        </div>
        <div class="slot-foot">
          <div class="who">${who}<small>${sub}</small></div>
          <div class="avg">${chipOf(side)}</div>
        </div>
      </div>`;
    }).join("");

    slotVids().forEach((v, i) => {
      const side = sides[i];
      v.addEventListener("loadedmetadata", () => paintTransport());
      v.addEventListener("durationchange", () => paintTransport());
      v.addEventListener("loadeddata", () => {
        paintTransport();
        if (v.currentTime < 0.12) captureBase(side, v);
        paintCompare(true);
      });
      v.addEventListener("seeked", () => {
        if (v.currentTime < 0.1) captureBase(side, v);
        if (!T.playing) { T.time = Math.min(v.currentTime, spanOf()); paintTransport(); paintCompare(true); }
      });
      v.addEventListener("play", () => { if (!T.playing) { T.playing = true; startTick(); paintTransport(); } });
      v.addEventListener("pause", () => { if (v.isConnected && T.playing && !v.ended) pauseAll(); });
      v.addEventListener("ended", () => { if (T.playing) pauseAll(); });
    });

    T.time = 0;
    bindTransport();
    paintTransport();
    paintCompare(true);
    /* 首帧解码有延迟：抓不到基准帧就多试几次，抓到了就停 */
    let tries = 0;
    const retry = window.setInterval(() => {
      tries += 1;
      paintTransport();
      paintCompare(true);
      const vs = slotVids();
      const done = vs.every((v, i) => CMP.ready[sides[i]]);
      if (done || tries > 20 || !vs.length) window.clearInterval(retry);
    }, 300);
  }

  function scoreSelect(side, d) {
    const c = cellOf(side);
    const v = c.dims[d.key];
    const na = c.na[d.key];
    const sel = na ? "na" : typeof v === "number" ? String(v) : "";
    return [["", "待检查"], ["1", "1"], ["3", "3"], ["5", "5"], ["na", "N/A"]]
      .map((o) => `<option value="${o[0]}"${sel === o[0] ? " selected" : ""}>${o[1]}</option>`)
      .join("");
  }

  function sideBlock(side, d) {
    const c = cellOf(side);
    const note = c.notes[d.key] || {};
    const na = c.na[d.key];
    const lowNoNote = typeof c.dims[d.key] === "number" && c.dims[d.key] < 3 && !String(note.note || "").trim();
    return `<div class="ab-side${lowNoNote ? " need-note" : ""}" data-side="${side}">
      <div class="ab-side-head"><span class="ab-tag">${side}</span><span class="ab-ts-val">${note.ts == null ? "" : tcOf(note.ts)}</span></div>
      <select class="dim-score" data-side="${side}" data-dim="${d.key}" aria-label="${esc(d.name)} ${side} 分">${scoreSelect(side, d)}</select>
      ${na ? `<select class="na-reason-sel" data-side="${side}" data-reason="${d.key}">${NA_REASONS.map((r) => `<option${r === na ? " selected" : ""}>${esc(r)}</option>`).join("")}</select>` : ""}
      <textarea class="ab-note" data-side="${side}" data-dim="${d.key}" placeholder="${side} 的依据；低分必填">${esc(note.note || "")}</textarea>
      <button class="ab-ts" type="button" data-stamp="${side}" data-dim="${d.key}">⏱ 记录时间</button>
    </div>`;
  }

  function renderDims() {
    ["A", "B"].forEach((side) => seedInto(modelOf(state.slots[side]), cellOf(side)));

    $("#dims").innerHTML = DIMS.map((d) => `<div class="dim" data-dim="${d.key}">
        <div class="dim-head"><strong>${esc(d.name)}</strong>${(window.VELAB_TIPS && window.VELAB_TIPS[d.key]) ? `<button class="q" type="button" data-tip="${d.key}" aria-label="维度说明" title="看定义与观察点">?</button>` : ""}<span class="why">${esc(d.why)}</span></div>
        <div class="dim-ab">${sideBlock("A", d)}${sideBlock("B", d)}</div>
      </div>`).join("");

    const over = ["A", "B"].filter((s) => naDims(cellOf(s)).length * 2 > DIMS.length);
    $("#na-warn").innerHTML = over.length
      ? `<div class="na-hint">${over.join("、")} 的 N/A 已超过一半：这一条对该模型作废，整行不产生 GSB，记为「不可比 case」。</div>`
      : "";
  }

  function renderVote() {
    const box = $("#vote-box");
    const a = cellOf("A");
    const b = cellOf("B");
    const doneA = sideComplete(a);
    const doneB = sideComplete(b);
    /* 只评了一侧 = 不成对：不产生 GSB，投票区收起，只留绝对分 */
    box.classList.toggle("hidden", !(doneA && doneB));
    const v = state.votes[pairKey()] || {};
    const revealed = !!v.revealed;

    $$("#vote-row button").forEach((btn) => {
      const which = btn.dataset.vote;
      btn.classList.toggle("on", which === "G" ? !!v.g : which === "S" ? !!v.s : !!v.b);
    });

    const fmt = (c, k) => {
      const n = c.dims[k];
      if (typeof n === "number") return String(n);
      return c.na[k] ? "N/A" : "—";
    };
    $("#vote-deltas").textContent = DIMS.map((d) => `${d.name} A${fmt(a, d.key)} / B${fmt(b, d.key)}`).join(" · ");
  }

  function renderSummary() {
    $("#s-n").textContent = SCENES.length + " 场 × 2";
    $("#s-n-sub").textContent = "同场景内两两对打；跨场景不合并净胜率";

    const votes = Object.values(state.votes).filter((v) => v && (v.g || v.s || v.b));
    const n = votes.length;
    const g = votes.filter((v) => v.g).length;
    const bt = votes.filter((v) => v.b).length;
    if (n) {
      const net = (g - bt) / n;
      $("#s-gsb").textContent = (net > 0 ? "+" : "") + net.toFixed(2);
      $("#s-gsb-sub").textContent = (g + bt ? "去平局 " + (g / (g + bt)).toFixed(2) : "去平局 —") + " · 已投 " + n + " 条";
    } else {
      $("#s-gsb").textContent = "—";
      $("#s-gsb-sub").textContent = "投 G/S/B 后才有值";
    }

    const per = DIMS.map((d) => ({ d, w: 0, l: 0 }));
    Object.keys(state.votes).forEach((k) => {
      const v = state.votes[k];
      if (!v) return;
      const parts = k.split("|");
      if (parts.length < 2) return;
      const models = parts[1].split("~");
      if (models.length < 2) return;
      const ca = state.cells[parts[0] + "|" + models[0]] || { dims: {} };
      const cb = state.cells[parts[0] + "|" + models[1]] || { dims: {} };
      per.forEach((p) => {
        const x = ca.dims[p.d.key];
        const y = cb.dims[p.d.key];
        if (typeof x === "number" && typeof y === "number" && x !== y) {
          if (x > y) p.w++; else p.l++;
        }
      });
    });
    const anyWin = per.some((p) => p.w || p.l);
    $("#s-dims").textContent = anyWin
      ? per.map((p) => p.d.name + " " + p.w + "–" + p.l).join(" · ")
      : "还没有可比的配对评分";

    /* 不可比项只看当前这一组：换一组比较，缺口就跟着变 */
    const gap = [];
    ["A", "B"].forEach((side) => {
      const cell = cellOf(side);
      const name = modelOf(state.slots[side]).name;
      Object.entries(cell.na || {}).forEach(([dim, reason]) => {
        gap.push(name + " " + (DIMS.find((d) => d.key === dim) || {}).name + "（" + reason + "）");
      });
    });
    $("#s-na").textContent = String(gap.length);
    $("#s-na-sub").textContent = gap.length ? gap.join("；") : "这组四个维度都可比";
  }

  function renderAll() {
    renderScenes();
    renderMatrix();
    renderArchive();
    renderPairControls();
    renderStageHead();
    renderSlots();
    renderDims();
    renderVote();
    renderSummary();
  }

  /* ---------------- 交互 ---------------- */

  function bind() {
    $("#scene-list").addEventListener("click", (e) => {
      const el = e.target.closest("[data-scene]");
      if (!el) return;
      state.scene = el.dataset.scene;
      const pair = scenePair();
      if (pair) state.slots = { A: pair[0], B: pair[1] };
      persist();
      renderAll();
    });

    $("#pair-a").addEventListener("change", (e) => {
      state.slots.A = e.target.value;
      persist();
      renderAll();
    });
    $("#pair-b").addEventListener("change", (e) => {
      state.slots.B = e.target.value;
      persist();
      renderAll();
    });

    $("#dims").addEventListener("change", (e) => {
      const sel = e.target.closest(".dim-score");
      if (sel) {
        const side = sel.dataset.side;
        const k = sel.dataset.dim;
        const c = cellOf(side);
        if (sel.value === "na") {
          const preset = (modelOf(state.slots[side]).na || {})[k];
          c.na[k] = preset || NA_REASONS[0];
          delete c.dims[k];
        } else if (sel.value === "") {
          delete c.dims[k];
          delete c.na[k];
        } else {
          c.dims[k] = Number(sel.value);
          delete c.na[k];
        }
        persist();
        renderDims();
        renderSlots();
        renderVote();
        renderSummary();
        return;
      }
      const reason = e.target.closest(".na-reason-sel");
      if (reason) {
        cellOf(reason.dataset.side).na[reason.dataset.reason] = reason.value;
        persist();
      }
    });

    $("#dims").addEventListener("input", (e) => {
      const note = e.target.closest(".ab-note");
      if (!note) return;
      const c = cellOf(note.dataset.side);
      const k = note.dataset.dim;
      c.notes[k] = c.notes[k] || {};
      c.notes[k].note = note.value;
      const side = note.closest(".ab-side");
      if (side) {
        const raw = $(".dim-score", side) ? $(".dim-score", side).value : "";
        side.classList.toggle("need-note", raw !== "" && raw !== "na" && Number(raw) < 3 && note.value.trim() === "");
      }
      persist();
    });

    $("#dims").addEventListener("click", (e) => {
      const btn = e.target.closest("[data-stamp]");
      if (!btn) return;
      const c = cellOf(btn.dataset.stamp);
      const k = btn.dataset.dim;
      const box = btn.parentElement.querySelector(".ab-note");
      const t = T.time;
      const stamp = "[" + tcOf(t) + "] ";
      c.notes[k] = c.notes[k] || {};
      c.notes[k].ts = t;
      const cur = box.value;
      const at = typeof box.selectionStart === "number" ? box.selectionStart : cur.length;
      box.value = cur.slice(0, at) + stamp + cur.slice(at);
      c.notes[k].note = box.value;
      const label = btn.parentElement.querySelector(".ab-ts-val");
      if (label) label.textContent = tcOf(t);
      persist();
      box.focus();
      box.selectionStart = box.selectionEnd = at + stamp.length;
      const side = btn.closest(".ab-side");
      if (side) {
        const raw = $(".dim-score", side) ? $(".dim-score", side).value : "";
        side.classList.toggle("need-note", raw !== "" && raw !== "na" && Number(raw) < 3 && box.value.trim() === "");
      }
    });

    $("#vote-row").addEventListener("click", (e) => {
      const b = e.target.closest("[data-vote]");
      if (!b) return;
      const k = pairKey();
      const v = state.votes[k] || { g: false, s: false, b: false, revealed: false };
      const which = b.dataset.vote;
      v.g = which === "G";
      v.s = which === "S";
      v.b = which === "B";
      state.votes[k] = v;
      persist();
      renderVote();
      renderSummary();
    });

    $("#save-btn").addEventListener("click", () => {
      persist();
      const weak = [];
      ["A", "B"].forEach((side) => {
        const c = cellOf(side);
        DIMS.forEach((d) => {
          const n = c.dims[d.key];
          const note = (c.notes[d.key] || {}).note || "";
          if (typeof n === "number" && n < 3 && !note.trim()) weak.push(side + "·" + d.name);
        });
      });
      toast(weak.length ? `草稿已保存；${weak.length} 处低于 3 分没写依据：${weak.join("、")}` : "草稿已保存");
    });

    $("#export-btn").addEventListener("click", () => {
      const sides = ["A", "B"];
      const scores = sides.map((side) => {
        const c = cellOf(side);
        const m = modelOf(state.slots[side]);
        const dims = {};
        const dim_notes = {};
        DIMS.forEach((d) => {
          dims[d.key] = typeof c.dims[d.key] === "number" ? c.dims[d.key] : "-";
          const n = c.notes[d.key] || {};
          if (n.note || n.ts != null) dim_notes[d.key] = { note: n.note || "", ts: n.ts == null ? null : Number(n.ts.toFixed(3)) };
        });
        return {
          case_id: state.scene,
          model: m.id,
          side: side,
          dims,
          dim_notes,
          na_reason: c.na,
        };
      });
      const v = state.votes[pairKey()] || {};
      const out = {
        schema: "world-v2.preview",
        exported_at: new Date().toISOString(),
        case: sceneOf(state.scene),
        run: {
          mode: "ab",
          slots: state.slots,
          blind: true,
        },
        gsb: { g: !!v.g, s: !!v.s, b: !!v.b },
        scores,
      };
      const blob = new Blob([JSON.stringify(out, null, 2)], { type: "application/json" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = "world-" + state.scene + ".json";
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 4000);
      toast("已导出 JSON");
    });
  }

  let booted = false;
  async function init() {
    if (booted) return;
    booted = true;
    if (document.body.dataset.page !== "world") return;
    await loadData();
    if (!SCENES.find((s) => s.id === state.scene)) state.scene = SCENES[0].id;
    const pair = scenePair();
    if (pair) {
      state.slots = { A: pair[0], B: pair[1] };
    } else {
      if (!MODELS.find((m) => m.id === state.slots.A)) state.slots.A = MODELS[0].id;
      if (!MODELS.find((m) => m.id === state.slots.B)) state.slots.B = MODELS[1].id;
    }
    bind();
    renderAll();
  }

  window.initWorld2 = init;
  if (document.readyState !== "loading") init();
})();
