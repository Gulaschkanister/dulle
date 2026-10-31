// Regelprofile (Spec 002): mitgelieferte Vorlagen und die Beschreibung aller Schalter.
// Inhalte nach .claude/skills/doppelkopf-regeln/varianten.md
export const SCHALTER = [
    { schluessel: "mitNeunen", name: "Mit Neunen", gruppe: "Karten und Trumpf", art: "jaNein", wirktImSchreiber: false },
    { schluessel: "zweiteDulle", name: "Zweite Dulle schlägt die erste", gruppe: "Karten und Trumpf", art: "wahl", wirktImSchreiber: false,
        optionen: [{ wert: "nie", text: "nie" }, { wert: "immer", text: "immer" }, { wert: "ausserLetzterStich", text: "außer im letzten Stich" }] },
    { schluessel: "schweinchen", name: "Schweinchen", gruppe: "Karten und Trumpf", art: "jaNein", wirktImSchreiber: false },
    { schluessel: "hochzeitKlaerung", name: "Hochzeit: Partner wird", gruppe: "Vorbehalte", art: "wahl", wirktImSchreiber: false,
        optionen: [{ wert: "fremder", text: "erster Fremder" }, { wert: "fehl", text: "erster Fehl" }, { wert: "trumpf", text: "erster Trumpf" }, { wert: "waehlt", text: "Hochzeiter sagt an" }] },
    { schluessel: "armut", name: "Armut erlaubt", gruppe: "Vorbehalte", art: "jaNein", wirktImSchreiber: true },
    { schluessel: "armutGrenze", name: "Armut bei höchstens … Trumpf", gruppe: "Vorbehalte", art: "wahl", wirktImSchreiber: false,
        optionen: [{ wert: 2, text: "2" }, { wert: 3, text: "3" }] },
    { schluessel: "armutFuechseZaehlen", name: "Armut: Füchse zählen als Trumpf", gruppe: "Vorbehalte", art: "jaNein", wirktImSchreiber: false },
    { schluessel: "soli", name: "Soli", gruppe: "Vorbehalte", art: "menge", wirktImSchreiber: false,
        optionen: [{ wert: "damen", text: "Damen" }, { wert: "buben", text: "Buben" }, { wert: "fleischlos", text: "Fleischlos" }, { wert: "kreuz", text: "Kreuz" }, { wert: "pik", text: "Pik" }, { wert: "herz", text: "Herz" }, { wert: "karo", text: "Karo" }] },
    { schluessel: "soloAufspiel", name: "Im Solo spielt aus", gruppe: "Vorbehalte", art: "wahl", wirktImSchreiber: false,
        optionen: [{ wert: "vorhand", text: "die Vorhand" }, { wert: "solist", text: "der Solist" }] },
    { schluessel: "schmeissenKoenige", name: "Neu mischen ab … Königen", gruppe: "Vorbehalte", art: "wahl", wirktImSchreiber: false,
        optionen: [{ wert: null, text: "nie" }, { wert: 5, text: "5" }, { wert: 6, text: "6" }] },
    { schluessel: "pflichtsolo", name: "Pflichtsolo", gruppe: "Vorbehalte", art: "jaNein", wirktImSchreiber: false },
    { schluessel: "ansagenErlaubt", name: "Ansagen erlaubt", gruppe: "Ansagen", art: "jaNein", wirktImSchreiber: true },
    { schluessel: "sonderpunkte", name: "Sonderpunkte", gruppe: "Wertung", art: "menge", wirktImSchreiber: true,
        optionen: [{ wert: "fuchs", text: "Fuchs" }, { wert: "doppelkopf", text: "Doppelkopf" }, { wert: "karlchen", text: "Karlchen" }, { wert: "gegenDieAlten", text: "Gegen die Alten" }] },
    { schluessel: "bock", name: "Bockrunden (von Hand)", gruppe: "Wertung", art: "jaNein", wirktImSchreiber: true },
    { schluessel: "hochzeitPraemie", name: "Hochzeitsprämie für den Hochzeiter", gruppe: "Wertung", art: "wahl", wirktImSchreiber: true,
        optionen: [{ wert: null, text: "keine" }, { wert: 3, text: "3" }, { wert: 5, text: "5" }, { wert: 10, text: "10" }] },
    { schluessel: "soloFaktor", name: "Solo zählt", gruppe: "Wertung", art: "wahl", wirktImSchreiber: true,
        optionen: [{ wert: 3, text: "3-fach" }, { wert: 2, text: "2-fach" }, { wert: 1, text: "einfach" }] },
    { schluessel: "punktwert", name: "Punktwert", gruppe: "Abrechnung", art: "wahl", wirktImSchreiber: true,
        optionen: [{ wert: null, text: "ohne Geld" }, { wert: 1, text: "1 ct" }, { wert: 2, text: "2 ct" }, { wert: 5, text: "5 ct" }, { wert: 10, text: "10 ct" }] },
];
const ALLE_SONDERPUNKTE = ["fuchs", "doppelkopf", "karlchen", "gegenDieAlten"];
export const DDV_TURNIER = {
    id: "ddv-turnier", name: "DDV-Turnier", version: 1,
    schalter: {
        mitNeunen: true, zweiteDulle: "nie", schweinchen: false, hochzeitKlaerung: "fremder", armut: false, armutGrenze: 3, armutFuechseZaehlen: false,
        soli: ["damen", "buben", "fleischlos", "kreuz", "pik", "herz", "karo"], soloAufspiel: "vorhand", schmeissenKoenige: null, pflichtsolo: true,
        ansagenErlaubt: true, sonderpunkte: ALLE_SONDERPUNKTE, bock: false, hochzeitPraemie: null, soloFaktor: 3, punktwert: null,
    },
};
export const UNSERE_RUNDE = {
    id: "unsere-runde", name: "Unsere Runde", version: 4,
    schalter: { ...DDV_TURNIER.schalter, mitNeunen: false, zweiteDulle: "ausserLetzterStich", hochzeitKlaerung: "waehlt", armut: true, armutGrenze: 2, armutFuechseZaehlen: true, soloAufspiel: "solist", schmeissenKoenige: 5, pflichtsolo: false, hochzeitPraemie: 5 },
};
export const KNEIPE_KLASSISCH = {
    id: "kneipe-klassisch", name: "Kneipe klassisch", version: 1,
    schalter: { ...DDV_TURNIER.schalter, zweiteDulle: "ausserLetzterStich", armut: true, schmeissenKoenige: 5, pflichtsolo: false, bock: true },
};
export const SCHARFES_BLATT = {
    id: "scharfes-blatt", name: "Scharfes Blatt", version: 1,
    schalter: { ...KNEIPE_KLASSISCH.schalter, mitNeunen: false, schweinchen: true },
};
export const EINSTEIGER = {
    id: "einsteiger", name: "Einsteiger", version: 1,
    schalter: { ...DDV_TURNIER.schalter, pflichtsolo: false, ansagenErlaubt: false },
};
export const VORLAGEN = [UNSERE_RUNDE, DDV_TURNIER, KNEIPE_KLASSISCH, SCHARFES_BLATT, EINSTEIGER];
export function istVorlage(profil) {
    return VORLAGEN.some((v) => v.id === profil.id);
}
export function soloFaktor(profil) {
    const wert = profil.schalter["soloFaktor"];
    return typeof wert === "number" && wert > 0 ? wert : 3;
}
export function bockErlaubt(profil) {
    return profil.schalter["bock"] === true;
}
export function armutErlaubt(profil) {
    const armut = profil.schalter["armut"];
    // Spec-001-Profile speicherten Armut als Objekt { erlaubt, hoechstensTrumpf }.
    return armut === true || (typeof armut === "object" && armut !== null && armut.erlaubt === true);
}
export function ansagenErlaubt(profil) {
    return profil.schalter["ansagenErlaubt"] !== false;
}
export function sonderpunkteErlaubt(profil) {
    const liste = profil.schalter["sonderpunkte"];
    return Array.isArray(liste) ? liste : ALLE_SONDERPUNKTE;
}
/** Prämie für den Hochzeiter (Spec 007), sonst null. */
export function hochzeitPraemie(profil) {
    const wert = profil.schalter["hochzeitPraemie"];
    return typeof wert === "number" && wert > 0 ? wert : null;
}
/** Wie der Partner einer Hochzeit bestimmt wird. null = der Hochzeiter sagt es an (Spec 008). */
export function hochzeitKlaerung(profil) {
    const wert = profil.schalter["hochzeitKlaerung"];
    if (wert === "waehlt")
        return null;
    return wert === "fehl" || wert === "trumpf" ? wert : "fremder";
}
export function zweiteDulle(profil) {
    const wert = profil.schalter["zweiteDulle"];
    return wert === "immer" || wert === "ausserLetzterStich" ? wert : "nie";
}
export function mitNeunen(profil) {
    return profil.schalter["mitNeunen"] !== false;
}
/** Ab wie vielen Königen automatisch neu gemischt wird, sonst null. */
export function neuMischenAbKoenigen(profil) {
    const wert = profil.schalter["schmeissenKoenige"];
    return typeof wert === "number" && wert > 0 ? wert : null;
}
const ALLE_SOLI = ["damen", "buben", "fleischlos", "kreuz", "pik", "herz", "karo"];
/** Erlaubte Soloarten (Spec 014). Ohne Schalter: alle. */
export function soliErlaubt(profil) {
    const liste = profil.schalter["soli"];
    return Array.isArray(liste) ? ALLE_SOLI.filter((x) => liste.includes(x)) : [...ALLE_SOLI];
}
export function soloAufspiel(profil) {
    return profil.schalter["soloAufspiel"] === "solist" ? "solist" : "vorhand";
}
/** Armut: höchstens so viele Trumpf, und ob die Füchse mitzählen (Spec 014). */
export function armutRegel(profil) {
    const g = profil.schalter["armutGrenze"];
    return { grenze: typeof g === "number" ? g : 3, fuechse: profil.schalter["armutFuechseZaehlen"] === true };
}
export function schweinchenAn(profil) {
    return profil.schalter["schweinchen"] === true;
}
export function punktwertCent(profil) {
    const wert = profil.schalter["punktwert"];
    return typeof wert === "number" && wert > 0 ? wert : null;
}
function gleich(a, b) {
    if (Array.isArray(a) && Array.isArray(b))
        return a.length === b.length && a.every((x) => b.includes(x));
    return a === b || (a == null && b == null);
}
export function schalterText(s, wert) {
    if (s.art === "jaNein")
        return wert === true ? "ja" : "nein";
    if (s.art === "menge") {
        const liste = Array.isArray(wert) ? wert : [];
        return liste.length === 0 ? "keine" : (s.optionen ?? []).filter((o) => liste.includes(o.wert)).map((o) => o.text).join(", ");
    }
    return (s.optionen ?? []).find((o) => gleich(o.wert, wert))?.text ?? String(wert ?? "–");
}
/** Abweichungen von DDV als kurze Texte, z. B. „ohne Neunen“, „Zweite Dulle schlägt die erste: immer“. */
export function abweichungenVonDdv(profil) {
    return SCHALTER.filter((s) => !gleich(normal(s.schluessel, profil.schalter[s.schluessel]), DDV_TURNIER.schalter[s.schluessel]))
        .map((s) => (s.art === "jaNein" ? `${s.name}: ${schalterText(s, profil.schalter[s.schluessel])}` : `${s.name}: ${schalterText(s, profil.schalter[s.schluessel])}`));
}
/** Gleicht ältere Schalterformen an (Spec 001: Armut als Objekt). */
function normal(schluessel, wert) {
    if (schluessel === "armut" && typeof wert === "object" && wert !== null)
        return wert.erlaubt === true;
    return wert;
}
//# sourceMappingURL=profile.js.map