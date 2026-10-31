// Export an eine eigene Seite (Spec 005): Einstellungen, Warteschlange und Stand auf diesem Gerät. Gesendet wird nur
// nach „Abend abschließen“ (wenn eingeschaltet) und auf Knopfdruck, nie beim Start, nie im Hintergrund.
import { exportiereAn, pruefeVerbindung } from "../netz/export.js";
import { tisch } from "./tisch.js";
const EINSTELLUNG = "export";
/** Je Adresse die IDs, die der Empfänger bestätigt hat (Gerätezustand, kein Spielzustand). */
const BESTAETIGT = (adresse) => `exportBestaetigt:${adresse}`;
const STAND = (adresse) => `exportStand:${adresse}`;
let einstellung;
let stand = null;
let laeuft = false;
export function exportEinstellung() { return einstellung; }
export function exportStand() { return stand; }
export function exportLaeuft() { return laeuft; }
export async function ladeExport(app) {
    einstellung = (await app.speicher.einstellung(EINSTELLUNG)) ?? null;
    stand = einstellung?.adresse ? (await app.speicher.einstellung(STAND(einstellung.adresse))) ?? null : null;
}
export async function speichereExport(app, neu) {
    einstellung = neu && neu.adresse.trim() ? { ...neu, adresse: neu.adresse.trim() } : null;
    await app.speicher.setzeEinstellung(EINSTELLUNG, einstellung);
    stand = einstellung ? (await app.speicher.einstellung(STAND(einstellung.adresse))) ?? null : null;
}
/** Läuft auf diesem Gerät gerade ein Spiel (Gastgeber)? Dann wird nicht gesendet (Spec 005: nie mitten im Spiel). */
export function spielLaeuft() {
    const s = tisch()?.gastgeber?.spiel;
    return !!s && s.phase !== "ende";
}
export async function verbindungPruefen() {
    if (!einstellung)
        return "Bitte zuerst Adresse und Schlüssel eintragen.";
    return pruefeVerbindung(einstellung);
}
/** Alles senden, was die Seite noch nicht bestätigt hat. Ohne Einstellung: nichts (null). */
export async function exportJetzt(app) {
    if (!einstellung || laeuft || spielLaeuft())
        return null;
    const ziel = einstellung;
    laeuft = true;
    app.zeichne();
    try {
        const bisher = new Set((await app.speicher.einstellung(BESTAETIGT(ziel.adresse))) ?? []);
        const r = await exportiereAn(ziel, app.ereignisse, bisher);
        if (!r)
            return null;
        for (const id of r.angenommen)
            bisher.add(id);
        await app.speicher.setzeEinstellung(BESTAETIGT(ziel.adresse), [...bisher]);
        stand = {
            zuletzt: r.ok ? new Date().toISOString() : stand?.zuletzt ?? null,
            gesendet: bisher.size, wartend: r.wartend, fehler: r.ok ? null : r.meldung,
        };
        await app.speicher.setzeEinstellung(STAND(ziel.adresse), stand);
        return stand;
    }
    finally {
        laeuft = false;
        app.zeichne();
    }
}
/** Nach „Abend abschließen“: senden, wenn eingeschaltet; ein Fehler erscheint einmal als leise Meldung. */
export async function nachAbschluss(app) {
    if (einstellung === undefined)
        await ladeExport(app);
    if (!einstellung?.auto)
        return;
    const s = await exportJetzt(app);
    if (s?.fehler)
        app.melde(`Export an deine Seite: ${s.fehler}`, "info");
}
//# sourceMappingURL=export.js.map