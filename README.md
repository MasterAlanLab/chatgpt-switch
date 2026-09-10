<div align="center">
  <img src="public/icons/128.png" width="128" height="128" alt="ChatGPT Switch 图标">
  <h1>ChatGPT Switch</h1>
  <p><strong>保存 · 管理 · 快速切换</strong></p>
  <p>
    <a href="https://github.com/MasterAlanLab/chatgpt-switch/releases"><img src="https://img.shields.io/github/v/release/MasterAlanLab/chatgpt-switch?display_name=tag&amp;style=flat-square&amp;logo=github&amp;logoColor=white&amp;label=Release&amp;color=E3A72F&amp;cacheSeconds=300" alt="最新版本"></a>
    <a href="https://github.com/MasterAlanLab/chatgpt-switch/actions/workflows/release.yml"><img src="https://img.shields.io/github/actions/workflow/status/MasterAlanLab/chatgpt-switch/release.yml?style=flat-square&amp;logo=githubactions&amp;logoColor=white&amp;label=Release" alt="发布状态"></a>
    <a href="PRIVACY.md"><img src="https://img.shields.io/badge/Privacy-Local--first-17191D?style=flat-square" alt="隐私政策"></a>
  </p>
</div>

用于保存、管理和切换多个 ChatGPT 登录状态的浏览器扩展。账号数据保存在当前浏览器本机，无需反复退出登录或重新输入账号信息。

支持 Chrome、Edge 和 Firefox。从 [Releases](https://github.com/MasterAlanLab/chatgpt-switch/releases) 下载对应浏览器的压缩包。

> ChatGPT Switch 并非 OpenAI 官方产品，也不隶属于或代表 OpenAI。

## 功能特性

- 保存当前浏览器中的 ChatGPT 登录状态。
- 管理最多 50 个本地账号记录，一键完成切换。
- 支持 Session Token、Cookie JSON 和 Cookie Header。
- 自动识别并处理分片 Session Cookie。
- 支持账号备注编辑、搜索和删除。
- 可选清理指定 ChatGPT 站点的本地数据。
- 隔离普通窗口与无痕窗口的账号记录。
- 切换失败时尝试恢复原有 Cookie。

## 使用方式

1. 在浏览器中正常登录 ChatGPT。
2. 打开扩展，点击「保存当前登录」。
3. 登录其他账号并继续保存。
4. 在账号列表中选择需要使用的账号并切换。

也可以在「快捷登录」中粘贴有效的 Session Token、Cookie JSON 或 Cookie Header。

## 安装

下载并解压对应浏览器的发布包：

| 浏览器  | 发布包                                 |
| :------ | :------------------------------------- |
| Chrome  | `chatgpt-switch-<version>-chrome.zip`  |
| Edge    | `chatgpt-switch-<version>-edge.zip`    |
| Firefox | `chatgpt-switch-<version>-firefox.zip` |

在 Chrome 或 Edge 的扩展管理页开启开发者模式，选择「加载已解压的扩展程序」，然后选择解压后的目录。

## 数据与隐私

- Session Token、Cookie、账号备注和设置保存在浏览器本地。
- 普通窗口使用 `storage.local`，无痕窗口使用 `storage.session`。
- 扩展不包含遥测、用户行为分析、远程脚本或账号数据上传接口。
- Session Token 可能以明文形式保存在扩展存储中，请在可信设备上使用。
- 外部链接仅在用户主动点击时打开，不附加 Session 或账号资料。

详细说明见 [隐私政策](PRIVACY.md)。

## 权限

| 权限             | 用途                                 |
| :--------------- | :----------------------------------- |
| `storage`        | 保存本地账号记录和设置               |
| `cookies`        | 读取、替换和清除 ChatGPT 登录 Cookie |
| `activeTab`      | 识别当前标签页与窗口上下文           |
| `browsingData`   | 按用户选择清理指定 ChatGPT 站点数据  |
| ChatGPT 域名权限 | 限定 Cookie 操作和站点识别范围       |

扩展不申请全站访问、剪贴板读取或网页脚本注入权限。

## 构建

项目使用 WXT、React、TypeScript 和 Bun。开发环境要求 Bun 1.3.14，Node.js 22 为兼容性基线。

```bash
git clone https://github.com/MasterAlanLab/chatgpt-switch.git
cd chatgpt-switch
bun install

bun run dev
bun run build
bun run release:build
```

`bun run release:build` 会在 `.output/` 中生成 Chrome、Edge、Firefox 发布包及 Firefox 源码包。

## 测试

```bash
bun run typecheck
bun run test

bunx playwright install chromium
bun run test:e2e
```

端到端测试使用独立的临时 Chromium 配置文件和本地测试页面。

## 资源推荐

以下为推广链接。服务内容与价格以对应网站为准。

| 类别    | 服务                                   | 说明                   |
| :------ | :------------------------------------- | :--------------------- |
| AI 服务 | [AI 订阅服务](https://ai.corouter.cc/) | ChatGPT 等 AI 产品订阅 |
