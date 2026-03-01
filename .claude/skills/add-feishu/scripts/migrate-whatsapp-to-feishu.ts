#!/usr/bin/env node
/**
 * Migration Script: WhatsApp to Feishu
 *
 * This script migrates the main channel registration from WhatsApp to Feishu.
 * It's useful when you want to completely switch from WhatsApp to Feishu as your
 * primary channel.
 *
 * Usage:
 *   npx tsx scripts/migrate-whatsapp-to-feishu.ts <feishu-chat-id> [options]
 *
 * Options:
 *   --name, -n     Display name for the Feishu chat (default: "Feishu Main")
 *   --trigger, -t  Trigger pattern (default: "@Claude")
 *   --keep-wa    Keep WhatsApp registration (move to different folder instead of deleting)
 *   --dry-run    Show what would be done without making changes
 *   --help, -h   Show this help message
 *
 * Examples:
 *   # Migrate WhatsApp main to Feishu (default behavior)
 *   npx tsx scripts/migrate-whatsapp-to-feishu.ts oc_141db11eed2622f8ff8cb0cee3c58b10
 *
 *   # Keep WhatsApp as a secondary channel
 *   npx tsx scripts/migrate-whatsapp-to-feishu.ts oc_141db11eed2622f8ff8cb0cee3c58b10 --keep-wa
 *
 *   # Preview changes without applying
 *   npx tsx scripts/migrate-whatsapp-to-feishu.ts oc_141db11eed2622f8ff8cb0cee3c58b10 --dry-run
 */

import * as path from 'path';
import * as fs from 'fs';
import { execSync } from 'child_process';

interface MigrationOptions {
  name: string;
  trigger: string;
  keepWa: boolean;
  dryRun: boolean;
}

const DEFAULT_OPTIONS: MigrationOptions = {
  name: 'Feishu Main',
  trigger: '@Claude',
  keepWa: false,
  dryRun: false,
};

function showHelp() {
  console.log(`
Migration Script: WhatsApp to Feishu

This script migrates the main channel registration from WhatsApp to Feishu.

Usage:
  npx tsx scripts/migrate-whatsapp-to-feishu.ts <feishu-chat-id> [options]

Options:
  --name, -n     Display name for the Feishu chat (default: "Feishu Main")
  --trigger, -t  Trigger pattern (default: "@Claude")
  --keep-wa      Keep WhatsApp registration (move to 'whatsapp' folder)
  --dry-run      Show what would be done without making changes
  --help, -h     Show this help message

Examples:
  # Migrate WhatsApp main to Feishu
  npx tsx scripts/migrate-whatsapp-to-feishu.ts oc_141db11eed2622f8ff8cb0cee3c58b10

  # Keep WhatsApp as a secondary channel
  npx tsx scripts/migrate-whatsapp-to-feishu.ts oc_141db11eed2622f8ff8cb0cee3c58b10 --keep-wa

  # Preview changes
  npx tsx scripts/migrate-whatsapp-to-feishu.ts oc_141db11eed2622f8ff8cb0cee3c58b10 --dry-run
`);
}

function parseArgs(): { chatId: string; options: MigrationOptions } {
  const args = process.argv.slice(2);

  if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
    showHelp();
    process.exit(0);
  }

  const chatId = args[0];
  if (!chatId.startsWith('oc_')) {
    console.error('Error: Feishu chat ID should start with "oc_"');
    process.exit(1);
  }

  const options = { ...DEFAULT_OPTIONS };

  for (let i = 1; i < args.length; i++) {
    const arg = args[i];
    switch (arg) {
      case '--name':
      case '-n':
        options.name = args[++i];
        break;
      case '--trigger':
      case '-t':
        options.trigger = args[++i];
        break;
      case '--keep-wa':
        options.keepWa = true;
        break;
      case '--dry-run':
        options.dryRun = true;
        break;
    }
  }

  return { chatId, options };
}

interface WhatsAppRegistration {
  jid: string;
  name: string;
  folder: string;
  trigger_pattern: string;
  added_at: string;
  requires_trigger: number;
}

function main() {
  const { chatId, options } = parseArgs();

  // Check database exists
  const dbPath = path.join(process.cwd(), 'store', 'messages.db');
  if (!fs.existsSync(dbPath)) {
    console.error(`Error: Database not found at ${dbPath}`);
    console.error('Make sure you are running this from the NanoClaw root directory');
    process.exit(1);
  }

  // Use sqlite3 CLI
  function query(sql: string): string {
    return execSync(`sqlite3 "${dbPath}" "${sql}"`, { encoding: 'utf8' }).trim();
  }

  // Check for existing WhatsApp main registration
  console.log('Checking for WhatsApp main registration...\n');

  let waMain: WhatsAppRegistration | null = null;
  try {
    const result = query(`
      SELECT jid, name, folder, trigger_pattern, added_at, requires_trigger
      FROM registered_groups
      WHERE folder = 'main' AND jid LIKE '%@s.whatsapp.net'
    `);

    if (result) {
      const [jid, name, folder, trigger_pattern, added_at, requires_trigger] = result.split('|');
      waMain = { jid, name, folder, trigger_pattern, added_at, requires_trigger: parseInt(requires_trigger) };
    }
  } catch (e) {
    // No WhatsApp main registration found
  }

  // Check for existing Feishu registration
  let existingFeishu: string | null = null;
  try {
    existingFeishu = query(`
      SELECT jid FROM registered_groups WHERE jid = 'feishu:${chatId}'
    `);
  } catch (e) {
    // No existing registration
  }

  // Display current state
  console.log('Current Registration Status:');
  console.log('============================');
  if (waMain) {
    console.log(`✓ WhatsApp (main): ${waMain.jid}`);
    console.log(`  Name: ${waMain.name}`);
  } else {
    console.log('✗ WhatsApp (main): Not registered');
  }

  if (existingFeishu) {
    console.log(`✓ Feishu: ${existingFeishu} (already registered)`);
  } else {
    console.log(`✗ Feishu: Not yet registered (ID: ${chatId})`);
  }
  console.log('');

  // Calculate what will be done
  const actions: string[] = [];

  if (existingFeishu) {
    actions.push(`Update Feishu registration (folder: main)`);
  } else {
    actions.push(`Register Feishu chat as main channel`);
  }

  if (waMain) {
    if (options.keepWa) {
      actions.push(`Move WhatsApp to 'whatsapp' folder (kept as secondary)`);
    } else {
      actions.push(`Remove WhatsApp main registration (deleted)`);
    }
  }

  // Show planned actions
  console.log('Planned Actions:');
  console.log('================');
  if (options.dryRun) {
    console.log('[DRY RUN - No changes will be made]');
  }
  actions.forEach((action, i) => {
    console.log(`${i + 1}. ${action}`);
  });
  console.log('');

  if (options.dryRun) {
    console.log('Dry run complete. Run without --dry-run to apply changes.');
    process.exit(0);
  }

  // Execute the migration
  console.log('Executing migration...\n');

  try {
    // 1. Handle WhatsApp registration
    if (waMain) {
      if (options.keepWa) {
        // Move WhatsApp to 'whatsapp' folder
        console.log('Moving WhatsApp to "whatsapp" folder...');
        query(`
          UPDATE registered_groups
          SET folder = 'whatsapp', requires_trigger = 1
          WHERE jid = '${waMain.jid}'
        `);
        console.log('✓ WhatsApp moved to "whatsapp" folder (now requires trigger)');
      } else {
        // Delete WhatsApp registration
        console.log('Removing WhatsApp main registration...');
        query(`DELETE FROM registered_groups WHERE jid = '${waMain.jid}'`);
        console.log('✓ WhatsApp registration removed');
      }
    }

    // 2. Register/update Feishu
    console.log('\nRegistering Feishu as main channel...');
    const fullJid = `feishu:${chatId}`;

    query(`
      INSERT OR REPLACE INTO registered_groups
      (jid, name, folder, trigger_pattern, added_at, requires_trigger)
      VALUES (
        '${fullJid}',
        '${options.name}',
        'main',
        '${options.trigger}',
        datetime('now'),
        0
      )
    `);

    console.log('✓ Feishu registered as main channel');
    console.log(`  JID: ${fullJid}`);
    console.log(`  Name: ${options.name}`);
    console.log(`  Folder: main`);
    console.log(`  Trigger: ${options.trigger}`);
    console.log(`  Requires trigger: false`);

    console.log('\n' + '='.repeat(60));
    console.log('Migration completed successfully!');
    console.log('='.repeat(60));
    console.log('\nNext steps:');
    console.log('1. Restart NanoClaw to apply changes:');
    console.log('   launchctl kickstart -k gui/$(id -u)/com.nanoclaw');
    console.log('');
    console.log('2. Send a test message in your Feishu chat');
    console.log('');
    console.log('3. Check logs to verify messages are being processed:');
    console.log('   tail -f logs/nanoclaw.log | grep -i feishu');
    console.log('');

  } catch (error) {
    console.error('\n' + '='.repeat(60));
    console.error('Migration failed!');
    console.error('='.repeat(60));
    console.error(error);
    process.exit(1);
  }
}

main();
