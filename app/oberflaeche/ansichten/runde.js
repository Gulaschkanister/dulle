// Runde: Spieler und vergangene Abende, Hauptaktion „Abend beginnen“ (Mockup „Schreiber · Runde“).
import { filzkopf, homeHinweis, kopf, meldung, spielerAnlegenBlatt, spielerName } from "../bausteine.js";
import { datumKurz, h, punkteText } from "../dom.js";
import { sicherungsBereich } from "../sicherung.js";
let ausgeblendeteZeigen = false;
export function runde(app, teile) {
    const rundeId = teile[1] ?? "";
    const r = app.runde(rundeId);
    if (!r)
        return h("div", { class: "seite" }, kopf("Runde nicht gefunden", null), h("a", { class: "knopf", href: "#/" }, "Zur Übersicht"));
    const spieler = Object.values(r.spieler).filter((s) => !s.zusammengefuehrtIn).sort((a, b) => a.name.localeCompare(b.name, "de"));
    const sichtbar = spieler.filter((s) => !s.ausgeblendet || ausgeblendeteZeigen);
    const anzahlAusgeblendet = spieler.filter((s) => s.ausgeblendet).length;
    const abende = Object.values(r.sitzungen).filter((s) => !s.verworfen).sort((a, b) => (a.id < b.id ? 1 : -1));
    const offen = app.offeneSitzung(r.id);
    return h("div", { class: "seite" }, filzkopf(r.name, "Runde", { motiv: true, aktionen: [h("a", { class: "knopf", href: "#/" }, "Runde wechseln"), h("a", { class: "knopf", href: `#/runde/${r.id}/statistik`, "data-fokus": "statistik" }, "Statistik")] }), homeHinweis(app), meldung(app), h("section", { class: "gruppe", "aria-labelledby": "spieler-titel" }, h("h2", { id: "spieler-titel" }, "Spieler"), h("div", { class: "chips" }, sichtbar.map((s) => h("a", {
        class: `chip${s.ausgeblendet ? " ausgeblendet" : ""}`, "data-fokus": `spieler-${s.id}`, href: `#/runde/${r.id}/spieler/${s.id}`,
        style: "text-decoration: none",
    }, s.name)), h("button", { class: "chip neu", "data-fokus": "spieler-anlegen", onclick: () => app.zeigeBlatt(spielerAnlegenBlatt(app, r)) }, "+ Spieler anlegen")), h("div", { class: "leise" }, spieler.length > 0 ? "Antippen für Statistik, Umbenennen oder Ausblenden" : "Lege die Spieler eurer Runde an, mindestens vier.", anzahlAusgeblendet > 0
        ? [" · ", h("button", { class: "knopf text leise", style: "min-height: 0", onclick: () => { ausgeblendeteZeigen = !ausgeblendeteZeigen; app.zeichne(); } }, ausgeblendeteZeigen ? "ausgeblendete verbergen" : `${anzahlAusgeblendet} ausgeblendet`)]
        : null)), h("section", { class: "gruppe", "aria-labelledby": "abende-titel" }, h("h2", { id: "abende-titel" }, "Abende"), abende.length === 0
        ? h("p", { class: "leise" }, "Noch keine Abende.")
        : h("div", { class: "liste" }, abende.map((s) => {
            const gueltig = s.spiele.filter((sp) => !sp.verworfen).length;
            const bester = Object.entries(s.summen).sort((a, b) => b[1] - a[1])[0];
            return h("a", { href: `#/abend/${s.id}` }, h("span", { style: "width: 92px; font-weight: 600" }, datumKurz(s.datum)), h("span", { class: "leise", style: "flex-grow: 1" }, `${gueltig} ${gueltig === 1 ? "Spiel" : "Spiele"}${s.abgeschlossen ? "" : " · läuft"}`), bester ? [h("span", { class: "leise" }, spielerName(r, bester[0])), h("span", { class: "zahl", style: "width: 40px; text-align: right; font-weight: 600" }, punkteText(bester[1], true))] : null);
        }))), sicherungsBereich(app, r), h("div", { class: "dehnen" }), 
    // Live spielen (am PC, Handy, Tablet) ist immer da, auch wenn ein Abend im Schreiber offen ist (Spec 010, Ergänzung).
    h("a", { class: "knopf", href: `#/runde/${r.id}/am-handy`, "data-fokus": "am-handy" }, "Live spielen"), offen
        ? h("a", { class: "knopf haupt", href: `#/abend/${offen.sitzung.id}`, "data-fokus": "abend" }, "Offenen Abend fortsetzen")
        : h("a", { class: "knopf haupt", href: `#/runde/${r.id}/abend-beginnen`, "data-fokus": "abend" }, "Abend beginnen"));
}
//# sourceMappingURL=runde.js.map