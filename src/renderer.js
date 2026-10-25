const $ = id => document.getElementById(id);
const { codecs, containers, presets, settingsFor } = window.FrameForgeFormats;
const { translate, message } = window.FrameForgeI18n;
let language = 'sv';
try { if (localStorage.getItem('frameforge.language') === 'en') language = 'en'; } catch {}
let jobs = [], preset = 'balanced', output = null, ready = false, running = false, stopping = false, installing = false, choosingOutput = false;
let availableCodecs = null, noticeValue = null, installMessage = null, adjustment = null;
const t = (key, values) => translate(key, language, values);
const supported = key => availableCodecs === null || availableCodecs.includes(key);
function selection() { return { preset, codec: $('codec').value, container: $('container').value, rateControl: $('rate-control').value, videoKbps: Number($('video-bitrate').value) }; }
function notice(value) { noticeValue = value; renderNotice(); }
function renderNotice() {
  $('notice').textContent = !noticeValue ? '' : typeof noticeValue === 'string' ? message(noticeValue, language) : t(noticeValue.key, noticeValue.values);
  $('notice').hidden = !noticeValue;
}
function controls() {
  let valid = true;
  try { settingsFor(selection()); } catch { valid = false; }
  $('start').disabled = running || installing || choosingOutput || !ready || !valid || !supported($('codec').value) || !jobs.some(j => j.state === 'waiting');
  $('cancel').hidden = !running;
  for (const id of ['add', 'addMore', 'clear', 'output', 'codec', 'container', 'rate-control', 'video-bitrate', 'settings']) $(id).disabled = running || installing || choosingOutput;
  document.querySelectorAll('.preset').forEach(b => b.disabled = running || installing || choosingOutput);
  $('download-ffmpeg').disabled = installing || running || choosingOutput;
}
function renderSettings() {
  const choice = selection();
  for (const [id, codec] of Object.entries(codecs)) {
    const option = $('codec').querySelector(`[value="${id}"]`);
    option.textContent = `${codec.label}${supported(id) ? '' : ` · ${t('unavailable')}`}`;
    option.disabled = !supported(id);
  }
  for (const node of document.querySelectorAll('[data-profile-description]')) {
    const id = node.dataset.profileDescription;
    const profile = presets[id], codec = codecs[choice.codec];
    node.textContent = t('profileDescription', { resolution: t('maxSize', profile), rate: choice.rateControl === 'crf' ? `CRF ${codec.crf[id]}` : t('target', { value: choice.videoKbps || '—' }), speed: `${codec.speedFlag} ${codec.speeds[id]}` });
  }
  $('codec-description').textContent = t(`codec_${choice.codec}`);
  $('compatibility').textContent = adjustment ? t(adjustment.key, { codec: codecs[choice.codec].label, container: containers[choice.container].label }) : t('compatible', { containers: codecs[choice.codec].containers.map(id => containers[id].label).join(', ') });
  $('bitrate-field').hidden = choice.rateControl !== 'bitrate';
  const list = $('technical-details'); list.replaceChildren();
  try {
    const settings = settingsFor(choice);
    const rows = [
      ['video', `${settings.codec.label} · ${settings.codec.encoder}`],
      ['container', `${settings.container.label} (.${settings.container.extension})`],
      ['videoRate', settings.rateControl === 'crf' ? t('variable', settings) : t('target', { value: settings.videoKbps })],
      ['audio', t('audioRate', { codec: settings.container.audioLabel, rate: settings.container.audioKbps })],
      ['resolution', t('scale', settings.preset)],
      ['frameRate', t('originalFps')], ['color', 'yuv420p · 8-bit · 4:2:0'],
      ['encoding', t('cpu', { flag: settings.codec.speedFlag, speed: settings.speed })],
    ];
    for (const [key, value] of rows) { const dt = document.createElement('dt'), dd = document.createElement('dd'); dt.textContent = t(key); dd.textContent = value; list.append(dt, dd); }
    $('rate-explanation').textContent = supported(choice.codec) ? t(choice.rateControl === 'crf' ? 'crfHelp' : 'vbrHelp') : t('noEncoder');
  } catch (error) { $('rate-explanation').textContent = message(error.message, language); }
  controls();
}
function render() {
  $('count').textContent = jobs.length; $('empty').hidden = jobs.length > 0; $('addMore').hidden = jobs.length === 0;
  $('queue').replaceChildren();
  for (const job of jobs) {
    const row = document.createElement('div'); row.className = `job ${job.state}`;
    const top = document.createElement('div'); top.className = 'job-top';
    const icon = document.createElement('span'); icon.className = 'job-icon'; icon.textContent = job.state === 'done' ? '✓' : '▷';
    const info = document.createElement('div'); info.className = 'job-info';
    const title = document.createElement('strong'); title.textContent = job.name; title.title = job.name;
    const choice = job.settings || selection();
    const size = document.createElement('small'); size.textContent = t('jobFormat', { size: (job.size / 1048576).toFixed(1), codec: codecs[choice.codec].label, container: containers[choice.container].label });
    info.append(title, size); top.append(icon, info);
    const remove = document.createElement('button'); remove.className = 'remove'; remove.textContent = '×'; remove.ariaLabel = t('remove', { name: job.name }); remove.disabled = running || installing || choosingOutput;
    remove.onclick = () => { jobs = jobs.filter(j => j.id !== job.id); render(); }; top.append(remove);
    const status = document.createElement('div'); status.className = 'job-status';
    if (job.state === 'done') status.textContent = t('done', { output: job.output });
    else if (job.state === 'error') status.textContent = job.cancelled ? t('cancelled') : message(job.error, language);
    else if (job.state === 'running') status.textContent = job.seconds === undefined ? t('starting') : t('converting', { seconds: Math.floor(job.seconds) }) + (job.speed ? t('speed', { speed: job.speed }) : '');
    else status.textContent = t('waiting');
    row.append(top, status); $('queue').append(row);
  }
  controls();
}
function applyLanguage() {
  document.documentElement.lang = language; $('language').value = language;
  document.querySelectorAll('[data-i18n]').forEach(node => { node.textContent = t(node.dataset.i18n); });
  $('output-label').textContent = output ? output.path : t('chooseOutput');
  $('engine').textContent = t(ready ? 'ready' : availableCodecs === null ? 'checking' : 'missing');
  $('install-status').textContent = installMessage ? (installMessage.key ? t(installMessage.key) : message(installMessage, language)) : '';
  renderSettings(); render(); renderNotice();
}
$('language').onchange = () => { language = $('language').value; try { localStorage.setItem('frameforge.language', language); } catch {} applyLanguage(); };
async function add() {
  try { const files = await window.desktop.addFiles(); jobs.push(...files.map(j => ({ ...j, state: 'waiting' }))); render(); }
  catch (error) { notice(error.message); }
}
$('add').onclick = add; $('addMore').onclick = add;
$('clear').onclick = () => { jobs = []; render(); };
document.querySelectorAll('.preset').forEach(button => button.onclick = () => {
  preset = button.dataset.preset;
  document.querySelectorAll('.preset').forEach(b => { b.classList.toggle('active', b === button); b.setAttribute('aria-pressed', String(b === button)); });
  renderSettings(); render();
});
$('codec').onchange = () => {
  adjustment = null;
  if (!codecs[$('codec').value].containers.includes($('container').value)) { $('container').value = codecs[$('codec').value].containers[0]; adjustment = { key: 'autoContainer' }; }
  renderSettings(); render();
};
$('container').onchange = () => {
  adjustment = null;
  if (!codecs[$('codec').value].containers.includes($('container').value)) {
    const compatible = Object.keys(codecs).filter(key => codecs[key].containers.includes($('container').value));
    $('codec').value = compatible.find(supported) || compatible[0]; adjustment = { key: 'autoCodec' };
  }
  renderSettings(); render();
};
$('rate-control').onchange = () => { renderSettings(); render(); };
$('video-bitrate').oninput = () => { renderSettings(); };
async function chooseOutput() {
  if (choosingOutput) return false;
  choosingOutput = true; render();
  try {
    const folder = await window.desktop.chooseOutput();
    if (!folder) return false;
    output = folder; $('output-label').textContent = folder.path; $('output').title = folder.path;
    return true;
  } finally { choosingOutput = false; render(); }
}
$('output').onclick = async () => {
  try { await chooseOutput(); } catch (error) { notice(error.message); }
};
function engine(status) {
  ready = status.ready; availableCodecs = status.availableCodecs ?? null;
  if (ready && !supported($('codec').value) && availableCodecs?.length) {
    $('codec').value = availableCodecs[0];
    if (!codecs[$('codec').value].containers.includes($('container').value)) $('container').value = codecs[$('codec').value].containers[0];
  }
  $('install-panel').hidden = ready;
  $('engine').textContent = t(ready ? 'ready' : 'missing');
  notice(null); renderSettings(); render();
}
$('download-ffmpeg').onclick = async () => {
  installing = true; controls(); notice(null); installMessage = { key: 'installPreparing' }; $('install-status').textContent = t('installPreparing');
  try { engine(await window.desktop.downloadFFmpeg()); notice({ key: 'installed' }); }
  catch (error) { installMessage = { key: 'installFailed' }; $('install-status').textContent = t('installFailed'); notice(error.message); }
  finally { installing = false; controls(); }
};
window.desktop.onInstallProgress(value => { installMessage = value; $('install-status').textContent = message(value, language); });
$('settings').onclick = async () => { try { engine(await window.desktop.chooseBinary(language)); } catch (error) { notice(error.message); } };
$('start').onclick = async () => {
  if (running || installing || choosingOutput || !ready || !jobs.some(job => job.state === 'waiting')) return;
  const settings = selection();
  try { settingsFor(settings); } catch (error) { notice(error.message); return; }
  if (!supported(settings.codec)) { notice({ key: 'noEncoder' }); return; }
  if (!output) {
    try { if (!await chooseOutput()) return; }
    catch (error) { notice(error.message); return; }
  }
  running = true; stopping = false; notice(null); $('open').hidden = true; render();
  try {
    for (const job of jobs.filter(j => j.state === 'waiting')) {
      if (stopping) break;
      job.state = 'running'; job.settings = { ...settings }; render();
      try { const result = await window.desktop.encode({ id: job.id, outputId: output.id, ...settings }); job.state = 'done'; job.output = result.output; }
      catch (error) { job.state = 'error'; job.cancelled = stopping; job.error = error.message; }
      render();
    }
  } finally { running = false; $('open').hidden = !jobs.some(j => j.state === 'done'); render(); }
};
$('cancel').onclick = async () => { stopping = true; $('cancel').disabled = true; try { await window.desktop.cancel(); } finally { $('cancel').disabled = false; } };
$('open').onclick = async () => { try { const error = await window.desktop.openOutput(output.id); if (error) notice(error); } catch (error) { notice(error.message); } };
window.desktop.onProgress(progress => {
  const job = jobs.find(j => j.id === progress.id); if (!job || job.state !== 'running') return;
  if (Number.isFinite(progress.seconds)) job.seconds = progress.seconds;
  if (progress.speed) job.speed = progress.speed;
  render();
});
applyLanguage();
window.desktop.status().then(engine).catch(error => notice(error.message));
