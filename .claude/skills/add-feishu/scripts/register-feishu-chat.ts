#!/usr/bin/env node
/**
 * Feishu Chat Registration Helper
 *
 * This script can be used to manually register a Feishu chat when automatic
 * registration is not desired or when migrating from an existing setup.
 *
 * Usage:
 *   npx tsx scripts/register-feishu-chat.ts <chat-id> [options]
 *
 * Options:
 *   --name, -n     Display name for the chat (default: "Feishu Chat")
 *   --folder, -f   Folder name (default: "main" for primary, or "feishu-<chat-id>" for additional)
 *   --trigger, -t  Trigger pattern (default: "@Claude")
 *   --main         Register as main channel (requiresTrigger: false)
 *   --additional   Register as additional channel (requiresTrigger: true)
 *
 * Examples:
 *   # Register as main channel (replaces WhatsApp)
 *   npx tsx scripts/register-feishu-chat.ts oc_141db11eed2622f8ff8cb0cee3c58b10 --main
 *
 *   # Register as additional channel
 *   npx tsx scripts/register-feishu-chat.ts oc_141db11eed2622f8ff8cb0cee3c58b10 --additional --name "My Feishu"
 */

import { Database } from 'better-sqlite3';
import * as path from 'path';
import * as fs from 'fs';
import { execSync } from 'child_process';

// Parse arguments
const args = process.argv.slice(2);

function showHelp() {
  console.log(`
Feishu Chat Registration Helper

Usage:
  npx tsx scripts/register-feishu-chat.ts <chat-id> [options]

Options:
  --name, -n     Display name for the chat (default: "Feishu Chat")
  --folder, -f   Folder name (default: "main" for --main, or "feishu-<chat-id>" for --additional)
  --trigger, -t  Trigger pattern (default: "@Claude")
  --main         Register as main channel (requiresTrigger: false)
  --additional   Register as additional channel (requiresTrigger: true)
  --help, -h     Show this help message

Examples:
  # Register as main channel (replaces WhatsApp)
  npx tsx scripts/register-feishu-chat.ts oc_141db11eed2622f8ff8cb0cee3c58b10 --main

  # Register as additional channel
  npx tsx scripts/register-feishu-chat.ts oc_141db11eed2622f8ff8cb0cee3c58b10 --additional --name "My Feishu"
`);
}

if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
  showHelp();
  process.exit(0);
}

const chatId = args[0];
if (!chatId.startsWith('oc_')) {
  console.error('Error: Chat ID should start with "oc_" for Feishu chats');
  process.exit(1);
}

// Parse options
let name = 'Feishu Chat';
let folder: string | undefined;
let trigger = '@Claude';
let isMain = false;
let isAdditional = false;

for (let i = 1; i < args.length; i++) {
  const arg = args[i];
  switch (arg) {
    case '--name':
    case '-n':
      name = args[++i];
      break;
    case '--folder':
    case '-f':
      folder = args[++i];
      break;
    case '--trigger':
    case '-t':
      trigger = args[++i];
      break;
    case '--main':
      isMain = true;
      break;
    case '--additional':
      isAdditional = true;
      break;
  }
}

if (!isMain && !isAdditional) {
  console.error('Error: Must specify either --main or --additional');
  console.error('Run with --help for usage information');
  process.exit(1);
}

if (isMain && isAdditional) {
  console.error('Error: Cannot specify both --main and --additional');
  process.exit(1);
}

// Determine folder and requiresTrigger
const finalFolder = folder ?? (isMain ? 'main' : `feishu-${chatId.slice(0, 8)}`);
const requiresTrigger = isAdditional;

// Database operations
const dbPath = path.join(process.cwd(), 'store', 'messages.db');

if (!fs.existsSync(dbPath)) {
  console.error(`Error: Database not found at ${dbPath}`);
  console.error('Make sure you are running this from the NanoClaw root directory');
  process.exit(1);
}

// Use better-sqlite3 if available, otherwise use raw SQL via sqlite3 CLI
try {
  const Database = require('better-sqlite3');
  const db = new Database(dbPath);

  // Check if there's already a main folder registration when registering as main
  if (isMain) {
    const existingMain = db.prepare('SELECT * FROM registered_groups WHERE folder = ?').get('main');
    if (existingMain) {
      console.log(`Warning: There's already a channel registered with 'main' folder:`);
      console.log(`  JID: ${existingMain.jid}`);
      console.log(`  Name: ${existingMain.name}`);
      console.log();
      console.log('Options:');
      console.log('  1. Delete the existing registration and continue with this one');
      console.log('  2. Cancel and investigate manually');
      console.log();
      // For now, just warn and continue - in production this might prompt the user
    }
  }

  // Insert or replace the registration
  const stmt = db.prepare(`
    INSERT OR REPLACE INTO registered_groups
    (jid, name, folder, trigger_pattern, added_at, requires_trigger)
    VALUES (?, ?, ?, ?, datetime('now'), ?)
  `);

  const fullJid = `feishu:${chatId}`;
  stmt.run(fullJid, name, finalFolder, trigger, requiresTrigger ? 1 : 0);

  db.close();

  console.log('✓ Feishu chat registered successfully!');
  console.log();
  console.log('Registration details:');
  console.log(`  JID: feishu:${chatId}`);
  console.log(`  Name: ${name}`);
  console.log(`  Folder: ${finalFolder}`);
  console.log(`  Trigger: ${trigger}`);
  console.log(`  Requires trigger: ${requiresTrigger}`);
  console.log();

  if (isMain) {
    console.log('This channel is registered as the MAIN channel.');
    console.log('It will respond to all messages without requiring @mentions.');
    console.log();
    console.log('Note: If you previously had WhatsApp as main, you may need to:');
    console.log('  1. Stop NanoClaw');
    console.log('  2. Delete the WhatsApp registration from the database');
    console.log('  3. Restart NanoClaw');
  } else {
    console.log('This channel is registered as an ADDITIONAL channel.');
    console.log('It will only respond to messages containing the trigger pattern.');
  }
  console.log();
  console.log('Restart NanoClaw to apply the changes:');
  console.log('  launchctl kickstart -k gui/$(id -u)/com.nanoclaw');

} catch (error) {
  // Fall back to sqlite3 CLI
  console.log('Note: better-sqlite3 not available, falling back to sqlite3 CLI...');

  const { execSync } = require('child_process');

  // Check for existing main registration
  if (isMain) {
    try {
      const result = execSync(
        `sqlite3 "${dbPath}" "SELECT jid, name FROM registered_groups WHERE folder = 'main';"`,
        { encoding: 'utf8' }
      );
      if (result.trim()) {
        console.log(`Warning: There's already a channel registered with 'main' folder:`);
        console.log(result.trim());
      }
    } catch (e) {
      // Ignore errors here
    }
  }

  // Insert the registration
  const fullJid = `feishu:${chatId}`;
  const requiresTriggerInt = requiresTrigger ? 1 : 0;

  const sql = `
    INSERT OR REPLACE INTO registered_groups
    (jid, name, folder, trigger_pattern, added_at, requires_trigger)
    VALUES ('${fullJid}', '${name}', '${finalFolder}', '${trigger}', datetime('now'), ${requiresTriggerInt});
  `;

  try {
    execSync(`sqlite3 "${dbPath}" "${sql}"`);

    console.log('✓ Feishu chat registered successfully!');
    console.log();
    console.log('Registration details:');
    console.log(`  JID: ${fullJid}`);
    console.log(`  Name: ${name}`);
    console.log(`  Folder: ${finalFolder}`);
    console.log(`  Trigger: ${trigger}`);
    console.log(`  Requires trigger: ${requiresTrigger}`);
    console.log();

    if (isMain) {
      console.log('This channel is registered as the MAIN channel.');
      console.log('Note: If you previously had WhatsApp as main, run:');
      console.log(`  sqlite3 store/messages.db "DELETE FROM registered_groups WHERE jid = '15316346683@s.whatsapp.net';"`);
    } else {
      console.log('This channel is registered as an ADDITIONAL channel.');
    }
    console.log();
    console.log('Restart NanoClaw to apply changes:');
    console.log('  launchctl kickstart -k gui/$(id -u)/com.nanoclaw');

  } catch (error) {
    console.error('Error registering Feishu chat:', error);
    process.exit(1);
  }
}
