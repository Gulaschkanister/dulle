// Wertung nach DDV-Turnierspielregeln 7.1 (Gewinnstufen) und 7.2 (Spielwerte), Spec 002.
// Reine Funktion. Regeln und Quellen: .claude/skills/doppelkopf-regeln/grundregeln.md
import { hochzeitPraemie, soloFaktor } from "./profile.js";
const ABSAGEN = ["k90", "k60", "k30", "schwarz"];
const ABSAGE_TEXT = { k90: "keine 90", k60: "keine 60", k30: "keine 30", schwarz: "schwarz" };
const GEGNER = { re: "kontra", kontra: "re" };
const SONDERPUNKT_TEXT = { fuchs: "Fuchs", doppelkopf: "Doppelkopf", karlchen: "Karlchen" };
function hoechsteAbsage(ansagen, p) {
    return Math.max(0, ...ansagen.filter((a) => a.partei === p).map((a) => ABSAGEN.indexOf(a.stufe) + 1));
}
function hatAngesagt(ansagen, p) {
    return ansagen.some((a) => a.partei === p);
}
function ziel(ansagen, p) {
    const eigene = hoechsteAbsage(ansagen, p);
    if (eigene > 0)
        return [151, 181, 211, "alle"][eigene - 1];
    const gegner = hoechsteAbsage(ansagen, GEGNER[p]);
    if (gegner > 0)
        return [90, 60, 30, "einStich"][gegner - 1];
    const nurKontra = hatAngesagt(ansagen, "kontra") && !hatAngesagt(ansagen, "re");
    if (p === "re")
        return nurKontra ? 120 : 121;
    return nurKontra ? 121 : 120;
}
export function werte(e, profil) {
    const augen = { re: e.augenRe, kontra: 240 - e.augenRe };
    const ohneStich = (p) => (e.ohneStich !== undefined ? e.ohneStich === p : augen[p] === 0);
    const erreicht = (p) => {
        const z = ziel(e.ansagen, p);
        if (z === "alle")
            return ohneStich(GEGNER[p]);
        if (z === "einStich")
            return !ohneStich(p);
        return augen[p] >= z;
    };
    const gewinner = erreicht("re") ? "re" : erreicht("kontra") ? "kontra" : "keiner";
    const posten = [];
    const dazu = (text, partei, punkte = 1) => { if (punkte !== 0)
        posten.push({ text, partei, punkte }); };
    // (a) Gewonnen und „unter …“ für die Partei, deren Gegner unter der Stufe blieb
    const unterPunkte = (p) => {
        const g = GEGNER[p];
        if (augen[g] < 90)
            dazu("unter 90", p);
        if (augen[g] < 60)
            dazu("unter 60", p);
        if (augen[g] < 30)
            dazu("unter 30", p);
        if (ohneStich(g))
            dazu("schwarz", p);
    };
    // (e, f) Gegen eine Absage des Gegners erreichte Stufen
    const gegenAbsagePunkte = (p) => {
        const gegnerAbsage = hoechsteAbsage(e.ansagen, GEGNER[p]);
        const stufen = [[1, 120, "120 gegen keine 90"], [2, 90, "90 gegen keine 60"], [3, 60, "60 gegen keine 30"], [4, 30, "30 gegen schwarz"]];
        for (const [stufe, grenze, text] of stufen) {
            if (gegnerAbsage >= stufe && typeof grenze === "number" && augen[p] >= grenze)
                dazu(text, p);
        }
    };
    if (gewinner === "keiner") {
        // DDV 7.1.3: niemand gewinnt; nur (a) „unter …“, (e/f) und Sonderpunkte. Auslegung mit der Runde zu bestätigen.
        for (const p of ["re", "kontra"]) {
            unterPunkte(p);
            gegenAbsagePunkte(p);
        }
    }
    else {
        const w = gewinner;
        dazu("Gewonnen", w);
        unterPunkte(w);
        // (b) Ansagen, (c, d) Absagen beider Parteien – alles für den Gewinner
        if (hatAngesagt(e.ansagen, "re"))
            dazu("Re angesagt", w, 2);
        if (hatAngesagt(e.ansagen, "kontra"))
            dazu("Kontra angesagt", w, 2);
        for (const p of ["re", "kontra"]) {
            const h = hoechsteAbsage(e.ansagen, p);
            for (let i = 0; i < h; i++)
                dazu(`${ABSAGE_TEXT[ABSAGEN[i]]} abgesagt`, w);
        }
        gegenAbsagePunkte(w);
    }
    // Sonderpunkte (7.2.3): nur Normalspiel bzw. Hochzeit mit Partner, nicht im Solo (7.2.4)
    if (!e.einzel) {
        const erlaubt = new Set(Array.isArray(profil.schalter["sonderpunkte"]) ? profil.schalter["sonderpunkte"] : ["gegenDieAlten", "doppelkopf", "fuchs", "karlchen"]);
        for (const art of ["fuchs", "doppelkopf", "karlchen"]) {
            if (!erlaubt.has(art))
                continue;
            const anzahl = e.sonderpunkte?.[art];
            if (anzahl) {
                dazu(SONDERPUNKT_TEXT[art], "re", anzahl.re);
                dazu(SONDERPUNKT_TEXT[art], "kontra", anzahl.kontra);
            }
        }
        if (gewinner === "kontra" && erlaubt.has("gegenDieAlten"))
            dazu("gegen die Alten", "kontra");
    }
    const summe = (p) => posten.filter((x) => x.partei === p).reduce((a, x) => a + x.punkte, 0);
    return { gewinner, spielwert: summe("re") - summe("kontra"), posten };
}
/** Aufschlüsselung als Text, aus Sicht der Partei mit den meisten Punkten. */
export function aufschluesselung(w) {
    const sicht = w.gewinner === "keiner" ? (w.spielwert >= 0 ? "re" : "kontra") : w.gewinner;
    return w.posten
        .map((p) => (p.partei === sicht ? `${p.text} ${p.punkte}` : `${p.text} (${p.partei === "re" ? "Re" : "Kontra"}) −${p.punkte}`))
        .join(" · ");
}
/** Baut die Spieldaten für `spielEingetragen` aus einer Rechner-Eingabe. */
export function spielAusRechner(s, profil) {
    const einzel = s.spielart === "solo" || s.spielart === "stillesSolo" || (s.spielart === "hochzeit" && s.re.length === 1);
    if (s.amTisch.length !== 4)
        return { ok: false, fehlt: "Es müssen vier Spieler am Tisch sitzen." };
    if (einzel ? s.re.length !== 1 : s.re.length !== 2) {
        return { ok: false, fehlt: s.spielart === "solo" || s.spielart === "stillesSolo" ? "Wähle, wer Solo gespielt hat." : "Wähle die zwei Re-Spieler." };
    }
    if (!Number.isInteger(s.augenRe) || s.augenRe < 0 || s.augenRe > 240)
        return { ok: false, fehlt: "Augen Re zwischen 0 und 240 eingeben." };
    const wertung = werte({
        spielart: s.spielart, einzel, augenRe: s.augenRe, ansagen: s.ansagen, bock: s.bock,
        ...(s.ohneStich ? { ohneStich: s.ohneStich } : {}),
        ...(s.sonderpunkte ? { sonderpunkte: s.sonderpunkte } : {}),
    }, profil);
    const kontra = s.amTisch.filter((x) => !s.re.includes(x));
    const faktor = einzel ? soloFaktor(profil) : 1;
    const punkte = {};
    for (const id of s.amTisch) {
        const istRe = s.re.includes(id);
        const wert = wertung.spielwert * s.bock * (istRe ? faktor : 1);
        punkte[id] = istRe ? wert : -wertung.spielwert * s.bock;
        if (Object.is(punkte[id], -0))
            punkte[id] = 0;
    }
    const sp = { re: 0, kontra: 0 };
    for (const p of wertung.posten)
        if (["Fuchs", "Doppelkopf", "Karlchen", "gegen die Alten"].includes(p.text))
            sp[p.partei] += p.punkte;
    const daten = {
        nr: s.nr, vorhand: s.vorhand, eingabe: "rechner", spielart: s.spielart,
        re: [...s.re],
        gewinner: wertung.gewinner === "re" ? [...s.re] : wertung.gewinner === "kontra" ? kontra : [],
        wert: Math.abs(wertung.spielwert), bock: s.bock, augenRe: s.augenRe, ansagen: [...s.ansagen],
        sonderpunkte: sp, punkte,
    };
    if (s.soloart)
        daten.soloart = s.soloart;
    if (s.ohneStich)
        daten.ohneStich = s.ohneStich;
    if (s.sonderpunkte && !einzel)
        daten.sonderpunkteArten = s.sonderpunkte;
    if (s.vorbehalt)
        daten.vorbehalt = s.vorbehalt;
    // Spec 007: Der Hochzeiter (zuerst gewählt) bekommt die Prämie, auch ohne Partner. Ohne Bock und Solofaktor.
    const praemie = hochzeitPraemie(profil);
    if (s.spielart === "hochzeit" && praemie && s.re[0])
        daten.praemie = { [s.re[0]]: praemie };
    return { ok: true, daten, wertung };
}
//# sourceMappingURL=wertung.js.map