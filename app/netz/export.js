// Export an eine eigene Seite (Spec 005, daten/schnittstelle.md). Optional und vom Spiel getrennt: Ohne Adresse passiert
// nichts, Fehler stören nie das Spiel. Dasselbe JSON wie der Datei-Export, in Paketen, idempotent über die Ereignis-ID.
// Kein DOM; fetch kommt von außen (Tests).
import { exportiere } from "../kern/austausch.js";
export const PAKET = 500;
export const ZEITLIMIT_MS = 15_000;
/** Nur HTTPS; für Entwicklung und Tests auch http://localhost bzw. 127.0.0.1. */
export function pruefeAdresse(text) {
    let url;
    try {
        url = new URL(text.trim());
    }
    catch {
        return "Das ist keine Adresse. Sie beginnt mit https://";
    }
    if (url.protocol === "https:")
        return null;
    if (url.protocol === "http:" && (url.hostname === "localhost" || url.hostname === "127.0.0.1"))
        return null;
    return "Nur sichere Adressen (https://), damit Schlüssel und Spiele nicht mitgelesen werden.";
}
/** Alle noch nicht bestätigten Ereignisse, je Runde, in Paketen zu höchstens `PAKET`. */
export function pakete(alle, bestaetigt, groesse = PAKET) {
    const runden = [...new Set(alle.map((e) => e.runde))].sort();
    const ergebnis = [];
    for (const rundeId of runden) {
        const datei = exportiere(rundeId, alle);
        const offen = datei.ereignisse.filter((e) => !bestaetigt.has(e.id));
        for (let i = 0; i < offen.length; i += groesse)
            ergebnis.push({ ...datei, ereignisse: offen.slice(i, i + groesse) });
    }
    return ergebnis;
}
/** Aus der Antwort zählt nur `angenommen`: eine Liste von IDs, die wirklich gesendet wurden. Alles andere wird ignoriert. */
export function angenommenAus(antwort, gesendet) {
    const liste = antwort?.angenommen;
    if (!Array.isArray(liste))
        return [];
    return liste.filter((x) => typeof x === "string" && gesendet.has(x));
}
function meldungFuer(status) {
    if (status === 401 || status === 403)
        return `Schlüssel abgelehnt (${status}).`;
    if (status >= 300 && status < 400)
        return "Die Seite leitet weiter. Bitte die genaue Adresse eintragen.";
    return `Die Seite meldet einen Fehler (${status}). Später noch einmal.`;
}
async function sende(ziel, datei, holen) {
    let antwort;
    try {
        antwort = await holen(ziel.adresse, {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${ziel.schluessel}` },
            body: JSON.stringify(datei),
            // Keine Weiterleitung an andere Hosts: Der Schlüssel geht nur an diese Adresse.
            redirect: "manual",
            signal: AbortSignal.timeout(ZEITLIMIT_MS),
        });
    }
    catch (f) {
        const name = f.name;
        return { ok: false, meldung: name === "TimeoutError" || name === "AbortError" ? "Die Seite antwortet nicht rechtzeitig. Später noch einmal." : "Die Seite antwortet nicht. Später noch einmal." };
    }
    if (antwort.type === "opaqueredirect" || (antwort.status >= 300 && antwort.status < 400))
        return { ok: false, meldung: meldungFuer(302) };
    if (!antwort.ok)
        return { ok: false, meldung: meldungFuer(antwort.status) };
    try {
        return { ok: true, antwort: await antwort.json() };
    }
    catch {
        return { ok: true, antwort: null };
    }
}
/** Verbindung prüfen: leere Ereignisliste, erwartet 200 mit `angenommen`. */
export async function pruefeVerbindung(ziel, holen = fetch) {
    const fehler = pruefeAdresse(ziel.adresse);
    if (fehler)
        return fehler;
    const r = await sende(ziel, { format: "doppelkopf-export", v: 1, runde: { id: "", name: "" }, ereignisse: [] }, holen);
    if (!r.ok)
        return r.meldung;
    return Array.isArray(r.antwort?.angenommen) ? null : "Die Seite antwortet, aber nicht im erwarteten Format (angenommen fehlt).";
}
/**
 * Sendet alles, was das Ziel noch nicht bestätigt hat. Beim ersten Fehler hört es auf (keine Wiederholung in Schleife);
 * Bestätigtes bleibt bestätigt.
 */
export async function exportiereAn(ziel, alle, bestaetigt, holen = fetch) {
    if (!ziel || !ziel.adresse)
        return null;
    const fehler = pruefeAdresse(ziel.adresse);
    const liste = pakete(alle, bestaetigt);
    const wartendGesamt = liste.reduce((s, p) => s + p.ereignisse.length, 0);
    if (fehler)
        return { ok: false, meldung: fehler, angenommen: [], wartend: wartendGesamt };
    const angenommen = [];
    let gesendet = 0;
    for (const paket of liste) {
        const r = await sende(ziel, paket, holen);
        if (!r.ok)
            return { ok: false, meldung: r.meldung, angenommen, wartend: wartendGesamt - angenommen.length };
        gesendet += paket.ereignisse.length;
        angenommen.push(...angenommenAus(r.antwort, new Set(paket.ereignisse.map((e) => e.id))));
    }
    return { ok: true, gesendet, angenommen, wartend: wartendGesamt - angenommen.length };
}
//# sourceMappingURL=export.js.map