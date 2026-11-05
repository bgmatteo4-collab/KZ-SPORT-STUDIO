/** Fabrique d'éléments, pour que les widgets restent lisibles. */
export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Record<string, string> = {},
  children: (Node | string)[] = [],
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (key === 'class') el.className = value;
    else el.setAttribute(key, value);
  }
  for (const child of children) {
    el.append(typeof child === 'string' ? document.createTextNode(child) : child);
  }
  return el;
}

/**
 * N'écrit dans le DOM que si la valeur a changé.
 *
 * Appelée soixante fois par seconde par chaque widget, c'est elle qui évite
 * de faire travailler le navigateur pour rien — et donc les saccades dans OBS.
 */
export function setText(el: HTMLElement, value: string): void {
  if (el.textContent !== value) el.textContent = value;
}

export function setAttr(el: HTMLElement, name: string, value: string): void {
  if (el.getAttribute(name) !== value) el.setAttribute(name, value);
}

/** Barre de proportion : on bouge une échelle, jamais une largeur. */
export function setScaleX(el: HTMLElement, ratio: number): void {
  const clamped = Math.min(1, Math.max(0, ratio));
  const next = `scaleX(${clamped.toFixed(4)})`;
  if (el.style.transform !== next) el.style.transform = next;
}
