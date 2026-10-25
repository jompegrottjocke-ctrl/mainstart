const { spawn } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');
const { presets, settingsFor } = require('./formats.js');
function buildArgs(job) {
  const settings = settingsFor(job);
  const { preset, codec, container, crf, speed, rateControl, videoKbps } = settings;
  if (!job.input || !job.output || path.resolve(job.input) === path.resolve(job.output)) throw new Error('Välj separata in- och utdatafiler.');
  const video = ['-c:v', codec.encoder, codec.speedFlag, speed];
  if (codec.encoder === 'libvpx-vp9') video.push('-deadline', 'good');
  if (rateControl === 'crf') {
    video.push('-crf', String(crf));
    if (codec.encoder === 'libvpx-vp9') video.push('-b:v', '0');
  } else video.push('-b:v', `${videoKbps}k`);
  if (codec.encoder === 'libx265' && ['mp4', 'mov'].includes(settings.containerId)) video.push('-tag:v', 'hvc1');
  return ['-hide_banner', '-nostdin', '-n', '-i', job.input,
    '-map', '0:v:0', '-map', '0:a?', '-sn', '-map_chapters', '-1', ...video,
    '-vf', `scale=w='min(${preset.width},iw)':h='min(${preset.height},ih)':force_original_aspect_ratio=decrease:force_divisible_by=2`,
    '-pix_fmt', 'yuv420p', '-c:a', container.audio, '-b:a', `${container.audioKbps}k`,
    ...(['mp4', 'mov'].includes(settings.containerId) ? ['-movflags', '+faststart'] : []),
    '-f', container.muxer, '-progress', 'pipe:1', '-nostats', job.output];
}
function encode(binary, job, onProgress = () => {}) {
  const args = buildArgs(job);
  if (fs.existsSync(job.output)) throw new Error('Utdatafilen finns redan. Välj ett annat namn.');
  const child = spawn(binary, args, { windowsHide: true });
  let stderr = '', pending = '', settled = false;
  const done = new Promise((resolve, reject) => {
    child.stdout.on('data', chunk => {
      pending += chunk.toString();
      const lines = pending.split(/\r?\n/); pending = lines.pop();
      for (const line of lines) {
        const [key, value] = line.split('=');
        if (key === 'out_time_us') onProgress({ seconds: Number(value) / 1e6 });
        if (key === 'speed') onProgress({ speed: value });
      }
    });
    child.stderr.on('data', chunk => { stderr = (stderr + chunk).slice(-6000); });
    child.on('error', error => { settled = true; reject(new Error(error.code === 'ENOENT' ? 'FFmpeg hittades inte. Välj ffmpeg.exe i inställningarna.' : error.message)); });
    child.on('close', code => {
      if (settled) return;
      if (code === 0) resolve();
      else reject(new Error(stderr.trim() || 'Konverteringen avbröts.'));
    });
  });
  return { child, done };
}
module.exports = { presets, buildArgs, encode };
