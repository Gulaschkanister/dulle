// Spieltisch (Spec 010, Mockup „Spieltisch“, Handy quer). Zeigt nur die eigene Sicht; jede Aktion geht an den Gastgeber.
import { farbName } from "../../kern/kartensatz.js";
import { hochzeitKlaerung, mitNeunen, soliErlaubt, zweiteDulle } from "../../kern/profile.js";
import { karte as karteDaten } from "../../kern/spiel/karten.js";
import { bedienFarbe, stichGewinner } from "../../kern/spiel/stich.js";
import { aufschluesselung, spielAusRechner } from "../../kern/wertung.js";
import { bewegungMs, kopf } from "../bausteine.js";
import { h, punkteText } from "../dom.js";
import { karte, kartensatz } from "../karten.js";
import { qrCode, scanne } from "../qr.js";
import { abendBeenden, darfUebernehmen, fortsetzenAlsMitspieler, mitEchtenKartenWeiter, RAUM_GEDULD_MS, raumOffen, letzterStand, schliesseTisch, tisch, uebergeben, uebernehmen, wachBleiben, zurueckkehren, } from "../tisch.js";
import { istVollbild, querSperren, vollbildAn, vollbildSinnvoll } from "../vollbild.js";
const SOLONAME = { damen: "Damen", buben: "Buben", fleischlos: "Fleischlos", kreuz: "Kreuz", pik: "Pik", herz: "Herz", karo: "Karo" };
const STUFE_TEXT = { ansage: "", k90: "keine 90", k60: "keine 60", k30: "keine 30", schwarz: "schwarz" };
const LAGE = ["unten", "links", "oben", "rechts"];
// Zustand nur dieser Ansicht (kein Spielzustand): Schritte in Dialogen, Auswahl bei der Armut-Rückgabe, letzter Stich.
let vorbehaltSchritt = { spielNr: 0, wahl: false, klaerung: "fehl" };
let rueckgabe = { spielNr: 0, karten: new Set() };
let letzterStich = null;
let wechselVerborgen = null;
let querGesperrt = false;
let qrFuer = null;
let scannerStopp = null;
const WAHL_TEXT = { ki: "KI spielt", warten: "Weiter warten", ersatz: "Ersatz", neuGeben: "Spiel neu geben", beenden: "Abend beenden" };
/** So lange verspricht der Getrennte sich selbst die Rückkehr über das Internet, auch zwischen zwei Versuchen. */
const ZUSAGE_MS = 60_000;
/** Spec 030: Mit Raum und Internet kommt ein Getrennter meist von selbst zurück; die anderen sollen erst einmal nichts tun. */
export function kommtSelbst(ti, p) {
    // Der Gastgeber weiß, ob sein Raum wirklich offen ist; Mitspieler kennen nur den Raum aus der Tisch-Info.
    const raum = tisch()?.rolle === "gastgeber" ? raumOffen() : ti.raum !== null && navigator.onLine;
    return raum && p.zustand === "weg" && p.wegSeit !== null && Date.now() - p.wegSeit < RAUM_GEDULD_MS;
}
/** Minuten:Sekunden seit einem Zeitpunkt (Spec 012, Zähler bei „Verbindung weg“). */
function seit(zeit) {
    const s = Math.max(0, Math.floor((Date.now() - (zeit ?? Date.now())) / 1000));
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}
export function spieltisch(app) {
    // Nach Neuladen nie leer (Spec 012): der letzte Stand, mit „Verbindung weg“.
    if (!tisch() && letzterStand())
        fortsetzenAlsMitspieler(app);
    const t = tisch();
    const c = t?.client;
    const s = c?.sicht;
    const ti = c?.tisch;
    if (!t || !c || !s || !ti) {
        return h("div", { class: "seite" }, kopf("Kein Tisch offen", null), h("p", {}, "Eröffne einen Tisch über die Runde oder scanne eine Einladung."), h("a", { class: "knopf", href: "#/" }, "Zur Startseite"));
    }
    void wachBleiben();
    // Spec 017 H: Wer in der Lobby ins Vollbild kam (ohne Sperre), spielt am Tisch quer.
    if (istVollbild() && !querGesperrt) {
        querGesperrt = true;
        querSperren();
    }
    if (!istVollbild())
        querGesperrt = false;
    const satz = kartensatz();
    const name = (p) => ti.plaetze[p - 1]?.name ?? `Platz ${p}`;
    const lage = (p) => LAGE[(p - s.ich + 4) % 4];
    const gesamt = mitNeunen(ti.profil) ? 12 : 10;
    return h("div", { class: "spieltisch", "data-phase": s.phase, "data-ich": s.ich, "data-am-zug": s.amZug === s.ich && s.phase !== "ende" ? "ja" : "nein" }, kopfzeile(app, c, s, ti, gesamt), h("div", { class: "tisch-oval", "aria-hidden": "true" }), [1, 2, 3, 4].filter((p) => p !== s.ich).map((p) => gegner(s, ti, p, lage(p), name)), mitte(app, s, ti, satz, lage, name), status(s, ti, satz, name), ansageKnopf(app, c, s), hand(app, c, s), ti.beendet && t.rolle === "mitspieler" ? beendetPanel(app, ti, s.phase !== "ende")
        : ti.schreiberWeiter && t.rolle === "mitspieler" ? schreiberWeiterPanel(app, ti)
            : !c.verbunden && t.rolle === "mitspieler" ? verbindungWegPanel(app, t, c, ti, name) : panel(app, c, s, ti, satz, name), c.verbunden && !ti.schreiberWeiter && (c.meldung || hinweisSichtbar(app, c)) ? h("div", { class: "tisch-meldung", role: c.meldung ? "alert" : "status" }, c.meldung ?? c.hinweis) : null, h("div", { class: "hochkant drehen", role: "note" }, h("strong", {}, "Bitte quer halten"), h("span", {}, "Der Spieltisch braucht die Breite.")), 
    // Am PC (Maus) gibt es kein Drehen; zu schmale Fenster schneiden sonst die Hand ab (Designer, Live-Test 2026-11-07).
    h("div", { class: "hochkant breiter", role: "note" }, h("strong", {}, "Fenster breiter ziehen"), h("span", {}, "Der Spieltisch braucht mindestens 700 Pixel Breite."), 
    // Ausweg, falls das Fenster gerade nicht breiter geht (UI-Spezialist).
    h("a", { class: "tisch-knopf", href: "#/", "data-fokus": "zur-startseite" }, "Zur Startseite")));
}
/** Hinweise (z. B. „Neu gemischt“) verschwinden nach 5 s von selbst, damit sie keine spätere Frage verdecken. */
const HINWEIS_MS = 5000;
let hinweisUhr = null;
function hinweisSichtbar(app, c) {
    if (!c.hinweis)
        return false;
    const rest = HINWEIS_MS - (Date.now() - c.hinweisSeit);
    if (rest <= 0)
        return false;
    // Ein Timer genügt; neu gezeichnet wird ohnehin oft.
    if (hinweisUhr)
        clearTimeout(hinweisUhr);
    hinweisUhr = setTimeout(() => { hinweisUhr = null; app.zeichne(); }, rest + 50);
    return true;
}
// ---------- Teile ----------
function typText(s, name) {
    switch (s.spieltyp) {
        case "hochzeit": return `Hochzeit (${name(s.hochzeit.hochzeiter)})`;
        case "stilleHochzeit": return "Stille Hochzeit";
        case "solo": return `${SOLONAME[s.solo.soloart]}-Solo (${name(s.solo.solist)})`;
        case "armut": return `Armut (${name(s.armut.armer)}${s.armut.partner ? ` + ${name(s.armut.partner)}` : ""})`;
        default: return s.phase === "vorbehalt" || s.phase === "vorbehaltArt" ? "Vorbehalte" : "Normalspiel";
    }
}
function kopfzeile(app, c, s, ti, gesamt) {
    const stich = Math.min(s.stiche.length + 1, gesamt);
    // Gastgeber: Wer weg ist, wird von hier zurückgeholt (Stufe 3) oder bekommt einen Ersatz.
    const holen = tisch()?.rolle === "gastgeber"
        ? ti.plaetze.find((p) => ti.ersatzFuer === p.platz || (p.zustand === "weg" && !p.zurueckgeholt && !kommtSelbst(ti, p)) || p.ki === "fuer") : undefined;
    return h("header", { class: "tisch-kopf" }, h("span", { class: "tisch-info" }, `Spiel ${s.spielNr} · ${typText(s, (p) => ti.plaetze[p - 1]?.name ?? "")}${s.phase === "spiel" ? ` · Stich ${stich} von ${gesamt}` : ""}`), h("span", { class: "dehnen" }), holen ? h("a", { class: "tisch-knopf hervor", href: `#/runde/${ti.rundeId}/am-handy`, "data-fokus": "zurueckholen" }, ti.ersatzFuer === holen.platz ? "Ersatz einladen" : `${holen.name} zurückholen`) : null, s.eigenePartei && s.phase !== "vorbehalt" && s.phase !== "vorbehaltArt"
        ? h("span", { class: `partei-marke ${s.eigenePartei}` }, `Du spielst ${s.eigenePartei === "re" ? "Re" : "Kontra"}`) : null, 
    // Spec 017 H: Vollbild, solange die Browserleisten Platz nehmen (Handy im Browser, nicht als App).
    vollbildSinnvoll(app.alsApp) && !istVollbild() ? h("button", { class: "tisch-knopf", "data-fokus": "vollbild", onclick: () => vollbildAn() }, "Vollbild") : null, ti.sitzungId ? h("button", { class: "tisch-knopf", "data-fokus": "stand", onclick: () => app.zeigeBlatt(standBlatt(app, ti)) }, "Stand") : null, h("button", { class: "tisch-knopf", "data-fokus": "menue", onclick: () => app.zeigeBlatt(menue(app, c, ti)) }, "Menü"));
}
function gegner(s, ti, p, wo, name) {
    const stiche = s.stiche.filter((st) => st.gewinner === p).length;
    const ansagen = s.ansagen.filter((a) => a.platz === p);
    const hoechste = ansagen.at(-1);
    const partei = s.bekanntePartei[p];
    const vb = s.vorbehalte[p];
    const sitz = ti.plaetze[p - 1];
    const warnung = sitz?.ki === "fuer" ? "KI spielt" : ti.ersatzFuer === p ? "Ersatz gesucht"
        : sitz?.zustand === "weg" ? (sitz.zurueckgeholt ? "wird zurückgeholt" : kommtSelbst(ti, sitz) ? "kommt über das Internet zurück …" : ["Verbindung weg", h("span", { class: "trenner" }, " · "), h("span", { class: "zaehler" }, seit(sitz.wegSeit))])
            : sitz?.zustand === "wackelt" ? "Verbindung wackelt" : null;
    return h("div", { class: `gegner ${wo}${s.amZug === p && s.phase !== "ende" ? " am-zug" : ""}`, "data-gegner": p }, h("div", { class: "gegner-name" }, name(p)), h("div", { class: "gegner-info" }, `${s.kartenzahl[p]} Karten${stiche ? ` · ${stiche} ${stiche === 1 ? "Stich" : "Stiche"}` : ""}`), warnung ? h("div", { class: sitz?.ki === "fuer" ? "gegner-ki" : "gegner-warnung", "data-warnung": sitz?.ki === "fuer" ? "ki" : sitz?.zustand ?? "" }, warnung) : null, (s.phase === "vorbehalt" || s.phase === "vorbehaltArt") && vb ? h("div", { class: "gegner-info" }, vb.art === "gesund" ? "gesund" : "Vorbehalt") : null, hoechste ? h("div", { class: `gegner-marke ${hoechste.partei}` }, hoechste.stufe === "ansage" ? `${hoechste.partei === "re" ? "Re" : "Kontra"} angesagt` : STUFE_TEXT[hoechste.stufe])
        : partei ? h("div", { class: `gegner-marke ${partei}` }, partei === "re" ? "Re" : "Kontra") : null);
}
function mitte(app, s, ti, satz, lage, name) {
    let karten = s.stich;
    let unterschrift = null;
    // Der fertige Stich bleibt kurz liegen (bei reduzierter Bewegung nicht).
    const fertig = s.stiche.at(-1);
    if (karten.length === 0 && fertig && s.phase !== "vorbehalt") {
        const schluessel = `${s.spielNr}-${s.stiche.length}`;
        const dauer = bewegungMs("slow") > 0 ? 1200 : 0;
        if (letzterStich?.schluessel !== schluessel) {
            letzterStich = { schluessel, seit: Date.now() };
            if (dauer > 0)
                setTimeout(() => app.zeichne(), dauer + 50);
        }
        if (Date.now() - letzterStich.seit < dauer || s.phase === "ende") {
            karten = fertig.karten;
            unterschrift = fertig.gewinner === s.ich ? "Stich an dich" : `Stich an ${name(fertig.gewinner)}`;
        }
    }
    else if (karten.length > 0)
        unterschrift = vornText(s, ti, name);
    // Wer dran ist, hebt Karten an und verdeckt den Text darunter: Er steht dann in der Status-Zeile (UI, Sandbox).
    if (s.phase === "spiel" && s.amZug === s.ich)
        unterschrift = null;
    const drehung = { unten: 0, links: -8, oben: 3, rechts: 8 };
    return h("div", { class: "tisch-mitte", "aria-label": "Stich", role: "group" }, karten.map((g) => h("div", { class: `stich-platz ${lage(g.platz)}` }, karte(g.karte, { groesse: "stich", satz, drehung: drehung[lage(g.platz)] ?? 0 }))), unterschrift ? h("div", { class: "stich-text" }, unterschrift) : null);
}
/** Wer im laufenden Stich vorn liegt. */
function vornText(s, ti, name) {
    const k = { trumpf: s.solo?.soloart ?? "normal", schweinchen: s.schweinchen !== null };
    const vorn = s.stich[stichGewinner(s.stich.map((g) => g.karte), zweiteDulle(ti.profil), false, k)];
    return vorn.platz === s.ich ? "Du liegst vorn" : `${name(vorn.platz)} liegt vorn`;
}
function status(s, ti, satz, name) {
    if (s.phase !== "spiel")
        return null;
    const ichDran = s.amZug === s.ich;
    let zusatz = "";
    if (ichDran && s.stich.length > 0) {
        const k = { trumpf: s.solo?.soloart ?? "normal", schweinchen: s.schweinchen !== null };
        const f = bedienFarbe(s.stich[0].karte, k);
        const bedienen = f === "trumpf" ? "Trumpf bedienen" : `${farbName(karteDaten(s.stich[0].karte).farbe, satz)} bedienen`;
        zusatz = `${bedienen} · ${vornText(s, ti, name)}`;
    }
    else if (ichDran)
        zusatz = "Du spielst aus";
    const meine = s.stiche.filter((st) => st.gewinner === s.ich).length;
    // Fehlt der, der am Zug ist, steht das Spiel (Spec 012).
    const fehlt = !ichDran && ti.plaetze[s.amZug - 1]?.zustand === "weg";
    return h("div", { class: "tisch-status" }, h("div", { class: ichDran ? "dran" : "" }, ichDran ? "Du bist dran" : fehlt ? `Warten auf ${name(s.amZug)}` : `${name(s.amZug)} ist dran`), h("div", { class: "leise-hell" }, [zusatz, meine ? `${meine} ${meine === 1 ? "eigener Stich" : "eigene Stiche"}` : ""].filter(Boolean).join(" · ")));
}
function ansageText(st, s) {
    return st === "ansage" ? `${s.eigenePartei === "re" ? "Re" : "Kontra"} ansagen` : STUFE_TEXT[st];
}
function ansageKnopf(app, c, s) {
    if (s.erlaubteAnsagen.length === 0)
        return null;
    const erste = s.erlaubteAnsagen[0];
    return h("div", { class: "ansage" }, h("button", { class: "tisch-knopf gross", "data-fokus": "ansage", onclick: () => c.aktion({ typ: "ansage", stufe: erste }) }, ansageText(erste, s)), s.erlaubteAnsagen.length > 1 ? h("button", {
        class: "tisch-knopf", "aria-label": "Weitere Ansagen", "data-fokus": "ansage-mehr",
        onclick: () => app.zeigeBlatt(h("div", { class: "gruppe" }, h("h2", {}, "Ansagen"), s.erlaubteAnsagen.map((st) => h("button", { class: "knopf", onclick: () => { app.zeigeBlatt(null); c.aktion({ typ: "ansage", stufe: st }); } }, ansageText(st, s))), h("p", { class: "leise" }, "Übersprungene Stufen zählen mit."), h("button", { class: "knopf text", onclick: () => app.zeigeBlatt(null) }, "Schließen"))),
    }, "…") : null);
}
function hand(app, c, s) {
    const ichDran = s.amZug === s.ich && s.phase === "spiel";
    const rueckgeben = s.phase === "armutRueckgabe" && s.armut?.partner === s.ich;
    if (rueckgabe.spielNr !== s.spielNr)
        rueckgabe = { spielNr: s.spielNr, karten: new Set() };
    return h("div", { class: "hand-faecher", role: "group", "aria-label": "Deine Karten" }, s.hand.map((id) => {
        if (rueckgeben) {
            const gewaehlt = rueckgabe.karten.has(id);
            return karte(id, {
                spielbar: gewaehlt, fokus: `karte-${id}`,
                onclick: () => {
                    if (gewaehlt)
                        rueckgabe.karten.delete(id);
                    else if (rueckgabe.karten.size < (s.armut?.anzahl ?? 0))
                        rueckgabe.karten.add(id);
                    app.zeichne();
                },
            });
        }
        const spielbar = ichDran && s.erlaubteKarten.includes(id);
        // Blass nur, was man gerade nicht legen darf. Beim Vorbehalt und wenn andere dran sind, bleibt die Hand gut lesbar.
        return karte(id, { spielbar, gedaempft: ichDran && !spielbar, inaktiv: !spielbar, ...(spielbar ? { onclick: () => c.aktion({ typ: "karte", karte: id }) } : { onclick: () => undefined }) });
    }));
}
// ---------- Dialoge in der Mitte ----------
function panel(app, c, s, ti, satz, name) {
    if (ti.beendet)
        return beendetPanel(app, ti, s.phase !== "ende");
    if (ti.wechsel && ti.wechsel.platz !== s.ich && wechselVerborgen !== ti.wechsel.platz)
        return wechselPanel(app, c, ti.wechsel.platz, name);
    if (ti.frage && ti.frage.platz !== s.ich)
        return fragePanel(c, s, ti, name);
    if (s.phase === "vorbehalt" || s.phase === "vorbehaltArt")
        return vorbehaltPanel(app, c, s, ti, satz, name);
    if (s.phase === "armutAngebot" && s.armut) {
        const a = s.armut;
        if (s.amZug === s.ich) {
            return h("section", { class: "tisch-panel", "aria-label": "Armut" }, h("h2", {}, `Armut von ${name(a.armer)} nehmen?`), h("p", { class: "leise" }, `${name(a.armer)} gibt ${a.anzahl} ${a.anzahl === 1 ? "Karte" : "Karten"} (alle Trümpfe). Wer nimmt, gibt gleich viele zurück und spielt mit ${name(a.armer)}.`), h("div", { class: "raster-2" }, h("button", { class: "knopf haupt", "data-fokus": "armut-ja", onclick: () => c.aktion({ typ: "armut", nimmt: true }) }, "Nehmen"), h("button", { class: "knopf", "data-fokus": "armut-nein", onclick: () => c.aktion({ typ: "armut", nimmt: false }) }, "Nicht nehmen")));
        }
        return h("section", { class: "tisch-panel", "aria-label": "Armut" }, h("h2", {}, `Armut von ${name(a.armer)}`), h("p", { class: "leise" }, `${ti.plaetze[s.amZug - 1]?.zustand === "weg" ? `Warten auf ${name(s.amZug)}, die Verbindung ist weg.` : `${name(s.amZug)} entscheidet, ob er sie nimmt.`}${a.gefragt.length ? ` Abgelehnt: ${a.gefragt.map(name).join(", ")}.` : ""}`));
    }
    if (s.phase === "armutRueckgabe" && s.armut) {
        const a = s.armut;
        if (a.partner === s.ich) {
            const fehlt = a.anzahl - rueckgabe.karten.size;
            return h("section", { class: "tisch-panel klein", "aria-label": "Rückgabe" }, h("h2", {}, `${a.anzahl} ${a.anzahl === 1 ? "Karte" : "Karten"} an ${name(a.armer)} zurück`), h("p", { class: "leise" }, fehlt > 0 ? `Tippe unten ${fehlt === 1 ? "noch eine Karte" : `noch ${fehlt} Karten`} an. Auch Trumpf ist erlaubt.` : "Fertig ausgewählt."), h("button", { class: "knopf haupt", disabled: fehlt !== 0, "data-fokus": "zurueckgeben", onclick: () => c.aktion({ typ: "rueckgabe", karten: [...rueckgabe.karten] }) }, "Zurückgeben"));
        }
        return h("section", { class: "tisch-panel", "aria-label": "Armut" }, h("h2", {}, `${name(a.partner)} nimmt die Armut`), h("p", { class: "leise" }, "Gleich werden die Karten zurückgegeben."));
    }
    if (s.phase === "ende" && s.ergebnis)
        return endePanel(app, s, ti, name);
    return null;
}
function vorbehaltPanel(app, c, s, ti, satz, name) {
    if (vorbehaltSchritt.spielNr !== s.spielNr)
        vorbehaltSchritt = { spielNr: s.spielNr, wahl: false, klaerung: "fehl" };
    const stand = [1, 2, 3, 4].filter((p) => p !== s.ich).map((p) => {
        const vb = s.vorbehalte[p];
        return `${name(p)}: ${vb ? (vb.art === "gesund" ? "gesund" : "Vorbehalt") : ti.plaetze[p - 1]?.zustand === "weg" ? "weg" : "…"}`;
    });
    const kopfzeile = h("div", { class: "vorbehalt-stand" }, stand.map((x) => h("span", {}, x)));
    if (s.amZug !== s.ich) {
        const mein = s.vorbehalte[s.ich];
        return h("section", { class: "tisch-panel", "aria-label": "Vorbehalte" }, kopfzeile, h("h2", {}, mein ? (mein.art === "gesund" ? "Du bist gesund" : "Du hast einen Vorbehalt gemeldet") : "Vorbehalte"), h("p", { class: "leise" }, ti.plaetze[s.amZug - 1]?.zustand === "weg" ? `Warten auf ${name(s.amZug)}, die Verbindung ist weg.` : `${name(s.amZug)} meldet gerade.`));
    }
    const moeglich = s.moeglicheVorbehalte;
    const zweiteRunde = s.phase === "vorbehaltArt";
    if (!vorbehaltSchritt.wahl && !zweiteRunde) {
        return h("section", { class: "tisch-panel", "aria-label": "Vorbehalte" }, kopfzeile, h("h2", {}, "Hast du einen Vorbehalt?"), h("div", { class: "raster-2" }, h("button", { class: "knopf haupt", "data-fokus": "gesund", onclick: () => c.aktion({ typ: "vorbehalt", art: "gesund" }) }, "Gesund"), h("button", { class: "knopf", "data-fokus": "vorbehalt", disabled: moeglich.length === 0, onclick: () => { vorbehaltSchritt.wahl = true; app.zeichne(); } }, "Vorbehalt")), h("p", { class: "leise erklaerung", style: "margin: 0" }, "Was für ein Vorbehalt, sagst du erst im nächsten Schritt, wie am echten Tisch."));
    }
    const waehltSelbst = hochzeitKlaerung(ti.profil) === null;
    const solo = moeglich.includes("solo") ? soliErlaubt(ti.profil) : [];
    const soloName = (a) => (["kreuz", "pik", "herz", "karo"].includes(a) ? farbName(a, satz) : SOLONAME[a]);
    return h("section", { class: "tisch-panel", "aria-label": "Vorbehalt wählen" }, h("div", { class: "zeile" }, h("h2", { style: "flex-grow: 1" }, "Welcher Vorbehalt?"), zweiteRunde ? null : h("button", { class: "knopf text", "data-fokus": "doch-gesund", onclick: () => c.aktion({ typ: "vorbehalt", art: "gesund" }) }, "Doch gesund")), moeglich.includes("hochzeit") ? h("div", { class: "zeile" }, h("button", { class: "knopf", "data-fokus": "hochzeit", onclick: () => c.aktion({ typ: "vorbehalt", art: "hochzeit", ...(waehltSelbst ? { klaerung: vorbehaltSchritt.klaerung } : {}) }) }, "Hochzeit"), waehltSelbst ? h("div", { class: "chips", role: "group", "aria-label": "Partner wird" }, ["fremder", "fehl", "trumpf"].map((k) => h("button", {
        class: "wahl", "aria-pressed": String(vorbehaltSchritt.klaerung === k), onclick: () => { vorbehaltSchritt.klaerung = k; app.zeichne(); },
    }, k === "fremder" ? "erster Fremder" : k === "fehl" ? "erster Fehl" : "erster Trumpf"))) : null) : null, moeglich.includes("armut") ? h("button", { class: "knopf", "data-fokus": "armut", onclick: () => c.aktion({ typ: "vorbehalt", art: "armut" }) }, "Armut") : null, solo.length ? h("div", { class: "solo-raster", role: "group", "aria-label": "Solo" }, solo.map((a) => h("button", {
        class: "knopf", "data-fokus": `solo-${a}`, onclick: () => c.aktion({ typ: "vorbehalt", art: "solo", soloart: a }),
    }, soloName(a)))) : null, h("p", { class: "leise erklaerung", style: "margin: 0" }, "Die anderen sehen nur „Vorbehalt“. Wer spielt, entscheidet die Rangfolge: Solo vor Armut vor Hochzeit."));
}
/** Spec 016: Ein Spiel von Hand eintragen. Der Gastgeber wartet mit dem Austeilen, bis es eingetragen oder abgebrochen ist. */
function eintragStarten(app, c, ti) {
    c.eintragBeginnt();
    app.zeigeBlatt(null);
    app.geheZu(`/abend/${ti.sitzungId}/eintragen`);
}
/** Mit KI am Tisch gibt es kein Eintragen: Mit echten Karten spielen nur Menschen. */
const nurMenschen = (ti) => ti.plaetze.every((p) => !p.ki);
/** Spec 016: Der Gastgeber schreibt mit echten Karten weiter; die anderen gehen zum Spielblock. */
function schreiberWeiterPanel(app, ti) {
    return h("section", { class: "tisch-panel klein weiter-echt", "aria-label": "Mit echten Karten weiter" }, h("h2", {}, "Weiter mit echten Karten"), h("p", { style: "margin: 0", role: "status" }, `${ti.gastgeberName} schreibt jetzt mit echten Karten weiter. Den Spielblock siehst du jederzeit.`), h("button", {
        class: "knopf haupt", "data-fokus": "zum-spielblock",
        onclick: async () => { const sid = ti.sitzungId; await schliesseTisch(app); app.geheZu(sid ? `/abend/${sid}` : "/"); },
    }, "Zum Spielblock"));
}
function endePanel(app, s, ti, name) {
    const d = s.ergebnis;
    const ids = ti.plaetze.map((p) => p.spielerId ?? "");
    const nameVon = (id) => name((ids.indexOf(id) + 1));
    const namen = d.gewinner.map(nameVon);
    const aufgezaehlt = namen.length > 1 ? `${namen.slice(0, -1).join(", ")} und ${namen.at(-1)}` : (namen[0] ?? "");
    const meineId = ids[s.ich - 1] ?? "";
    const ich = d.gewinner.includes(meineId);
    const partner = d.gewinner.filter((id) => id !== meineId).map(nameVon);
    const titel = namen.length === 0 ? "Niemand gewinnt"
        : ich ? (partner.length === 0 ? "Du gewinnst" : `Du gewinnst mit ${partner.join(" und ")}`)
            : d.punkte[meineId] !== undefined ? `Du verlierst gegen ${aufgezaehlt}`
                : `${aufgezaehlt} ${namen.length === 1 ? "gewinnt" : "gewinnen"}`;
    let aufschluss = "";
    const r = spielAusRechner({
        nr: d.nr, vorhand: d.vorhand, amTisch: ids, spielart: d.spielart, re: d.re ?? [], augenRe: d.augenRe ?? 0, ansagen: d.ansagen ?? [], bock: d.bock,
        ...(d.soloart ? { soloart: d.soloart } : {}), ...(d.ohneStich ? { ohneStich: d.ohneStich } : {}), ...(d.vorbehalt ? { vorbehalt: d.vorbehalt } : {}),
        sonderpunkte: d.sonderpunkteArten ?? {},
    }, ti.profil);
    if (r.ok)
        aufschluss = aufschluesselung(r.wertung);
    const praemie = Object.entries(d.praemie ?? {}).map(([id, p]) => `Hochzeitsprämie ${nameVon(id)} +${p}`).join(" · ");
    const gastgeber = tisch()?.gastgeber;
    const c = tisch()?.client;
    const traegtEin = ti.eintragVon !== null ? (ti.eintragVon === ti.ich ? "Du trägst gerade ein Spiel ein." : `${name(ti.eintragVon)} trägt ein Spiel ein …`) : null;
    return h("section", { class: "tisch-panel ende", "aria-label": "Spielende" }, h("div", { class: "zeile" }, h("h2", { style: "flex-grow: 1" }, titel), h("strong", {}, `${d.wert} ${d.wert === 1 ? "Punkt" : "Punkte"}`)), h("p", { class: "leise", style: "margin: 0", "data-aufschluesselung": "" }, [`Re ${d.augenRe} Augen`, aufschluss, praemie].filter(Boolean).join(" · ")), h("div", { class: "verteilung" }, ids.map((id) => h("div", {}, h("span", { class: "name" }, id === meineId ? "du" : nameVon(id)), h("span", { class: "wert", "data-ergebnis": nameVon(id) }, punkteText((d.punkte[id] ?? 0) + (d.praemie?.[id] ?? 0), true)), ti.stand ? h("span", { class: "gesamt", "data-gesamt": nameVon(id) }, `gesamt ${punkteText(ti.stand.summen[id] ?? 0, true)}`) : null))), traegtEin ? h("p", { style: "margin: 0", role: "status", "data-eintrag": "" }, traegtEin) : null, 
    // Der Gastgeber muss nicht ewig warten, z. B. wenn jemand die Eingabe verlassen hat.
    gastgeber
        ? h("button", { class: "knopf haupt", "data-fokus": "naechstes", disabled: ti.eintragVon !== null, onclick: () => void gastgeber.naechstesSpiel() }, "Nächstes Spiel")
        : h("p", { class: "leise", style: "margin: 0" }, `${ti.gastgeberName} startet das nächste Spiel.`), 
    // Spec 016: statt eines Live-Spiels (oder nachträglich) ein Spiel mit echten Karten eintragen.
    // Quer ist wenig Höhe: die beiden Nebenaktionen in einer Zeile.
    h("div", { class: "zeile", style: "justify-content: center; flex-wrap: wrap" }, 
    // Der Gastgeber muss nicht ewig warten, z. B. wenn jemand die Eingabe verlassen hat.
    gastgeber && ti.eintragVon !== null && ti.eintragVon !== ti.ich
        ? h("button", { class: "knopf", "data-fokus": "trotzdem", onclick: () => gastgeber.eintragFreigeben() }, "Nicht warten, weiter spielen") : null, c && ti.eintragenMoeglich && ti.eintragVon === null
        ? h("button", { class: "knopf", "data-fokus": "eintragen", onclick: () => eintragStarten(app, c, ti) }, "Spiel eintragen") : null, ti.sitzungId ? h("a", { class: "knopf text", href: `#/abend/${ti.sitzungId}` }, "Spielblock ansehen") : null, 
    // Spec 017: Der natürliche Moment zum Aufhören. Mit Rückfrage, weil es alle betrifft.
    gastgeber && ti.sitzungId ? h("button", { class: "knopf text", "data-fokus": "ende-beenden", onclick: () => { if (nurKi(ti))
            void abendBeenden(app, true);
        else
            app.zeigeBlatt(beendenBlatt(app, false)); } }, nurKi(ti) ? "Üben beenden" : "Abend beenden") : null));
}
// ---------- Wiederverbinden (Spec 012, Mockup „Verbindung weg“) ----------
/** Gemeinsame Frage, wenn ein Platz verwaist ist: Alle Verbliebenen sehen dasselbe, die erste Wahl gilt. */
function fragePanel(c, s, ti, name) {
    const f = ti.frage;
    const w = ti.wahl;
    const weg = name(f.platz);
    return h("section", { class: "tisch-panel schmal", "aria-label": "Entscheidung", "data-frage": f.platz }, h("h2", {}, `${weg} ist weg · ${seit(ti.plaetze[f.platz - 1]?.wegSeit ?? f.seit)}`), w ? [
        h("p", { style: "margin: 0", role: "status" }, `${w.platz === s.ich ? "Du hast" : `${name(w.platz)} hat`} „${WAHL_TEXT[w.wahl]}“ gewählt. Gilt in ${Math.max(0, Math.ceil((w.bis - Date.now()) / 1000))} s.`),
        w.platz === s.ich ? h("button", { class: "knopf", "data-fokus": "zuruecknehmen", onclick: () => c.zuruecknehmen() }, "Zurücknehmen") : null,
    ] : [
        // Spec 013: Die KI ist der Standard (Konzept), die anderen Wege bleiben gleichwertig daneben.
        h("button", { class: "knopf haupt", "data-fokus": "wahl-ki", onclick: () => c.wahl("ki") }, `KI spielt für ${weg}`),
        h("div", { class: "raster-2" }, h("button", { class: "knopf", "data-fokus": "wahl-warten", onclick: () => c.wahl("warten") }, "Weiter warten"), h("button", { class: "knopf", "data-fokus": "wahl-ersatz", onclick: () => c.wahl("ersatz") }, `Ersatz für ${weg}`), h("button", { class: "knopf", "data-fokus": "wahl-neuGeben", onclick: () => c.wahl("neuGeben") }, "Spiel neu geben"), h("button", { class: "knopf", "data-fokus": "wahl-beenden", onclick: () => c.wahl("beenden") }, "Abend beenden")),
        h("p", { class: "leise", style: "margin: 0" }, "Die erste Wahl gilt, 5 s lang zurücknehmbar."),
    ]);
}
/** Stufe 4: Ein neues Gerät möchte an einen Platz. Ein anderer Spieler bestätigt, dass es wirklich dieser Mensch ist. */
function wechselPanel(app, c, platz, name) {
    return h("section", { class: "tisch-panel klein", "aria-label": "Neues Gerät" }, h("h2", {}, `${name(platz)} auf neuem Gerät?`), h("p", { class: "leise", style: "margin: 0" }, `Ein anderes Handy möchte an ${name(platz)}s Platz. Bestätige nur, wenn ${name(platz)} es wirklich in der Hand hat. Das alte Gerät verliert den Platz.`), h("div", { class: "raster-2" }, h("button", { class: "knopf haupt", "data-fokus": "wechsel-ja", onclick: () => c.bestaetige(platz) }, `Ja, das ist ${name(platz)}`), h("button", { class: "knopf", "data-fokus": "wechsel-nein", onclick: () => { wechselVerborgen = platz; app.zeichne(); } }, "Nicht bestätigen")));
}
function beendetPanel(app, ti, unterbrochen) {
    const gastgeber = tisch()?.rolle === "gastgeber";
    return h("section", { class: "tisch-panel", "aria-label": "Abend beendet" }, h("h2", {}, "Abend beendet"), h("p", { class: "leise", style: "margin: 0" }, unterbrochen ? "Alle abgeschlossenen Spiele bleiben gespeichert. Das unterbrochene Spiel zählt nicht." : "Alle Spiele bleiben gespeichert."), gastgeber && ti.sitzungId
        ? h("button", { class: "knopf haupt", "data-fokus": "zur-abrechnung", onclick: async () => { await schliesseTisch(app); app.geheZu(`/abend/${ti.sitzungId}/abrechnung`); } }, "Zur Abrechnung")
        : [h("button", { class: "knopf haupt", "data-fokus": "tisch-verlassen", onclick: async () => { tisch()?.client?.trennen(); await schliesseTisch(app); app.geheZu(ti.sitzungId ? `/abend/${ti.sitzungId}` : "/"); } }, "Zum Spielblock"),
            h("button", { class: "knopf text", "data-fokus": "zur-startseite", onclick: async () => { tisch()?.client?.trennen(); await schliesseTisch(app); app.geheZu("/"); } }, "Zur Startseite")]);
}
/** Spec 012, geplant: an wen der Tisch gehen kann (verbunden, Mensch). */
const uebergabeZiele = (ti) => ti.plaetze.filter((p) => p.platz !== ti.ich && p.zustand === "da" && !p.ki);
/** Spec 017 (UI): die Übergabe gebündelt in einem Blatt, damit das Menü kurz bleibt. */
function uebergabeBlatt(app, ti) {
    return h("div", { class: "gruppe" }, h("div", { class: "blatt-kopf" }, h("h2", {}, "Tisch übergeben"), h("button", { class: "knopf text", onclick: () => app.zeigeBlatt(null) }, "Abbrechen")), h("p", { class: "leise", style: "margin: 0" }, "Das andere Gerät hält dann die Karten. Du spielst normal weiter."), uebergabeZiele(ti).map((p) => h("button", {
        class: "knopf", "data-fokus": `uebergeben-${p.platz}`,
        onclick: async () => {
            app.zeigeBlatt(null);
            const fehler = await uebergeben(app, p.platz);
            if (fehler)
                app.melde(fehler);
            else
                app.geheZu("/tisch");
        },
    }, `An ${p.name} übergeben`)));
}
/** Spec 017: Nur KI an den anderen Plätzen (Gegen die KI üben). */
const nurKi = (ti) => ti.plaetze.every((p) => p.platz === ti.ich || p.ki);
/** Spec 017: Rückfrage, weil „Abend beenden“ alle betrifft. */
function beendenBlatt(app, laeuft) {
    return h("div", { class: "gruppe" }, h("h2", {}, "Abend für alle beenden?"), h("p", { class: "leise", style: "margin: 0" }, laeuft
        ? "Das laufende Spiel zählt nicht. Alle anderen Spiele bleiben gespeichert, danach kommt die Abrechnung."
        : "Alle Spiele bleiben gespeichert, danach kommt die Abrechnung."), h("button", { class: "knopf haupt", "data-fokus": "beenden-ja", onclick: async () => { app.zeigeBlatt(null); await abendBeenden(app); } }, "Beenden"), h("button", { class: "knopf text", onclick: () => app.zeigeBlatt(null) }, "Abbrechen"));
}
/** Spec 017: Stand des Abends über dem Tisch (Summen wie im Spielblock), ohne den Tisch zu verlassen. */
function standBlatt(app, ti) {
    const stand = ti.stand;
    const reihe = ti.plaetze.filter((p) => p.spielerId).map((p) => ({ name: p.platz === ti.ich ? `${p.name ?? ""} (du)` : p.name ?? "", wert: stand?.summen[p.spielerId] ?? 0 }))
        .sort((a, b) => b.wert - a.wert);
    return h("div", { class: "gruppe", "aria-label": "Stand des Abends" }, h("div", { class: "blatt-kopf" }, h("h2", {}, "Stand des Abends"), h("button", { class: "knopf text", onclick: () => app.zeigeBlatt(null) }, "Schließen")), h("p", { class: "leise", style: "margin: 0" }, stand ? `Nach ${stand.spiele} ${stand.spiele === 1 ? "Spiel" : "Spielen"}` : "Noch kein Spiel."), h("div", { class: "stand-liste" }, reihe.map((z) => h("div", { class: "stand-zeile" }, h("span", {}, z.name), h("strong", { "data-stand": z.name }, punkteText(z.wert, true))))), ti.sitzungId ? h("a", { class: "knopf", href: `#/abend/${ti.sitzungId}`, onclick: () => app.zeigeBlatt(null) }, "Ganzer Spielblock") : null);
}
/** Spec 017: den eigenen Namen ändern; der Gastgeber trägt ihn ein. */
export function nameBlatt(app, c, jetzt) {
    let wert = jetzt;
    const speichern = () => { const n = wert.trim(); if (!n)
        return; c.umbenennen(n); app.zeigeBlatt(null); };
    return h("form", { class: "gruppe", onsubmit: (e) => { e.preventDefault(); speichern(); } }, h("h2", {}, "Dein Name"), h("label", { for: "eigener-name" }, "So sehen dich die anderen"), h("input", { id: "eigener-name", type: "text", maxlength: 24, value: jetzt, "data-fokus": "eigener-name", oninput: (e) => { wert = e.target.value; } }), h("button", { class: "knopf haupt", type: "submit" }, "Speichern"), h("button", { class: "knopf text", type: "button", onclick: () => app.zeigeBlatt(null) }, "Abbrechen"));
}
/** Mitspieler ohne Verbindung: letzter Stand bleibt stehen, darüber der Weg zurück (Stufe 3) und, wenn dran, die Übernahme. */
function verbindungWegPanel(app, t, c, ti, name) {
    const gastgeber = ti.gastgeberName || "dem Gastgeber";
    const neu = t.neu;
    let weg;
    if (neu?.tisch && !neu.platz) {
        // Nach einer Übernahme kennt das neue Gastgeber-Gerät die alten Tokens nicht: sich selbst auswählen.
        const ichId = ti.ich ? ti.plaetze[ti.ich - 1]?.spielerId ?? null : null;
        const frei = neu.tisch.plaetze.some((p) => p.spielerId === ichId && (p.zustand === "weg" || p.ki === "fuer"));
        weg = [
            neu.meldung ?? neu.hinweis ? h("p", { style: "margin: 0", role: "status" }, neu.meldung ?? neu.hinweis) : null,
            ichId && frei
                ? h("button", { class: "knopf haupt", "data-fokus": "als-ich", onclick: () => neu.waehle(ichId) }, `Als ${ti.ich ? name(ti.ich) : ""} weiterspielen`)
                : h("p", { class: "leise", style: "margin: 0" }, "Verbunden, warte auf deinen Platz …"),
        ];
    }
    else if (t.antwort) {
        if (qrFuer?.code !== t.antwort.code) {
            const platz = h("div", { class: "qr qr-laedt" }, "QR-Code wird erstellt …");
            const fuer = { code: t.antwort.code, el: platz };
            qrFuer = fuer;
            void qrCode(t.antwort.code, "Dein Antwort-Code").then((el) => { if (qrFuer === fuer) {
                platz.replaceWith(el);
                fuer.el = el;
            } });
        }
        weg = h("div", { class: "zurueck-qr" }, qrFuer.el, h("div", { class: "spalte" }, h("p", { style: "margin: 0" }, `Zeig diesen Code ${gastgeber}. Dort „Antwort scannen“ tippen.`), h("details", {}, h("summary", {}, "Code als Text"), h("textarea", { readonly: true, rows: 2, "aria-label": "Dein Antwort-Code", id: "antwort-code" }, t.antwort.code))));
    }
    else {
        const scanZiel = h("div", { class: "scan-ziel" });
        const feld = h("textarea", { rows: 2, placeholder: "Einladung hier einfügen", "aria-label": "Einladung als Text", id: "rueckkehr-einladung" });
        weg = [
            // Mit Internet und Raum kommt man von selbst zurück (Spec 030); der QR-Weg ist dann nur der Ausweg.
            h("p", { style: "margin: 0" }, ti.raum && navigator.onLine
                ? `Klappt das nicht, holt dich ${gastgeber} per Einladung zurück:`
                : `Bitte ${gastgeber}, dich zurückzuholen. Dann die Einladung scannen, du bekommst deine Karten zurück.`),
            h("button", {
                class: ti.raum && navigator.onLine ? "knopf" : "knopf haupt", "data-fokus": "einladung-scannen",
                onclick: async () => {
                    scannerStopp?.();
                    scannerStopp = await scanne(scanZiel, (text) => { scannerStopp?.(); scannerStopp = null; void zurueckkehren(app, text); }, (m) => app.melde(m));
                },
            }, "Einladung scannen"),
            scanZiel,
            h("details", {}, h("summary", {}, "Einladung als Text (ohne Kamera)"), feld, h("button", { class: "knopf", "data-fokus": "einladung-uebernehmen", onclick: () => void zurueckkehren(app, feld.value) }, "Übernehmen")),
        ];
    }
    const gastgeberWeg = ti.gastgeberPlatz;
    return h("section", { class: "tisch-panel breit", "aria-label": "Verbindung weg", role: "alert" }, h("h2", {}, `Verbindung zum Tisch weg · ${seit(c.wegSeit)}`), 
    // Mit Internet und Raum kommt man von selbst zurück (Spec 030); das steht oben, der QR-Weg darunter ist der Ausweg.
    // Die Zusage gilt nur, solange die Trennung frisch ist; danach ehrlich sagen, dass es hakt (es wird weiter versucht).
    ti.raum && navigator.onLine && (c.wegSeit === null || Date.now() - c.wegSeit < ZUSAGE_MS)
        ? h("p", { style: "margin: 0", role: "status", "data-raum-versuch": "" }, "Du kommst gleich über das Internet von selbst zurück, mit deinen Karten …")
        : ti.raum && navigator.onLine ? h("p", { style: "margin: 0", role: "status", "data-raum-versuch": "haengt" }, "Über das Internet hat es noch nicht geklappt. Es wird weiter versucht.")
            : ti.raum ? h("p", { style: "margin: 0", role: "status", "data-raum-versuch": "offline" }, "Kein Internet. Hol dir unten eine neue Einladung vom Gastgeber.") : null, t.fehler ? h("p", { class: "hinweis fehler", style: "margin: 0" }, t.fehler) : null, weg, darfUebernehmen() ? h("div", { class: "uebernahme" }, h("p", { style: "margin: 0" }, `Ist ${name(gastgeberWeg)}s Handy ganz weg? Dann übernimmt dein Handy den Tisch. Das laufende Spiel wird neu gegeben.`), h("button", {
        class: "knopf", "data-fokus": "tisch-uebernehmen",
        onclick: async () => { await uebernehmen(app, null, ti, false); app.geheZu(`/runde/${ti.rundeId}/am-handy`); },
    }, "Tisch übernehmen")) : null);
}
function menue(app, c, ti) {
    const t = tisch();
    const gastgeber = t?.rolle === "gastgeber";
    const ueben = nurKi(ti);
    const laeuft = !!t?.gastgeber?.spiel && t.gastgeber.spiel.phase !== "ende";
    const meinName = ti.plaetze.find((p) => p.platz === ti.ich)?.name ?? "";
    return h("div", { class: "gruppe" }, h("div", { class: "blatt-kopf" }, h("h2", {}, "Menü"), h("button", { class: "knopf text", "data-fokus": "menue-schliessen", onclick: () => app.zeigeBlatt(null) }, "Schließen")), ti.sitzungId ? h("a", { class: "knopf", href: `#/abend/${ti.sitzungId}`, onclick: () => app.zeigeBlatt(null) }, "Spielblock ansehen") : null, 
    // Spec 017 (UI): Aufhören steht oben, damit es quer ohne Scrollen zu sehen ist (so nennt es die Kurzanleitung).
    gastgeber && ti.sitzungId ? (ueben
        ? h("button", { class: "knopf", "data-fokus": "ueben-beenden", onclick: async () => { app.zeigeBlatt(null); await abendBeenden(app, true); } }, "Üben beenden")
        : h("button", { class: "knopf", "data-fokus": "abend-beenden", onclick: () => app.zeigeBlatt(beendenBlatt(app, laeuft)) }, "Abend beenden …")) : null, 
    // Spec 016: Eintragen geht zwischen zwei Spielen; mitten im Spiel steht, wann es geht.
    nurMenschen(ti) && ti.sitzungId ? h("button", {
        class: "knopf", "data-fokus": "menue-eintragen", disabled: !ti.eintragenMoeglich || (ti.eintragVon !== null && ti.eintragVon !== ti.ich),
        onclick: () => eintragStarten(app, c, ti),
    }, "Spiel eintragen") : null, nurMenschen(ti) && ti.sitzungId && !ti.eintragenMoeglich ? h("p", { class: "leise", style: "margin: 0" }, "Eintragen geht nach diesem Spiel.") : null, gastgeber && nurMenschen(ti) && ti.eintragenMoeglich ? h("button", {
        class: "knopf", "data-fokus": "echte-karten",
        onclick: async () => { app.zeigeBlatt(null); const f = await mitEchtenKartenWeiter(app); if (f)
            app.melde(f); },
    }, "Mit echten Karten weiter") : null, h("a", { class: "knopf", href: "#/einstellungen", onclick: () => app.zeigeBlatt(null) }, "Kartensatz ändern"), ti.ich && !ueben ? h("button", { class: "knopf", "data-fokus": "name-aendern", onclick: () => app.zeigeBlatt(nameBlatt(app, c, meinName)) }, "Name ändern") : null, gastgeber && !ueben ? h("a", { class: "knopf", href: `#/runde/${ti.rundeId}/am-handy`, onclick: () => app.zeigeBlatt(null) }, "Mitspieler neu einladen") : null, 
    // Spec 012, geplant: zwischen zwei Spielen an ein verbundenes Gerät übergeben.
    gastgeber && (!t?.gastgeber?.spiel || t.gastgeber.spiel.phase === "ende") && uebergabeZiele(ti).length > 0
        ? h("button", { class: "knopf", "data-fokus": "uebergeben", onclick: () => app.zeigeBlatt(uebergabeBlatt(app, ti)) }, "Tisch übergeben …") : null, !gastgeber ? h("button", { class: "knopf", onclick: async () => { app.zeigeBlatt(null); c.trennen(); await schliesseTisch(app); app.geheZu("/"); } }, "Tisch verlassen") : null);
}
//# sourceMappingURL=spieltisch.js.map