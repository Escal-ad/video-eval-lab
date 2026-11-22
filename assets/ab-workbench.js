/* A/B blind workbench — pairwise GSB vote + per-side Rubric.
   Loaded after app.js on t2v.html and world.html. */
(function () {
  "use strict";

  const { DATA, store, persist, toast, dl, scoreRow, $, $$ } = window.VELAB;
  const T2V_DIMS = DATA.t2vDims;
  const WORLD_DIMS = DATA.worldDims;
  const VOTE_LABEL = { G: "A 更好", S: "持平", B: "B 更好" };

  function other(models, id) {
    return models.find(m => m.id !== id) || models[0];
  }

  function pairKey(a, b) {
    return [a, b].sort().join("|");
  }

  function done(saved, dims) {
    return dims.reduce((n, d) => n + (saved.dims && saved.dims[d.key] ? 1 : 0), 0);
  }

  function avg(saved, dims) {
    const vals = dims.map(d => saved.dims && saved.dims[d.key]).filter(Boolean);
    return vals.length ? (vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(1) : "—";
  }

  function deriveVotes(pair, dims) {
    const a = pair.models[pair.slots.A];
    const b = pair.models[pair.slots.B];
    const complete = dims.every(d => a.dims[d.key] && b.dims[d.key]);
    pair.votes = {};
    if (!complete) return;
    dims.forEach(d => {
      const av = a.dims[d.key];
      const bv = b.dims[d.key];
      pair.votes[d.key] = av > bv ? "G" : av < bv ? "B" : "S";
    });
  }

  function blankT2V() {
    return { dims: {}, evidence: "", reason: "" };
  }

  function blankWorld() {
    return { dims: {}, evidence: "", reason: "", latency: "", duration: "" };
  }

  /* ================= T2V ================= */
  function initT2V2() {
    const grid = $("#grid");
    if (!grid) return;
    const DIMS = T2V_DIMS;

    const state = {
      caseId: DATA.t2vCases[0].id,
      mode: "ab",
      pairA: null,
      pairB: null,
      active: "A",
      modelId: null
    };

    function currentCase() {
      return DATA.t2vCases.find(c => c.id === state.caseId);
    }

    function models() {
      return currentCase().models;
    }

    function cstore() {
      if (!store.t2v[state.caseId]) store.t2v[state.caseId] = { models: {}, blind: false };
      const c = store.t2v[state.caseId];
      if (!c.pairs) c.pairs = {};
      if (!c.mode) c.mode = "ab";
      return c;
    }

    function initPairIds() {
      const ms = models();
      state.pairA = ms[0].id;
      state.pairB = ms[1].id;
      state.active = "A";
      state.modelId = ms[0].id;
    }

    function getPair() {
      let a = state.pairA;
      let b = state.pairB;
      if (!a || !b) {
        initPairIds();
        a = state.pairA;
        b = state.pairB;
      }
      if (a === b) {
        b = other(models(), a).id;
        state.pairB = b;
      }
      const key = pairKey(a, b);
      const c = cstore();
      if (!c.pairs[key]) {
        const flip = Math.random() < 0.5;
        const position = { left: "A", right: "B" };
        const pair = {
          slots: flip ? { A: b, B: a } : { A: a, B: b },
          position,
          models: {},
          vote: null,
          revealed: false
        };
        pair.A = pair.slots.A;
        pair.B = pair.slots.B;
        pair.models[a] = blankT2V();
        pair.models[b] = blankT2V();
        c.pairs[key] = pair;
        persist();
      }
      const pair = c.pairs[key];
      if (!pair.position || pair.position.left !== "A") { pair.position = { left: "A", right: "B" }; persist(); }
      if (!pair.A || !pair.B) { pair.A = pair.slots.A; pair.B = pair.slots.B; persist(); }
      return { key, pair };
    }

    function renderModes() {
      $$(".mode-btn").forEach(btn => btn.classList.toggle("on", btn.dataset.mode === state.mode));
      $("#pair-controls").classList.toggle("hidden", state.mode !== "ab");
      $("#blind-label").classList.toggle("hidden", state.mode === "ab");
      $("#vote-box").classList.toggle("hidden", state.mode !== "ab");
      const hint = $("#ab-hint");
      if (hint) hint.classList.toggle("hidden", state.mode !== "ab");
      $("#case-note").classList.toggle("hidden", state.mode === "ab");
      $("#mode-note").textContent = state.mode === "ab"
        ? "两侧独立 Rubric → A/B 随机绑定 → 整体单选 → 揭盲"
        : "逐模型 1/3/5 三档；可开盲评隐藏模型名";
    }

    function renderPairSelects() {
      const ms = models();
      [["#pair-a", state.pairA], ["#pair-b", state.pairB]].forEach(([sel, cur]) => {
        $(sel).innerHTML = ms.map(m =>
          `<option value="${m.id}" ${m.id === cur ? "selected" : ""}>${m.name}</option>`
        ).join("");
      });
    }

    function renderCases() {
      $("#case-list").innerHTML = DATA.t2vCases.map(c => `
        <div class="case ${c.id === state.caseId ? "active" : ""}" data-case="${c.id}">
          <strong>${c.id} · ${c.name}</strong>
          <span>${c.models.length} 模型 · ${c.duration}s · 案例研究</span>
        </div>
      `).join("");
      $$("#case-list .case").forEach(el => {
        el.addEventListener("click", () => {
          state.caseId = el.dataset.case;
          state.mode = "ab"; // 单模型 Rubric 已下线：旧存档里的 rubric 不再生效
          initPairIds();
          $("#blind-toggle").checked = !!cstore().blind;
          renderAll();
        });
      });
    }

    function renderGrid() {
      const c = currentCase();
      const blind = $("#blind-toggle").checked;
      $("#case-title").textContent = `${c.id} · ${c.name}`;
      $("#case-prompt").textContent = c.prompt;

      if (state.mode === "rubric") {
        $("#grid").innerHTML = c.models.map((m, i) => {
          const label = blind ? `模型 ${String.fromCharCode(65 + i)}` : m.name;
          const saved = (cstore().models[m.id] = cstore().models[m.id] || blankT2V());
          return `<div class="model-card ${m.id === state.modelId ? "selected" : ""}" data-model="${m.id}">
            <div class="model-stage">
              <span class="model-label">${label}</span>
              <span class="ph">视频占位<br>接入后自动播放</span>
            </div>
            <div class="model-body">
              <div class="name">${blind ? label : `${m.name} · ${m.vendor}`}</div>
              <div class="meta">${m.meta} · 公开榜 ${m.score}</div>
              <div class="score-chips">
                <span class="score-chip">均分 ${avg(saved, T2V_DIMS)}</span>
                <span class="score-chip">${done(saved, T2V_DIMS)}/5 维</span>
              </div>
            </div>
          </div>`;
        }).join("");
        $$("#grid .model-card").forEach(el => {
          el.addEventListener("click", () => {
            state.modelId = el.dataset.model;
            renderGrid();
            renderPanel();
          });
        });
        return;
      }

      const { pair } = getPair();
      const order = pair.position ? [pair.position.left, pair.position.right] : ["A", "B"];
      $("#grid").innerHTML = order.map(slot => {
        const id = pair.slots[slot];
        const m = c.models.find(x => x.id === id);
        const saved = pair.models[id];
        const label = slot;
        const body = pair.revealed ? `${m.name} · ${m.vendor}` : `模型 ${slot}`;
        const meta = pair.revealed ? `${m.meta} · 公开榜 ${m.score}` : "同 prompt · 同 seed · 名称隐藏";
        return `<div class="model-card ${state.active === slot ? "selected" : ""}" data-slot="${slot}">
          <div class="model-stage">
            <span class="model-label">${label}</span>
            <span class="ph">视频占位<br>接入后自动播放</span>
          </div>
          <div class="model-body">
            <div class="name">${body}</div>
            <div class="meta">${meta}</div>
            <div class="score-chips">
              <span class="score-chip">均分 ${avg(saved, T2V_DIMS)}</span>
              <span class="score-chip">${done(saved, T2V_DIMS)}/5 维</span>
            </div>
          </div>
        </div>`;
      }).join("");
      $$("#grid .model-card").forEach(el => {
        el.addEventListener("click", () => {
          state.active = el.dataset.slot;
          renderGrid();
          renderPanel();
        });
      });
    }

    function renderVote(pair) {
      const ms = models();
      const name = id => (ms.find(m => m.id === id) || { name: id }).name;
      const a = pair.models[pair.slots.A];
      const b = pair.models[pair.slots.B];
      deriveVotes(pair, T2V_DIMS);
      $$("#vote-box [data-vote]").forEach(btn => {
        btn.classList.toggle("primary", pair.vote === btn.dataset.vote);
      });
      const el = $("#vote-result");
      if (pair.revealed) {
        const pos = pair.position || { left: "A", right: "B" };
        el.innerHTML = `A = ${name(pair.slots.A)}，B = ${name(pair.slots.B)}（${pos.left} 在左，${pos.right} 在右）；本轮 ${pair.vote ? VOTE_LABEL[pair.vote] : "未投票"}。`;
      } else if (pair.vote) {
        el.textContent = `已记录「${VOTE_LABEL[pair.vote]}」；两侧 ${done(a, T2V_DIMS)}/5、${done(b, T2V_DIMS)}/5 维。点揭盲看 A/B。`;
      } else {
        el.textContent = `两侧 ${done(a, T2V_DIMS)}/5、${done(b, T2V_DIMS)}/5 维；先打分，再投整体。`;
      }
      const deltas = $("#vote-deltas");
      if (deltas) {
        const parts = T2V_DIMS.map(d => {
          const av = a.dims[d.key];
          const bv = b.dims[d.key];
          if (!av || !bv) return null;
          const diff = av - bv;
          return `${d.label} ${diff > 0 ? `A+${diff}` : diff < 0 ? `B+${-diff}` : "0"}`;
        }).filter(Boolean);
        let text = parts.length === T2V_DIMS.length
          ? `分维度（Rubric 差值）：${parts.join(" · ")}`
          : "";
        if (parts.length === T2V_DIMS.length && pair.vote) {
          const g = T2V_DIMS.filter(d => a.dims[d.key] > b.dims[d.key]).length;
          const bb = T2V_DIMS.filter(d => a.dims[d.key] < b.dims[d.key]).length;
          const majority = g > bb ? "G" : bb > g ? "B" : "S";
          if (majority !== "S" && pair.vote !== majority) {
            text += " · 整体票与 Rubric 多数不一致，请在理由里说明";
          }
        }
        deltas.textContent = text;
      }
      const note = $("#case-note");
      if (note) note.classList.toggle("hidden", state.mode === "ab" && !pair.revealed);
      const concl = $("#case-conclusion");
      if (concl) {
        if (!pair.revealed) {
          concl.textContent = "";
        } else if (done(a, T2V_DIMS) === T2V_DIMS.length && done(b, T2V_DIMS) === T2V_DIMS.length) {
          const avgA = (T2V_DIMS.reduce((s, d) => s + a.dims[d.key], 0) / T2V_DIMS.length).toFixed(1);
          const avgB = (T2V_DIMS.reduce((s, d) => s + b.dims[d.key], 0) / T2V_DIMS.length).toFixed(1);
          const g = T2V_DIMS.filter(d => a.dims[d.key] > b.dims[d.key]).length;
          const bb = T2V_DIMS.filter(d => a.dims[d.key] < b.dims[d.key]).length;
          const majority = g > bb ? "G" : bb > g ? "B" : "S";
          const mismatch = pair.vote && majority !== "S" && pair.vote !== majority;
          concl.textContent = `本组 A（${name(pair.slots.A)}）均分 ${avgA}、B（${name(pair.slots.B)}）均分 ${avgB}，整体判 ${pair.vote ? VOTE_LABEL[pair.vote] : "未投票"}。${mismatch ? "整体票与 Rubric 多数不一致，理由见右栏。" : ""}结论只对应该组配对，不作跨案例排名。`;
        }
      }
    }

    function bindScores(saved) {
      $$("#dims .score-btn").forEach(btn => {
        btn.onclick = () => {
          saved.dims[btn.dataset.dim] = +btn.dataset.score;
          persist();
          $$(`#dims .score-row[data-dim="${btn.dataset.dim}"] .score-btn`).forEach(b => {
            b.classList.toggle("on", +b.dataset.score === +btn.dataset.score);
          });
          renderGrid();
          if (state.mode === "ab") {
            const { pair } = getPair();
            deriveVotes(pair, DIMS);
            persist();
            renderVote(pair);
          }
        };
      });
    }

    function renderPanel() {
      const c = currentCase();

      if (state.mode === "ab") {
        const { pair } = getPair();
        const id = pair.slots[state.active];
        const m = c.models.find(x => x.id === id);
        const saved = pair.models[id];
        $("#model-title").textContent = pair.revealed
          ? `评分：${state.active} · ${m.name}`
          : `评分：${state.active}（名称隐藏）`;
        $("#model-sub").textContent = "点 A/B 卡切换评分侧；两侧都评完再揭盲";
        $("#dims").innerHTML = scoreRow(T2V_DIMS, saved.dims);
        $("#evidence").value = saved.evidence || "";
        $("#reason").value = saved.reason || "";
        $("#save-btn").textContent = "保存本轮评分";
        $("#case-conclusion").textContent = "";
        bindScores(saved);
        renderVote(pair);
        return;
      }

      const m = c.models.find(x => x.id === state.modelId);
      const saved = cstore().models[m.id] || (cstore().models[m.id] = blankT2V());
      $("#model-title").textContent = `评分：${m.name}`;
      $("#model-sub").textContent = `${m.vendor} · ${m.meta}`;
      $("#dims").innerHTML = scoreRow(T2V_DIMS, saved.dims);
      $("#evidence").value = saved.evidence || "";
      $("#reason").value = saved.reason || "";
      $("#save-btn").textContent = "保存本模型评分";
      $("#case-conclusion").textContent = c.conclusion;
      bindScores(saved);
    }

    function renderAll() {
      renderModes();
      renderPairSelects();
      renderCases();
      renderGrid();
      renderPanel();
    }

    function bindVote() {
      $$("#vote-box [data-vote]").forEach(btn => {
        btn.onclick = () => {
          const { pair } = getPair();
          pair.vote = btn.dataset.vote;
          persist();
          renderVote(pair);
        };
      });
      $("#reveal-btn").onclick = () => {
        const { pair } = getPair();
        if (!pair.vote) { toast("先投整体判断"); return; }
        const ok = T2V_DIMS.every(d =>
          pair.models[pair.slots.A].dims[d.key] && pair.models[pair.slots.B].dims[d.key]
        );
        if (!ok) { toast("两侧 rubric 都评完再揭盲"); return; }
        pair.revealed = true;
        persist();
        renderGrid();
        renderPanel();
        toast("已揭盲：A/B 对应模型见卡片");
      };
    }

    $$(".mode-btn").forEach(btn => {
      btn.onclick = () => {
        state.mode = btn.dataset.mode;
        cstore().mode = state.mode;
        persist();
        if (state.mode === "ab") state.active = "A";
        renderAll();
      };
    });

    $("#pair-a").onchange = e => {
      state.pairA = e.target.value;
      if (state.pairA === state.pairB) state.pairB = other(models(), state.pairA).id;
      state.active = "A";
      renderAll();
    };
    $("#pair-b").onchange = e => {
      state.pairB = e.target.value;
      if (state.pairA === state.pairB) state.pairA = other(models(), state.pairB).id;
      state.active = "A";
      renderAll();
    };

    $("#blind-toggle").addEventListener("change", e => {
      cstore().blind = e.target.checked;
      persist();
      renderGrid();
    });
    $("#sync-btn").addEventListener("click", () => toast("A/B 已对齐到 0.0s（演示）"));
    $("#save-btn").addEventListener("click", () => {
      persist();
      toast(state.mode === "ab" ? "本轮评分已保存" : "已保存");
    });
    $("#export-btn").addEventListener("click", () => dl("t2v-annotations.json", store.t2v));

    state.mode = "ab"; // 单模型 Rubric 已下线
    initPairIds();
    $("#blind-toggle").checked = !!cstore().blind;
    bindVote();
    renderAll();
  }

  /* ================= World ================= */
  function initWorld2() {
    const grid = $("#grid");
    if (!grid) return;
    const DIMS = WORLD_DIMS;

    const state = {
      sceneId: DATA.worldScenes[0].id,
      mode: "ab",
      pairA: null,
      pairB: null,
      active: "A",
      modelId: null
    };

    function currentScene() {
      return DATA.worldScenes.find(s => s.id === state.sceneId);
    }

    function models() {
      return currentScene().models;
    }

    function sstore() {
      if (!store.world[state.sceneId]) store.world[state.sceneId] = { models: {} };
      const s = store.world[state.sceneId];
      if (!s.pairs) s.pairs = {};
      if (!s.mode) s.mode = "ab";
      return s;
    }

    function initPairIds() {
      const ms = models();
      state.pairA = ms[0].id;
      state.pairB = ms[1].id;
      state.active = "A";
      state.modelId = ms[0].id;
    }

    function getPair() {
      let a = state.pairA;
      let b = state.pairB;
      if (!a || !b) {
        initPairIds();
        a = state.pairA;
        b = state.pairB;
      }
      if (a === b) {
        b = other(models(), a).id;
        state.pairB = b;
      }
      const key = pairKey(a, b);
      const s = sstore();
      if (!s.pairs[key]) {
        const flip = Math.random() < 0.5;
        const position = { left: "A", right: "B" };
        const pair = {
          slots: flip ? { A: b, B: a } : { A: a, B: b },
          position,
          models: {},
          vote: null,
          revealed: false
        };
        pair.A = pair.slots.A;
        pair.B = pair.slots.B;
        pair.models[a] = blankWorld();
        pair.models[b] = blankWorld();
        s.pairs[key] = pair;
        persist();
      }
      const pair = s.pairs[key];
      if (!pair.position || pair.position.left !== "A") { pair.position = { left: "A", right: "B" }; persist(); }
      if (!pair.A || !pair.B) { pair.A = pair.slots.A; pair.B = pair.slots.B; persist(); }
      return { key, pair };
    }

    function renderModes() {
      $$(".mode-btn").forEach(btn => btn.classList.toggle("on", btn.dataset.mode === state.mode));
      $("#pair-controls").classList.toggle("hidden", state.mode !== "ab");
      $("#vote-box").classList.toggle("hidden", state.mode !== "ab");
      const hint = $("#ab-hint");
      if (hint) hint.classList.toggle("hidden", state.mode !== "ab");
      $("#mode-note").textContent = state.mode === "ab"
        ? "两侧独立 Rubric → A/B 随机绑定 → 整体单选 → 揭盲"
        : "逐模型 1/3/5 三档；延迟与有效时长单列";
      $("#grid").classList.toggle("two-col", state.mode === "ab");
    }

    function renderPairSelects() {
      const ms = models();
      [["#pair-a", state.pairA], ["#pair-b", state.pairB]].forEach(([sel, cur]) => {
        $(sel).innerHTML = ms.map(m =>
          `<option value="${m.id}" ${m.id === cur ? "selected" : ""}>${m.name}</option>`
        ).join("");
      });
    }

    function renderScenes() {
      $("#scene-list").innerHTML = DATA.worldScenes.map(s => `
        <div class="case ${s.id === state.sceneId ? "active" : ""}" data-scene="${s.id}">
          <strong>${s.id} · ${s.name}</strong>
          <span>${s.category} · 3 模型 · 60s 内</span>
        </div>
      `).join("");
      $$("#scene-list .case").forEach(el => {
        el.addEventListener("click", () => {
          state.sceneId = el.dataset.scene;
          state.mode = sstore().mode || "ab";
          initPairIds();
          renderAll();
        });
      });
    }

    function renderGrid() {
      const s = currentScene();
      $("#world-title").textContent = `${s.id} · ${s.name}`;
      $("#world-action").textContent = s.action;
      $("#world-expect").textContent = s.expect;

      if (state.mode === "rubric") {
        $("#grid").innerHTML = s.models.map(m => {
          const saved = (sstore().models[m.id] = sstore().models[m.id] || blankWorld());
          return `<div class="model-card ${m.id === state.modelId ? "selected" : ""}" data-model="${m.id}">
            <div class="model-stage">
              <span class="model-label">${m.name}</span>
              <span class="ph">会话回放占位<br>录制后替换</span>
            </div>
            <div class="model-body">
              <div class="name">${m.name} · ${m.vendor}</div>
              <div class="meta">${m.meta}</div>
              <div class="score-chips">
                <span class="score-chip">均分 ${avg(saved, WORLD_DIMS)}</span>
                <span class="score-chip">${done(saved, WORLD_DIMS)}/4 维</span>
              </div>
            </div>
          </div>`;
        }).join("");
        $$("#grid .model-card").forEach(el => {
          el.addEventListener("click", () => {
            state.modelId = el.dataset.model;
            renderGrid();
            renderPanel();
          });
        });
        return;
      }

      const { pair } = getPair();
      const order = pair.position ? [pair.position.left, pair.position.right] : ["A", "B"];
      $("#grid").innerHTML = order.map(slot => {
        const id = pair.slots[slot];
        const m = s.models.find(x => x.id === id);
        const saved = pair.models[id];
        const body = pair.revealed ? `${m.name} · ${m.vendor}` : `模型 ${slot}`;
        const meta = pair.revealed ? m.meta : "同场景 · 同初始帧 · 名称隐藏";
        return `<div class="model-card ${state.active === slot ? "selected" : ""}" data-slot="${slot}">
          <div class="model-stage">
            <span class="model-label">${slot}</span>
            <span class="ph">会话回放占位<br>录制后替换</span>
          </div>
          <div class="model-body">
            <div class="name">${body}</div>
            <div class="meta">${meta}</div>
            <div class="score-chips">
              <span class="score-chip">均分 ${avg(saved, WORLD_DIMS)}</span>
              <span class="score-chip">${done(saved, WORLD_DIMS)}/4 维</span>
            </div>
          </div>
        </div>`;
      }).join("");
      $$("#grid .model-card").forEach(el => {
        el.addEventListener("click", () => {
          state.active = el.dataset.slot;
          renderGrid();
          renderPanel();
        });
      });
    }

    function renderVote(pair) {
      const ms = models();
      const name = id => (ms.find(m => m.id === id) || { name: id }).name;
      const a = pair.models[pair.slots.A];
      const b = pair.models[pair.slots.B];
      deriveVotes(pair, WORLD_DIMS);
      $$("#vote-box [data-vote]").forEach(btn => {
        btn.classList.toggle("primary", pair.vote === btn.dataset.vote);
      });
      const el = $("#vote-result");
      if (pair.revealed) {
        const pos = pair.position || { left: "A", right: "B" };
        el.innerHTML = `A = ${name(pair.slots.A)}，B = ${name(pair.slots.B)}（${pos.left} 在左，${pos.right} 在右）；本轮 ${pair.vote ? VOTE_LABEL[pair.vote] : "未投票"}。`;
      } else if (pair.vote) {
        el.textContent = `已记录「${VOTE_LABEL[pair.vote]}」；两侧 ${done(a, WORLD_DIMS)}/4、${done(b, WORLD_DIMS)}/4 维。点揭盲看 A/B。`;
      } else {
        el.textContent = `两侧 ${done(a, WORLD_DIMS)}/4、${done(b, WORLD_DIMS)}/4 维；先打分，再投整体。`;
      }
      const deltas = $("#vote-deltas");
      if (deltas) {
        const parts = WORLD_DIMS.map(d => {
          const av = a.dims[d.key];
          const bv = b.dims[d.key];
          if (!av || !bv) return null;
          const diff = av - bv;
          return `${d.label} ${diff > 0 ? `A+${diff}` : diff < 0 ? `B+${-diff}` : "0"}`;
        }).filter(Boolean);
        let text = parts.length === WORLD_DIMS.length
          ? `分维度（Rubric 差值）：${parts.join(" · ")}`
          : "";
        if (parts.length === WORLD_DIMS.length && pair.vote) {
          const g = WORLD_DIMS.filter(d => a.dims[d.key] > b.dims[d.key]).length;
          const bb = WORLD_DIMS.filter(d => a.dims[d.key] < b.dims[d.key]).length;
          const majority = g > bb ? "G" : bb > g ? "B" : "S";
          if (majority !== "S" && pair.vote !== majority) {
            text += " · 整体票与 Rubric 多数不一致，请在理由里说明";
          }
        }
        deltas.textContent = text;
      }
    }

    function bindScores(saved) {
      $$("#dims .score-btn").forEach(btn => {
        btn.onclick = () => {
          saved.dims[btn.dataset.dim] = +btn.dataset.score;
          persist();
          $$(`#dims .score-row[data-dim="${btn.dataset.dim}"] .score-btn`).forEach(b => {
            b.classList.toggle("on", +b.dataset.score === +btn.dataset.score);
          });
          renderGrid();
          if (state.mode === "ab") {
            const { pair } = getPair();
            deriveVotes(pair, DIMS);
            persist();
            renderVote(pair);
          }
        };
      });
    }

    function renderPanel() {
      const s = currentScene();

      if (state.mode === "ab") {
        const { pair } = getPair();
        const id = pair.slots[state.active];
        const m = s.models.find(x => x.id === id);
        const saved = pair.models[id];
        $("#model-title").textContent = pair.revealed
          ? `评分：${state.active} · ${m.name}`
          : `评分：${state.active}（名称隐藏）`;
        $("#model-sub").textContent = "点 A/B 卡切换评分侧；两侧都评完再揭盲";
        $("#dims").innerHTML = scoreRow(WORLD_DIMS, saved.dims);
        $("#evidence").value = saved.evidence || "";
        $("#reason").value = saved.reason || "";
        $("#latency").value = saved.latency || "";
        $("#effective").value = saved.duration || "";
        $("#save-btn").textContent = "保存本轮评分";
        bindScores(saved);
        renderVote(pair);
        return;
      }

      const m = s.models.find(x => x.id === state.modelId);
      const saved = sstore().models[m.id] || (sstore().models[m.id] = blankWorld());
      $("#model-title").textContent = `评分：${m.name}`;
      $("#model-sub").textContent = `${m.vendor} · ${m.meta}`;
      $("#dims").innerHTML = scoreRow(WORLD_DIMS, saved.dims);
      $("#evidence").value = saved.evidence || "";
      $("#reason").value = saved.reason || "";
      $("#latency").value = saved.latency || "";
      $("#effective").value = saved.duration || "";
      $("#save-btn").textContent = "保存本模型评分";
      bindScores(saved);
    }

    function renderAll() {
      renderModes();
      renderPairSelects();
      renderScenes();
      renderGrid();
      renderPanel();
    }

    function bindVote() {
      $$("#vote-box [data-vote]").forEach(btn => {
        btn.onclick = () => {
          const { pair } = getPair();
          pair.vote = btn.dataset.vote;
          persist();
          renderVote(pair);
        };
      });
      $("#reveal-btn").onclick = () => {
        const { pair } = getPair();
        if (!pair.vote) { toast("先投整体判断"); return; }
        const ok = WORLD_DIMS.every(d =>
          pair.models[pair.slots.A].dims[d.key] && pair.models[pair.slots.B].dims[d.key]
        );
        if (!ok) { toast("两侧 rubric 都评完再揭盲"); return; }
        pair.revealed = true;
        persist();
        renderGrid();
        renderPanel();
        toast("已揭盲：A/B 对应模型见卡片");
      };
    }

    $$(".mode-btn").forEach(btn => {
      btn.onclick = () => {
        state.mode = btn.dataset.mode;
        sstore().mode = state.mode;
        persist();
        if (state.mode === "ab") state.active = "A";
        renderAll();
      };
    });

    $("#pair-a").onchange = e => {
      state.pairA = e.target.value;
      if (state.pairA === state.pairB) state.pairB = other(models(), state.pairA).id;
      state.active = "A";
      renderAll();
    };
    $("#pair-b").onchange = e => {
      state.pairB = e.target.value;
      if (state.pairA === state.pairB) state.pairA = other(models(), state.pairB).id;
      state.active = "A";
      renderAll();
    };

    $("#sync-btn").addEventListener("click", () => toast("两侧已对齐到 0.0s（演示）"));
    $("#save-btn").addEventListener("click", () => {
      persist();
      toast(state.mode === "ab" ? "本轮评分已保存" : "已保存");
    });
    $("#export-btn").addEventListener("click", () => dl("world-annotations.json", store.world));

    state.mode = sstore().mode || "ab";
    initPairIds();
    bindVote();
    renderAll();
  }

  window.initT2V2 = initT2V2;
  window.initWorld2 = initWorld2;
})();
