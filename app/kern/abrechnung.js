// Abrechnung eines Abends (Spec 003): Endstand, wer zahlt wem, Kennzahlen, Text zum Teilen. Reine Funktionen.
/** Endstand absteigend nach Punkten; bei Gleichstand nach `reihenfolge` (z. B. Namen). Gleiche Punkte = gleicher Platz. */
export function endstand(summen, reihenfolge = () => 0) {
    const liste = Object.entries(summen).sort((a, b) => b[1] - a[1] || reihenfolge(a[0], b[0]));
    return liste.map(([id, punkte], i) => ({ id, punkte, platz: liste.findIndex(([, p]) => p === punkte) + 1 || i + 1 }));
}
/**
 * Wer zahlt wem: Der größte Schuldner zahlt an den größten Gläubiger, bis alles ausgeglichen ist.
 * Beträge in ganzen Cent. Liefert höchstens n − 1 Zahlungen für n Beteiligte mit Betrag ≠ 0.
 * Die Reihenfolge bei Gleichstand folgt der Reihenfolge der Schlüssel in `betraege`.
 */
export function zahlungen(betraege) {
    const reihe = Object.keys(betraege);
    const rang = (id) => reihe.indexOf(id);
    const offen = Object.entries(betraege).filter(([, c]) => c !== 0).map(([id, cent]) => ({ id, cent }));
    const ergebnis = [];
    for (;;) {
        const glaeubiger = offen.filter((x) => x.cent > 0).sort((a, b) => b.cent - a.cent || rang(a.id) - rang(b.id))[0];
        const schuldner = offen.filter((x) => x.cent < 0).sort((a, b) => a.cent - b.cent || rang(a.id) - rang(b.id))[0];
        if (!glaeubiger || !schuldner)
            break;
        const cent = Math.min(glaeubiger.cent, -schuldner.cent);
        ergebnis.push({ von: schuldner.id, an: glaeubiger.id, cent });
        glaeubiger.cent -= cent;
        schuldner.cent += cent;
    }
    return ergebnis;
}
/** Punkte, die in Geld zählen: Summen ohne Prämien (Spec 007). So geht die Abrechnung immer auf. */
export function geldPunkte(summen, praemien = {}) {
    return Object.fromEntries(Object.entries(summen).map(([id, p]) => [id, p - (praemien[id] ?? 0)]));
}
/** Betrag je Spieler in Cent. */
export function betraegeInCent(summen, punktwertCent) {
    return Object.fromEntries(Object.entries(summen).map(([id, p]) => [id, p * punktwertCent]));
}
/** „0,75 €“, „−1,05 €“ (echtes Minus). */
export function euro(cent) {
    const betrag = (Math.abs(cent) / 100).toFixed(2).replace(".", ",");
    return `${cent < 0 ? "−" : ""}${betrag} €`;
}
export function abendInZahlen(s) {
    const gueltig = s.spiele.filter((sp) => !sp.verworfen);
    const soli = gueltig.filter((sp) => sp.daten.spielart === "solo" || sp.daten.spielart === "stillesSolo");
    const teuer = gueltig.reduce((m, sp) => {
        const wert = Math.max(...Object.values(sp.daten.punkte).map(Math.abs));
        const bisher = m ? Math.max(...Object.values(m.daten.punkte).map(Math.abs)) : -1;
        return wert > bisher ? sp : m;
    }, null);
    const rechner = gueltig.filter((sp) => sp.daten.eingabe === "rechner" && sp.daten.re && sp.daten.re.length > 0);
    return {
        spiele: gueltig.length,
        soliGespielt: soli.length,
        soliGewonnen: soli.filter((sp) => sp.daten.re?.[0] !== undefined && sp.daten.gewinner.includes(sp.daten.re[0])).length,
        teuerstes: teuer ? { nr: teuer.nr, wert: Math.max(...Object.values(teuer.daten.punkte).map(Math.abs)) } : null,
        reGewinnt: rechner.length > 0
            ? { gewonnen: rechner.filter((sp) => sp.daten.re.every((x) => sp.daten.gewinner.includes(x)) && sp.daten.gewinner.length > 0).length, von: rechner.length }
            : null,
    };
}
/**
 * Text für die Gruppe, z. B.
 * „Donnerstagsrunde, Do 16.10.: Ben +15 (0,75 €), Anna +3 (0,15 €) … Simon zahlt an Ben 0,75 €, …“
 */
export function teilenText(rundenName, datum, liste, name, punktwertCent, praemien = {}) {
    const punkte = (n) => (n > 0 ? `+${n}` : n < 0 ? `−${-n}` : "0");
    const geld = geldPunkte(Object.fromEntries(liste.map((p) => [p.id, p.punkte])), praemien);
    const stand = liste.map((p) => `${name(p.id)} ${punkte(p.punkte)}${punktwertCent ? ` (${euro((geld[p.id] ?? 0) * punktwertCent)})` : ""}`).join(", ");
    let text = `${rundenName}, ${datum}: ${stand}`;
    if (punktwertCent) {
        const betraege = betraegeInCent(geld, punktwertCent);
        const z = zahlungen(betraege);
        if (z.length > 0)
            text += `. ${z.map((x) => `${name(x.von)} zahlt an ${name(x.an)} ${euro(x.cent)}`).join(", ")}`;
    }
    return `${text}.`;
}
//# sourceMappingURL=abrechnung.js.map