# Intent: src/index.ts modifications

## What changed
Added Feishu as a channel option alongside WhatsApp, following the same multi-channel pattern as Discord.

## Key sections

### Imports (top of file)
- Added: `FeishuChannel` from `./channels/feishu.js`
- Added: `FEISHU_APP_ID`, `FEISHU_APP_SECRET`, `FEISHU_ONLY` from `./config.js`

### Feishu channel initialization
- Added: conditional Feishu channel creation (`if (FEISHU_APP_ID && FEISHU_APP_SECRET)`)
- Added: `feishu.connect()` call to establish WebSocket connection
- Added: Feishu channel to `channels` array for message routing

### WhatsApp conditional
- Changed: WhatsApp conditional to `if (!FEISHU_ONLY)` (same pattern as Discord's `DISCORD_ONLY`)

### IPC Watcher syncGroupMetadata
- Kept: `whatsapp?.syncGroupMetadata(force)` fallback since Feishu doesn't have group metadata sync

## Invariants
- All existing message processing logic (triggers, cursors, idle timers) is preserved
- The `runAgent` function is completely unchanged
- State management (loadState/saveState) is unchanged
- Recovery logic is unchanged
- Container runtime check is unchanged (ensureContainerSystemRunning)

## Must-keep
- The `escapeXml` and `formatMessages` re-exports
- The `_setRegisteredGroups` test helper
- The `isDirectRun` guard at bottom
- All error handling and cursor rollback logic in processGroupMessages
- The outgoing queue flush and reconnection logic (in WhatsAppChannel, not here)
