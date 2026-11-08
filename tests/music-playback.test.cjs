const test=require('node:test');
const assert=require('node:assert/strict');
const {normalizeMusicPlaybackMode,createMusicShuffleQueue,takeNextShuffleTrack,takePreviousShuffleTrack}=require('../dist-electron/main/music-playback.js');
test('legacy shuffle and repeat preferences migrate to one exclusive playback mode',()=>{
 assert.equal(normalizeMusicPlaybackMode(undefined,true,'one'),'shuffle');
 assert.equal(normalizeMusicPlaybackMode(undefined,false,'one'),'repeat-one');
 assert.equal(normalizeMusicPlaybackMode(undefined,false,'all'),'repeat-all');
 assert.equal(normalizeMusicPlaybackMode(undefined,false,'off'),'sequential');
 assert.equal(normalizeMusicPlaybackMode('shuffle',false,'one'),'shuffle');
 assert.equal(normalizeMusicPlaybackMode('repeat-all',true,'one'),'repeat-all');
 assert.equal(normalizeMusicPlaybackMode('unknown',false,'unknown'),'sequential');
});
test('shuffle bag visits every queued track once before starting a new round',()=>{
 const ids=['a','b','c','d','e'];let current=null,queue=createMusicShuffleQueue(ids,current,()=>.37),history=[];const played=[];
 for(let i=0;i<ids.length;i++){const s=takeNextShuffleTrack(ids,current,queue,history,()=>.37);assert.ok(s.trackId);played.push(s.trackId);current=s.trackId;queue=s.queue;history=s.history;}
 assert.equal(new Set(played).size,ids.length);assert.deepEqual([...played].sort(),[...ids].sort());
 const next=takeNextShuffleTrack(ids,current,queue,history,()=>.63);assert.ok(next.trackId);assert.notEqual(next.trackId,current);
 assert.equal(new Set([current,...next.history,...next.queue,next.trackId]).size,ids.length);
});
test('previous in shuffle mode walks backward and requeues the current song',()=>{
 const ids=['a','b','c','d'];let current=null,queue=createMusicShuffleQueue(ids,current,()=>.22),history=[];const played=[];
 for(let i=0;i<3;i++){const s=takeNextShuffleTrack(ids,current,queue,history,()=>.22);played.push(s.trackId);current=s.trackId;queue=s.queue;history=s.history;}
 const previous=takePreviousShuffleTrack(current,queue,history);assert.equal(previous.trackId,played[1]);assert.equal(previous.queue[0],current);
 const forward=takeNextShuffleTrack(ids,previous.trackId,previous.queue,previous.history,()=>.22);assert.equal(forward.trackId,current);
});
test('one-track shuffle queue safely repeats its only available track',()=>{
 const first=takeNextShuffleTrack(['only'],null,[],[],()=>.5);assert.equal(first.trackId,'only');
 const second=takeNextShuffleTrack(['only'],first.trackId,first.queue,first.history,()=>.5);assert.equal(second.trackId,'only');
});
