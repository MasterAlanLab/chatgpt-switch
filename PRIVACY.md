# ChatGPT Switch 隐私政策

最后更新：2026-09-10

ChatGPT Switch 是一个用于在本机保存、管理和切换 ChatGPT 登录态的浏览器扩展。本扩展并非 OpenAI 官方产品。

## 1. 本扩展处理的数据

为提供“保存当前登录态、导入 Session、切换账号、清除当前登录态”等功能，本扩展可能在用户设备本地处理：

- ChatGPT Session Token / 身份验证 Cookie；
- 用户主动输入或导入的账号名称、备注和电子邮箱；
- 与扩展功能相关的本地设置；
- 当前标签页的基本上下文，仅用于识别当前窗口、Cookie 存储区以及当前页面是否属于 ChatGPT。

本扩展不会读取聊天内容，不会收集浏览历史，也不会注入网页内容脚本。

## 2. 数据用途

上述数据仅用于提供扩展的核心功能，包括：

- 保存和识别本地账号记录；
- 在用户主动操作时读取、替换或清除 ChatGPT 登录 Cookie；
- 在启用相应选项后，清理指定 ChatGPT 站点的本地存储数据；
- 在普通窗口和无痕窗口之间隔离账号数据。

## 3. 数据存储

普通窗口中的账号记录和设置存储于浏览器扩展的 `storage.local`。

无痕窗口中的账号记录存储于 `storage.session`，用于与普通窗口隔离。

Session Token / 身份验证 Cookie 可能以明文形式保存在扩展本地存储中。本扩展不是加密密码保险库。能够访问用户设备或浏览器配置文件的人，可能有机会读取这些本地数据。

## 4. 数据传输与共享

本扩展不将 Session Token、身份验证 Cookie、账号备注、电子邮箱或本地设置上传到开发者服务器或第三方服务器。

本扩展不包含遥测、分析、远程脚本或账号数据上传接口，也不会出售、出租或用于个性化广告。

扩展界面可能包含一个外部推广链接。只有在用户主动点击时才会在新标签页打开该网站；该链接不会附带 Session、账号信息或其他身份验证数据。

## 5. 权限用途

- `storage`：在本地保存账号记录和扩展设置。
- `cookies`：读取、设置和清除 ChatGPT 的身份验证 Cookie，以实现保存和切换登录态。
- `activeTab`：在用户主动打开扩展时识别当前标签页和窗口上下文。
- `browsingData`：仅在用户启用“清理站点数据”选项时，清理指定 ChatGPT 来源的 Local Storage、IndexedDB、Cache Storage 和 Service Worker 数据。
- ChatGPT 域名权限：将 Cookie 操作和站点识别范围限制在 `chatgpt.com`、其子域名以及 `chat.openai.com`。

## 6. 数据删除

用户可以在扩展界面中删除已保存的账号记录，也可以单独清除当前浏览器环境中的 ChatGPT 登录 Cookie。

移除浏览器扩展时，浏览器通常也会删除该扩展对应的本地存储数据；具体行为以浏览器实现为准。

## 7. 数据保留

普通窗口中保存的账号记录会一直保留，直到用户主动删除记录或移除扩展。

无痕窗口的数据使用会话级存储，并由浏览器按照其无痕和会话存储规则管理。

## 8. Chrome Web Store Limited Use

ChatGPT Switch 对用户数据的使用仅限于提供本扩展明确披露的单一用途和面向用户的功能。

The use of user data by ChatGPT Switch complies with the Chrome Web Store User Data Policy, including the Limited Use requirements.

## 9. 第三方服务

ChatGPT 是 OpenAI 提供的第三方服务。用户通过 ChatGPT 网站产生的网络通信和数据处理受该服务自身的条款与隐私政策约束。

本扩展并非 OpenAI 官方产品，也不代表 OpenAI。

## 10. 联系方式

如有隐私、权限或功能相关问题，请通过本项目的 GitHub Issues 联系开发者。
