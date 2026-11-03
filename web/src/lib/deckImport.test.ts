import assert from 'node:assert/strict';
import { test } from 'node:test';
import { IMPORT_LIST_EXAMPLE, parseDeckText } from './deckImport.ts';

test('accepts the published list formats and ignores names', () => {
  const parsed = parseDeckText(IMPORT_LIST_EXAMPLE);
  assert.equal(parsed.skipped.length, 0);
  assert.equal(parsed.cards.get('GD01-024'), 4 + 4 + 4 + 4 + 1);
  assert.equal(parsed.distinctCards, 1);
  assert.equal(parsed.totalCopies, 17);
});

test('reads a code that sits after the name', () => {
  const parsed = parseDeckText('4 - Launcher Strike Gundam - GD01-024');
  assert.deepEqual([...parsed.cards.entries()], [['GD01-024', 4]]);
  assert.equal(parsed.skipped.length, 0);
});

test('keeps the real code when the name contains a model number', () => {
  const parsed = parseDeckText('2 EB01-054 Gaplant TR-5 "Hrairoo" Unit 1');
  assert.deepEqual([...parsed.cards.entries()], [['EB01-054', 2]]);
});

test('parses a named export line by line', () => {
  const text = `2 GD04-016 Zoloat (League Militaire)
2 EB01-054 Gaplant TR-5 "Hrairoo" Unit 1
4 GD01-086 Gundam Lfrith
2 GD05-010 Kira's Strike Rouge
3 GD01-073 Sword Strike Gundam
2 GD01-068 Perfect Strike Gundam
4 GD04-068 Silver Bullet
3 ST04-001 Aile Strike Gundam
3 GD01-066 Justice Gundam
4 GD05-002 Strike Freedom Gundam
3 ST01-010 Amuro Ray
4 ST04-010 Kira Yamato
3 GD05-081 Kira Yamato
4 GD01-118 Overflowing Affection
1 ST01-014 Unforeseen Incident
2 GD01-100 A Show of Resolve
2 GD02-129 Argama
2 ST11-016 Mad Angler`;
  const parsed = parseDeckText(text);
  assert.equal(parsed.skipped.length, 0);
  assert.equal(parsed.distinctCards, 18);
  assert.equal(parsed.totalCopies, 50);
  assert.equal(parsed.cards.get('GD04-016'), 2);
  assert.equal(parsed.cards.get('ST11-016'), 2);
  assert.equal(parsed.cards.get('ST01-014'), 1);
});

test('still accepts bracketed codes and exburst lines', () => {
  const parsed = parseDeckText('2 Guntank [GD01-008]\n4 x ST04-008\n// comment\n\nSideboard');
  assert.equal(parsed.cards.get('GD01-008'), 2);
  assert.equal(parsed.cards.get('ST04-008'), 4);
  assert.equal(parsed.skipped.length, 1);
  assert.equal(parsed.skipped[0]?.raw, 'Sideboard');
});
