const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { installFFmpeg, checksumFor, ARCHIVE } = require('../src/ffmpeg-install.cjs');
const archive = Buffer.from('UEsDBBQAAAAIAJJMWV0lN+YrHAAAABoAAAAtAAAAZmZtcGVnLW1hc3Rlci1sYXRlc3Qtd2luNjQtZ3BsL2Jpbi9mZm1wZWcuZXhl841SKEktLlFIrUhNLi1JTMpJVUjLrCgpLUoFAFBLAwQUAAAACACSTFldXmXWPxYAAAAUAAAAKgAAAGZmbXBlZy1tYXN0ZXItbGF0ZXN0LXdpbjY0LWdwbC9MSUNFTlNFLnR4dAtJLS5RSMusKCktSlXIyUxOzStOBQBQSwECFAMUAAAACACSTFldJTfmKxwAAAAaAAAALQAAAAAAAAAAAAAAgAEAAAAAZmZtcGVnLW1hc3Rlci1sYXRlc3Qtd2luNjQtZ3BsL2Jpbi9mZm1wZWcuZXhlUEsBAhQDFAAAAAgAkkxZXV5l1j8WAAAAFAAAACoAAAAAAAAAAAAAAIABZwAAAGZmbXBlZy1tYXN0ZXItbGF0ZXN0LXdpbjY0LWdwbC9MSUNFTlNFLnR4dFBLBQYAAAAAAgACALMAAADFAAAAAAA=', 'base64');
const digest = createHash('sha256').update(archive).digest('hex');
async function setup(t) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'frameforge-download-'));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const progress = [];
  return { directory, platform: 'win32', progress: message => progress.push(message), messages: progress,
    fetcher: async url => url.endsWith('checksums.sha256') ? new Response(`${digest}  ${ARCHIVE}\n`) : new Response(archive, { headers: { 'content-length': String(archive.length) } }),
    verify: async file => (await fs.readFile(file)).subarray(0, 2).toString() === 'MZ' };
}
test('downloads, verifies, extracts and keeps a working binary plus license', async t => {
  const options = await setup(t);
  const binary = await installFFmpeg(options);
  assert.equal(path.basename(binary), 'ffmpeg.exe');
  assert.ok((await fs.readFile(binary)).length);
  assert.equal(await fs.readFile(path.resolve(binary, '../../LICENSE.txt'), 'utf8'), 'Test fixture license');
  await assert.rejects(fs.access(path.resolve(binary, '../../../download.zip')));
  assert.ok(options.messages.some(message => message.includes('Verifierar')));
});
test('checksum mismatch deletes download without executing it', async t => {
  const options = await setup(t);
  let executed = false;
  options.verify = async () => { executed = true; return true; };
  options.fetcher = async url => url.endsWith('checksums.sha256') ? new Response(`${'0'.repeat(64)}  ${ARCHIVE}`) : new Response(archive);
  await assert.rejects(installFFmpeg(options), /Kontrollsumman stämmer inte/);
  assert.equal(executed, false);
  assert.deepEqual(await fs.readdir(options.directory), []);
});
test('failed executable verification removes installation', async t => {
  const options = await setup(t); options.verify = async () => false;
  await assert.rejects(installFFmpeg(options), /kunde inte startas/);
  assert.deepEqual(await fs.readdir(options.directory), []);
});
test('network failure is reported and cleaned up', async t => {
  const options = await setup(t); options.fetcher = async () => new Response('', { status: 503 });
  await assert.rejects(installFFmpeg(options), /HTTP 503/);
  assert.deepEqual(await fs.readdir(options.directory), []);
});
test('checksum parser matches the exact archive and accepts binary marker', () => {
  assert.equal(checksumFor(`${digest} *${ARCHIVE}`), digest);
  assert.throws(() => checksumFor(`${digest} other.zip`), /saknas/);
});
test('unsupported operating systems are rejected before downloading', async t => {
  const options = await setup(t); options.platform = 'linux';
  await assert.rejects(installFFmpeg(options), /endast på Windows/);
});

// Signed-source integrity does not replace safe archive extraction.
test('rejects archive path traversal', async t => {
  const options = await setup(t);
  const malicious = Buffer.from('UEsDBBQAAAAAAAAAIQDKisaLEAAAABAAAAAvAAAAZmZtcGVnLW1hc3Rlci1sYXRlc3Qtd2luNjQtZ3BsLy4uLy4uL2VzY2FwZS5leGUuLi8uLi9lc2NhcGUuZXhlUEsBAhQDFAAAAAAAAAAhAMqKxosQAAAAEAAAAC8AAAAAAAAAAAAAAKSBAAAAAGZmbXBlZy1tYXN0ZXItbGF0ZXN0LXdpbjY0LWdwbC8uLi8uLi9lc2NhcGUuZXhlUEsFBgAAAAABAAEAXQAAAF0AAAAAAA==', 'base64');
  const hash = createHash('sha256').update(malicious).digest('hex');
  let executed = false;
  options.verify = async () => { executed = true; return true; };
  options.fetcher = async url => url.endsWith('checksums.sha256') ? new Response(`${hash}  ${ARCHIVE}`) : new Response(malicious);
  await assert.rejects(installFFmpeg(options));
  assert.equal(executed, false);
  assert.deepEqual(await fs.readdir(options.directory), []);
});
test('rejects archive symbolic links', async t => {
  const options = await setup(t);
  const malicious = Buffer.from('UEsDBBQAAAAAAAAAIQDKisaLEAAAABAAAAAnAAAAZmZtcGVnLW1hc3Rlci1sYXRlc3Qtd2luNjQtZ3BsL2Jpbi9saW5rLi4vLi4vZXNjYXBlLmV4ZVBLAQIUAxQAAAAAAAAAIQDKisaLEAAAABAAAAAnAAAAAAAAAAAAAAD/oQAAAABmZm1wZWctbWFzdGVyLWxhdGVzdC13aW42NC1ncGwvYmluL2xpbmtQSwUGAAAAAAEAAQBVAAAAVQAAAAAA', 'base64');
  const hash = createHash('sha256').update(malicious).digest('hex');
  let executed = false;
  options.verify = async () => { executed = true; return true; };
  options.fetcher = async url => url.endsWith('checksums.sha256') ? new Response(`${hash}  ${ARCHIVE}`) : new Response(malicious);
  await assert.rejects(installFFmpeg(options));
  assert.equal(executed, false);
  assert.deepEqual(await fs.readdir(options.directory), []);
});
