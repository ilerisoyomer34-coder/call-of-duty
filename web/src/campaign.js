// Kimlikler kayıtlarda sabittir; kampanya sırası ayrı tutulur (5 → özel belediye → 6).
import {LEVELS} from './config.js';
export const campaignIndex = id => LEVELS.findIndex(l => l.id === id);
export const nextCampaignLevel = id => campaignIndex(id) < 0 ? null : LEVELS[campaignIndex(id) + 1] || null;
export const levelLabel = l => l?.special ? 'Özel Operasyon' : `Seviye ${l?.id}`;
export const campaignUnlocked = (id,p) => campaignIndex(id) >= 0 && campaignIndex(id) < p.unlocked;
export const recommendedLevel = p => LEVELS.find(l=>l.special && campaignUnlocked(l.id,p) && !p.best?.[l.id]) || LEVELS[Math.max(0,Math.min(LEVELS.length-1,(p.unlocked||1)-1))];
export function normalizeCampaignProgress(p) {
  // Önceki sırada açılmış normal görevler ve tüm puanlar korunur. Yalnız sıra sayacı bir kez taşınır.
  if (p.campaignOrder !== 1) {
    if (p.unlocked >= 6 && p.unlocked <= 10) p.unlocked++;
    p.campaignOrder = 1;
  }
  p.unlocked = Math.max(1,Math.min(LEVELS.length,Math.floor(p.unlocked||1)));
  return p;
}
export function completeCampaignLevel(p,id) {
  const i=campaignIndex(id), first=p.unlocked<=i+1 && i<LEVELS.length-1;
  p.unlocked=Math.max(p.unlocked,Math.min(LEVELS.length,i+2));
  return {next:nextCampaignLevel(id),firstClear:first};
}
