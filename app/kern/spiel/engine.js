// Spielengine (Spec 008, 014): ein Spiel als reine Zustandsmaschine. Kennt alle Karten; nach außen geht nur sichtFuer().
// Regeln und Quellen: .claude/skills/doppelkopf-regeln/grundregeln.md, varianten.md. Kein DOM, kein Netz.
import { ansagenErlaubt, armutErlaubt, armutRegel, hochzeitKlaerung, mitNeunen, neuMischenAbKoenigen, schweinchenAn, soliErlaubt, soloAufspiel, zweiteDulle, } from "../profile.js";
import { spielAusRechner } from "../wertung.js";
import { augen, karte, kartensatz, mische, teile } from "./karten.js";
import { erlaubteKarten, istTrumpf, sortiereHand, stichGewinner, trumpfZahl } from "./stich.js";
export const STUFEN = ["ansage", "k90", "k60", "k30", "schwarz"];
/** Mindestzahl Karten in der Hand je Stufe, mit Neunen (DDV 6.4). */
const GRENZE_MIT_NEUNEN = [11, 10, 9, 8, 7];
const naechster = (p) => ((p % 4) + 1);
const PLAETZE = [1, 2, 3, 4];
const ohneKopie = (id) => id.slice(0, id.lastIndexOf("-"));
const hatBeideAlten = (hand) => hand.filter((k) => ohneKopie(k) === "kreuz-D").length === 2;
const RANG = { solo: 3, armut: 2, hochzeit: 1 };
/** Reihenfolge ab der Vorhand. */
const abVorhand = (v) => [v, naechster(v), naechster(naechster(v)), naechster(naechster(naechster(v)))];
/** Was gerade Trumpf ist. */
export function kontext(s) {
    if (s.typ === "solo")
        return { trumpf: s.soloart };
    return { trumpf: "normal", schweinchen: s.schweinchen !== null };
}
// ---------- Beginn ----------
export function neuesSpiel(profil, plaetze, vorhand, seed, spielNr) {
    if (plaetze.length !== 4)
        throw new Error("Es braucht genau vier Plätze.");
    const haende = teile(mische(kartensatz(mitNeunen(profil)), seed));
    const spiel = {
        spielNr, profil, plaetze: [...plaetze], vorhand, seed, startHaende: haende.map((h) => [...h]), haende,
        phase: "vorbehalt", amZug: vorhand, meldungen: [null, null, null, null], typ: "normal",
        hauptspieler: null, soloart: null, klaerung: null, partner: null, allein: false, klaerungsStich: null,
        armut: null, schweinchen: null, stich: [], stiche: [], ansagen: [], ergebnis: null,
    };
    const ereignisse = [{ typ: "kartenGegeben", daten: { spielNr, vorhand } }];
    // Neu mischen bei z. B. 5 Königen: automatisch, ohne Entscheidung, Vorhand bleibt (Spec 008, Simon 2026-10-22).
    const grenze = neuMischenAbKoenigen(profil);
    if (grenze !== null && haende.some((h) => h.filter((k) => karte(k).wert === "K").length >= grenze)) {
        spiel.phase = "neuGemischt";
        ereignisse.push({ typ: "spielNeuGegeben", daten: { nr: spielNr, grund: `${grenze} Könige` } });
    }
    return { spiel, ereignisse };
}
// ---------- Parteien ----------
/** Wahre Partei eines Platzes (Engine-Wissen). null = noch offen (Hochzeit vor der Klärung, Armut vor dem Tausch). */
export function partei(s, platz) {
    switch (s.typ) {
        case "normal": return s.startHaende[platz - 1].some((k) => ohneKopie(k) === "kreuz-D") ? "re" : "kontra";
        case "stilleHochzeit":
        case "solo": return platz === s.hauptspieler ? "re" : "kontra";
        case "armut":
            if (s.partner === null)
                return platz === s.hauptspieler ? "re" : null;
            return platz === s.hauptspieler || platz === s.partner ? "re" : "kontra";
        case "hochzeit":
            if (platz === s.hauptspieler)
                return "re";
            if (s.partner !== null)
                return platz === s.partner ? "re" : "kontra";
            return s.allein ? "kontra" : null;
    }
}
function rePlaetze(s) {
    const re = PLAETZE.filter((p) => partei(s, p) === "re");
    // Hochzeiter bzw. Armer stehen vorn: Der Hochzeiter bekommt die Prämie (Spec 007).
    return s.hauptspieler ? [s.hauptspieler, ...re.filter((p) => p !== s.hauptspieler)] : re;
}
// ---------- Ansagen ----------
function grenze(s, stufe) {
    let g = GRENZE_MIT_NEUNEN[stufe] - (mitNeunen(s.profil) ? 0 : 2);
    // Hochzeit (6.4.2): Klärung im 2. bzw. 3. Stich senkt alle Grenzen um 1 bzw. 2. Allein zählt wie Klärung im 3. Stich.
    if (s.typ === "hochzeit" && s.klaerungsStich)
        g -= s.klaerungsStich - 1;
    return g;
}
function hoechsteStufe(s, p) {
    return Math.max(-1, ...s.ansagen.filter((a) => a.partei === p).map((a) => STUFEN.indexOf(a.stufe)));
}
/** Welche Stufen darf dieser Platz jetzt ansagen? Übersprungene Stufen müssen selbst noch zulässig sein (6.4.3). */
export function erlaubteAnsagen(s, platz) {
    if (s.phase !== "spiel" || !ansagenErlaubt(s.profil))
        return [];
    const p = partei(s, platz);
    if (!p)
        return []; // Spieltyp steht noch nicht fest (Hochzeit vor der Klärung)
    const karten = s.haende[platz - 1].length;
    const eigene = hoechsteStufe(s, p);
    const gegner = hoechsteStufe(s, p === "re" ? "kontra" : "re");
    const erlaubt = [];
    for (let ziel = eigene + 1; ziel < STUFEN.length; ziel++) {
        let ok = true;
        for (let t = eigene + 1; t <= ziel; t++)
            if (karten < grenze(s, t))
                ok = false;
        // Erwiderung (6.4.4): Re bzw. Kontra noch mit einer Karte weniger als für die gegnerische An- oder Absage nötig.
        if (!ok && ziel === 0 && gegner >= 0 && karten >= grenze(s, gegner) - 1)
            ok = true;
        if (ok)
            erlaubt.push(STUFEN[ziel]);
    }
    return erlaubt;
}
// ---------- Vorbehalte ----------
/** Welche Vorbehalte darf dieser Platz anmelden? */
export function moeglicheVorbehalte(s, platz) {
    const hand = s.haende[platz - 1];
    const arten = [];
    if (soliErlaubt(s.profil).length > 0)
        arten.push("solo");
    const { grenze: g, fuechse } = armutRegel(s.profil);
    if (armutErlaubt(s.profil) && trumpfZahl(hand, fuechse) <= g)
        arten.push("armut");
    if (hatBeideAlten(hand))
        arten.push("hochzeit");
    return arten;
}
function pruefeVorbehalt(s, platz, a) {
    if (a.art === "gesund" || a.art === "vorbehalt")
        return "intern";
    if (!moeglicheVorbehalte(s, platz).includes(a.art)) {
        return a.art === "hochzeit" ? "Hochzeit geht nur mit beiden Kreuz-Damen." : a.art === "armut" ? "Für eine Armut hast du zu viel Trumpf." : "Ein Solo ist in diesen Regeln aus.";
    }
    if (a.art === "hochzeit")
        return { art: "hochzeit", klaerung: hochzeitKlaerung(s.profil) ?? a.klaerung ?? "fehl" };
    if (a.art === "solo") {
        if (!a.soloart || !soliErlaubt(s.profil).includes(a.soloart))
            return "Diese Soloart ist in diesen Regeln nicht dabei.";
        return { art: "solo", soloart: a.soloart };
    }
    return { art: "armut" };
}
function vorbehaltEreignis(nr, platz, m) {
    if (m.art === "gesund")
        return { typ: "vorbehalt", daten: { spielNr: nr, platz, art: "gesund" } };
    const v = m.welcher;
    if (!v)
        return { typ: "vorbehalt", daten: { spielNr: nr, platz, art: "vorbehalt" } };
    return { typ: "vorbehalt", daten: { spielNr: nr, platz, ...v } };
}
/** Nach allen Meldungen: höchster Vorbehalt gewinnt, bei gleichem Rang der weiter vorn Sitzende (Spec 014). */
function entscheideVorbehalte(s) {
    let sieger = null;
    for (const p of abVorhand(s.vorhand)) {
        const m = s.meldungen[p - 1];
        if (m?.art === "vorbehalt" && m.welcher && (!sieger || RANG[m.welcher.art] > RANG[sieger.v.art]))
            sieger = { platz: p, v: m.welcher };
    }
    s.amZug = s.vorhand;
    s.phase = "spiel";
    if (sieger?.v.art === "solo") {
        s.typ = "solo";
        s.hauptspieler = sieger.platz;
        s.soloart = sieger.v.soloart;
        if (soloAufspiel(s.profil) === "solist")
            s.amZug = sieger.platz;
    }
    else if (sieger?.v.art === "armut") {
        s.typ = "armut";
        s.hauptspieler = sieger.platz;
        const hand = s.haende[sieger.platz - 1];
        const abgegeben = hand.filter((k) => istTrumpf(k));
        s.haende[sieger.platz - 1] = hand.filter((k) => !istTrumpf(k));
        s.armut = { abgegeben, zurueck: [], gefragt: [] };
        s.phase = "armutAngebot";
        s.amZug = naechster(sieger.platz);
    }
    else if (sieger?.v.art === "hochzeit") {
        s.typ = "hochzeit";
        s.hauptspieler = sieger.platz;
        s.klaerung = sieger.v.klaerung;
    }
    else {
        const stille = PLAETZE.find((p) => hatBeideAlten(s.haende[p - 1]));
        if (stille) {
            // Stille Hochzeit (4.4.5): allein gegen drei, gewertet wie ein Karo-Solo. Öffentlich wirkt es wie ein Normalspiel.
            s.typ = "stilleHochzeit";
            s.hauptspieler = stille;
        }
    }
    if (s.phase === "spiel")
        setzeSchweinchen(s);
}
/** Schweinchen (Spec 014): beide Füchse in einer Hand, nicht im Solo. Bei Armut zählt die Hand nach dem Tausch. */
function setzeSchweinchen(s) {
    if (!schweinchenAn(s.profil) || s.typ === "solo" || s.typ === "stilleHochzeit")
        return;
    const p = PLAETZE.find((x) => s.haende[x - 1].filter((k) => ohneKopie(k) === "karo-A").length === 2);
    s.schweinchen = p ?? null;
}
// ---------- Züge ----------
export function fuehreAus(alt, aktion) {
    if (alt.phase === "ende" || alt.phase === "neuGemischt")
        return { ok: false, grund: "Das Spiel ist vorbei." };
    const s = structuredClone(alt);
    const ereignisse = [];
    const nr = s.spielNr;
    if (aktion.typ === "vorbehalt") {
        if (s.phase !== "vorbehalt" && s.phase !== "vorbehaltArt")
            return { ok: false, grund: "Vorbehalte sind schon abgefragt." };
        if (aktion.platz !== s.amZug)
            return { ok: false, grund: "Du bist noch nicht an der Reihe." };
        const geprueft = pruefeVorbehalt(s, aktion.platz, aktion);
        if (typeof geprueft === "string" && geprueft !== "intern")
            return { ok: false, grund: geprueft };
        const welcher = typeof geprueft === "string" ? null : geprueft;
        if (s.phase === "vorbehalt") {
            // Erste Runde: gesund, Vorbehalt, oder gleich mit Art (öffentlich bleibt es „Vorbehalt“).
            const m = aktion.art === "gesund" ? { art: "gesund" } : { art: "vorbehalt", welcher };
            s.meldungen[aktion.platz - 1] = m;
            ereignisse.push(vorbehaltEreignis(nr, aktion.platz, m));
        }
        else {
            if (!welcher)
                return { ok: false, grund: "Bitte sag, welchen Vorbehalt du hast." };
            s.meldungen[aktion.platz - 1] = { art: "vorbehalt", welcher };
            ereignisse.push(vorbehaltEreignis(nr, aktion.platz, { art: "vorbehalt", welcher }));
        }
        // Nächster: in Runde 1 reihum; in Runde 2 der nächste mit „Vorbehalt“ ohne Art.
        const offen = abVorhand(s.vorhand).filter((p) => s.meldungen[p - 1] === null);
        const ohneArt = abVorhand(s.vorhand).filter((p) => { const m = s.meldungen[p - 1]; return m?.art === "vorbehalt" && !m.welcher; });
        if (offen.length > 0)
            s.amZug = offen[0];
        else if (ohneArt.length > 0) {
            s.phase = "vorbehaltArt";
            s.amZug = ohneArt[0];
        }
        else
            entscheideVorbehalte(s);
        return { ok: true, spiel: s, ereignisse };
    }
    if (aktion.typ === "armut") {
        if (s.phase !== "armutAngebot")
            return { ok: false, grund: "Es wird gerade keine Armut angeboten." };
        if (aktion.platz !== s.amZug)
            return { ok: false, grund: "Du bist noch nicht an der Reihe." };
        const a = s.armut;
        a.gefragt.push(aktion.platz);
        ereignisse.push({ typ: "armutAntwort", daten: { spielNr: nr, platz: aktion.platz, nimmt: aktion.nimmt } });
        if (aktion.nimmt) {
            s.partner = aktion.platz;
            s.haende[aktion.platz - 1] = [...s.haende[aktion.platz - 1], ...a.abgegeben];
            s.phase = "armutRueckgabe";
        }
        else if (a.gefragt.length === 3) {
            // Niemand nimmt: automatisch neu mischen, die Vorhand bleibt (Annahme Spec 014).
            s.phase = "neuGemischt";
            ereignisse.push({ typ: "spielNeuGegeben", daten: { nr, grund: "Armut nicht angenommen" } });
        }
        else {
            s.amZug = naechster(aktion.platz);
        }
        return { ok: true, spiel: s, ereignisse };
    }
    if (aktion.typ === "rueckgabe") {
        if (s.phase !== "armutRueckgabe")
            return { ok: false, grund: "Jetzt wird nichts zurückgegeben." };
        if (aktion.platz !== s.partner)
            return { ok: false, grund: "Nur wer die Armut genommen hat, gibt zurück." };
        const a = s.armut;
        const hand = s.haende[aktion.platz - 1];
        if (aktion.karten.length !== a.abgegeben.length)
            return { ok: false, grund: `Gib genau ${a.abgegeben.length} Karten zurück.` };
        if (new Set(aktion.karten).size !== aktion.karten.length || !aktion.karten.every((k) => hand.includes(k)))
            return { ok: false, grund: "Diese Karten hast du nicht." };
        s.haende[aktion.platz - 1] = hand.filter((k) => !aktion.karten.includes(k));
        s.haende[s.hauptspieler - 1] = [...s.haende[s.hauptspieler - 1], ...aktion.karten];
        a.zurueck = [...aktion.karten];
        ereignisse.push({ typ: "armutGetauscht", daten: { spielNr: nr, armer: s.hauptspieler, partner: aktion.platz, anzahl: a.abgegeben.length } });
        s.phase = "spiel";
        s.amZug = s.vorhand;
        setzeSchweinchen(s);
        return { ok: true, spiel: s, ereignisse };
    }
    if (s.phase !== "spiel")
        return { ok: false, grund: "Erst die Vorbehalte klären." };
    if (aktion.typ === "ansage") {
        if (!erlaubteAnsagen(s, aktion.platz).includes(aktion.stufe))
            return { ok: false, grund: "Diese Ansage ist jetzt nicht erlaubt." };
        const p = partei(s, aktion.platz);
        const bis = STUFEN.indexOf(aktion.stufe);
        for (let t = hoechsteStufe(s, p) + 1; t <= bis; t++)
            s.ansagen.push({ platz: aktion.platz, partei: p, stufe: STUFEN[t] });
        ereignisse.push({ typ: "angesagt", daten: { spielNr: nr, platz: aktion.platz, stufe: aktion.stufe, kartenInHand: s.haende[aktion.platz - 1].length } });
        return { ok: true, spiel: s, ereignisse };
    }
    // Karte spielen
    const k = kontext(s);
    if (aktion.platz !== s.amZug)
        return { ok: false, grund: "Du bist nicht am Zug." };
    const hand = s.haende[aktion.platz - 1];
    if (!hand.includes(aktion.karte))
        return { ok: false, grund: "Diese Karte hast du nicht." };
    if (!erlaubteKarten(hand, s.stich.map((g) => g.karte), k).includes(aktion.karte))
        return { ok: false, grund: "Du musst bedienen." };
    s.haende[aktion.platz - 1] = hand.filter((x) => x !== aktion.karte);
    s.stich.push({ platz: aktion.platz, karte: aktion.karte });
    ereignisse.push({ typ: "karteGespielt", daten: { spielNr: nr, platz: aktion.platz, karte: aktion.karte, stich: s.stiche.length + 1, position: s.stich.length } });
    if (s.stich.length < 4) {
        s.amZug = naechster(s.amZug);
        return { ok: true, spiel: s, ereignisse };
    }
    const letzter = s.haende.every((h) => h.length === 0);
    const gewinner = s.stich[stichGewinner(s.stich.map((g) => g.karte), zweiteDulle(s.profil), letzter, k)].platz;
    const fertig = { karten: s.stich, gewinner, augen: s.stich.reduce((a, g) => a + augen(g.karte), 0) };
    s.stiche.push(fertig);
    s.stich = [];
    s.amZug = gewinner;
    ereignisse.push({ typ: "stichGewonnen", daten: { spielNr: nr, stich: s.stiche.length, platz: gewinner, augen: fertig.augen } });
    klaereHochzeit(s, fertig);
    if (letzter) {
        s.phase = "ende";
        s.ergebnis = werteSpiel(s);
        ereignisse.push({ typ: "spielBeendet", daten: s.ergebnis });
    }
    return { ok: true, spiel: s, ereignisse };
}
/** Hochzeit: Klärung nach der gewählten Art, nur in den ersten drei Stichen (4.4.3, pagat Variationen). */
function klaereHochzeit(s, st) {
    if (s.typ !== "hochzeit" || s.partner !== null || s.allein)
        return;
    const trumpfAusgespielt = istTrumpf(st.karten[0].karte, kontext(s));
    const passt = s.klaerung === "fremder" || (s.klaerung === "fehl" && !trumpfAusgespielt) || (s.klaerung === "trumpf" && trumpfAusgespielt);
    if (passt && st.gewinner !== s.hauptspieler) {
        s.partner = st.gewinner;
        s.klaerungsStich = s.stiche.length;
    }
    else if (s.stiche.length >= 3) {
        s.allein = true;
        s.klaerungsStich = 3;
    }
}
// ---------- Ende und Wertung ----------
function werteSpiel(s) {
    const re = rePlaetze(s);
    const istRe = (p) => re.includes(p);
    const augenRe = s.stiche.filter((st) => istRe(st.gewinner)).reduce((a, st) => a + st.augen, 0);
    const reStiche = s.stiche.filter((st) => istRe(st.gewinner)).length;
    const ohneStich = reStiche === 0 ? "re" : reStiche === s.stiche.length ? "kontra" : undefined;
    // Sonderpunkte aus den Stichen (7.2.3). Im Solo wertet werte() sie nicht.
    const sp = { fuchs: { re: 0, kontra: 0 }, doppelkopf: { re: 0, kontra: 0 }, karlchen: { re: 0, kontra: 0 } };
    const seite = (p) => (istRe(p) ? "re" : "kontra");
    s.stiche.forEach((st, i) => {
        const sieger = seite(st.gewinner);
        for (const g of st.karten)
            if (ohneKopie(g.karte) === "karo-A" && seite(g.platz) !== sieger)
                sp.fuchs[sieger]++;
        if (st.augen >= 40)
            sp.doppelkopf[sieger]++;
        if (i === s.stiche.length - 1 && ohneKopie(st.karten.find((g) => g.platz === st.gewinner).karte) === "kreuz-B")
            sp.karlchen[sieger]++;
    });
    const spielart = s.typ === "stilleHochzeit" || s.typ === "solo" ? "solo" : s.typ === "armut" ? "normal" : s.typ;
    const soloart = s.typ === "stilleHochzeit" ? "stilleHochzeit" : s.typ === "solo" ? s.soloart : null;
    const ansagen = s.ansagen.map((a) => ({ partei: a.partei, stufe: a.stufe }));
    const r = spielAusRechner({
        nr: s.spielNr, vorhand: s.vorhand, amTisch: s.plaetze, bock: 1, spielart,
        ...(soloart ? { soloart } : {}), ...(s.typ === "armut" ? { vorbehalt: "armut" } : {}),
        re: re.map((p) => s.plaetze[p - 1]), augenRe, ansagen, sonderpunkte: sp,
        ...(ohneStich ? { ohneStich } : {}),
    }, s.profil);
    if (!r.ok)
        throw new Error(`Wertung unmöglich: ${r.fehlt}`);
    return { ...r.daten, eingabe: "direkt" };
}
/** Nach Spielende oder Neu-Mischen: alle Hände, der Seed und ein Armut-Tausch, damit jeder nachprüfen kann. */
export function offenlegen(s) {
    if (s.phase !== "ende" && s.phase !== "neuGemischt")
        return null;
    return {
        typ: "spielOffengelegt",
        daten: {
            spielNr: s.spielNr, haende: Object.fromEntries(PLAETZE.map((p) => [p, s.startHaende[p - 1]])), seed: s.seed,
            ...(s.armut && s.partner ? { getauscht: { abgegeben: s.armut.abgegeben, zurueck: s.armut.zurueck } } : {}),
        },
    };
}
export function sichtFuer(s, ich) {
    const k = kontext(s);
    const stilleFuerMich = s.typ === "stilleHochzeit" && s.hauptspieler === ich;
    const spieltyp = s.typ === "stilleHochzeit" && !stilleFuerMich ? "normal" : s.typ;
    const eigenePartei = s.typ === "normal" || (s.typ === "stilleHochzeit" && !stilleFuerMich)
        ? (s.startHaende[ich - 1].some((x) => ohneKopie(x) === "kreuz-D") ? "re" : "kontra")
        : s.phase === "vorbehalt" || s.phase === "vorbehaltArt" ? null : partei(s, ich);
    const entschieden = s.phase !== "vorbehalt" && s.phase !== "vorbehaltArt";
    const vorbehalte = {};
    for (const p of PLAETZE) {
        const m = s.meldungen[p - 1];
        if (!m)
            continue;
        if (m.art === "gesund")
            vorbehalte[p] = { art: "gesund" };
        else if (p === ich || (entschieden && p === s.hauptspieler && s.typ !== "stilleHochzeit"))
            vorbehalte[p] = m.welcher ? structuredClone(m.welcher) : { art: "vorbehalt" };
        else
            vorbehalte[p] = { art: "vorbehalt" };
    }
    const gespielt = [...s.stiche.flatMap((st) => st.karten), ...s.stich];
    const schweinchenOffen = s.schweinchen !== null && (s.schweinchen === ich || gespielt.some((g) => g.platz === s.schweinchen && ohneKopie(g.karte) === "karo-A"));
    const a = s.armut;
    return {
        spielNr: s.spielNr, phase: s.phase, ich, vorhand: s.vorhand, amZug: s.amZug,
        hand: sortiereHand(s.haende[ich - 1], k),
        erlaubteKarten: s.phase === "spiel" && s.amZug === ich ? sortiereHand(erlaubteKarten(s.haende[ich - 1], s.stich.map((g) => g.karte), k), k) : [],
        erlaubteAnsagen: erlaubteAnsagen(s, ich),
        moeglicheVorbehalte: (s.phase === "vorbehalt" || s.phase === "vorbehaltArt") && s.amZug === ich ? moeglicheVorbehalte(s, ich) : [],
        kartenzahl: { 1: s.haende[0].length, 2: s.haende[1].length, 3: s.haende[2].length, 4: s.haende[3].length },
        stich: structuredClone(s.stich),
        stiche: structuredClone(s.stiche),
        ansagen: structuredClone(s.ansagen),
        vorbehalte,
        spieltyp,
        hochzeit: s.typ === "hochzeit" ? { hochzeiter: s.hauptspieler, klaerung: s.klaerung, partner: s.partner, allein: s.allein } : null,
        solo: s.typ === "solo" ? { solist: s.hauptspieler, soloart: s.soloart } : null,
        armut: a ? {
            armer: s.hauptspieler, partner: s.partner, anzahl: a.abgegeben.length, gefragt: [...a.gefragt],
            // Abgegebene Trümpfe und Rückgabe sieht nur der Arme; der Partner hat die Trümpfe ohnehin in der Hand.
            ...(ich === s.hauptspieler ? { abgegeben: [...a.abgegeben], zurueck: [...a.zurueck] } : {}),
        } : null,
        schweinchen: schweinchenOffen ? s.schweinchen : null,
        eigenePartei,
        bekanntePartei: bekanntePartei(s),
        ergebnis: s.ergebnis ? structuredClone(s.ergebnis) : null,
    };
}
function bekanntePartei(s) {
    const bekannt = {};
    if (s.typ === "hochzeit" || s.typ === "solo" || s.typ === "armut") {
        for (const p of PLAETZE) {
            const w = partei(s, p);
            if (w)
                bekannt[p] = w;
        }
        return bekannt;
    }
    const gespielt = [...s.stiche.flatMap((st) => st.karten), ...s.stich];
    const alte = gespielt.filter((g) => ohneKopie(g.karte) === "kreuz-D");
    for (const g of alte)
        bekannt[g.platz] = "re";
    for (const a of s.ansagen)
        bekannt[a.platz] = a.partei;
    // Beide Kreuz-Damen liegen: Wer keine gespielt hat, ist Kontra.
    if (alte.length === 2)
        for (const p of PLAETZE)
            if (!alte.some((g) => g.platz === p))
                bekannt[p] = "kontra";
    if (s.phase === "ende")
        for (const p of PLAETZE)
            bekannt[p] = partei(s, p);
    return bekannt;
}
//# sourceMappingURL=engine.js.map