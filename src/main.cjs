const { app, BrowserWindow, ipcMain, dialog, shell, net, screen } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const { spawn } = require('node:child_process');
const { encode } = require('./encoder.cjs');
const { settingsFor, codecs } = require('./formats.js');
const { installFFmpeg } = require('./ffmpeg-install.cjs');
let installing = false;
let win, active, binary = 'ffmpeg';
const sources = new Map(), outputs = new Map();
const settingsFile = () => path.join(app.getPath('userData'), 'settings.json');
function saveSettings() { fs.writeFileSync(settingsFile(), JSON.stringify({ binary })); }
function verifyBinary(executable = binary) {
  return new Promise(resolve => {
    const child = spawn(executable, ['-version'], { windowsHide: true });
    let output = '', finished = false;
    const finish = value => { if (!finished) { finished = true; clearTimeout(timer); resolve(value); } };
    const timer = setTimeout(() => { child.kill(); finish(false); }, 5000);
    child.stdout.on('data', d => { output += d; });
    child.on('error', () => finish(false));
    child.on('close', code => finish(code === 0 && output.startsWith('ffmpeg version')));
  });
}
async function engineStatus() {
  const ready = await verifyBinary();
  if (!ready) return { ready, binary, availableCodecs: [] };
  const names = await new Promise(resolve => {
    const child = spawn(binary, ['-hide_banner', '-encoders'], { windowsHide: true });
    let text = '', finished = false;
    const finish = value => { if (finished) return; finished = true; clearTimeout(timer); resolve(value); };
    const timer = setTimeout(() => { child.kill(); finish([]); }, 5000);
    child.stdout.on('data', data => { text = (text + data).slice(-100000); });
    child.stderr.resume();
    child.on('error', () => finish([]));
    child.on('close', code => finish(code === 0 ? text.split(/\r?\n/).map(line => line.trim().split(/\s+/)[1]) : []));
  });
  return { ready, binary, availableCodecs: Object.keys(codecs).filter(key => names.includes(codecs[key].encoder)) };
}
app.whenReady().then(() => {
  try { binary = JSON.parse(fs.readFileSync(settingsFile(), 'utf8')).binary || 'ffmpeg'; } catch {}
  const area = screen.getPrimaryDisplay().workAreaSize;
  win = new BrowserWindow({ width: Math.min(1280, area.width), height: Math.min(860, area.height), minWidth: Math.min(720, area.width), minHeight: Math.min(520, area.height), backgroundColor: '#101216', autoHideMenuBar: true,
    webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true } });
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', event => event.preventDefault());
  win.loadFile(path.join(__dirname, 'index.html'));
});
app.on('window-all-closed', () => { active?.kill(); app.quit(); });
ipcMain.handle('status', engineStatus);
ipcMain.handle('download-ffmpeg', async () => {
  if (installing || active) throw new Error('Vänta tills den pågående åtgärden är klar.');
  installing = true;
  try {
    const installed = await installFFmpeg({
      directory: path.join(app.getPath('userData'), 'tools'),
      fetcher: (url, options) => net.fetch(url, options),
      verify: verifyBinary,
      progress: message => { if (!win.isDestroyed()) win.webContents.send('install-progress', message); },
    });
    const previous = binary;
    binary = installed;
    try { saveSettings(); } catch (error) { binary = previous; throw error; }
    return engineStatus();
  } finally { installing = false; }
});
ipcMain.handle('choose-binary', async (_, language) => {
  if (installing || active) throw new Error('Vänta tills den pågående åtgärden är klar.');
  const result = await dialog.showOpenDialog(win, { title: language === 'en' ? 'Choose FFmpeg' : 'Välj FFmpeg', properties: ['openFile'], filters: [{ name: 'FFmpeg', extensions: process.platform === 'win32' ? ['exe'] : ['*'] }] });
  if (!result.canceled) { binary = result.filePaths[0]; saveSettings(); }
  return engineStatus();
});
ipcMain.handle('add-files', async () => {
  const result = await dialog.showOpenDialog(win, { properties: ['openFile', 'multiSelections'], filters: [{ name: 'Video', extensions: ['mp4', 'mkv', 'mov', 'avi', 'webm', 'm4v', 'mts'] }] });
  return result.filePaths.map(file => { const id = require('node:crypto').randomUUID(); sources.set(id, file); return { id, name: path.basename(file), size: fs.statSync(file).size }; });
});
ipcMain.handle('choose-output', async () => {
  const result = await dialog.showOpenDialog(win, { properties: ['openDirectory', 'createDirectory'] });
  if (result.canceled) return null;
  const id = require('node:crypto').randomUUID(); outputs.set(id, result.filePaths[0]);
  return { id, path: result.filePaths[0] };
});
ipcMain.handle('encode', async (_, job) => {
  if (active || installing) throw new Error('Vänta tills den pågående åtgärden är klar.');
  const input = sources.get(job.id), folder = outputs.get(job.outputId);
  if (!input || !folder) throw new Error('Välj videofiler och utdatamapp igen.');
  const settings = settingsFor(job);
  const extension = settings.container.extension;
  const base = path.basename(input, path.extname(input));
  let output = path.join(folder, `${base}-${job.preset}-${job.codec}.${extension}`), index = 2;
  while (fs.existsSync(output)) output = path.join(folder, `${base}-${job.preset}-${job.codec}-${index++}.${extension}`);
  const process = encode(binary, { input, output, preset: job.preset, codec: job.codec, container: job.container, rateControl: job.rateControl, videoKbps: job.videoKbps }, progress => {
    if (!win.isDestroyed()) win.webContents.send('progress', { id: job.id, ...progress });
  });
  active = process.child;
  try { await process.done; return { output }; }
  catch (error) {
    // FFmpeg may leave an incomplete file after cancellation or failure.
    try { fs.unlinkSync(output); } catch {}
    throw error;
  } finally { active = null; }
});
ipcMain.handle('cancel', () => { if (active) active.kill(); });
ipcMain.handle('open-output', (_, id) => { const folder = outputs.get(id); if (folder) return shell.openPath(folder); });
