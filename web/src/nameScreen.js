// Oyuncu adı ekranı (çok oyunculu S1): ilk açılışta ana menüden önce, sonra Ayarlar'dan ya da menüdeki
// "değiştir" bağlantısından. Ad kayıtta (save.data.profile.name); sunucuya bağlıyken çevrim içi kimlik de
// güncellenir (social.js PROFILE_CHANGED'i dinler). Kurallar istemci ve sunucuda aynı: shared/names.js.
import { validateName, NAME_ERRORS, displayName } from '../shared/names.js';
import { EV } from './events.js';

const $ = (id) => document.getElementById(id);

export class NameScreen {
  constructor(game, menus) {
    this.game = game;
    this.menus = menus;
    this.first = false;
    this.input = $('nameInput');
    this.hint = $('nameHint');
    this.ok = $('btnNameOk');
    this.cancel = $('btnNameCancel');
    this.input.addEventListener('input', () => this.check());
    $('nameForm').addEventListener('submit', (e) => {
      e.preventDefault();
      this.submit();
    });
    this.cancel.addEventListener('click', () => this.menus.back());
    $('btnMenuName')?.addEventListener('click', () => this.open(false));
    $('btnSetName')?.addEventListener('click', () => this.open(false));
  }

  get profile() {
    return this.game.save.data.profile;
  }

  // first: ilk açılış (vazgeçilemez, sonra ana menü); değilse geri dönülür
  open(first = false) {
    this.first = first;
    this.cancel.hidden = first;
    this.input.value = this.profile.name || '';
    this.check();
    this.menus.show('nameScreen', !first);
    // Dokunmatikte klavye ancak dokunuşla açılır; masaüstünde doğrudan yazılsın
    if (!this.game.input.touch.active) setTimeout(() => this.input.focus({ preventScroll: true }), 40);
  }

  check() {
    const raw = this.input.value;
    const r = validateName(raw);
    this.ok.disabled = !r.ok;
    if (!raw.trim()) {
      this.hint.textContent = '3–16 karakter · harf, rakam, boşluk, _ ve -';
      this.hint.className = 'nameHint';
    } else {
      this.hint.textContent = r.ok ? `Telsizde "${r.name}" olarak görüneceksin` : NAME_ERRORS[r.error];
      this.hint.className = `nameHint ${r.ok ? 'good' : 'bad'}`;
    }
    return r;
  }

  submit() {
    const r = this.check();
    if (!r.ok) return;
    const g = this.game;
    const P = this.profile;
    const changed = P.name !== r.name;
    g.save.update((d) => (d.profile.name = r.name), { now: true });
    g.audio.uiClick();
    this.input.blur();
    if (changed) g.events.emit(EV.PROFILE_CHANGED, { name: r.name, tag: P.tag });
    this.menus.refreshHello();
    if (this.first) {
      this.menus.show('menu', false);
      this.menus.stack = [];
    } else this.menus.back();
  }
}

// Telsiz ve rapor için oyuncunun görünen adı (yoksa tim çağrı kodu)
export function playerLabel(game, fallback) {
  return game.save?.data?.profile?.name || fallback;
}

// Menü ve çevrim içi ekranda etiketiyle
export function playerDisplay(game) {
  const P = game.save?.data?.profile;
  return P?.name ? displayName(P.name, P.tag) : '';
}
