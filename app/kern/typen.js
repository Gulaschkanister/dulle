// Datenformat nach Spec 000. Ereignisse sind die einzige Wahrheit, alles andere wird berechnet.
/** Ereignistypen, die zu einer Sitzung gehören und deshalb `sitzung` und `seq` brauchen. */
export const SITZUNGS_TYPEN = new Set([
    "sitzungBegonnen", "plaetzeGeaendert", "profilGeaendert", "sitzungUebernommen",
    "sitzungAbgeschlossen", "sitzungWiederaufgenommen", "sitzungVerworfen",
    "spielEingetragen", "spielKorrigiert", "spielVerworfen", "spielNeuGegeben",
    "kartenGegeben", "vorbehalt", "karteGespielt", "angesagt", "stichGewonnen", "spielBeendet", "spielOffengelegt",
    "armutAntwort", "armutGetauscht",
    "spielerGetrennt", "spielerZurueck", "geraetGewechselt", "platzUebernommen", "gastgeberGewechselt", "entscheidung", "kiUebernimmt", "kiGibtAb",
]);
/** Aktuelle Schema-Version, die diese App schreibt und auswertet. */
export const SCHEMA_VERSION = 1;
/** Schlüssel eines Platzes in `punkte`. */
export function platzSchluessel(platz) {
    return platz.art === "mensch" ? platz.spielerId : `ki-${platz.platz}`;
}
//# sourceMappingURL=typen.js.map