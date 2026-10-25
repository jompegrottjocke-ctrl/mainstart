/* Shared by the renderer and FFmpeg command builder: displayed settings are encoded settings. */
(function (root) {
  const presets = {
    balanced: { label: 'Balanserad', width: 1920, height: 1080 },
    quality: { label: 'Hög kvalitet', width: 3840, height: 2160 },
    compact: { label: 'Liten fil', width: 1280, height: 720 },
  };
  const codecs = {
    h264: { label: 'H.264 / AVC', encoder: 'libx264', containers: ['mp4', 'mkv', 'mov'], crf: { balanced: 22, quality: 18, compact: 28 }, speeds: { balanced: 'medium', quality: 'slow', compact: 'medium' }, speedFlag: '-preset', description: 'Bred kompatibilitet med spelare och enheter.' },
    h265: { label: 'H.265 / HEVC', encoder: 'libx265', containers: ['mp4', 'mkv', 'mov'], crf: { balanced: 24, quality: 20, compact: 30 }, speeds: { balanced: 'medium', quality: 'slow', compact: 'medium' }, speedFlag: '-preset', description: 'Effektiv komprimering. Kräver HEVC-stöd i spelaren.' },
    av1: { label: 'AV1', encoder: 'libsvtav1', containers: ['mp4', 'mkv', 'webm'], crf: { balanced: 32, quality: 24, compact: 40 }, speeds: { balanced: '8', quality: '6', compact: '10' }, speedFlag: '-preset', description: 'Modern komprimering. CPU-kodning kan ta längre tid; kräver en modern spelare.' },
    vp9: { label: 'VP9', encoder: 'libvpx-vp9', containers: ['webm', 'mkv'], crf: { balanced: 32, quality: 24, compact: 40 }, speeds: { balanced: '4', quality: '2', compact: '5' }, speedFlag: '-cpu-used', description: 'Ett öppet format för webbvideo. Passar bra i WebM.' },
  };
  const containers = {
    mp4: { label: 'MP4', extension: 'mp4', muxer: 'mp4', audio: 'aac', audioLabel: 'AAC', audioKbps: 192 },
    mkv: { label: 'Matroska / MKV', extension: 'mkv', muxer: 'matroska', audio: 'aac', audioLabel: 'AAC', audioKbps: 192 },
    webm: { label: 'WebM', extension: 'webm', muxer: 'webm', audio: 'libopus', audioLabel: 'Opus', audioKbps: 128 },
    mov: { label: 'QuickTime / MOV', extension: 'mov', muxer: 'mov', audio: 'aac', audioLabel: 'AAC', audioKbps: 192 },
  };
  function settingsFor(job) {
    if (!Object.hasOwn(presets, job.preset)) throw new Error('Okänd förinställning.');
    if (!Object.hasOwn(codecs, job.codec)) throw new Error('Okänd videokodare.');
    const container = job.container ?? 'mp4';
    if (!Object.hasOwn(containers, container)) throw new Error('Okänd container.');
    const codec = codecs[job.codec];
    if (!codec.containers.includes(container)) throw new Error(`${codec.label} kan inte användas i ${containers[container].label}. Välj en kompatibel container.`);
    const rateControl = job.rateControl ?? 'crf';
    if (!['crf', 'bitrate'].includes(rateControl)) throw new Error('Okänd kvalitetsstyrning.');
    if (rateControl === 'bitrate' && (!Number.isInteger(job.videoKbps) || job.videoKbps < 100 || job.videoKbps > 200000)) throw new Error('Videobitrate måste vara ett heltal mellan 100 och 200 000 kbit/s.');
    return { preset: presets[job.preset], codec, container: containers[container], containerId: container,
      crf: codec.crf[job.preset], speed: codec.speeds[job.preset], rateControl, videoKbps: rateControl === 'bitrate' ? job.videoKbps : null };
  }
  const config = { presets, codecs, containers, settingsFor };
  if (typeof module !== 'undefined' && module.exports) module.exports = config;
  else root.FrameForgeFormats = config;
})(globalThis);
