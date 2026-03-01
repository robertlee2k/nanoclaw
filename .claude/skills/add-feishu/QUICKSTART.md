# Add Feishu Skill - Quick Start Guide

## Overview

This skill adds Feishu (Lark) support to NanoClaw. Follow this guide for common scenarios.

## Common Scenarios

### Scenario 1: Fresh Install (No WhatsApp)

If you're setting up NanoClaw for the first time with Feishu as your primary channel:

```bash
# 1. Apply the skill
npx tsx scripts/apply-skill.ts .claude/skills/add-feishu

# 2. Set environment variables
export FEISHU_APP_ID=cli_xxxxxxxxxxxx
export FEISHU_APP_SECRET=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
export FEISHU_ONLY=true

# 3. Build and start
npm run build
launchctl load ~/Library/LaunchAgents/com.nanoclaw.plist

# 4. Send first message in Feishu
# 5. Get chat ID from logs

# 6. Register the chat
npx tsx scripts/register-feishu-chat.ts <chat-id> --main

# 7. Restart
launchctl kickstart -k gui/$(id -u)/com.nanoclaw
```

### Scenario 2: Replace WhatsApp with Feishu

If you currently have WhatsApp as main and want to switch to Feishu:

```bash
# Use the migration script
npx tsx scripts/migrate-whatsapp-to-feishu.ts <feishu-chat-id> --main

# Follow the prompts and restart NanoClaw
launchctl kickstart -k gui/$(id -u)/com.nanoclaw
```

**What this does:**
- Deletes the WhatsApp main registration
- Registers Feishu as `main` folder
- Automatically handles the database updates

### Scenario 3: Run Feishu Alongside WhatsApp

If you want to keep WhatsApp as main and add Feishu as an additional channel:

```bash
# 1. Make sure WhatsApp is registered as main
# 2. Register Feishu as additional
npx tsx scripts/register-feishu-chat.ts <feishu-chat-id> --additional --folder feishu-extra

# 3. Restart
launchctl kickstart -k gui/$(id -u)/com.nanoclaw
```

**Behavior:**
- WhatsApp: Main channel, responds to all messages
- Feishu: Additional channel, only responds to @mentions

## Quick Commands Reference

### Check Current Registrations
```bash
sqlite3 store/messages.db "SELECT jid, name, folder FROM registered_groups;"
```

### Register Feishu as Main
```bash
npx tsx scripts/register-feishu-chat.ts <chat-id> --main
```

### Register Feishu as Additional
```bash
npx tsx scripts/register-feishu-chat.ts <chat-id> --additional --folder <folder-name>
```

### Migrate WhatsApp to Feishu
```bash
npx tsx scripts/migrate-whatsapp-to-feishu.ts <feishu-chat-id> --main
```

### Delete a Registration
```bash
sqlite3 store/messages.db "DELETE FROM registered_groups WHERE jid = 'feishu:<chat-id>';"
```

## Troubleshooting

### "UNIQUE constraint failed: registered_groups.folder"

Another channel is already using the `main` folder. Either:

1. Delete the existing main:
   ```bash
   sqlite3 store/messages.db "DELETE FROM registered_groups WHERE folder = 'main';"
   ```

2. Or move it to a different folder:
   ```bash
   sqlite3 store/messages.db "UPDATE registered_groups SET folder = 'other' WHERE folder = 'main';"
   ```

### "Message from unregistered Feishu chat - IGNORING"

The chat hasn't been registered. Get the chat ID from the log and register it:

```bash
npx tsx scripts/register-feishu-chat.ts <chat-id> --main
```

### Main folder conflict during migration

If the migration script detects a main folder conflict, it will prompt you. You can:

1. Use `--dry-run` to see what would happen:
   ```bash
   npx tsx scripts/migrate-whatsapp-to-feishu.ts <chat-id> --main --dry-run
   ```

2. Use `--keep-wa` to keep WhatsApp as secondary:
   ```bash
   npx tsx scripts/migrate-whatsapp-to-feishu.ts <chat-id> --main --keep-wa
   ```

## See Also

- `SKILL.md` - Full skill documentation
- `MIGRATION.md` - Detailed migration guide
- `examples/auto-register.ts` - Automatic registration implementation
- `scripts/register-feishu-chat.ts` - Registration script help
- `scripts/migrate-whatsapp-to-feishu.ts` - Migration script help
