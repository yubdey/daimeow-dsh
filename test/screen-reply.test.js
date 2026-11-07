import assert from 'node:assert/strict';
import test from 'node:test';

import {
  decodeScreenPayload,
  parseScreenReply,
  screenErrorText,
} from '../screen-reply.js';

test('parses supported scene-tag variants', () => {
  assert.deepEqual(
    parseScreenReply('[场景:工作] 老大在认真写代码喵！'),
    { scene: '工作', reply: '老大在认真写代码喵！', action: 'thinking' },
  );
  assert.deepEqual(
    parseScreenReply('【场景：娱乐】这个视频好有趣喵！'),
    { scene: '娱乐', reply: '这个视频好有趣喵！', action: 'happy' },
  );
  assert.deepEqual(
    parseScreenReply('(场景：其他) 桌面很安静喵！'),
    { scene: '其他', reply: '桌面很安静喵！', action: 'nod' },
  );
});

test('defaults missing scene tags to other and strips whitespace', () => {
  assert.deepEqual(
    parseScreenReply('  老大  辛苦啦喵！  '),
    { scene: '其他', reply: '老大 辛苦啦喵！', action: 'nod' },
  );
});

test('hard limits every reply to 25 characters', () => {
  const parsed = parseScreenReply(`[场景:工作] ${'甲'.repeat(40)}`);
  assert.equal(parsed.reply.length, 25);
  assert.equal(parsed.reply, '甲'.repeat(25));
});

test('maps actionable screen errors without leaking raw details', () => {
  assert.equal(screenErrorText(new Error('missing API key')), '当前模型还没有配置 API Key 喵…');
  assert.equal(screenErrorText(new Error('unsupported image input')), '这个模型好像不会看图喵…');
  assert.equal(screenErrorText(new Error('socket reset')), '画面识别失败了喵，请稍后再试…');
});

test('validates screenshot media type, size and canonical base64', () => {
  const valid = Buffer.from('jpeg-bytes').toString('base64');
  assert.equal(decodeScreenPayload({ mediaType: 'image/jpeg', data: valid }).ok, true);
  assert.deepEqual(
    decodeScreenPayload({ mediaType: 'image/png', data: valid }),
    { ok: false, error: 'invalid-screen-payload' },
  );
  assert.deepEqual(
    decodeScreenPayload({ mediaType: 'image/jpeg', data: 'abc!!!' }),
    { ok: false, error: 'invalid-screen-base64' },
  );
  assert.deepEqual(
    decodeScreenPayload({ mediaType: 'image/jpeg', data: valid }, 4),
    { ok: false, error: 'screen-payload-too-large' },
  );
});
