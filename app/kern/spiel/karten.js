// Karten und Mischen (Spec 008). Regeln: .claude/skills/doppelkopf-regeln/grundregeln.md (2.2, 2.3).
export const FARBEN = ["kreuz", "pik", "herz", "karo"];
const WERTE = ["A", "10", "K", "D", "B", "9"];
const AUGEN = { A: 11, "10": 10, K: 4, D: 3, B: 2, "9": 0 };
export function karte(id) {
    const [farbe, wert] = id.split("-");
    return { id, farbe, wert };
}
export function augen(id) {
    return AUGEN[karte(id).wert];
}
/** 48 Karten mit Neunen, sonst 40, in fester Reihenfolge. */
export function kartensatz(mitNeunen) {
    const ids = [];
    for (const farbe of FARBEN) {
        for (const wert of WERTE) {
            if (wert === "9" && !mitNeunen)
                continue;
            ids.push(`${farbe}-${wert}-a`, `${farbe}-${wert}-b`);
        }
    }
    return ids;
}
// ---------- Zufall ----------
/** 128 Bit Zufall als Hex-Text, aus crypto.getRandomValues. */
export function neuerSeed() {
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
}
/** Fester Zufallsgenerator (sfc32) aus einem 128-Bit-Seed. Gleicher Seed, gleiche Folge. */
function generator(seed) {
    if (!/^[0-9a-f]{32}$/.test(seed))
        throw new Error("Seed muss 32 Hex-Zeichen haben");
    let [a, b, c, d] = [0, 8, 16, 24].map((i) => Number.parseInt(seed.slice(i, i + 8), 16) >>> 0);
    const naechste = () => {
        a >>>= 0;
        b >>>= 0;
        c >>>= 0;
        d >>>= 0;
        let t = (a + b) | 0;
        a = b ^ (b >>> 9);
        b = (c + (c << 3)) | 0;
        c = (c << 21) | (c >>> 11);
        d = (d + 1) | 0;
        t = (t + d) | 0;
        c = (c + t) | 0;
        return (t >>> 0) / 4294967296;
    };
    for (let i = 0; i < 20; i++)
        naechste(); // Anlaufen lassen
    return naechste;
}
/** Fisher-Yates mit festem Generator. */
export function mische(ids, seed) {
    const zufall = generator(seed);
    const neu = [...ids];
    for (let i = neu.length - 1; i > 0; i--) {
        const j = Math.floor(zufall() * (i + 1));
        [neu[i], neu[j]] = [neu[j], neu[i]];
    }
    return neu;
}
/** Vier Hände zu je 12 (bzw. 10) Karten, Index 0 = Platz 1. */
export function teile(ids) {
    const je = ids.length / 4;
    return [0, 1, 2, 3].map((p) => ids.slice(p * je, (p + 1) * je));
}
//# sourceMappingURL=karten.js.map