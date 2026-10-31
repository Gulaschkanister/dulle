// Sichern und Laden als Datei, Sicherungserinnerung (Spec 003).
// Der Sicherungsstand gilt nur für dieses Gerät und liegt deshalb in localStorage, nicht im Ereignisprotokoll.
import { dateiname, exportiere } from "../kern/austausch.js";
import { leseLokal, schreibeLokal } from "./app.js";
import { datumKurz, h, heute } from "./dom.js";
const GESICHERT = (rundeId) => `dulle.gesichert.${rundeId}`;
/** Spiele, die seit der letzten Sicherung eingetragen wurden. */
export function ungesichert(app, rundeId) {
    const stand = leseLokal(GESICHERT(rundeId));
    const spiele = app.ereignisse.filter((e) => e.runde === rundeId && e.typ === "spielEingetragen" && (!stand || e.id > stand.bisId)).length;
    return { spiele, zuletzt: stand?.datum ?? null };
}
/** Exportiert die Runde: Teilen-Menü mit Datei, wo möglich, sonst Download. */
export async function sichern(app, r) {
    await app.festschreiben();
    const datei = exportiere(r.id, app.ereignisse);
    const name = dateiname(datei);
    const inhalt = JSON.stringify(datei, null, 1);
    const file = new File([inhalt], name, { type: "application/json" });
    try {
        if (typeof navigator.canShare === "function" && navigator.canShare({ files: [file] })) {
            await navigator.share({ files: [file], title: name });
        }
        else {
            const url = URL.createObjectURL(file);
            const a = h("a", { href: url, download: name, style: "display: none" });
            document.body.append(a);
            a.click();
            a.remove();
            setTimeout(() => URL.revokeObjectURL(url), 10_000);
        }
    }
    catch (fehler) {
        // Teilen abgebrochen: nichts als gesichert markieren.
        if (fehler.name !== "AbortError")
            app.melde("Die Datei konnte nicht erstellt werden.");
        return;
    }
    const bisId = datei.ereignisse.reduce((m, e) => (e.id > m ? e.id : m), "");
    schreibeLokal(GESICHERT(r.id), { bisId, datum: heute() });
    app.melde(`Gesichert als ${name}`, "info");
}
/** Knopf „Datei laden“ mit verstecktem Dateifeld. */
export function ladenKnopf(app, text = "Datei laden", klasse = "knopf") {
    const feld = h("input", {
        type: "file", accept: ".json,application/json", style: "display: none", "aria-label": "Sicherungsdatei wählen",
        onchange: async (e) => {
            const input = e.target;
            const datei = input.files?.[0];
            input.value = "";
            if (datei)
                await laden(app, await datei.text());
        },
    });
    return h("span", { style: "display: contents" }, h("button", { class: klasse, "data-fokus": "datei-laden", onclick: () => feld.click() }, text), feld);
}
export async function laden(app, text) {
    const antwort = await app.speicher.importiere(text);
    if (!antwort.ok)
        return app.melde(antwort.meldung);
    await app.ladeNeu();
    let rundeId;
    try {
        rundeId = JSON.parse(text).runde?.id;
    }
    catch { /* schon geprüft */ }
    const teile = [`${antwort.neu} ${antwort.neu === 1 ? "neues Ereignis" : "neue Ereignisse"} übernommen, ${antwort.vorhanden} waren schon da.`];
    if (antwort.konflikte > 0)
        teile.push(`${antwort.konflikte} widersprüchliche Einträge: bitte die markierten Spiele prüfen.`);
    if (antwort.unbekannteTypen > 0)
        teile.push(`${antwort.unbekannteTypen} Einträge stammen aus einer neueren Version und werden noch nicht angezeigt.`);
    app.melde(teile.join(" "), "info");
    if (rundeId && !location.hash.startsWith(`#/runde/${rundeId}`) && app.runde(rundeId))
        app.geheZu(`/runde/${rundeId}`);
}
/** Bereich „Sicherung“ auf der Runden-Seite. */
export function sicherungsBereich(app, r) {
    const { spiele, zuletzt } = ungesichert(app, r.id);
    const warnen = spiele > 0 && app.hinweisHomeBildschirm;
    const zeile = zuletzt
        ? `Zuletzt gesichert: ${datumKurz(zuletzt)}${spiele > 0 ? ` · ${spiele} ${spiele === 1 ? "Spiel" : "Spiele"} seitdem` : " · alles gesichert"}`
        : spiele > 0 ? `Noch nie gesichert · ${spiele} ${spiele === 1 ? "Spiel" : "Spiele"}` : "Noch nichts zu sichern.";
    return h("section", { class: "gruppe", "aria-labelledby": "sicherung-titel" }, h("h2", { id: "sicherung-titel" }, "Sicherung"), h("p", { class: "leise", style: `margin: 0${warnen ? "; color: var(--warning)" : ""}`, "data-sicherung": "" }, zeile, warnen ? " · Im Browser ohne Home-Bildschirm kann das iPhone die Daten nach 7 Tagen löschen." : ""), h("div", { class: "gruppe", style: "gap: 8px" }, h("button", { class: "knopf", "data-fokus": "sichern", onclick: () => void sichern(app, r) }, "Als Datei sichern"), ladenKnopf(app)));
}
/** Ruhige Erinnerung nach dem Abschluss. Blockiert nichts. */
export function erinnerung(app, r) {
    const { spiele } = ungesichert(app, r.id);
    if (spiele === 0)
        return null;
    return h("div", { class: `hinweis${app.hinweisHomeBildschirm ? "" : " info"}`, role: "note" }, h("div", { style: "flex-grow: 1" }, `${spiele} ${spiele === 1 ? "Spiel" : "Spiele"} noch nicht gesichert`), h("button", { class: "knopf text", style: "min-height: 0", onclick: () => void sichern(app, r) }, "Jetzt sichern"));
}
//# sourceMappingURL=sicherung.js.map