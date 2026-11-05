/**
 * Le chrono. C'est la pièce qui faisait sauter les versions précédentes.
 *
 * Le fournisseur annonce « minute 34 » toutes les 15 à 30 secondes. Écrire cette
 * valeur à l'écran produit un chrono qui saute. On ne le fait donc jamais : on
 * pose un ANCRAGE (chrono du match à un instant mural donné) et on fait tourner
 * l'horloge localement entre deux ancrages.
 */

import { PHASE_CLOCK_END, PHASE_CLOCK_START, type ClockState, type MatchPhase } from './types.js';

export function initialClock(): ClockState {
  return { wallMs: 0, matchMs: 0, running: false, phase: 'pre', addedMinutes: 0 };
}

/** Chrono du match à l'instant mural `t`, déduit de l'ancrage. Déterministe. */
export function matchClockAt(clock: ClockState, t: number): number {
  if (!clock.running) return clock.matchMs;
  return Math.max(0, clock.matchMs + (t - clock.wallMs));
}

/**
 * L'affichage d'antenne : « 67:23 », et le temps additionnel séparément pour
 * pouvoir le styler autrement (« 45:00 » + « +2 »).
 */
export function clockLabel(
  matchMs: number,
  phase: MatchPhase,
  addedMinutes = 0,
): { main: string; added: string | null } {
  const regulationEnd = PHASE_CLOCK_END[phase];

  if (phase === 'pre') return { main: '0:00', added: null };
  if (phase === 'half_time') return { main: 'MT', added: null };
  if (phase === 'extra_break' || phase === 'extra_half') return { main: 'MT', added: null };
  if (phase === 'full_time') return { main: 'FIN', added: null };
  if (phase === 'penalties') return { main: 'TAB', added: null };

  // En temps additionnel le chrono d'antenne se fige à la minute réglementaire
  // et le dépassement part dans le « + ». C'est la convention télé.
  if (regulationEnd !== undefined && matchMs > regulationEnd) {
    const overflow = matchMs - regulationEnd;
    const extra = Math.max(1, Math.ceil(overflow / 60_000));
    return { main: formatMs(regulationEnd), added: `+${extra}` };
  }

  const added = addedMinutes > 0 ? `+${addedMinutes}` : null;
  return { main: formatMs(matchMs), added };
}

export function formatMs(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

/**
 * La minute d'un fait de jeu, à la convention du football : « 47' », « 45+2' ».
 */
export function minuteLabel(matchMs: number, phase: MatchPhase): string {
  const regulationEnd = PHASE_CLOCK_END[phase];
  if (regulationEnd !== undefined && matchMs > regulationEnd) {
    const extra = Math.max(1, Math.ceil((matchMs - regulationEnd) / 60_000));
    return `${regulationEnd / 60_000}+${extra}`;
  }
  const start = PHASE_CLOCK_START[phase] ?? 0;
  const minute = Math.floor(matchMs / 60_000) + 1;
  return String(Math.max(Math.floor(start / 60_000) + 1, minute));
}

/**
 * Le chrono affiché, côté rendu.
 *
 * Deux responsabilités que le réducteur ne peut pas assurer, parce qu'il doit
 * rester pur et déterministe :
 *
 *   1. LISSER les corrections. Un écart de moins de `snapThreshold` est résorbé
 *      progressivement plutôt que d'un coup.
 *   2. Garantir la MONOTONIE. Un chrono d'antenne ne recule jamais — sauf
 *      changement de période ou saut volontaire (`reset`).
 */
export class SmoothClock {
  private displayed = 0;
  private phase: MatchPhase = 'pre';
  private lastFrame = 0;

  constructor(
    /** Au-delà de cet écart, on considère que c'est une vraie correction d'arbitrage. */
    private readonly snapThreshold = 5_000,
    /** Vitesse de résorption : fraction de l'écart reprise par seconde. */
    private readonly catchUpRate = 0.5,
  ) {}

  /** Saut assumé : rechargement, changement de délai, changement de période. */
  reset(targetMs: number, phase: MatchPhase, nowMs: number): void {
    this.displayed = targetMs;
    this.phase = phase;
    this.lastFrame = nowMs;
  }

  /** À appeler une fois par image. `targetMs` vient de `matchClockAt`. */
  tick(targetMs: number, phase: MatchPhase, nowMs: number): number {
    if (phase !== this.phase) {
      this.reset(targetMs, phase, nowMs);
      return this.displayed;
    }

    const dt = this.lastFrame === 0 ? 0 : Math.max(0, nowMs - this.lastFrame);
    this.lastFrame = nowMs;

    const drift = targetMs - this.displayed;

    if (Math.abs(drift) > this.snapThreshold) {
      this.displayed = targetMs;
      return this.displayed;
    }

    // Avance naturelle, plus une fraction de l'écart. Le chrono reste fluide
    // et rejoint la vérité sans que personne ne voie de saut.
    const correction = drift * Math.min(1, (this.catchUpRate * dt) / 1000);
    const next = this.displayed + dt + correction;

    this.displayed = Math.max(this.displayed, next);
    return this.displayed;
  }

  get value(): number {
    return this.displayed;
  }
}

/**
 * Estimation du décalage entre l'horloge du navigateur et celle du serveur,
 * à la manière de NTP. Sans ça, un navigateur mal réglé affiche le match
 * décalé de plusieurs secondes sans que personne ne comprenne pourquoi.
 */
export class ClockSync {
  private offsets: number[] = [];
  private offset = 0;
  private scale = 1;
  /** Dernier point de calage : heure serveur et heure locale au même instant. */
  private serverAnchor = 0;
  private localAnchor = 0;

  /** À appeler avec le résultat d'un aller-retour serveur. */
  sample(sentAt: number, serverTime: number, receivedAt: number): void {
    const roundTrip = receivedAt - sentAt;
    const estimate = serverTime + roundTrip / 2 - receivedAt;
    this.offsets.push(estimate);
    if (this.offsets.length > 9) this.offsets.shift();

    // Médiane : un aller-retour anormalement lent ne pollue pas l'estimation.
    const sorted = [...this.offsets].sort((a, b) => a - b);
    this.offset = sorted[Math.floor(sorted.length / 2)] ?? 0;

    this.serverAnchor = serverTime + roundTrip / 2;
    this.localAnchor = receivedAt;
  }

  /**
   * L'échelle de temps du serveur. 1 en direct, 20 en rejeu accéléré.
   * Sans elle, un rejeu rapide décale tout l'affichage.
   */
  setScale(scale: number): void {
    if (scale > 0 && scale !== this.scale) {
      // On recale avant de changer de pente, sinon le saut est visible.
      this.serverAnchor = this.now();
      this.localAnchor = Date.now();
      this.scale = scale;
    }
  }

  /** L'heure du serveur, vue d'ici, à la bonne vitesse. */
  now(): number {
    if (this.localAnchor === 0) return Date.now() + this.offset;
    return this.serverAnchor + (Date.now() - this.localAnchor) * this.scale;
  }

  get currentOffset(): number {
    return this.offset;
  }

  get currentScale(): number {
    return this.scale;
  }

  get samples(): number {
    return this.offsets.length;
  }
}
