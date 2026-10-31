// Rangfolge, Bedienpflicht und Stichgewinner (Spec 008, 014; grundregeln.md 2.3, 5.3.3).
// Stille Hochzeit und Hochzeit ohne Partner sind Karo-Soli: Deren Trumpf ist derselbe wie im Normalspiel.
import { karte } from "./karten.js";
export const SOLOARTEN = ["damen", "buben", "fleischlos", "kreuz", "pik", "herz", "karo"];
const NORMAL = { trumpf: "normal" };
const DAMEN = ["kreuz-D", "pik-D", "herz-D", "karo-D"];
const BUBEN = ["kreuz-B", "pik-B", "herz-B", "karo-B"];
/** Fehl von hoch nach niedrig; Trumpfkarten fallen heraus. */
const FEHL_RANG = ["A", "10", "K", "D", "B", "9"];
/** Trumpf von hoch nach niedrig, ohne Kopie-Kennung. */
function trumpfFolge(k) {
    const farbe = (f) => ["A", "10", "K", "9"].map((w) => `${f}-${w}`);
    let folge;
    switch (k.trumpf) {
        case "damen":
            folge = [...DAMEN];
            break;
        case "buben":
            folge = [...BUBEN];
            break;
        case "fleischlos":
            folge = [];
            break;
        case "normal":
        case "karo":
            folge = ["herz-10", ...DAMEN, ...BUBEN, ...farbe("karo")];
            break;
        // Farbsolo (2.3.5): Herz-10 bleibt oben, beim Herz-Solo fällt sie in der Farbe weg.
        default: folge = ["herz-10", ...DAMEN, ...BUBEN, ...farbe(k.trumpf).filter((x) => x !== "herz-10")];
    }
    if (k.schweinchen && (k.trumpf === "normal" || k.trumpf === "karo"))
        folge = ["karo-A", ...folge.filter((x) => x !== "karo-A")];
    return folge;
}
const ohneKopie = (id) => id.slice(0, id.lastIndexOf("-"));
const folgen = new Map();
function folgeFuer(k) {
    const schluessel = `${k.trumpf}${k.schweinchen ? "+s" : ""}`;
    let f = folgen.get(schluessel);
    if (!f) {
        f = trumpfFolge(k);
        folgen.set(schluessel, f);
    }
    return f;
}
export function istTrumpf(id, k = NORMAL) {
    return folgeFuer(k).includes(ohneKopie(id));
}
/** „Farbe“ für die Bedienpflicht: Trumpf zählt als eigene Farbe. */
export function bedienFarbe(id, k = NORMAL) {
    return istTrumpf(id, k) ? "trumpf" : karte(id).farbe;
}
/** Erlaubte Karten: Wer die ausgespielte Farbe hat, muss bedienen. */
export function erlaubteKarten(hand, stich, k = NORMAL) {
    const erste = stich[0];
    if (!erste)
        return [...hand];
    const farbe = bedienFarbe(erste, k);
    const bedienen = hand.filter((x) => bedienFarbe(x, k) === farbe);
    return bedienen.length > 0 ? bedienen : [...hand];
}
/**
 * Index der gewinnenden Karte im Stich (0 = ausgespielt).
 * Gleiche Karten: Die zuerst gespielte ist höher (5.3.3), außer die zweite Dulle nach Profil, solange sie Trumpf ist.
 */
export function stichGewinner(stich, zweiteDulle, letzterStich, k = NORMAL) {
    const folge = folgeFuer(k);
    const farbe = bedienFarbe(stich[0], k);
    const dulleSchlaegt = (zweiteDulle === "immer" || (zweiteDulle === "ausserLetzterStich" && !letzterStich)) && folge.includes("herz-10");
    // Kleinere Zahl = stärker. Fehl, das nicht bedient, kann nie gewinnen.
    const staerke = (id) => {
        if (istTrumpf(id, k))
            return folge.indexOf(ohneKopie(id));
        if (bedienFarbe(id, k) === farbe)
            return 100 + FEHL_RANG.indexOf(karte(id).wert);
        return 1000;
    };
    let beste = 0;
    for (let i = 1; i < stich.length; i++) {
        const a = staerke(stich[i]);
        const b = staerke(stich[beste]);
        if (a < b || (a === b && dulleSchlaegt && ohneKopie(stich[i]) === "herz-10"))
            beste = i;
    }
    return beste;
}
/** Stärke einer Karte (kleiner = stärker): Trumpf nach Rang, Fehl dahinter nach Wert, ohne Bezug auf einen Stich. Für die KI (Spec 013). */
export function rang(id, k = NORMAL) {
    return istTrumpf(id, k) ? folgeFuer(k).indexOf(ohneKopie(id)) : 100 + FEHL_RANG.indexOf(karte(id).wert);
}
/** Sortierung für die Anzeige der eigenen Hand: Trumpf hoch → niedrig, dann Kreuz, Pik, Herz, Karo. */
export function sortiereHand(hand, k = NORMAL) {
    const folge = folgeFuer(k);
    const schluessel = (id) => (istTrumpf(id, k) ? folge.indexOf(ohneKopie(id)) : 100 + ["kreuz", "pik", "herz", "karo"].indexOf(karte(id).farbe) * 10 + FEHL_RANG.indexOf(karte(id).wert));
    return [...hand].sort((a, b) => schluessel(a) - schluessel(b) || (a < b ? -1 : 1));
}
/** Anzahl Trumpf einer Hand im Normalspiel, für die Armut. Füchse nach Schalter mitzählen oder nicht. */
export function trumpfZahl(hand, fuechseZaehlen) {
    return hand.filter((x) => istTrumpf(x) && (fuechseZaehlen || ohneKopie(x) !== "karo-A")).length;
}
//# sourceMappingURL=stich.js.map