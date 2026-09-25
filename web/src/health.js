// Sağlık bileşeni (UHealthComponent karşılığı): oyuncu ve düşmanlar aynı sınıfı kullanır.
import { Emitter } from './util.js';

export class Health extends Emitter {
  constructor(max, armor = 0) {
    super();
    this.max = max;
    this.hp = max;
    this.maxArmor = armor;
    this.armor = armor;
  }
  get dead() {
    return this.hp <= 0;
  }
  get ratio() {
    return this.hp / this.max;
  }
  // Zırh hasarın %60'ını emer; dönüş: gerçekten uygulanan can hasarı.
  damage(amount, info = null) {
    if (this.dead || amount <= 0) return 0;
    let a = amount;
    if (this.armor > 0) {
      const absorbed = Math.min(this.armor, a * 0.6);
      this.armor -= absorbed;
      a -= absorbed;
    }
    const before = this.hp;
    this.hp = Math.max(0, this.hp - a);
    this.emit('changed', this.hp, this.max, info);
    if (this.hp <= 0 && before > 0) this.emit('death', info);
    return before - this.hp;
  }
  heal(n) {
    if (this.dead) return;
    const before = this.hp;
    this.hp = Math.min(this.max, this.hp + n);
    if (this.hp !== before) this.emit('changed', this.hp, this.max, null);
  }
  reset() {
    this.hp = this.max;
    this.armor = this.maxArmor;
    this.emit('changed', this.hp, this.max, null);
  }
}
