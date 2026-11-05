// Spiel eintragen (Mockup „Schreiber · Spiel eintragen“): Modus „Nur Punkte“ (Spec 001) und Rechner (Spec 002).
// Tipp-Budget Nur Punkte: zwei Gewinner + „Spiel eintragen“. Rechner: zwei Re-Spieler + Augen + „Spiel eintragen“.
import { ansagenErlaubt, armutErlaubt, bockErlaubt, hochzeitPraemie, soloFaktor, sonderpunkteErlaubt } from "../../kern/profile.js";
import { spielAusEintrag } from "../../kern/eintrag.js";
import { platzSchluessel } from "../../kern/typen.js";
import { aufschluesselung } from "../../kern/wertung.js";
import { leseLokal, schreibeLokal } from "../app.js";
import { filzkopf, kopf, kurzNamen, meldung, spielerName } from "../bausteine.js";
import { h, punkteText } from "../dom.js";
import { tisch } from "../tisch.js";
/** Spec 016: Am Live-Tisch einmal je Eintrag beim Gastgeber anmelden (er teilt dann nicht aus). */
let angemeldet = null;
addEventListener("hashchange", () => {
    if (angemeldet === null || location.hash.includes("/eintragen"))
        return;
    angemeldet = null;
    tisch()?.client?.eintragAbbrechen();
});
const schluessel = (sitzungId, nr) => `dulle.entwurf.${sitzungId}.${nr}`;
const MODUS = (rundeId) => `dulle.modus.${rundeId}`;
const STUFEN = ["ansage", "k90", "k60", "k30", "schwarz"];
const SOLOARTEN = [["damen", "Damen"], ["buben", "Buben"], ["fleischlos", "Fleischlos"], ["kreuz", "Kreuz"], ["pik", "Pik"], ["herz", "Herz"], ["karo", "Karo"], ["still", "Still"]];
const SP_TEXT = { fuchs: "Fuchs gefangen", doppelkopf: "Doppelkopf", karlchen: "Karlchen" };
function startEntwurf(r, s, korrigiereNr) {
    const letztes = [...s.spiele].reverse().find((sp) => !sp.verworfen);
    const e = {
        modus: leseLokal(MODUS(r.id)) ?? "schnell", bock: 1,
        spielart: "normal", gewinner: [], wert: letztes?.daten.wert ?? 1,
        rArt: "normal", rSoloart: "damen", rRe: [], rAugen: null, rAnsagen: [], rSp: {}, rExtras: false,
    };
    const o = korrigiereNr ? s.spiele.find((sp) => sp.nr === korrigiereNr)?.daten : undefined;
    if (!o)
        return e;
    const solo = o.spielart === "solo" || o.spielart === "stillesSolo";
    e.modus = o.eingabe === "schnell" ? "schnell" : "rechner"; // Direktspiel-Spiele korrigiert man im Rechner
    e.bock = o.bock;
    e.wert = o.wert;
    if (o.eingabe === "schnell" && o.spielart === "hochzeit") {
        e.spielart = "hochzeit";
        e.ohnePartner = o.re?.length === 1;
        const hochzeiter = Object.keys(o.praemie ?? {})[0] ?? (e.ohnePartner ? o.re?.[0] : undefined);
        if (hochzeiter)
            e.hochzeiter = hochzeiter;
        if (e.ohnePartner && o.re?.[0])
            e.soloGewonnen = o.gewinner.includes(o.re[0]);
        else
            e.gewinner = [...o.gewinner];
    }
    else if (o.eingabe === "schnell") {
        e.spielart = solo ? "solo" : "normal";
        e.gewinner = solo ? [] : [...o.gewinner];
        if (solo && o.re?.[0]) {
            e.solist = o.re[0];
            e.soloGewonnen = o.gewinner.includes(o.re[0]);
        }
        if (!solo && o.re)
            e.partei = o.re.every((x) => o.gewinner.includes(x)) ? "re" : "kontra";
    }
    else {
        e.rArt = solo ? "solo" : o.spielart === "hochzeit" ? "hochzeit" : o.vorbehalt === "armut" ? "armut" : "normal";
        e.rSoloart = o.spielart === "stillesSolo" ? "still" : o.soloart ?? "damen";
        e.rRe = [...(o.re ?? [])];
        e.rAugen = o.augenRe ?? null;
        e.rAnsagen = [...(o.ansagen ?? [])];
        e.rSp = { ...(o.sonderpunkteArten ?? {}) };
    }
    return e;
}
/** Höchste Stufe einer Partei: 0 = nichts, 1 = Re/Kontra, 2 = keine 90 … 5 = schwarz. */
function stufeVon(ansagen, p) {
    return Math.max(0, ...ansagen.filter((a) => a.partei === p).map((a) => STUFEN.indexOf(a.stufe) + 1));
}
function mitStufe(ansagen, p, stufe) {
    const andere = ansagen.filter((a) => a.partei !== p);
    return [...andere, ...STUFEN.slice(0, stufe).map((s) => ({ partei: p, stufe: s }))];
}
export function eintragen(app, teile) {
    const gefunden = app.sitzung(teile[1] ?? "");
    if (!gefunden)
        return h("div", { class: "seite" }, kopf("Abend nicht gefunden", null));
    const { runde: r, sitzung: s } = gefunden;
    const korrigiereNr = teile[3] ? Number(teile[3]) : undefined;
    const original = korrigiereNr ? s.spiele.find((sp) => sp.nr === korrigiereNr) : undefined;
    // Spec 016: Läuft für diesen Abend ein Tisch, geht der Eintrag an das Gastgeber-Gerät. Sonst schreibt nur das Gerät des Abends.
    const c = tisch()?.client;
    const ti = c?.tisch;
    const live = !!c && !!ti && ti.sitzungId === s.id && c.verbunden && !ti.schreiberWeiter;
    if (s.abgeschlossen || (korrigiereNr && !original) || (!live && s.schreibendesGeraet !== app.geraet) || (live && original?.daten.eingabe === "direkt")) {
        queueMicrotask(() => app.geheZu(`/abend/${s.id}`));
        return h("div", { class: "seite" });
    }
    const anmeldung = `${s.id}/${korrigiereNr ?? "neu"}`;
    if (live && ti.eintragVon !== ti.ich && angemeldet !== anmeldung) {
        angemeldet = anmeldung;
        c.eintragBeginnt();
    }
    const ichTrageEin = !live || ti.eintragVon === ti.ich;
    const zurueck = live ? "#/tisch" : `#/abend/${s.id}`;
    const key = schluessel(s.id, korrigiereNr ?? "neu");
    let entwurf = { ...startEntwurf(r, s, korrigiereNr), ...(leseLokal(key) ?? {}) };
    const aendern = (teil) => {
        entwurf = { ...entwurf, ...teil };
        schreibeLokal(key, entwurf);
        app.zeichne();
    };
    const profil = s.profil;
    const amTisch = original ? Object.keys(original.daten.punkte) : s.plaetze.map(platzSchluessel);
    const nr = original?.nr ?? s.naechsteNr;
    const vorhand = (original?.daten.vorhand ?? s.naechsteVorhand);
    const kurz = kurzNamen(r, amTisch);
    const vorhandName = spielerName(r, platzSchluessel(s.plaetze.find((p) => p.platz === vorhand) ?? s.plaetze[0]));
    const bock = bockErlaubt(profil) ? entwurf.bock : 1;
    const praemie = hochzeitPraemie(profil);
    // ---------- Ergebnis berechnen ----------
    let daten = null;
    // Spec 016: Dieselbe Eingabe rechnet hier und, am Live-Tisch, auf dem Gastgeber-Gerät.
    let eingabe = null;
    const ort = { nr, vorhand, amTisch, profil };
    let fehlt = "";
    let titel = "";
    let aufschluss = "";
    if (entwurf.modus === "schnell") {
        const hochzeit = entwurf.spielart === "hochzeit" && praemie !== null;
        const solo = entwurf.spielart === "solo" || (hochzeit && entwurf.ohnePartner === true);
        eingabe = {
            art: "schnell", spielart: hochzeit ? "hochzeit" : entwurf.spielart === "hochzeit" ? "normal" : entwurf.spielart, gewinner: entwurf.gewinner,
            ...(hochzeit && entwurf.hochzeiter ? { hochzeiter: entwurf.hochzeiter } : {}),
            ...(hochzeit && entwurf.ohnePartner ? { ohnePartner: true } : {}),
            ...(entwurf.solist ? { solist: entwurf.solist } : {}),
            ...(entwurf.soloGewonnen !== undefined ? { soloGewonnen: entwurf.soloGewonnen } : {}),
            ...(entwurf.partei ? { gewinnerPartei: entwurf.partei } : {}),
            wert: entwurf.wert, bock,
        };
        const e = spielAusEintrag(eingabe, ort);
        if (e.ok) {
            daten = e.daten;
            titel = solo ? `${hochzeit ? "Hochzeit allein" : "Solo"} ${entwurf.soloGewonnen ? "gewonnen" : "verloren"}` : `${entwurf.gewinner.map((g) => spielerName(r, g)).join(" und ")} gewinnen`;
            if (e.daten.praemie)
                aufschluss = praemieText(e.daten.praemie);
        }
        else
            fehlt = e.fehlt;
    }
    else {
        const spielart = entwurf.rArt === "solo" ? (entwurf.rSoloart === "still" ? "stillesSolo" : "solo") : entwurf.rArt === "armut" ? "normal" : entwurf.rArt;
        if (entwurf.rAugen === null)
            fehlt = entwurf.rRe.length === 0 ? (entwurf.rArt === "solo" ? "Wähle, wer Solo gespielt hat." : "Wähle die Re-Spieler.") : "Augen eingeben.";
        else {
            eingabe = {
                art: "rechner", spielart, re: entwurf.rRe, augenRe: entwurf.rAugen,
                ansagen: entwurf.rAnsagen, sonderpunkte: entwurf.rSp, bock,
                ...(entwurf.rArt === "solo" && entwurf.rSoloart !== "still" ? { soloart: entwurf.rSoloart } : {}),
                ...(entwurf.rArt === "armut" ? { vorbehalt: "armut" } : {}),
            };
            const e = spielAusEintrag(eingabe, ort);
            if (e.ok && e.wertung) {
                daten = e.daten;
                const einzel = e.daten.re?.length === 1;
                titel = e.wertung.gewinner === "keiner" ? "Niemand gewinnt"
                    : e.wertung.gewinner === "re" ? (einzel ? "Solist gewinnt" : "Re gewinnt") : (einzel ? "Gegenspieler gewinnen" : "Kontra gewinnt");
                aufschluss = aufschluesselung(e.wertung) + (einzel ? " · Solist zählt " + soloFaktor(profil) + "-fach" : "") + (bock > 1 ? ` · Bock ×${bock}` : "")
                    + (e.daten.praemie ? ` · ${praemieText(e.daten.praemie)}` : "");
            }
            else if (!e.ok)
                fehlt = e.fehlt;
        }
    }
    function praemieText(pr) {
        return Object.entries(pr).map(([id, p]) => `+ Hochzeitsprämie ${spielerName(r, id)} ${p}`).join(" · ");
    }
    const speichern = async () => {
        if (!daten)
            return;
        if (live) {
            // Der Gastgeber prüft die Eingabe und rechnet die Punkte selbst.
            if (!eingabe || !ichTrageEin)
                return;
            c.eintragen(eingabe, original?.nr);
            angemeldet = null;
            schreibeLokal(key, null);
            app.geheZu("/tisch");
            return;
        }
        const ort = { runde: r.id, sitzung: s.id };
        if (original) {
            if (await app.speichere("spielKorrigiert", daten, ort)) {
                schreibeLokal(key, null);
                app.geheZu(`/abend/${s.id}`);
            }
            return;
        }
        await app.festschreiben();
        const ereignis = app.baue("spielEingetragen", daten, ort);
        if (!ereignis)
            return;
        const gemerkt = entwurf;
        schreibeLokal(key, null);
        app.beiRueckgaengig = (weg) => {
            schreibeLokal(key, weg.entwurf ?? gemerkt);
            app.geheZu(`/abend/${s.id}/eintragen`);
        };
        await app.vormerken(ereignis, `Spiel ${nr} eingetragen`, gemerkt);
        app.geheZu(`/abend/${s.id}`);
    };
    const spielerKnopf = (id, gewaehlt, marke, klick) => h("button", { class: "wahl", "aria-pressed": String(gewaehlt), "data-fokus": `spieler-${id}`, onclick: klick }, h("span", { class: "kuerzen" }, spielerName(r, id)), gewaehlt ? h("span", { class: "marke" }, marke) : null);
    return h("div", { class: "seite", style: "gap: 16px" }, filzkopf(original ? `Spiel ${nr} korrigieren` : `Spiel ${nr}`, `${vorhandName} kam raus · ${profil.name}`, {
        rechts: h("a", { class: "knopf", href: zurueck, onclick: () => { schreibeLokal(key, null); if (live) {
                angemeldet = null;
                c.eintragAbbrechen();
            } } }, "Abbrechen"),
    }), meldung(app), live && c.meldung ? h("p", { class: "hinweis fehler", role: "alert" }, c.meldung) : null, live && !ichTrageEin && !c.meldung ? h("p", { class: "leise", role: "status" }, ti.eintragVon !== null ? "Gerade trägt jemand anderes ein Spiel ein." : "Einen Moment, der Tisch hält das Austeilen an …") : null, h("div", { class: "segment", role: "group", "aria-label": "Eingabe" }, ["schnell", "rechner"].map((m) => h("button", {
        "aria-pressed": String(entwurf.modus === m), "data-fokus": `modus-${m}`,
        onclick: () => { schreibeLokal(MODUS(r.id), m); aendern({ modus: m }); },
    }, m === "schnell" ? "Nur Punkte" : "Rechner"))), entwurf.modus === "schnell" ? schnellTeil() : rechnerTeil(), bockErlaubt(profil)
        ? h("div", { class: "zeile" }, h("span", { class: "leise", style: "flex-grow: 1" }, "Bockspiel"), h("button", {
            class: "wahl", "aria-pressed": String(bock > 1), "data-fokus": "bock",
            onclick: () => aendern({ bock: bock === 1 ? 2 : bock === 2 ? 4 : 1 }),
        }, bock > 1 ? `Bock ×${bock}` : "kein Bock"))
        : null, h("div", { class: "dehnen" }), h("section", { class: "karte", "aria-label": "Vorschau", "aria-live": "polite" }, h("div", { class: "zeile", style: "align-items: baseline" }, h("div", { style: "font: 600 20px/1.15 var(--family-display); flex-grow: 1" }, daten ? titel : fehlt), daten ? h("div", { style: "font: 600 24px/1 var(--family-display); white-space: nowrap" }, `${daten.wert} ${daten.wert === 1 ? "Punkt" : "Punkte"}`) : null), aufschluss && daten ? h("div", { class: "leise", "data-aufschluesselung": "" }, aufschluss) : null, h("div", { class: "verteilung" }, amTisch.map((id) => h("div", {}, h("span", { class: "name", title: spielerName(r, id) }, kurz[id]), h("span", { class: "wert", "data-vorschau": id }, daten ? punkteText((daten.punkte[id] ?? 0) + (daten.praemie?.[id] ?? 0), true) : "–"))))), h("button", { class: "knopf haupt", disabled: !daten || !ichTrageEin, "data-fokus": "speichern", onclick: () => void speichern() }, original ? "Korrektur speichern" : "Spiel eintragen"));
    // ---------- Modus „Nur Punkte“ (Spec 001) ----------
    function schnellTeil() {
        const hochzeit = entwurf.spielart === "hochzeit" && praemie !== null;
        const solo = entwurf.spielart === "solo";
        const allein = hochzeit && entwurf.ohnePartner === true;
        const arten = praemie !== null ? ["normal", "hochzeit", "solo"] : ["normal", "solo"];
        return [
            h("div", { class: "segment", role: "group", "aria-label": "Spielart" }, arten.map((art) => h("button", {
                "aria-pressed": String(entwurf.spielart === art), "data-fokus": `art-${art}`,
                onclick: () => aendern({ spielart: art }),
            }, { normal: "Normal", hochzeit: "Hochzeit", solo: "Solo" }[art]))),
            hochzeit
                ? h("div", { class: "gruppe" }, h("div", { id: "wer-hochzeit", style: "font-size: 14px; font-weight: 600" }, "Wer hatte die Hochzeit?"), h("div", { class: "raster-2", role: "group", "aria-labelledby": "wer-hochzeit" }, amTisch.map((id) => spielerKnopf(id, entwurf.hochzeiter === id, `+${praemie}`, () => aendern({ hochzeiter: id })))), h("div", { class: "zeile" }, h("span", { class: "leise", style: "flex-grow: 1" }, "Keinen Partner gefunden"), h("button", { class: "wahl", "aria-pressed": String(allein), "data-fokus": "ohne-partner", onclick: () => aendern({ ohnePartner: !allein }) }, "allein")))
                : null,
            allein
                ? h("div", { class: "raster-2", role: "group", "aria-label": "Ausgang der Hochzeit" }, [true, false].map((gewonnen) => h("button", {
                    class: "wahl", "aria-pressed": String(entwurf.soloGewonnen === gewonnen), "data-fokus": `solo-${gewonnen}`,
                    onclick: () => aendern({ soloGewonnen: gewonnen }),
                }, gewonnen ? "gewonnen" : "verloren")))
                : h("div", { class: "gruppe" }, h("div", { id: "wer", style: "font-size: 14px; font-weight: 600" }, solo ? "Wer hat Solo gespielt?" : "Wer hat gewonnen?"), h("div", { class: "raster-2", role: "group", "aria-labelledby": "wer" }, amTisch.map((id) => {
                    const gewaehlt = solo ? entwurf.solist === id : entwurf.gewinner.includes(id);
                    return spielerKnopf(id, gewaehlt, solo ? "Solo" : "gewinnt", () => {
                        if (solo)
                            return aendern({ solist: id });
                        const ohne = entwurf.gewinner.filter((g) => g !== id);
                        aendern({ gewinner: gewaehlt ? ohne : [...ohne, id].slice(-2) });
                    });
                }))),
            allein ? null : solo
                ? h("div", { class: "raster-2", role: "group", "aria-label": "Ausgang des Solos" }, [true, false].map((gewonnen) => h("button", {
                    class: "wahl", "aria-pressed": String(entwurf.soloGewonnen === gewonnen), "data-fokus": `solo-${gewonnen}`,
                    onclick: () => aendern({ soloGewonnen: gewonnen }),
                }, gewonnen ? "gewonnen" : "verloren")))
                : hochzeit ? null : h("div", { class: "zeile" }, h("span", { class: "leise", style: "flex-grow: 1" }, "Gewinner waren ", h("span", { style: "font-size: 13px" }, "(optional)")), ["re", "kontra"].map((p) => h("button", {
                    class: "wahl", style: `min-width: 76px; color: var(--${p})`, "aria-pressed": String(entwurf.partei === p), "data-fokus": `partei-${p}`,
                    onclick: () => {
                        const { partei: _weg, ...rest } = entwurf;
                        if (entwurf.partei === p) {
                            entwurf = rest;
                            schreibeLokal(key, entwurf);
                            app.zeichne();
                        }
                        else
                            aendern({ partei: p });
                    },
                }, p === "re" ? "Re" : "Kontra"))),
            h("div", { class: "gruppe" }, h("label", { for: "spielwert" }, "Spielwert"), h("div", { class: "stepper" }, h("button", { class: "knopf", "aria-label": "Spielwert verringern", "data-fokus": "wert-minus", onclick: () => aendern({ wert: Math.max(0, entwurf.wert - 1) }) }, "−"), h("input", {
                class: "wert", id: "spielwert", type: "text", inputmode: "numeric", pattern: "[0-9]*", value: entwurf.wert, "data-fokus": "wert",
                onchange: (e) => {
                    const zahl = Number.parseInt(e.target.value, 10);
                    aendern({ wert: Number.isFinite(zahl) && zahl >= 0 ? Math.min(zahl, 99) : entwurf.wert });
                },
            }), h("button", { class: "knopf", "aria-label": "Spielwert erhöhen", "data-fokus": "wert-plus", onclick: () => aendern({ wert: Math.min(99, entwurf.wert + 1) }) }, "+"), h("span", { class: "leise" }, "Punkte, wie ihr sie am Tisch gerechnet habt"))),
        ];
    }
    // ---------- Rechner (Spec 002) ----------
    function rechnerTeil() {
        const art = entwurf.rArt;
        const einzelGewaehlt = art === "solo";
        const maxRe = art === "solo" ? 1 : 2;
        const reFrage = art === "solo" ? "Wer hat Solo gespielt?" : art === "hochzeit" ? "Hochzeiter, dann Partner" : art === "armut" ? "Armer Spieler und Partner" : "Wer war Re?";
        const marke = art === "solo" ? "Solo" : "Re";
        const arten = armutErlaubt(profil) ? ["normal", "hochzeit", "armut", "solo"] : ["normal", "hochzeit", "solo"];
        const einzel = art === "solo" || (art === "hochzeit" && entwurf.rRe.length === 1);
        const sp = sonderpunkteErlaubt(profil).filter((x) => x === "fuchs" || x === "doppelkopf" || x === "karlchen");
        const extrasTeile = [
            ...["re", "kontra"].map((p) => {
                const st = stufeVon(entwurf.rAnsagen, p);
                return st < 2 ? "" : `${p === "re" ? "Re" : "Kontra"} ${["", "", "keine 90", "keine 60", "keine 30", "schwarz"][st]}`;
            }),
            ...Object.entries(entwurf.rSp).flatMap(([a, w]) => (w && (w.re || w.kontra) ? [`${SP_TEXT[a]} ${w.re}:${w.kontra}`] : [])),
        ].filter(Boolean);
        return [
            h("div", { class: "segment", role: "group", "aria-label": "Spielart" }, arten.map((a) => h("button", {
                "aria-pressed": String(art === a), "data-fokus": `rart-${a}`,
                onclick: () => aendern({ rArt: a, rRe: a === "solo" ? entwurf.rRe.slice(-1) : entwurf.rRe }),
            }, { normal: "Normal", hochzeit: "Hochzeit", armut: "Armut", solo: "Solo" }[a]))),
            art === "solo"
                ? h("div", { class: "chips", role: "group", "aria-label": "Soloart" }, SOLOARTEN.map(([id, text]) => h("button", { class: "wahl", "aria-pressed": String(entwurf.rSoloart === id), onclick: () => aendern({ rSoloart: id }) }, text)))
                : null,
            h("div", { class: "gruppe" }, h("div", { id: "wer", style: "font-size: 14px; font-weight: 600" }, reFrage), h("div", { class: "raster-2", role: "group", "aria-labelledby": "wer" }, amTisch.map((id) => {
                const gewaehlt = entwurf.rRe.includes(id);
                return spielerKnopf(id, gewaehlt, marke, () => {
                    const ohne = entwurf.rRe.filter((x) => x !== id);
                    aendern({ rRe: gewaehlt ? ohne : [...ohne, id].slice(-maxRe) });
                });
            })), art === "hochzeit" ? h("div", { class: "leise" }, "Fand der Hochzeiter keinen Partner, nur ihn wählen. Dann zählt es wie ein Solo.") : null),
            h("div", { class: "gruppe" }, h("div", { class: "zeile" }, h("label", { for: "augen", style: "flex-grow: 1" }, einzelGewaehlt ? "Augen des Solisten" : "Augen Re"), h("span", { class: "leise" }, entwurf.rAugen === null ? "" : `Gegenseite: ${240 - entwurf.rAugen}`)), h("div", { class: "zeile" }, h("input", {
                id: "augen", type: "text", inputmode: "numeric", pattern: "[0-9]*", value: entwurf.rAugen ?? "", placeholder: "0–240", "data-fokus": "augen",
                style: "width: 96px; flex: none; font: 600 22px var(--family-mono)",
                onchange: (e) => {
                    const zahl = Number.parseInt(e.target.value, 10);
                    aendern({ rAugen: Number.isFinite(zahl) ? Math.max(0, Math.min(240, zahl)) : null });
                },
            }), h("input", {
                type: "range", min: 0, max: 240, value: entwurf.rAugen ?? 120, "aria-label": "Augen schieben", style: "flex-grow: 1; accent-color: var(--accent)",
                onchange: (e) => aendern({ rAugen: Number(e.target.value) }),
            }))),
            ansagenErlaubt(profil)
                ? h("div", { class: "zeile" }, h("span", { id: "angesagt", class: "leise", style: "flex-grow: 1" }, "Angesagt"), h("div", { class: "chips", role: "group", "aria-labelledby": "angesagt" }, ["re", "kontra"].map((p) => {
                    const an = stufeVon(entwurf.rAnsagen, p) >= 1;
                    return h("button", {
                        class: "wahl", style: `min-width: 76px; color: var(--${p})`, "aria-pressed": String(an), "data-fokus": `angesagt-${p}`,
                        onclick: () => aendern({ rAnsagen: mitStufe(entwurf.rAnsagen, p, an ? 0 : 1) }),
                    }, p === "re" ? "Re" : "Kontra");
                })))
                : null,
            h("div", { class: "karte", style: "padding: 0" }, h("button", {
                class: "knopf", style: "border: 0; width: 100%; justify-content: space-between; gap: 12px; text-align: left; background: transparent", "aria-expanded": String(entwurf.rExtras), "data-fokus": "extras",
                onclick: () => aendern({ rExtras: !entwurf.rExtras }),
            }, ansagenErlaubt(profil) ? "Absagen und Sonderpunkte" : "Sonderpunkte", h("span", { class: "leise", style: "font-weight: 400" }, extrasTeile.length ? extrasTeile.join(" · ") : "keine")), entwurf.rExtras ? h("div", { class: "gruppe", style: "padding: 0 16px 16px" }, ansagenErlaubt(profil)
                ? ["re", "kontra"].map((p) => {
                    const st = stufeVon(entwurf.rAnsagen, p);
                    const name = p === "re" ? "Re" : "Kontra";
                    return h("div", { class: "gruppe", style: "gap: 4px" }, h("div", { style: `font-size: 14px; font-weight: 600; color: var(--${p})` }, `Absagen ${name}`), h("div", { class: "chips", role: "group", "aria-label": `Absagen ${name}` }, ["keine 90", "keine 60", "keine 30", "schwarz"].map((text, j) => {
                        const i = j + 1; // Stufe 1 ist die Ansage selbst, sie steht oben sichtbar.
                        return h("button", {
                            class: "wahl", "aria-pressed": String(st >= i + 1),
                            onclick: () => aendern({ rAnsagen: mitStufe(entwurf.rAnsagen, p, st === i + 1 ? i : i + 1) }),
                        }, text);
                    })));
                })
                : null, !einzel && sp.length > 0
                ? sp.map((a) => h("div", { class: "gruppe", style: "gap: 4px" }, h("div", { style: "font-size: 14px; font-weight: 600" }, SP_TEXT[a]), h("div", { class: "sp-reihe" }, ["re", "kontra"].map((p) => {
                    const wert = entwurf.rSp[a]?.[p] ?? 0;
                    const setze = (n) => aendern({ rSp: { ...entwurf.rSp, [a]: { re: 0, kontra: 0, ...entwurf.rSp[a], [p]: Math.max(0, Math.min(4, n)) } } });
                    return h("div", { class: "stepper", style: "gap: 6px" }, h("span", { style: `width: 48px; font-size: 14px; color: var(--${p})` }, p === "re" ? "Re" : "Kontra"), h("button", { class: "knopf", "aria-label": `${SP_TEXT[a]} ${p === "re" ? "Re" : "Kontra"} weniger`, onclick: () => setze(wert - 1) }, "−"), h("span", { class: "zahl", style: "width: 20px; text-align: center", "aria-live": "polite" }, wert), h("button", { class: "knopf", "aria-label": `${SP_TEXT[a]} ${p === "re" ? "Re" : "Kontra"} mehr`, onclick: () => setze(wert + 1) }, "+"));
                }))))
                : einzel ? h("p", { class: "leise" }, "Im Solo gibt es keine Sonderpunkte.") : null) : null),
        ];
    }
}
//# sourceMappingURL=eintragen.js.map