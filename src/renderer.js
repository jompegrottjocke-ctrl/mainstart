const $ = id => document.getElementById(id);
let jobs = [], preset = 'balanced', output = null, ready = false, running = false, stopping = false, installing = false;
function notice(message) { $('notice').textContent = message; $('notice').hidden = !message; }
function controls() {
  $('start').disabled = running || installing || !ready || !output || !jobs.some(j => j.state === 'waiting');
  $('cancel').hidden = !running;
  for (const id of ['add', 'addMore', 'clear', 'output', 'codec', 'settings']) $(id).disabled = running || installing;
  document.querySelectorAll('.preset').forEach(b => b.disabled = running || installing);
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
    const size = document.createElement('small'); size.textContent = `${(job.size / 1048576).toFixed(1)} MB · MP4-utdata`;
    info.append(title, size); top.append(icon, info);
    const remove = document.createElement('button'); remove.className = 'remove'; remove.textContent = '×'; remove.ariaLabel = `Ta bort ${job.name}`; remove.disabled = running;
    remove.onclick = () => { jobs = jobs.filter(j => j.id !== job.id); render(); }; top.append(remove);
    const status = document.createElement('div'); status.className = 'job-status'; status.textContent = job.message || 'Redo i kön';
    row.append(top, status); $('queue').append(row);
  }
  controls();
}
async function add() {
  try { const files = await window.desktop.addFiles(); jobs.push(...files.map(j => ({ ...j, state: 'waiting' }))); render(); }
  catch (error) { notice(error.message); }
}
$('add').onclick = add; $('addMore').onclick = add;
$('clear').onclick = () => { jobs = []; render(); };
document.querySelectorAll('.preset').forEach(button => button.onclick = () => {
  preset = button.dataset.preset;
  document.querySelectorAll('.preset').forEach(b => b.classList.toggle('active', b === button));
});
$('output').onclick = async () => {
  try { const folder = await window.desktop.chooseOutput(); if (folder) { output = folder; $('output').querySelector('span').textContent = folder.path; $('output').title = folder.path; controls(); } }
  catch (error) { notice(error.message); }
};
function engine(status) {
  $('install-panel').hidden = status.ready;
  $('download-ffmpeg').disabled = installing;
  ready = status.ready; $('engine').textContent = ready ? 'FFmpeg är redo' : 'FFmpeg saknas';
  notice(''); controls();
}
$('download-ffmpeg').onclick = async () => {
  installing = true; $('download-ffmpeg').disabled = true; controls(); notice('');
  $('install-status').textContent = 'Förbereder nedladdningen…';
  try { engine(await window.desktop.downloadFFmpeg()); notice('FFmpeg är installerat och redo. Nu kan du konvertera dina videor.'); }
  catch (error) { $('install-status').textContent = 'Installationen misslyckades. Du kan försöka igen eller välja en egen ffmpeg.exe via inställningarna.'; notice(error.message); }
  finally { installing = false; $('download-ffmpeg').disabled = false; controls(); }
};
window.desktop.onInstallProgress(message => { $('install-status').textContent = message; });
$('settings').onclick = async () => { try { engine(await window.desktop.chooseBinary()); } catch (error) { notice(error.message); } };
$('start').onclick = async () => {
  running = true; stopping = false; notice(''); $('open').hidden = true; render();
  const codec = $('codec').value;
  try {
    for (const job of jobs.filter(j => j.state === 'waiting')) {
      if (stopping) break;
      job.state = 'running'; job.message = 'Startar kodaren…'; render();
      try { const result = await window.desktop.encode({ id: job.id, outputId: output.id, preset, codec }); job.state = 'done'; job.message = `Klar · ${result.output}`; }
      catch (error) { job.state = 'error'; job.message = stopping ? 'Avbruten. Ta bort filen och lägg till den igen för att försöka på nytt.' : error.message; }
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
  job.message = `Konverterar · ${Math.floor(job.seconds || 0)} s video behandlad${job.speed ? ` · ${job.speed} hastighet` : ''}`; render();
});
window.desktop.status().then(engine).catch(error => notice(error.message)); render();
