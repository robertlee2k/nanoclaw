/**
 * Auto-registration Example for Feishu Chats
 *
 * This example shows how to automatically register Feishu chats when the first
 * message arrives, rather than requiring manual SQL or script execution.
 *
 * To use this pattern:
 * 1. Copy this file to your src/ directory (e.g., src/feishu-auto-register.ts)
 * 2. Import and call `enableFeishuAutoRegistration()` in your main index.ts
 * 3. The auto-registration will handle new chats automatically
 */

import { logger } from './logger.js';
import { setRegisteredGroup } from './db.js';
import { ASSISTANT_NAME } from './config.js';

interface FeishuAutoRegisterOptions {
  /**
   * If true, automatically register new chats as main channel.
   * WARNING: This will replace any existing main channel registration!
   */
  autoRegisterAsMain?: boolean;

  /**
   * If true, prompt user before registering as main (when autoRegisterAsMain is true)
   */
  confirmBeforeMain?: boolean;

  /**
   * Default folder name for non-main registrations
   */
  defaultFolderPrefix?: string;

  /**
   * Default trigger pattern
   */
  triggerPattern?: string;

  /**
   * Callback when a new chat is auto-registered
   */
  onAutoRegister?: (chatId: string, folder: string, isMain: boolean) => void;
}

const DEFAULT_OPTIONS: FeishuAutoRegisterOptions = {
  autoRegisterAsMain: false,
  confirmBeforeMain: true,
  defaultFolderPrefix: 'feishu',
  triggerPattern: `@${ASSISTANT_NAME}`,
};

/**
 * Creates an auto-registration handler for Feishu messages
 *
 * Usage in FeishuChannel:
 *
 * ```typescript
 * import { createFeishuAutoRegistration } from './feishu-auto-register.js';
 *
 * // In FeishuChannel constructor or connect method:
 * const autoRegister = createFeishuAutoRegistration({
 *   autoRegisterAsMain: true,  // Auto-register as main channel
 * });
 *
 * // In handleMessageEvent, before the "unregistered" warning:
 * if (!group) {
 *   const wasAutoRegistered = await autoRegister(chatId, chatJid, this.opts);
 *   if (wasAutoRegistered) {
 *     // Retry processing with the newly registered group
 *     return this.handleMessageEvent(data);
 *   }
 *   // Continue with normal unregistered warning...
 * }
 * ```
 */
export function createFeishuAutoRegistration(
  options: FeishuAutoRegisterOptions = {}
): (chatId: string, chatJid: string, opts: any) => Promise<boolean> {
  const opts = { ...DEFAULT_OPTIONS, ...options };

  return async (chatId: string, chatJid: string, channelOpts: any): Promise<boolean> => {
    try {
      logger.info({ chatId, chatJid }, 'Auto-registering new Feishu chat');

      // Determine folder and requiresTrigger
      let folder: string;
      let requiresTrigger: boolean;
      let isMain = false;

      if (opts.autoRegisterAsMain) {
        // Check if there's already a main registration
        const { getAllRegisteredGroups } = await import('./db.js');
        const groups = getAllRegisteredGroups();
        const existingMain = Object.values(groups).find((g: any) => g.folder === 'main');

        if (existingMain) {
          if (opts.confirmBeforeMain) {
            logger.warn(
              { existingMain },
              'Cannot auto-register as main: another channel already uses main folder'
            );
            // Fall back to additional channel registration
            folder = `${opts.defaultFolderPrefix}-${chatId.slice(0, 8)}`;
            requiresTrigger = true;
          } else {
            // Replace the existing main registration
            logger.warn(
              { existingMain },
              'Replacing existing main channel with Feishu'
            );
            folder = 'main';
            requiresTrigger = false;
            isMain = true;
          }
        } else {
          folder = 'main';
          requiresTrigger = false;
          isMain = true;
        }
      } else {
        folder = `${opts.defaultFolderPrefix}-${chatId.slice(0, 8)}`;
        requiresTrigger = true;
      }

      // Create the registration
      const group = {
        name: `Feishu ${chatId.slice(0, 8)}`,
        folder,
        trigger: opts.triggerPattern || `@${ASSISTANT_NAME}`,
        added_at: new Date().toISOString(),
        requiresTrigger,
      };

      // Save to database
      setRegisteredGroup(chatJid, group);

      logger.info(
        { chatId, chatJid, folder, isMain, requiresTrigger },
        'Successfully auto-registered Feishu chat'
      );

      // Call the callback if provided
      if (opts.onAutoRegister) {
        opts.onAutoRegister(chatId, folder, isMain);
      }

      return true;
    } catch (error) {
      logger.error({ chatId, error }, 'Failed to auto-register Feishu chat');
      return false;
    }
  };
}

/**
 * Enable auto-registration by patching the FeishuChannel's handleMessageEvent
 *
 * This is a convenience function that applies the auto-registration pattern
 * without requiring modifications to the FeishuChannel source code.
 *
 * Usage:
 *
 * ```typescript
 * // In src/index.ts, after creating the FeishuChannel:
 * const feishuChannel = new FeishuChannel(...);
 *
 * // Enable auto-registration
 * enableFeishuAutoRegistration(feishuChannel, {
 *   autoRegisterAsMain: true,
 *   confirmBeforeMain: true,
 * });
 *
 * await feishuChannel.connect();
 * ```
 */
export function enableFeishuAutoRegistration(
  feishuChannel: any,
  options: FeishuAutoRegisterOptions = {}
): void {
  const autoRegister = createFeishuAutoRegistration(options);

  // Store original handleMessageEvent
  const originalHandleMessage = feishuChannel.handleMessageEvent.bind(feishuChannel);

  // Replace with wrapped version
  feishuChannel.handleMessageEvent = async function(data: any) {
    // Check if this is an unregistered chat
    const eventData = data.event || data;
    const { message, sender } = eventData.event || eventData;

    if (!message || !sender) {
      return originalHandleMessage(data);
    }

    const chatId = message.chat_id;
    const chatJid = `feishu:${chatId}`;

    // Check if registered
    const { getAllRegisteredGroups } = await import('./db.js');
    const groups = getAllRegisteredGroups();
    const group = groups[chatJid];

    if (!group) {
      // Try auto-registration
      const wasRegistered = await autoRegister(chatId, chatJid, feishuChannel.opts);

      if (wasRegistered) {
        // Retry with the newly registered group
        return feishuChannel.handleMessageEvent(data);
      }

      // Auto-registration failed, proceed with normal unregistered flow
    }

    return originalHandleMessage(data);
  };

  logger.info('Feishu auto-registration enabled');
}

// Export types
export type { FeishuAutoRegisterOptions };
