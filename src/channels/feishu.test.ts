import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';

// Mock config
vi.mock('../config.js', () => ({
  ASSISTANT_NAME: 'Andy',
  TRIGGER_PATTERN: /^@Andy\b/i,
}));

// Mock logger
vi.mock('../logger.js', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

// Mock @larksuiteoapi/node-sdk
const mockClient = {
  im: {
    v1: {
      message: {
        create: vi.fn().mockResolvedValue({ code: 0 }),
      },
      image: {
        create: vi.fn().mockResolvedValue({
          code: 0,
          data: {
            image_key: 'img_v2_abc123def456',
          },
        }),
      },
    },
  },
  bot: {
    botInfo: {
      get: vi.fn().mockResolvedValue({
        data: { open_id: 'bot_open_id_123' },
      }),
    },
  },
};

const mockWSClient = {
  start: vi.fn().mockResolvedValue(undefined),
  stop: vi.fn().mockResolvedValue(undefined),
};

const mockEventDispatcher = {
  register: vi.fn().mockReturnThis(),
};

vi.mock('@larksuiteoapi/node-sdk', () => ({
  Client: vi.fn(() => mockClient),
  WSClient: vi.fn(() => mockWSClient),
  EventDispatcher: vi.fn(() => mockEventDispatcher),
  LoggerLevel: {
    DEBUG: 'debug',
    INFO: 'info',
    WARN: 'warn',
    ERROR: 'error',
  },
}));

import { FeishuChannel, FeishuChannelOpts } from './feishu.js';

// Test helpers
function createTestOpts(
  overrides?: Partial<FeishuChannelOpts>,
): FeishuChannelOpts {
  return {
    onMessage: vi.fn(),
    onChatMetadata: vi.fn(),
    registeredGroups: vi.fn(() => ({
      'feishu:oc_1234567890abcdef': {
        name: 'Test Chat',
        folder: 'test-chat',
        trigger: '@Andy',
        added_at: '2024-01-01T00:00:00.000Z',
      },
    })),
    ...overrides,
  };
}

describe('FeishuChannel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // --- Connection lifecycle ---

  describe('connection lifecycle', () => {
    it('resolves connect() when WebSocket is ready', async () => {
      const opts = createTestOpts();
      const channel = new FeishuChannel(
        { appId: 'test_app_id', appSecret: 'test_app_secret' },
        opts,
      );

      await channel.connect();

      expect(channel.isConnected()).toBe(true);
      expect(mockWSClient.start).toHaveBeenCalled();
    });

    it('fetches bot info after connection', async () => {
      const opts = createTestOpts();
      const channel = new FeishuChannel(
        { appId: 'test_app_id', appSecret: 'test_app_secret' },
        opts,
      );

      await channel.connect();

      expect(mockClient.bot.botInfo.get).toHaveBeenCalled();
    });

    it('disconnects cleanly', async () => {
      const opts = createTestOpts();
      const channel = new FeishuChannel(
        { appId: 'test_app_id', appSecret: 'test_app_secret' },
        opts,
      );

      await channel.connect();
      expect(channel.isConnected()).toBe(true);

      await channel.disconnect();
      expect(channel.isConnected()).toBe(false);
      expect(mockWSClient.stop).toHaveBeenCalled();
    });

    it('isConnected() returns false before connect', () => {
      const opts = createTestOpts();
      const channel = new FeishuChannel(
        { appId: 'test_app_id', appSecret: 'test_app_secret' },
        opts,
      );

      expect(channel.isConnected()).toBe(false);
    });
  });

  // --- JID ownership ---

  describe('ownsJid', () => {
    it('owns feishu: JIDs', () => {
      const opts = createTestOpts();
      const channel = new FeishuChannel(
        { appId: 'test_app_id', appSecret: 'test_app_secret' },
        opts,
      );

      expect(channel.ownsJid('feishu:oc_1234')).toBe(true);
    });

    it('does not own Discord JIDs', () => {
      const opts = createTestOpts();
      const channel = new FeishuChannel(
        { appId: 'test_app_id', appSecret: 'test_app_secret' },
        opts,
      );

      expect(channel.ownsJid('dc:1234567890')).toBe(false);
    });

    it('does not own WhatsApp JIDs', () => {
      const opts = createTestOpts();
      const channel = new FeishuChannel(
        { appId: 'test_app_id', appSecret: 'test_app_secret' },
        opts,
      );

      expect(channel.ownsJid('86138xxxx@s.whatsapp.net')).toBe(false);
    });
  });

  // --- Channel properties ---

  describe('channel properties', () => {
    it('has name "feishu"', () => {
      const opts = createTestOpts();
      const channel = new FeishuChannel(
        { appId: 'test_app_id', appSecret: 'test_app_secret' },
        opts,
      );

      expect(channel.name).toBe('feishu');
    });
  });

  // --- sendMessage (basic tests) ---

  describe('sendMessage', () => {
    it('does nothing when not connected', async () => {
      const opts = createTestOpts();
      const channel = new FeishuChannel(
        { appId: 'test_app_id', appSecret: 'test_app_secret' },
        opts,
      );

      // Don't connect
      await channel.sendMessage('feishu:oc_123', 'Hello');

      // No error should be thrown
      expect(mockClient.im.v1.message.create).not.toHaveBeenCalled();
    });
  });

  // --- sendImage (image sending tests) ---

  describe('sendImage', () => {
    it('uploads and sends image when connected', async () => {
      const opts = createTestOpts();
      const channel = new FeishuChannel(
        { appId: 'test_app_id', appSecret: 'test_app_secret' },
        opts,
      );

      await channel.connect();

      const imageBuffer = Buffer.from('fake-image-data');
      await channel.sendImage('feishu:oc_123', imageBuffer);

      // Verify image upload was called
      expect(mockClient.im.v1.image.create).toHaveBeenCalledWith({
        data: {
          image_type: 'message',
        },
        file: imageBuffer,
      });

      // Verify message creation was called with image_key
      expect(mockClient.im.v1.message.create).toHaveBeenCalledWith({
        params: {
          receive_id_type: 'chat_id',
        },
        data: {
          receive_id: 'oc_123',
          msg_type: 'image',
          content: JSON.stringify({ image_key: 'img_v2_abc123def456' }),
        },
      });
    });

    it('does nothing when not connected', async () => {
      const opts = createTestOpts();
      const channel = new FeishuChannel(
        { appId: 'test_app_id', appSecret: 'test_app_secret' },
        opts,
      );

      // Don't connect
      const imageBuffer = Buffer.from('fake-image-data');
      await channel.sendImage('feishu:oc_123', imageBuffer);

      // No error should be thrown, no API calls made
      expect(mockClient.im.v1.image.create).not.toHaveBeenCalled();
      expect(mockClient.im.v1.message.create).not.toHaveBeenCalled();
    });
  });
});
