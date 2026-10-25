const fs = require('node:fs');
const fsp = fs.promises;
const path = require('node:path');
const { createHash } = require('node:crypto');
const { Readable, Transform } = require('node:stream');
const { pipeline } = require('node:stream/promises');
const { unpack } = require('./unzip.cjs');
const BASE = 'https://github.com/BtbN/FFmpeg-Builds/releases/download/latest/';
const ARCHIVE = 'ffmpeg-master-latest-win64-gpl.zip';
const MAX_BYTES = 512 * 1024 * 1024;
function checksumFor(text) {
  for (const line of text.split(/\r?\n/)) {
    const match = line.trim().match(/^([a-fA-F0-9]{64})\s+\*?(.+)$/);
    if (match && match[2] === ARCHIVE) return match[1].toLowerCase();
  }
  throw new Error('Kontrollsumman för FFmpeg saknas. Försök igen senare eller välj en egen ffmpeg.exe.');
}
async function installFFmpeg({ directory, fetcher, verify, progress = () => {}, platform = process.platform }) {
  if (platform !== 'win32') throw new Error('Automatisk FFmpeg-installation stöds endast på Windows.');
  await fsp.mkdir(directory, { recursive: true });
  const staging = await fsp.mkdtemp(path.join(directory, 'ffmpeg-install-'));
  let retained = false;
  try {
    progress('Hämtar kontrollsumma från BtbN…');
    const options = { signal: AbortSignal.timeout(10 * 60 * 1000) };
    const checksums = await fetcher(BASE + 'checksums.sha256', options);
    if (!checksums.ok) throw new Error(`Kunde inte hämta kontrollsumman (HTTP ${checksums.status}).`);
    // Bound metadata as well as the archive; never buffer an unlimited response.
    let checksumText = '';
    for await (const chunk of Readable.fromWeb(checksums.body)) {
      checksumText += chunk.toString();
      if (checksumText.length > 2 * 1024 * 1024) throw new Error('Kontrollsummefilen är oväntat stor.');
    }
    const expected = checksumFor(checksumText);
    progress('Laddar ned FFmpeg…');
    const response = await fetcher(BASE + ARCHIVE, options);
    if (!response.ok || !response.body) throw new Error(`Kunde inte ladda ned FFmpeg (HTTP ${response.status}).`);
    const total = Number(response.headers.get('content-length'));
    if (total > MAX_BYTES) throw new Error('FFmpeg-arkivet är oväntat stort.');
    let bytes = 0, lastPercent = -1, lastMB = -1;
    const hash = createHash('sha256');
    const meter = new Transform({ transform(chunk, _, callback) {
      bytes += chunk.length;
      if (bytes > MAX_BYTES) return callback(new Error('FFmpeg-arkivet är oväntat stort.'));
      hash.update(chunk);
      const percent = total > 0 ? Math.min(100, Math.floor(bytes / total * 100)) : -1;
      const mb = Math.floor(bytes / 1048576);
      if (percent !== lastPercent || mb !== lastMB) {
        lastPercent = percent; lastMB = mb;
        progress(`Laddar ned FFmpeg · ${percent >= 0 ? percent + ' % · ' : ''}${mb} MB`);
      }
      callback(null, chunk);
    } });
    const archive = path.join(staging, 'download.zip');
    await pipeline(Readable.fromWeb(response.body), meter, fs.createWriteStream(archive, { flags: 'wx' }));
    progress('Verifierar nedladdningen…');
    if (hash.digest('hex') !== expected) throw new Error('Kontrollsumman stämmer inte. Nedladdningen har raderats. Försök igen.');
    progress('Packar upp FFmpeg…');
    await unpack(archive, staging);
    const binary = path.join(staging, 'ffmpeg-master-latest-win64-gpl', 'bin', 'ffmpeg.exe');
    const stat = await fsp.lstat(binary);
    if (!stat.isFile() || stat.isSymbolicLink()) throw new Error('FFmpeg saknas i det nedladdade paketet.');
    progress('Kontrollerar att FFmpeg fungerar…');
    if (!await verify(binary)) throw new Error('Det nedladdade FFmpeg kunde inte startas. Din tidigare inställning är oförändrad.');
    await fsp.unlink(archive);
    retained = true;
    return binary;
  } finally {
    if (!retained) await fsp.rm(staging, { recursive: true, force: true });
  }
}
module.exports = { installFFmpeg, checksumFor, ARCHIVE };
