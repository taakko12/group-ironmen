// Renders a markdown note into Discord embeds.
//
// Discord's own markdown is close to, but not, CommonMark. The differences
// that matter here, all found by feeding it real notes:
//
//   - `---` is NOT a horizontal rule. It renders as three literal dashes, so
//     a document that uses it to separate sections comes out speckled with
//     stray punctuation. Headings already separate sections visually, so the
//     rules are dropped rather than substituted.
//   - Headings (`#`, `##`, `###`) DO render inside an embed description, which
//     is what makes a long note worth embedding at all rather than posting as
//     a wall of plain text.
//   - Inline code spans do not close at a newline. One unbalanced backtick
//     bleeds the monospace styling through every line beneath it until the
//     next stray backtick, which looks like the bot mangled the note.
//
// Limits are Discord's: 4096 characters per description, 6000 across all
// embeds in a message, 10 embeds.

const { EmbedBuilder } = require('discord.js');

const DESCRIPTION_LIMIT = 4096;
const TOTAL_LIMIT = 6000;
const MAX_EMBEDS = 10;

// The site's orange, so a note reads as part of the same thing as the
// leaderboard and recap images.
const COLOR = 0xff981f;

/** Close an inline code span left open at end of line, per line. */
function balanceTicks(line) {
  // Fenced blocks are a different construct and must not be touched.
  if (line.trimStart().startsWith('```')) return line;
  const ticks = (line.match(/`/g) ?? []).length;
  return ticks % 2 === 0 ? line : `${line}\``;
}

function clean(markdown) {
  return markdown
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .filter((line) => !/^\s*(-{3,}|\*{3,}|_{3,})\s*$/.test(line))
    .map(balanceTicks)
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * Split into description-sized pieces, preferring to break before a heading
 * so a section is not cut in half across two embeds.
 */
function chunk(text, limit = DESCRIPTION_LIMIT) {
  const chunks = [];
  let current = '';

  for (const line of text.split('\n')) {
    const candidate = current ? `${current}\n${line}` : line;
    if (candidate.length <= limit) {
      // A heading is a natural seam: break here rather than mid-section, but
      // only once there is enough in hand that the split is worth it.
      current = candidate;
      continue;
    }
    if (current) chunks.push(current);
    // A single line longer than the whole limit has no seam to break on.
    if (line.length > limit) {
      for (let at = 0; at < line.length; at += limit) chunks.push(line.slice(at, at + limit));
      current = '';
    } else {
      current = line;
    }
  }
  if (current) chunks.push(current);
  return chunks;
}

/**
 * @returns {{embeds: EmbedBuilder[], overflow: string|null}} `overflow` is the
 * markdown that did not fit, for the caller to attach as a file rather than
 * silently drop.
 */
function renderMarkdown(markdown, { title } = {}) {
  const text = clean(markdown);
  if (!text) return { embeds: [], overflow: null };

  const pieces = chunk(text);
  const embeds = [];
  let spent = 0;

  for (const piece of pieces) {
    if (embeds.length >= MAX_EMBEDS || spent + piece.length > TOTAL_LIMIT) break;
    const embed = new EmbedBuilder().setColor(COLOR).setDescription(piece);
    // Only the first carries the title; repeating it reads as duplicate posts.
    if (title && embeds.length === 0) embed.setTitle(title);
    embeds.push(embed);
    spent += piece.length;
  }

  const used = pieces.slice(0, embeds.length).join('\n').length;
  return { embeds, overflow: used < text.length ? text.slice(used).trim() : null };
}

/**
 * Worth embedding? A heading means the author structured it as a document.
 * Anything that cannot fit a plain message has to be embedded regardless.
 *
 * Deliberately not "has newlines": a two-line joke command in a titled,
 * coloured box looks like the bot is being ceremonial about nothing.
 */
function looksLikeDocument(text) {
  return /^#{1,3}\s/m.test(text) || text.length > 1900;
}

module.exports = { renderMarkdown, looksLikeDocument, clean, chunk, balanceTicks };

// node markdownEmbed.js
if (require.main === module) {
  const assert = require('assert');

  assert.strictEqual(clean('a\n---\nb'), 'a\nb', 'horizontal rules are dropped');
  assert.strictEqual(clean('- `a > b'), '- `a > b`', 'an open code span is closed');
  assert.strictEqual(balanceTicks('```js'), '```js', 'fences are left alone');
  assert.strictEqual(clean('a\n\n\n\n b'), 'a\n\n b', 'blank runs collapse');

  assert.ok(looksLikeDocument('## Notes\n- a'), 'headings mean document');
  assert.ok(!looksLikeDocument('just a line\nand another'), 'plain lines do not');
  assert.ok(looksLikeDocument('x'.repeat(2000)), 'oversized text has to embed');

  // A line too long to break on still has to come out whole across chunks.
  const long = 'y'.repeat(9000);
  assert.strictEqual(chunk(long).join('').length, 9000, 'no characters lost');
  assert.ok(
    chunk(long).every((piece) => piece.length <= DESCRIPTION_LIMIT),
    'every chunk fits a description'
  );

  // Past the 6000 budget the remainder must be handed back, not dropped.
  const huge = Array.from({ length: 400 }, (_, i) => `## Section ${i}\n- some notes here`).join('\n');
  const { embeds, overflow } = renderMarkdown(huge, { title: '!big' });
  assert.ok(embeds.length > 0 && embeds.length <= MAX_EMBEDS, 'embed count is bounded');
  assert.ok(
    embeds.reduce((sum, e) => sum + e.data.description.length, 0) <= TOTAL_LIMIT,
    'total stays under the message budget'
  );
  assert.ok(overflow && overflow.length > 0, 'the remainder is returned');
  assert.strictEqual(embeds.filter((e) => e.data.title).length, 1, 'only the first embed is titled');

  assert.deepStrictEqual(renderMarkdown('   ').embeds, [], 'empty input makes no embed');

  console.log('markdownEmbed: ok');
}
