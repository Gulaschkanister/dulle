// Export und Import (Spec 000). Reine Funktionen; das Schreiben in den Speicher macht src/speicher.
import { pruefeForm, wirdAusgewertet } from "./form.js";
import { projiziere } from "./projektion.js";
import { istUlid } from "./ulid.js";
export const EXPORT_FORMAT = "doppelkopf-export";
export const EXPORT_VERSION = 1;
/** Export enthält immer alle Ereignisse der Runde, stabil nach ID sortiert. */
export function exportiere(rundeId, alle) {
    const ereignisse = alle.filter((e) => e.runde === rundeId).sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
    const name = projiziere(ereignisse)[rundeId]?.name ?? "Runde";
    return { format: EXPORT_FORMAT, v: EXPORT_VERSION, runde: { id: rundeId, name }, ereignisse };
}
export function dateiname(datei, heute = new Date()) {
    const name = datei.runde.name.toLowerCase().replace(/[^a-z0-9äöüß]+/g, "-").replace(/^-|-$/g, "") || "runde";
    return `doppelkopf-${name}-${heute.toISOString().slice(0, 10)}.json`;
}
const HINWEIS_NEU_EXPORTIEREN = "Exportiere sie auf dem anderen Gerät noch einmal.";
/**
 * Prüft eine Importdatei vollständig, bevor irgendetwas gespeichert wird.
 * Bei einem Problem wird die ganze Datei abgelehnt (Import ist eine Transaktion).
 */
export function pruefeDatei(eingabe) {
    let json = eingabe;
    if (typeof eingabe === "string") {
        try {
            json = JSON.parse(eingabe);
        }
        catch {
            return { ok: false, meldung: `Die Datei ist kein gültiges JSON, vermutlich unvollständig. ${HINWEIS_NEU_EXPORTIEREN}` };
        }
    }
    if (typeof json !== "object" || json === null || json["format"] !== EXPORT_FORMAT) {
        return { ok: false, meldung: "Das ist keine Doppelkopf-Exportdatei." };
    }
    const datei = json;
    if (typeof datei["v"] !== "number" || datei["v"] > EXPORT_VERSION) {
        return { ok: false, meldung: "Die Datei stammt aus einer neueren Version der App. Bitte die App aktualisieren." };
    }
    const runde = datei["runde"];
    if (!runde || !istUlid(runde["id"]) || typeof runde["name"] !== "string") {
        return { ok: false, meldung: `In der Datei fehlt die Runde. ${HINWEIS_NEU_EXPORTIEREN}` };
    }
    const ereignisse = datei["ereignisse"];
    if (!Array.isArray(ereignisse))
        return { ok: false, meldung: `In der Datei fehlen die Spiele. ${HINWEIS_NEU_EXPORTIEREN}` };
    for (let i = 0; i < ereignisse.length; i++) {
        const e = ereignisse[i];
        const fehler = pruefeForm(e);
        if (fehler.length > 0) {
            const typ = typeof e?.["typ"] === "string" ? ` (${e["typ"]})` : "";
            return { ok: false, meldung: `Eintrag ${i + 1}${typ} ist fehlerhaft: ${fehler[0]}. Die Datei wurde nicht übernommen. ${HINWEIS_NEU_EXPORTIEREN}` };
        }
        if (e["runde"] !== runde["id"]) {
            return { ok: false, meldung: `Eintrag ${i + 1} gehört zu einer anderen Runde. Die Datei wurde nicht übernommen.` };
        }
    }
    return { ok: true, datei: datei };
}
/** Vereinigungsmenge: liefert die neuen Ereignisse und zählt, was schon da war. */
export function vereinige(vorhandeneIds, eingehend) {
    const neu = [];
    const gesehen = new Set();
    let vorhanden = 0;
    for (const e of eingehend) {
        if (vorhandeneIds.has(e.id) || gesehen.has(e.id)) {
            vorhanden++;
            continue;
        }
        gesehen.add(e.id);
        neu.push(e);
    }
    return { neu, vorhanden, unbekannteTypen: neu.filter((e) => !wirdAusgewertet(e)).length };
}
/** Anzahl widersprüchlicher Stellen über alle Sitzungen einer Ereignismenge. */
export function zaehleKonflikte(ereignisse) {
    return Object.values(projiziere(ereignisse))
        .flatMap((r) => Object.values(r.sitzungen))
        .reduce((summe, s) => summe + s.konflikte.length, 0);
}
//# sourceMappingURL=austausch.js.map