// Kartensätze (Spec 011): Was man von einer Karte sieht, kommt aus Daten. Die Spiellogik kennt nur kreuz/pik/herz/karo
// und A…9; der Kartensatz liefert Namen, Kürzel, Symbole und Farben. Reines TS ohne DOM.
import { pruefeEindeutig, pruefeFarbsehen, pruefeGestaltung, pruefeLesbarkeit } from "./kartengestaltung.js";
export const KARTENPAPIER = "#FBF8F1";
const MIN_KONTRAST = 4.5;
const FARBEN = ["kreuz", "pik", "herz", "karo"];
const WERTE = ["A", "10", "K", "D", "B", "9"];
export function kartenAnsicht(id, satz) {
    const [farbe, wert] = id.split("-");
    const f = satz.farben[farbe];
    const w = satz.werte[wert];
    // Deutsches Blatt (auch eigene Kopien davon): „Eichel-Ober“.
    const trenner = satz.id === "deutsch" || satz.werte.D.name === "Ober" ? "-" : " ";
    return { rang: w.kurz, farbe: f.farbe, symbol: f.symbol, box: f.box ?? "0 0 24 24", name: `${f.name}${trenner}${w.name}` };
}
/** Name einer Farbe im Satz, z. B. für „Eichel bedienen“. */
export function farbName(farbe, satz) {
    return satz.farben[farbe].name;
}
// ---------- Kontrast nach WCAG 2.x ----------
function leuchtdichte(hex) {
    const kanal = (i) => {
        const c = Number.parseInt(hex.slice(i, i + 2), 16) / 255;
        return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    };
    return 0.2126 * kanal(1) + 0.7152 * kanal(3) + 0.0722 * kanal(5);
}
export function kontrast(a, b) {
    const [hell, dunkel] = [leuchtdichte(a), leuchtdichte(b)].sort((x, y) => y - x);
    return (hell + 0.05) / (dunkel + 0.05);
}
// ---------- Prüfung ----------
const istHex = (w) => typeof w === "string" && /^#[0-9A-Fa-f]{6}$/.test(w);
const istText = (w, max) => typeof w === "string" && w.trim().length > 0 && w.length <= max;
const istObjekt = (w) => typeof w === "object" && w !== null && !Array.isArray(w);
/** Prüft eine Kartensatz-Datei vollständig. Meldungen sagen, was zu tun ist. */
export function pruefeKartensatz(eingabe) {
    const fehler = [];
    if (!istObjekt(eingabe) || eingabe["format"] !== "dulle-kartensatz")
        return { ok: false, fehler: ["Das ist keine Kartensatz-Datei von Dulle."] };
    if (eingabe["v"] !== 1)
        fehler.push("Diese Kartensatz-Version kennt die App noch nicht. Bitte die App aktualisieren.");
    if (!istText(eingabe["id"], 40))
        fehler.push("id: fehlt");
    if (!istText(eingabe["name"], 40))
        fehler.push("name: fehlt oder ist länger als 40 Zeichen");
    const farben = eingabe["farben"];
    for (const f of FARBEN) {
        const x = istObjekt(farben) ? farben[f] : undefined;
        if (!istObjekt(x)) {
            fehler.push(`Farbe ${f} fehlt`);
            continue;
        }
        if (!istText(x["name"], 20))
            fehler.push(`Farbe ${f}: Name fehlt`);
        if (!istText(x["symbol"], 20_000))
            fehler.push(`Farbe ${f}: Symbol (SVG-Pfad) fehlt`);
        if (!istHex(x["farbe"]))
            fehler.push(`Farbe ${f}: „${String(x["farbe"])}“ ist keine Farbe wie #C0281F`);
        else if (kontrast(x["farbe"], KARTENPAPIER) < MIN_KONTRAST) {
            const name = istText(x["name"], 20) ? x["name"] : f;
            const zahl = (n) => n.toFixed(1).replace(".", ",");
            fehler.push(`${name} ist auf dem Kartenpapier zu blass (${zahl(kontrast(x["farbe"], KARTENPAPIER))}:1, nötig ${zahl(MIN_KONTRAST)}:1). Bitte eine dunklere Farbe wählen.`);
        }
    }
    const werte = eingabe["werte"];
    for (const w of WERTE) {
        const x = istObjekt(werte) ? werte[w] : undefined;
        if (!istObjekt(x) || !istText(x["kurz"], 3) || !istText(x["name"], 20))
            fehler.push(`Wert ${w}: Kürzel (bis 3 Zeichen) und Name nötig`);
    }
    const ruecken = eingabe["rueckseite"];
    if (!istObjekt(ruecken) || !istHex(ruecken["farbe"]) || typeof ruecken["zeichen"] !== "string")
        fehler.push("rueckseite: Farbe und Zeichen nötig");
    const begriffe = eingabe["begriffe"];
    for (const b of ["alte", "karlchen", "fuchs", "dulle"])
        if (!istObjekt(begriffe) || !istText(begriffe[b], 30))
            fehler.push(`begriffe.${b}: fehlt`);
    fehler.push(...pruefeGestaltung(eingabe));
    if (fehler.length > 0)
        return { ok: false, fehler };
    return { ok: true, satz: eingabe };
}
/**
 * Prüfung im Card Builder (Spec 020): Form und Kontrast (wie beim Laden) und eindeutige Farben verhindern das Speichern;
 * Farbsehen und lange Kurzzeichen sind Hinweise.
 */
export function pruefeBuilder(satz) {
    const r = pruefeKartensatz(satz);
    return {
        fehler: [...(r.ok ? [] : r.fehler), ...pruefeEindeutig(satz.farben)],
        hinweise: [...pruefeFarbsehen(satz.farben), ...pruefeLesbarkeit(satz.werte)],
    };
}
//# sourceMappingURL=kartensatz.js.map