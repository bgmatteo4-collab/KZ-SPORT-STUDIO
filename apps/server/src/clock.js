/**
 * L'horloge du serveur. C'est elle qui définit « maintenant » pour tout le monde.
 *
 * Elle a une ÉCHELLE. En direct elle vaut 1. En rejeu accéléré elle vaut 20, et
 * alors le temps du match s'écoule vingt fois plus vite — y compris les
 * horodatages des événements, le décalage anti-spoiler et le chrono. Tout reste
 * cohérent, et un match de 90 minutes se répète en quatre minutes et demie.
 *
 * Changer l'échelle recale l'origine : le temps ne saute jamais.
 */
export class ServerClock {
    originReal = Date.now();
    originVirtual = Date.now();
    currentScale;
    constructor(scale = 1) {
        this.currentScale = scale > 0 ? scale : 1;
    }
    now() {
        return this.originVirtual + (Date.now() - this.originReal) * this.currentScale;
    }
    get scale() {
        return this.currentScale;
    }
    setScale(scale) {
        if (scale <= 0 || scale === this.currentScale)
            return;
        this.originVirtual = this.now();
        this.originReal = Date.now();
        this.currentScale = scale;
    }
}
