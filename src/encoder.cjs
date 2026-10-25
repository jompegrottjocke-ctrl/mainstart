const { spawn } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');
const presets = {
  balanced: { label: 'Balanserad', crf: 22, speed: 'medium', width: 1920 },
  quality: { label: 'Hög kvalitet', crf: 18, speed: 'slow', width: 3840 },
  compact: { label: 'Liten fil', crf: 28, speed: 'medium', width: 1280 },
};
function buildArgs(job) {
  const preset = presets[job.preset];
  if (!preset) throw new Error('Okänd förinställning.');
  if (!['h264', 'h265'].includes(job.codec)) throw new Error('Okänd videokodare.');
  if (!job.input || !job.output || path.resolve(job.input) === path.resolve(job.output)) throw new Error('Välj separata in- och utdatafiler.');
  return ['-hide_banner', '-nostdin', '-n', '-i', job.input,
    '-map', '0:v:0', '-map', '0:a?', '-sn', '-c:v', job.codec === 'h265' ? 'libx265' : 'libx264',
    '-preset', preset.speed, '-crf', String(preset.crf), '-vf', `scale=w='trunc(min(${preset.width},iw)/2)*2':h=-2`,
    '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '192k', '-movflags', '+faststart',
    '-progress', 'pipe:1', '-nostats', job.output];
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
