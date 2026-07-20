import { describe, expect, it } from 'vitest';
import { renderInlineMarkdown } from '../core/inline-agent/markdown';

describe('renderInlineMarkdown', () => {
  it('does not create anchors for unsafe protocols', () => {
    const html = renderInlineMarkdown('[run](javascript:alert(1))');

    expect(html).not.toContain('<a ');
    expect(html).toContain('run');
  });

  it('escapes safe href attributes', () => {
    const html = renderInlineMarkdown('[docs](https://example.com/?q=a&b=c)');

    expect(html).toContain('<a href="https://example.com/?q=a&amp;b=c"');
    expect(html).toContain('rel="noopener noreferrer"');
  });

  it('renders markdown tables before newline conversion', () => {
    const html = renderInlineMarkdown([
      '| Metric | Value |',
      '| --- | --- |',
      '| **Average price** | About **47k** CNY/sqm |',
    ].join('\n'));

    expect(html).toContain('<table>');
    expect(html).toContain('<th>Metric</th>');
    expect(html).toContain('<td><strong>Average price</strong></td>');
    expect(html).toContain('<td>About <strong>47k</strong> CNY/sqm</td>');
    expect(html).not.toContain('| --- |');
  });

  it('does not parse markdown tables inside fenced code blocks', () => {
    const html = renderInlineMarkdown([
      '```',
      '| a | b |',
      '| --- | --- |',
      '```',
    ].join('\n'));

    expect(html).toContain('<pre><code>| a | b |');
    expect(html).not.toContain('<table>');
  });
});
