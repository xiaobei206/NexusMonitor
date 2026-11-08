import type { MusicPlaybackMode } from '../shared/types';
export interface MusicShuffleCycle { queue: string[]; history: string[]; }
export interface MusicShuffleSelection extends MusicShuffleCycle { trackId: string | null; }
const PLAYBACK_MODES = new Set<MusicPlaybackMode>(['shuffle','sequential','repeat-one','repeat-all']);
export function normalizeMusicPlaybackMode(value: unknown, legacyShuffle: unknown, legacyRepeat: unknown): MusicPlaybackMode {
  if (typeof value === 'string' && PLAYBACK_MODES.has(value as MusicPlaybackMode)) return value as MusicPlaybackMode;
  if (legacyShuffle === true) return 'shuffle';
  if (legacyRepeat === 'one') return 'repeat-one';
  if (legacyRepeat === 'all') return 'repeat-all';
  return 'sequential';
}
function shuffleIds(ids: string[], random: () => number): string[] {
  const result=[...new Set(ids)];
  for(let i=result.length-1;i>0;i--){
    const sample=Number(random()),safe=Number.isFinite(sample)?Math.max(0,Math.min(.999999999,sample)):0;
    const j=Math.floor(safe*(i+1));[result[i],result[j]]=[result[j],result[i]];
  }
  return result;
}
export function createMusicShuffleQueue(ids:string[],currentTrackId:string|null,random:()=>number=Math.random):string[]{
  const unique=[...new Set(ids)],items=currentTrackId&&unique.includes(currentTrackId)?unique.filter(id=>id!==currentTrackId):unique;
  return shuffleIds(items,random);
}
export function reconcileMusicShuffleCycle(ids:string[],currentTrackId:string|null,queue:string[],history:string[],random:()=>number=Math.random):MusicShuffleCycle{
  const valid=new Set(ids),current=currentTrackId&&valid.has(currentTrackId)?currentTrackId:null;
  const nextHistory:string[]=[],seen=new Set<string>(current?[current]:[]);
  for(const id of history)if(valid.has(id)&&!seen.has(id)){seen.add(id);nextHistory.push(id);}
  const nextQueue:string[]=[];
  for(const id of queue)if(valid.has(id)&&!seen.has(id)){seen.add(id);nextQueue.push(id);}
  nextQueue.push(...shuffleIds(ids.filter(id=>!seen.has(id)),random));
  return {queue:nextQueue,history:nextHistory};
}
export function takeNextShuffleTrack(ids:string[],currentTrackId:string|null,queue:string[],history:string[],random:()=>number=Math.random):MusicShuffleSelection{
  const cycle=reconcileMusicShuffleCycle(ids,currentTrackId,queue,history,random);
  let nextQueue=cycle.queue,nextHistory=cycle.history;
  // Begin a new round only after the current shuffle bag has been exhausted.
  if(!nextQueue.length){nextQueue=createMusicShuffleQueue(ids,currentTrackId,random);nextHistory=[];}
  const trackId=nextQueue.shift()??(currentTrackId&&ids.includes(currentTrackId)?currentTrackId:null);
  if(currentTrackId&&trackId&&currentTrackId!==trackId&&ids.includes(currentTrackId))nextHistory=[...nextHistory.filter(id=>id!==currentTrackId),currentTrackId];
  return {trackId,queue:nextQueue,history:nextHistory};
}
export function takePreviousShuffleTrack(currentTrackId:string|null,queue:string[],history:string[]):MusicShuffleSelection{
  if(!history.length)return {trackId:currentTrackId,queue:[...queue],history:[...history]};
  const previous=history[history.length-1],nextHistory=history.slice(0,-1),nextQueue=[...queue];
  if(currentTrackId&&currentTrackId!==previous&&!nextQueue.includes(currentTrackId))nextQueue.unshift(currentTrackId);
  return {trackId:previous,queue:nextQueue,history:nextHistory};
}
