// Statistik der Runde und Spielerprofil (Spec 004, Mockup „Profil und Statistik“).
// Alle Werte kommen aus dem Kennzahlen-Katalog im Kern; hier wird nur angezeigt.
import { basisText, KENNZAHLEN, spieleVon, statSpiele } from "../../kern/kennzahlen/index.js";
import { gewinnquote } from "../../kern/kennzahlen/gewinnquote.js";
import { punkteGesamt } from "../../kern/kennzahlen/punkteGesamt.js";
import { zusammenfuehrungenAus } from "../../kern/projektion.js";
import { leseLokal, schreibeLokal } from "../app.js";
import { filzkopf, kopf, meldung, spielerBlatt, spielerName } from "../bausteine.js";
import { datumKurz, h, heute } from "../dom.js";
import { ungesichert } from "../sicherung.js";
const ZEITRAUM = (rundeId) => `dulle.zeitraum.${rundeId}`;
const ZEITRAEUME = [["alle", "alle Abende"], ["jahr", "dieses Jahr"], ["letzte10", "letzte 10 Abende"]];
/** Spec 013: Spiele mit KI mitzählen (Standard: ja). */
const MIT_KI = (rundeId) => `dulle.statistik.mitKi.${rundeId}`;
const mitKiVon = (rundeId) => leseLokal(MIT_KI(rundeId)) ?? true;
/** Schalter nur, wenn es in der Runde überhaupt Spiele mit KI gibt. */
function kiSchalter(app, r) {
    if (!Object.values(r.sitzungen).some((s) => !s.verworfen && s.mitKi.length > 0))
        return null;
    const an = mitKiVon(r.id);
    return h("div", { class: "chips" }, h("button", {
        class: "wahl", "aria-pressed": String(an), "data-fokus": "mit-ki",
        onclick: () => { schreibeLokal(MIT_KI(r.id), !an); app.zeichne(); },
    }, "Spiele mit KI mitzählen"));
}
function zeitraumVon(rundeId) {
    const z = leseLokal(ZEITRAUM(rundeId));
    return z && ZEITRAEUME.some(([id]) => id === z) ? z : "alle";
}
function ueberblick(spiele) {
    const abende = new Set(spiele.map((s) => s.sitzungId)).size;
    if (spiele.length === 0)
        return "Noch keine Spiele in diesem Zeitraum.";
    const von = spiele[0].datum;
    const bis = spiele.at(-1).datum;
    return `${abende} ${abende === 1 ? "Abend" : "Abende"} · ${spiele.length} Spiele · ${von === bis ? datumKurz(von) : `${datumKurz(von)} bis ${datumKurz(bis)}`}`;
}
/** #/runde/<id>/statistik */
export function statistik(app, teile) {
    const r = app.runde(teile[1] ?? "");
    if (!r)
        return h("div", { class: "seite" }, kopf("Runde nicht gefunden", null));
    const zeitraum = zeitraumVon(r.id);
    const spiele = statSpiele(r, zeitraum, heute(), mitKiVon(r.id));
    const name = (id) => spielerName(r, id);
    const zeilen = Object.values(r.spieler).filter((s) => !s.zusammengefuehrtIn)
        .map((s) => {
        const eigene = spieleVon(spiele, s.id);
        const punkte = punkteGesamt.berechne(spiele, s.id)?.wert ?? 0;
        const quote = gewinnquote.berechne(spiele, s.id);
        return { id: s.id, punkte, spiele: eigene.length, abende: new Set(eigene.map((x) => x.sitzungId)).size, quote };
    })
        .filter((z) => z.spiele > 0)
        .sort((a, b) => b.punkte - a.punkte || name(a.id).localeCompare(name(b.id), "de"));
    return h("div", { class: "seite" }, filzkopf("Statistik", r.name, { rechts: h("a", { class: "knopf", href: `#/runde/${r.id}` }, "Zur Runde") }), meldung(app), h("div", { class: "chips", role: "group", "aria-label": "Zeitraum" }, ZEITRAEUME.map(([id, text]) => h("button", {
        class: "wahl", "aria-pressed": String(zeitraum === id), "data-fokus": `zeitraum-${id}`,
        onclick: () => { schreibeLokal(ZEITRAUM(r.id), id); app.zeichne(); },
    }, text))), kiSchalter(app, r), h("p", { class: "leise", style: "margin: 0", "data-ueberblick": "" }, ueberblick(spiele)), zeilen.length === 0 ? null : h("section", { class: "karte", "aria-labelledby": "rangliste-titel" }, h("h2", { id: "rangliste-titel" }, "Rangliste"), h("div", { class: "endstand", role: "list" }, zeilen.map((z, i) => h("a", {
        class: "endstand-zeile", role: "listitem", href: `#/runde/${r.id}/spieler/${z.id}`, style: "color: inherit; text-decoration: none",
    }, h("span", { class: "platz" }, `${zeilen.findIndex((x) => x.punkte === z.punkte) + 1 || i + 1}.`), h("span", { class: "name", style: "display: flex; flex-direction: column" }, h("span", { class: "kuerzen" }, name(z.id)), h("span", { class: "leise", style: "font-size: 13px; font-weight: 400" }, `${z.spiele} Spiele · ${z.abende} ${z.abende === 1 ? "Abend" : "Abende"} · ${z.quote ? gewinnquote.format(z.quote.wert) : "–"} gewonnen`)), h("span", { class: `punkte ${z.punkte > 0 ? "plus" : z.punkte < 0 ? "minus" : ""}`, "data-rang": name(z.id) }, punkteGesamt.format(z.punkte)))))));
}
/** #/runde/<id>/spieler/<spielerId> */
export function spielerProfil(app, teile) {
    const r = app.runde(teile[1] ?? "");
    const id = teile[3] ?? "";
    const spieler = r?.spieler[id];
    if (!r || !spieler)
        return h("div", { class: "seite" }, kopf("Spieler nicht gefunden", null));
    if (spieler.zusammengefuehrtIn) {
        queueMicrotask(() => app.geheZu(`/runde/${r.id}/spieler/${spieler.zusammengefuehrtIn}`));
        return h("div", { class: "seite" });
    }
    const zeitraum = zeitraumVon(r.id);
    const spiele = statSpiele(r, zeitraum, heute(), mitKiVon(r.id));
    const eigene = spieleVon(spiele, id);
    const name = (x) => spielerName(r, x);
    const abende = new Set(eigene.map((s) => s.sitzungId)).size;
    const zeitraumText = ZEITRAEUME.find(([z]) => z === zeitraum)[1];
    const werte = KENNZAHLEN.map((k) => ({ k, e: k.berechne(spiele, id) })).filter(({ k, e }) => e || !k.nurMitDaten);
    const kopfzahlen = werte.filter(({ k, e }) => k.kopf && e);
    const liste = werte.filter(({ k }) => !k.kopf);
    const enthaelt = [...zusammenfuehrungenAus(app.ereignisse, r.id)].filter(([, z]) => !z.aufgehoben && z.nach === id);
    const { spiele: ungesicherte, zuletzt } = ungesichert(app, r.id);
    return h("div", { class: "seite" }, filzkopf(spieler.name, `${r.name} · ${abende} ${abende === 1 ? "Abend" : "Abende"} · ${eigene.length} Spiele${zeitraum === "alle" ? "" : ` · ${zeitraumText}`}`, {
        rechts: h("a", { class: "knopf", href: `#/runde/${r.id}/statistik` }, "Statistik"),
    }), meldung(app), eigene.length === 0
        ? h("p", { class: "leer" }, "Noch keine Spiele in diesem Zeitraum.")
        : [
            h("div", { class: "kopfzahlen" }, kopfzahlen.map(({ k, e }) => h("div", { "data-kennzahl": k.id }, h("div", { class: "kopfzahl" }, k.format(e.wert, name)), h("div", { class: "leise" }, k.id === "geld-bilanz" ? `${k.titel} · ${basisText(e.basis, eigene.length)}` : k.titel)))),
            h("div", { class: "kennzahlen", role: "list" }, liste.map(({ k, e }) => h("div", { class: "kennzahl-zeile", role: "listitem", "data-kennzahl": k.id }, h("div", { style: "flex-grow: 1; min-width: 0" }, h("div", {}, k.titel), h("div", { class: "leise", style: "font-size: 13px" }, e ? [basisText(e.basis, eigene.length), k.hinweis?.(e.wert) ? ` · ${k.hinweis(e.wert)}` : ""] : "noch keine Daten")), h("div", { class: "kennzahl-wert" }, e ? k.format(e.wert, name) : "–")))),
            h("p", { class: "leise", style: "margin: 0; font-size: 13px" }, "Werte mit weniger Spielen stammen nur aus dem Rechner. Spiele, die nur mit Punkten eingetragen wurden, kennen keine Ansagen."),
        ], enthaelt.length > 0
        ? h("div", { class: "gruppe", style: "gap: 4px" }, enthaelt.map(([zid, z]) => h("div", { class: "zeile" }, h("span", { class: "leise", style: "flex-grow: 1" }, `enthält ${name(z.von)}`), h("button", {
            class: "knopf text", style: "min-height: 44px",
            onclick: () => void app.speichere("zusammenfuehrungAufgehoben", { zusammenfuehrung: zid }, { runde: r.id }),
        }, "Aufheben"))))
        : null, h("div", { class: "dehnen" }), h("div", { class: "hinweis info", role: "note" }, h("div", {}, `Auf diesem Gerät: ${spieleVon(statSpiele(r), id).length} Spiele von ${spieler.name}. `, zuletzt ? `Zuletzt gesichert ${datumKurz(zuletzt)}${ungesicherte > 0 ? `, ${ungesicherte} Spiele seitdem` : ""}.` : "Noch nie gesichert.", " Abgleich mit anderen Handys kommt später.")), h("div", { class: "zeile", style: "flex-wrap: wrap; gap: 8px 20px" }, h("button", { class: "knopf text", "data-fokus": "name-aendern", onclick: () => app.zeigeBlatt(spielerBlatt(app, r, id)) }, "Name ändern"), h("button", { class: "knopf text", "data-fokus": "zusammenfuehren", onclick: () => app.zeigeBlatt(zusammenfuehrenBlatt(app, r, id)) }, "Doppeltes Profil zusammenführen")));
}
function zusammenfuehrenBlatt(app, r, nach) {
    const name = (x) => spielerName(r, x);
    const andere = Object.values(r.spieler).filter((s) => !s.zusammengefuehrtIn && s.id !== nach).sort((a, b) => a.name.localeCompare(b.name, "de"));
    const bestaetigen = (von) => app.zeigeBlatt(h("div", { class: "gruppe" }, h("h2", {}, `„${name(von)}“ in „${name(nach)}“ zusammenführen?`), h("p", { style: "margin: 0" }, `Alle Spiele von ${name(von)} zählen dann für ${name(nach)}. ${name(von)} verschwindet aus den Listen. Das lässt sich im Profil von ${name(nach)} wieder aufheben.`), h("button", {
        class: "knopf haupt",
        onclick: async () => { if (await app.speichere("profileZusammengefuehrt", { von, nach }, { runde: r.id }))
            app.zeigeBlatt(null); },
    }, "Zusammenführen"), h("button", { class: "knopf text", onclick: () => app.zeigeBlatt(null) }, "Abbrechen")));
    return h("div", { class: "gruppe" }, h("h2", {}, `Welches Profil ist auch ${name(nach)}?`), andere.length === 0
        ? h("p", { class: "leise" }, "Es gibt keine anderen Spieler in dieser Runde.")
        : h("div", { class: "liste", role: "group", "aria-label": "Doppeltes Profil" }, andere.map((s) => h("button", { class: "wahl", style: "justify-content: flex-start; padding: 0 16px", onclick: () => bestaetigen(s.id) }, s.name))), h("button", { class: "knopf text", onclick: () => app.zeigeBlatt(null) }, "Abbrechen"));
}
//# sourceMappingURL=statistik.js.map