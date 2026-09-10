# ChatGPT Switch

**ChatGPT Switch** 是一款用于管理多个 ChatGPT 登录状态的浏览器扩展。

你可以将当前浏览器中的 ChatGPT 登录状态保存到本机，并在多个账号之间快速切换，无需反复退出登录或重新输入账号信息。

## 主要功能

- 保存当前 ChatGPT 登录状态
- 管理最多 50 个本地账号记录
- 一键切换已保存的账号
- 支持直接粘贴 Session Token 登录
- 支持导入 Cookie JSON、Cookie Header 等格式
- 自动处理分片 Session Cookie
- 支持修改账号备注和删除本地记录
- 可选在切换账号时清理指定 ChatGPT 站点数据
- 支持普通窗口与无痕窗口数据隔离

## 使用方法

1. 在浏览器中正常登录 ChatGPT。
2. 打开 ChatGPT Switch，点击“保存当前登录”。
3. 登录其他 ChatGPT 账号并继续保存。
4. 以后打开扩展即可在保存的账号之间快速切换。

也可以在“快捷登录”中粘贴有效的 Session Token 或 Cookie JSON，无需先在当前浏览器中登录对应账号。

## 隐私说明

ChatGPT Switch 的账号数据保存在当前浏览器本机。扩展不会把 Session Token、Cookie、账号备注或电子邮箱上传到开发者服务器，也不包含遥测或用户行为分析。

请注意，普通窗口中保存的 Session Token 会存储在浏览器扩展的本地存储中，本扩展不是加密密码保险库。请仅在你信任的个人设备上使用。

扩展只申请实现账号切换所需的权限，并将网站访问范围限制在 ChatGPT 相关域名。

扩展底部可能包含一个外部服务入口。只有用户主动点击时才会打开相应网站，不会向该链接附加 Session、账号资料或其他身份验证信息。

ChatGPT Switch 并非 OpenAI 官方产品，也不隶属于或代表 OpenAI。

隐私政策：https://github.com/MasterAlanLab/chatgpt-switch/blob/main/PRIVACY.md
