# 配置自己的开发环境

使用 Node.js 24，执行 npm ci，将 .env.example 复制为 .env.local，填写自己的环境 ID、Publishable Key 和地域。
如需本地 /__auth 代理，设置 CLOUDBASE_AUTH_ORIGIN 为自己的 HTTPS 托管源站。
将 cloudbaserc.example.json 复制为 cloudbaserc.json，填写自己的环境 ID；该文件被 Git 忽略。

## CloudBase 前置条件

使用已开通 PostgreSQL / PG 存储的 CloudBase 环境，不能用 NoSQL 集合替代。
启用需要的账号密码、邮箱认证与邮件发送；配置可信域名及本地开发地址。
浏览器只使用 Publishable Key，不使用服务端密钥。

## 新数据库

确认目标环境为空，备份并核对环境 ID 后，使用项目安装的 CloudBase CLI：

    npx tcb login
    npx tcb db pg migration up -e YOUR_ENV_ID --dry-run --json
    npx tcb db pg migration up -e YOUR_ENV_ID --json

迁移按文件名前缀顺序执行：基础表、记录与照片、RPC兼容、首页内容。CloudBase 必须提供 auth/storage schema、auth.uid()、auth.role() 和相关数据库角色。
迁移创建私有 checkin-photos 与公开 site-assets 桶，保留权限策略。
基础表迁移为开源副本新增，不用于原线上已存在的数据库。本轮没有申请新云资源或执行生产迁移，首次空环境安装仍需真实验证。

## 管理员

1. 在应用注册自己的账号。
2. 从自己的 CloudBase 认证管理或受信任的 SQL 控制台核对该账号的 sub。这里需要 auth.uid() 使用的用户标识，不是 auth.users 的数字主键。
3. 复制 cloudbase/bootstrap-admin.example.sql 到自己的管理控制台，将项目和用户标识改为自己的值，核对无误后执行。
4. 登录 /#/admin，验证草稿不公开、发布后首页更新；用普通账号验证不能编辑。

不要把填写了个人标识的 SQL 文件提交进仓库。注册用户不会自动获得管理员权限。

## 本地与发布

    npm run dev
    npm test
    npm run lint:check
    npm run build
    npm run check:release

默认本机地址 http://127.0.0.1:5174/。该地址仅供当前电脑访问。
构建后按 README 部署 dist/；公开测试实例请使用演示数据，不要共享维护者生产账号。
地图生成脚本需要自行准备 Natural Earth 原始数据与 Mapshaper 处理结果；正常运行直接使用 public/maps，不必重建地图。
