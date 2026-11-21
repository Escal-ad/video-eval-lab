# 评估工作台 — 标注与评测集成站（演示骨架）

在线地址：https://escal-ad.github.io/video-eval-lab/

静态演示站：三栏工作台（任务队列 / 工作区 / 评分栏），四个模块共用同一套外壳。

## 页面

| 文件 | 模块 | 状态 |
|---|---|---|
| `index.html` | 视频 Caption 标注（六维选项 + 分段 + 证据时间戳，作为站点入口） | 可演示（3 个待导入任务 + 本地导入） |
| `t2v.html` | T2V 评测（2 case × 4 模型，盲评） | 可演示（视频为占位） |
| `world.html` | 世界模型评测（2 场景 × 3 模型 + 同位姿对照） | 可演示（回放为占位） |
| `rag.html` | 法律 RAG 设计稿（清洗流水线 + Dify 预留） | 预留，不伪造指标 |
| `method.html` | 方法（三层结构 + GSB 对比 + 评分锚点） | 可演示 |
| `data.html` | 数据说明（Caption / T2V / 世界模型三套 schema + 样例 + 目录） | 可演示（世界模型素材待接） |
| `badcase.html` | BadCase 归因（三条评测线各 3 条演示条目 + 记录模板） | 可演示（演示条目） |

## 本地查看

直接双击 `index.html` 即可；或起一个静态服务器：

```powershell
python -m http.server 8765 --bind 127.0.0.1
```

然后打开 `http://127.0.0.1:8765/`。

## 交互

- Caption：切任务、导入本地视频、点时间轴定位、点分段改 caption、六维选项标注、取当前时间戳、保存/提交、导出 JSON
- T2V：默认 A/B 盲测（模型随机绑定，卡片固定 A 左 B 右、各自 Rubric、整体 G/S/B、投票后揭盲），可切「单模型 Rubric」逐模型打分
- 世界模型：同 T2V 的 A/B 盲测，另填延迟/有效时长、同位姿对照占位
- 方法页：GSB 对比（怎么比 + 和 Rubric 的分工）、Rubric 三套 1/3/5 锚点；分维度票由两侧 Rubric 差值生成
- BadCase 归因：三条评测线各 3 条演示条目，按“现象 → 机制 → 复现条件”记录
- 数据存在浏览器 `localStorage`，右上角“导出”可下载全部 JSON；A/B 配对记录含 `slots`、`position`、`votes` 与 `revealed`

## 还是占位的东西

- Caption 内置任务改为 3 个待导入素材位，支持“导入本地视频”；T2V / 世界模型的卡片仍是占位
- `world.html` 的同位姿对照是示意框，不是真实帧
- `rag.html` 的 Dify 区域是占位，指标写“待接入”
- 复核/仲裁页还没做，目前只在方法页描述流程
- 世界模型评测集在 `world-eval-set.md` / `world-eval-set.json`，供去 Genie 4 / Hy-Nomas / HappyOyster 实跑；摘要、动作时间轴、录制规范都在里面（页面下载按钮已移除，文件保留）
- 素材由用户提供：Caption 直接点“导入本地视频”；T2V / 世界模型把文件发过来或放进 `assets/`，按 `data/<module>/<case-id>/<model-id>.mp4` 命名

## 下一步

1. 放入 T2V / 世界模型的真实录屏，替换占位块
2. 增加 `review.html`：双人标注并排、差异高亮、仲裁
3. 接 Dify 分享链接或截图
4. 已部署 GitHub Pages：https://escal-ad.github.io/video-eval-lab/

## 数据文件

同目录的 `models.json`、`cases.json` 是模型与案例的数据源，页面里的演示数据目前内联在 `assets/app.js`，后续可改成 fetch 这两个文件。
