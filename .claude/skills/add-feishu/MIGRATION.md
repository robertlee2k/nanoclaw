# Migration Guide: WhatsApp to Feishu

This guide helps you migrate your NanoClaw installation from using WhatsApp as the primary channel to using Feishu (Lark).

## Quick Migration (Recommended)

If you want to completely switch from WhatsApp to Feishu:

```bash
# 1. Make sure you have your Feishu chat ID
#    (Send a message to the bot and check logs for "unregistered chat")

# 2. Run the migration script
npx tsx scripts/migrate-whatsapp-to-feishu.ts oc_141db11eed2622f8ff8cb0cee3c58b10 --main

# 3. Restart NanoClaw
launchctl kickstart -k gui/$(id -u)/com.nanoclaw

# 4. Test by sending a message in Feishu
```

## Migration Scenarios

### Scenario 1: Replace WhatsApp (WhatsApp → Feishu)

You want to completely replace WhatsApp with Feishu as your primary channel.

**Steps:**

1. Apply the add-feishu skill if not already done
2. Set `FEISHU_ONLY=true` in your `.env`
3. Stop NanoClaw
4. Run the migration:
   ```bash
   npx tsx scripts/migrate-whatsapp-to-feishu.ts <chat-id> --main
   ```
5. Restart NanoClaw
6. Verify by sending messages in Feishu

**What happens:**
- WhatsApp registration is deleted
- Feishu is registered as `main` folder with `requiresTrigger: false`
- WhatsApp channel won't start (due to `FEISHU_ONLY=true`)

### Scenario 2: Keep WhatsApp as Secondary

You want Feishu as primary but keep WhatsApp for occasional use.

**Steps:**

1. Don't set `FEISHU_ONLY=true` (or remove it from `.env`)
2. Run the migration with `--keep-wa` flag:
   ```bash
   npx tsx scripts/migrate-whatsapp-to-feishu.ts <chat-id> --main --keep-wa
   ```
3. WhatsApp will be moved to folder `whatsapp` with `requiresTrigger: true`
4. Restart NanoClaw

**What happens:**
- Feishu becomes `main` (responds to all messages)
- WhatsApp becomes `whatsapp` folder (only responds to @mentions)
- Both channels are active

### Scenario 3: Run Both in Parallel (No Primary)

You want both WhatsApp and Feishu as independent channels, both requiring triggers.

**Steps:**

1. Don't register either as `main`
2. Register both as additional channels:
   ```bash
   # Keep WhatsApp as is (assuming it's already main)
   # Or if migrating from main:
   sqlite3 store/messages.db "UPDATE registered_groups SET folder = 'whatsapp' WHERE folder = 'main';"

   # Register Feishu as additional
   npx tsx scripts/register-feishu-chat.ts <chat-id> --additional --folder feishu-main
   ```

**What happens:**
- Neither is `main` folder
- Both require trigger (@mention) to respond
- You must specify which channel when triggering tasks

## Manual Migration Steps

If you prefer not to use the migration script, here's how to do it manually:

### 1. Check Current Registrations

```bash
sqlite3 store/messages.db "SELECT jid, name, folder FROM registered_groups;"
```

### 2. Decide Your Migration Path

**Option A: Replace WhatsApp**
```bash
# Delete WhatsApp
sqlite3 store/messages.db "DELETE FROM registered_groups WHERE jid LIKE '%@s.whatsapp.net';"

# Register Feishu as main
sqlite3 store/messages.db "
  INSERT INTO registered_groups (jid, name, folder, trigger_pattern, added_at, requires_trigger)
  VALUES ('feishu:CHAT_ID', 'Feishu Main', 'main', '@Claude', datetime('now'), 0);
"
```

**Option B: Keep WhatsApp as Secondary**
```bash
# Move WhatsApp to different folder
sqlite3 store/messages.db "
  UPDATE registered_groups
  SET folder = 'whatsapp', requires_trigger = 1
  WHERE folder = 'main' AND jid LIKE '%@s.whatsapp.net';
"

# Register Feishu as main (same INSERT as above)
```

### 3. Restart NanoClaw

```bash
launchctl kickstart -k gui/$(id -u)/com.nanoclaw
```

### 4. Verify

```bash
# Check registrations
sqlite3 store/messages.db "SELECT jid, name, folder FROM registered_groups;"

# Check logs
tail -f logs/nanoclaw.log | grep -i feishu
```

## Troubleshooting

### "UNIQUE constraint failed: registered_groups.folder"

This means another channel is already using the `main` folder. You must either:

1. Delete the existing main registration:
   ```bash
   sqlite3 store/messages.db "DELETE FROM registered_groups WHERE folder = 'main';"
   ```

2. Or move it to a different folder:
   ```bash
   sqlite3 store/messages.db "UPDATE registered_groups SET folder = 'other' WHERE folder = 'main';"
   ```

### "Message from unregistered Feishu chat - IGNORING"

The chat hasn't been registered. Get the chat ID from the log message and run:

```bash
npx tsx scripts/register-feishu-chat.ts CHAT_ID --main
```

### Lost WhatsApp Registration

If you accidentally deleted WhatsApp and want to restore it:

1. Re-link WhatsApp (scan QR code again)
2. Get the new JID from logs
3. Register it (as additional or main depending on your needs)

## See Also

- `register-feishu-chat.ts` - Register individual Feishu chats
- `SKILL.md` - Main skill documentation
- `examples/auto-register.ts` - Automatic registration patterns
