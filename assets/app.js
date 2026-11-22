/* VideoEval Lab — static demo. No dependencies. */
(function () {
  "use strict";

  const KEY = "velab_v2";
  const $ = (sel, root) => (root || document).querySelector(sel);
  const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));

  // 三档量表：只有 1/3/5 有锚点定义。2/4 无锚点时评分者会各自发明标准，
  // 同一段视频两个人能打出一分之差却没有可争论的依据，属于纯噪声。
  const SCALE = [1, 3, 5];
  const SCALE_HINT = {
    1: "1 分 · 明显不成立（锚点见方法页）",
    3: "3 分 · 部分成立 / 有明显但非致命的缺陷",
    5: "5 分 · 完全成立（锚点见方法页）"
  };

  const DATA = {
    captionTasks: [
      {
        id: "cap-01",
        title: "低照度人物特写",
        source: "实拍 · 8.5s · 单镜头",
        video: "assets/caption/cap-01_low-key.mp4",
        duration: 8.5,
        status: "todo",
        scores: { tone: "冷调", angle: "平视", composition: "中心构图", lighting: "侧光", shot_size: "特写", camera: "固定" },
        segments: [
          { start: 0.0, end: 8.5, caption: "幽暗林间，蓝发女孩穿暗红上衣，手握螺旋木杖，先警觉地抬眼看左前方，随后闭眼、双手在胸前合拢默念，最后重新握紧木杖直视前方，眼神由迟疑转为坚定。" }
        ]
      },
      {
        id: "cap-02",
        title: "黑白餐厅对话",
        source: "实拍 · 黑白 · 11s · 单镜头",
        video: "assets/caption/cap-02_restaurant.mp4",
        duration: 10.96,
        status: "todo",
        scores: { tone: "低饱和", angle: "平视", composition: "中心构图", lighting: "侧光", shot_size: "中景", camera: "固定" },
        segments: [
          { start: 0.0, end: 10.96, caption: "黑白餐厅吧台前，穿浅色西装的男子侧身对戴条纹帽的女子说话，随后伸手扶住她的手臂、前倾压低声音解释；女子先听他讲，随后抬眼迎着他的视线，两人靠近到几乎贴面，镜头保持双人中景。" }
        ]
      },
      {
        id: "cap-03",
        title: "雨中新叶",
        source: "实拍 · 11s · 单镜头",
        video: "assets/caption/cap-03_rain.mp4",
        duration: 10.96,
        status: "todo",
        scores: { tone: "暖调", angle: "平视", composition: "中心构图", lighting: "逆光", shot_size: "特写", camera: "固定" },
        segments: [
          { start: 0.0, end: 10.96, caption: "雨丝打在新叶和深色枝干上，叶片被逆光勾出亮边，背景虚化成暖色天光；随后雨势变密，水珠从叶尖滴落，镜头轻微晃动，右后方出现镜头光斑，浅景深保持不变。" }
        ]
      }
    ],
    t2vCases: [
      {
        id: "TA-01",
        name: "特写 · 硬币与价签",
        prompt: "特写，固定镜头。一位年轻女性的双手在深色木桌上，把三枚银色硬币一枚一枚地排成一条直线；桌子右下角贴着一张手写价签，上面写着「¥3」。暖色侧光从左边打来，桌面有轻微反光，背景虚化。",
        duration: 5,
        gsb: true,
        models: [
          { id: "kling-2.6", name: "Kling 2.6", vendor: "快手", meta: "1280×720 · 24fps · 5.04s", video: "assets/t2v/TA01/kling-2.6.mp4" },
          { id: "pixverse-v6", name: "拍我AI V6", vendor: "爱诗科技", meta: "1280×720 · 24fps · 5.04s", video: "assets/t2v/TA01/pixverse-v6.mp4" }
        ],
        conclusion: ""
      },
      {
        id: "TB-01",
        name: "牛奶倾倒 · 液体因果",
        prompt: "中等景别，镜头缓慢向右平移。白色桌面上有一只装牛奶的玻璃杯，被一只手从左侧碰倒，牛奶沿桌面铺开并从桌沿滴落，杯子滚动半圈后停下。室内自然光，浅景深。",
        duration: 5,
        gsb: false,
        skipDims: ["quality", "aesthetic"],
        modeNote: "本组只评三维（文本一致性 / 结构稳定性 / 运动效果）；画质两维不评，因为两侧原生分辨率不同",
        models: [
          { id: "hailuo-h3", name: "海螺 H3", vendor: "MiniMax", meta: "1344×768 · 24fps · 5.17s", video: "assets/t2v/TB01/hailuo-h3.mp4" },
          { id: "vidu-q3", name: "Vidu Q3", vendor: "生数科技", meta: "1920×1080 · 24fps · 5.04s", video: "assets/t2v/TB01/vidu-q3.mp4" }
        ],
        conclusion: ""
      }
    ],
    worldScenes: [
      {
        id: "S02",
        name: "绕桌一圈回起点",
        category: "空间记忆",
        action: "沿桌子右侧绕行 6 秒 → 回到起点，面向桌子",
        expect: "回到起点时桌子、杯子的位置与初始一致；遮挡关系正确",
        models: [
          { id: "genie", name: "Genie 4", vendor: "Google DeepMind", meta: "720p · 24fps · 120s" },
          { id: "hynomas", name: "Hy-Nomas", vendor: "腾讯混元", meta: "720p · 24fps · 60s" },
          { id: "oyster", name: "HappyOyster", vendor: "阿里巴巴", meta: "720p · 亚秒延迟 · 180s" }
        ]
      },
      {
        id: "S05",
        name: "180 度转身",
        category: "一致性",
        action: "转身 180 度 → 停 2 秒 → 再转回 180 度",
        expect: "背后的场景合理；转回后地标、建筑位置不漂移",
        models: [
          { id: "genie", name: "Genie 4", vendor: "Google DeepMind", meta: "720p · 24fps · 120s" },
          { id: "hynomas", name: "Hy-Nomas", vendor: "腾讯混元", meta: "720p · 24fps · 60s" },
          { id: "oyster", name: "HappyOyster", vendor: "阿里巴巴", meta: "720p · 亚秒延迟 · 180s" }
        ]
      }
    ],
    captionDims: [
      { key: "tone", label: "色调", hint: "冷暖、饱和度", options: ["暖调", "冷调", "中性", "高饱和", "低饱和"] },
      { key: "angle", label: "拍摄角度", hint: "机位高度、方向", options: ["平视", "俯拍", "仰拍", "侧拍", "顶拍"] },
      { key: "composition", label: "构图", hint: "主体位置、留白", options: ["三分法", "中心构图", "对称构图", "对角线", "框架构图"] },
      { key: "lighting", label: "光影", hint: "光源方向、对比", options: ["顺光", "侧光", "逆光", "顶光", "底光"] },
      { key: "shot_size", label: "景别", hint: "取景范围", options: ["远景", "全景", "中景", "近景", "特写"] },
      { key: "camera", label: "运镜", hint: "镜头运动", options: ["固定", "推", "拉", "摇", "移"] }
    ],
    t2vDims: [
      { key: "text", label: "文本一致性" },
      { key: "quality", label: "画质" },
      { key: "structure", label: "结构稳定性" },
      { key: "motion", label: "运动效果" },
      { key: "aesthetic", label: "单帧美学" }
    ],
    worldDims: [
      { key: "instruction", label: "指令遵循" },
      { key: "physics", label: "物理合理性" },
      { key: "camera", label: "相机控制" },
      { key: "memory", label: "记忆一致性" }
    ]
  };

  /* ---------------- storage ---------------- */
  let store = {};
  try { store = JSON.parse(localStorage.getItem(KEY) || "{}"); } catch (e) { store = {}; }
  store.caption = store.caption || {};
  store.t2v = store.t2v || {};
  store.world = store.world || {};

  function persist() {
    try { localStorage.setItem(KEY, JSON.stringify(store)); } catch (e) { /* ignore quota */ }
  }

  function toast(msg) {
    let el = $(".toast");
    if (!el) {
      el = document.createElement("div");
      el.className = "toast";
      document.body.appendChild(el);
    }
    el.textContent = msg;
    el.classList.add("show");
    clearTimeout(el._t);
    el._t = setTimeout(() => el.classList.remove("show"), 1800);
  }

  function fmt(s) {
    s = Math.max(0, s || 0);
    const m = Math.floor(s / 60);
    const sec = (s % 60).toFixed(1).padStart(4, "0");
    return `${String(m).padStart(2, "0")}:${sec}`;
  }

  function dl(name, obj) {
    const blob = new Blob([JSON.stringify(obj, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }

  function getCaption(task) {
    if (!store.caption[task.id]) {
      store.caption[task.id] = {
        scores: { ...(task.scores || {}) },
        segments: task.segments.map(s => ({ ...s })),
        evidence: "",
        confidence: "medium",
        status: task.status === "done" ? "submitted" : "draft"
      };
    }
    const record = store.caption[task.id];
    // migrate old numeric scores to the option-based caption rubric
    Object.keys(record.scores).forEach(k => {
      if (typeof record.scores[k] === "number") delete record.scores[k];
    });
    return record;
  }

  function scoreRow(dims, values, onPick) {
    return dims.map(d => {
      const current = values[d.key];
      const control = d.options
        ? `<select class="dim-select" data-dim="${d.key}">
            <option value="">未选择</option>
            ${d.options.map(o => `<option value="${o}" ${current === o ? "selected" : ""}>${o}</option>`).join("")}
          </select>`
        : `<div class="score-row" data-dim="${d.key}">
            ${SCALE.map(n => `<button class="score-btn ${current === n ? "on" : ""}" data-score="${n}" data-dim="${d.key}" type="button" title="${SCALE_HINT[n]}">${n}</button>`).join("")}
          </div>`;
      return `
      <div class="dim">
        <div class="dim-head">
          <strong>${d.label}</strong>${(window.VELAB_TIPS && window.VELAB_TIPS[d.key]) ? `<button class="q" type="button" data-tip="${d.key}" aria-label="维度说明" title="看定义与观察点">?</button>` : ""}
          <span class="why">${d.hint || ""}</span>
        </div>
        ${control}
      </div>`;
    }).join("");
  }

  /* ---------------- caption page ---------------- */
  function initCaption() {
    const state = { task: null, time: 0, playing: false, timer: null, segIndex: 0, filter: "all", localVideos: {} };

    function renderQueue() {
      const q = $("#queue-list");
      if (!q) return;
      const tasks = DATA.captionTasks.filter(t => {
        if (state.filter === "all") return true;
        const st = getCaption(t).status;
        return state.filter === "todo" ? st === "draft" : state.filter === "done" ? st === "submitted" : true;
      });
      $("#q-count").textContent = `${tasks.length} / ${DATA.captionTasks.length}`;
      q.innerHTML = tasks.map(t => {
        const d = getCaption(t);
        const dot = d.status === "submitted" ? "done" : (state.task && state.task.id === t.id ? "doing" : "todo");
        return `<div class="task ${state.task && state.task.id === t.id ? "active" : ""}" data-task="${t.id}">
          <div class="task-top"><span class="task-id">${t.id}</span><span class="dot ${dot}"></span></div>
          <strong>${t.title}</strong>
          <div class="task-meta"><span>${t.source}</span><span>·</span><span>${t.segments.length} 段</span></div>
        </div>`;
      }).join("");
      $$(".task", q).forEach(el => el.addEventListener("click", () => select(el.dataset.task)));
    }

    function select(id) {
      const old = $(".video-stage video.clip-video");
      if (old) old.pause();
      state.task = DATA.captionTasks.find(t => t.id === id);
      state.time = 0;
      state.segIndex = 0;
      stop();
      renderQueue();
      renderStage();
      const v = $(".video-stage video.clip-video");
      if (v) { try { v.currentTime = 0; } catch (e) {} }
      renderTimeline();
      renderSegments();
      renderPanel();
    }

    function videoFor(t) {
      return state.localVideos[t.id] || t.video || "";
    }

    function mountVideo() {
      const t = state.task;
      const wrap = $(".video-stage");
      const src = videoFor(t);
      let v = wrap.querySelector("video.clip-video");
      if (!src) {
        if (v) v.remove();
        wrap.classList.remove("has-video");
        return null;
      }
      if (!v) {
        v = document.createElement("video");
        v.className = "clip-video";
        v.controls = true;
        v.playsInline = true;
        v.preload = "metadata";
        v.addEventListener("timeupdate", () => {
          if (!state.task) return;
          state.time = Math.min(state.task.duration, v.currentTime || 0);
          paintTime();
        });
        v.addEventListener("play", () => { state.playing = true; });
        v.addEventListener("pause", () => { state.playing = false; });
        wrap.appendChild(v);
      }
      if (v.dataset.src !== src) {
        v.dataset.src = src;
        v.src = src;
        v.load();
        try { v.currentTime = 0; } catch (e) {}
      }
      wrap.classList.add("has-video");
      return v;
    }

    function paintTime() {
      const t = state.task;
      $("#stage-sub").textContent = `${t.source} · 共 ${t.segments.length} 个镜头 · 当前 ${fmt(state.time)}`;
      $("#timecode").textContent = `${fmt(state.time)} / ${fmt(t.duration)}`;
      const ph = $("#playhead");
      if (ph) ph.style.left = `${(state.time / t.duration) * 100}%`;
    }

    function renderStage() {
      const t = state.task;
      $("#stage-title").textContent = `${t.id} · ${t.title}`;
      const lb = $("#local-btn");
      if (lb) lb.textContent = state.localVideos[t.id] ? "更换本地视频" : "导入本地视频";
      mountVideo();
      paintTime();
    }

    function renderTimeline() {
      const t = state.task;
      const track = $("#track");
      track.innerHTML = t.segments.map((s, i) => {
        const left = (s.start / t.duration) * 100;
        const w = ((s.end - s.start) / t.duration) * 100;
        return `<div class="seg" data-seg="${i}" style="left:${left}%;width:${w}%">${fmt(s.start)}–${fmt(s.end)}</div>`;
      }).join("") + `<div class="playhead" id="playhead" style="left:${(state.time / t.duration) * 100}%"></div>`;
      $("#ruler").innerHTML = [0, .25, .5, .75, 1].map(p => `<span>${fmt(t.duration * p)}</span>`).join("");
      $$(".seg", track).forEach(el => el.addEventListener("click", (e) => {
        e.stopPropagation();
        seek(t.segments[+el.dataset.seg].start);
      }));
      track.onclick = (e) => {
        const r = track.getBoundingClientRect();
        seek(((e.clientX - r.left) / r.width) * t.duration);
      };
    }

    function renderSegments() {
      const d = getCaption(state.task);
      $("#seg-table").innerHTML = d.segments.map((s, i) => `
        <div class="seg-row ${i === state.segIndex ? "active" : ""}" data-seg="${i}" style="${i === state.segIndex ? "background:#f7faff" : ""}">
          <span class="t">${s.start.toFixed(1)}–${s.end.toFixed(1)}</span>
          <span class="c">${s.caption || "（未填写）"}</span>
          <span class="s">${i === state.segIndex ? "编辑中" : "点击编辑"}</span>
        </div>
      `).join("");
      $$("#seg-table .seg-row").forEach(el => el.addEventListener("click", () => {
        state.segIndex = +el.dataset.seg;
        seek(d.segments[state.segIndex].start);
        renderSegments();
        renderPanel();
      }));
    }

    function renderPanel() {
      const d = getCaption(state.task);
      $("#panel-title").textContent = "六维标注";
      $("#panel-sub").textContent = "按镜头选择；可留空，不猜";
      $("#dims").innerHTML = scoreRow(DATA.captionDims, d.scores);
      const seg = d.segments[state.segIndex] || d.segments[0];
      $("#caption-text").value = seg ? seg.caption : "";
      $("#evidence").value = d.evidence || "";
      $("#confidence").value = d.confidence || "medium";
      $("#status-line").innerHTML = `<span>状态：${d.status === "submitted" ? "已提交" : "草稿"}</span><span>已选择 ${Object.keys(d.scores).length} / 6 维</span>`;
      bindScores();
      $("#caption-text").oninput = (e) => {
        seg.caption = e.target.value;
        persist();
      };
      $("#evidence").oninput = (e) => { d.evidence = e.target.value; persist(); };
      $("#confidence").onchange = (e) => { d.confidence = e.target.value; persist(); };
    }

    function bindScores() {
      const d = getCaption(state.task);
      const refresh = () => {
        $("#status-line").innerHTML = `<span>状态：${d.status === "submitted" ? "已提交" : "草稿"}</span><span>已选择 ${Object.keys(d.scores).length} / 6 维</span>`;
      };
      $$("#dims .dim-select").forEach(sel => sel.addEventListener("change", () => {
        if (sel.value) d.scores[sel.dataset.dim] = sel.value;
        else delete d.scores[sel.dataset.dim];
        persist();
        refresh();
      }));
      $$("#dims .score-btn").forEach(btn => btn.addEventListener("click", () => {
        d.scores[btn.dataset.dim] = +btn.dataset.score;
        persist();
        $$(`#dims .score-row[data-dim="${btn.dataset.dim}"] .score-btn`).forEach(b =>
          b.classList.toggle("on", +b.dataset.score === +btn.dataset.score));
        refresh();
      }));
    }

    function seek(t) {
      state.time = Math.min(state.task.duration, Math.max(0, t));
      const v = $(".video-stage video.clip-video");
      if (v) {
        try { v.currentTime = state.time; } catch (e) {}
      }
      paintTime();
    }

    function stop() {
      state.playing = false;
      if (state.timer) clearInterval(state.timer);
      state.timer = null;
      const b = $("#play-btn");
      if (b) b.textContent = "▶";
    }

    function togglePlay() {
      const v = $(".video-stage video.clip-video");
      if (v) {
        if (v.paused) v.play().catch(() => {});
        else v.pause();
        return;
      }
      if (state.playing) { stop(); return; }
      state.playing = true;
      $("#play-btn").textContent = "❚❚";
      state.timer = setInterval(() => {
        state.time += 0.1;
        if (state.time >= state.task.duration) { state.time = state.task.duration; stop(); }
        paintTime();
      }, 100);
    }

    $("#play-btn").addEventListener("click", togglePlay);
    $("#local-btn").addEventListener("click", () => $("#local-file").click());
    $("#local-file").addEventListener("change", (e) => {
      const f = e.target.files && e.target.files[0];
      if (!f) return;
      if (state.localVideos[state.task.id]) URL.revokeObjectURL(state.localVideos[state.task.id]);
      state.localVideos[state.task.id] = URL.createObjectURL(f);
      $("#local-btn").textContent = "更换本地视频";
      renderStage();
      toast(`已载入本地视频：${f.name}（仅当前浏览器，刷新后需重选）`);
      e.target.value = "";
    });
    $("#prev-btn").addEventListener("click", () => {
      const i = DATA.captionTasks.findIndex(t => t.id === state.task.id);
      select(DATA.captionTasks[(i - 1 + DATA.captionTasks.length) % DATA.captionTasks.length].id);
    });
    $("#next-btn").addEventListener("click", () => {
      const i = DATA.captionTasks.findIndex(t => t.id === state.task.id);
      select(DATA.captionTasks[(i + 1) % DATA.captionTasks.length].id);
    });
    $$(".filters .chip-btn").forEach(b => b.addEventListener("click", () => {
      state.filter = b.dataset.filter;
      $$(".filters .chip-btn").forEach(x => x.classList.toggle("on", x === b));
      renderQueue();
    }));
    $("#save-btn").addEventListener("click", () => {
      persist();
      toast("已保存到本地（localStorage）");
    });
    $("#submit-btn").addEventListener("click", () => {
      const d = getCaption(state.task);
      d.status = "submitted";
      persist();
      renderQueue();
      renderPanel();
      toast("已提交，进入复核队列");
    });
    $("#evidence-btn").addEventListener("click", () => {
      const d = getCaption(state.task);
      d.evidence = fmt(state.time);
      $("#evidence").value = d.evidence;
      persist();
      toast(`证据时间戳：${d.evidence}`);
    });
    $("#export-btn").addEventListener("click", () => dl("caption-annotations.json", store.caption));

    const wanted = new URLSearchParams(location.search).get("task");
    const initial = DATA.captionTasks.some(t => t.id === wanted) ? wanted : DATA.captionTasks[0].id;
    select(initial);
  }

  /* ---------------- t2v page ---------------- */
  function initT2V() {
    const state = { caseId: DATA.t2vCases[0].id, modelId: "seedance", blind: false };

    function caseStore(cid) {
      if (!store.t2v[cid]) store.t2v[cid] = { models: {}, blind: false };
      return store.t2v[cid];
    }

    function renderCases() {
      $("#case-list").innerHTML = DATA.t2vCases.map(c => `
        <div class="case ${c.id === state.caseId ? "active" : ""}" data-case="${c.id}">
          <strong>${c.id} · ${c.name}</strong>
          <span>${c.models.length} 模型 · ${c.duration}s · 案例研究</span>
        </div>
      `).join("");
      $$("#case-list .case").forEach(el => el.addEventListener("click", () => {
        state.caseId = el.dataset.case;
        state.modelId = DATA.t2vCases.find(c => c.id === state.caseId).models[0].id;
        renderCases(); renderGrid(); renderPanel();
      }));
    }

    function renderGrid() {
      const c = DATA.t2vCases.find(x => x.id === state.caseId);
      const cs = caseStore(c.id);
      $("#case-title").textContent = `${c.id} · ${c.name}`;
      $("#case-prompt").textContent = c.prompt;
      const blind = $("#blind-toggle").checked;
      $("#grid").innerHTML = c.models.map((m, i) => {
        const label = blind ? `模型 ${String.fromCharCode(65 + i)}` : m.name;
        const saved = cs.models[m.id] || {};
        const vals = saved.dims || {};
        const avg = Object.keys(vals).length ? (Object.values(vals).reduce((a, b) => a + b, 0) / Object.keys(vals).length).toFixed(1) : "—";
        return `<div class="model-card ${m.id === state.modelId ? "selected" : ""}" data-model="${m.id}">
          <div class="model-stage">
            <span class="model-label">${label}</span>
            <span class="ph">视频占位<br>接入后自动播放</span>
          </div>
          <div class="model-body">
            <div class="name">${blind ? label : `${m.name} · ${m.vendor}`}</div>
            <div class="meta">${m.meta} · 公开榜 ${m.score}</div>
            <div class="score-chips">
              <span class="score-chip">均分 ${avg}</span>
              <span class="score-chip">${Object.keys(vals).length}/5 维</span>
            </div>
          </div>
        </div>`;
      }).join("");
      $$("#grid .model-card").forEach(el => el.addEventListener("click", () => {
        state.modelId = el.dataset.model;
        renderGrid(); renderPanel();
      }));
    }

    function renderPanel() {
      const c = DATA.t2vCases.find(x => x.id === state.caseId);
      const m = c.models.find(x => x.id === state.modelId);
      const cs = caseStore(c.id);
      const saved = cs.models[m.id] || (cs.models[m.id] = { dims: {}, evidence: "", reason: "" });
      $("#model-title").textContent = `评分：${m.name}`;
      $("#model-sub").textContent = `${m.vendor} · ${m.meta}`;
      $("#dims").innerHTML = scoreRow(DATA.t2vDims, saved.dims);
      $("#evidence").value = saved.evidence || "";
      $("#reason").value = saved.reason || "";
      $("#case-conclusion").textContent = c.conclusion;
      bindScores();
      $("#evidence").oninput = e => { saved.evidence = e.target.value; persist(); };
      $("#reason").oninput = e => { saved.reason = e.target.value; persist(); };
    }

    function bindScores() {
      const c = DATA.t2vCases.find(x => x.id === state.caseId);
      const cs = caseStore(c.id);
      const saved = cs.models[state.modelId];
      $$("#dims .score-btn").forEach(btn => btn.addEventListener("click", () => {
        saved.dims[btn.dataset.dim] = +btn.dataset.score;
        persist();
        $$(`#dims .score-row[data-dim="${btn.dataset.dim}"] .score-btn`).forEach(b =>
          b.classList.toggle("on", +b.dataset.score === +btn.dataset.score));
      }));
    }

    $("#blind-toggle").addEventListener("change", (e) => { caseStore(state.caseId).blind = e.target.checked; renderGrid(); });
    $("#sync-btn").addEventListener("click", () => toast("四路已对齐到 0.0s（演示）"));
    $("#save-btn").addEventListener("click", () => { persist(); toast("已保存"); });
    $("#export-btn").addEventListener("click", () => dl("t2v-annotations.json", store.t2v));

    renderCases(); renderGrid(); renderPanel();
  }

  /* ---------------- world page ---------------- */
  function initWorld() {
    const state = { sceneId: DATA.worldScenes[0].id, modelId: "genie" };

    function sceneStore(sid) {
      if (!store.world[sid]) store.world[sid] = { models: {} };
      return store.world[sid];
    }

    function renderScenes() {
      $("#scene-list").innerHTML = DATA.worldScenes.map(s => `
        <div class="case ${s.id === state.sceneId ? "active" : ""}" data-scene="${s.id}">
          <strong>${s.id} · ${s.name}</strong>
          <span>${s.category} · 3 模型 · 60s 内</span>
        </div>
      `).join("");
      $$("#scene-list .case").forEach(el => el.addEventListener("click", () => {
        state.sceneId = el.dataset.scene;
        state.modelId = DATA.worldScenes.find(s => s.id === state.sceneId).models[0].id;
        renderScenes(); renderGrid(); renderPanel();
      }));
    }

    function renderGrid() {
      const s = DATA.worldScenes.find(x => x.id === state.sceneId);
      const ss = sceneStore(s.id);
      $("#world-title").textContent = `${s.id} · ${s.name}`;
      $("#world-action").textContent = s.action;
      $("#world-expect").textContent = s.expect;
      $("#grid").innerHTML = s.models.map(m => {
        const saved = ss.models[m.id] || {};
        const vals = saved.dims || {};
        const avg = Object.keys(vals).length ? (Object.values(vals).reduce((a, b) => a + b, 0) / Object.keys(vals).length).toFixed(1) : "—";
        return `<div class="model-card ${m.id === state.modelId ? "selected" : ""}" data-model="${m.id}">
          <div class="model-stage">
            <span class="model-label">${m.name}</span>
            <span class="ph">会话回放占位<br>录制后替换</span>
          </div>
          <div class="model-body">
            <div class="name">${m.name} · ${m.vendor}</div>
            <div class="meta">${m.meta}</div>
            <div class="score-chips"><span class="score-chip">均分 ${avg}</span><span class="score-chip">${Object.keys(vals).length}/4 维</span></div>
          </div>
        </div>`;
      }).join("");
      $$("#grid .model-card").forEach(el => el.addEventListener("click", () => {
        state.modelId = el.dataset.model;
        renderGrid(); renderPanel();
      }));
    }

    function renderPanel() {
      const s = DATA.worldScenes.find(x => x.id === state.sceneId);
      const m = s.models.find(x => x.id === state.modelId);
      const ss = sceneStore(s.id);
      const saved = ss.models[m.id] || (ss.models[m.id] = { dims: {}, evidence: "", reason: "", latency: "", duration: "" });
      $("#model-title").textContent = `评分：${m.name}`;
      $("#model-sub").textContent = `${m.vendor} · ${m.meta}`;
      $("#dims").innerHTML = scoreRow(DATA.worldDims, saved.dims);
      $("#evidence").value = saved.evidence || "";
      $("#reason").value = saved.reason || "";
      $("#latency").value = saved.latency || "";
      $("#effective").value = saved.duration || "";
      bindScores();
      $("#evidence").oninput = e => { saved.evidence = e.target.value; persist(); };
      $("#reason").oninput = e => { saved.reason = e.target.value; persist(); };
      $("#latency").oninput = e => { saved.latency = e.target.value; persist(); };
      $("#effective").oninput = e => { saved.duration = e.target.value; persist(); };
    }

    function bindScores() {
      const s = DATA.worldScenes.find(x => x.id === state.sceneId);
      const ss = sceneStore(s.id);
      const saved = ss.models[state.modelId];
      $$("#dims .score-btn").forEach(btn => btn.addEventListener("click", () => {
        saved.dims[btn.dataset.dim] = +btn.dataset.score;
        persist();
        $$(`#dims .score-row[data-dim="${btn.dataset.dim}"] .score-btn`).forEach(b =>
          b.classList.toggle("on", +b.dataset.score === +btn.dataset.score));
      }));
    }

    $("#save-btn").addEventListener("click", () => { persist(); toast("已保存"); });
    $("#export-btn").addEventListener("click", () => dl("world-annotations.json", store.world));

    renderScenes(); renderGrid(); renderPanel();
  }

  /* ---------------- boot ---------------- */
  window.VELAB = { DATA, store, persist, toast, dl, fmt, $, $$, scoreRow };

  document.addEventListener("DOMContentLoaded", () => {
    const page = document.body.dataset.page;
    $$(".nav a").forEach(a => a.classList.toggle("active", a.dataset.page === page));
    const exp = $("[data-export]");
    if (exp) exp.addEventListener("click", () => dl("velab-all.json", store));
    if (page === "caption") initCaption();
    if (page === "t2v") {
      if (typeof window.initT2V2 === "function") window.initT2V2(); else initT2V();
    }
    if (page === "world") {
      if (typeof window.initWorld2 === "function") window.initWorld2(); else initWorld();
    }
  });
})();
