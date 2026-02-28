import * as lark from '@larksuiteoapi/node-sdk';

import { ASSISTANT_NAME, TRIGGER_PATTERN } from '../config.js';
import { logger } from '../logger.js';
import {
  Channel,
  OnChatMetadata,
  OnInboundMessage,
  RegisteredGroup,
} from '../types.js';

export interface FeishuChannelOpts {
  onMessage: OnInboundMessage;
  onChatMetadata: OnChatMetadata;
  registeredGroups: () => Record<string, RegisteredGroup>;
}

export class FeishuChannel implements Channel {
  name = 'feishu';

  private opts: FeishuChannelOpts;
  private appId: string;
  private appSecret: string;

  // SDK clients
  private httpClient: lark.Client | null = null;
  private wsClient: lark.WSClient | null = null;

  // State
  private connected = false;
  private botUserId: string | null = null;

  constructor(
    config: {
      appId: string;
      appSecret: string;
    },
    opts: FeishuChannelOpts,
  ) {
    this.appId = config.appId;
    this.appSecret = config.appSecret;
    this.opts = opts;
  }

  // ============================================================================
  // Channel Interface Implementation
  // ============================================================================

  async connect(): Promise<void> {
    logger.info('Connecting to Feishu via Node.js SDK...');

    try {
      // 1. Create HTTP client for API calls
      this.httpClient = new lark.Client({
        appId: this.appId,
        appSecret: this.appSecret,
      });

      // 2. Fetch bot info
      await this.fetchBotInfo();

      // 3. Create WebSocket client for receiving events
      this.wsClient = new lark.WSClient({
        appId: this.appId,
        appSecret: this.appSecret,
      });

      // 4. Start WebSocket connection with event handler
      await this.wsClient.start({
        eventDispatcher: new lark.EventDispatcher({}).register({
          'im.message.receive_v1': async (data: lark.im.v1.P2ImMessageReceiveV1) => {
            await this.handleMessageEvent(data);
          },
        }),
      });

      this.connected = true;
      logger.info('Feishu WebSocket connected successfully');
    } catch (err) {
      logger.error({ err }, 'Failed to connect to Feishu');
      throw err;
    }
  }

  async sendMessage(jid: string, text: string): Promise<void> {
    if (!this.httpClient || !this.connected) {
      logger.warn('Cannot send message: Feishu client not connected');
      return;
    }

    try {
      const chatId = jid.replace(/^feishu:/, '');

      await this.httpClient.im.v1.message.create({
        params: {
          receive_id_type: 'chat_id',
        },
        data: {
          receive_id: chatId,
          msg_type: 'text',
          content: JSON.stringify({ text }),
        },
      });

      logger.info({ jid, length: text.length }, 'Feishu message sent');
    } catch (err) {
      logger.error({ jid, err }, 'Failed to send Feishu message');
    }
  }

  isConnected(): boolean {
    return this.connected && this.wsClient !== null && this.httpClient !== null;
  }

  ownsJid(jid: string): boolean {
    return jid.startsWith('feishu:');
  }

  async disconnect(): Promise<void> {
    logger.info('Disconnecting from Feishu...');

    this.connected = false;

    if (this.wsClient) {
      try {
        await this.wsClient.stop();
      } catch (err) {
        logger.warn({ err }, 'Error stopping WebSocket client');
      }
      this.wsClient = null;
    }

    this.httpClient = null;
    this.botUserId = null;

    logger.info('Feishu disconnected');
  }

  // ============================================================================
  // Private Methods
  // ============================================================================

  private async handleMessageEvent(
    data: lark.im.v1.P2ImMessageReceiveV1,
  ): Promise<void> {
    const { message, sender } = data;

    if (!message || !sender) {
      logger.debug('Missing message or sender in event');
      return;
    }

    const chatId = message.chat_id;
    const userId = sender.sender_id?.user_id;

    if (!chatId || !userId) {
      logger.debug('Missing chat_id or user_id');
      return;
    }

    // Build JID
    const chatJid = `feishu:${chatId}`;
    const timestamp = new Date(parseInt(message.create_time || '0')).toISOString();

    // Parse message content
    let content = '';
    if (message.message_type === 'text' && message.content) {
      try {
        const contentObj = JSON.parse(message.content);
        content = contentObj.text || '';
      } catch {
        content = message.content;
      }
    }

    // Check if bot was mentioned
    const mentions = message.mentions || [];
    const isBotMentioned = this.botUserId
      ? mentions.some((m) => m.id?.user_id === this.botUserId)
      : false;

    if (isBotMentioned) {
      // Remove @bot text
      content = content.replace(/@\S+/g, '').trim();

      // Add trigger if not present
      if (!TRIGGER_PATTERN.test(content)) {
        content = `@${ASSISTANT_NAME} ${content}`;
      }
    }

    // Store chat metadata
    this.opts.onChatMetadata(chatJid, timestamp, `User ${userId}`, 'feishu', false);

    // Check if registered
    const group = this.opts.registeredGroups()[chatJid];
    if (!group) {
      logger.debug({ chatJid }, 'Message from unregistered Feishu chat');
      return;
    }

    // Deliver message
    this.opts.onMessage(chatJid, {
      id: message.message_id || '',
      chat_jid: chatJid,
      sender: userId,
      sender_name: mentions[0]?.name || `User ${userId}`,
      content,
      timestamp,
      is_from_me: false,
    });

    logger.info({ chatJid, sender: userId }, 'Feishu message stored');
  }

  private async fetchBotInfo(): Promise<void> {
    try {
      if (!this.httpClient) return;

      const response = await this.httpClient.bot.botInfo.get();
      if (response?.data) {
        this.botUserId = response.data.open_id;
        logger.info({ botUserId: this.botUserId }, 'Fetched Feishu bot info');
      }
    } catch (err) {
      logger.warn({ err }, 'Failed to fetch bot info');
    }
  }
}
