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
    /* dims[key] = { s: 1|3|5|"N/A"|null, note: "", ts: 秒 } */
    return { dims: {} };
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

    function stage(m, slot) {
      if (!m || !m.video) return `<span class="ph">视频占位<br>接入后自动播放</span>`;
      const tag = slot ? ` data-slot="${slot}"` : "";
      return `<video class="slot-video"${tag} controls preload="auto" playsinline src="${m.video}"></video>`;
    }

    /* —— 逐维 A/B 证据：每维每侧 { s, note, ts } —— */
    function ent(saved, key) {
      const v = saved && saved.dims && saved.dims[key];
      return (v && typeof v === "object" && "s" in v) ? v : null;
    }
    function scOf(saved, key) {
      const e = ent(saved, key);
      return e && e.s !== null && e.s !== undefined && e.s !== "" ? e.s : null;
    }
    function numOf(saved, key) {
      const v = scOf(saved, key);
      return typeof v === "number" ? v : null;
    }
    function filled(saved, key) {
      return scOf(saved, key) !== null;
    }
    function tdone(saved) {
      return activeDims().filter(d => filled(saved, d.key)).length;
    }
    function tavg(saved) {
      const vals = activeDims().map(d => numOf(saved, d.key)).filter(v => typeof v === "number");
      return vals.length ? (vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(1) : "—";
    }
    function needsNote(saved, key) {
      const v = numOf(saved, key);
      const e = ent(saved, key);
      return v !== null && v < 3 && !((e && e.note) || "").trim();
    }
    function tderiveVotes(pair) {
      pair.votes = {};
      const a = pair.models[pair.slots.A];
      const b = pair.models[pair.slots.B];
      activeDims().forEach(d => {
        const av = numOf(a, d.key);
        const bv = numOf(b, d.key);
        if (av === null || bv === null) return;
        pair.votes[d.key] = av > bv ? "G" : av < bv ? "B" : "S";
      });
    }

    /* ---- transport: Annota-style sync bar (同步播放 / 回到开头 / 倍速 / 只听A·B / 对齐模式) ---- */
    const T = { time: 0, playing: false, rate: 1, audio: "stereo", align: "common", raf: 0 };
    // src 带 #t=0.1（只为让首帧立刻可见），用户没动过播放器之前统一拉回 0.000
    let started = false;

    function clips() {
      return $$("#grid video");
    }

    function durOf(v) {
      const d = v && isFinite(v.duration) ? v.duration : 0;
      return d > 0 ? d : (currentCase().duration || 0);
    }

    function span() {
      const ds = clips().map(durOf).filter(n => n > 0);
      if (!ds.length) return currentCase().duration || 0;
      return T.align === "common" ? Math.min(...ds) : Math.max(...ds);
    }

    function applyAudio() {
      clips().forEach(v => {
        const slot = v.dataset.slot;
        v.muted = T.audio === "mute"
          || (T.audio === "a" && slot !== "A")
          || (T.audio === "b" && slot !== "B");
      });
    }

    // 00:03.300 这种读数，跟 caption 页同一套写法，精度保留到毫秒
    function tc(sec) {
      const s = Math.max(0, sec || 0);
      const m = Math.floor(s / 60);
      return `${String(m).padStart(2, "0")}:${(s - m * 60).toFixed(3).padStart(6, "0")}`;
    }

    function paintTransport() {
      const total = span();
      const read = $("#tp-read");
      if (read) read.textContent = `${tc(T.time)} / ${tc(total)}`;
      const head = $("#tp-playhead");
      if (head) head.style.left = `${total > 0 ? Math.min(1, Math.max(0, T.time / total)) * 100 : 0}%`;
      const seg = $("#tp-seg");
      if (seg) seg.textContent = state.caseId || "—";
      const ruler = $("#tp-ruler");
      if (ruler) {
        const step = total <= 8 ? 1 : total <= 20 ? 2 : 5;
        const out = [];
        for (let x = 0; x <= total - 0.15; x += step) {
          out.push(`<span style="left:${(x / total) * 100}%">${tc(x)}</span>`);
        }
        out.push(`<span style="left:100%">${tc(total)}</span>`);
        ruler.innerHTML = out.join("");
      }
      const hint = $("#tp-hint");
      if (hint) {
        hint.textContent = T.align === "common"
          ? `共同区间 0–${total.toFixed(3)} 秒 · 到结尾同时停止`
          : `各自全片：${clips().map(v => `${v.dataset.slot} ${durOf(v).toFixed(3)}s`).join(" · ") || "—"} · 不裁剪对齐`;
      }
      const btn = $("#tp-play");
      if (btn) btn.textContent = T.playing ? "⏸ 暂停" : "▶ 播放";
    }

    function seekAll(t) {
      started = true;
      T.time = Math.min(Math.max(0, t || 0), span());
      clips().forEach(v => {
        const target = T.align === "common" ? Math.min(T.time, durOf(v)) : T.time;
        try { v.currentTime = target; } catch (e) { /* 元数据未就绪 */ }
      });
      paintTransport();
    }

    function pauseAll() {
      T.playing = false;
      cancelAnimationFrame(T.raf);
      clips().forEach(v => v.pause());
      paintTransport();
    }

    function playAll() {
      started = true;
      const vs = clips();
      if (!vs.length) return;
      const end = span();
      if (T.time >= end - 0.02) T.time = 0;
      vs.forEach(v => {
        v.playbackRate = T.rate;
        try { v.currentTime = Math.min(T.time, durOf(v)); } catch (e) { /* ignore */ }
      });
      applyAudio();
      T.playing = true;
      vs.forEach(v => {
        const p = v.play();
        if (p && p.catch) p.catch(() => { /* autoplay 被拦时保持静音不动 */ });
      });
      paintTransport();
      const lead = vs[0];
      cancelAnimationFrame(T.raf);
      const tick = () => {
        if (!T.playing) return;
        const total = span();
        const pos = Math.max(0, Math.min(lead.currentTime, total));
        T.time = pos;
        if (T.align === "common" && vs.length > 1) {
          vs.forEach(v => {
            if (v !== lead && !v.paused && Math.abs(v.currentTime - lead.currentTime) > 0.12) {
              try { v.currentTime = lead.currentTime; } catch (e) { /* ignore */ }
            }
          });
        }
        paintTransport();
        if (T.align === "common" && pos >= total - 0.03) {
          seekAll(total);
          pauseAll();
          return;
        }
        T.raf = requestAnimationFrame(tick);
      };
      T.raf = requestAnimationFrame(tick);
    }

    function bindTransport() {
      const play = $("#tp-play");
      if (play) play.onclick = () => { T.playing ? pauseAll() : playAll(); };
      const home = $("#tp-home");
      if (home) home.onclick = () => { pauseAll(); seekAll(0); };
      const rate = $("#tp-rate");
      if (rate) rate.onchange = e => {
        T.rate = +e.target.value || 1;
        clips().forEach(v => { v.playbackRate = T.rate; });
      };
      const audio = $("#tp-audio");
      if (audio) audio.onchange = e => { T.audio = e.target.value; applyAudio(); };
      const align = $("#tp-align");
      if (align) align.onchange = e => { T.align = e.target.value; seekAll(T.time); };

      // 微调：按一下走 0.1 秒，卡动作用的
      const back = $("#tp-back");
      if (back) back.onclick = () => seekAll(T.time - 0.1);
      const fwd = $("#tp-fwd");
      if (fwd) fwd.onclick = () => seekAll(T.time + 0.1);

      // 轨道：点哪儿停哪儿，按住可以拖游标
      const track = $("#tp-track");
      if (track) {
        const ratio = e => {
          const r = track.getBoundingClientRect();
          if (!r.width) return 0;
          return Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
        };
        let dragging = false;
        track.addEventListener("pointerdown", e => {
          dragging = true;
          try { track.setPointerCapture(e.pointerId); } catch (x) { /* ignore */ }
          seekAll(ratio(e) * span());
        });
        track.addEventListener("pointermove", e => { if (dragging) seekAll(ratio(e) * span()); });
        const stop = e => {
          dragging = false;
          try { track.releasePointerCapture(e.pointerId); } catch (x) { /* ignore */ }
        };
        track.addEventListener("pointerup", stop);
        track.addEventListener("pointercancel", stop);
      }

      // 键盘：←→ 各 0.1 秒，空格播放/暂停（焦点在输入框里时不抢键）
      document.addEventListener("keydown", e => {
        const t = e.target || {};
        const tag = (t.tagName || "").toUpperCase();
        if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || tag === "BUTTON" || t.isContentEditable) return;
        if (!$("#grid") || !clips().length) return;
        if (e.key === "ArrowLeft") { e.preventDefault(); seekAll(T.time - 0.1); }
        else if (e.key === "ArrowRight") { e.preventDefault(); seekAll(T.time + 0.1); }
        else if (e.key === " " || e.code === "Space") { e.preventDefault(); T.playing ? pauseAll() : playAll(); }
      });
    }

    // 每次重绘 #grid 后把视频拉回当前播放位置（打分点击会重建卡片，不能让它归零）
    function syncTransport() {
      clips().forEach(v => {
        v.playbackRate = T.rate;
        if (!T.playing) { try { v.currentTime = Math.min(T.time, durOf(v)); } catch (e) { /* ignore */ } }
        const zero = () => {
          if (started) return;
          try { v.currentTime = 0; } catch (e) { /* ignore */ }
          T.time = 0;
          paintTransport();
        };
        v.addEventListener("loadedmetadata", () => { zero(); paintTransport(); });
        v.addEventListener("ended", () => { if (T.align === "common") pauseAll(); });
        // 直接点了某个 <video> 自带的播放/暂停，也把另一侧带上，别让两边跑散
        v.addEventListener("play", () => {
          if (!T.playing) {
            T.time = Math.min(v.currentTime, span());
            playAll();
          }
        });
        v.addEventListener("pause", () => {
          if (!T.playing || !v.isConnected) return;   // 卡片重绘时旧元素被摘掉也会触发 pause
          pauseAll();
        });
        v.addEventListener("timeupdate", () => {
          if (!T.playing && started && v === clips()[0]) {
            T.time = Math.min(v.currentTime, span());
            paintTransport();
          }
        });
        zero();
      });
      applyAudio();
      paintTransport();
      if (T.playing) playAll();
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
      $("#vote-box").classList.toggle("hidden", state.mode !== "ab" || currentCase().gsb === false);
      const hint = $("#ab-hint");
      if (hint) hint.classList.toggle("hidden", state.mode !== "ab");
      $("#case-note").classList.toggle("hidden", state.mode === "ab");
      $("#mode-note").textContent = currentCase().modeNote || (state.mode === "ab"
        ? "两侧独立 Rubric → A/B 随机绑定 → 整体单选"
        : "逐模型 1/3/5 三档；可开盲评隐藏模型名");
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
          T.time = 0;
          T.playing = false;
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
      const chip = document.querySelector(".stage-head .chip");
      if (chip) chip.textContent = `T2V · ${activeDims().length} 维`;
      const noteEl = $("#mode-note");
      if (noteEl) noteEl.textContent = c.modeNote || "两侧独立 Rubric → 整体 A/B 单选";

      if (state.mode === "rubric") {
        $("#grid").innerHTML = c.models.map((m, i) => {
          const label = blind ? `模型 ${String.fromCharCode(65 + i)}` : m.name;
          const saved = (cstore().models[m.id] = cstore().models[m.id] || blankT2V());
          return `<div class="model-card ${m.id === state.modelId ? "selected" : ""}" data-model="${m.id}">
            <div class="model-stage">
              <span class="model-label">${label}</span>
              ${stage(m)}
            </div>
            <div class="model-body">
              <div class="name">${blind ? label : `${m.name} · ${m.vendor}`}</div>
              <div class="meta">${m.meta}${m.score ? ` · 公开榜 ${m.score}` : ""}</div>
              <div class="score-chips">
                <span class="score-chip">均分 ${tavg(saved)}</span>
                <span class="score-chip">${tdone(saved)}/${activeDims().length} 维</span>
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
        const meta = pair.revealed
          ? `${m.meta}${m.score ? ` · 公开榜 ${m.score}` : ""}`
          : "同 prompt · 名称隐藏";
        return `<div class="model-card" data-slot="${slot}">
          <div class="model-stage">
            <span class="model-label">${label}</span>
            ${stage(m, slot)}
          </div>
          <div class="model-body">
            <div class="name">${body}</div>
            <div class="meta">${meta}</div>
            <div class="score-chips">
              <span class="score-chip">均分 ${tavg(saved)}</span>
              <span class="score-chip">${tdone(saved)}/${activeDims().length} 维</span>
            </div>
          </div>
        </div>`;
      }).join("");
    }

    function renderVote(pair) {
      const ms = models();
      const name = id => (ms.find(m => m.id === id) || { name: id }).name;
      const a = pair.models[pair.slots.A];
      const b = pair.models[pair.slots.B];
      const vbox = $("#vote-box");
      if (vbox) vbox.classList.toggle("hidden", currentCase().gsb === false);
      tderiveVotes(pair);
      $$("#vote-box [data-vote]").forEach(btn => {
        btn.classList.toggle("primary", pair.vote === btn.dataset.vote);
      });
      const el = $("#vote-result");
      if (pair.revealed) {
        const pos = pair.position || { left: "A", right: "B" };
        el.innerHTML = `A = ${name(pair.slots.A)}，B = ${name(pair.slots.B)}（${pos.left} 在左，${pos.right} 在右）；本轮 ${pair.vote ? VOTE_LABEL[pair.vote] : "未投票"}。`;
      } else if (pair.vote) {
        el.textContent = `已记录「${VOTE_LABEL[pair.vote]}」；两侧 ${tdone(a)}/${activeDims().length}、${tdone(b)}/${activeDims().length} 维。`;
      } else {
        el.textContent = `两侧 ${tdone(a)}/${activeDims().length}、${tdone(b)}/${activeDims().length} 维；先打分，再投整体。`;
      }
      const deltas = $("#vote-deltas");
      if (deltas) {
        const parts = activeDims().map(d => {
          const av = numOf(a, d.key);
          const bv = numOf(b, d.key);
          if (av === null || bv === null) return null;
          const diff = av - bv;
          return `${d.label} ${diff > 0 ? `A+${diff}` : diff < 0 ? `B+${-diff}` : "0"}`;
        }).filter(Boolean);
        let text = parts.length === activeDims().length
          ? `分维度（Rubric 差值）：${parts.join(" · ")}`
          : "";
        if (parts.length === activeDims().length && pair.vote) {
          const g = activeDims().filter(d => numOf(a, d.key) > numOf(b, d.key)).length;
          const bb = activeDims().filter(d => numOf(a, d.key) < numOf(b, d.key)).length;
          const majority = g > bb ? "G" : bb > g ? "B" : "S";
          if (majority !== "S" && pair.vote !== majority) {
            text += " · 整体票与 Rubric 多数不一致，请在依据里说明";
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
        } else if (tdone(a) === activeDims().length && tdone(b) === activeDims().length) {
          const avgA = tavg(a);
          const avgB = tavg(b);
          const g = activeDims().filter(d => numOf(a, d.key) > numOf(b, d.key)).length;
          const bb = activeDims().filter(d => numOf(a, d.key) < numOf(b, d.key)).length;
          const majority = g > bb ? "G" : bb > g ? "B" : "S";
          const mismatch = pair.vote && majority !== "S" && pair.vote !== majority;
          concl.textContent = `本组 A（${name(pair.slots.A)}）均分 ${avgA}、B（${name(pair.slots.B)}）均分 ${avgB}，整体判 ${pair.vote ? VOTE_LABEL[pair.vote] : "未投票"}。${mismatch ? "整体票与 Rubric 多数不一致，理由见右栏。" : ""}结论只对应该组配对，不作跨案例排名。`;
        }
      }
    }

    function dimHtml(d) {
      const tip = (window.VELAB_TIPS && window.VELAB_TIPS[d.key])
        ? `<button class="q" type="button" data-tip="${d.key}" aria-label="维度说明" title="看定义与观察点">?</button>` : "";
      const col = side => `
        <div class="ab-side" data-side="${side}">
          <div class="ab-side-head">
            <span class="ab-tag">${side}</span>
            <span class="ab-ts-val" data-tsfor="${side}|${d.key}"></span>
          </div>
          <select class="dim-select dim-score" data-side="${side}" data-dim="${d.key}">
            <option value="">待检查</option>
            <option value="1">1</option>
            <option value="3">3</option>
            <option value="5">5</option>
            <option value="N/A">N/A</option>
          </select>
          <textarea class="ab-note" rows="2" data-side="${side}" data-dim="${d.key}" placeholder="${side} 的依据；低分必填"></textarea>
          <button class="ab-ts" type="button" data-side="${side}" data-dim="${d.key}">⏱ 记录时间</button>
        </div>`;
      return `<div class="dim" data-dim="${d.key}">
        <div class="dim-head"><strong>${d.label}</strong>${tip}${d.hint ? `<span class="why">${d.hint}</span>` : ""}</div>
        <div class="dim-ab">${col("A")}${col("B")}</div>
      </div>`;
    }

    function markNeedNote(pair) {
      $$("#dims .dim").forEach(dimEl => {
        const key = dimEl.dataset.dim;
        dimEl.querySelectorAll(".ab-side").forEach(sideEl => {
          const saved = pair.models[pair.slots[sideEl.dataset.side]];
          sideEl.classList.toggle("need-note", needsNote(saved, key));
        });
      });
    }

    function paintDimValues(pair) {
      activeDims().forEach(d => {
        ["A", "B"].forEach(side => {
          const saved = pair.models[pair.slots[side]];
          const e = ent(saved, d.key);
          const sel = $(`#dims .dim-score[data-side="${side}"][data-dim="${d.key}"]`);
          const ta = $(`#dims .ab-note[data-side="${side}"][data-dim="${d.key}"]`);
          const tag = $(`#dims .ab-ts-val[data-tsfor="${side}|${d.key}"]`);
          if (sel) sel.value = e && e.s !== null && e.s !== undefined ? String(e.s) : "";
          if (ta) ta.value = (e && e.note) || "";
          if (tag) tag.textContent = e && typeof e.ts === "number" ? tc(e.ts) : "";
        });
      });
      markNeedNote(pair);
    }

    function bindDims(pair) {
      const savedOf = side => pair.models[pair.slots[side]];
      $$("#dims .dim-score").forEach(sel => {
        sel.onchange = () => {
          const saved = savedOf(sel.dataset.side);
          const key = sel.dataset.dim;
          const e = saved.dims[key] || (saved.dims[key] = { s: null, note: "", ts: null });
          const v = sel.value;
          e.s = v === "" ? null : (v === "N/A" ? "N/A" : +v);
          persist();
          renderGrid();
          tderiveVotes(pair);
          persist();
          renderVote(pair);
          markNeedNote(pair);
        };
      });
      $$("#dims .ab-note").forEach(ta => {
        ta.oninput = () => {
          const saved = savedOf(ta.dataset.side);
          const key = ta.dataset.dim;
          const e = saved.dims[key] || (saved.dims[key] = { s: null, note: "", ts: null });
          e.note = ta.value;
          persist();
          markNeedNote(pair);
        };
      });
      $$("#dims .ab-ts").forEach(btn => {
        btn.onclick = () => {
          const saved = savedOf(btn.dataset.side);
          const key = btn.dataset.dim;
          const e = saved.dims[key] || (saved.dims[key] = { s: null, note: "", ts: null });
          const t = +(T.time || 0);
          e.ts = +t.toFixed(3);
          const ta = $(`#dims .ab-note[data-side="${btn.dataset.side}"][data-dim="${key}"]`);
          const stamp = `[${tc(t)}] `;
          if (ta) {
            const pos = typeof ta.selectionStart === "number" ? ta.selectionStart : ta.value.length;
            ta.value = ta.value.slice(0, pos) + stamp + ta.value.slice(pos);
            ta.selectionStart = ta.selectionEnd = pos + stamp.length;
            ta.focus();
          }
          e.note = ta ? ta.value : stamp;
          persist();
          const tag = $(`#dims .ab-ts-val[data-tsfor="${btn.dataset.side}|${key}"]`);
          if (tag) tag.textContent = tc(t);
          markNeedNote(pair);
        };
      });
      paintDimValues(pair);
    }

    function activeDims() {
      const skip = currentCase().skipDims || [];
      return T2V_DIMS.filter(d => !skip.includes(d.key));
    }

    function renderPanel() {
      const c = currentCase();
      const { pair } = getPair();
      const nameOf = slot => {
        const m = c.models.find(x => x.id === pair.slots[slot]);
        return m ? m.name : pair.slots[slot];
      };
      $("#model-title").textContent = pair.revealed ? "按片段证据评分 · 已揭盲" : "按片段证据评分";
      $("#model-sub").textContent = pair.revealed
        ? `A = ${nameOf("A")}，B = ${nameOf("B")}；两侧独立打分，投票后揭盲。`
        : "1 明显不符，3 大体满足，5 完整稳定；未检查留空，低于 3 分需理由。";
      $("#dims").innerHTML = activeDims().map(dimHtml).join("");
      $("#save-btn").textContent = "保存草稿";
      $("#case-conclusion").textContent = "";
      bindDims(pair);
      renderVote(pair);
    }

    function renderAll() {
      renderModes();
      renderPairSelects();
      renderCases();
      renderGrid();
      renderPanel();
    }

    /* 低于 3 分又没写依据：提示并标红，不拦死 */
    function missingNotes() {
      const { pair } = getPair();
      const out = [];
      ["A", "B"].forEach(side => {
        activeDims().forEach(d => {
          if (needsNote(pair.models[pair.slots[side]], d.key)) out.push(`${side}·${d.label}`);
        });
      });
      return out;
    }

    function warnMissingNotes(where) {
      const miss = missingNotes();
      if (!miss.length) return false;
      const { pair } = getPair();
      markNeedNote(pair);
      toast(`${miss.length} 处低于 3 分没写依据：${miss.slice(0, 3).join("、")}${miss.length > 3 ? " 等" : ""}（${where}仍继续）`);
      return true;
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
      const revealBtn = $("#reveal-btn");
      if (revealBtn) revealBtn.onclick = () => {
        const { pair } = getPair();
        if (!pair.vote) { toast("先投整体判断"); return; }
        const ok = activeDims().every(d => filled(pair.models[pair.slots.A], d.key) && filled(pair.models[pair.slots.B], d.key));
        if (!ok) { toast("两侧五维都打完再揭盲"); return; }
        warnMissingNotes("揭盲");
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
    $("#save-btn").addEventListener("click", () => {
      const miss = missingNotes();
      store.t2v[state.caseId] = store.t2v[state.caseId] || {};
      store.t2v[state.caseId].savedAt = new Date().toISOString();
      persist();
      if (miss.length) {
        markNeedNote(getPair().pair);
        toast(`草稿已保存；${miss.length} 处低于 3 分没写依据，已标红`);
      } else {
        toast("草稿已保存");
      }
    });
    $("#export-btn").addEventListener("click", () => dl("t2v-annotations.json", store.t2v));

    bindTransport();
    new MutationObserver(() => syncTransport()).observe($("#grid"), { childList: true });

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