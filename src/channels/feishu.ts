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
      this.httpClient = new (lark as any).Client({
        appId: this.appId,
        appSecret: this.appSecret,
      });

      // 2. Fetch bot info
      // await this.fetchBotInfo(); // Skip for now due to SDK typing issues

      // 3. Create WebSocket client for receiving events
      this.wsClient = new (lark as any).WSClient({
        appId: this.appId,
        appSecret: this.appSecret,
      });

      // 4. Start WebSocket connection with event handler
      // 使用 register 方法注册事件处理器
      const eventDispatcher = new (lark as any).EventDispatcher({
        useVerificationToken: false,  // 使用长连接模式不需要验证 token
      });

      // 注册消息接收事件处理器 - 使用 register 方法
      eventDispatcher.register({
        'im.message.receive_v1': async (data: any) => {
          logger.info('Received im.message.receive_v1 event');
          await this.handleMessageEvent(data);
        },
      });

      await (this.wsClient as any).start({
        eventDispatcher,
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
        await (this.wsClient as any).stop();
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
    data: any,
  ): Promise<void> {
    // 根据 Python 代码和官方 sample，消息数据在 data.event 中
    // 数据结构: data.event.message, data.event.sender
    const eventData = data.event || data;
    // 注意：message 和 sender 在 eventData.event 下，不是直接在 eventData 下
    const { message, sender } = eventData.event || eventData;

    logger.info('Received Feishu message event');
    logger.info(`DEBUG: data.event = ${JSON.stringify(data?.event, null, 2)?.substring(0, 500)}`);

    if (!message || !sender) {
      logger.warn('Missing message or sender in event');
      logger.warn(`Full data: ${JSON.stringify(data, null, 2)?.substring(0, 2000)}`);
      logger.warn(`Event data keys: ${Object.keys(eventData || {}).join(', ')}`);
      return;
    }

    const chatId = message.chat_id;
    // 飞书新版API可能返回null的user_id，使用open_id作为备用
    const userId = sender.sender_id?.user_id || sender.sender_id?.open_id;

    logger.info({ chatId, userId }, 'Parsed Feishu message');

    if (!chatId || !userId) {
      logger.warn('Missing chat_id or user_id');
      logger.warn(`Message: ${JSON.stringify(message)}`);
      logger.warn(`Sender: ${JSON.stringify(sender)}`);
      return;
    }

    // Build JID
    const chatJid = `feishu:${chatId}`;
    logger.info(`DEBUG: Built chatJid = ${chatJid}`);

    const timestamp = new Date(parseInt(message.create_time || '0')).toISOString();

    // Parse message content
    let content = '';
    logger.info(`DEBUG: message.message_type = ${message.message_type}, has content = ${!!message.content}`);
    if (message.message_type === 'text' && message.content) {
      try {
        const contentObj = JSON.parse(message.content);
        content = contentObj.text || '';
        logger.info(`DEBUG: Parsed content = "${content}"`);
      } catch (e) {
        content = message.content;
        logger.info(`DEBUG: Failed to parse JSON, using raw content`);
      }
    } else {
      logger.info(`DEBUG: Skipping content parsing - not text message or no content`);
    }

    // Check if bot was mentioned
    const mentions = message.mentions || [];
    const isBotMentioned = this.botUserId
      ? mentions.some((m: any) => m.id?.user_id === this.botUserId)
      : false;
    logger.info(`DEBUG: isBotMentioned = ${isBotMentioned}`);

    if (isBotMentioned) {
      // Remove @bot text
      content = content.replace(/@\S+/g, '').trim();

      // Add trigger if not present
      if (!TRIGGER_PATTERN.test(content)) {
        content = `@${ASSISTANT_NAME} ${content}`;
      }
    }

    logger.info(`DEBUG: Final content = "${content}"`);

    // Store chat metadata
    this.opts.onChatMetadata(chatJid, timestamp, `User ${userId}`, 'feishu', false);

    // Check if registered
    logger.info(`DEBUG: Checking if chat ${chatJid} is registered`);
    const groups = this.opts.registeredGroups();
    logger.info(`DEBUG: Available groups: ${Object.keys(groups).join(', ') || '(none)'}`);
    const group = groups[chatJid];
    if (!group) {
      logger.warn({ chatJid }, 'Message from unregistered Feishu chat - IGNORING');
      return;
    }
    logger.info(`DEBUG: Group found, proceeding with message delivery`);

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
    // Temporarily disabled due to SDK typing issues
    // This method can be implemented when the SDK types are properly available
    logger.debug('fetchBotInfo skipped - SDK typing issues');
  }
}
