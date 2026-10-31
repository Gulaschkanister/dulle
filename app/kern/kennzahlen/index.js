// Katalog aller Kennzahlen (Spec 004). Die Oberfläche zeigt jeden Eintrag automatisch.
// Neue Kennzahl: Datei in diesem Ordner, hier eintragen, Test schreiben. test/kennzahlen.test.ts prüft die Vollständigkeit.
import { ansagenGehalten } from "./ansagenGehalten.js";
import { bestePaarung } from "./bestePaarung.js";
import { geldBilanz } from "./geldBilanz.js";
import { gewinnquote } from "./gewinnquote.js";
import { hochzeiten } from "./hochzeiten.js";
import { punkteGesamt } from "./punkteGesamt.js";
import { reKontra } from "./reKontra.js";
import { siegesserie } from "./siegesserie.js";
import { soloBilanz } from "./soloBilanz.js";
/** Reihenfolge = Reihenfolge auf dem Bildschirm. Der Werttyp ist je Kennzahl verschieden. */
export const KENNZAHLEN = [
    punkteGesamt, gewinnquote, geldBilanz,
    reKontra, soloBilanz, ansagenGehalten, bestePaarung, siegesserie, hochzeiten,
];
/** Datenbasis als Text: „alle Spiele“ oder „aus 18 von 30 Spielen“. */
export function basisText(basis, gesamt) {
    return basis >= gesamt ? "alle Spiele" : `aus ${basis} von ${gesamt} Spielen`;
}
export { spieleVon, statSpiele } from "./spiele.js";
//# sourceMappingURL=index.js.map