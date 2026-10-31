// Tisch eröffnen (Spec 010, 030; Mockup „Tisch eröffnen“): eigener Spieler, Regeln, je Platz eine Einladung per QR
// oder ein Link für alle.
import { PLAETZE } from "../../netz/gastgeber.js";
import { leseLokal, schreibeLokal } from "../app.js";
import { filzkopf, kopf, meldung, spielerName } from "../bausteine.js";
import { h } from "../dom.js";
import { qrCode, scanne } from "../qr.js";
import { abweichungenText, merkeProfil, regelnWahlBlatt, zuletztGenutzt } from "../regeln.js";
import { kommtSelbst } from "./spieltisch.js";
import { antwortUebernehmen, einladen, eroeffne, raumOffen, tisch, tischLink } from "../tisch.js";
const ICH = (rundeId) => `dulle.ich.${rundeId}`;
/** Spec 030: zuletzt gewählter Weg zum Einladen. */
const WEG = "dulle.einladungsweg";
async function teileLink(app, link) {
    try {
        if (typeof navigator.share === "function") {
            await navigator.share({ title: "Doppelkopf", text: "Komm an unseren Tisch:", url: link });
            return;
        }
        await navigator.clipboard.writeText(link);
        app.melde("Link kopiert. Jetzt in die Gruppe einfügen.", "info");
    }
    catch (fehler) {
        if (fehler.name !== "AbortError")
            app.melde("Teilen ging nicht. Den Link oben markieren und kopieren.");
    }
}
let profilWahl = null;
const qrCache = new Map();
const scannerStopp = new Map();
/** QR-Code asynchron einsetzen; dasselbe Element bleibt über Neuzeichnen hinweg erhalten. */
function qrPlatzhalter(text, beschriftung) {
    const fertig = qrCache.get(text);
    if (fertig)
        return fertig;
    const platz = h("div", { class: "qr qr-laedt" }, "QR-Code wird erstellt …");
    void qrCode(text, beschriftung).then((el) => { qrCache.set(text, el); platz.replaceWith(el); });
    return platz;
}
/** Spec 030: ein Link für den ganzen Tisch, Raum-ID und Passwort nur im `#fragment`. */
function linkKarte(app) {
    const link = tischLink() ?? "";
    const offen = raumOffen();
    return h("section", { class: "karte einladung", "aria-label": "Einladungslink" }, h("strong", {}, "Ein Link für alle"), h("textarea", { readonly: true, rows: 3, id: "tisch-link", "aria-label": "Einladungslink" }, link), h("button", { class: "knopf", "data-fokus": "link-teilen", onclick: () => void teileLink(app, link) }, "Link teilen"), h("p", { class: "leise", style: "margin: 0", role: "status", "data-raum": offen ? "offen" : "zu" }, offen ? "Wer den Link antippt, kommt direkt an den Tisch. Der Link ist nur für eure Runde: Wer ihn hat, kann sich dazusetzen."
        : navigator.onLine ? "Der Tisch wird im Internet erreichbar gemacht …" : "Ohne Internet geht nur der QR-Code."));
}
export function tischEroeffnen(app, teile) {
    const r = app.runde(teile[1] ?? "");
    if (!r)
        return h("div", { class: "seite" }, kopf("Runde nicht gefunden", null));
    const t = tisch();
    // ---------- Schritt 1: wer bin ich, welche Regeln ----------
    if (!t?.gastgeber || t.rundeId !== r.id) {
        if (profilWahl?.rundeId !== r.id)
            profilWahl = { rundeId: r.id, profil: zuletztGenutzt(r) };
        const profil = profilWahl.profil;
        const spieler = Object.values(r.spieler).filter((s) => !s.ausgeblendet && !s.zusammengefuehrtIn).sort((a, b) => a.name.localeCompare(b.name, "de"));
        const ich = leseLokal(ICH(r.id));
        return h("div", { class: "seite" }, filzkopf("Tisch eröffnen", `${r.name} · du spielst ganz normal mit`, { rechts: h("a", { class: "knopf", href: `#/runde/${r.id}` }, "Abbrechen") }), meldung(app), h("section", { class: "gruppe" }, h("h2", { id: "ich-titel" }, "Wer bist du?"), h("div", { class: "raster-2", role: "group", "aria-labelledby": "ich-titel" }, spieler.map((s) => h("button", {
            class: "wahl", "aria-pressed": String(s.id === ich), "data-fokus": `ich-${s.id}`,
            onclick: () => { schreibeLokal(ICH(r.id), s.id); app.zeichne(); },
        }, s.name)))), h("div", { class: "karte zeile" }, h("div", { style: "flex-grow: 1" }, h("div", { style: "font-weight: 600" }, `Regeln: ${profil.name}`), h("div", { class: "leise" }, abweichungenText(profil))), h("button", {
            class: "knopf",
            onclick: () => app.zeigeBlatt(regelnWahlBlatt(app, r, profil, "Regeln für diesen Tisch", (p) => { profilWahl = { rundeId: r.id, profil: p }; app.zeigeBlatt(null); })),
        }, "Ändern")), h("p", { class: "leise", style: "margin: 0" }, "Danach lädst du ein: per QR-Code am Tisch (ohne Internet, im selben WLAN) oder per Link über das Internet."), h("div", { class: "dehnen" }), h("button", {
            class: "knopf haupt", disabled: !ich || !r.spieler[ich], "data-fokus": "eroeffnen",
            onclick: async () => { merkeProfil(r.id, profil); await eroeffne(app, r.id, profil, ich); app.zeichne(); },
        }, "Tisch eröffnen"));
    }
    // ---------- Schritt 2: Plätze und Einladungen ----------
    const g = t.gastgeber;
    const z = g.zustand;
    const weg = leseLokal(WEG) === "link" ? "link" : "qr";
    const name = (id) => (id ? spielerName(r, id) : null);
    const laeuft = g.sitzungId !== null;
    const bereit = g.alleSitzen() && PLAETZE.every((p) => p === z.eigenerPlatz || g.verbunden(p));
    const info = g.tischInfo(null);
    // Spec 012: verwaiste Plätze (Neuladen, Übernahme, Verbindung weg) und Ersatz.
    const wegListe = PLAETZE.filter((p) => p !== z.eigenerPlatz && info.plaetze[p - 1].zustand === "weg");
    const seit = (zeit) => {
        const sek = Math.max(0, Math.floor((Date.now() - (zeit ?? Date.now())) / 1000));
        return `${Math.floor(sek / 60)}:${String(sek % 60).padStart(2, "0")}`;
    };
    const platzZeile = (p) => {
        const sitz = z.plaetze[p - 1];
        const ich = p === z.eigenerPlatz;
        const verbunden = ich || g.verbunden(p);
        const e = t.einladungen.get(p);
        const ersatz = info.ersatzFuer === p;
        const ki = info.plaetze[p - 1].ki;
        const kommt = !ich && !verbunden && kommtSelbst(info, info.plaetze[p - 1]);
        const status = ich ? "du" : ki === "platz" ? "KI" : ki === "fuer" ? "KI spielt" : verbunden && sitz.spielerId && !info.plaetze[p - 1].zurueckgeholt ? "verbunden" : verbunden ? "wählt sich aus" : e?.annehmen ? "wartet auf Antwort"
            : ersatz ? "Ersatz gesucht" : kommt ? "kommt über das Internet zurück …" : sitz.spielerId ? `weg · ${seit(info.plaetze[p - 1].wegSeit)}` : "frei";
        const knopf = ersatz ? "Ersatz einladen" : sitz.spielerId && laeuft ? `${name(sitz.spielerId)} zurückholen` : sitz.spielerId ? "Neu einladen" : "Einladen";
        return h("div", { class: "platz-zeile", "data-platz": p, "data-status": status.startsWith("weg") || kommt ? "weg" : status }, h("span", { class: "platz-nr" }, String(p)), h("span", { class: "platz-name" }, name(sitz.spielerId) ?? "Platz frei"), h("span", { class: `platz-status ${verbunden ? "ok" : ""}` }, status), weg === "qr" && !ich && !kommt && (!verbunden || ki === "fuer") ? h("button", { class: "knopf", "data-fokus": `einladen-${p}`, onclick: () => void einladen(app, p) }, knopf) : null, 
        // Spec 013, zu dritt: freier Platz vor dem Start mit KI besetzen, und wieder freigeben.
        !laeuft && !sitz.spielerId && !info.plaetze.some((x) => x.ki === "platz")
            ? h("button", { class: "knopf", "data-fokus": `ki-${p}`, onclick: () => { const f = g.setzeKi(p); if (f)
                    app.melde(f); app.zeichne(); } }, "Mit KI besetzen") : null, !laeuft && ki === "platz" ? h("button", { class: "knopf text", "data-fokus": `ki-weg-${p}`, onclick: () => { g.entferneKi(p); app.zeichne(); } }, "KI entfernen") : null);
    };
    const einladungKarte = (p) => {
        const e = t.einladungen.get(p);
        if (!e || (g.verbunden(p) && info.plaetze[p - 1].ki !== "fuer"))
            return null;
        const sitz = z.plaetze[p - 1];
        const scanZiel = h("div", { class: "scan-ziel" });
        const feld = h("textarea", { id: `antwort-${p}`, rows: 2, placeholder: "Antwort-Code hier einfügen", "aria-label": `Antwort-Code für Platz ${p}` });
        if (!e.link)
            return h("section", { class: "karte" }, h("strong", {}, `Einladung für Platz ${p}`), e.fehler ? h("p", { class: "hinweis fehler" }, e.fehler) : h("p", { class: "leise" }, "Verbindungsangebot wird erstellt …"));
        return h("section", { class: "karte einladung", "aria-label": `Einladung für Platz ${p}` }, h("strong", {}, `Einladung für Platz ${p}${sitz.spielerId ? ` (${name(sitz.spielerId)})` : ""}`), e.annehmen ? [
            qrPlatzhalter(e.link, `QR-Code mit der Einladung für Platz ${p}`),
            h("p", { class: "leise", style: "margin: 0; text-align: center" }, "Mitspieler scannt diesen Code mit der Kamera-App und zeigt dir dann seinen Antwort-Code."),
            h("button", {
                class: "knopf haupt", "data-fokus": `scannen-${p}`,
                onclick: async () => {
                    scannerStopp.get(p)?.();
                    scannerStopp.set(p, await scanne(scanZiel, (text) => void antwortUebernehmen(app, p, text), (m) => app.melde(m)));
                },
            }, "Antwort scannen"),
            scanZiel,
            h("details", {}, h("summary", {}, "Code als Text (ohne Kamera)"), h("textarea", { readonly: true, rows: 3, id: `einladung-${p}`, "aria-label": `Einladungs-Link für Platz ${p}` }, e.link), feld, h("button", { class: "knopf", "data-fokus": `uebernehmen-${p}`, onclick: () => void antwortUebernehmen(app, p, feld.value) }, "Antwort übernehmen")),
        ] : h("p", { class: "leise" }, "Antwort übernommen, Verbindung wird aufgebaut …"), e.fehler ? h("p", { class: "hinweis fehler", role: "alert" }, e.fehler) : null);
    };
    return h("div", { class: "seite" }, filzkopf("Tisch eröffnen", `${r.name} · ${t.gastgeber ? (z.plaetze[z.eigenerPlatz - 1]?.spielerId ? `${name(z.plaetze[z.eigenerPlatz - 1].spielerId)} eröffnet` : "") : ""}`, {
        rechts: h("a", { class: "knopf", href: `#/runde/${r.id}` }, "Zur Runde"),
    }), meldung(app), h("div", { class: "segment", role: "group", "aria-label": "Einladen" }, [["qr", "Am Tisch (QR)"], ["link", "Per Link (Internet)"]].map(([id, text]) => h("button", {
        "aria-pressed": String(weg === id), "data-fokus": `weg-${id}`, onclick: () => { schreibeLokal(WEG, id); app.zeichne(); },
    }, text))), weg === "link" ? linkKarte(app) : null, h("section", { class: "plaetze", "aria-label": "Plätze am Tisch" }, PLAETZE.map(platzZeile)), 
    // Mehrere weg (z. B. nach eigenem Neuladen): alle Einladungen auf einmal, die QR-Codes stehen untereinander.
    wegListe.filter((p) => !t.einladungen.get(p)?.annehmen).length > 1
        ? h("button", { class: "knopf", "data-fokus": "alle-zurueckholen", onclick: () => { for (const p of wegListe)
                void einladen(app, p); } }, "Alle zurückholen") : null, weg === "qr" ? PLAETZE.map(einladungKarte) : null, h("p", { class: "leise", style: "margin: 0" }, weg === "qr"
        ? "Gespielt wird im Uhrzeigersinn nach Platznummer. Keine Verbindung? Gäste-WLANs blockieren das oft, ein Handy-Hotspot hilft."
        : "Gespielt wird im Uhrzeigersinn nach Platznummer. Wer zuerst kommt, sitzt auf dem ersten freien Platz."), h("div", { class: "dehnen" }), laeuft && !g.spiel
        // Nach einer Übernahme liegt kein Spiel auf dem Tisch: neu geben, sobald alle wieder da sind.
        ? h("button", {
            class: "knopf haupt", disabled: !bereit || info.beendet, "data-fokus": "weiter-spielen",
            onclick: async () => { await g.naechstesSpiel(); app.geheZu("/tisch"); },
        }, bereit ? "Weiter spielen" : "Weiter, sobald alle wieder da sind")
        : laeuft
            ? h("a", { class: "knopf haupt", href: "#/tisch", "data-fokus": "zum-tisch" }, "Zurück an den Tisch")
            : h("button", {
                class: "knopf haupt", disabled: !bereit, "data-fokus": "starten",
                onclick: async () => { const f = await g.starte(); if (f)
                    app.melde(f);
                else
                    app.geheZu("/tisch"); },
            }, bereit ? "Spiel starten" : "Starten, sobald alle vier sitzen"));
}
//# sourceMappingURL=tischEroeffnen.js.map