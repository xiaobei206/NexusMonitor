import type { MusicTrack } from '../shared/types';
export type ExclusivePcmFormat = 's16' | 's24' | 's32' | 'f32';
export interface ExclusiveDeviceFormat { format: ExclusivePcmFormat; channels: number; sampleRate: number; }
export interface ExclusiveSourceFormat {
  path?: string; format?: string | null; sampleRateHz: number | null; bitDepth: number | null;
  channels: number | null; lossless: boolean; dsd?: boolean;
}
export interface ExclusiveNegotiatedFormat {
  format: ExclusivePcmFormat; sampleRate: number; channels: 1 | 2;
  sourceSampleRate: number | null; sourceBitDepth: number | null; sourceChannels: number | null;
  bitPerfect: boolean; resampled: boolean; depthPreserved: boolean;
  upmixed: boolean; downmixed: boolean; channelsUnknown: boolean; dsd: boolean; lossless: boolean;
}
const FORMAT_ORDER: ExclusivePcmFormat[] = ['f32','s32','s24','s16'];
const LOSSLESS_EXTENSIONS = new Set(['.flac','.wav']);
export function classifyExclusiveSource(track: Pick<MusicTrack,'path'|'format'|'sampleRateHz'|'bitDepth'|'channels'>): ExclusiveSourceFormat {
  const extension=(track.format||track.path.slice(track.path.lastIndexOf('.')+1)).toLowerCase();
  const normalized=extension.startsWith('.')?extension:\`.\${extension}\`;
  return {path:track.path,format:normalized.slice(1).toUpperCase(),
    sampleRateHz:typeof track.sampleRateHz==='number'&&Number.isFinite(track.sampleRateHz)&&track.sampleRateHz>0?track.sampleRateHz:null,
    bitDepth:typeof track.bitDepth==='number'&&Number.isFinite(track.bitDepth)&&track.bitDepth>0?track.bitDepth:null,
    channels:typeof track.channels==='number'&&Number.isFinite(track.channels)&&track.channels>0?track.channels:null,
    lossless:LOSSLESS_EXTENSIONS.has(normalized),dsd:normalized==='.dsf'||normalized==='.dff'};
}
function formatPreservesDepth(format:ExclusivePcmFormat,depth:number|null):boolean {
  if(depth==null)return format==='f32'||format==='s32';if(depth<=16)return true;if(depth<=24)return format!=='s16';return format==='s32';
}
/** Stereo is preferred; mono-only endpoints are supported by native L/R downmix. */
export function chooseExclusiveFormat(source:ExclusiveSourceFormat,formats:ExclusiveDeviceFormat[],preferredTransportSampleRate?:number):ExclusiveNegotiatedFormat|null {
  const usable=formats.filter(item=>['s16','s24','s32','f32'].includes(item.format)&&(item.channels===0||item.channels===1||item.channels===2)&&Number.isInteger(item.sampleRate)&&item.sampleRate>=0);
  if(!usable.length)return null;
  const rates=[...new Set(usable.map(x=>x.sampleRate).filter(x=>x>0))],wildcard=usable.some(x=>x.sampleRate===0);
  const sourceRate=source.dsd?88200:source.sampleRateHz;
  const requested=Number.isInteger(preferredTransportSampleRate)&&Number(preferredTransportSampleRate)>0?Number(preferredTransportSampleRate):null;
  let targetRate:number;
  if(requested!=null){if(!wildcard&&!rates.includes(requested))return null;targetRate=requested;}
  else if(sourceRate!=null&&(wildcard||rates.includes(sourceRate)))targetRate=sourceRate;
  else if(sourceRate!=null){const above=rates.filter(x=>x>sourceRate).sort((a,b)=>a-b)[0],below=rates.filter(x=>x<sourceRate).sort((a,b)=>b-a)[0];targetRate=above??below??(wildcard?sourceRate:48000);}
  else targetRate=rates.sort((a,b)=>b-a)[0]??48000;
  const atRate=usable.filter(x=>x.sampleRate===0||x.sampleRate===targetRate);if(!atRate.length)return null;
  const stereo=atRate.filter(x=>x.channels===0||x.channels===2),mono=atRate.filter(x=>x.channels===1);
  const channels:1|2=stereo.length?2:mono.length?1:2,selected=channels===2?stereo:mono;if(!selected.length)return null;
  const depth=source.bitDepth;
  const ladder:ExclusivePcmFormat[]=depth!=null&&depth<=16?['s16','s24','s32','f32']:depth!=null&&depth<=24?['s24','s32','f32']:depth!=null?['s32','f32','s24','s16']:FORMAT_ORDER;
  const available=new Set(selected.map(x=>x.format)),format=ladder.find(x=>available.has(x))??selected[0].format;
  const channelsUnknown=source.channels==null,upmixed=!channelsUnknown&&source.channels===1&&channels===2,downmixed=!channelsUnknown&&source.channels===2&&channels===1;
  const resampled=sourceRate==null||targetRate!==sourceRate||source.dsd===true,depthPreserved=formatPreservesDepth(format,depth);
  const bitPerfect=source.lossless&&!source.dsd&&!resampled&&depthPreserved&&depth!=null&&!upmixed&&!downmixed&&!channelsUnknown&&source.channels===channels;
  return {format,sampleRate:targetRate,channels,sourceSampleRate:source.sampleRateHz,sourceBitDepth:source.bitDepth,sourceChannels:source.channels,
    bitPerfect,resampled,depthPreserved,upmixed,downmixed,channelsUnknown,dsd:source.dsd===true,lossless:source.lossless};
}
