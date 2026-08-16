# Web 验收记录

## 自动验证

- TypeScript 严格类型检查通过。
- 38 个单元、契约和集成测试通过：中性默认工作区、非 AI 问题的通用实验分析、本地时区日期与进度、本地任务分析、旧任务与恢复字段迁移、任务日期分组与优先排序、状态/日期修改快照及旧版本恢复、相关资料最小外发、证据范围与敏感信息过滤、带 `[K#]` 引用汇报、分段检索、两阶段语义召回与缓存、引用校验、Responses/Chat Completions/Embeddings 请求契约、真实本机网关代理、密钥端点绑定、DOCX 解压预检、内容指纹、审计导出/验证、项目与任务失效关联修复、加密备份和 IndexedDB 持久化。
- Vite 生产构建通过。
- `pnpm run health` 通过：Node 版本、依赖、生产构建、运行目录和 4173 端口均满足启动条件。
- PWA manifest、Service Worker 和离线预缓存生成成功。
- Edge 无头浏览器烟雾测试通过：
  - 桌面任务工作台可见，原始输入、澄清、行动、依据与输出节点完整呈现。
  - 设置页的可选工作背景、数据与 AI 使用边界、模型双协议、检索模式、向量模型、诊断和审计入口可见。
  - 工作区健康检查、审计文件验证入口可见。
  - 输出与复盘页的起止日期在卡片内无横向溢出。
  - 本地周起止日期在 Asia/Shanghai 凌晨场景不经 UTC 偏移，周日正确显示为结束日。
  - 本地汇报生成后工作记录引用校验通过。
  - 可创建任务并进入任务流。
  - IndexedDB 独立任务表包含新任务。
  - 刷新后重新进入任务流仍可见。
  - 完成任务需要确认；重新打开后状态回到未完成，IndexedDB 中的 `completedAt` 同步清空。
  - “今天”按期限分组，任务可从今日视图直接推进和改期。
  - 任务删除先进入回收站，关联保持不变，点击恢复后回到任务总表。
  - 通用实验入口明确不预设必须使用 AI、自动化或开发软件；普通阅读整理问题可生成基线、假设和验证计划。
  - 加密备份使用遮罩密码输入框，不再调用浏览器原始 `prompt`。
  - 第二个标签页自动进入只读同步状态，避免两份内存状态互相覆盖。
  - 地址更新到 `#/knowledge`，刷新后仍回到证据库。
  - 本地证据回答的 `[E1]` 引用校验通过。
  - 全局搜索选择结果后进入 `#/knowledge/<id>`，并打开准确资料而非只进入模块。
  - 390 × 844 移动端任务工作台、横向任务目录和底部导航可见。
  - Service Worker 就绪后切换离线并刷新，当前模块仍可打开。
  - 误双击项目根目录 `index.html` 时会自动转到 `http://127.0.0.1:4173/`，不再显示空白页。
  - 无页面异常和 console error。
  - axe-core WCAG 2 A/AA/2.1 AA 自动审计无 serious/critical 问题。

## 安全与运行验证

- `pnpm audit --prod`：0 个已知漏洞。曾发现旧 Excel 解析依赖有 2 个 high 漏洞，已移除并替换为 `read-excel-file`；因此不再接受老式 `.xls`，继续支持 `.xlsx` 和 CSV。
- 生产响应包含 CSP、`X-Frame-Options: DENY`、`Cross-Origin-Resource-Policy: same-origin`、`nosniff` 和最小权限 `Permissions-Policy`。
- 伪造跨站 API 请求、编码目录越界请求、错误关闭凭证均实测返回 403。
- `停止 EnableOS.cmd` 使用随机本机凭证请求服务优雅关闭；实测端口释放后可重新启动。
- 服务只绑定 `127.0.0.1`，API 密钥只在网关进程内存或环境变量中。
- 新电脑首次安装脚本会优先使用 pnpm，其次使用 Corepack 或临时 npx，不进行全局包管理器安装；GitHub Actions 会在每次推送后从锁文件重新安装并验证。
- 设置页记录成功加密备份时间，并明确提示 Git 只迁移代码、浏览器 IndexedDB 数据必须通过备份迁移。

## 视觉结果

- `enableos-web-preview.png`：桌面任务工作台。
- `enableos-settings.png`：数据边界与可选模型网关设置。
- `enableos-report-center.png`：日期布局修复后的输出与复盘页。
- `enableos-task-flow.png`：创建任务后的任务流。
- `enableos-task-editor.png`：完整任务编辑器。
- `enableos-experiments.png`：不强制 AI 的实验与决策记录。
- `enableos-today.png`：按期限组织的今日工作面。
- `enableos-trash.png`：可恢复的统一回收站。
- `enableos-web-mobile.png`：移动端任务工作台。

浏览器验收脚本位于 `scripts/browser-smoke.mjs`。
