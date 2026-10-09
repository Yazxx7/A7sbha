import test from 'node:test';
import assert from 'node:assert/strict';
import { dateKey, formatDate, isDateKey, shiftDate } from './dates';

test('calendar keys use local fields and move across months and leap days', () => {
  assert.equal(dateKey(new Date(2026, 9, 9, 23, 59)), '2026-10-09');
  assert.equal(shiftDate('2024-03-01', -1), '2024-02-29');
  assert.equal(shiftDate('2026-12-31', 1), '2027-01-01');
});

test('invalid calendar dates and offsets are rejected', () => {
  assert.equal(isDateKey('2026-02-29'), false);
  assert.equal(isDateKey('2026-02-31'), false);
  assert.equal(isDateKey('2026-2-03'), false);
  assert.equal(isDateKey('__proto__'), false);
  assert.throws(() => shiftDate('2026-02-31', 1));
  assert.throws(() => shiftDate('2026-10-09', NaN));
  assert.throws(() => dateKey(new Date(NaN)));
});

test('date formatting supports English and Arabic without UTC conversion', () => {
  assert.ok(formatDate('2026-10-09', 'en').includes('Oct'));
  assert.ok(formatDate('2026-10-09', 'ar').length > 0);
});
