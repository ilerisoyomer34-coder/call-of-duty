// Olay adları (Operasyon Güncellemesi §6.4, §9.2). Sistemler birbirini doğrudan çağırmaz: game.events
// (util.js → Emitter) üzerinden bu adlarla yayımlar ve dinler. Adlar tek yerde durur ki yazım hatası
// sessizce hiç tetiklenmeyen bir dinleyici bırakmasın.
//  Eski olaylar (enemyKilled, allyDown, objective…) kendi adlarıyla sürer; yeni sistemler (görev, ekonomi,
//  yere düşme, komut) aşağıdaki adları kullanır. Yükler düz nesnedir: { alan: değer }.
export const EV = Object.freeze({
  MISSION_STARTED: 'MISSION_STARTED', // { missionId, levelId, difficulty }
  MISSION_ENDED: 'MISSION_ENDED', // { missionId, levelId, success, timeSec }
  ENEMY_KILLED: 'ENEMY_KILLED', // { weaponId, slot, headshot, distance, armorBroken, underSuppression, killer, enemyType }
  DAMAGE_TAKEN: 'DAMAGE_TAKEN', // { target, targetType, rawDamage, absorbed, healthDamage, hitZone }
  ARMOR_BROKEN: 'ARMOR_BROKEN', // { target, targetType, piece, by }
  PLAYER_DOWNED: 'PLAYER_DOWNED', // { downCount }
  PLAYER_REVIVED: 'PLAYER_REVIVED', // { by }  ('adrenaline' ya da asker çağrı kodu)
  PLAYER_DIED: 'PLAYER_DIED', // { reason }
  ALLY_DOWNED: 'ALLY_DOWNED', // { allyId }
  ALLY_REVIVED: 'ALLY_REVIVED', // { allyId, by }  ('player' ya da asker çağrı kodu)
  ALLY_DIED: 'ALLY_DIED', // { allyId }
  COMMAND_ISSUED: 'COMMAND_ISSUED', // { commandId, addressees, target, inputMethod, sourceText }
  COMMAND_COMPLETED: 'COMMAND_COMPLETED', // { commandId, addressees }
  COMMAND_FAILED: 'COMMAND_FAILED', // { commandId, addressees, reason }
  ITEM_USED: 'ITEM_USED', // { itemId }
  OBJECTIVE_COMPLETED: 'OBJECTIVE_COMPLETED', // { objectiveId }
  CREDITS_CHANGED: 'CREDITS_CHANGED', // { credits, delta, reason }
  // Çevrim içi ve kimlik (çok oyunculu S1–S3)
  PROFILE_CHANGED: 'PROFILE_CHANGED', // { name, tag }
  SOCIAL_STATUS: 'SOCIAL_STATUS', // { status: 'off' | 'connecting' | 'online' | 'error', reason }
  FRIENDS_CHANGED: 'FRIENDS_CHANGED', // { friends, incoming, outgoing }
  NOTIFICATION: 'NOTIFICATION', // { id, kind, from, payload }
  PARTY_CHANGED: 'PARTY_CHANGED', // { party | null }
});
