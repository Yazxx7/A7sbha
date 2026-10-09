import test from 'node:test';
import assert from 'node:assert/strict';
import { localPhotoAnalyzer } from './analysis';

test('local photo adapter honestly reports unavailable and creates no nutrition claims', async () => {
  const result = await localPhotoAnalyzer.analyze({ file: new File(['image placeholder'], 'food.jpg', { type: 'image/jpeg' }) });
  assert.equal(result.status, 'unavailable');
  assert.ok(result.message.includes('not enabled'));
  assert.equal('foods' in result, false);
  const arabic = await localPhotoAnalyzer.analyze({ file: new File([], 'food.jpg'), locale: 'ar' });
  assert.ok(arabic.message.includes('غير مفعّل'));
});
