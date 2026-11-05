// Spielblock (Mockup „Schreiber · Spielblock“): eine Zeile pro Spiel mit laufenden Summen.
import { platzSchluessel } from "../../kern/typen.js";
import { bewegungMs, filzkopf, homeHinweis, kopf, kurzNamen, meldung, spielerName, zaehleHoch } from "../bausteine.js";
import { datumKurz, h, punkteText } from "../dom.js";
import { merkeProfil, regelnWahlBlatt } from "../regeln.js";
import { plaetzeAus, spielerWahl, tischskizze } from "../sitzwahl.js";
import { tisch } from "../tisch.js";
/**
 * Spec 016: Wer schreibt diesen Abend gerade? Läuft auf diesem Gerät ein Tisch für ihn, schreibt dessen Gastgeber
 * (auch eingetragene Spiele). Sonst schreibt nur das Gerät, auf dem der Abend begonnen oder zuletzt übernommen wurde.
 */
function wege(app, s) {
    const c = tisch()?.client;
    const ti = c?.tisch;
    const amTisch = !!ti && ti.sitzungId === s.id && !ti.schreiberWeiter;
    return {
        amTisch, ti: amTisch ? ti : null, c: amTisch ? c : null,
        schreibtHier: !amTisch && s.schreibendesGeraet === app.geraet,
        // Mit KI am Tisch spielen keine echten Karten: kein Eintragen.
        mitKi: s.kiPlatz || s.plaetze.some((p) => p.art === "ki"),
    };
}
/** Spalten: alle Spieler, die an diesem Abend gespielt haben, in Sitzordnung, Neue hinten angehängt. */
export function spalten(sitzung) {
    const liste = [];
    const dazu = (id) => { if (!liste.includes(id))
        liste.push(id); };
    for (const s of sitzung.spiele)
        for (const id of Object.keys(s.daten.punkte))
            dazu(id);
    for (const p of sitzung.plaetze)
        dazu(platzSchluessel(p));
    const sitz = sitzung.plaetze.map(platzSchluessel);
    return liste.sort((a, b) => {
        const ia = sitz.indexOf(a), ib = sitz.indexOf(b);
        return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
    });
}
/** Letzte gezeigte Summen je Abend, damit die Summen beim nächsten Zeichnen hochzählen können. */
const letzteSummen = new Map();
function vorzeichenKlasse(n) {
    return n > 0 ? "plus" : n < 0 ? "minus" : "null";
}
export function spielblock(app, teile) {
    const gefunden = app.sitzung(teile[1] ?? "");
    if (!gefunden)
        return h("div", { class: "seite" }, kopf("Abend nicht gefunden", null), h("a", { class: "knopf", href: "#/" }, "Zur Übersicht"));
    const { runde: r, sitzung: s } = gefunden;
    const ids = spalten(s);
    const kurz = kurzNamen(r, ids);
    const laufend = {};
    const neuNr = app.ausstehend ? app.ausstehend.ereignis.daten.nr : undefined;
    const vorhandName = spielerName(r, platzSchluessel(s.plaetze.find((p) => p.platz === s.naechsteVorhand) ?? s.plaetze[0]));
    const letzteGueltige = [...s.spiele].reverse().find((sp) => !sp.verworfen)?.nr;
    const gemischt = s.spiele.some((sp) => sp.daten.eingabe === "direkt") && s.spiele.some((sp) => sp.daten.eingabe !== "direkt");
    const w = wege(app, s);
    const zeilen = s.spiele.map((spiel) => {
        if (!spiel.verworfen) {
            for (const [id, p] of Object.entries(spiel.daten.punkte))
                laufend[id] = (laufend[id] ?? 0) + p;
            for (const [id, p] of Object.entries(spiel.daten.praemie ?? {}))
                laufend[id] = (laufend[id] ?? 0) + p;
        }
        const d = spiel.daten;
        const eingetragen = gemischt && d.eingabe !== "direkt";
        const kennung = `${d.spielart === "solo" || d.spielart === "stillesSolo" ? " S" : ""}${d.praemie ? " H" : ""}${d.bock > 1 ? " B" : ""}${eingetragen ? " E" : ""}`;
        const klassen = ["block-zeile", spiel.verworfen ? "verworfen" : "", spiel.nr === letzteGueltige ? "zuletzt" : "", spiel.nr === neuNr ? "neu" : ""];
        return h("button", {
            class: klassen.filter(Boolean).join(" "),
            style: `--spalten: ${ids.length}`, "data-fokus": `spiel-${spiel.nr}`,
            "aria-label": `Spiel ${spiel.nr}${spiel.verworfen ? ", verworfen" : ""}${eingetragen ? ", eingetragen" : ""}: ${d.gewinner.map((g) => spielerName(r, g)).join(" und ") || "keine Gewinner"}, Wert ${d.wert}`,
            onclick: () => app.zeigeBlatt(spielDetail(app, r, s, spiel)),
        }, h("span", {}, spiel.nr), ids.map((id) => {
            if (!(id in laufend))
                return h("span", {});
            const wert = laufend[id] ?? 0;
            const gewinner = d.gewinner.includes(id) && !spiel.verworfen;
            return h("span", { class: `${vorzeichenKlasse(wert)}${gewinner ? " gewinner" : ""}` }, punkteText(wert, true));
        }), h("span", {}, d.wert, h("span", { class: "kennung" }, kennung)));
    });
    // Summen: nach dem Einhängen vom letzten gezeigten Stand hochzählen.
    const vorher = letzteSummen.get(s.id);
    const summenZellen = ids.map((id) => {
        const bis = laufend[id] ?? 0;
        const zelle = h("span", { "data-summe": id, class: vorzeichenKlasse(bis) }, punkteText(bis, true));
        if (vorher && vorher[id] !== undefined && vorher[id] !== bis) {
            const von = vorher[id] ?? 0;
            requestAnimationFrame(() => zaehleHoch(zelle, von, bis, (n) => punkteText(n, true)));
        }
        return zelle;
    });
    letzteSummen.set(s.id, { ...laufend });
    // Neue Zeile ins Bild holen (sie kann unter der Fußleiste liegen).
    if (neuNr !== undefined) {
        requestAnimationFrame(() => document.querySelector(".block-zeile.neu")?.scrollIntoView({ block: "center", behavior: bewegungMs("base") > 0 ? "smooth" : "auto" }));
    }
    const abgeschlossen = s.abgeschlossen;
    return h("div", { class: "seite" }, filzkopf(r.name, `${datumKurz(s.datum)} · ${s.profil.name}${abgeschlossen ? " · abgeschlossen" : ""}`, {
        motiv: true, mitBlock: true,
        aktionen: [
            h("button", { class: "knopf", "data-fokus": "menue", "aria-haspopup": "dialog", onclick: () => app.zeigeBlatt(menue(app, r, s)) }, "Menü"),
            h("a", { class: "knopf", href: `#/abend/${s.id}/abrechnung`, "data-fokus": "abrechnung" }, "Abrechnung"),
        ],
    }), homeHinweis(app), meldung(app), s.widerspruechlich
        ? h("div", { class: "hinweis fehler", role: "alert" }, `Zwei Geräte haben diesen Abend gleichzeitig beschrieben (Spiel ${s.konflikte.flatMap((k) => k.spielNummern).join(", ")}). Prüfe die Spiele und korrigiere oder verwirf das falsche.`)
        : null, h("div", { class: "block-huelle" }, h("div", { class: "block", role: "table", "aria-label": "Spielblock" }, h("div", { class: "block-zeile kopfzeile", style: `--spalten: ${ids.length}`, role: "row" }, h("span", {}, "Nr"), ids.map((id) => h("span", { title: spielerName(r, id) }, kurz[id])), h("span", {}, "Wert")), zeilen.length === 0 ? h("p", { class: "leer", style: "padding: 16px 16px 16px 56px; margin: 0" }, "Noch kein Spiel. Nach dem ersten Spiel unten auf „Spiel eintragen“ tippen.") : zeilen, zeilen.length > 0
        ? h("div", { class: "block-zeile summe", style: `--spalten: ${ids.length}` }, h("span", {}, "Σ"), summenZellen, h("span", {}))
        : null)), zeilen.length > 0 ? h("div", { class: "leise" }, `Unterstrichen: Gewinner · S Solo${s.spiele.some((sp) => sp.daten.praemie) ? " · H Hochzeitsprämie" : ""} · B Bock${gemischt ? " · E eingetragen" : ""} · Zeile antippen für Details`) : null, h("div", { class: "dehnen" }), 
    // Fußleiste bleibt unten im Daumenbereich, auch an langen Abenden mit vielen Zeilen.
    h("div", { class: "fussleiste" }, abgeschlossen
        ? [
            s.schreibendesGeraet === app.geraet
                ? h("button", { class: "knopf haupt", "data-fokus": "wiederaufnehmen", onclick: () => void app.speichere("sitzungWiederaufgenommen", {}, { runde: r.id, sitzung: s.id }) }, "Abend wieder aufnehmen") : null,
            h("a", { class: "knopf", href: `#/runde/${r.id}` }, "Zur Runde"),
        ]
        : [
            h("div", { class: "zeile" }, h("strong", { style: "font: 600 20px var(--family-display)" }, `Spiel ${s.naechsteNr}`), h("span", { class: "leise" }, `${vorhandName} kommt raus`)),
            // Spec 016: beide Wege im selben Abend. Am Tisch zurück zum Tisch, sonst eintragen oder live weiterspielen.
            w.amTisch
                ? [
                    h("a", { class: "knopf haupt", href: tisch()?.gastgeber && !tisch().gastgeber.spiel ? `#/runde/${r.id}/am-handy/${s.id}` : "#/tisch", "data-fokus": "zum-tisch" }, "Zurück an den Tisch"),
                    w.ti.eintragenMoeglich && w.ti.eintragVon === null
                        ? h("a", { class: "knopf", href: `#/abend/${s.id}/eintragen`, "data-fokus": "eintragen" }, "Spiel eintragen") : null,
                ]
                : w.schreibtHier
                    ? [
                        w.mitKi ? null : h("a", { class: "knopf haupt", href: `#/abend/${s.id}/eintragen`, "data-fokus": "eintragen" }, "Spiel eintragen"),
                        h("a", { class: `knopf${w.mitKi ? " haupt" : ""}`, href: `#/runde/${r.id}/am-handy/${s.id}`, "data-fokus": "live-spielen" }, "Live spielen"),
                    ]
                    : [
                        // Spec 016: Es schreibt immer nur ein Gerät. Übernehmen (nach einer Sicherung) steht bewusst im Menü.
                        h("p", { class: "leise", style: "margin: 0" }, "Diesen Abend schreibt ein anderes Gerät. Hier siehst du den Stand."),
                        h("a", { class: "knopf", href: `#/runde/${r.id}`, "data-fokus": "zur-runde" }, "Zur Runde"),
                    ],
        ]));
}
function spielDetail(app, r, s, spiel) {
    const d = spiel.daten;
    const w = wege(app, s);
    // Korrigieren: hier, wenn dieses Gerät schreibt; am Tisch nur eingetragene Spiele (über den Gastgeber, Spec 016).
    const korrigierbar = !s.abgeschlossen && (w.schreibtHier || (w.amTisch && d.eingabe !== "direkt" && w.ti.eintragenMoeglich));
    const solo = d.spielart === "solo" || d.spielart === "stillesSolo";
    const partei = d.re && !solo ? (d.re.every((x) => d.gewinner.includes(x)) ? "Re" : "Kontra") : null;
    return h("div", { class: "gruppe" }, h("h2", {}, `Spiel ${spiel.nr}${spiel.verworfen ? " (verworfen)" : ""}${spiel.korrigiert ? " · korrigiert" : ""}`), h("p", { style: "margin: 0" }, solo
        ? `Solo von ${spielerName(r, d.re?.[0] ?? "")}, ${d.gewinner.includes(d.re?.[0] ?? "") ? "gewonnen" : "verloren"}`
        : `Gewonnen: ${d.gewinner.map((g) => spielerName(r, g)).join(" und ") || "niemand"}${partei ? ` (${partei})` : ""}`, ` · Wert ${d.wert}`), d.praemie ? h("p", { style: "margin: 0" }, `Hochzeitsprämie: ${Object.entries(d.praemie).map(([id, p]) => `${spielerName(r, id)} +${p}`).join(", ")}`) : null, h("div", { class: "verteilung" }, Object.entries(d.punkte).map(([id, p]) => h("div", {}, h("span", { class: "name", title: spielerName(r, id) }, kurzNamen(r, Object.keys(d.punkte))[id]), h("span", { class: "wert" }, punkteText(p, true))))), s.abgeschlossen ? h("p", { class: "leise" }, "Der Abend ist abgeschlossen. Nimm ihn wieder auf, um etwas zu ändern.") : [
        korrigierbar ? h("a", { class: "knopf haupt", href: `#/abend/${s.id}/eintragen/${spiel.nr}`, onclick: () => app.zeigeBlatt(null) }, "Korrigieren") : null,
        !w.schreibtHier ? null : h("button", {
            class: `knopf${spiel.verworfen ? "" : " gefahr"}`,
            onclick: async () => {
                if (await app.speichere("spielVerworfen", { nr: spiel.nr, verworfen: !spiel.verworfen }, { runde: r.id, sitzung: s.id }))
                    app.zeigeBlatt(null);
            },
        }, spiel.verworfen ? "Wieder gültig machen" : "Spiel verwerfen"),
    ], h("button", { class: "knopf text", onclick: () => app.zeigeBlatt(null) }, "Schließen"));
}
function menue(app, r, s) {
    // Am Tisch (Spec 010) regelt der Gastgeber Schmeißen, Plätze und Regeln; schreibt ein anderes Gerät, gibt es hier nur den Stand.
    const w = wege(app, s);
    if (s.abgeschlossen || !w.schreibtHier || w.mitKi) {
        return h("div", { class: "gruppe" }, h("h2", {}, "Menü"), w.amTisch ? h("a", { class: "knopf", href: "#/tisch" }, "Zum Spieltisch") : null, !s.abgeschlossen && w.schreibtHier ? h("a", { class: "knopf", href: `#/abend/${s.id}/abrechnung` }, "Abend abschließen") : null, 
        // Nach einer Sicherung auf ein neues Handy: dieses Gerät schreibt den Abend weiter (bewusst im Menü, mit Erklärung).
        !s.abgeschlossen && !w.schreibtHier && !w.amTisch ? [
            h("p", { class: "leise", style: "margin: 0" }, "Schreibt das andere Gerät nicht mehr, zum Beispiel nach einer Sicherung auf ein neues Handy?"),
            h("button", { class: "knopf", "data-fokus": "hier-weiterschreiben", onclick: () => app.zeigeBlatt(uebernehmenBlatt(app, r, s)) }, "Hier weiterschreiben"),
        ] : null, h("a", { class: "knopf", href: `#/runde/${r.id}` }, "Zur Runde"), h("button", { class: "knopf text", onclick: () => app.zeigeBlatt(null) }, "Schließen"));
    }
    return h("div", { class: "gruppe" }, h("h2", {}, "Menü"), h("button", {
        class: "knopf", "data-fokus": "schmeissen",
        onclick: async () => {
            if (await app.speichere("spielNeuGegeben", { nr: s.naechsteNr, grund: "Schmeißen" }, { runde: r.id, sitzung: s.id }))
                app.zeigeBlatt(null);
        },
    }, "Neu gegeben (Schmeißen)"), h("button", { class: "knopf", onclick: () => app.zeigeBlatt(plaetzeTauschen(app, r, s, { reihe: s.plaetze.map(platzSchluessel), vorhand: 0 })) }, "Plätze tauschen"), h("button", {
        class: "knopf",
        onclick: () => app.zeigeBlatt(regelnWahlBlatt(app, r, s.profil, `Regeln ab Spiel ${s.naechsteNr}`, async (p) => {
            if (p.id === s.profil.id && p.version === s.profil.version)
                return app.zeigeBlatt(null);
            if (await app.speichere("profilGeaendert", { profil: p, abSpiel: s.naechsteNr }, { runde: r.id, sitzung: s.id })) {
                merkeProfil(r.id, p);
                app.zeigeBlatt(null);
            }
        })),
    }, "Regeln ändern"), h("a", { class: "knopf", href: `#/abend/${s.id}/abrechnung` }, "Abend abschließen"), h("a", { class: "knopf", href: `#/runde/${r.id}` }, "Zur Runde"), h("button", { class: "knopf text", onclick: () => app.zeigeBlatt(null) }, "Schließen"));
}
/** Spec 016: Rückfrage, bevor dieses Gerät den Abend weiterschreibt. Zwei Geräte sollen nie denselben Abend schreiben. */
function uebernehmenBlatt(app, r, s) {
    return h("div", { class: "gruppe" }, h("h2", {}, "Hier weiterschreiben?"), h("p", { style: "margin: 0" }, "Nur, wenn das andere Gerät diesen Abend nicht mehr schreibt, zum Beispiel nach einer Sicherung auf ein neues Handy. Sonst entstehen zwei verschiedene Spielblöcke."), h("button", {
        class: "knopf haupt", "data-fokus": "uebernehmen-ja",
        onclick: async () => {
            app.zeigeBlatt(null);
            if (await app.speichere("sitzungUebernommen", { vonGeraet: s.schreibendesGeraet }, { runde: r.id, sitzung: s.id }))
                app.melde("Du schreibst diesen Abend jetzt hier weiter.", "info");
        },
    }, "Ja, hier weiterschreiben"), h("button", { class: "knopf text", onclick: () => app.zeigeBlatt(null) }, "Abbrechen"));
}
function plaetzeTauschen(app, r, s, z) {
    const neu = (z2) => app.zeigeBlatt(plaetzeTauschen(app, r, s, z2));
    const voll = z.reihe.length === 4;
    return h("div", { class: "gruppe" }, h("h2", {}, `Sitzordnung ab Spiel ${s.naechsteNr}`), tischskizze(r, z.reihe, voll ? "Neue Sitzordnung" : `Noch ${4 - z.reihe.length} frei`), h("p", { class: "leise", style: "margin: 0" }, "Antippen entfernt einen Spieler. Dann im Uhrzeigersinn neu besetzen."), spielerWahl(r, z, neu), h("button", {
        class: "knopf haupt", disabled: !voll,
        onclick: async () => {
            if (await app.speichere("plaetzeGeaendert", { plaetze: plaetzeAus(z.reihe), abSpiel: s.naechsteNr }, { runde: r.id, sitzung: s.id }))
                app.zeigeBlatt(null);
        },
    }, "Sitzordnung speichern"), h("button", { class: "knopf text", onclick: () => app.zeigeBlatt(null) }, "Abbrechen"));
}
//# sourceMappingURL=spielblock.js.map