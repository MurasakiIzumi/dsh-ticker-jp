# Changelog

格式遵循 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)，版本号遵循 [SemVer](https://semver.org/lang/zh-CN/)。

## [1.0.4] - 2026-09-26

### Changed

- `peerDependencies` 中的 `@deepseek-ai/dsh-client-ui-slots` 由 `^0.1.0-rc.7` 改为显式区间 `>=0.1.0-rc.7 <0.2.0`。原写法能在 0.1.7-rc.2 上通过，靠的是 DSH 自身的非标准判定（`dsh-app-boot/lib/index.js` 用 `semver.satisfies(..., { includePrerelease: true })`）；按标准 semver 语义 `^0.1.0-rc.7` 并不包含 `0.1.7-rc.2`，会在 pnpm/npm 侧产生 unmet peer 噪音，dshmarket 的自研解析器还会把 `^0.1.x` 的上界取成 `0.1.1-0` 并给出 aboveMax 软警告。新写法同时表达「0.1.x 全线」的意图，与 `dsh-alive` 的 `>=0.1.0-rc.6 <0.2.0` 一致。
- 补充 `engines.dsh = ">=0.1.0-rc.7 <0.2.0"`。DSH 自身的兼容性检查只读 peer 声明（不用 `engines.dsh`），该字段供 dshmarket 等读取方展示「宿主要求」。
- 补充 `dsh.manifestVersion: 1`。
- 三版 README 新增「环境要求 / Requirements / 動作環境」小节，声明支持的 DSH 与 Node.js 版本。

### Removed

- `peerDependencies` 中的 `@deepseek-ai/dsh-shell`：fork 残留的冗余声明，四个代码文件（`lib/index.js`、`lib/client.js`、`host.js`、`client.js`）中均无任何 import。

### Verified

- 在 DSH **0.1.7-rc.2** 下实测核查通过：`dsh --dump-config --profile web` 退出码 0，组合中包含 `- id: ticker-jp / name: dsh-ticker-jp`，无 deny / incompatible / skipped 记录。
- 0.1.7 的三项破坏性变更本插件均未触碰：session format v4 的 `source.kind` 限制、settings 服务移除 `register()`、typert strict codec 要求 `create()` 工厂。
- 运行时契约逐项比对一致：`ctx.webServer.register({ kind, path, handler })`（`exact` / `prefix`）、`shell.overlay` seat 与 `ctx.slots.inject/register({ name, id }, factory)`、客户端 `window.__ModuleLoader__.load({ id, factory })` 加载协议、`dsh.client` 的 `platform` / `inject` / `immediately` 字段、bundle patch 的 `insert` 方言。
- 本次为纯元数据与文档改动：四个代码文件未改动，对外行为与 RPC 契约完全不变。

## [1.0.3] - 2026-09-07

### Changed

- README 布局调整：英文版升为主文档（`README.md`），原中文版移至 `README.zh-CN.md` 并新增日文版 `README.ja.md`，三版顶部互相链接；删除原 `README.en.md`。
- 介绍文案改为「全球股市」定位：中英文版明确支持全球市场（日股 `.T`、美股、港股 `.HK`、A 股 `.SS/.SZ` 等 Yahoo 全代码）；日文版以日股为主、同时强调支持全球市场。
- package.json `description` 改为纯英文：`Global stock ticker plugin for deepseek-harness. Supports worldwide markets (Yahoo Finance) & 16 languages.`；`keywords` 扩展为全球市场 + 日股混合词（新增 stock-ticker / finance / yahoo-finance / global-markets / topix / us-stocks / hong-kong-stocks / watchlist）。
- 以上均为文档与发布元数据更新，对外行为不变。

## [1.0.2] - 2026-09-06

### Added

- 收起/展开状态持久化：切换时写入 localStorage（`dsh-ticker-jp:collapsed`），刷新页面或重启 DSH 后恢复上次状态；首次安装无记录时默认展开。

## [1.0.1] - 2026-09-05

### Changed

- 两版 README 安装节补充 npm 安装方式：`dsh plugin --profile web add dsh-ticker-jp`（npm 预构建安装，免构建授权；GitHub 源码方式保留）。
- 两版 README 顶部徽章更新：新增 awesome-dsh-plugin 收录徽章与 npm 版本/下载量徽章（版本徽章动态显示 npm latest）。
- 以上均为纯文档更新，对外行为不变。

## [1.0.0] - 2026-09-05

### Changed

- 错误文案与 URL 模板从正文抽出，集中到 Host 两文件头部的常量区；Client 侧数据缺省占位符统一为 `DASH`。纯文本组织调整，对外行为不变。
- README 精简重写，新增英文版 `README.en.md`，两版顶部可互相切换。
- 发布前对四个代码文件做了多轮 review，并以动态插件形态在真实环境（`cordis_run`）完成功能回归测试。

## [0.5.3] - 2026-09-05

### Added

- 界面语言扩到 16 种：新增法语、德语、西班牙语、意大利语、葡萄牙语、俄语、韩语、泰语、越南语、印尼语、土耳其语、阿拉伯语；浏览器语言自动匹配规则同步扩展。

### Fixed

- 语言下拉在深色外观下展开列表白底灰字难辨认，选项改为强制白底深色文字。

## [0.5.2] - 2026-09-05

### Fixed

- 整批行情获取失败时不再被旧数据掩盖错误，下一轮成功自动恢复；休市降频的保留数据行为不受影响。
- 涨跌幅落在 -0.005 到 0 之间不再显示为 -0.00%。

### Changed

- 两个 Client 文件补齐存储守卫与时间默认值，恢复镜像一致。
- 收起态状态灯的开市判断改为显式依赖，顺带清理未使用的计数变量。
- README 结构树补全 d.ts 等条目；包描述改为 TOPIX ETF。

## [0.5.1] - 2026-09-05

### Added

- 收起态胶囊加市场状态灯：任一自选市场开市显示绿点，全部休市显示红点，休市期间每分钟自动刷新。

### Changed

- 头部按钮统一为 18×18 方形并居中；收起符号改为数学减号，收起/展开切换时按钮位置不动。

## [0.5.0] - 2026-09-05

### Added

- 界面文案字典化，内置简体中文、繁體中文、English、日本語；按浏览器语言自动选择，面板可切换并保存。
- 收起态改为右缘锚定的小胶囊，标题只剩柱状图标；展开态布局不变。

### Changed

- 设置面板分组间距加大，编辑态宽度加到 300px。

## [0.4.0] - 2026-09-04

### Added

- 悬浮窗拖拽位置持久化，重启后自动恢复并限制在视口内。
- 休市自动降频：Host 回传交易所时区，客户端按各市场当地时段调整轮询，全部休市时改为每分钟检查。
- 单标的连续两次抓取超时进入 5 分钟冷却，期间直接跳过。
- 支持任意 Yahoo 后缀代码；4 位纯数字简码只对日股自动补 `.T`。

### Changed

- 面板可切换涨跌配色（日式红涨绿跌 / 美式绿涨红跌），偏好保存。

## [0.3.2] - 2026-09-04

### Fixed

- 动态形态 Host 在沙箱中无法用原生 fetch，改为经 cordis web 服务抓取，5 秒超时用 `ctx.timeout` 竞速实现，行为与 bundle 一致。

### Changed

- 动态 `host.js` 与 bundle `lib/index.js` 不再逐字相同，只保证 RPC 契约一致。

## [0.3.1] - 2026-09-04

### Changed

- Host 抓取由串行改为有界并发（最多 5 路）；文件头注释补充超时与防重叠说明。

### Fixed

- 单标的请求加 5 秒超时，超时只淘汰该标的。
- Client 轮询加防重叠，慢响应不会堆积。
- 整批失败文案统一为 `no quotes fetched`。

## [0.3.0] - 2026-09-04

### Added

- 自选行情列表：⚙ 面板添加/移除任意 Yahoo 代码，每项可带显示名；4 位简码自动补 `.T`；一键恢复默认（TOPIX ETF + 日経225）。
- Host 路由支持按需抓取指定的 syms。

### Changed

- 默认标的改用简短通称：`1306.T` → TOPIX ETF，`^N225` → 日経225。
- 注释集中到文件头；README 重写为 dsh-ticker-jp 视角。

## [0.2.0] - 2026-09-04

### Changed

- 插件统一改名 `dsh-ticker-jp`：路由、日志前缀同步更新，修复改名后 Client 404。
- 数据源从腾讯行情换成 Yahoo Finance chart API，默认行情改为日本市场，适配 Yahoo 返回结构；移除腾讯接口专用的 `toNum` 处理。

## [0.1.0] - 2026-08-21

### Added

- 作为 DSH bundle 安装：Host 注册 `/dsh-stock-ticker/quotes` 路由，Client 渲染悬浮行情小窗，每 5 秒轮询。
- 浮窗可拖拽、可收起，跟随 DSH 主题色；显示四只 A 股/港股指数。

### Fixed

- 修复负零导致 JSON 序列化被拒的问题。
