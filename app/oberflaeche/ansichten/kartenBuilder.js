// Card Builder (Spec 020): eigener Kartensatz aus einer Basis, mit Vorlage, Farben, Symbolen, Werten, Rückseite und
// jeder Karte einzeln (Foto, Text, Formen, Sticker). Live-Vorschau und Prüfung; gespeichert wird erst auf „Speichern“.
import { begrenze, BREITE, FORM_NAME, FORMEN, HOEHE, MAX_ELEMENTE, MAX_TEXT, MUSTER, MUSTER_NAME, STICKER, STIL_NAME, STILE, symbolAusSvg, } from "../../kern/kartengestaltung.js";
import { kartenAnsicht, pruefeBuilder } from "../../kern/kartensatz.js";
import { FARBEN } from "../../kern/spiel/karten.js";
import { neueUlid } from "../../kern/ulid.js";
import { filzkopf, meldung } from "../bausteine.js";
import { h } from "../dom.js";
import { fotoVerkleinern } from "../foto.js";
import { alleKartensaetze, elementSvg, karte, istEigener, mitgelieferteKartensaetze, rueckseite, speichereKartensatz, waehleKartensatz } from "../karten.js";
const WERTE = ["A", "10", "K", "D", "B", "9"];
const VORSCHAU = ["herz-A-a", "herz-10-a", "herz-K-a", "herz-D-a", "pik-B-a", "kreuz-9-a"];
const RUECKSEITE = "rueckseite";
let entwurf = null;
let fuerId = null;
let neuerText = "";
let neueForm = "kreis";
let neueFarbe = "#1C1A16";
/** Rückmeldung nach „Speichern“ unten bei den Knöpfen, nicht oben außerhalb des Bildschirms. */
let gespeichert = null;
/** Kopie eines Satzes mit neuer ID (eigene Sätze heißen `eigen-…`). */
function kopie(satz, name) {
    return { ...structuredClone(satz), id: `eigen-${neueUlid().toLowerCase().slice(-12)}`, name };
}
/** #/kartensatz/neu, #/kartensatz/<id> (bearbeiten), #/kartensatz/<id>/kopie */
export function kartenBuilder(app, teile) {
    const id = teile[1] ?? "neu";
    const schluessel = teile.join("/");
    if (fuerId !== schluessel) {
        fuerId = schluessel;
        const quelle = alleKartensaetze().find((s) => s.id === id);
        entwurf = id === "neu" ? null
            : quelle && istEigener(id) && teile[2] !== "kopie" ? { satz: structuredClone(quelle), geaendert: false, ziel: null, auswahl: null, fehler: null }
                : quelle ? { satz: kopie(quelle, `${quelle.name} (eigen)`), geaendert: false, ziel: null, auswahl: null, fehler: null }
                    : null;
    }
    if (!entwurf)
        return basisWaehlen(app);
    const e = entwurf;
    const s = e.satz;
    const pruefung = pruefeBuilder(s);
    const aendern = (f) => { f(); e.geaendert = true; gespeichert = null; app.zeichne(); };
    const verwerfen = () => {
        if (!e.geaendert) {
            entwurf = null;
            fuerId = null;
            app.geheZu("/einstellungen");
            return;
        }
        app.zeigeBlatt(h("div", { class: "gruppe" }, h("h2", {}, "Änderungen verwerfen?"), h("p", { class: "leise" }, "Was du seit dem letzten Speichern geändert hast, ist dann weg."), h("button", { class: "knopf", "data-fokus": "wirklich-verwerfen", onclick: () => { app.zeigeBlatt(null); entwurf = null; fuerId = null; app.geheZu("/einstellungen"); } }, "Verwerfen"), h("button", { class: "knopf text", onclick: () => app.zeigeBlatt(null) }, "Weiter bauen")));
    };
    const speichern = async () => {
        await speichereKartensatz(structuredClone(s));
        waehleKartensatz(s.id);
        e.geaendert = false;
        gespeichert = `„${s.name}“ gespeichert und ausgewählt.`;
        app.zeichne();
    };
    return h("div", { class: "seite builder" }, filzkopf("Kartensatz bauen", s.name, { rechts: h("button", { class: "knopf", "data-fokus": "verwerfen", onclick: verwerfen }, e.geaendert ? "Verwerfen" : "Zurück") }), meldung(app), 
    // Im Editor ist die große Karte die Vorschau; die angeheftete Leiste würde sie verdecken.
    e.ziel ? null : h("section", { class: "builder-vorschau", "aria-label": "Vorschau" }, h("div", { class: "satz-reihe" }, VORSCHAU.map((k) => karte(k, { satz: s }))), rueckseite("hand", s)), e.ziel ? editor(app, e) : null, h("section", { class: "gruppe" }, h("label", { for: "satz-name" }, "Name"), h("input", { id: "satz-name", type: "text", maxlength: 40, value: s.name, "data-fokus": "satz-name", oninput: (ev) => aendern(() => { s.name = ev.target.value; }) })), h("section", { class: "gruppe", "aria-labelledby": "vorlage-titel" }, h("h2", { id: "vorlage-titel" }, "Vorlage"), h("div", { class: "segment", role: "group", "aria-labelledby": "vorlage-titel" }, STILE.map((st) => h("button", {
        "aria-pressed": String((s.stil ?? "klassisch") === st), "data-fokus": `stil-${st}`, onclick: () => aendern(() => { s.stil = st; }),
    }, STIL_NAME[st])))), farbenBereich(app, e, aendern), werteBereich(s, aendern), begriffeBereich(s, aendern), rueckseiteBereich(app, e, aendern), h("section", { class: "gruppe", "aria-labelledby": "einzeln-titel" }, h("h2", { id: "einzeln-titel" }, "Jede Karte einzeln"), h("p", { class: "leise", style: "margin: 0" }, "Tippe eine Karte an, um ihr ein Foto, Text, Formen oder Sticker zu geben."), h("div", { class: "karten-raster" }, FARBEN.flatMap((f) => WERTE.map((w) => karte(`${f}-${w}-a`, {
        satz: s, groesse: "klein", fokus: `einzeln-${f}-${w}`, onclick: () => { e.ziel = `${f}-${w}`; e.auswahl = null; app.zeichne(); scrollNachOben(); },
    }))))), h("section", { class: "gruppe", "aria-labelledby": "pruefung-titel", "data-pruefung": "" }, h("h2", { id: "pruefung-titel" }, "Prüfung"), pruefung.fehler.length === 0 && pruefung.hinweise.length === 0 ? h("p", { class: "leise", style: "margin: 0" }, "Alles gut lesbar.") : null, pruefung.fehler.map((f) => h("p", { class: "hinweis fehler", role: "alert" }, f)), pruefung.hinweise.map((f) => h("p", { class: "hinweis info" }, f))), h("div", { class: "dehnen" }), 
    // Unten angeheftet: Speichern ist auf der langen Seite immer erreichbar, die Bestätigung erscheint gleich daneben.
    h("div", { class: "builder-aktionen" }, gespeichert ? h("p", { class: "leise", role: "status", style: "margin: 0" }, gespeichert)
        : pruefung.fehler.length > 0 ? h("p", { class: "leise", style: "margin: 0" }, "Speichern geht, sobald die Prüfung keine Fehler mehr meldet.") : null, h("div", { class: "raster-2" }, h("button", { class: "knopf", "data-fokus": "teilen", onclick: () => void teile2(app, s) }, "Teilen"), h("button", { class: "knopf haupt", disabled: pruefung.fehler.length > 0, "data-fokus": "speichern", onclick: () => void speichern() }, "Speichern"))));
}
function scrollNachOben() {
    queueMicrotask(() => document.querySelector(".builder-editor")?.scrollIntoView({ block: "start", behavior: "smooth" }));
}
function basisWaehlen(app) {
    return h("div", { class: "seite" }, filzkopf("Kartensatz bauen", "Womit fängst du an?", { rechts: h("a", { class: "knopf", href: "#/einstellungen" }, "Zurück") }), h("div", { class: "liste-saetze", role: "group", "aria-label": "Basis" }, mitgelieferteKartensaetze().map((satz) => h("button", {
        class: "wahl satz-wahl", "data-fokus": `basis-${satz.id}`,
        onclick: () => { entwurf = { satz: kopie(satz, "Mein Blatt"), geaendert: false, ziel: null, auswahl: null, fehler: null }; gespeichert = null; app.zeichne(); },
    }, h("span", { class: "satz-kopf" }, h("strong", {}, satz.name), h("span", { class: "leise" }, satz.beschreibung)), h("span", { class: "satz-reihe", "aria-hidden": "true" }, VORSCHAU.map((id) => karte(id, { groesse: "klein", satz })))))));
}
/** Alle Symbole der mitgelieferten Sätze zur Auswahl, dazu „eigenes SVG“. */
function symbole() {
    const liste = new Map();
    for (const satz of mitgelieferteKartensaetze())
        for (const f of FARBEN) {
            const x = satz.farben[f];
            if (!liste.has(x.symbol))
                liste.set(x.symbol, { name: `${x.name} (${satz.name})`, symbol: x.symbol, box: x.box ?? "0 0 24 24" });
        }
    return [...liste.values()];
}
function farbenBereich(app, e, aendern) {
    const s = e.satz;
    const auswahl = symbole();
    return h("section", { class: "gruppe", "aria-labelledby": "farben-titel" }, h("h2", { id: "farben-titel" }, "Farben"), FARBEN.map((f) => {
        const x = s.farben[f];
        const eigenesSymbol = !auswahl.some((a) => a.symbol === x.symbol);
        return h("div", { class: "farb-zeile", "data-farbe": f }, h("input", { type: "text", maxlength: 20, value: x.name, "aria-label": `Name der Farbe ${f}`, "data-fokus": `farbe-name-${f}`, oninput: (ev) => aendern(() => { x.name = ev.target.value; }) }), h("input", { type: "color", value: x.farbe, "aria-label": `Farbe von ${x.name}`, "data-fokus": `farbe-wert-${f}`, oninput: (ev) => aendern(() => { x.farbe = ev.target.value.toUpperCase(); }) }), h("select", { "aria-label": `Symbol von ${x.name}`, "data-fokus": `farbe-symbol-${f}`, onchange: (ev) => aendern(() => {
                const wahl = auswahl[Number(ev.target.value)];
                if (wahl) {
                    x.symbol = wahl.symbol;
                    if (wahl.box === "0 0 24 24")
                        delete x.box;
                    else
                        x.box = wahl.box;
                }
            }) }, eigenesSymbol ? h("option", { value: "-1", selected: true }, "eigenes SVG") : null, auswahl.map((a, i) => h("option", { value: String(i), selected: a.symbol === x.symbol }, a.name))), h("label", { class: "knopf text datei-knopf" }, "Eigenes SVG", h("input", { type: "file", accept: ".svg,image/svg+xml", class: "unsichtbar", "aria-label": `Eigenes Symbol für ${x.name}`, "data-fokus": `farbe-svg-${f}`, onchange: async (ev) => {
                const datei = ev.target.files?.[0];
                if (!datei)
                    return;
                const r = symbolAusSvg(await datei.text());
                if (!r) {
                    app.melde("In dieser Datei steckt keine Form, die sich als Symbol eignet. Am besten ein SVG mit einer einfachen, gefüllten Form.");
                    return;
                }
                aendern(() => { x.symbol = r.pfad; x.box = r.box; });
            } })));
    }));
}
function werteBereich(s, aendern) {
    return h("section", { class: "gruppe", "aria-labelledby": "werte-titel" }, h("h2", { id: "werte-titel" }, "Werte"), WERTE.map((w) => h("div", { class: "wert-zeile" }, h("input", { type: "text", maxlength: 3, value: s.werte[w].kurz, class: "kurz", "aria-label": `Kurzzeichen für ${s.werte[w].name}`, "data-fokus": `wert-kurz-${w}`, oninput: (ev) => aendern(() => { s.werte[w].kurz = ev.target.value; }) }), h("input", { type: "text", maxlength: 20, value: s.werte[w].name, "aria-label": `Name für ${w}`, "data-fokus": `wert-name-${w}`, oninput: (ev) => aendern(() => { s.werte[w].name = ev.target.value; }) }))));
}
function begriffeBereich(s, aendern) {
    const namen = { alte: "Die Alten (Kreuz-Damen)", karlchen: "Karlchen (Kreuz-Bube)", fuchs: "Fuchs (Karo-Ass)", dulle: "Dulle (Herz-Zehn)" };
    return h("details", { class: "gruppe" }, h("summary", {}, "Begriffe am Tisch"), Object.keys(namen).map((b) => [
        h("label", { for: `begriff-${b}` }, namen[b]),
        h("input", { id: `begriff-${b}`, type: "text", maxlength: 30, value: s.begriffe[b], "data-fokus": `begriff-${b}`, oninput: (ev) => aendern(() => { s.begriffe[b] = ev.target.value; }) }),
    ]));
}
function rueckseiteBereich(app, e, aendern) {
    const r = e.satz.rueckseite;
    return h("section", { class: "gruppe", "aria-labelledby": "ruecken-titel" }, h("h2", { id: "ruecken-titel" }, "Rückseite"), h("div", { class: "segment muster", role: "group", "aria-label": "Muster" }, MUSTER.map((m) => h("button", {
        "aria-pressed": String((r.muster ?? "uni") === m), "data-fokus": `muster-${m}`, onclick: () => aendern(() => { r.muster = m; }),
    }, MUSTER_NAME[m]))), h("div", { class: "zeile" }, h("label", { class: "farbfeld" }, "Farbe", h("input", { type: "color", value: r.farbe, "data-fokus": "ruecken-farbe", oninput: (ev) => aendern(() => { r.farbe = ev.target.value.toUpperCase(); }) })), h("label", { class: "farbfeld" }, "Muster", h("input", { type: "color", value: r.farbe2 ?? "#F3EFE6", "data-fokus": "ruecken-farbe2", oninput: (ev) => aendern(() => { r.farbe2 = ev.target.value.toUpperCase(); }) }))), h("label", { for: "ruecken-text" }, "Text (optional)"), h("input", { id: "ruecken-text", type: "text", maxlength: MAX_TEXT, value: r.text ?? "", placeholder: "z. B. Donnerstagsrunde", "data-fokus": "ruecken-text",
        oninput: (ev) => aendern(() => { const t = ev.target.value; if (t)
            r.text = t;
        else
            delete r.text; }) }), h("div", { class: "raster-2" }, fotoKnopf(app, "Foto oder Logo", "ruecken-foto", (url) => aendern(() => { r.bild = url; })), r.bild ? h("button", { class: "knopf text", "data-fokus": "ruecken-foto-weg", onclick: () => aendern(() => { delete r.bild; }) }, "Foto entfernen")
        : h("button", { class: "knopf", "data-fokus": "ruecken-gestalten", onclick: () => { e.ziel = RUECKSEITE; e.auswahl = null; app.zeichne(); scrollNachOben(); } }, "Gestalten")), r.bild ? h("button", { class: "knopf", "data-fokus": "ruecken-gestalten", onclick: () => { e.ziel = RUECKSEITE; e.auswahl = null; app.zeichne(); scrollNachOben(); } }, "Gestalten") : null);
}
function fotoKnopf(app, text, fokus, fertig) {
    return h("label", { class: "knopf datei-knopf" }, text, h("input", { type: "file", accept: "image/*", class: "unsichtbar", "data-fokus": fokus, "aria-label": text, onchange: async (ev) => {
            const datei = ev.target.files?.[0];
            if (!datei)
                return;
            try {
                fertig(await fotoVerkleinern(datei));
            }
            catch (f) {
                app.melde(f.message.startsWith("Das Foto") ? f.message : "Dieses Bild lässt sich nicht lesen.");
            }
        } }));
}
// ---------- Editor für eine Karte oder die Rückseite ----------
function gestaltungVon(s, ziel) {
    if (ziel === RUECKSEITE) {
        return { elemente: s.rueckseite.elemente ?? [], setze: (l) => { if (l.length)
                s.rueckseite.elemente = l;
            else
                delete s.rueckseite.elemente; }, g: null };
    }
    s.karten ??= {};
    const g = (s.karten[ziel] ??= {});
    return {
        elemente: g.elemente ?? [], g,
        setze: (l) => { if (l.length)
            g.elemente = l;
        else
            delete g.elemente; if (!g.elemente && !g.hintergrund)
            delete s.karten[ziel]; },
    };
}
function editor(app, e) {
    const s = e.satz;
    const ziel = e.ziel;
    const ist = gestaltungVon(s, ziel);
    const titel = ziel === RUECKSEITE ? "Rückseite" : kartenAnsicht(`${ziel}-a`, s).name;
    const neu = (el) => {
        if (ist.elemente.length >= MAX_ELEMENTE) {
            app.melde(`Höchstens ${MAX_ELEMENTE} Dinge auf einer Karte.`);
            return;
        }
        ist.setze([...ist.elemente, begrenze(el)]);
        e.auswahl = ist.elemente.length;
        e.geaendert = true;
        app.zeichne();
    };
    const n = ist.elemente.length;
    const mitte = { x: 50 + ((n % 3) - 1) * 16, y: 60 + (Math.floor(n / 3) % 3) * 12, drehung: 0 };
    const gewaehlt = e.auswahl !== null ? ist.elemente[e.auswahl] : undefined;
    const aendereGewaehlt = (f) => {
        if (e.auswahl === null || !gewaehlt)
            return;
        const l = [...ist.elemente];
        l[e.auswahl] = begrenze(f(gewaehlt));
        ist.setze(l);
        e.geaendert = true;
        app.zeichne();
    };
    return h("section", { class: "gruppe builder-editor", "aria-label": `${titel} gestalten` }, h("div", { class: "zeile" }, h("h2", { style: "flex-grow: 1" }, `${titel} gestalten`), h("button", { class: "knopf", "data-fokus": "editor-fertig", onclick: () => { e.ziel = null; e.auswahl = null; app.zeichne(); } }, "Fertig")), buehne(app, e, ziel, ist), ist.elemente.length ? h("div", { class: "chips", role: "group", "aria-label": "Elemente auf der Karte" }, ist.elemente.map((el, i) => h("button", {
        class: "wahl", "aria-pressed": String(e.auswahl === i), "data-fokus": `element-${i}`, onclick: () => { e.auswahl = e.auswahl === i ? null : i; app.zeichne(); },
    }, `${i + 1} · ${el.art === "text" ? `„${el.text}“` : el.art === "form" ? FORM_NAME[el.form] : STICKER[el.sticker].name}`))) : null, gewaehlt ? h("div", { class: "chips", role: "group", "aria-label": "Ausgewähltes Element" }, h("button", { class: "wahl", "data-fokus": "el-groesser", onclick: () => aendereGewaehlt((x) => ({ ...x, groesse: x.groesse * 1.2 })) }, "Größer"), h("button", { class: "wahl", "data-fokus": "el-kleiner", onclick: () => aendereGewaehlt((x) => ({ ...x, groesse: x.groesse / 1.2 })) }, "Kleiner"), h("button", { class: "wahl", "data-fokus": "el-drehen", onclick: () => aendereGewaehlt((x) => ({ ...x, drehung: ((x.drehung + 15 + 180) % 360) - 180 })) }, "Drehen"), h("button", { class: "wahl", "data-fokus": "el-entfernen", onclick: () => { ist.setze(ist.elemente.filter((_, i) => i !== e.auswahl)); e.auswahl = null; e.geaendert = true; app.zeichne(); } }, "Entfernen"))
        : h("p", { class: "leise", style: "margin: 0" }, ist.elemente.length ? "Antippen wählt aus, Ziehen verschiebt. Die Ecken bleiben frei." : "Füge unten Text, Formen oder Sticker hinzu."), h("div", { class: "zeile" }, h("input", { type: "text", maxlength: MAX_TEXT, value: neuerText, placeholder: "Text", "aria-label": "Neuer Text", "data-fokus": "neuer-text", oninput: (ev) => { neuerText = ev.target.value; } }), h("input", { type: "color", value: neueFarbe, "aria-label": "Farbe für Text und Formen", "data-fokus": "neue-farbe", oninput: (ev) => { neueFarbe = ev.target.value.toUpperCase(); } }), h("button", { class: "knopf", "data-fokus": "text-dazu", onclick: () => { if (neuerText.trim()) {
            neu({ art: "text", text: neuerText.trim().slice(0, MAX_TEXT), farbe: neueFarbe, groesse: 14, ...mitte });
            neuerText = "";
        } } }, "Text dazu")), h("div", { class: "zeile" }, h("select", { "aria-label": "Form", "data-fokus": "form-wahl", onchange: (ev) => { neueForm = ev.target.value; } }, FORMEN.map((f) => h("option", { value: f, selected: f === neueForm }, FORM_NAME[f]))), h("button", { class: "knopf", "data-fokus": "form-dazu", onclick: () => neu({ art: "form", form: neueForm, farbe: neueFarbe, groesse: 24, ...mitte }) }, "Form dazu")), h("div", { class: "sticker-raster", role: "group", "aria-label": "Sticker" }, Object.keys(STICKER).map((id) => {
        const vorschau = document.createElementNS("http://www.w3.org/2000/svg", "svg");
        vorschau.setAttribute("viewBox", "0 0 24 24");
        vorschau.setAttribute("aria-hidden", "true");
        vorschau.append(elementSvg({ art: "sticker", sticker: id, x: 12, y: 12, groesse: 22, drehung: 0 }));
        return h("button", { class: "wahl sticker", "aria-label": `Sticker ${STICKER[id].name}`, "data-fokus": `sticker-${id}`, onclick: () => neu({ art: "sticker", sticker: id, groesse: 26, ...mitte }) }, vorschau);
    })), ist.g ? h("div", { class: "raster-2" }, fotoKnopf(app, "Foto als Hintergrund", "karte-foto", (url) => { ist.g.hintergrund = url; e.geaendert = true; app.zeichne(); }), h("label", { class: "farbfeld" }, "Hintergrund", h("input", { type: "color", value: ist.g.hintergrund?.startsWith("#") ? ist.g.hintergrund : "#FBF8F1", "data-fokus": "karte-hg",
        oninput: (ev) => { ist.g.hintergrund = ev.target.value.toUpperCase(); e.geaendert = true; app.zeichne(); } }))) : null, ist.g?.hintergrund ? h("button", { class: "knopf text", "data-fokus": "karte-hg-weg", onclick: () => { delete ist.g.hintergrund; ist.setze(ist.elemente); e.geaendert = true; app.zeichne(); } }, "Hintergrund entfernen") : null);
}
/** Große Karte mit Ebene zum Antippen und Ziehen. Beim Ziehen wird nur die Bühne neu gezeichnet, nicht die Seite. */
function buehne(app, e, ziel, ist) {
    const behaelter = h("div", { class: "buehne", "data-buehne": ziel });
    const zeichneBuehne = () => {
        const k = ziel === RUECKSEITE ? rueckseite("gross", e.satz) : karte(`${ziel}-a`, { satz: e.satz, groesse: "gross" });
        const ebene = document.createElementNS("http://www.w3.org/2000/svg", "svg");
        ebene.setAttribute("viewBox", `0 0 ${BREITE} ${HOEHE}`);
        ebene.setAttribute("class", "editor-ebene");
        ist.elemente.forEach((el, i) => {
            const c = document.createElementNS("http://www.w3.org/2000/svg", "circle");
            c.setAttribute("cx", String(el.x));
            c.setAttribute("cy", String(el.y));
            c.setAttribute("r", String(Math.max(11, el.groesse / 2)));
            c.setAttribute("class", i === e.auswahl ? "griff gewaehlt" : "griff");
            c.setAttribute("data-element", String(i));
            ebene.append(c);
        });
        behaelter.replaceChildren(k, ebene);
    };
    zeichneBuehne();
    let ziehen = null;
    const punkt = (ev) => {
        const r = behaelter.getBoundingClientRect();
        return { x: ((ev.clientX - r.left) / r.width) * BREITE, y: ((ev.clientY - r.top) / r.height) * HOEHE };
    };
    behaelter.addEventListener("pointerdown", (ev) => {
        const index = Number(ev.target?.getAttribute?.("data-element") ?? NaN);
        if (!Number.isInteger(index)) {
            if (e.auswahl !== null) {
                e.auswahl = null;
                app.zeichne();
            }
            return;
        }
        const el = ist.elemente[index];
        const p = punkt(ev);
        ziehen = { index, dx: el.x - p.x, dy: el.y - p.y, bewegt: false };
        e.auswahl = index;
        behaelter.setPointerCapture(ev.pointerId);
        zeichneBuehne();
        ev.preventDefault();
    });
    behaelter.addEventListener("pointermove", (ev) => {
        if (!ziehen)
            return;
        const p = punkt(ev);
        const l = [...ist.elemente];
        l[ziehen.index] = begrenze({ ...l[ziehen.index], x: p.x + ziehen.dx, y: p.y + ziehen.dy });
        ist.setze(l);
        ist.elemente.splice(0, ist.elemente.length, ...l);
        ziehen.bewegt = true;
        zeichneBuehne();
    });
    const loslassen = () => {
        if (!ziehen)
            return;
        if (ziehen.bewegt)
            e.geaendert = true;
        ziehen = null;
        app.zeichne();
    };
    behaelter.addEventListener("pointerup", loslassen);
    behaelter.addEventListener("pointercancel", loslassen);
    return behaelter;
}
/** Als Datei teilen: Teilen-Menü mit Datei, sonst Herunterladen. */
async function teile2(app, s) {
    const text = JSON.stringify(s);
    const name = `${s.name.replace(/[^\p{L}\p{N} _-]/gu, "").trim() || "kartensatz"}.dulle-karten.json`;
    const datei = new File([text], name, { type: "application/json" });
    try {
        if (navigator.canShare?.({ files: [datei] })) {
            await navigator.share({ files: [datei], title: s.name });
            return;
        }
    }
    catch (f) {
        if (f.name === "AbortError")
            return;
    }
    const a = h("a", { href: URL.createObjectURL(datei), download: name });
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
    app.melde("Kartensatz als Datei gespeichert.", "info");
}
//# sourceMappingURL=kartenBuilder.js.map