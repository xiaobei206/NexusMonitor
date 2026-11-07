import { closeSync, openSync, readSync, statSync } from 'node:fs';
import { basename, extname } from 'node:path';

export interface ParsedMusicArtwork {
  mimeType: string;
  data: Buffer;
}
export interface ParsedMusicMetadata {
  title?: string;
  artist?: string;
  album?: string;
  genre?: string;
  year?: number;
  trackNumber?: number;
  durationSeconds?: number;
  sampleRateHz?: number;
  bitDepth?: number;
  channels?: number;
  replayGainTrackDb?: number;
  replayGainAlbumDb?: number;
  replayGainTrackPeak?: number;
  replayGainAlbumPeak?: number;
  artwork?: ParsedMusicArtwork;
}

const MAX_TAG_BYTES = 16 * 1024 * 1024;
const MAX_ARTWORK_BYTES = 5 * 1024 * 1024;
const SYNCSAFE = (bytes: Buffer, offset: number) =>
  ((bytes[offset] & 0x7f) << 21) | ((bytes[offset + 1] & 0x7f) << 14) |
  ((bytes[offset + 2] & 0x7f) << 7) | (bytes[offset + 3] & 0x7f);

function readAt(fd: number, fileSize: number, position: number, length: number): Buffer {
  if (position < 0 || position >= fileSize || length <= 0) return Buffer.alloc(0);
  const buffer = Buffer.alloc(Math.min(length, fileSize - position));
  const bytesRead = readSync(fd, buffer, 0, buffer.length, position);
  return buffer.subarray(0, bytesRead);
}
function trimText(value: string) { return value.replace(/\0/g, '').replace(/^\uFEFF/, '').trim(); }
function decodeText(buffer: Buffer, encoding = 3): string {
  if (!buffer.length) return '';
  let value: string;
  if (encoding === 0) value = buffer.toString('latin1');
  else if (encoding === 1) {
    // ID3 UTF-16 may be LE or BE and normally starts with a BOM.
    if (buffer.length >= 2 && buffer[0] === 0xfe && buffer[1] === 0xff) {
      const swapped = Buffer.from(buffer.subarray(2));
      for (let i = 0; i + 1 < swapped.length; i += 2) [swapped[i], swapped[i + 1]] = [swapped[i + 1], swapped[i]];
      value = swapped.toString('utf16le');
    } else value = buffer.toString('utf16le');
  } else if (encoding === 2) {
    const swapped = Buffer.from(buffer);
    for (let i = 0; i + 1 < swapped.length; i += 2) [swapped[i], swapped[i + 1]] = [swapped[i + 1], swapped[i]];
    value = swapped.toString('utf16le');
  } else value = buffer.toString('utf8');
  return trimText(value);
}
function textBeforeNull(buffer: Buffer, start: number, encoding: number): { value: string; next: number } {
  const unit = encoding === 1 || encoding === 2 ? 2 : 1;
  let end = start;
  while (end + unit <= buffer.length) {
    if (unit === 1 && buffer[end] === 0) break;
    if (unit === 2 && buffer[end] === 0 && buffer[end + 1] === 0) break;
    end += unit;
  }
  const value = decodeText(buffer.subarray(start, end), encoding);
  return { value, next: Math.min(buffer.length, end + unit) };
}
function setComment(target: ParsedMusicMetadata, key: string, value: string) {
  const normalized = key.trim().toUpperCase();
  const clean = trimText(value.split('\0')[0] ?? '');
  if (!clean) return;
  if (normalized === 'TITLE' && !target.title) target.title = clean;
  else if ((normalized === 'ARTIST' || normalized === 'PERFORMER') && !target.artist) target.artist = clean;
  else if ((normalized === 'ALBUM' || normalized === 'ALBUMTITLE') && !target.album) target.album = clean;
  else if ((normalized === 'GENRE' || normalized === 'CONTENTGROUP') && !target.genre) target.genre = clean;
  else if ((normalized === 'DATE' || normalized === 'YEAR' || normalized === 'RELEASEDATE') && !target.year) {
    const match = clean.match(/\b(18|19|20|21)\d{2}\b/);
    if (match) target.year = Number(match[0]);
  } else if ((normalized === 'TRACKNUMBER' || normalized === 'TRACK') && !target.trackNumber) {
    const number = Number.parseInt(clean.split('/')[0], 10);
    if (Number.isFinite(number) && number > 0) target.trackNumber = number;
  } else if (normalized === 'REPLAYGAIN_TRACK_GAIN' && target.replayGainTrackDb == null) {
    const db = Number.parseFloat(clean);
    if (Number.isFinite(db) && db >= -60 && db <= 30) target.replayGainTrackDb = db;
  } else if (normalized === 'REPLAYGAIN_ALBUM_GAIN' && target.replayGainAlbumDb == null) {
    const db = Number.parseFloat(clean);
    if (Number.isFinite(db) && db >= -60 && db <= 30) target.replayGainAlbumDb = db;
  } else if (normalized === 'REPLAYGAIN_TRACK_PEAK' && target.replayGainTrackPeak == null) {
    const peak = Number.parseFloat(clean);
    if (Number.isFinite(peak) && peak > 0 && peak <= 16) target.replayGainTrackPeak = peak;
  } else if (normalized === 'REPLAYGAIN_ALBUM_PEAK' && target.replayGainAlbumPeak == null) {
    const peak = Number.parseFloat(clean);
    if (Number.isFinite(peak) && peak > 0 && peak <= 16) target.replayGainAlbumPeak = peak;
  }
}
function parseId3v2(fd: number, fileSize: number, target: ParsedMusicMetadata) {
  const header = readAt(fd, fileSize, 0, 10);
  if (header.length < 10 || header.toString('ascii', 0, 3) !== 'ID3') return 0;
  const version = header[3];
  if (version < 2 || version > 4) return 0;
  const tagSize = SYNCSAFE(header, 6);
  if (tagSize <= 0 || tagSize > MAX_TAG_BYTES) return 10;
  const body = readAt(fd, fileSize, 10, tagSize);
  let pos = (header[5] & 0x40) && body.length >= 4 ? Math.min(body.length, body.readUInt32BE(0) + 4) : 0;
  while (pos + (version === 2 ? 6 : 10) <= body.length) {
    const headerSize = version === 2 ? 6 : 10;
    const frameId = body.toString('ascii', pos, pos + (version === 2 ? 3 : 4));
    if (!/^[A-Z0-9]{3,4}$/.test(frameId)) break;
    const size = version === 2 ? body.readUIntBE(pos + 3, 3)
      : version === 4 ? SYNCSAFE(body, pos + 4) : body.readUInt32BE(pos + 4);
    if (size <= 0 || size > body.length - pos - headerSize) break;
    const frame = body.subarray(pos + headerSize, pos + headerSize + size);
    pos += headerSize + size;
    if (frameId === 'TIT2' || frameId === 'TT2') target.title ||= decodeText(frame.subarray(1), frame[0]);
    else if (frameId === 'TPE1' || frameId === 'TP1') target.artist ||= decodeText(frame.subarray(1), frame[0]);
    else if (frameId === 'TALB' || frameId === 'TAL') target.album ||= decodeText(frame.subarray(1), frame[0]);
    else if (frameId === 'TCON' || frameId === 'TCO') target.genre ||= decodeText(frame.subarray(1), frame[0]);
    else if (frameId === 'TDRC' || frameId === 'TYER' || frameId === 'TYE') {
      const match = decodeText(frame.subarray(1), frame[0]).match(/\b(18|19|20|21)\d{2}\b/);
      if (match) target.year ||= Number(match[0]);
    } else if (frameId === 'TRCK' || frameId === 'TRK') {
      const value = decodeText(frame.subarray(1), frame[0]);
      const number = Number.parseInt(value.split('/')[0], 10);
      if (Number.isFinite(number) && number > 0) target.trackNumber ||= number;
    } else if (frameId === 'TLEN') {
      const milliseconds = Number.parseInt(decodeText(frame.subarray(1), frame[0]), 10);
      if (Number.isFinite(milliseconds) && milliseconds > 0) target.durationSeconds ||= milliseconds / 1000;
    } else if (frameId === 'TXXX' && frame.length > 2) {
      const encoding = frame[0];
      const description = textBeforeNull(frame, 1, encoding);
      const value = decodeText(frame.subarray(description.next), encoding);
      setComment(target, description.value, value);
    } else if ((frameId === 'APIC' || frameId === 'PIC') && !target.artwork && frame.length > 8) {
      const encoding = frame[0];
      let cursor = 1;
      let mimeType = 'image/jpeg';
      if (frameId === 'PIC') {
        mimeType = `image/${frame.toString('ascii', cursor, cursor + 3).toLowerCase() === 'png' ? 'png' : 'jpeg'}`;
        cursor += 3;
      } else {
        const mimeEnd = frame.indexOf(0, cursor);
        if (mimeEnd > cursor) mimeType = frame.toString('latin1', cursor, mimeEnd);
        cursor = mimeEnd + 1;
      }
      cursor += 1; // picture type
      const description = textBeforeNull(frame, cursor, encoding);
      cursor = description.next;
      if (cursor < frame.length && frame.length - cursor <= MAX_ARTWORK_BYTES && /^image\/(jpeg|png|webp|gif)$/i.test(mimeType)) {
        target.artwork = { mimeType, data: Buffer.from(frame.subarray(cursor)) };
      }
    }
  }
  return 10 + tagSize;
}
function parseId3v1(buffer: Buffer, target: ParsedMusicMetadata) {
  if (buffer.length < 128 || buffer.toString('ascii', 0, 3) !== 'TAG') return;
  const field = (start: number, length: number) => trimText(buffer.subarray(start, start + length).toString('latin1'));
  target.title ||= field(3, 30);
  target.artist ||= field(33, 30);
  target.album ||= field(63, 30);
  const year = field(93, 4);
  if (!target.year && /^\d{4}$/.test(year)) target.year = Number(year);
}
function parseOggIdentification(buffer: Buffer, target: ParsedMusicMetadata) {
  const opusAt = buffer.indexOf('OpusHead', 0, 'ascii');
  if (opusAt >= 0 && opusAt + 10 <= buffer.length) {
    const channels = buffer[opusAt + 9];
    if (channels > 0 && channels <= 32) target.channels ||= channels;
    return;
  }
  const vorbisHeader = Buffer.concat([Buffer.from([0x01]), Buffer.from('vorbis', 'ascii')]);
  const vorbisAt = buffer.indexOf(vorbisHeader);
  if (vorbisAt >= 0 && vorbisAt + 16 <= buffer.length) {
    const channels = buffer[vorbisAt + 11];
    const sampleRate = buffer.readUInt32LE(vorbisAt + 12);
    if (channels > 0 && channels <= 32) target.channels ||= channels;
    if (sampleRate >= 8000 && sampleRate <= 384000) target.sampleRateHz ||= sampleRate;
  }
}

function parseVorbisCommentBlock(buffer: Buffer, target: ParsedMusicMetadata, offset = 0) {
  if (offset < 0 || offset + 8 > buffer.length) return;
  let pos = offset;
  const vendorLen = buffer.readUInt32LE(pos); pos += 4;
  if (vendorLen > buffer.length - pos) return;
  pos += vendorLen;
  if (pos + 4 > buffer.length) return;
  const count = Math.min(buffer.readUInt32LE(pos), 10000); pos += 4;
  for (let i = 0; i < count && pos + 4 <= buffer.length; i++) {
    const length = buffer.readUInt32LE(pos); pos += 4;
    if (length > buffer.length - pos || length > 1024 * 1024) return;
    const comment = buffer.toString('utf8', pos, pos + length); pos += length;
    const equals = comment.indexOf('=');
    if (equals > 0) setComment(target, comment.slice(0, equals), comment.slice(equals + 1));
  }
}
function parseVorbisComments(buffer: Buffer, target: ParsedMusicMetadata) {
  const opusAt = buffer.indexOf('OpusTags', 0, 'ascii');
  const vorbisMarker = Buffer.from([0x03, 0x76, 0x6f, 0x72, 0x62, 0x69, 0x73]);
  const vorbisAt = buffer.indexOf(vorbisMarker);
  const at = opusAt >= 0 ? opusAt + 8 : vorbisAt >= 0 ? vorbisAt + vorbisMarker.length : -1;
  if (at >= 0) parseVorbisCommentBlock(buffer, target, at);
}
function parseFlac(fd: number, fileSize: number, target: ParsedMusicMetadata) {
  const marker = readAt(fd, fileSize, 0, 4);
  if (marker.toString('ascii') !== 'fLaC') return;
  let pos = 4;
  let consumed = 4;
  while (pos + 4 <= fileSize && consumed < MAX_TAG_BYTES) {
    const head = readAt(fd, fileSize, pos, 4);
    if (head.length < 4) break;
    const isLast = (head[0] & 0x80) !== 0;
    const type = head[0] & 0x7f;
    const length = head.readUIntBE(1, 3);
    if (length <= 0 || length > MAX_TAG_BYTES || pos + 4 + length > fileSize) break;
    const block = readAt(fd, fileSize, pos + 4, length);
    if (type === 0 && block.length >= 34) {
      const packed = block.readBigUInt64BE(10);
      const sampleRate = Number(packed >> 44n);
      const channels = Number((packed >> 41n) & 0x7n) + 1;
      const bitDepth = Number((packed >> 36n) & 0x1fn) + 1;
      const totalSamples = Number(packed & 0xfffffffffn);
      if (sampleRate > 0) {
        target.sampleRateHz ||= sampleRate;
        target.bitDepth ||= bitDepth;
        target.channels ||= channels;
        if (totalSamples > 0) target.durationSeconds ||= totalSamples / sampleRate;
      }
    } else if (type === 4) parseVorbisCommentBlock(block, target);
    else if (type === 6 && !target.artwork && block.length > 32) {
      let cursor = 4;
      const mimeLength = block.readUInt32BE(cursor); cursor += 4;
      if (mimeLength < block.length - cursor) {
        const mimeType = block.toString('utf8', cursor, cursor + mimeLength); cursor += mimeLength;
        const descLength = block.readUInt32BE(cursor); cursor += 4 + descLength;
        if (cursor + 20 <= block.length) {
          cursor += 16; // width, height, color depth and indexed-color count
          const pictureLength = block.readUInt32BE(cursor); cursor += 4;
          if (pictureLength > 0 && pictureLength <= MAX_ARTWORK_BYTES && cursor + pictureLength <= block.length && /^image\/(jpeg|png|webp)$/i.test(mimeType)) {
            target.artwork = { mimeType, data: Buffer.from(block.subarray(cursor, cursor + pictureLength)) };
          }
        }
      }
    }
    pos += 4 + length; consumed += 4 + length;
    if (isLast) break;
  }
}
function parseWav(buffer: Buffer, target: ParsedMusicMetadata) {
  if (buffer.length < 12 || buffer.toString('ascii', 0, 4) !== 'RIFF' || buffer.toString('ascii', 8, 12) !== 'WAVE') return;
  let pos = 12;
  let byteRate = 0;
  while (pos + 8 <= buffer.length) {
    const id = buffer.toString('ascii', pos, pos + 4);
    const size = buffer.readUInt32LE(pos + 4);
    const start = pos + 8;
    if (size > buffer.length - start) break;
    if (id === 'fmt ' && size >= 16) {
      const channels = buffer.readUInt16LE(start + 2);
      if (channels > 0 && channels <= 32) target.channels ||= channels;
      target.sampleRateHz ||= buffer.readUInt32LE(start + 4);
      byteRate = buffer.readUInt32LE(start + 8);
      target.bitDepth ||= buffer.readUInt16LE(start + 14);
    } else if (id === 'data' && byteRate > 0) {
      target.durationSeconds ||= size / byteRate;
    } else if (id === 'LIST' && size >= 4 && buffer.toString('ascii', start, start + 4) === 'INFO') {
      let item = start + 4;
      while (item + 8 <= start + size) {
        const key = buffer.toString('ascii', item, item + 4);
        const valueSize = buffer.readUInt32LE(item + 4);
        if (valueSize > start + size - item - 8) break;
        const value = buffer.toString('latin1', item + 8, item + 8 + valueSize);
        const fields: Record<string, string> = { INAM: 'TITLE', IART: 'ARTIST', IPRD: 'ALBUM', IGNR: 'GENRE', ICRD: 'YEAR' };
        if (fields[key]) setComment(target, fields[key], value);
        item += 8 + valueSize + (valueSize % 2);
      }
    }
    pos = start + size + (size % 2);
  }
}
function parseMp4Atoms(buffer: Buffer, target: ParsedMusicMetadata) {
  // AudioSampleEntry layout: atom type is at +4, channel count at type +20,
  // and the 16.16 sample-rate field at type +28.
  for (const atom of ['mp4a', 'alac']) {
    const index = buffer.indexOf(atom, 0, 'ascii');
    if (index < 0 || index + 32 > buffer.length) continue;
    const channels = buffer.readUInt16BE(index + 20);
    const sampleRate = buffer.readUInt32BE(index + 28) >>> 16;
    if (channels > 0 && channels <= 32) target.channels ||= channels;
    if (sampleRate >= 8000 && sampleRate <= 384000) target.sampleRateHz ||= sampleRate;
    break;
  }
  const map: Record<string, string> = {
    '\u00a9nam': 'TITLE', '\u00a9ART': 'ARTIST', 'aART': 'ARTIST', '\u00a9alb': 'ALBUM',
    '\u00a9gen': 'GENRE', '\u00a9day': 'YEAR', 'trkn': 'TRACKNUMBER',
  };
  for (const [atom, key] of Object.entries(map)) {
    const needle = Buffer.from(atom, 'latin1');
    const index = buffer.indexOf(needle);
    if (index < 0) continue;
    const dataAt = buffer.indexOf('data', index + needle.length, 'ascii');
    if (dataAt < 0 || dataAt + 8 >= buffer.length) continue;
    const atomSize = buffer.readUInt32BE(dataAt - 4);
    const start = dataAt + 8;
    const end = Math.min(buffer.length, dataAt - 4 + atomSize);
    if (end <= start) continue;
    const valueBuffer = buffer.subarray(start, end);
    if (key === 'TRACKNUMBER' && valueBuffer.length >= 4) {
      const value = valueBuffer.readUInt16BE(2);
      if (value > 0) target.trackNumber ||= value;
    } else if (key === 'YEAR') {
      setComment(target, key, valueBuffer.toString('utf8'));
    } else setComment(target, key, valueBuffer.toString('utf8'));
  }
  const covr = buffer.indexOf('covr');
  if (covr >= 0 && !target.artwork) {
    const dataAt = buffer.indexOf('data', covr + 4, 'ascii');
    if (dataAt >= 0 && dataAt + 8 < buffer.length) {
      const atomSize = buffer.readUInt32BE(dataAt - 4);
      const start = dataAt + 8;
      const end = Math.min(buffer.length, dataAt - 4 + atomSize);
      const bytes = buffer.subarray(start, end);
      if (bytes.length > 0 && bytes.length <= MAX_ARTWORK_BYTES) {
        const png = bytes[0] === 0x89 && bytes.toString('ascii', 1, 4) === 'PNG';
        target.artwork = { mimeType: png ? 'image/png' : 'image/jpeg', data: Buffer.from(bytes) };
      }
    }
  }
}

export function readMusicMetadata(filePath: string): ParsedMusicMetadata {
  const target: ParsedMusicMetadata = {};
  let fd: number | null = null;
  try {
    const fileStat = statSync(filePath);
    if (!fileStat.isFile() || fileStat.size <= 0) return target;
    fd = openSync(filePath, 'r');
    const extension = extname(filePath).toLowerCase();
    if (extension === '.mp3') {
      parseId3v2(fd, fileStat.size, target);
      parseId3v1(readAt(fd, fileStat.size, Math.max(0, fileStat.size - 128), 128), target);
    } else if (extension === '.flac') {
      parseFlac(fd, fileStat.size, target);
    } else {
      const head = readAt(fd, fileStat.size, 0, Math.min(MAX_TAG_BYTES, fileStat.size));
      if (extension === '.wav') parseWav(head, target);
      if (extension === '.ogg' || extension === '.oga' || extension === '.opus') {
        parseOggIdentification(head, target);
        parseVorbisComments(head, target);
      }
      if (extension === '.m4a' || extension === '.m4b' || extension === '.aac') parseMp4Atoms(head, target);
    }
  } catch {
    // Metadata is best-effort; a malformed tag must never make valid audio unimportable.
  } finally {
    if (fd !== null) try { closeSync(fd); } catch { /* no-op */ }
  }
  if (!target.title) target.title = basename(filePath, extname(filePath));
  return target;
}

export function musicFormatLabel(filePath: string): string {
  const extension = extname(filePath).slice(1).toUpperCase();
  return extension || 'AUDIO';
}
