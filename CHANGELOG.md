# Changelog

本项目的所有值得一提的变更都会记录在此文件。格式遵循 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)，版本号遵循 [SemVer](https://semver.org/lang/zh-CN/)。

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
