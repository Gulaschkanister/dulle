// Gute KI (Spec 015): zählt Karten, erschließt Fehlfarben aus dem Spielverlauf und entscheidet per Monte-Carlo mit
// Zufallsverteilungen der unbekannten Karten („Determinisierung“). Sie sieht nur die Sicht ihres Platzes
// (netz-sicherheit, Wiederverbinden Regel 9). Gespielt wird nur eine Karte aus `sicht.erlaubteKarten`; die Simulation
// beeinflusst nur die Wahl, nie die Regeln.
// Erlaubte Importe (Test `ki.test.ts`): Typ `Sicht`, Kartenhilfen, Profil-Schalter, Typen, die Notfall-KI.
import { augen, kartensatz } from "../spiel/karten.js";
import { bedienFarbe, istTrumpf, rang } from "../spiel/stich.js";
import { hochzeitKlaerung, mitNeunen, soliErlaubt, soloAufspiel, zweiteDulle } from "../profile.js";
import { kiZug } from "./notfall.js";
/** Schwellen aus Spec 015; eingestellt mit `werkzeuge/ki-staerke.mjs` (AK3), nicht geraten. */
export const SCHWELLE = { solo: 0.7, armut: 0.55, ansage: 0.85, absage: 0.93 };
/**
 * Einstellung im Betrieb (Web Worker) und im Zeittest (AK4): höchstens 400 ms je Zug. Das Budget liegt darunter, weil es
 * zwischen zwei Proben geprüft wird und eine letzte noch fertig werden darf.
 */
export const IM_BETRIEB = { proben: 400, budgetMs: 350 };
/** Zufall mit Saat (mulberry32). */
export function saatZufall(saat) {
    let a = saat >>> 0;
    return () => {
        a = (a + 0x6d2b79f5) >>> 0;
        let t = a;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}
// ---------- Karten als Zahlen ----------
const ALLE = kartensatz(true);
const NR = new Map(ALLE.map((id, i) => [id, i]));
const nr = (id) => NR.get(id);
const AUGEN = ALLE.map(augen);
const KREUZ_DAMEN = new Set([nr("kreuz-D-a"), nr("kreuz-D-b")]);
const HERZ_ZEHN = new Set([nr("herz-10-a"), nr("herz-10-b")]);
const tabellen = new Map();
/** Rang, Bedienfarbe und Trumpf je Karte für einen Kontext, gebaut aus den Regeln der Engine (stich.ts). */
function tabelle(k) {
    const schluessel = `${k.trumpf}${k.schweinchen ? "+s" : ""}`;
    let t = tabellen.get(schluessel);
    if (!t) {
        const farben = ["kreuz", "pik", "herz", "karo", "trumpf"];
        t = {
            rang: ALLE.map((id) => rang(id, k)),
            farbe: ALLE.map((id) => farben.indexOf(bedienFarbe(id, k))),
            trumpf: ALLE.map((id) => istTrumpf(id, k)),
            dulleIstTrumpf: istTrumpf("herz-10-a", k),
        };
        tabellen.set(schluessel, t);
    }
    return t;
}
/** Wie `stichGewinner` der Engine, auf Zahlen. */
function gewinner(stich, t, dulleSchlaegt) {
    const farbe = t.farbe[stich[0]];
    const staerke = (c) => (t.trumpf[c] ? t.rang[c] : t.farbe[c] === farbe ? t.rang[c] : 1000);
    let beste = 0;
    for (let i = 1; i < stich.length; i++) {
        const a = staerke(stich[i]);
        const b = staerke(stich[beste]);
        if (a < b || (a === b && dulleSchlaegt && HERZ_ZEHN.has(stich[i])))
            beste = i;
    }
    return beste;
}
function erlaubt(hand, stich, t) {
    if (stich.length === 0)
        return [...hand];
    const f = t.farbe[stich[0]];
    const bedienen = hand.filter((c) => t.farbe[c] === f);
    return bedienen.length ? bedienen : [...hand];
}
/** Spielt die Welt mit einer einfachen, schnellen Strategie zu Ende und liefert die Re-Augen. Wer eine Kreuz-Dame spielt, ist danach bekannt. */
function zuEnde(w, t, dulleRegel, zuerst) {
    let augenRe = w.augenRe;
    let erste = zuerst;
    for (;;) {
        while (w.stich.length < 4) {
            const p = w.amZug;
            const hand = w.haende[p];
            if (hand.length === 0)
                return augenRe;
            const c = erste ?? schnellWahl(w, p, t, dulleRegel);
            erste = undefined;
            hand.splice(hand.indexOf(c), 1);
            w.stich.push(c);
            w.stichSpieler.push(p);
            if (KREUZ_DAMEN.has(c))
                w.bekannt[p] = true;
            w.amZug = (p + 1) % 4;
        }
        const letzter = w.haende.every((h) => h.length === 0);
        const dulle = t.dulleIstTrumpf && (dulleRegel === "immer" || (dulleRegel === "ausserLetzterStich" && !letzter));
        const i = gewinner(w.stich, t, dulle);
        const sieger = w.stichSpieler[i];
        const summe = w.stich.reduce((s, c) => s + AUGEN[c], 0);
        if (w.re[sieger])
            augenRe += summe;
        if (!t.trumpf[w.stich[0]])
            w.gelaufen[t.farbe[w.stich[0]]] = true;
        w.stich = [];
        w.stichSpieler = [];
        w.amZug = sieger;
        if (letzter)
            return augenRe;
    }
}
/** Strategie in der Simulation: wie die Notfall-KI; Partner erkennt man nur, wenn seine Partei öffentlich ist (wie am Tisch). */
function schnellWahl(w, p, t, dulleRegel) {
    const moegl = erlaubt(w.haende[p], w.stich, t);
    if (moegl.length === 1)
        return moegl[0];
    const wenigste = (l) => l.reduce((a, b) => (AUGEN[b] < AUGEN[a] || (AUGEN[b] === AUGEN[a] && t.rang[b] > t.rang[a]) ? b : a));
    if (w.stich.length === 0) {
        const ass = moegl.find((c) => !t.trumpf[c] && ALLE[c].split("-")[1] === "A" && !w.gelaufen[t.farbe[c]]);
        if (ass !== undefined)
            return ass;
        const fehl = moegl.filter((c) => !t.trumpf[c]);
        return wenigste(fehl.length ? fehl : moegl);
    }
    const letzter = w.haende.every((h) => h.length <= 1);
    const dulle = t.dulleIstTrumpf && (dulleRegel === "immer" || (dulleRegel === "ausserLetzterStich" && !letzter));
    const vorn = w.stichSpieler[gewinner(w.stich, t, dulle)];
    const partnerVorn = (vorn === p || w.bekannt[vorn]) && w.re[vorn] === w.re[p];
    const binLetzter = w.stich.length === 3;
    if (partnerVorn && binLetzter)
        return moegl.reduce((a, b) => (AUGEN[b] > AUGEN[a] ? b : a));
    if (!partnerVorn) {
        const gewinnt = moegl.filter((c) => gewinner([...w.stich, c], t, dulle) === w.stich.length);
        const imStich = w.stich.reduce((s, c) => s + AUGEN[c], 0);
        if (gewinnt.length && (imStich >= 10 || binLetzter))
            return gewinnt.reduce((a, b) => (t.rang[b] > t.rang[a] ? b : a));
    }
    return wenigste(moegl);
}
/** Punkte wie in der Wertung, vereinfacht: gewonnen ± 1, dazu je eine Stufe unter 90, 60, 30. */
function wert(augenEigene, eigeneRe) {
    const gewonnen = eigeneRe ? augenEigene >= 121 : augenEigene >= 120;
    const verlierer = gewonnen ? 240 - augenEigene : augenEigene;
    const punkte = 1 + (verlierer < 90 ? 1 : 0) + (verlierer < 60 ? 1 : 0) + (verlierer < 30 ? 1 : 0);
    return gewonnen ? punkte : -punkte;
}
// ---------- Wissen aus der Sicht ----------
function kontextAus(s) {
    return { trumpf: s.solo?.soloart ?? "normal", schweinchen: s.schweinchen !== null };
}
function wissen(s, profil, t) {
    const ich = s.ich - 1;
    const imSpiel = kartensatz(mitNeunen(profil)).map(nr);
    const gesehen = new Set(s.hand.map(nr));
    for (const st of s.stiche)
        for (const g of st.karten)
            gesehen.add(nr(g.karte));
    for (const g of s.stich)
        gesehen.add(nr(g.karte));
    const fehlt = [0, 1, 2, 3].map(() => new Set());
    // Wer nicht bedient, hat die Farbe nicht mehr.
    for (const st of [...s.stiche.map((x) => x.karten), s.stich]) {
        const erste = st[0];
        if (!erste)
            continue;
        const f = t.farbe[nr(erste.karte)];
        for (const g of st.slice(1))
            if (t.farbe[nr(g.karte)] !== f)
                fehlt[g.platz - 1].add(f);
    }
    const muss = [[], [], [], []];
    const darfNicht = [0, 1, 2, 3].map(() => new Set());
    // Armut: Wer gegeben bzw. zurückgegeben hat, weiß, wo diese Karten sind.
    const a = s.armut;
    if (a?.partner && a.armer === s.ich && a.abgegeben)
        muss[a.partner - 1].push(...a.abgegeben.map(nr).filter((c) => !gesehen.has(c)));
    if (a?.partner === s.ich && a.zurueck)
        muss[a.armer - 1].push(...a.zurueck.map(nr).filter((c) => !gesehen.has(c)));
    // Normalspiel: Re-Ansager halten eine Kreuz-Dame (sofern nicht gespielt), Kontra-Ansager keine.
    if (s.spieltyp === "normal") {
        for (const an of s.ansagen) {
            if (an.platz === s.ich)
                continue;
            const kdGespielt = [...s.stiche.flatMap((x) => x.karten), ...s.stich].some((g) => g.platz === an.platz && KREUZ_DAMEN.has(nr(g.karte)));
            if (an.partei === "re" && !kdGespielt && muss[an.platz - 1].every((c) => !KREUZ_DAMEN.has(c))) {
                const frei = [...KREUZ_DAMEN].find((c) => !gesehen.has(c) && !muss.some((m) => m.includes(c)));
                if (frei !== undefined)
                    muss[an.platz - 1].push(frei);
            }
            if (an.partei === "kontra")
                for (const c of KREUZ_DAMEN)
                    darfNicht[an.platz - 1].add(c);
        }
    }
    const vergeben = new Set(muss.flat());
    const unbekannt = imSpiel.filter((c) => !gesehen.has(c) && !vergeben.has(c));
    const brauchen = [0, 1, 2, 3].map((p) => (p === ich ? 0 : s.kartenzahl[(p + 1)] - muss[p].length));
    // Wer schon eine Kreuz-Dame gespielt hat, hat die zweite nicht (sonst Hochzeit).
    if (s.spieltyp === "normal") {
        for (const g of [...s.stiche.flatMap((x) => x.karten), ...s.stich]) {
            if (KREUZ_DAMEN.has(nr(g.karte)) && g.platz !== s.ich)
                for (const c of KREUZ_DAMEN)
                    darfNicht[g.platz - 1].add(c);
        }
    }
    return { unbekannt, brauchen, fehlt, muss, darfNicht, damenGetrennt: s.spieltyp === "normal" };
}
/** Eine zufällige Verteilung der unbekannten Karten, die zum Wissen passt (sonst eine ohne Fehlfarben-Regel). */
function verteile(w, ich, t, zufall) {
    for (let versuch = 0; versuch < 40; versuch++) {
        const karten = [...w.unbekannt];
        for (let i = karten.length - 1; i > 0; i--) {
            const j = Math.floor(zufall() * (i + 1));
            [karten[i], karten[j]] = [karten[j], karten[i]];
        }
        const haende = w.muss.map((m) => [...m]);
        const rest = [...w.brauchen];
        let ok = true;
        for (const c of karten) {
            const kandidaten = [0, 1, 2, 3].filter((p) => p !== ich && rest[p] > 0 && (versuch > 30 || (!w.fehlt[p].has(t.farbe[c]) && !w.darfNicht[p].has(c))));
            if (kandidaten.length === 0) {
                ok = false;
                break;
            }
            const p = kandidaten[Math.floor(zufall() * kandidaten.length)];
            haende[p].push(c);
            rest[p]--;
        }
        if (ok && w.damenGetrennt && haende.some((h) => h.filter((c) => KREUZ_DAMEN.has(c)).length === 2))
            ok = false;
        if (ok)
            return haende;
    }
    // Ganz ohne Einschränkung (kommt praktisch nicht vor).
    const haende = w.muss.map((m) => [...m]);
    const rest = [...w.brauchen];
    for (const c of w.unbekannt) {
        const p = [0, 1, 2, 3].find((x) => x !== ich && rest[x] > 0);
        haende[p].push(c);
        rest[p]--;
    }
    return haende;
}
/** Wer ist zu Beginn der Simulation öffentlich bekannt: aus der Sicht (Ansage, Kreuz-Dame gespielt, Solo, Armut, geklärte Hochzeit). */
function bekanntAus(s) {
    return [0, 1, 2, 3].map((p) => p === s.ich - 1 || s.bekanntePartei[(p + 1)] !== undefined || s.solo !== null || s.armut?.partner != null);
}
/** Parteien in einer Verteilung: bekannt aus der Sicht, sonst (Normalspiel) wer eine Kreuz-Dame hat oder gespielt hat. */
function parteien(s, haende) {
    const ich = s.ich - 1;
    const re = [false, false, false, false];
    const kdGespielt = new Set([...s.stiche.flatMap((x) => x.karten), ...s.stich].filter((g) => KREUZ_DAMEN.has(nr(g.karte))).map((g) => g.platz - 1));
    for (let p = 0; p < 4; p++) {
        const bekannt = p === ich ? s.eigenePartei : s.bekanntePartei[(p + 1)];
        if (bekannt) {
            re[p] = bekannt === "re";
            continue;
        }
        if (s.solo)
            re[p] = s.solo.solist === p + 1;
        else if (s.armut)
            re[p] = s.armut.armer === p + 1 || s.armut.partner === p + 1;
        else if (s.hochzeit)
            re[p] = s.hochzeit.hochzeiter === p + 1 || s.hochzeit.partner === p + 1;
        else
            re[p] = kdGespielt.has(p) || haende[p].some((c) => KREUZ_DAMEN.has(c));
    }
    return re;
}
/** Jede erlaubte Karte mit denselben Verteilungen durchspielen; die mit dem besten Mittelwert gewinnt. */
export function bewerteKarten(s, profil, o) {
    const k = kontextAus(s);
    const t = tabelle(k);
    const dulleRegel = zweiteDulle(profil);
    const ich = s.ich - 1;
    const w = wissen(s, profil, t);
    const kandidaten = s.erlaubteKarten.map(nr);
    const summe = kandidaten.map(() => ({ wert: 0, gewinn: 0, u90: 0, u60: 0, u30: 0 }));
    const jetzt = o.jetzt ?? (() => Date.now());
    const start = jetzt();
    let n = 0;
    const augenBisher = (re) => s.stiche.reduce((a, st) => a + (re[st.gewinner - 1] ? st.augen : 0), 0);
    const gelaufen = [false, false, false, false, false];
    for (const st of s.stiche) {
        const c = nr(st.karten[0].karte);
        if (!t.trumpf[c])
            gelaufen[t.farbe[c]] = true;
    }
    const bekanntStart = bekanntAus(s);
    while (n < o.proben && (o.budgetMs === undefined || n < 2 || jetzt() - start < o.budgetMs)) {
        const fremd = verteile(w, ich, t, o.zufall);
        fremd[ich] = s.hand.map(nr);
        const re = parteien(s, fremd);
        const basis = augenBisher(re);
        kandidaten.forEach((c, i) => {
            const welt = {
                haende: fremd.map((h) => [...h]), re, stich: s.stich.map((g) => nr(g.karte)), stichSpieler: s.stich.map((g) => g.platz - 1),
                amZug: ich, augenRe: basis, gelaufen: [...gelaufen], bekannt: [...bekanntStart],
            };
            const augenRe = zuEnde(welt, t, dulleRegel, c);
            const eigene = re[ich] ? augenRe : 240 - augenRe;
            const r = summe[i];
            r.wert += wert(eigene, re[ich]);
            if (re[ich] ? eigene >= 121 : eigene >= 120)
                r.gewinn++;
            const gegner = 240 - eigene;
            if (gegner < 90)
                r.u90++;
            if (gegner < 60)
                r.u60++;
            if (gegner < 30)
                r.u30++;
        });
        n++;
    }
    return kandidaten.map((c, i) => ({
        karte: ALLE[c], wert: summe[i].wert / n, gewinn: summe[i].gewinn / n,
        gegnerUnter: { 90: summe[i].u90 / n, 60: summe[i].u60 / n, 30: summe[i].u30 / n },
    })).sort((a, b) => b.wert - a.wert || s.erlaubteKarten.indexOf(a.karte) - s.erlaubteKarten.indexOf(b.karte));
}
/** Chance, dass `re` (Spieler-Indizes) ein ganzes Spiel gewinnt, wenn ich `hand` habe (alle spielen die schnelle Strategie). */
function chanceVoll(s, profil, k, hand, re, erster, o, proben, muss = [[], [], [], []], bis = Number.POSITIVE_INFINITY) {
    const jetzt = o.jetzt ?? (() => Date.now());
    const t = tabelle(k);
    const dulleRegel = zweiteDulle(profil);
    const ich = s.ich - 1;
    const imSpiel = kartensatz(mitNeunen(profil)).map(nr);
    const vergeben = new Set([...hand, ...muss.flat()]);
    const frei = imSpiel.filter((c) => !vergeben.has(c));
    const proHand = hand.length;
    let gewonnen = 0;
    let i = 0;
    // Zeitbudget (AK4): mindestens vier Proben, dann nur, solange Zeit ist.
    for (; i < proben && (i < 4 || jetzt() < bis); i++) {
        const karten = [...frei];
        for (let j = karten.length - 1; j > 0; j--) {
            const x = Math.floor(o.zufall() * (j + 1));
            [karten[j], karten[x]] = [karten[x], karten[j]];
        }
        const haende = [[], [], [], []];
        haende[ich] = [...hand];
        let pos = 0;
        for (let p = 0; p < 4; p++) {
            if (p === ich)
                continue;
            const brauch = proHand - muss[p].length;
            haende[p] = [...muss[p], ...karten.slice(pos, pos + brauch)];
            pos += brauch;
        }
        // Solo und Armut sind öffentlich; im Normalspiel weiß jeder nur seine eigene Partei.
        const offen = !k.trumpf.startsWith("normal") || muss.some((m) => m.length > 0);
        const welt = { haende, re, stich: [], stichSpieler: [], amZug: erster, augenRe: 0, gelaufen: [false, false, false, false, false], bekannt: [offen, offen, offen, offen] };
        const augenRe = zuEnde(welt, t, dulleRegel);
        if (augenRe >= 121)
            gewonnen++;
    }
    return gewonnen / i;
}
/** Der beste Zug aus dieser Sicht, oder null, wenn die KI nichts zu tun hat. */
export function kiZugGut(s, profil, o) {
    const ich = s.ich;
    const handNr = s.hand.map(nr);
    const vorbehaltProben = Math.max(8, Math.floor(o.proben / 4));
    const jetzt = o.jetzt ?? (() => Date.now());
    const ende = o.budgetMs === undefined ? Number.POSITIVE_INFINITY : jetzt() + o.budgetMs;
    if ((s.phase === "vorbehalt" || s.phase === "vorbehaltArt") && s.amZug === ich) {
        const m = s.moeglicheVorbehalte;
        if (m.includes("solo")) {
            let beste = null;
            const erster = soloAufspiel(profil) === "solist" ? ich - 1 : s.vorhand - 1;
            const arten = soliErlaubt(profil);
            const start = jetzt();
            for (const [j, art] of arten.entries()) {
                const re = [0, 1, 2, 3].map((p) => p === ich - 1);
                // Jede Soloart bekommt ihren Teil des Budgets.
                const teilEnde = Number.isFinite(ende) ? start + ((ende - start) * (j + 1)) / arten.length : ende;
                const chance = chanceVoll(s, profil, { trumpf: art }, handNr, re, erster, o, vorbehaltProben, undefined, teilEnde);
                if (!beste || chance > beste.chance)
                    beste = { art, chance };
            }
            if (beste && beste.chance >= SCHWELLE.solo)
                return { typ: "vorbehalt", art: "solo", soloart: beste.art };
        }
        if (m.includes("armut"))
            return { typ: "vorbehalt", art: "armut" };
        if (m.includes("hochzeit"))
            return { typ: "vorbehalt", art: "hochzeit", ...(hochzeitKlaerung(profil) === null ? { klaerung: "fehl" } : {}) };
        return s.phase === "vorbehalt" ? { typ: "vorbehalt", art: "gesund" } : kiZug(s, profil);
    }
    if (s.phase === "armutAngebot" && s.amZug === ich && s.armut) {
        // Annehmen, wenn ich mit den (unbekannten) Trümpfen des Armen gewinnen würde: Trümpfe zufällig aus dem Rest.
        const t = tabelle({ trumpf: "normal" });
        const imSpiel = kartensatz(mitNeunen(profil)).map(nr);
        const fremdeTruempfe = imSpiel.filter((c) => t.trumpf[c] && !handNr.includes(c));
        let gewonnen = 0;
        let i = 0;
        for (; i < vorbehaltProben && (i < 4 || jetzt() < ende); i++) {
            const gemischt = [...fremdeTruempfe].sort(() => o.zufall() - 0.5);
            const bekommen = gemischt.slice(0, s.armut.anzahl);
            const neu = [...handNr, ...bekommen];
            // Zurück gehen die schwächsten Fehlkarten (wie die Notfall-KI).
            const zurueck = [...neu].sort((a, b) => Number(t.trumpf[a]) - Number(t.trumpf[b]) || AUGEN[a] - AUGEN[b]).slice(0, s.armut.anzahl);
            const behalten = neu.filter((c) => !zurueck.includes(c));
            const re = [0, 1, 2, 3].map((p) => p === ich - 1 || p === s.armut.armer - 1);
            const muss = [[], [], [], []];
            muss[s.armut.armer - 1] = zurueck;
            if (chanceVoll(s, profil, { trumpf: "normal" }, behalten, re, s.vorhand - 1, o, 1, muss) > 0)
                gewonnen++;
        }
        return { typ: "armut", nimmt: gewonnen / i >= SCHWELLE.armut };
    }
    if (s.phase === "spiel" && s.amZug === ich && s.erlaubteKarten.length > 0) {
        // Nur eine Karte und nichts anzusagen: nichts zu rechnen.
        if (s.erlaubteKarten.length === 1 && s.erlaubteAnsagen.length === 0)
            return { typ: "karte", karte: s.erlaubteKarten[0] };
        const bewertung = bewerteKarten(s, profil, o);
        const beste = bewertung[0];
        // Bei ungeklärter Hochzeit sind die Parteien noch offen: Die Simulation kennt den Partner nicht, also keine Ansage.
        const hochzeitOffen = s.hochzeit !== null && s.hochzeit.partner === null && !s.hochzeit.allein;
        // Gegen ein Solo nie: Der Solist hat ein starkes Blatt, die Zufallsverteilung weiß das nicht (gemessen: 10 von 76 gewonnen).
        const gegenSolo = s.solo !== null && s.solo.solist !== s.ich;
        if ((o.ansagen ?? true) && !hochzeitOffen && !gegenSolo && s.erlaubteAnsagen.length > 0 && s.eigenePartei) {
            const stufe = ansageWahl(s.erlaubteAnsagen, beste);
            if (stufe)
                return { typ: "ansage", stufe };
        }
        return { typ: "karte", karte: beste.karte };
    }
    // Armut zurückgeben und alles Übrige wie die Notfall-KI.
    return kiZug(s, profil);
}
/** Höchste Ansage, deren Chance über der Schwelle liegt. Übersprungene Stufen zählen mit (wie bei Menschen). */
function ansageWahl(erlaubt, b) {
    let wahl = null;
    for (const st of erlaubt) {
        const ok = st === "ansage" ? b.gewinn >= SCHWELLE.ansage
            : st === "k90" ? b.gewinn >= SCHWELLE.ansage && b.gegnerUnter[90] >= SCHWELLE.absage
                : st === "k60" ? b.gegnerUnter[60] >= SCHWELLE.absage
                    : st === "k30" ? b.gegnerUnter[30] >= SCHWELLE.absage
                        : false;
        if (!ok)
            break;
        wahl = st;
    }
    return wahl;
}
//# sourceMappingURL=gut.js.map