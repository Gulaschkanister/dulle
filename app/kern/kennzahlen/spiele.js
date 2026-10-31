// Spiele einer Runde für die Statistik aufbereiten (Spec 004).
/** Alle gültigen Spiele der Runde, chronologisch. Verworfene Abende und Spiele fehlen. Spiele mit KI nur, wenn `mitKi` (Spec 013). */
export function statSpiele(runde, zeitraum = "alle", heute = new Date().toISOString().slice(0, 10), mitKi = true) {
    const ziel = (id) => runde.spieler[id]?.zusammengefuehrtIn ?? id;
    let abende = Object.values(runde.sitzungen).filter((s) => !s.verworfen)
        .sort((a, b) => a.datum.localeCompare(b.datum) || (a.id < b.id ? -1 : 1));
    if (zeitraum === "jahr")
        abende = abende.filter((s) => s.datum.slice(0, 4) === heute.slice(0, 4));
    if (zeitraum === "letzte10")
        abende = abende.slice(-10);
    return abende.flatMap((s) => s.spiele.filter((sp) => !sp.verworfen && (mitKi || !s.mitKi.includes(sp.nr))).map((sp) => ({
        sitzungId: s.id, datum: s.datum, nr: sp.nr, daten: aufgeloest(sp.daten, ziel),
        ...(s.abgeschlossen && s.punktwertCent ? { punktwertCent: s.punktwertCent } : {}),
        ...(s.mitKi.includes(sp.nr) ? { mitKi: true } : {}),
    })));
}
function aufgeloest(d, ziel) {
    const umschluesseln = (r) => {
        const neu = {};
        for (const [id, p] of Object.entries(r))
            neu[ziel(id)] = (neu[ziel(id)] ?? 0) + p;
        return neu;
    };
    const neu = { ...d, gewinner: d.gewinner.map(ziel), punkte: umschluesseln(d.punkte) };
    if (d.re)
        neu.re = d.re.map(ziel);
    if (d.praemie)
        neu.praemie = umschluesseln(d.praemie);
    return neu;
}
/** Spiele, bei denen der Spieler am Tisch saß. */
export function spieleVon(spiele, spielerId) {
    return spiele.filter((s) => spielerId in s.daten.punkte);
}
export function hatGewonnen(s, spielerId) {
    return s.daten.gewinner.includes(spielerId);
}
/** Partner bei 2 gegen 2, sonst null. Gewinner und Verlierer sind jeweils Partner. */
export function partnerVon(s, spielerId) {
    const tisch = Object.keys(s.daten.punkte);
    let seite = null;
    if (s.daten.gewinner.length === 2)
        seite = s.daten.gewinner.includes(spielerId) ? s.daten.gewinner : tisch.filter((x) => !s.daten.gewinner.includes(x));
    else if (s.daten.gewinner.length === 0 && s.daten.re?.length === 2)
        seite = s.daten.re.includes(spielerId) ? s.daten.re : tisch.filter((x) => !s.daten.re.includes(x));
    if (!seite || seite.length !== 2 || !seite.includes(spielerId))
        return null;
    return seite.find((x) => x !== spielerId) ?? null;
}
export function istSolo(s) {
    return s.daten.spielart === "solo" || s.daten.spielart === "stillesSolo";
}
/** Prozent ohne Nachkommastellen, „61 %“. */
export function prozent(teil, ganz) {
    return ganz === 0 ? "–" : `${Math.round((100 * teil) / ganz)} %`;
}
//# sourceMappingURL=spiele.js.map