// Start: offener Abend → direkt zum Spielblock, sonst die Runden. Dazu die Einstiege ins Live-Spiel (Spec 010, Ergänzung)
// und „Gegen die KI üben“ (Spec 016).
import { filzkopf, homeHinweis, meldung } from "../bausteine.js";
import { h } from "../dom.js";
import { ladenKnopf } from "../sicherung.js";
import { leseLokal, schreibeLokal } from "../app.js";
import { fortsetzen, fortsetzenAlsMitspieler, gespeicherterTisch, letzterStand, tisch, ueben } from "../tisch.js";
/** Spec 016: „Live spielen“ ohne Runde: Nach „Runde anlegen“ geht es an den Tisch, nicht zum Schreiber. */
export const NACH_ANLEGEN = "dulle.nachAnlegen";
export function start(app) {
    // Ein offener Abend, den dieses Gerät schreibt, öffnet sich beim Start direkt; ein Tisch über den Hinweis unten.
    const offen = app.ersteAnsicht ? app.offeneSitzung(undefined, true) : undefined;
    if (offen && !offen.sitzung.kiPlatz && !gespeicherterTisch()) {
        queueMicrotask(() => app.geheZu(`/abend/${offen.sitzung.id}`));
        return h("div", { class: "seite" });
    }
    const runden = Object.values(app.sicht).sort((a, b) => a.name.localeCompare(b.name, "de"));
    const echte = runden.filter((r) => r.id !== leseLokal("dulle.uebenRunde"));
    return h("div", { class: "seite" }, filzkopf("Dulle", "Doppelkopf mitschreiben und live spielen", { motiv: true, aktionen: h("a", { class: "knopf", href: "#/einstellungen", "data-fokus": "einstellungen" }, "Einstellungen") }), homeHinweis(app), meldung(app), tischHinweis(app), h("div", { class: "raster-2", role: "group", "aria-label": "Spielen" }, h("button", { class: "knopf", "data-fokus": "live-spielen", onclick: () => liveSpielen(app, echte) }, "Live spielen"), h("button", {
        class: "knopf", "data-fokus": "ueben",
        onclick: async () => { const f = await ueben(app); if (f)
            app.melde(f);
        else
            app.geheZu("/tisch"); },
    }, "Gegen die KI üben"), h("button", { class: "knopf", style: "grid-column: 1 / -1", "data-fokus": "einladung-oeffnen", onclick: () => app.zeigeBlatt(einladungBlatt(app)) }, "Einladung öffnen")), runden.length === 0
        ? h("p", { class: "leer" }, "Für eure Runde: zuerst unten anlegen, zum Beispiel „Donnerstagsrunde“. Üben geht auch ohne.")
        : h("nav", { class: "liste", "aria-label": "Runden" }, runden.map((r) => h("a", { href: `#/runde/${r.id}` }, h("span", { style: "flex-grow: 1; font-weight: 600" }, r.name), h("span", { class: "leise" }, `${Object.values(r.spieler).filter((s) => !s.ausgeblendet).length} Spieler`)))), ladenKnopf(app, "Runde aus Datei laden", "knopf text"), h("div", { class: "dehnen" }), h("a", { class: "knopf haupt", href: "#/runde-neu", "data-fokus": "runde-anlegen" }, "Runde anlegen"));
}
/** Live spielen: eine Runde → direkt zum Tisch eröffnen; mehrere → erst die Runde wählen; keine → erst anlegen. */
function liveSpielen(app, runden) {
    if (runden.length === 0) {
        app.melde("Lege zuerst eure Runde mit den Spielern an. Danach geht es direkt an den Tisch.", "info");
        schreibeLokal(NACH_ANLEGEN, "live");
        app.geheZu("/runde-neu");
        return;
    }
    if (runden.length === 1) {
        app.geheZu(`/runde/${runden[0].id}/am-handy`);
        return;
    }
    app.zeigeBlatt(h("div", { class: "gruppe" }, h("h2", { id: "live-titel" }, "Mit welcher Runde?"), h("nav", { class: "liste", "aria-labelledby": "live-titel" }, runden.map((r) => h("a", {
        href: `#/runde/${r.id}/am-handy`, onclick: () => app.zeigeBlatt(null),
    }, h("span", { style: "flex-grow: 1; font-weight: 600" }, r.name)))), h("button", { class: "knopf text", onclick: () => app.zeigeBlatt(null) }, "Abbrechen")));
}
/**
 * Einladung öffnen: Link oder Code einfügen, wenn man ihn nicht antippen kann (z. B. am PC aus einer Nachricht).
 * Ein Link mit `#/raum/…` geht zum Tisch über das Internet, alles andere ist eine QR-Einladung.
 */
function einladungBlatt(app) {
    const feld = h("textarea", { id: "einladung-text", rows: 4, "aria-label": "Link oder Code der Einladung", placeholder: "Link oder Code hier einfügen" });
    const oeffnen = () => {
        const text = feld.value.trim();
        if (!text) {
            feld.focus();
            return;
        }
        const raum = /#\/raum\/([A-Za-z0-9_-]+)\/([A-Za-z0-9_-]+)/.exec(text);
        app.zeigeBlatt(null);
        if (raum)
            app.geheZu(`/raum/${raum[1]}/${raum[2]}`);
        else {
            const i = text.indexOf("#/beitreten/");
            let code = text;
            try {
                if (i >= 0)
                    code = decodeURIComponent(text.slice(i + "#/beitreten/".length));
            }
            catch {
                code = text.slice(i + "#/beitreten/".length);
            }
            app.geheZu(`/beitreten/${encodeURIComponent(code)}`);
        }
    };
    return h("div", { class: "gruppe" }, h("h2", {}, "Einladung öffnen"), h("p", { class: "leise", style: "margin: 0" }, "Hast du einen Link oder Code bekommen? Hier einfügen. Antippen geht auch, dann öffnet sich der Tisch von selbst."), feld, h("button", { class: "knopf haupt", "data-fokus": "einladung-los", onclick: oeffnen }, "Öffnen"), h("button", { class: "knopf text", onclick: () => app.zeigeBlatt(null) }, "Abbrechen"));
}
/** Läuft ein Tisch am Handy (oder hat dieses Gerät einen eröffnet), geht es von hier zurück. */
function tischHinweis(app) {
    const t = tisch();
    if (t?.client?.sicht)
        return h("div", { class: "hinweis info" }, h("div", { style: "flex-grow: 1" }, "Du sitzt an einem Tisch."), h("a", { class: "knopf", href: "#/tisch", "data-fokus": "zum-tisch" }, "Zurück an den Tisch"));
    const g = gespeicherterTisch();
    if (!t && g) {
        return h("div", { class: "hinweis info" }, h("div", { style: "flex-grow: 1" }, "Du hast einen Tisch eröffnet, der noch läuft."), h("button", { class: "knopf", "data-fokus": "tisch-fortsetzen", onclick: async () => { await fortsetzen(app); app.geheZu(`/runde/${g.rundeId}/am-handy`); } }, "Fortsetzen"));
    }
    // Spec 012: Mitspieler nach Neuladen. Der letzte Stand bleibt sichtbar, bis der Gastgeber ihn zurückholt.
    const stand = letzterStand();
    if (!t && stand) {
        return h("div", { class: "hinweis info" }, h("div", { style: "flex-grow: 1" }, `Zurück an den Tisch bei ${stand.tisch.gastgeberName}?`), h("button", { class: "knopf", "data-fokus": "tisch-zurueck", onclick: () => { fortsetzenAlsMitspieler(app); app.geheZu("/tisch"); } }, "Zurück an den Tisch"));
    }
    return null;
}
//# sourceMappingURL=start.js.map