# Add Feishu Channel

This skill adds Feishu (Lark) support to NanoClaw using the official Node.js SDK with WebSocket long connection.

## Phase 1: Pre-flight

### Check if already applied

Read `.nanoclaw/state.yaml`. If `feishu` is in `applied_skills`, skip to Phase 3 (Setup). The code changes are already in place.

### Ask the user

Use `AskUserQuestion` to collect configuration:

**AskUserQuestion: Should Feishu replace WhatsApp or run alongside it?**
- **Replace WhatsApp** - Feishu will be the only channel (sets FEISHU_ONLY=true)
- **Alongside** - Both Feishu and WhatsApp channels active

**Important:** If replacing WhatsApp, the user must also migrate the `main` folder registration from WhatsApp to Feishu. See Phase 4 for details.

**AskUserQuestion: Do you have Feishu app credentials, or do you need to create them?**

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

### Important: Main Folder Conflict Resolution

**The `main` folder in NanoClaw can only be assigned to one channel.** If you want Feishu to be your primary channel (responding to all messages without @mentions), you must ensure no other channel is using the `main` folder.

#### Option A: Replace WhatsApp with Feishu (Recommended for Feishu-only setups)

If you've set `FEISHU_ONLY=true` and want Feishu to completely replace WhatsApp:

```bash
# 1. Stop NanoClaw
launchctl unload ~/Library/LaunchAgents/com.nanoclaw.plist

# 2. Delete WhatsApp registration (if it exists)
sqlite3 store/messages.db "DELETE FROM registered_groups WHERE jid LIKE '%@s.whatsapp.net';"

# 3. Register Feishu as main (see registration methods below)

# 4. Restart NanoClaw
launchctl load ~/Library/LaunchAgents/com.nanoclaw.plist
```

#### Option B: Run Feishu alongside WhatsApp

If you want to keep WhatsApp as main and add Feishu as an additional channel:

- Feishu will be registered with `requiresTrigger: true`
- Users must @mention the bot in Feishu to get responses
- The folder will be `feishu-<chat-id>` instead of `main`

### Get Chat ID

After the first message is sent to the bot, the chat ID will appear in the logs.

Look for a log line like:
```
Message from unregistered Feishu chat - IGNORING  chatJid: "feishu:oc_xxxxxxxxxxxxxxxx"
```

The chat ID is the part after `feishu:` (e.g., `oc_xxxxxxxxxxxxxxxx`).

### Registration Methods

Choose one of the following methods to register the chat:

#### Method 1: Using the Registration Script (Recommended)

The skill includes a helper script for easy registration:

```bash
# Register as main channel (replaces WhatsApp)
npx tsx scripts/register-feishu-chat.ts oc_141db11eed2622f8ff8cb0cee3c58b10 --main --name "My Feishu"

# Register as additional channel (alongside WhatsApp)
npx tsx scripts/register-feishu-chat.ts oc_141db11eed2622f8ff8cb0cee3c58b10 --additional --name "My Feishu"
```

Then restart NanoClaw:
```bash
launchctl kickstart -k gui/$(id -u)/com.nanoclaw
```

#### Method 2: Direct SQL Registration

If you prefer to use SQL directly:

```sql
-- For main channel (replaces WhatsApp, requiresTrigger: false)
INSERT OR REPLACE INTO registered_groups
(jid, name, folder, trigger_pattern, added_at, requires_trigger)
VALUES ('feishu:oc_141db11eed2622f8ff8cb0cee3c58b10', '飞书私聊', 'main', '@Claude', datetime('now'), 0);

-- For additional channel (alongside WhatsApp, requiresTrigger: true)
INSERT OR REPLACE INTO registered_groups
(jid, name, folder, trigger_pattern, added_at, requires_trigger)
VALUES ('feishu:oc_141db11eed2622f8ff8cb0cee3c58b10', '飞书私聊', 'feishu-main', '@Claude', datetime('now'), 1);
```

#### Method 3: Using IPC (Programmatic)

For programmatic registration from within NanoClaw:

```typescript
// In src/index.ts or via IPC
registerGroup("feishu:oc_141db11eed2622f8ff8cb0cee3c58b10", {
  name: "飞书私聊",
  folder: "main", // or "feishu-main" for additional
  trigger: `@${ASSISTANT_NAME}`,
  added_at: new Date().toISOString(),
  requiresTrigger: false, // true for additional channels
});
```

### Registration Summary

For a **main channel** (replaces WhatsApp):
- Folder: `main`
- requiresTrigger: `false`
- Responds to: All messages (no @mention needed)

For an **additional channel** (alongside WhatsApp):
- Folder: `feishu-<chat-id>` or custom name
- requiresTrigger: `true`
- Responds to: Only messages with @mention

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

### Message from unregistered Feishu chat - IGNORING

This means the chat is not registered in the database. Solutions:

1. **Use the registration script** (easiest):
   ```bash
   npx tsx scripts/register-feishu-chat.ts <chat-id> --main --name "My Feishu"
   ```

2. **Manual SQL**:
   ```bash
   sqlite3 store/messages.db "INSERT INTO registered_groups (jid, name, folder, trigger_pattern, added_at, requires_trigger) VALUES ('feishu:<chat-id>', 'My Feishu', 'main', '@Claude', datetime('now'), 0);"
   ```

3. **Automatic registration** (requires code changes): See the `handleAutoRegistration` example in the skill's `examples/` directory.

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

### Main folder conflict

**Error:** `UNIQUE constraint failed: registered_groups.folder`

This happens when trying to register Feishu as `main` but another channel (e.g., WhatsApp) already uses the `main` folder.

**Solution:**

1. Check current registrations:
   ```bash
   sqlite3 store/messages.db "SELECT jid, name, folder FROM registered_groups;"
   ```

2. If WhatsApp is registered as `main` and you want to replace it:
   ```bash
   # Option A: Keep WhatsApp but move it to a different folder
   sqlite3 store/messages.db "UPDATE registered_groups SET folder = 'whatsapp' WHERE folder = 'main';"

   # Option B: Delete WhatsApp registration entirely
   sqlite3 store/messages.db "DELETE FROM registered_groups WHERE jid LIKE '%@s.whatsapp.net';"
   ```

3. Re-register Feishu as main:
   ```bash
   npx tsx scripts/register-feishu-chat.ts <chat-id> --main
   ```

## After Setup

The Feishu bot supports:
- Text messages in registered chats
- @mention trigger handling
- Automatic reconnection on connection drops
- SDK-managed heartbeat and connection recovery

## Advanced: Automatic Registration

For production deployments, you may want to automatically register new chats instead of manually running SQL. See the `examples/` directory in this skill for implementation patterns, including:

- `auto-register.ts` - Automatically register chats on first message
- `migrate-from-whatsapp.ts` - Migrate main folder from WhatsApp to Feishu
- `ipc-registration.ts` - Register via NanoClaw's IPC interface

## Migration Guide: WhatsApp to Feishu

If you're migrating from WhatsApp to Feishu as your primary channel:

1. **Apply the add-feishu skill** (Phase 2)

2. **Set environment variables**:
   ```bash
   FEISHU_APP_ID=cli_xxxxxxxxxxxx
   FEISHU_APP_SECRET=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
   FEISHU_ONLY=true
   ```

3. **Stop NanoClaw**:
   ```bash
   launchctl unload ~/Library/LaunchAgents/com.nanoclaw.plist
   ```

4. **Migrate the main folder**:
   ```bash
   # Option 1: Use the migration script
   npx tsx scripts/migrate-main-to-feishu.ts

   # Option 2: Manual SQL
   sqlite3 store/messages.db <<EOF
   -- Delete WhatsApp from main
   DELETE FROM registered_groups WHERE folder = 'main' AND jid LIKE '%@s.whatsapp.net';

   -- Register Feishu as main (chat ID will be obtained from first message)
   -- This will be done automatically or manually after first message arrives
   EOF
   ```

5. **Start NanoClaw**:
   ```bash
   launchctl load ~/Library/LaunchAgents/com.nanoclaw.plist
   ```

6. **Send first message from Feishu** and register the chat:
   ```bash
   # Get chat ID from logs, then:
   npx tsx scripts/register-feishu-chat.ts <chat-id> --main
   ```

7. **Restart NanoClaw** to apply registration.

See also: `MIGRATION.md` in this skill's directory for detailed migration scenarios.
