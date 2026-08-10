/**
 * Unit Test Suite for Discord Markdown, Custom Emojis, Spoilers & Timestamps Engine
 */
const assert = require('assert');

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function parseDiscordMarkdown(text) {
  if (!text) return '';
  let escaped = escapeHtml(text);

  // 1. Multiline Code blocks: ```lang\ncode```
  escaped = escaped.replace(/```([a-zA-Z0-9_+-]*)\n([\s\S]*?)```/g, (match, lang, code) => {
    const displayLang = lang ? lang.toUpperCase() : 'CODE';
    return `<div class="codeblock-wrapper"><div class="codeblock-header"><span>${escapeHtml(displayLang)}</span><button class="btn-copy-code">Copy</button></div><pre><code>${code}</code></pre></div>`;
  });

  // 2. Inline Code: `code`
  escaped = escaped.replace(/`([^`]+)`/g, '<code>$1</code>');

  // 3. Auto-link URLs (run before injecting HTML tags with src/href)
  const urlRegex = /(https?:\/\/[^\s<"'>]+)/g;
  escaped = escaped.replace(urlRegex, '<a href="$1" target="_blank">$1</a>');

  // 4. Custom Animated & Static Discord Emojis: <:name:id> or <a:name:id>
  escaped = escaped.replace(/&lt;(a)?:([a-zA-Z0-9_]+):(\d+)&gt;/g, (match, isAnim, name, id) => {
    const ext = isAnim ? 'gif' : 'png';
    const url = `https://cdn.discordapp.com/emojis/${id}.${ext}?size=48&quality=lossless`;
    return `<img class="discord-custom-emoji" src="${url}" alt=":${name}:" title=":${name}:" />`;
  });

  // 5. Interactive Spoilers: ||text||
  escaped = escaped.replace(/\|\|([\s\S]+?)\|\|/g, '<span class="discord-spoiler">$1</span>');

  // 6. Discord Timestamps: <t:1700000000:R>, <t:1700000000:F>, etc.
  escaped = escaped.replace(/&lt;t:(\d+)(?::([tTdDfFR]))?&gt;/g, (match, ts, style) => {
    return `<span class="discord-timestamp-badge">${ts}</span>`;
  });

  // 7. Channel Mentions: <#channel_id>
  escaped = escaped.replace(/&lt;#(\d+)&gt;/g, '<span class="channel-mention-pill">#channel</span>');

  // 8. User Mentions: <@user_id> or <@!user_id>
  escaped = escaped.replace(/&lt;@!?(\d+)&gt;/g, '<span class="user-mention-pill">@$1</span>');

  // 9. Role Mentions: <@&role_id>
  escaped = escaped.replace(/&lt;@&amp;(\d+)&gt;/g, '<span class="role-mention-pill">@role</span>');

  // 10. Subtext: -# text
  escaped = escaped.replace(/^-#\s+(.+)$/gm, '<span class="discord-subtext">$1</span>');

  // 11. Formatting: Bold, Italic, Strikethrough, Underline
  escaped = escaped.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  escaped = escaped.replace(/\*([^*]+)\*/g, '<em>$1</em>');
  escaped = escaped.replace(/~~([^~]+)~~/g, '<s>$1</s>');
  escaped = escaped.replace(/__([^_]+)__/g, '<u>$1</u>');

  return escaped;
}

console.log('====================================================');
console.log('🧪 Running Discord Markdown Parser Unit Tests...');
console.log('====================================================\n');

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`  ✅ PASS: ${name}`);
    passed++;
  } catch (err) {
    console.error(`  ❌ FAIL: ${name} (${err.message})`);
    failed++;
  }
}

test('Parses static custom emoji <:pepe:1234567890>', () => {
  const result = parseDiscordMarkdown('Look <:pepe:1234567890>');
  assert(result.includes('<img class="discord-custom-emoji" src="https://cdn.discordapp.com/emojis/1234567890.png?size=48&quality=lossless" alt=":pepe:" title=":pepe:" />'));
});

test('Parses animated custom emoji <a:blobdance:9876543210>', () => {
  const result = parseDiscordMarkdown('Dance <a:blobdance:9876543210>');
  assert(result.includes('<img class="discord-custom-emoji" src="https://cdn.discordapp.com/emojis/9876543210.gif?size=48&quality=lossless" alt=":blobdance:" title=":blobdance:" />'));
});

test('Parses interactive spoiler ||secret message||', () => {
  const result = parseDiscordMarkdown('Spoiler: ||secret message||');
  assert(result.includes('<span class="discord-spoiler">secret message</span>'));
});

test('Parses Discord timestamps <t:1700000000:R>', () => {
  const result = parseDiscordMarkdown('Time: <t:1700000000:R>');
  assert(result.includes('<span class="discord-timestamp-badge">1700000000</span>'));
});

test('Parses user mention <@112233445566778899>', () => {
  const result = parseDiscordMarkdown('Hey <@112233445566778899>');
  assert(result.includes('<span class="user-mention-pill">@112233445566778899</span>'));
});

test('Parses channel mention <#100000000000000001>', () => {
  const result = parseDiscordMarkdown('Go to <#100000000000000001>');
  assert(result.includes('<span class="channel-mention-pill">#channel</span>'));
});

test('Parses formatting: bold, italic, strike, underline, subtext', () => {
  const result = parseDiscordMarkdown('**bold** *italic* ~~strike~~ __underline__\n-# subtext');
  assert(result.includes('<strong>bold</strong>'));
  assert(result.includes('<em>italic</em>'));
  assert(result.includes('<s>strike</s>'));
  assert(result.includes('<u>underline</u>'));
  assert(result.includes('<span class="discord-subtext">subtext</span>'));
});

test('Parses multiline code blocks with language badge', () => {
  const code = '```python\ndef hello():\n    return "world"\n```';
  const result = parseDiscordMarkdown(code);
  assert(result.includes('<div class="codeblock-wrapper">'));
  assert(result.includes('<span>PYTHON</span>'));
  assert(result.includes('def hello():'));
});

console.log('\n====================================================');
console.log(`📊 Parser Unit Test Results: ${passed} Passed, ${failed} Failed`);
console.log('====================================================\n');

if (failed > 0) process.exit(1);
