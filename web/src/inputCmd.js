// Girdiden InputCmd (çok oyunculu belge §6.2, §7.1): oyuncunun niyeti — analog hareket, bakış, düğmeler.
// Aç/kapa ayarları (çömelme, koşu, nişan) burada çözülür: komut istenen durumu taşır, sunucu ayar bilmez.
// Zıplama bir basıştır: bir tick tüketene dek komutta kalır (144 Hz ekranda tick düşmeyen karede kaybolmasın).
import { BTN } from '../shared/sim/movement.js';
import { QUANT } from '../shared/constants.js';
import { quantize } from './util.js';

export function updateInputCmd(cmd, input, S, P) {
  const mv = input.move();
  const moving = Math.abs(mv.x) + Math.abs(mv.y) > 0.1;
  if (S.crouchMode === 'toggle') {
    if (input.pressed('crouch')) P.crouchToggle = !P.crouchToggle;
  } else P.crouchToggle = input.isDown('crouch');
  let sprintIn;
  if (S.sprintMode === 'toggle') {
    if (input.pressed('sprint')) P.sprintToggle = !P.sprintToggle;
    sprintIn = P.sprintToggle;
  } else sprintIn = input.isDown('sprint') || !!input.touch.sprint;
  // Dokunmatikte NİŞAN hep aç/kapa: başparmaklar bakış ve ateşle meşgulken düğme basılı tutulamaz
  if (input.touch.active || S.adsMode === 'toggle') {
    if (input.pressed('ads')) P.adsToggle = !P.adsToggle;
  } else P.adsToggle = input.isDown('ads');
  // İleri yürümeyi bırakınca aç/kapa koşu kapanır
  if (!moving || mv.y < 0.2) P.sprintToggle = false;

  let b = cmd.buttons & BTN.JUMP;
  if (input.pressed('jump')) b |= BTN.JUMP;
  if (P.crouchToggle) b |= BTN.CROUCH;
  if (sprintIn) b |= BTN.SPRINT;
  if (P.adsToggle) b |= BTN.ADS;
  if (input.isDown('fire')) b |= BTN.FIRE;
  if (input.pressed('reload')) b |= BTN.RELOAD;
  if (input.isDown('interact')) b |= BTN.USE;
  if (input.isDown('leanLeft')) b |= BTN.LEAN_L;
  if (input.isDown('leanRight')) b |= BTN.LEAN_R;
  if (input.pressed('melee')) b |= BTN.MELEE;
  cmd.buttons = b;
  // Analog hareket ağda i8 taşınır; tek oyunculu da aynı çözünürlüğü kullanır (telefon joystick'i dahil)
  cmd.moveX = quantize(mv.x, 1 / QUANT.move);
  cmd.moveY = quantize(mv.y, 1 / QUANT.move);
  cmd.yaw = P.yaw;
  cmd.pitch = P.pitch;
  return cmd;
}
