// Terminalin güvenliği kontrol noktasıyla birlikte saklanır; alarm yarıda bırakılıp tekrar başlatılamaz.
export class TerminalSecurity {
  constructor(relays = []) { this.ids = new Set(relays.map(r => r.id)); this.disabled = new Set(); this.alarm = false; }
  disable(id) { if (!this.ids.has(id) || this.disabled.has(id)) return false; this.disabled.add(id); return true; }
  canAccess(guards = 0) { return guards === 0 && this.disabled.size === this.ids.size; }
  begin() { if (this.alarm) return false; this.alarm = true; return true; }
  snapshot() { return { disabled: [...this.disabled], alarm: this.alarm }; }
  restore(saved) { this.disabled = new Set((saved?.disabled || []).filter(id => this.ids.has(id))); this.alarm = !!saved?.alarm; }
}
