/**
 * L'adresse locale d'un écusson.
 *
 * Les logos viennent du CDN d'un tiers. Les charger directement depuis les
 * pages a deux défauts, et le second est le seul qui compte vraiment :
 *
 *   • c'est lent — une centaine d'images de 59 Ko pour ouvrir un menu ;
 *   • l'antenne DÉPEND d'un service qu'on ne maîtrise pas. Un hoquet du CDN
 *     pendant une émission, et tous les écussons disparaissent de l'écran.
 *
 * On passe donc par notre serveur, qui les garde. Une fois un écusson chez
 * nous, il y reste : l'overlay peut tourner une soirée entière même si le CDN
 * tombe.
 *
 * La fonction est volontairement tolérante : pas d'adresse, pas de
 * transformation. Une donnée manquante ne doit jamais provoquer d'erreur.
 */
export function ecuLocal(url: string | null | undefined): string | undefined {
  if (!url) return undefined;
  // Déjà relative : c'est la nôtre, on n'y touche pas.
  if (!/^https?:/i.test(url)) return url;
  return `/api/ecu?u=${encodeURIComponent(url)}`;
}
