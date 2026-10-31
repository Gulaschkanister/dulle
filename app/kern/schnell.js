// Eintragen im Modus „Nur Punkte“ (Spec 001): aus Gewinnern und Spielwert die Punkte aller vier ableiten.
// Keine Wertungsregeln – die Runde hat selbst gerechnet.
export function spielAusSchnell(e) {
    if (e.amTisch.length !== 4)
        return { ok: false, fehlt: "Es müssen vier Spieler am Tisch sitzen." };
    const einzel = e.wert * e.bock;
    const punkte = {};
    const hochzeit = e.spielart === "hochzeit";
    if (hochzeit && (!e.hochzeiter || !e.amTisch.includes(e.hochzeiter)))
        return { ok: false, fehlt: "Wähle, wer die Hochzeit hatte." };
    const mitPraemie = (d) => {
        if (hochzeit && e.praemie && e.praemie > 0)
            d.praemie = { [e.hochzeiter]: e.praemie };
        return { ok: true, daten: d };
    };
    if (e.spielart === "solo" || (hochzeit && e.ohnePartner)) {
        const solist = hochzeit ? e.hochzeiter : e.solist;
        if (!solist || !e.amTisch.includes(solist))
            return { ok: false, fehlt: "Wähle, wer Solo gespielt hat." };
        if (e.soloGewonnen === undefined)
            return { ok: false, fehlt: hochzeit ? "Wähle, ob der Hochzeiter gewonnen hat." : "Wähle, ob das Solo gewonnen wurde." };
        const vorzeichen = e.soloGewonnen ? 1 : -1;
        for (const s of e.amTisch)
            punkte[s] = s === solist ? vorzeichen * e.soloFaktor * einzel : -vorzeichen * einzel;
        const gegner = e.amTisch.filter((s) => s !== solist);
        return mitPraemie({
            nr: e.nr, vorhand: e.vorhand, eingabe: "schnell", spielart: hochzeit ? "hochzeit" : "solo", re: [solist],
            gewinner: e.soloGewonnen ? [solist] : gegner, wert: e.wert, bock: e.bock, punkte: nullBereinigt(punkte),
        });
    }
    const gewinner = e.gewinner ?? [];
    if (gewinner.length !== 2 || !gewinner.every((g) => e.amTisch.includes(g)))
        return { ok: false, fehlt: "Wähle die zwei Gewinner." };
    for (const s of e.amTisch)
        punkte[s] = gewinner.includes(s) ? einzel : -einzel;
    const daten = {
        nr: e.nr, vorhand: e.vorhand, eingabe: "schnell", spielart: hochzeit ? "hochzeit" : "normal",
        gewinner: [...gewinner], wert: e.wert, bock: e.bock, punkte: nullBereinigt(punkte),
    };
    // Bei der Hochzeit ist Re die Partei des Hochzeiters, also bekannt.
    const reGewinnt = hochzeit ? gewinner.includes(e.hochzeiter) : e.gewinnerPartei === "re" ? true : e.gewinnerPartei === "kontra" ? false : undefined;
    if (reGewinnt === true)
        daten.re = [...gewinner];
    if (reGewinnt === false)
        daten.re = e.amTisch.filter((s) => !gewinner.includes(s));
    return mitPraemie(daten);
}
/** −0 wird zu 0, damit Spielwert 0 sauber gespeichert und angezeigt wird. */
function nullBereinigt(punkte) {
    for (const k of Object.keys(punkte))
        if (Object.is(punkte[k], -0))
            punkte[k] = 0;
    return punkte;
}
//# sourceMappingURL=schnell.js.map