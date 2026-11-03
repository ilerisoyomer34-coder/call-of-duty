// Sunucu kimlik kanıtı (Docs/SECURITY_TR.md §2): sunucu, oyunun gönderdiği rastgele meydan okumayı kendi kalıcı
// anahtarıyla imzalar; oyun imzayı doğrular ve anahtarı o sunucu kimliğine sabitler. İmzalanan metin sunucu ve oyunda
// aynı olmalı (sunucu: server/db.js → proveIdentity, oyun: src/net/servers.js → verifyServerProof)
export const PROOF_CONTEXT = 'demirsafak-sunucu-kimligi-v1';
// Meydan okuma: base64url, 16–64 karakter (oyun 18 rastgele bayt = 24 karakter gönderir)
export const CHALLENGE_RE = /^[A-Za-z0-9_-]{16,64}$/;

// Bağlam öneki: imza yalnız bu amaçla kullanılabilir (başka bir protokolün imzası olarak yeniden oynatılamaz)
export function proofMessage(serverId, challenge) {
  return `${PROOF_CONTEXT}\n${serverId}\n${challenge}`;
}
