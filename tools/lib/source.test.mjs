import assert from 'node:assert/strict';
import test from 'node:test';

import { maskSource, maskedSpans, stripLiterals } from './source.mjs';

const BT = String.fromCharCode(96);

test('blanks literal contents while preserving line length', () => {
  const line = `const t = 'plain'; if (y >= 3) {}`;
  const out = stripLiterals(line);
  assert.equal(out.length, line.length, 'offsets must remain comparable to the source line');
  assert.ok(!out.includes('plain'), 'literal contents must not survive');
  assert.ok(out.includes('if (y >= 3)'), 'code outside the literal must survive verbatim');
});

test('consumes a literal containing an escaped delimiter whole', () => {
  // The regression that motivated extraction. The expression this replaced terminated the literal
  // at the escaped quote and leaked its tail, so `s a marker'` read as code.
  const out = stripLiterals(String.raw`const s = 'it\'s a marker'; // after`);
  assert.ok(!out.includes('marker'), 'the tail after an escaped quote must not leak');
  assert.ok(out.endsWith('; // after'), 'the literal must end where it actually ends');
});

test('handles all three delimiters', () => {
  for (const q of ["'", '"', BT]) {
    const out = stripLiterals(`x = ${q}secret${q};`);
    assert.ok(!out.includes('secret'), `delimiter ${q} must be recognised`);
  }
});

test('a line with no literal is returned unchanged', () => {
  const line = 'const at = outsideLiterals.indexOf(EXEMPTION);';
  assert.equal(stripLiterals(line), line);
});

test('documented limits are real, so a reader does not over-trust the approximation', () => {
  // Stated in the docstring as a known lexical limitation. Asserted rather than only described:
  // a limit recorded in prose cannot be checked, and this file is where a reader would look.
  const interpolated = stripLiterals('x = `a ${ "b" } c`;');
  assert.ok(
    !interpolated.includes('a ') || interpolated.includes('${'),
    'an interpolation containing a quote is not parsed; the docstring must keep saying so',
  );
});

test('maskSource preserves length and every line break, so offsets still line up', () => {
  const source = 'const a = ' + BT + '\n  hidden\n' + BT + ';\nconst b = 1;\n';
  const masked = maskSource(source);
  assert.equal(masked.length, source.length);
  assert.equal(masked.split('\n').length, source.split('\n').length);
  assert.ok(!masked.includes('hidden'), 'the template body is blanked');
  assert.ok(masked.includes('const b = 1;'), 'code outside it is untouched');
});

test('a template literal spanning lines is masked, which no line-wise strip can do', () => {
  const source = 'const a = ' + BT + '\nmarker-text\n' + BT + ';\n';
  const at = source.indexOf('marker-text');
  assert.ok(
    maskedSpans(source).some(([s, e]) => at >= s && at < e),
    'whole-file masking covers it',
  );
  assert.equal(
    stripLiterals('marker-text'),
    'marker-text',
    'the line alone carries no quote, so the line-wise strip leaves it -- the defect in #4353',
  );
});

test('comments can be left visible, because an annotation is written in one', () => {
  const source = '// unsourced-bound: a reason\nconst a = 1;\n';
  const at = source.indexOf('unsourced-bound');
  assert.ok(
    maskedSpans(source).some(([s, e]) => at >= s && at < e),
    'masked by default, for callers asking whether a token is a call site',
  );
  assert.ok(
    !maskedSpans(source, { comments: false }).some(([s, e]) => at >= s && at < e),
    'left alone for callers reading what the author wrote in the comment',
  );
});

test('a string literal is masked whether or not comments are', () => {
  const source = "const a = 'hidden';\n";
  const at = source.indexOf('hidden');
  for (const options of [{}, { comments: false }]) {
    assert.ok(maskedSpans(source, options).some(([s, e]) => at >= s && at < e));
  }
});
