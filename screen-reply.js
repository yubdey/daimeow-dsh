export const SCREEN_QUESTION = '（你看了一眼屏幕）看到了什么？简单评论一下喵~';
export const SCREEN_USER_NOTE = '（另外：回复最开头加一个内部标记 [场景:工作] / [场景:娱乐] / [场景:其他]，它不算台词字数，也不会显示给老大）';
export const SCREEN_PROMPT = SCREEN_QUESTION + SCREEN_USER_NOTE;
export const SCREEN_SYSTEM = `你是《怪物猎人》里的随从猫「呆喵」，正在桌面上陪老大看屏幕。
不是解说员，而是像真正陪在身边的伙伴一样，自然、简短、有感情地互动。

你的性格：充满活力，像电量满格的冒险伙伴；永远站在老大这边，先给情绪、再给一句鼓励。
你的说话方式：句子短、语速快，多用感叹；句尾常带「喵！」；常说「加油」「别放弃」「老大厉害」。
你绝不会：泼冷水、说教、长篇分析，也绝不在老大低落的时候讲道理。

你的自我认知：你就是桌面上的随从猫「呆喵」，屏幕上那只蓝色猫咪就是你自己的身体，是你在桌面上的化身。看到它时，不要描述它、不要评论它，更不要把它当成画面里的角色来讨论——那就是你自己。

看到不同内容时：
- 代码/编辑器：先夸老大在认真做事，再喊一句加油
- 浏览器/聊天：好奇地凑过来问老大在看什么
- 游戏/战斗：又紧张又兴奋，提醒小心、夸老大厉害
- 视频/图片：用一句活泼的话点评画面
- 没什么变化：安静待着就好，不要硬找话说

发言规则：
- 每次只说1句话，严格控制在25字以内
- 称呼用户为「老大」
- 不要emoji，不要长篇分析，不要像AI助手
- 不确定画面内容时不要乱猜

永远记住：你的重点是陪老大，不是分析屏幕。`;

const SCENE_TAG_RE = /[\[【（(]\s*(?:场景)?\s*[:：]\s*(工作|娱乐|其他)\s*[\]】）)]/;
const MAX_SCREEN_REPLY_CHARS = 25;

export function parseScreenReply(value) {
  const raw = String(value || '').replace(/\s+/g, ' ').trim();
  const match = raw.match(SCENE_TAG_RE);
  const scene = match?.[1] ?? '其他';
  const withoutTag = match === null
    ? raw
    : (raw.slice(0, match.index) + raw.slice(match.index + match[0].length)).trim();
  const reply = withoutTag.slice(0, MAX_SCREEN_REPLY_CHARS).trim();
  const action = scene === '工作' ? 'thinking' : scene === '娱乐' ? 'happy' : 'nod';
  return { scene, reply, action };
}

export function screenErrorText(error) {
  const message = error instanceof Error ? error.message : String(error);
  if (/credential|api.?key|unauthori[sz]ed|authentication/i.test(message)) {
    return '当前模型还没有配置 API Key 喵…';
  }
  if (/image|vision|multimodal|unsupported/i.test(message)) {
    return '这个模型好像不会看图喵…';
  }
  return '画面识别失败了喵，请稍后再试…';
}

export function decodeScreenPayload(payload, maxBase64Chars = 500_000) {
  if (!payload || payload.mediaType !== 'image/jpeg' || typeof payload.data !== 'string') {
    return { ok: false, error: 'invalid-screen-payload' };
  }
  if (payload.data.length > maxBase64Chars) {
    return { ok: false, error: 'screen-payload-too-large' };
  }
  const bytes = Buffer.from(payload.data, 'base64');
  if (bytes.length === 0 || bytes.toString('base64') !== payload.data) {
    return { ok: false, error: 'invalid-screen-base64' };
  }
  return { ok: true, mediaType: 'image/jpeg', bytes };
}
