import type { MusicTrack } from '../shared/types';

export type ExclusivePcmFormat = 's16' | 's24' | 's32' | 'f32';

export interface ExclusiveDeviceFormat {
  format: ExclusivePcmFormat;
  channels: number;
  sampleRate: number;
}

export interface ExclusiveSourceFormat {
  path?: string;
  format?: string | null;
  sampleRateHz: number | null;
  bitDepth: number | null;
  channels: number | null;
  lossless: boolean;
  dsd?: boolean;
}

export interface ExclusiveNegotiatedFormat {
  format: ExclusivePcmFormat;
  sampleRate: number;
  channels: 2;
  sourceSampleRate: number | null;
  sourceBitDepth: number | null;
  sourceChannels: number | null;
  bitPerfect: boolean;
  resampled: boolean;
  depthPreserved: boolean;
  upmixed: boolean;
  channelsUnknown: boolean;
  dsd: boolean;
  lossless: boolean;
}

const FORMAT_ORDER: ExclusivePcmFormat[] = ['f32', 's32', 's24', 's16'];
const LOSSLESS_EXTENSIONS = new Set(['.flac', '.wav']);

export function classifyExclusiveSource(track: Pick<MusicTrack, 'path' | 'format' | 'sampleRateHz' | 'bitDepth' | 'channels'>): ExclusiveSourceFormat {
  const extension = (track.format || track.path.slice(track.path.lastIndexOf('.') + 1)).toLowerCase();
  const normalized = extension.startsWith('.') ? extension : `.${extension}`;
  return {
    path: track.path,
    format: normalized.slice(1).toUpperCase(),
    sampleRateHz: typeof track.sampleRateHz === 'number' && Number.isFinite(track.sampleRateHz) && track.sampleRateHz > 0 ? track.sampleRateHz : null,
    bitDepth: typeof track.bitDepth === 'number' && Number.isFinite(track.bitDepth) && track.bitDepth > 0 ? track.bitDepth : null,
    channels: typeof track.channels === 'number' && Number.isFinite(track.channels) && track.channels > 0 ? track.channels : null,
    lossless: LOSSLESS_EXTENSIONS.has(normalized),
    dsd: normalized === '.dsf' || normalized === '.dff',
  };
}

function formatPreservesDepth(format: ExclusivePcmFormat, depth: number | null): boolean {
  if (depth == null) return format === 'f32' || format === 's32';
  if (depth <= 16) return true;
  if (depth <= 24) return format !== 's16';
  return format === 's32';
}

/**
 * Pick a device-native stereo format only from the endpoint's probe results.
 * This function never claims bit-perfect when source rate/depth/channels are
 * unknown, a conversion is required, the source is lossy, or it is DSD.
 */
export function chooseExclusiveFormat(
  source: ExclusiveSourceFormat,
  deviceFormats: ExclusiveDeviceFormat[],
): ExclusiveNegotiatedFormat | null {
  const usable = deviceFormats.filter(item =>
    (item.format === 's16' || item.format === 's24' || item.format === 's32' || item.format === 'f32') &&
    (item.channels === 2 || item.channels === 0) &&
    Number.isInteger(item.sampleRate) && item.sampleRate >= 0,
  );
  if (!usable.length) return null;

  const concreteRates = [...new Set(usable.map(item => item.sampleRate).filter(rate => rate > 0))];
  const hasWildcardRate = usable.some(item => item.sampleRate === 0);
  const sourceRate = source.dsd ? 88200 : source.sampleRateHz;
  let targetRate: number;
  if (sourceRate != null && (hasWildcardRate || concreteRates.includes(sourceRate))) {
    targetRate = sourceRate;
  } else if (sourceRate != null) {
    const above = concreteRates.filter(rate => rate > sourceRate).sort((a, b) => a - b)[0];
    const below = concreteRates.filter(rate => rate < sourceRate).sort((a, b) => b - a)[0];
    targetRate = above ?? below ?? (hasWildcardRate ? sourceRate : 48000);
  } else {
    targetRate = concreteRates.sort((a, b) => b - a)[0] ?? 48000;
  }

  const atRate = usable.filter(item => item.sampleRate === 0 || item.sampleRate === targetRate);
  if (!atRate.length) return null;
  const sourceDepth = source.bitDepth;
  const ladder: ExclusivePcmFormat[] = sourceDepth != null && sourceDepth <= 16
    ? ['s16', 's24', 's32', 'f32']
    : sourceDepth != null && sourceDepth <= 24
      ? ['s24', 's32', 'f32']
      : sourceDepth != null
        ? ['s32', 'f32', 's24', 's16']
        : FORMAT_ORDER;
  const available = new Set(atRate.map(item => item.format));
  const format = ladder.find(candidate => available.has(candidate)) ?? atRate[0].format;
  const channelsUnknown = source.channels == null;
  const upmixed = !channelsUnknown && source.channels !== 2;
  const resampled = sourceRate == null || targetRate !== sourceRate || source.dsd;
  const depthPreserved = formatPreservesDepth(format, sourceDepth);
  const bitPerfect = source.lossless && !source.dsd && !resampled && depthPreserved &&
    sourceDepth != null && !upmixed && !channelsUnknown && source.channels === 2;
  return {
    format,
    sampleRate: targetRate,
    channels: 2,
    sourceSampleRate: source.sampleRateHz,
    sourceBitDepth: source.bitDepth,
    sourceChannels: source.channels,
    bitPerfect,
    resampled,
    depthPreserved,
    upmixed,
    channelsUnknown,
    dsd: source.dsd === true,
    lossless: source.lossless,
  };
}
