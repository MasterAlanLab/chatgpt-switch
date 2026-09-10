# ChatGPT Switch

基于 **WXT 0.21.4 + React 19 + TypeScript** 的 Manifest V3 浏览器扩展。在本机保存、管理和切换 ChatGPT 登录态。使用中文界面，适配 Chrome / Edge 等 Chromium 浏览器（Chrome 116+）。

WXT 版本于 2026-09-09 通过包注册表的 `latest` 标签和 [WXT 官方文档](https://wxt.dev/guide/installation.html) 核实，已精确锁定在 `package.json` 与 `bun.lock`。

## 功能

- 底部推广入口：[AI 订阅代付 · ai.corouter.cc](https://ai.corouter.cc/)，点击后在新标签页打开。

- 多账号保存、搜索、备注编辑、移除和一键切换，最多 50 条记录。
- 保存当前浏览器环境中的 ChatGPT 登录 Cookie；重复保存同一 Token 会更新原记录，保留已有备注。
- 快捷登录：粘贴 Session Token、带 `sessionToken` 的 JSON、Cookie 数组 / 对象或 Cookie Header。
- 正确拼接 `.0`、`.1` 等分片，长 Token 按 3800 字符分块写入。
- 切换前等待旧 Session Cookie 全部清除；写入后回读校验，失败时尝试恢复旧 Cookie。
- 可选清理 ChatGPT 站点存储，以及切换后打开 ChatGPT 首页。
- 普通 / 无痕 Cookie 存储区严格隔离；无痕账号列表使用浏览器内存存储。
- **无支付链接生成、提取、复制、套餐选择或订阅变更功能。** 代付网站入口仅为外部链接，不参与 Session 或 Cookie 操作。

## 开发与构建

要求安装 Bun 1.3.14 或更高版本；项目仍以 Node.js 22 作为兼容性基线。

```sh
bun install
bun run dev        # WXT 开发模式
bun run check      # TypeScript + 单元测试 + 生产构建
bun run zip        # 生成 Chrome 可分发 ZIP
bun run release:build # 生成 Chrome、Edge、Firefox 可分发 ZIP
```

Chrome / Edge 扩展管理页开启「开发者模式」，点击「加载已解压的扩展程序」，选择项目构建产物目录 `.output/chrome-mv3`。

多浏览器构建会在 `.output/` 下生成带当前版本号的 `chrome.zip`、`edge.zip`、`firefox.zip`，以及 Firefox 商店提交所需的 `sources.zip`。安装时先解压，再加载其中的扩展目录。修改代码后重新构建，并在浏览器扩展管理页重新加载。

推送与 `package.json` 版本一致的 `v*` tag（例如 `v1.0.5`）后，GitHub Actions 会运行类型检查与单元测试、构建以上压缩包，并自动创建 GitHub Release。若发布任务重跑，会覆盖同名 Release 附件。

端到端测试使用全新的临时 Chromium 配置文件，并拦截网站请求为本地测试页面，不读取或修改日常浏览器的账号：

```sh
bunx playwright install chromium
bun run test:e2e    # 标签页功能测试 + 真实工具栏弹窗测试
bun run test:native # 仅运行真实工具栏弹窗回归
```

真实工具栏测试启动有界面的临时 Chromium，通过 `chrome.action.openPopup()` 打开原生弹窗，再用 CDP 检查尺寸和操作。需要桌面环境（Linux CI 可配合 Xvfb）；测试不预设弹窗 viewport。冷启动、关闭重开、推广入口、编辑和删除对话框均有覆盖。

截图输出到 `artifacts/screenshots`。格式化命令：`bun run format` / `bun run format:check`。

## 使用方式

### 保存当前登录

1. 在浏览器中正常登录自己的 ChatGPT 账号。
2. 打开扩展，点击「保存当前登录」。
3. 在账号右侧菜单中编辑备注；添加其他账号后可点击箭头切换。

扩展只读取登录 Cookie，不主动调用账号信息接口。备注和邮箱来自手动填写或导入的 JSON；仅捕获 Cookie 时使用默认备注。

### 粘贴 Session

在「快捷登录」页粘贴完整 Token，或在「添加账号」中粘贴后保存。输入默认遮盖；点击眼睛图标可显示。

```json
{
  "sessionToken": "YOUR_COMPLETE_SESSION_COOKIE_VALUE",
  "user": { "name": "个人账号", "email": "you@example.com" }
}
```

也支持标准 Cookie 导出数据：

```json
[
  { "name": "__Secure-next-auth.session-token.0", "value": "FIRST_CHUNK" },
  { "name": "__Secure-next-auth.session-token.1", "value": "SECOND_CHUNK" }
]
```

以上仅是结构示例，实际需要完整有效的 Session。获取方式：直接打开 [`https://chatgpt.com/api/auth/session`](https://chatgpt.com/api/auth/session)，按 Ctrl+A 全选、Ctrl+C 复制，返回扩展粘贴。macOS 使用 ⌘A / ⌘C；不需要打开开发者工具。

`/api/auth/session` 返回的 JSON 通常包含 `accessToken`，扩展会读取该字段；也支持直接粘贴完整 Cookie JSON。不要把 Session 分享给他人。

## 数据与行为说明

- 推广网站仅在主动点击时打开；链接不附带 Session、账号信息、查询参数或来源信息，不增加站点权限或后台请求。

- 普通账号的 Session **以明文保存在扩展的 `storage.local`**，不是加密保险库；拥有设备或浏览器配置文件访问权的人可能读取这些数据。
- 不使用 `storage.sync`，没有第三方服务、遥测、远程脚本或账号上传接口。
- 粘贴内容默认只存在于弹窗内存；仅点击保存，或勾选「同时保存到本地账号列表」后才保留 Token。
- 无痕窗口使用独立临时账号列表，存于 `storage.session`，浏览器会话结束时清除。关闭单个无痕窗口不保证立即清空该区域。启用无痕使用需在扩展详情页打开「在无痕模式下启用」。
- 同一 Cookie 存储区内的 ChatGPT 标签页共享登录态。本扩展用于切换，不实现同一环境内多账号同时在线。
- 界面的「当前」表示 Cookie 与本地记录匹配，**不是服务端已验证登录成功**。Session 过期、撤销或网站身份机制变更时，需要重新登录并保存新 Session。
- 点击切换只在本地写入 Cookie，不访问服务端做登录有效性校验。无已知有效期的数据写为浏览器会话 Cookie；有 `expires` 的导入会使用该期限。网站后续可刷新或撤销它。
- 默认保留站点数据。开启「同时清理站点数据」会清理明确列出的 ChatGPT 源的 Local Storage、IndexedDB、Cache Storage、Service Worker，包括本地草稿；不清除云端对话、浏览历史或全局 HTTP 缓存。
- 无痕环境跳过 `browsingData` 清理，避免误清普通环境；Cookie 仍按对应 `storeId` 操作。
- 「移除账号」只删除保存的记录；「清除当前登录 Cookie」影响当前环境的网页登录 Cookie，两者相互独立。
- 长流程在后台运行，关闭弹窗后通常仍会继续；浏览器退出或强制终止后台可能中断流程。写入失败会尝试恢复 Cookie；站点缓存清理是独立操作，不属于 Cookie 回滚范围。

## 权限范围

| 权限                                            | 用途                                    |
| ----------------------------------------------- | --------------------------------------- |
| `storage`                                       | 本地账号与设置                          |
| `cookies`                                       | 读取、替换当前环境的 Session Cookie     |
| `activeTab`                                     | 识别点击扩展时的当前标签页与窗口        |
| `browsingData`                                  | 用户开启选项后清理指定 ChatGPT 站点存储 |
| ChatGPT 主域、子域及 `chat.openai.com` 站点权限 | 限定 Cookie 操作与标签页识别范围        |

没有全站访问、内容脚本、脚本注入、剪贴板读取权限。后台只接收本扩展弹窗的消息，扩展存储限定为受信任扩展上下文。

## 项目结构

```text
entrypoints/background.ts   # MV3 后台消息入口
entrypoints/popup/          # React 弹窗
lib/session.ts             # Session 解析、校验与分片
lib/cookies.ts             # Cookie 替换、回读与回滚
lib/service.ts             # 串行命令、账号存储与窗口隔离
lib/commands.ts            # 消息参数校验
lib/types.ts               # 共享类型
assets/base.css            # 界面样式
public/icons/              # 自绘图标
tests/                     # 单元测试与真实 MV3 E2E 测试
```

## 1.0.4 更新

- 移除 AI 订阅代付卡片上的「推广」标识，链接、打开方式和隐私行为保持不变。

## 1.0.3 更新

- 修复工具栏弹窗只显示一条白色区域的问题。
- 移除操作记录功能，不再展示或写入操作日志。
- 获取 Session 改为打开 `/api/auth/session` 后使用 Ctrl+A / Ctrl+C 复制完整 JSON；解析其中显式的 `accessToken` 字段。Chrome 按文档内容计算扩展弹窗尺寸，初始 viewport 高度为 25px；旧版根容器的 `max-height: 100dvh` 使文档高度依赖尚未确定的 viewport，最终卡在 25px。
- `html`、`body`、`#root` 及主容器改用明确的 420 × 600 CSS 像素尺寸，主内容内部滚动；移除影响根尺寸的 viewport 单位和普通网页预览媒体查询。菜单 / 对话框的视口边界限制保留。
- 新增原生工具栏弹窗回归测试，区别于在普通标签页中打开 `popup.html` 的测试。
- 保留 1.0.1 的推广入口、浮层菜单和所有本地账号数据格式。**更新时覆盖原加载目录并在扩展管理页点击「重新加载」，无需移除扩展或清空账号。**

## 1.0.2 更新

- 增加固定底部 AI 代付推广卡片，主内容单独滚动，卡片不覆盖账号操作。
- 修复账号菜单被列表滚动区域裁切的问题：使用 body Portal + 视口定位，底部空间不足时向上展开。
- 编辑和删除对话框使用独立 Portal 与原生 dialog 顶层，支持内部滚动。
- 菜单支持方向键、Home / End、Escape 及焦点恢复；滚动列表时自动收起。

## 与参考插件的关系

参考项目中 `chatgpt-onekey-login-unpacked` 的 Session Cookie 名称、分片思路和基本登录操作，重新实现为 WXT + TypeScript。原目录、ZIP、CRX 均原样保留，不作为新版构建入口。新版没有复制原插件的商店更新地址、国际化冗余数据、支付、续费、第三方推广代码或图标。

站点 Cookie 名称沿用参考插件的约定，它不是稳定的官方登录 API；未来网站变更时，需要更新对应适配逻辑。本项目并非 OpenAI 官方扩展。

参考：[WXT 入口约定](https://wxt.dev/guide/essentials/entrypoints.html)、[Chrome Cookies API](https://developer.chrome.com/docs/extensions/reference/api/cookies)、[Chrome browsingData API](https://developer.chrome.com/docs/extensions/reference/api/browsingData)。
