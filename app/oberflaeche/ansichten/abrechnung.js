// Abrechnung des Abends (Spec 003, Mockup „Schreiber · Abrechnung des Abends“).
import { abendInZahlen, betraegeInCent, endstand, euro, geldPunkte, teilenText, zahlungen } from "../../kern/abrechnung.js";
import { punktwertCent } from "../../kern/profile.js";
import { nachAbschluss } from "../export.js";
import { leseLokal, schreibeLokal } from "../app.js";
import { filzkopf, kopf, meldung, spielerName } from "../bausteine.js";
import { datumKurz, h, punkteText } from "../dom.js";
import { erinnerung } from "../sicherung.js";
const ZULETZT = (rundeId) => `dulle.punktwert.${rundeId}`;
const STUFEN = [0, 1, 2, 5, 10];
/** Gewählter Punktwert je Abend, solange der Bildschirm offen ist (0 = ohne Geld). */
const auswahl = new Map();
let eigenerOffen = false;
export function abrechnung(app, teile) {
    const gefunden = app.sitzung(teile[1] ?? "");
    if (!gefunden)
        return h("div", { class: "seite" }, kopf("Abend nicht gefunden", null));
    const { runde: r, sitzung: s } = gefunden;
    // Ein noch vorgemerktes Spiel gehört in die Abrechnung.
    if (app.ausstehend)
        queueMicrotask(() => void app.festschreiben());
    const name = (id) => spielerName(r, id);
    // Spec 013: Mit KI-Platz (zu dritt) gibt es nur Punkte, kein Geld.
    const cent = s.kiPlatz ? 0 : s.abgeschlossen
        ? s.punktwertCent ?? 0
        : auswahl.get(s.id) ?? punktwertCent(s.profil) ?? leseLokal(ZULETZT(r.id)) ?? 0;
    const waehle = (wert) => {
        auswahl.set(s.id, wert);
        schreibeLokal(ZULETZT(r.id), wert);
        app.zeichne();
    };
    const liste = endstand(s.summen, (a, b) => name(a).localeCompare(name(b), "de"));
    // Prämien (Spec 007) zählen im Endstand, aber nicht beim Geld.
    const betraege = betraegeInCent(geldPunkte(s.summen, s.praemien), cent);
    const praemienText = Object.entries(s.praemien).filter(([, p]) => p > 0).map(([id, p]) => `${name(id)} ${p}`).join(", ");
    const zahl = abendInZahlen(s);
    const datum = datumKurz(s.datum);
    const teilen = async () => {
        const text = teilenText(r.name, datum, liste, name, cent || null, s.praemien) + (s.kiPlatz ? "\nMit KI am Tisch, deshalb ohne Geld." : "");
        try {
            if (typeof navigator.share === "function") {
                await navigator.share({ text });
                return;
            }
            await navigator.clipboard.writeText(text);
            app.melde("Ergebnis kopiert. Jetzt in die Gruppe einfügen.", "info");
        }
        catch (fehler) {
            if (fehler.name === "AbortError")
                return;
            // Kein Teilen und keine Zwischenablage: Text zum Markieren zeigen.
            app.zeigeBlatt(h("div", { class: "gruppe" }, h("h2", {}, "Ergebnis teilen"), h("textarea", { readonly: true, rows: 6, "aria-label": "Ergebnis", style: "width: 100%; font: inherit" }, text), h("button", { class: "knopf text", onclick: () => app.zeigeBlatt(null) }, "Schließen")));
        }
    };
    const abschliessen = async () => {
        await app.festschreiben();
        const aktuell = app.sitzung(s.id)?.sitzung ?? s;
        await app.speichere("sitzungAbgeschlossen", { endstand: { ...aktuell.summen }, ...(cent > 0 ? { punktwertCent: cent } : {}) }, { runde: r.id, sitzung: s.id });
        // Spec 005: an die eigene Seite, wenn eingerichtet. Fehler stören nie.
        void nachAbschluss(app);
    };
    const zahlungsListe = cent > 0 ? zahlungen(betraege) : [];
    const kachel = (titel, wert) => h("div", { class: "kachel" }, h("div", { class: "leise" }, titel), h("div", { class: "kachel-wert" }, wert));
    return h("div", { class: "seite" }, filzkopf("Abrechnung", `${r.name} · ${datum}${s.abgeschlossen ? " · abgeschlossen" : ""}`, {
        rechts: h("a", { class: "knopf", href: `#/abend/${s.id}` }, "Spielblock"),
    }), meldung(app), h("section", { class: "karte", "aria-labelledby": "endstand-titel" }, h("h2", { id: "endstand-titel" }, "Endstand"), h("div", { class: "endstand", role: "list" }, liste.map((p) => h("div", { class: "endstand-zeile", role: "listitem" }, h("span", { class: "platz" }, `${p.platz}.`), h("span", { class: "name kuerzen" }, name(p.id)), h("span", { class: `punkte ${p.punkte > 0 ? "plus" : p.punkte < 0 ? "minus" : ""}` }, punkteText(p.punkte, true)), cent > 0 ? h("span", { class: "betrag", "data-betrag": name(p.id) }, euro(betraege[p.id] ?? 0)) : null)))), s.kiPlatz
        ? h("p", { class: "leise", style: "margin: 0", "data-ohne-geld": "ki" }, "Mit KI am Tisch: nur Punkte, kein Geld.")
        : s.abgeschlossen
            ? h("p", { class: "leise", style: "margin: 0" }, cent > 0 ? `Punktwert ${cent} ct` : "Ohne Geld abgerechnet")
            : h("div", { class: "gruppe" }, h("div", { id: "punktwert-titel", style: "font-size: 14px; font-weight: 600" }, "Punktwert"), h("div", { class: "chips", role: "group", "aria-labelledby": "punktwert-titel" }, STUFEN.map((w) => h("button", { class: "wahl", "aria-pressed": String(!eigenerOffen && cent === w), "data-fokus": `pw-${w}`, onclick: () => { eigenerOffen = false; waehle(w); } }, w === 0 ? "ohne Geld" : `${w} ct`)), h("button", { class: "wahl", "aria-pressed": String(eigenerOffen || !STUFEN.includes(cent)), "data-fokus": "pw-eigen", onclick: () => { eigenerOffen = true; app.zeichne(); } }, "eigener")), eigenerOffen || !STUFEN.includes(cent)
                ? h("div", { class: "zeile" }, h("label", { for: "eigener-punktwert" }, "Cent je Punkt"), h("input", {
                    id: "eigener-punktwert", type: "text", inputmode: "numeric", pattern: "[0-9]*", value: cent || "", "data-fokus": "pw-feld",
                    style: "width: 88px; flex: none",
                    onchange: (e) => {
                        const z = Number.parseInt(e.target.value, 10);
                        waehle(Number.isFinite(z) && z >= 0 ? Math.min(z, 1000) : 0);
                    },
                }))
                : null), cent > 0
        ? h("section", { class: "gruppe", "aria-labelledby": "zahlen-titel" }, h("h2", { id: "zahlen-titel" }, "Wer zahlt wem"), zahlungsListe.length === 0
            ? h("p", { class: "leise" }, "Alles ausgeglichen.")
            : h("div", { class: "liste", "data-zahlungen": "" }, zahlungsListe.map((z) => h("div", {}, h("span", { style: "flex-grow: 1" }, `${name(z.von)} → ${name(z.an)}`), h("span", { class: "betrag" }, euro(z.cent))))))
        : null, h("section", { class: "gruppe", "aria-labelledby": "inzahlen-titel" }, h("h2", { id: "inzahlen-titel" }, "Der Abend in Zahlen"), h("div", { class: "kacheln" }, kachel("Spiele", String(zahl.spiele)), kachel("Soli gewonnen", `${zahl.soliGewonnen} von ${zahl.soliGespielt}`), zahl.teuerstes ? kachel(`Teuerstes Spiel (Nr. ${zahl.teuerstes.nr})`, `${zahl.teuerstes.wert} ${zahl.teuerstes.wert === 1 ? "Punkt" : "Punkte"}`) : null, zahl.reGewinnt ? kachel("Re gewinnt", `${zahl.reGewinnt.gewonnen} von ${zahl.reGewinnt.von}`) : null, praemienText ? kachel("Hochzeitsprämien", praemienText) : null), praemienText && cent > 0 ? h("p", { class: "leise", style: "margin: 0" }, "Prämien zählen im Endstand, aber nicht beim Geld.") : null), h("div", { class: "dehnen" }), s.abgeschlossen ? erinnerung(app, r) : null, h("button", { class: "knopf", "data-fokus": "teilen", onclick: () => void teilen() }, "Ergebnis teilen"), s.abgeschlossen
        ? h("a", { class: "knopf haupt", href: `#/runde/${r.id}`, "data-fokus": "zur-runde" }, "Zur Runde")
        : h("button", { class: "knopf haupt", "data-fokus": "abschliessen", onclick: () => void abschliessen() }, "Abend abschließen"));
}
//# sourceMappingURL=abrechnung.js.map