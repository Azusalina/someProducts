import test from 'node:test';
import assert from 'node:assert/strict';
import { photoLayout } from '../public/photo-pdf.js';
test('photo layout fits portrait and landscape images without cropping or distortion', () => {
  for (const paper of ['A4', 'Letter']) for (const [w, h] of [[1200, 800], [800, 1200], [100, 100]]) {
    const p = photoLayout(w, h, paper);
    assert.ok(p.x >= 34 && p.y >= 34);
    assert.ok(p.x + p.imageWidth <= p.width - 34);
    assert.ok(p.y + p.imageHeight <= p.height - 34);
    assert.ok(Math.abs(p.imageWidth / p.imageHeight - w / h) < 1e-10);
    assert.equal(p.width > p.height, w > h);
  }
  assert.deepEqual(photoLayout(400, 200, 'photo'), {width:300,height:150,x:0,y:0,imageWidth:300,imageHeight:150});
  assert.throws(() => photoLayout(0, 200, 'A4'));
  assert.throws(() => photoLayout(100, 200, 'other'));
});
