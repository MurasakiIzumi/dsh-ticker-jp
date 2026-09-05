# Changelog

本项目的所有值得一提的变更都会记录在此文件。格式遵循 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)，版本号遵循 [SemVer](https://semver.org/lang/zh-CN/)。

## [0.5.0] - 2026-09-05

### Added

- **多语言界面（i18n）**：UI 文案字典化并内置 简体中文 / 繁體中文 / English / 日本語（`T` 表）。首次运行按 `navigator.language` 自动选择（zh-Hant/zh-TW/zh-HK/zh-MO → 繁中，其余 zh → 简中，ja/en 对应，其它回退英文），⚙ 面板新增原生下拉切换语言，偏好持久化（`dsh-ticker-jp:lang`）；默认标的短名随语言本地化（^N225 → 日经225 / 日經225 / Nikkei 225 / 日経225）。
- **紧凑收起态**：收起后窗口宽度不再固定 232px，收缩为内容自适应的小胶囊——标题为行情图标（📈，无文字、不受语言标题长度影响），自动隐藏 ⚙ 设置键，仅保留展开按钮；展开态布局不变。

### Changed

- **设置面板分组与间距**：列表区 / 添加行 / 提示行 / 语言行 / 配色按钮 / 底部操作之间间距拉大（margin 10–12px 分级），新增语言下拉行，为后续更多设置项预留空间。
- 窗口标题在展开态显示本地化文案（自选行情/自選行情/Watchlist/ウォッチリスト 等）。

## [0.4.0] - 2026-09-04

### Added

- **窗口位置记忆**：悬浮窗拖拽位置持久化（localStorage `dsh-ticker-jp:pos`），启动时自动恢复并 clamp 到当前视口内（至少保留部分可见），避免显示器分辨率变化后窗口落到屏幕外。
- **休市自动降频（市场时段感知轮询）**：Host 在成功条目中回传 Yahoo 交易所时区与交易所（`timezone`/`exchange`，取自 `meta.exchangeTimezoneName`/`meta.exchange`）；Client 依据自选标的所属市场的当地交易时段（仅周末 + 大致时段，忽略午休/节假日，`Intl` 自动处理夏令时）决定轮询节奏——任一市场开市时每 5s 轮询，全部休市时停止轮询、仅每 60s 检查是否临近开盘，窗口建立或自选列表变化时始终抓取一次快照；开盘后自动恢复 5s 节奏。未知时区一律保守视为开市。
- **连续超时负面缓存**：Host 侧单标的连续 2 次抓取超时后进入 5 分钟冷却（`NEGATIVE_FAIL_THRESHOLD`/`NEGATIVE_COOLDOWN_MS`），冷却期内直接跳过该标的（错误文案 `temporarily skipped (repeated timeouts)`），成功抓取后即解除。两形态各自维护进程内状态。
- **全球市场支持（文档与面板提示）**：Yahoo 数据源本就接受任意后缀代码（实测 AAPL/0700.HK/600519.SS/9984.T 均正常），README 与自选面板提示同步说明；4 位纯数字简码仅对日股自动补 `.T`，其它市场需输完整后缀。

### Changed

- **涨跌配色可配置**：⚙ 自选面板新增配色切换按钮（默认日式 红涨绿跌，可切 美式 绿涨红跌），偏好持久化（`dsh-ticker-jp:palette`），行内价格与涨跌幅颜色即时生效。
- **自选面板提示更新**：hint 由一行拆为两行，说明简码仅限日股并给出其它市场完整代码示例。

## [0.3.2] - 2026-09-04

### Fixed

- **动态形态 Host 半抓取不可用（fork 遗留严重问题）**：动态 Host 半运行在 `node:vm` 沙箱中，原生 `fetch` 被沙箱 trap 禁用且无 `AbortSignal`，此前 `host.js` 的抓取必然失败、`getQuotes` 恒返回错误。现改为经 cordis web 服务抓取：`ctx.get('web')` 软读取（免 `inject` 声明）+ `web.fetch({ url })`，并以 `ctx.timeout` 竞速实现与 bundle 相同的 5s 单标的超时（`ctx.timeout` 属 timer 动词，故插件声明 `inject: ['timer']`）。错误文案（`fetch timed out after 5s`）、错误隔离、并发抓取（上限 5 路）与顺序保持均与 bundle 形态一致。

### Changed

- **动态形态 `host.js` 与 bundle `lib/index.js` 不再逐字等价**：因沙箱禁原生 `fetch`，动态 Host 半改走 web 服务（bundle Host 保持原生 `fetch` 不动）；两者仅保证对外 RPC 契约（`getQuotes` → `{ ok, items }` / `{ ok:false, error }`）一致，文件头注释已说明差异原因。

## [0.3.1] - 2026-09-04

### Changed

- **Host 抓取并发化**：`fetchQuotes` 由逐 symbol 串行改为有界并发（上限 5 路）抓取，保留逐 symbol 5s 超时与错误隔离，返回顺序与原 watch list 一致——最坏一轮耗时由 15×5s≈75s 降至约 3×5s≈15s，正常行情下 2s 内即可完成一轮。
- **文件头注释同步**：四个代码文件头注释补充超时/防重叠说明，动态形态文件另注明其运行时注入依据（动态 client 的 `inject: ['timer']` 声明原因、动态 host 无需 `inject` 声明的依据），防止后续误判回归。

### Fixed

- **每标的请求 5s 超时**：`fetchOne` 改用 `AbortSignal.timeout(5000)`——上游（Yahoo）挂起时该标的最多等 5s 即被放弃并返回可读错误（`fetch timed out after 5s`），不再无限挂起；超时只淘汰该标的，不拖垮整批。
- **Client 轮询防重叠**：上一轮请求仍在飞行时跳过本轮 tick（in-flight 标志），慢响应不再与下一轮请求堆积。
- **错误文案统一**：整批全失败时的兜底文案在两形态间统一为 `no quotes fetched`（此前动态形态 `host.js` 为大写开头）。

## [0.3.0] - 2026-09-04

### Added

- **自选行情列表（可带显示别名）**：悬浮窗标题栏新增 ⚙ 设置入口，可在窗内直接添加/移除代码并保存（bundle 形态存于浏览器 localStorage；动态插件形态可用时同样持久化）。每个条目由代码 + 可选“显示名”组成，别名在列表行内直接编辑；添加时支持 `9984.T:软银`（可带别名）或纯代码（4 位简码 `9984` 自动补 `.T`）。显示优先级：用户别名 → 内置默认简称 → Yahoo 名 → 代码。可一键恢复默认（TOPIX ETF 1306.T 与日経225 ^N225）。
- **Host 按需抓取**：`/dsh-ticker-jp/quotes` 路由与 `getQuotes` RPC 支持接收 `syms` 列表按需抓取任意 Yahoo 代码；名称直接使用 Yahoo 返回的 longName/shortName，缺失时回退为完整代码（不再内置中文名称表）。

### Changed

- 悬浮窗编辑面板引入别名输入行，窗口宽度从 224px 微调至 232px，代码名过长时省略号截断。
- 默认标的显示名改用简短通称（仅 Client 展示层覆盖，Host/抓取仍用真实代码）：1306.T → **TOPIX ETF**（Yahoo 无实时 TOPIX 指数本体，1306.T 为其联动 ETF，故不全称）；^N225 → **日経225**。悬停名称仍可查看 Yahoo 返回的完整名。
- **编辑面板文案精简**：添加框提示压缩为「股票代码，如 9984.T」，别名与 4 位简码的完整用法统一收敛到提示行与文件头部注释，避免窄框内长句折行。
- **代码与注释整理**：四个代码文件的说明性注释全部统一到各文件头部（职责、数据源、符号/别名规则），正文中的散落注释与命名表解释移除；符号 URL 解码、列表持久化等小逻辑内聚为具名辅助函数，删除冗余的旧注释与单引号/双引号混用。
- **README 重写**：改为 dsh-ticker-jp 视角——注明继承自上游 dsh-stock-ticker 的浮窗功能与结构、新增 Yahoo 数据源与自选/别名说明；预览区启用新截图 `screenshot.png` 与自选设置截图 `screenshot2.png`；License 章节致谢原作者 FeiZhuNiU-INFJA 与上游项目。

## [0.2.0] - 2026-09-04

### Changed

- **项目改名收尾**：bundle / 插件统一由旧名 `dsh-stock-ticker` 更名为 `dsh-ticker-jp`——Host 同源路由由 `/dsh-stock-ticker/quotes` 改为 `/dsh-ticker-jp/quotes`，Client 轮询路径与 Host 侧日志前缀（`[dsh-stock-ticker]` → `[dsh-ticker-jp]`）同步更新，修复 Client 请求 404 的问题。

- **数据源**：从腾讯行情接口（`qt.gtimg.cn`）更换为 Yahoo Finance 图表 API（`query1.finance.yahoo.com/v8/finance/chart`），以支持日本股市数据。
- **指数列表**：从 A 股/港股（上证指数、创业板指、科创50、恒生科技）更换为日本主要指数（日经225、东证指数、等）。
- **解析逻辑**：适配 Yahoo 返回的 JSON 结构（提取 `meta.regularMarketPrice` 与 `meta.regularMarketChangePercent`），替换原有的 `~` 分隔纯文本解析。

### Removed

- 移除原腾讯接口所需的 `toNum` 辅助函数（Yahoo 直接返回数字类型，不再需要处理 `-0` 等字符串边界情况）。

---

## [0.1.0] - 2026-08-21

### Added

- 作为 DSH bundle 安装：`dsh.bundle.patch` 指向 `cordis.patch.yml`，可经 `dsh plugin add` 安装。
- Host 入口 `lib/index.js` 注册同源路由 `/dsh-stock-ticker/quotes`，经 `shell` + `curl` 抓取腾讯行情并返回无损 JSON。
- Client bundle `lib/client.js` 渲染悬浮行情小窗，每 5 秒轮询一次。
- 悬浮窗口可拖拽、可收起；背景跟随 DSH 主题色（80% 透明度），红涨绿跌。
- 显示四只指数：上证指数（000001）、创业板指（399006）、科创50（000688）、恒生科技（HSTECH）。

### Fixed

- 修复负零（`-0`）导致 JSON 序列化被拒的问题。
