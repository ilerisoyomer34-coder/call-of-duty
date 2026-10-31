import {test} from 'node:test';import assert from 'node:assert/strict';
import {LEVELS} from '../src/config.js';import {campaignIndex,campaignUnlocked,nextCampaignLevel,recommendedLevel,normalizeCampaignProgress,completeCampaignLevel} from '../src/campaign.js';
import {SaveSystem,SAVE_KEY,freshSave} from '../src/save.js';import {memoryStore} from './helpers.mjs';
test('beş normal görev → belediye özel operasyonu → altıncı normal görev; 10 sonrası henüz eklenmedi',()=>{
 assert.deepEqual(LEVELS.map(l=>l.id),[1,2,3,4,5,11,6,7,8,9,10]);
 assert.equal(nextCampaignLevel(5).map,'municipality');assert.equal(nextCampaignLevel(11).id,6);assert.equal(nextCampaignLevel(10),null);assert.equal(nextCampaignLevel(999),null);
 assert.deepEqual(LEVELS.filter(l=>l.special).map(l=>l.afterMission),[5]);
 const p={unlocked:5,best:{},campaignOrder:1};assert.equal(campaignUnlocked(11,p),false);completeCampaignLevel(p,5);assert.equal(p.unlocked,6);assert.equal(recommendedLevel(p).id,11);assert.equal(campaignUnlocked(6,p),false);
 p.best[11]={score:100};completeCampaignLevel(p,11);assert.equal(p.unlocked,7);assert.equal(recommendedLevel(p).id,6);assert.equal(campaignUnlocked(6,p),true);
});
test('eski kayıt: normal görev kimlikleri, puanlar ve ödüller korunur; sıra bir kez taşınır',()=>{
 const best={5:{score:900},6:{score:1200}},old={...freshSave(),progress:{unlocked:8,best},missions:{6:{completed:true,stars:2}}};
 const store=memoryStore({[SAVE_KEY]:old}),s=new SaveSystem({store});normalizeCampaignProgress(s.data.progress);
 assert.equal(s.data.progress.unlocked,9);assert.equal(s.data.progress.best[6].score,1200);assert.equal(s.data.missions[6].stars,2);
 assert.equal(recommendedLevel(s.data.progress).id,11,'yeni özel görev eski oyuncuya da gösterilir');
 s.update(null,{now:true});const again=new SaveSystem({store});normalizeCampaignProgress(again.data.progress);assert.equal(again.data.progress.unlocked,9,'ikinci açılışta yeniden kaymaz');
});
