// Start: offener Abend → direkt zum Spielblock, sonst die Runden. Dazu die Einstiege ins Live-Spiel (Spec 010, Ergänzung)
// und „Gegen die KI üben“ (Spec 016).
import { filzkopf, homeHinweis, installBlatt, installHinweis, kurzanleitung, meldung } from "../bausteine.js";
import { abendBeginnenBlatt } from "./runde.js";
import { vollbildAn, vollbildSinnvoll } from "../vollbild.js";
import { datumKurz, h } from "../dom.js";
import { leseLokal } from "../app.js";
import { fortsetzen, fortsetzenAlsMitspieler, gespeicherterTisch, letzterStand, tisch, ueben } from "../tisch.js";
export function start(app) {
    // Ein offener Abend, den dieses Gerät schreibt, öffnet sich beim Start direkt; ein Tisch über den Hinweis unten.
    // Nur die Übungsrunde zählt nicht als offener Abend; ein Live-Abend mit KI-Plätzen schon (Spec 018, Prüfung).
    const uebenRunde = leseLokal("dulle.uebenRunde") ?? undefined;
    const offen = app.ersteAnsicht ? app.offeneSitzung(undefined, true, uebenRunde) : undefined;
    if (offen && !gespeicherterTisch()) {
        queueMicrotask(() => app.geheZu(`/abend/${offen.sitzung.id}`));
        return h("div", { class: "seite" });
    }
    const runden = Object.values(app.sicht).sort((a, b) => a.name.localeCompare(b.name, "de"));
    const echte = runden.filter((r) => r.id !== uebenRunde);
    // Spec 018: eine Hauptaktion oben – zurück an den laufenden Tisch, sonst offenen Abend fortsetzen,
    // sonst Abend beginnen, sonst Runde anlegen.
    const rueckweg = tischRueckweg(app);
    const offenerAbend = app.offeneSitzung(undefined, true, uebenRunde);
    const haupt = rueckweg
        ? rueckweg.knopf
        : offenerAbend
            ? h("a", { class: "knopf haupt", href: `#/abend/${offenerAbend.sitzung.id}`, "data-fokus": "abend-fortsetzen" }, "Abend fortsetzen")
            : echte.length > 0
                ? h("button", { class: "knopf haupt", "data-fokus": "abend-beginnen", "aria-haspopup": "dialog", onclick: () => abendBeginnen(app, echte) }, "Abend beginnen")
                : h("a", { class: "knopf haupt", href: "#/runde-neu", "data-fokus": "runde-anlegen" }, "Runde anlegen");
    return h("div", { class: "seite" }, filzkopf("Dulle", "Doppelkopf mitschreiben und live spielen", { motiv: true, aktionen: h("a", { class: "knopf", href: "#/einstellungen", "data-fokus": "einstellungen" }, "Einstellungen") }), homeHinweis(app), installHinweis(app), meldung(app), h("div", { class: "gruppe", role: "group", "aria-label": "Spielen" }, rueckweg ? h("p", { class: "leise", style: "margin: 0", "data-tisch-hinweis": "" }, rueckweg.text) : null, 
    // Spec 018 (Erstnutzer): Nach „Abend beenden“ ist der Abend noch offen; das steht über dem Knopf.
    !rueckweg && offenerAbend ? h("p", { class: "leise", style: "margin: 0", "data-abend-hinweis": "" }, `${offenerAbend.runde.name}, ${datumKurz(offenerAbend.sitzung.datum)}: noch nicht abgeschlossen.`) : null, haupt, h("button", {
        class: "knopf", "data-fokus": "ueben",
        onclick: async () => { if (vollbildSinnvoll(app.alsApp))
            vollbildAn(); const f = await ueben(app); if (f)
            app.melde(f);
        else
            app.geheZu("/tisch"); },
    }, "Gegen die KI üben"), h("button", { class: "knopf text", "data-fokus": "einladung-oeffnen", "aria-haspopup": "dialog", onclick: () => app.zeigeBlatt(einladungBlatt(app)) }, "Eingeladen? Link einfügen")), echte.length === 0
        // Spec 018 (Gestaltung): knapp und ohne den großen Leerraum von .leer, die Hauptaktion steht direkt darüber.
        ? h("p", { class: "leise", style: "margin: 0" }, "Noch keine Runde. Üben geht auch ohne.")
        : h("nav", { class: "liste", "aria-label": "Runden" }, echte.map((r) => h("a", { href: `#/runde/${r.id}` }, h("span", { style: "flex-grow: 1; font-weight: 600" }, r.name), h("span", { class: "leise" }, `${Object.values(r.spieler).filter((s) => !s.ausgeblendet).length} Spieler`)))), kurzanleitung(!echte.some((r) => Object.keys(r.sitzungen).length > 0)), echte.length > 0 || !app.alsApp ? h("div", { class: "gruppe", "data-weiteres": "" }, echte.length > 0 ? h("a", { class: "knopf text", href: "#/runde-neu", "data-fokus": "neue-runde" }, "Neue Runde anlegen") : null, 
    // Spec 017 (Live-Test): Installieren immer erreichbar, solange Dulle nicht als App läuft.
    !app.alsApp ? h("button", { class: "knopf text", "data-fokus": "als-app", "aria-haspopup": "dialog", onclick: () => app.zeigeBlatt(installBlatt(app)) }, "Als App installieren") : null) : null);
}
/** Spec 017: Hauptweg mit vorhandener Runde. Eine Runde → „Wie spielt ihr?“, mehrere → zuerst die Runde wählen. */
function abendBeginnen(app, runden) {
    // Zuletzt genutzte Runde zuerst (jüngster Abend).
    const zuletzt = (r) => Object.values(r.sitzungen).reduce((m, s) => (s.datum > m ? s.datum : m), "");
    const sortiert = [...runden].sort((a, b) => zuletzt(b).localeCompare(zuletzt(a)));
    const waehlen = () => app.zeigeBlatt(h("div", { class: "gruppe" }, h("h2", { id: "abend-runde-titel" }, "Mit welcher Runde?"), h("nav", { class: "liste", "aria-labelledby": "abend-runde-titel" }, sortiert.map((r) => h("a", {
        href: "#/", onclick: (e) => { e.preventDefault(); app.zeigeBlatt(abendBeginnenBlatt(app, r.id)); },
    }, h("span", { style: "flex-grow: 1; font-weight: 600" }, r.name)))), h("button", { class: "knopf text", onclick: () => app.zeigeBlatt(null) }, "Abbrechen")));
    app.zeigeBlatt(abendBeginnenBlatt(app, sortiert[0].id, sortiert.length > 1 ? waehlen : undefined));
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
/** Läuft ein Tisch am Handy (oder hat dieses Gerät einen eröffnet), ist „Zurück an den Tisch“ die Hauptaktion. */
function tischRueckweg(app) {
    const t = tisch();
    // Der eigene Tisch läuft noch (z. B. über „Zur Startseite“ im Tisch-Menü hierher gekommen).
    if (t?.gastgeber) {
        return { text: "Dein Tisch läuft noch.",
            knopf: h("a", { class: "knopf haupt", href: t.gastgeber.spiel ? "#/tisch" : `#/runde/${t.rundeId}/am-handy`, "data-fokus": "zum-tisch" }, "Zurück an den Tisch") };
    }
    if (t?.client?.sicht)
        return { text: "Du sitzt an einem Tisch.", knopf: h("a", { class: "knopf haupt", href: "#/tisch", "data-fokus": "zum-tisch" }, "Zurück an den Tisch") };
    const g = gespeicherterTisch();
    if (!t && g) {
        return { text: "Du hast einen Tisch eröffnet, der noch läuft.",
            knopf: h("button", { class: "knopf haupt", "data-fokus": "tisch-fortsetzen", onclick: async () => { await fortsetzen(app); app.geheZu(`/runde/${g.rundeId}/am-handy`); } }, "Zurück an den Tisch") };
    }
    // Spec 012: Mitspieler nach Neuladen. Der letzte Stand bleibt sichtbar, bis der Gastgeber ihn zurückholt.
    const stand = letzterStand();
    if (!t && stand) {
        return { text: `Zurück an den Tisch bei ${stand.tisch.gastgeberName}?`,
            knopf: h("button", { class: "knopf haupt", "data-fokus": "tisch-zurueck", onclick: () => { fortsetzenAlsMitspieler(app); app.geheZu("/tisch"); } }, "Zurück an den Tisch") };
    }
    return null;
}
//# sourceMappingURL=start.js.map