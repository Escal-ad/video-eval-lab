/* 世界模型评测 · v2 预览
   与 v1 的三点不同：
   1. 维度有第三态 N/A（不可比），必须选原因，不进均分、不进多数票
   2. 能力矩阵 + 模型档案：先说「这组能比什么」，再打分
   3. 每题结论 verdict + 会话成本（实时流按会话存活计费）
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
    rater: "r1",
    cells: {},
    votes: {},
    verdicts: {},
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

  function renderSlots() {
    const revealed = revealedNow();
    const sides = ["A", "B"];
    $("#slots").className = "world-grid two-col";
    $("#slots").innerHTML = sides.map((side) => {
      const m = modelOf(state.slots[side]);
      const c = cellOf(side);
      const clip = clipOf(m.id);
      const avg = avgOf(c);
      const n = numDims(c).length;
      const naN = naDims(c).length;
      const on = state.side === side ? "selected" : "";
      const who = revealed ? esc(m.name) : "模型 " + side;
      const sub = revealed
        ? esc([m.vendor, clip ? clip.res : m.res, clip ? clip.dur + "s" : ""].filter(Boolean).join(" · "))
        : "同场景 · 同初始帧 · 名称隐藏";
      const stage = clip
        ? `<video class="slot-video" controls preload="metadata" playsinline poster="${esc(String(clip.video).replace(/\.mp4$/, ".jpg"))}" src="${esc(clip.video)}#t=0.1"></video>`
        : `<div class="ph"><em>会话回放占位</em><br>接入真实录屏后替换</div>`;
      return `<div class="slot ${on}" data-side="${side}">
        <div class="slot-stage">
          <span class="badge">${side}</span>
          ${stage}
        </div>
        <div class="slot-foot">
          <div class="who">${who}<small>${sub}</small></div>
          <div class="avg">${avg === null ? "—" : "均分 " + avg.toFixed(2)} · ${n}/${DIMS.length}${naN ? " · " + naN + " N/A" : ""}</div>
        </div>
      </div>`;
    }).join("");
  }

  function renderDims() {
    const c = currentCell();
    const m = currentModel();
    seedInto(m, c);
    const baseNa = m.na || {};
    const revealed = revealedNow();

    $$("#side-switch button").forEach((b) => b.classList.toggle("on", b.dataset.side === state.side));

    $("#panel-title").textContent = "评分：" + state.side + (revealed ? "（" + m.name + "）" : "（名称隐藏）");
    $("#model-sub").textContent = "点 A/B 切换评分侧；两侧都评完再揭盲";

    $("#dims").innerHTML = DIMS.map((d) => {
      const v = c.dims[d.key];
      const na = c.na[d.key];
      const preset = baseNa[d.key] && baseNa[d.key] === na;
      return `<div class="dim ${na ? "na-on" : ""}" data-dim="${d.key}">
        <div class="dim-head"><strong>${esc(d.name)}</strong>${(window.VELAB_TIPS && window.VELAB_TIPS[d.key]) ? `<button class="q" type="button" data-tip="${d.key}" aria-label="维度说明" title="看定义与观察点">?</button>` : ""}<span class="why">${esc(d.why)}</span></div>
        <div class="score-row">
          ${SCALE.map((n) => `<button class="score-btn ${v === n ? "on" : ""}" type="button" data-val="${n}" title="${SCALE_HINT[n]}">${n}</button>`).join("")}
          <button class="na-btn ${na ? "on" : ""}" type="button" data-na="1" title="这一维对该模型不成立">N/A</button>
        </div>
        ${na ? `<div class="na-reason"><select data-reason="1">${NA_REASONS.map((r) => `<option ${r === na ? "selected" : ""}>${esc(r)}</option>`).join("")}</select></div>` : ""}
        ${preset ? `<div class="na-hint">能力矩阵标记为不可比：${esc(na)}。其余维度照评，这一格不进均分、不进多数票。</div>` : ""}
      </div>`;
    }).join("");

    const over = naDims(c).length * 2 > DIMS.length;
    $("#na-warn").innerHTML = over
      ? `<div class="na-hint">N/A 已超过一半：这一条对该模型作废，整行不产生 GSB，改为「不可比 case」。</div>`
      : "";

    const f = c.fields || {};
    $("#f-session").value = f.session_sec == null ? "" : f.session_sec;
    $("#f-cost").value = f.cost_usd == null ? "" : f.cost_usd;
    $("#f-latency").value = f.latency_ms == null ? "" : f.latency_ms;
    $("#f-evidence").value = f.evidence_ts || "";
    $("#f-notes").value = f.notes || "";
    $("#f-verdict").value = state.verdicts[pairKey()] || "";
  }

  function renderRater() {
    $$("#rater button").forEach((b) => b.classList.toggle("on", b.dataset.rater === state.rater));
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
    $("#reveal-btn").disabled = !(doneA && doneB);
    $("#reveal-btn").textContent = revealed ? "已揭盲（点此重看映射）" : "揭盲看 A/B";
    $("#vote-result").textContent = doneA && doneB
      ? `两侧已评完：A ${numDims(a).length} 维 · B ${numDims(b).length} 维`
      : `两侧评分未完成：A ${numDims(a).length}/${DIMS.length} · B ${numDims(b).length}/${DIMS.length}`;

    const fmt = (c, k) => {
      const n = c.dims[k];
      if (typeof n === "number") return String(n);
      return c.na[k] ? "N/A" : "—";
    };
    $("#vote-deltas").textContent = revealed
      ? DIMS.map((d) => `${d.name} A${fmt(a, d.key)} / B${fmt(b, d.key)}`).join(" · ")
      : "";
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
      $("#s-gsb-sub").textContent = "揭盲并投 G/S/B 后才有值";
    }

    const per = DIMS.map((d) => ({ d, w: 0, l: 0 }));
    Object.keys(state.votes).forEach((k) => {
      const v = state.votes[k];
      if (!v || !v.revealed) return;
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
      const m = modelOf(state.slots[side]);
      Object.entries(m.na || {}).forEach(([dim, reason]) => {
        gap.push(m.name + " " + (DIMS.find((d) => d.key === dim) || {}).name + "（" + reason + "）");
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
    renderRater();
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

    $("#side-switch").addEventListener("click", (e) => {
      const b = e.target.closest("[data-side]");
      if (!b) return;
      state.side = b.dataset.side;
      persist();
      renderSlots();
      renderDims();
    });

    $("#dims").addEventListener("click", (e) => {
      const dim = e.target.closest("[data-dim]");
      if (!dim) return;
      const c = currentCell();
      const k = dim.dataset.dim;
      const num = e.target.closest("[data-val]");
      const naBtn = e.target.closest("[data-na]");
      if (num) {
        c.dims[k] = Number(num.dataset.val);
        delete c.na[k];
      } else if (naBtn) {
        if (c.na[k]) {
          delete c.na[k];
        } else {
          const preset = (currentModel().na || {})[k];
          c.na[k] = preset || NA_REASONS[0];
          delete c.dims[k];
        }
      } else {
        return;
      }
      persist();
      renderDims();
      renderSlots();
      renderVote();
      renderSummary();
    });

    $("#dims").addEventListener("change", (e) => {
      const sel = e.target.closest("[data-reason]");
      if (!sel) return;
      const dim = e.target.closest("[data-dim]");
      const c = currentCell();
      c.na[dim.dataset.dim] = sel.value;
      persist();
      renderDims();
    });

    const fieldMap = {
      "f-session": "session_sec",
      "f-cost": "cost_usd",
      "f-latency": "latency_ms",
      "f-evidence": "evidence_ts",
      "f-notes": "notes",
    };
    Object.entries(fieldMap).forEach(([id, key]) => {
      const el = $("#" + id);
      el.addEventListener("input", () => {
        const c = currentCell();
        const raw = el.value.trim();
        if (key === "session_sec" || key === "latency_ms") {
          c.fields[key] = raw === "" ? null : Number(raw);
        } else if (key === "cost_usd") {
          c.fields[key] = raw === "" ? null : Number(raw);
        } else {
          c.fields[key] = raw;
        }
        if (key === "session_sec") {
          const m = currentModel();
          if (m.rate && raw !== "" && Number.isFinite(Number(raw))) {
            c.fields.cost_usd = Number((Number(raw) / 60 * m.rate).toFixed(2));
            $("#f-cost").value = c.fields.cost_usd;
          }
        }
        persist();
      });
    });

    $("#f-verdict").addEventListener("input", (e) => {
      state.verdicts[pairKey()] = e.target.value;
      persist();
    });

    $$("#rater button").forEach((b) => {
      b.addEventListener("click", () => {
        state.rater = b.dataset.rater;
        persist();
        renderRater();
        toast("当前评分人：" + state.rater);
      });
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

    $("#reveal-btn").addEventListener("click", () => {
      const k = pairKey();
      const v = state.votes[k] || { g: false, s: false, b: false };
      v.revealed = true;
      state.votes[k] = v;
      persist();
      renderSlots();
      renderDims();
      renderVote();
      renderSummary();
      toast("揭盲：A = " + modelOf(state.slots.A).name + "，B = " + modelOf(state.slots.B).name);
    });

    $("#sync-btn").addEventListener("click", () => {
      const vids = $$("#slots video");
      const btn = $("#sync-btn");
      if (!vids.length) { toast("本场景还没有接入录屏"); return; }
      vids.forEach((v) => { try { v.currentTime = 0; } catch (e) {} });
      vids.forEach((v) => { const p = v.play(); if (p && p.catch) p.catch(() => {}); });
      btn.classList.add("on");
      btn.textContent = "同步播放中";
      const first = vids[0];
      first.addEventListener("ended", () => {
        btn.classList.remove("on");
        btn.textContent = "对齐起点";
      }, { once: true });
    });

    $("#save-btn").addEventListener("click", () => {
      persist();
      toast("已保存到本地");
    });

    $("#export-btn").addEventListener("click", () => {
      const sides = ["A", "B"];
      const scores = sides.map((side) => {
        const c = cellOf(side);
        const m = modelOf(state.slots[side]);
        const dims = {};
        DIMS.forEach((d) => { dims[d.key] = typeof c.dims[d.key] === "number" ? c.dims[d.key] : "-"; });
        return {
          case_id: state.scene,
          model: m.id,
          side: side,
          dims,
          na_reason: c.na,
          latency_ms: c.fields.latency_ms == null ? null : c.fields.latency_ms,
          session_sec: c.fields.session_sec == null ? null : c.fields.session_sec,
          cost_usd: c.fields.cost_usd == null ? null : c.fields.cost_usd,
          effective_sec: null,
          evidence_ts: c.fields.evidence_ts || "",
          notes: c.fields.notes || "",
          rater: state.rater,
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
          blind: !v.revealed,
          verdict: state.verdicts[pairKey()] || "",
        },
        gsb: { g: !!v.g, s: !!v.s, b: !!v.b },
        scores,
      };
      const blob = new Blob([JSON.stringify(out, null, 2)], { type: "application/json" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = "world-" + state.scene + "-" + state.rater + ".json";
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 4000);
      toast("已导出本模块 JSON");
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
