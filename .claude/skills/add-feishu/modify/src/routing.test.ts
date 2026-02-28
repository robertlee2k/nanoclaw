import { describe, it, expect } from 'vitest';
import { findChannel } from '../router.js';
import { Channel } from '../types.js';

// Mock channels for testing
const createMockChannel = (name: string, ownsJidImpl: (jid: string) => boolean): Channel => ({
  name,
  connect: async () => {},
  sendMessage: async () => {},
  isConnected: () => true,
  ownsJid: ownsJidImpl,
  disconnect: async () => {},
});

describe('findChannel', () => {
  it('finds Feishu channel for feishu: JIDs', () => {
    const feishuChannel = createMockChannel('feishu', (jid) => jid.startsWith('feishu:'));
    const whatsappChannel = createMockChannel('whatsapp', (jid) => jid.endsWith('@s.whatsapp.net'));

    const channels = [whatsappChannel, feishuChannel];
    const found = findChannel(channels, 'feishu:oc_1234567890abcdef');

    expect(found).toBe(feishuChannel);
  });

  it('returns undefined for unknown JID format', () => {
    const feishuChannel = createMockChannel('feishu', (jid) => jid.startsWith('feishu:'));
    const whatsappChannel = createMockChannel('whatsapp', (jid) => jid.endsWith('@s.whatsapp.net'));

    const channels = [whatsappChannel, feishuChannel];
    const found = findChannel(channels, 'unknown:12345');

    expect(found).toBeUndefined();
  });

  it('finds the first matching channel', () => {
    const feishuChannel1 = createMockChannel('feishu', (jid) => jid.startsWith('feishu:'));
    const feishuChannel2 = createMockChannel('feishu2', (jid) => jid.startsWith('feishu:'));

    const channels = [feishuChannel1, feishuChannel2];
    const found = findChannel(channels, 'feishu:oc_123');

    expect(found).toBe(feishuChannel1);
  });
});
