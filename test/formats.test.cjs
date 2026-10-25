const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { codecs, containers, settingsFor } = require('../src/formats.js');
const { buildArgs, encode } = require('../src/encoder.cjs');
const { sv, en, translate, message } = require('../src/i18n.js');
const ffmpeg = process.env.FFMPEG_PATH || 'ffmpeg';
const ffprobe = process.env.FFPROBE_PATH || 'ffprobe';
test('all offered codec/container pairs produce playable audio and video in both rate modes', async t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'frameforge-formats-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const input = path.join(dir, 'source.mp4');
  execFileSync(ffmpeg, ['-v', 'error', '-f', 'lavfi', '-i', 'testsrc2=size=160x90:rate=10', '-f', 'lavfi', '-i', 'sine=frequency=440', '-t', '0.4', '-c:v', 'libx264', '-c:a', 'aac', input]);
  for (const [codec, definition] of Object.entries(codecs)) {
    for (const container of definition.containers) {
      for (const rateControl of ['crf', 'bitrate']) {
        await t.test(`${codec} / ${container} / ${rateControl}`, async () => {
          const output = path.join(dir, `${codec}-${container}-${rateControl}.${containers[container].extension}`);
          const job = { input, output, codec, container, preset: 'compact', rateControl, videoKbps: 500 };
          const settings = settingsFor(job), args = buildArgs(job);
          assert.equal(args[args.indexOf('-c:v') + 1], settings.codec.encoder);
          if (rateControl === 'crf') assert.equal(args[args.indexOf('-crf') + 1], String(settings.crf));
          else { assert.equal(args.includes('-crf'), false); assert.equal(args[args.indexOf('-b:v') + 1], '500k'); }
          await encode(ffmpeg, job).done;
          const probe = JSON.parse(execFileSync(ffprobe, ['-v', 'error', '-show_streams', '-show_format', '-of', 'json', output], { encoding: 'utf8' }));
          assert.equal(probe.streams[0].codec_name, { h264: 'h264', h265: 'hevc', av1: 'av1', vp9: 'vp9' }[codec]);
          assert.equal(probe.streams[1].codec_name, container === 'webm' ? 'opus' : 'aac');
          assert.equal(probe.streams[0].width, 160);
          assert.equal(probe.streams[0].height, 90);
          assert.ok(Number(probe.format.duration) >= 0.3);
          execFileSync(ffmpeg, ['-v', 'error', '-i', output, '-f', 'null', '-']);
        });
      }
    }
  }
});
test('portrait input fits the documented maximum height', async t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'frameforge-portrait-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const input = path.join(dir, 'portrait.mp4'), output = path.join(dir, 'scaled.mp4');
  execFileSync(ffmpeg, ['-v', 'error', '-f', 'lavfi', '-i', 'testsrc2=size=720x1280:rate=1', '-t', '1', '-c:v', 'libx264', input]);
  await encode(ffmpeg, { input, output, preset: 'compact', codec: 'h264', container: 'mp4' }).done;
  const probe = JSON.parse(execFileSync(ffprobe, ['-v', 'error', '-show_streams', '-of', 'json', output], { encoding: 'utf8' }));
  assert.ok(probe.streams[0].width <= 1280);
  assert.equal(probe.streams[0].height, 720);
});
test('invalid combinations, bitrate values and prototype keys are rejected', () => {
  const base = { preset: 'balanced', codec: 'h264', container: 'mp4' };
  for (const combo of [{ codec: 'h264', container: 'webm' }, { codec: 'vp9', container: 'mp4' }, { codec: 'av1', container: 'mov' }]) assert.throws(() => settingsFor({ ...base, ...combo }), /kan inte användas/);
  for (const value of [0, 99, 200001, NaN, Infinity, 4000.5, '4000']) assert.throws(() => settingsFor({ ...base, rateControl: 'bitrate', videoKbps: value }), /Videobitrate/);
  for (const field of ['codec', 'container', 'preset']) assert.throws(() => settingsFor({ ...base, [field]: '__proto__' }));
});
test('Swedish and English cover the same UI; interpolation and backend errors translate', () => {
  assert.deepEqual(Object.keys(en).sort(), Object.keys(sv).sort());
  const html = fs.readFileSync(path.join(__dirname, '../src/index.html'), 'utf8');
  for (const [, key] of html.matchAll(/data-i18n="([^"]+)"/g)) assert.ok(Object.hasOwn(sv, key), key);
  assert.equal(translate('target', 'en', { value: 4000 }), '4000 kbit/s target');
  assert.equal(translate('target', 'sv', { value: 4000 }), '4000 kbit/s mål');
  assert.equal(message("Error invoking remote method 'download-ffmpeg': Error: Laddar ned FFmpeg · 50 %", 'en'), 'Downloading FFmpeg · 50 %');
});
