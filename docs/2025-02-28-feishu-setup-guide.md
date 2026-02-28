# 飞书渠道设置指南

## 快速开始

### 1. 创建飞书应用

1. 访问 [飞书开放平台](https://open.feishu.cn)
2. 点击「创建应用」→ 「企业自建应用」
3. 填写应用名称（如 "NanoClaw Assistant"）
4. 在「凭证与基础信息」页面获取 **App ID** 和 **App Secret**

### 2. 配置机器人

1. 进入「机器人」标签页
2. 开启「机器人能力」
3. 进入「事件订阅」标签页
4. 选择「SDK 长连接模式」（不要选 Webhook）
5. 添加事件：`im.message.receive_v1`（接收消息 v2.0）

### 3. 发布应用

1. 进入「版本管理与发布」
2. 点击「创建版本」
3. 填写版本信息，提交审批
4. 发布应用（企业内可见）

### 4. 配置 NanoClaw

在 `.env` 文件中添加：

```bash
FEISHU_APP_ID=cli_xxxxxxxxxxxx
FEISHU_APP_SECRET=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

如果需要禁用 WhatsApp（仅使用飞书）：

```bash
FEISHU_ONLY=true
```

### 5. 重启服务

```bash
cp .env data/env/env
npm run build
launchctl kickstart -k gui/$(id -u)/com.nanoclaw
```

### 6. 注册聊天

1. 在飞书中找到你的机器人，发送一条消息
2. 查看 NanoClaw 日志，找到类似：
   ```
   [Feishu] Message from unregistered chat: feishu:oc_xxxxxxxx
   ```
3. 使用 IPC 命令注册：
   ```bash
   echo '{"type":"registerGroup","jid":"feishu:oc_xxxxxxxx","group":{"name":"Feishu User","folder":"main","trigger":"@Andy","added_at":"'$(date -u +%Y-%m-%dT%H:%M:%S.000Z)'","requiresTrigger":false}}' | nc -U /tmp/nanoclaw.sock
   ```

## 故障排查

### 连接问题

1. 检查 App ID 和 App Secret 是否正确
2. 确认事件订阅是 SDK 模式（不是 Webhook）
3. 确认 `im.message.receive_v1` 事件已订阅
4. 检查应用是否已发布

### 消息收不到

1. 确认用户已添加机器人到聊天或发送了单聊消息
2. 检查 NanoClaw 日志是否有错误
3. 确认事件订阅配置正确

### 消息发送失败

1. 确认 HTTP 客户端已初始化
2. 检查 chat_id 是否正确（从 JID 去掉 `feishu:` 前缀）
3. 查看 NanoClaw 日志中的错误信息

## 参考

- [飞书开放平台](https://open.feishu.cn)
- [飞书 Node.js SDK 文档](https://open.feishu.cn/document/server-docs/event-subscription-guide)
