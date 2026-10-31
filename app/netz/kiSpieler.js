// KI-Platz auf dem Gastgeber-Gerät (Spec 013, 015). Sie sitzt wie ein Mensch am anderen Ende eines Kanals und bekommt
// nur Tisch und Sicht ihres Platzes; der Gastgeber prüft ihre Züge wie jeden anderen (netz-sicherheit, Wiederverbinden
// Regel 9). Gerechnet wird mit der guten KI (Web Worker, von außen gegeben); fällt sie aus, zieht die Notfall-KI.
import { kiZug } from "../kern/ki/notfall.js";
import { Mitspieler } from "./mitspieler.js";
/** So lange wartet die KI vor jedem Zug, damit man ihre Karte landen sieht (Spec 013, freigegeben 2026-10-28). */
export const KI_VERZOEGERUNG_MS = 800;
/** Antwortet die gute KI nicht so schnell, zieht für diesen Zug die Notfall-KI (Spec 015). */
export const KI_ZEITLIMIT_MS = 2000;
function mitZeitlimit(p, ms) {
    return new Promise((ok, fehler) => {
        const uhr = setTimeout(() => fehler(new Error("Zeitlimit")), ms);
        p.then((x) => { clearTimeout(uhr); ok(x); }, (f) => { clearTimeout(uhr); fehler(f); });
    });
}
export class KiSpieler {
    kanal;
    profil;
    verzoegerung;
    rechner;
    zeitlimit;
    client;
    laeuft = false;
    beendet = false;
    /** Auf jede Sicht nur einmal handeln: Ein Tisch-Update ohne neue Sicht darf keinen zweiten Zug auslösen. */
    gehandelt = null;
    constructor(kanal, profil, verzoegerung = KI_VERZOEGERUNG_MS, rechner = null, zeitlimit = KI_ZEITLIMIT_MS) {
        this.kanal = kanal;
        this.profil = profil;
        this.verzoegerung = verzoegerung;
        this.rechner = rechner;
        this.zeitlimit = zeitlimit;
        this.client = new Mitspieler(kanal);
        this.client.beiAenderung = () => void this.plane();
    }
    async plane() {
        if (this.laeuft || this.beendet)
            return;
        const s = this.client.sicht;
        // Die Notfall-KI sagt schnell, ob es überhaupt etwas zu tun gibt.
        if (!s || s === this.gehandelt || !kiZug(s, this.profil))
            return;
        this.laeuft = true;
        const start = Date.now();
        let zug;
        try {
            zug = this.rechner ? await mitZeitlimit(this.rechner(s, this.profil), this.zeitlimit) : kiZug(s, this.profil);
        }
        catch {
            zug = kiZug(s, this.profil);
        }
        if (!zug && this.rechner)
            zug = kiZug(s, this.profil);
        // Die Pause zählt ab Beginn der Rechnung: Wer lange gerechnet hat, wartet nicht noch extra.
        await new Promise((r) => setTimeout(r, Math.max(0, this.verzoegerung - (Date.now() - start))));
        this.laeuft = false;
        if (this.beendet)
            return;
        if (this.client.sicht !== s) {
            void this.plane();
            return;
        }
        if (!zug)
            return;
        this.gehandelt = s;
        this.client.aktion(zug);
    }
    beende() {
        this.beendet = true;
        this.kanal.schliessen();
    }
}
//# sourceMappingURL=kiSpieler.js.map