const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { buildArgs, encode } = require('../src/encoder.cjs');
const ffmpeg = process.env.FFMPEG_PATH || 'ffmpeg';
const ffprobe = process.env.FFPROBE_PATH || 'ffprobe';
test('real video encoding, audio tracks, and existing-file protection', async t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'frameforge-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const input = path.join(dir, 'input with spaces.mp4');
  execFileSync(ffmpeg, ['-v', 'error', '-f', 'lavfi', '-i', 'testsrc2=size=320x240:rate=15', '-f', 'lavfi', '-i', 'sine=frequency=440', '-f', 'lavfi', '-i', 'sine=frequency=880', '-map', '0:v', '-map', '1:a', '-map', '2:a', '-t', '1', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', input]);
  for (const codec of ['h264', 'h265']) {
    const output = path.join(dir, `${codec}.mp4`);
    let progress = false;
    await encode(ffmpeg, { input, output, preset: 'balanced', codec }, () => { progress = true; }).done;
    const probe = JSON.parse(execFileSync(ffprobe, ['-v', 'error', '-show_streams', '-show_format', '-of', 'json', output], { encoding: 'utf8' }));
    assert.equal(probe.streams[0].codec_name, codec === 'h264' ? 'h264' : 'hevc');
    assert.equal(probe.streams.filter(s => s.codec_name === 'aac').length, 2);
    assert.equal(probe.streams[0].width, 320);
    assert.ok(Number(probe.format.duration) >= 1);
    assert.ok(progress);
    const before = fs.readFileSync(output);
    assert.throws(() => encode(ffmpeg, { input, output, preset: 'balanced', codec }), /finns redan/);
    assert.deepEqual(fs.readFileSync(output), before);
  }
});
test('reject invalid settings and same-file conversion', () => {
  assert.throws(() => buildArgs({ input: 'a.mp4', output: 'a.mp4', preset: 'balanced', codec: 'h264' }), /separata/);
  assert.throws(() => buildArgs({ input: 'a', output: 'b', preset: 'unknown', codec: 'h264' }), /förinställning/);
  assert.throws(() => buildArgs({ input: 'a', output: 'b', preset: 'balanced', codec: 'other' }), /videokodare/);
});
test('missing FFmpeg returns an actionable error', async () => {
  const process = encode('nonexistent-frameforge-ffmpeg', { input: 'a', output: path.join(os.tmpdir(), `absent-${Date.now()}.mp4`), preset: 'compact', codec: 'h264' });
  await assert.rejects(process.done, /FFmpeg hittades inte/);
});
test('encoding can be cancelled', async t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'frameforge-cancel-'));
  t.after(() => fs.rmSync(dir, { force: true, recursive: true }));
  const input = path.join(dir, 'input.mp4');
  execFileSync(ffmpeg, ['-v', 'error', '-f', 'lavfi', '-i', 'testsrc2=size=640x360:rate=30', '-t', '2', '-c:v', 'libx264', input]);
  const process = encode(ffmpeg, { input, output: path.join(dir, 'output.mp4'), preset: 'quality', codec: 'h265' });
  const rejection = assert.rejects(process.done);
  process.child.kill();
  await rejection;
});
