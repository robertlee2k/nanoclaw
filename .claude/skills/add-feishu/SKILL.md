# Add Feishu Channel

This skill adds Feishu (Lark) support to NanoClaw using the official Node.js SDK with WebSocket long connection.

## Phase 1: Pre-flight

### Check if already applied

Read `.nanoclaw/state.yaml`. If `feishu` is in `applied_skills`, skip to Phase 3 (Setup). The code changes are already in place.

### Ask the user

Use `AskUserQuestion` to collect configuration:

AskUserQuestion: Should Feishu replace WhatsApp or run alongside it?
- **Replace WhatsApp** - Feishu will be the only channel (sets FEISHU_ONLY=true)
- **Alongside** - Both Feishu and WhatsApp channels active

AskUserQuestion: Do you have Feishu app credentials, or do you need to create them?

If they have them, collect App ID and App Secret now. If not, we'll create them in Phase 3.

## Phase 2: Apply Code Changes

Run the skills engine to apply this skill's code package. The package files are in this directory alongside this SKILL.md.

### Initialize skills system (if needed)

If `.nanoclaw/` directory doesn't exist yet:

```bash
npx tsx scripts/apply-skill.ts --init
```

Or call `initSkillsSystem()` from `skills-engine/migrate.ts`.

### Apply the skill

```bash
npx tsx scripts/apply-skill.ts .claude/skills/add-feishu
```

This deterministically:
- Adds `src/channels/feishu.ts` (FeishuChannel class implementing Channel interface)
- Adds `src/channels/feishu.test.ts` (unit tests)
- Three-way merges Feishu support into `src/index.ts` (multi-channel support, findChannel routing)
- Three-way merges Feishu config into `src/config.ts` (FEISHU_APP_ID, FEISHU_APP_SECRET, FEISHU_ONLY exports)
- Three-way merges updated routing tests into `src/routing.test.ts`
- Installs the `@larksuiteoapi/node-sdk` npm dependency
- Updates `.env.example` with `FEISHU_APP_ID`, `FEISHU_APP_SECRET`, `FEISHU_ONLY`
- Records the application in `.nanoclaw/state.yaml`

If the apply reports merge conflicts, read the intent files:
- `modify/src/index.ts.intent.md` — what changed and invariants for index.ts
- `modify/src/config.ts.intent.md` — what changed for config.ts

### Validate code changes

```bash
npm test
npm run build
```

All tests must pass (including the new Feishu tests) and build must be clean before proceeding.

## Phase 3: Setup

### Create Feishu App (if needed)

If the user doesn't have app credentials, tell them:

> I need you to create a Feishu app:
>
> 1. Go to the Feishu Open Platform (https://open.feishu.cn)
> 2. Click **Create App** → **Enterprise Self-Built App**
> 3. Give it a name (e.g., "NanoClaw Assistant")
> 4. Go to the **Credentials & Basic Info** page
> 5. Copy the **App ID** and **App Secret** — you'll need both
> 6. Go to **Bot** tab and enable the bot capability
> 7. Go to **Event Subscription** and enable SDK mode (SDK 长连接模式)
> 8. Subscribe to `im.message.receive_v1` event (Receive message v2.0)
> 9. Publish the app (提交发布)

Wait for the user to provide the App ID and App Secret.

### Configure environment

Add to `.env`:

```bash
FEISHU_APP_ID=cli_xxxxxxxxxxxx
FEISHU_APP_SECRET=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

If they chose to replace WhatsApp:

```bash
FEISHU_ONLY=true
```

Sync to container environment:

```bash
cp .env data/env/env
```

The container reads environment from `data/env/env`, not `.env` directly.

### Build and restart

```bash
npm run build
launchctl kickstart -k gui/$(id -u)/com.nanoclaw
```

## Phase 4: Registration

### Get Chat ID

After the first message is sent to the bot, the chat ID will appear in the logs.

Look for a log line like:
```
[Feishu] Message from unregistered chat: feishu:oc_xxxxxxxxxxxxxxxx
```

The chat ID is the part after `feishu:` (e.g., `oc_xxxxxxxxxxxxxxxx`).

### Register the channel

For a main channel (responds to all messages, uses the `main` folder):

```typescript
registerGroup("feishu:<chat-id>", {
  name: "Feishu User <name>",
  folder: "main",
  trigger: `@${ASSISTANT_NAME}`,
  added_at: new Date().toISOString(),
  requiresTrigger: false,
});
```

For additional channels (trigger-only):

```typescript
registerGroup("feishu:<chat-id>", {
  name: "Feishu User <name>",
  folder: "<folder-name>",
  trigger: `@${ASSISTANT_NAME}`,
  added_at: new Date().toISOString(),
  requiresTrigger: true,
});
```

## Phase 5: Verify

### Test the connection

Tell the user:

> Send a message to your Feishu bot:
> - For main channel: Any message works
> - For non-main: @mention the bot
>
> The bot should respond within a few seconds.

### Check logs if needed

```bash
tail -f logs/nanoclaw.log
```

## Troubleshooting

### Bot not responding

1. Check `FEISHU_APP_ID` and `FEISHU_APP_SECRET` are set in `.env` AND synced to `data/env/env`
2. Check channel is registered: `sqlite3 store/messages.db "SELECT * FROM registered_groups WHERE jid LIKE 'feishu:%'"`
3. For non-main channels: message must include trigger pattern (@mention the bot)
4. Service is running: `launchctl list | grep nanoclaw`
5. Check event subscription is enabled in SDK mode in Feishu app settings
6. Verify `im.message.receive_v1` event is subscribed

### Bot only responds to @mentions

This is the default behavior for non-main channels (`requiresTrigger: true`). To change:
- Update the registered group's `requiresTrigger` to `false`
- Or register the channel as the main channel

### Connection issues

If you see WebSocket connection errors in logs:
1. Check App ID and App Secret are correct
2. Ensure the app is published in Feishu Open Platform
3. Check event subscription is enabled
4. Verify `im.message.receive_v1` event is subscribed in SDK mode

## After Setup

The Feishu bot supports:
- Text messages in registered chats
- @mention trigger handling
- Automatic reconnection on connection drops
- SDK-managed heartbeat and connection recovery
