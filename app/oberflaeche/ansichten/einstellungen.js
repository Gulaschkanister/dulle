// Einstellungen dieses Geräts (Spec 011, 030, 005): Kartensatz, Verbindung (TURN), Export an eine eigene Seite.
import { filzkopf, meldung } from "../bausteine.js";
import { h } from "../dom.js";
import { alleKartensaetze, istEigener, karte, kartensatz, loescheKartensatz, speichereKartensatz, waehleKartensatz } from "../karten.js";
import { pruefeKartensatz } from "../../kern/kartensatz.js";
import { neueUlid } from "../../kern/ulid.js";
import { leseLokal, schreibeLokal } from "../app.js";
import { TURN, vermittlungNeu } from "../tisch.js";
import { exportEinstellung, exportJetzt, exportLaeuft, exportStand, ladeExport, speichereExport, spielLaeuft, verbindungPruefen } from "../export.js";
import { pruefeAdresse } from "../../netz/export.js";
const VORSCHAU = ["herz-A-a", "herz-10-a", "herz-K-a", "herz-D-a", "herz-B-a", "herz-9-a"];
const FARBEN = ["kreuz-D-a", "pik-D-a", "herz-D-a", "karo-D-a"];
export function einstellungen(app) {
    const aktuell = kartensatz().id;
    return h("div", { class: "seite" }, filzkopf("Einstellungen", "Gilt nur für dieses Gerät", { rechts: h("a", { class: "knopf", href: "#/" }, "Zurück") }), meldung(app), h("section", { class: "gruppe", "aria-labelledby": "kartensatz-titel" }, h("h2", { id: "kartensatz-titel" }, "Kartensatz"), h("div", { class: "liste-saetze", role: "radiogroup", "aria-labelledby": "kartensatz-titel" }, alleKartensaetze().map((satz) => h("button", {
        class: "wahl satz-wahl", role: "radio", "aria-checked": String(satz.id === aktuell), "data-fokus": `satz-${satz.id}`,
        onclick: () => { waehleKartensatz(satz.id); app.zeichne(); },
    }, h("span", { class: "satz-kopf" }, h("strong", {}, satz.name), h("span", { class: "leise" }, satz.beschreibung)), h("span", { class: "satz-reihe", "aria-hidden": "true" }, VORSCHAU.map((id) => karte(id, { groesse: "klein", satz }))), h("span", { class: "satz-reihe", "aria-hidden": "true" }, FARBEN.map((id) => karte(id, { groesse: "klein", satz })))))), 
    // Spec 020: eigene Sätze bearbeiten, alle kopieren, eigene löschen.
    h("div", { class: "chips", role: "group", "aria-label": "Gewählter Kartensatz" }, istEigener(aktuell) ? h("a", { class: "wahl", href: `#/kartensatz/${aktuell}`, "data-fokus": "satz-bearbeiten" }, "Bearbeiten") : null, h("a", { class: "wahl", href: `#/kartensatz/${aktuell}/kopie`, "data-fokus": "satz-kopieren" }, "Kopieren und anpassen"), istEigener(aktuell) ? h("button", { class: "wahl", "data-fokus": "satz-loeschen", onclick: () => app.zeigeBlatt(h("div", { class: "gruppe" }, h("h2", {}, `„${kartensatz().name}“ löschen?`), h("p", { class: "leise" }, "Nur auf diesem Gerät. Wer den Satz als Datei hat, behält ihn."), h("button", { class: "knopf", "data-fokus": "wirklich-loeschen", onclick: async () => { app.zeigeBlatt(null); await loescheKartensatz(aktuell); app.zeichne(); } }, "Löschen"), h("button", { class: "knopf text", onclick: () => app.zeigeBlatt(null) }, "Behalten"))) }, "Löschen") : null), h("div", { class: "raster-2" }, h("a", { class: "knopf haupt", href: "#/kartensatz/neu", "data-fokus": "satz-bauen" }, "Eigenen Kartensatz bauen"), h("label", { class: "knopf datei-knopf" }, "Kartensatz aus Datei", h("input", { type: "file", accept: ".json,application/json", class: "unsichtbar", "aria-label": "Kartensatz aus Datei", "data-fokus": "satz-datei", onchange: async (ev) => {
            const datei = ev.target.files?.[0];
            if (!datei)
                return;
            let json;
            try {
                json = JSON.parse(await datei.text());
            }
            catch {
                app.melde("Diese Datei ist kein Kartensatz.");
                return;
            }
            const r = pruefeKartensatz(json);
            if (!r.ok) {
                app.melde(r.fehler[0] ?? "Diese Datei ist kein Kartensatz.");
                return;
            }
            // Gleiche ID wie ein mitgelieferter Satz: als eigener mit neuer ID.
            const satz = istEigener(r.satz.id) || r.satz.id.startsWith("eigen-") ? r.satz : { ...r.satz, id: `eigen-${neueUlid().toLowerCase().slice(-12)}` };
            await speichereKartensatz(satz);
            waehleKartensatz(satz.id);
            app.melde(`„${satz.name}“ geladen und ausgewählt.`, "info");
        } }))), h("p", { class: "leise" }, "Die Karten sehen im hellen und im dunklen Modus gleich aus, wie echte Karten.")), verbindung(app), exportBereich(app));
}
/** Getipptes, noch nicht gespeichert: übersteht ein Neuzeichnen (z. B. wenn ein Senden gerade fertig wird). */
const exportEntwurf = {};
/** Ergebnis von „Verbindung prüfen“ und „Jetzt senden“: unter den Knöpfen, wo man getippt hat (UI-Prüfung 005). */
let exportMeldung = null;
/** Spec 005: optionaler Export an eine eigene Seite (z. B. die Homepage). */
function exportBereich(app) {
    const e = exportEinstellung();
    if (e === undefined) {
        void ladeExport(app).then(() => app.zeichne());
        return h("div", {});
    }
    const st = exportStand();
    const wert = (id) => document.getElementById(id)?.value.trim() ?? "";
    // Felder speichern beim Verlassen, ohne neu zu zeichnen: sonst ginge verloren, was man im nächsten Feld schon tippt.
    const speichern = async (auto = e?.auto ?? true, neuZeichnen = true) => {
        const adresse = wert("export-adresse");
        const fehler = adresse ? pruefeAdresse(adresse) : null;
        if (fehler) {
            exportMeldung = { text: fehler, fehler: true };
            app.zeichne();
            return false;
        }
        await speichereExport(app, adresse ? { adresse, schluessel: wert("export-schluessel"), auto } : null);
        if (neuZeichnen)
            app.zeichne();
        return true;
    };
    const zeit = (iso) => new Date(iso).toLocaleString("de-DE", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
    return h("details", { class: "gruppe", "data-export": "", ...(e || exportEntwurf.adresse || exportMeldung ? { open: true } : {}) }, h("summary", {}, "Export an eine eigene Seite"), h("p", { class: "leise" }, "Nur, wenn du eine eigene Seite hast, die Spiele empfängt (z. B. deine Homepage). Ohne Eintrag sendet die App nichts."), h("label", { for: "export-adresse" }, "Adresse"), h("input", { id: "export-adresse", type: "url", inputmode: "url", placeholder: "https://…", value: exportEntwurf.adresse ?? e?.adresse ?? "", autocomplete: "off", spellcheck: false,
        oninput: (ev) => { exportEntwurf.adresse = ev.target.value; exportMeldung = null; }, onchange: () => void speichern(undefined, false) }), h("label", { for: "export-schluessel" }, "Schlüssel"), h("input", { id: "export-schluessel", type: "password", value: exportEntwurf.schluessel ?? e?.schluessel ?? "", autocomplete: "off",
        oninput: (ev) => { exportEntwurf.schluessel = ev.target.value; }, onchange: () => void speichern(undefined, false) }), h("p", { class: "leise" }, "Gesendet werden alle Ereignisse der Runden auf diesem Gerät, mit den Namen der Spieler."), h("div", { class: "chips" }, h("button", {
        class: "wahl", "aria-pressed": String(e?.auto ?? true), "data-fokus": "export-auto", disabled: !e,
        onclick: () => void speichern(!(e?.auto ?? true)),
    }, `Nach „Abend abschließen“ automatisch senden: ${(e?.auto ?? true) ? "an" : "aus"}`)), h("div", { class: "raster-2" }, h("button", { class: "knopf", "data-fokus": "export-pruefen", disabled: exportLaeuft(), onclick: async () => {
            if (!(await speichern()))
                return;
            const f = await verbindungPruefen();
            exportMeldung = { text: f ?? "Verbindung steht.", fehler: !!f };
            app.zeichne();
        } }, "Verbindung prüfen"), h("button", { class: "knopf", "data-fokus": "export-senden", disabled: exportLaeuft() || spielLaeuft(), onclick: async () => {
            if (!(await speichern()))
                return;
            const s = await exportJetzt(app);
            if (s) {
                exportMeldung = { text: s.fehler ?? (s.wartend ? `Gesendet, ${s.wartend} warten noch.` : "Alles gesendet."), fehler: !!s.fehler };
                app.zeichne();
            }
        } }, exportLaeuft() ? "Sendet …" : "Jetzt senden")), spielLaeuft() ? h("p", { class: "leise" }, "Während ein Spiel läuft, wird nicht gesendet. Nach dem Spiel geht „Jetzt senden“ wieder.") : null, exportMeldung ? h("p", { class: exportMeldung.fehler ? "hinweis fehler" : "hinweis info", role: exportMeldung.fehler ? "alert" : "status" }, exportMeldung.text) : null, e && st && !exportMeldung?.fehler ? h("p", { class: `${st.fehler ? "hinweis fehler" : "leise"}`, "data-export-stand": "" }, st.fehler ? `Letzter Versuch: ${st.fehler}` : `Zuletzt gesendet: ${st.zuletzt ? zeit(st.zuletzt) : "noch nie"} · ${st.gesendet} Ereignisse${st.wartend ? ` · ${st.wartend} warten` : ""}`) : null);
}
/** Spec 030: optionaler TURN-Server für Verbindungen über das Internet. */
/** Getipptes für TURN, bis es gespeichert ist: übersteht jedes Neuzeichnen (UI-Prüfung 030). */
const turnEntwurf = {};
let turnMeldung = null;
function verbindung(app) {
    const turn = leseLokal(TURN);
    const feld = (id, text, schluessel, wert, typ = "text") => [
        h("label", { for: id }, text),
        h("input", {
            id, type: typ, value: turnEntwurf[schluessel] ?? wert, autocomplete: "off", spellcheck: false, ...(schluessel === "urls" ? { inputmode: "url" } : {}),
            oninput: (ev) => { turnEntwurf[schluessel] = ev.target.value; },
        }),
    ];
    const speichern = () => {
        const wert = (id) => document.getElementById(id)?.value.trim() ?? "";
        const urls = wert("turn-adresse");
        if (urls && !/^turns?:/.test(urls)) {
            turnMeldung = { text: "Die Adresse beginnt mit turn: oder turns:", fehler: true };
            app.zeichne();
            return;
        }
        schreibeLokal(TURN, urls ? { urls, username: wert("turn-name"), credential: wert("turn-passwort") } : null);
        vermittlungNeu();
        for (const k of Object.keys(turnEntwurf))
            delete turnEntwurf[k];
        turnMeldung = { text: urls ? "TURN gespeichert. Gilt ab der nächsten Verbindung über das Internet." : "TURN entfernt.", fehler: false };
        app.zeichne();
    };
    const offen = !!turn || Object.keys(turnEntwurf).length > 0 || turnMeldung !== null;
    return h("details", { class: "gruppe", ...(offen ? { open: true } : {}) }, h("summary", {}, "Verbindung über das Internet"), h("p", { class: "leise" }, "Nur nötig, wenn Verbindungen über Mobilfunk scheitern. Ein TURN-Server leitet dann weiter; die Daten bleiben verschlüsselt."), feld("turn-adresse", "TURN-Adresse", "urls", turn?.urls ?? ""), feld("turn-name", "Name", "username", turn?.username ?? ""), feld("turn-passwort", "Passwort", "credential", turn?.credential ?? "", "password"), h("button", { class: "knopf", "data-fokus": "turn-speichern", onclick: speichern }, "Speichern"), turnMeldung ? h("p", { class: turnMeldung.fehler ? "hinweis fehler" : "leise", role: turnMeldung.fehler ? "alert" : "status" }, turnMeldung.text) : null);
}
//# sourceMappingURL=einstellungen.js.map