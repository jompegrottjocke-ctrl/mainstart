const yauzl = require('yauzl');
const fs = require('node:fs');
const fsp = fs.promises;
const path = require('node:path');
const { pipeline } = require('node:stream/promises');
// A fresh private directory, no symlinks, no overwrites, bounded unpacked size.
function unpack(archive, directory) {
  return new Promise((resolve, reject) => {
    yauzl.open(archive, { lazyEntries: true, strictFileNames: true }, (error, zip) => {
      if (error) return reject(error);
      let total = 0, failed = false;
      const fail = error => { failed = true; zip.close(); reject(error); };
      zip.on('error', fail);
      zip.on('end', () => { if (!failed) resolve(); });
      zip.on('entry', async entry => {
        try {
          const name = entry.fileName;
          const parts = name.replace(/\/$/, '').split('/');
          const type = (entry.externalFileAttributes >>> 16) & 0o170000;
          if (parts[0] !== 'ffmpeg-master-latest-win64-gpl' || parts.some(p => !p || p === '.' || p === '..' || /[:\\\x00]/.test(p)) ||
              (type !== 0 && type !== 0o100000 && type !== 0o040000)) throw new Error('FFmpeg-arkivet innehåller en otillåten filsökväg eller länk.');
          total += entry.uncompressedSize;
          if (total > 2 * 1024 * 1024 * 1024) throw new Error('Det uppackade FFmpeg-paketet är oväntat stort.');
          const target = path.join(directory, ...parts);
          if (name.endsWith('/')) await fsp.mkdir(target, { recursive: true });
          else {
            await fsp.mkdir(path.dirname(target), { recursive: true });
            const stream = await new Promise((resolve, reject) => zip.openReadStream(entry, (error, stream) => error ? reject(error) : resolve(stream)));
            await pipeline(stream, fs.createWriteStream(target, { flags: 'wx' }));
          }
          if (!failed) zip.readEntry();
        } catch (error) { fail(error); }
      });
      zip.readEntry();
    });
  });
}
module.exports = { unpack };
