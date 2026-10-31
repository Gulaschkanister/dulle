/**
 * Alle festgelegten Ereignistypen (Stufe 0 und Stufe 1). Der Test `ereigniskatalog` gleicht diese Liste mit
 * `daten/ereignisse.md` und `daten/beispiele/` ab.
 */
export const EREIGNIS_TYPEN = [
    "rundeAngelegt",
    "rundeUmbenannt",
    "spielerAngelegt",
    "spielerUmbenannt",
    "spielerAusgeblendet",
    "profilGespeichert",
    "profileZusammengefuehrt",
    "zusammenfuehrungAufgehoben",
    "sitzungBegonnen",
    "plaetzeGeaendert",
    "profilGeaendert",
    "sitzungUebernommen",
    "sitzungAbgeschlossen",
    "sitzungWiederaufgenommen",
    "sitzungVerworfen",
    "spielEingetragen",
    "spielKorrigiert",
    "spielVerworfen",
    "spielNeuGegeben",
    // Stufe 1: Spielengine (Spec 008)
    "kartenGegeben",
    "vorbehalt",
    "karteGespielt",
    "angesagt",
    "stichGewonnen",
    "spielBeendet",
    "spielOffengelegt",
    // Spec 014: Armut
    "armutAntwort",
    "armutGetauscht",
    // Spec 012: Wiederverbinden
    "spielerGetrennt",
    "spielerZurueck",
    "geraetGewechselt",
    "platzUebernommen",
    "gastgeberGewechselt",
    "entscheidung",
    // Spec 013: Notfall-KI
    "kiUebernimmt",
    "kiGibtAb",
];
const vollstaendig = true;
void vollstaendig;
export function istBekannterTyp(typ) {
    return EREIGNIS_TYPEN.includes(typ);
}
//# sourceMappingURL=katalog.js.map