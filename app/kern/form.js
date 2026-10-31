// Formprüfung (Spec 000, Stufe 1 der Prüfung): jedes Ereignis für sich, ohne Blick auf andere.
// Gilt beim Erzeugen und beim Import. Meldungen sind deutsch und nennen das Feld.
import { istBekannterTyp } from "./katalog.js";
import { SCHEMA_VERSION, SITZUNGS_TYPEN } from "./typen.js";
import { istUlid } from "./ulid.js";
const SPIELARTEN = ["normal", "hochzeit", "solo", "stillesSolo"];
const ANSAGE_STUFEN = ["ansage", "k90", "k60", "k30", "schwarz"];
// ---------- Hilfen ----------
function istObjekt(wert) {
    return typeof wert === "object" && wert !== null && !Array.isArray(wert);
}
function text(daten, feld, min, max) {
    const wert = daten[feld];
    if (typeof wert !== "string")
        return [`${feld}: fehlt oder ist kein Text`];
    if (wert !== wert.trim())
        return [`${feld}: darf nicht mit Leerzeichen beginnen oder enden`];
    if (wert.length < min || wert.length > max)
        return [`${feld}: muss ${min}–${max} Zeichen lang sein`];
    return [];
}
function id(daten, feld) {
    const wert = daten[feld];
    return typeof wert === "string" && wert.length > 0 ? [] : [`${feld}: fehlt`];
}
function ganzzahl(daten, feld, min, max = Number.MAX_SAFE_INTEGER) {
    const wert = daten[feld];
    if (typeof wert !== "number" || !Number.isInteger(wert))
        return [`${feld}: muss eine ganze Zahl sein`];
    if (wert < min || wert > max) {
        return [max === Number.MAX_SAFE_INTEGER ? `${feld}: muss mindestens ${min} sein` : `${feld}: muss zwischen ${min} und ${max} liegen`];
    }
    return [];
}
function wahrheitswert(daten, feld) {
    return typeof daten[feld] === "boolean" ? [] : [`${feld}: muss ja oder nein sein`];
}
function optional(daten, feld, pruefe) {
    return daten[feld] === undefined ? [] : pruefe();
}
function profil(wert) {
    if (!istObjekt(wert))
        return ["profil: fehlt"];
    return [
        ...id(wert, "id").map((m) => `profil.${m}`),
        ...text(wert, "name", 1, 40).map((m) => `profil.${m}`),
        ...ganzzahl(wert, "version", 1).map((m) => `profil.${m}`),
        ...(istObjekt(wert["schalter"]) ? [] : ["profil.schalter: fehlt"]),
    ];
}
function plaetze(wert) {
    if (!Array.isArray(wert) || wert.length !== 4)
        return ["plaetze: es müssen genau 4 Plätze sein"];
    const fehler = [];
    const nummern = new Set();
    const menschen = new Set();
    wert.forEach((platz, i) => {
        if (!istObjekt(platz)) {
            fehler.push(`plaetze[${i}]: ungültig`);
            return;
        }
        fehler.push(...ganzzahl(platz, "platz", 1, 4).map((m) => `plaetze[${i}].${m}`));
        nummern.add(platz["platz"]);
        if (platz["art"] === "mensch") {
            fehler.push(...id(platz, "spielerId").map((m) => `plaetze[${i}].${m}`));
            if (menschen.has(platz["spielerId"]))
                fehler.push(`plaetze: Spieler ${String(platz["spielerId"])} sitzt doppelt am Tisch`);
            menschen.add(platz["spielerId"]);
        }
        else if (platz["art"] === "ki") {
            fehler.push(...id(platz, "ki").map((m) => `plaetze[${i}].${m}`));
        }
        else {
            fehler.push(`plaetze[${i}].art: muss mensch oder ki sein`);
        }
    });
    if (nummern.size !== 4)
        fehler.push("plaetze: jede Platznummer 1–4 genau einmal");
    return fehler;
}
function idListe(wert, feld) {
    if (!Array.isArray(wert) || !wert.every((x) => typeof x === "string" && x.length > 0))
        return [`${feld}: muss eine Liste von Spieler-IDs sein`];
    if (new Set(wert).size !== wert.length)
        return [`${feld}: enthält einen Spieler doppelt`];
    return [];
}
// ---------- Spiel ----------
function spiel(daten) {
    const fehler = [
        ...ganzzahl(daten, "nr", 1),
        ...ganzzahl(daten, "vorhand", 1, 4),
        ...ganzzahl(daten, "wert", 0),
    ];
    if (daten["eingabe"] !== "schnell" && daten["eingabe"] !== "rechner" && daten["eingabe"] !== "direkt")
        fehler.push("eingabe: muss schnell, rechner oder direkt sein");
    const spielart = daten["spielart"];
    if (typeof spielart !== "string" || !SPIELARTEN.includes(spielart))
        fehler.push("spielart: unbekannt");
    fehler.push(...optional(daten, "soloart", () => text(daten, "soloart", 1, 30)));
    const bock = daten["bock"];
    if (typeof bock !== "number" || !Number.isInteger(bock) || bock < 1 || (bock & (bock - 1)) !== 0) {
        fehler.push("bock: muss 1, 2, 4, … sein");
    }
    // Punkte: genau vier Plätze, ganze Zahlen, Summe 0.
    const punkte = daten["punkte"];
    let schluessel = [];
    if (!istObjekt(punkte)) {
        fehler.push("punkte: fehlen");
    }
    else {
        schluessel = Object.keys(punkte);
        const werte = Object.values(punkte);
        if (schluessel.length !== 4)
            fehler.push(`punkte: es müssen genau 4 Spieler sein, nicht ${schluessel.length}`);
        if (!werte.every((w) => typeof w === "number" && Number.isInteger(w))) {
            fehler.push("punkte: nur ganze Zahlen");
        }
        else {
            const summe = werte.reduce((a, b) => a + b, 0);
            if (summe !== 0)
                fehler.push(`punkte: Punkte ergeben zusammen ${summe} statt 0`);
        }
    }
    // Prämie (Spec 007): optional, nur Spieler am Tisch, ganze Zahlen > 0. Gehört nicht zur Nullsumme.
    const praemie = daten["praemie"];
    if (praemie !== undefined) {
        if (!istObjekt(praemie))
            fehler.push("praemie: muss ein Objekt sein");
        else {
            for (const [id, w] of Object.entries(praemie)) {
                if (schluessel.length > 0 && !schluessel.includes(id))
                    fehler.push("praemie: Spieler sitzt nicht am Tisch");
                if (typeof w !== "number" || !Number.isInteger(w) || w <= 0)
                    fehler.push("praemie: nur ganze Zahlen größer 0");
            }
        }
    }
    const solo = spielart === "solo" || spielart === "stillesSolo";
    const re = daten["re"];
    if (re === undefined) {
        if (daten["eingabe"] === "rechner" || daten["eingabe"] === "direkt")
            fehler.push("re: im Rechner und im Direktspiel ist die Re-Partei Pflicht");
        if (solo)
            fehler.push("re: beim Solo ist der Solist Pflicht");
    }
    else {
        const reFehler = idListe(re, "re");
        fehler.push(...reFehler);
        if (reFehler.length === 0) {
            const anzahl = re.length;
            if (solo && anzahl !== 1)
                fehler.push("re: beim Solo genau 1 Spieler (der Solist)");
            if (spielart === "normal" && anzahl !== 2)
                fehler.push(`re: im Normalspiel genau 2 Spieler, nicht ${anzahl}`);
            if (spielart === "hochzeit" && anzahl !== 1 && anzahl !== 2)
                fehler.push("re: bei der Hochzeit 1 oder 2 Spieler");
            if (schluessel.length > 0 && !re.every((s) => schluessel.includes(s)))
                fehler.push("re: Spieler sitzt nicht am Tisch");
        }
    }
    const gewinner = daten["gewinner"];
    const gewinnerFehler = idListe(gewinner, "gewinner");
    fehler.push(...gewinnerFehler);
    if (gewinnerFehler.length === 0) {
        const liste = gewinner;
        const reListe = Array.isArray(re) ? re : undefined;
        const einzelspieler = solo || (spielart === "hochzeit" && reListe?.length === 1);
        const erlaubt = einzelspieler ? [0, 1, 3] : [0, 2];
        if (!erlaubt.includes(liste.length))
            fehler.push(`gewinner: ${liste.length} Gewinner passt nicht zur Spielart`);
        if (schluessel.length > 0 && !liste.every((s) => schluessel.includes(s)))
            fehler.push("gewinner: Spieler sitzt nicht am Tisch");
        if (reListe && liste.length > 0 && schluessel.length === 4) {
            const kontra = schluessel.filter((s) => !reListe.includes(s));
            const gleich = (a, b) => a.length === b.length && a.every((x) => b.includes(x));
            if (!gleich(liste, reListe) && !gleich(liste, kontra))
                fehler.push("gewinner: müssen genau die Re-Partei oder genau die Kontra-Partei sein");
        }
    }
    if (daten["eingabe"] === "rechner" || daten["eingabe"] === "direkt")
        fehler.push(...ganzzahl(daten, "augenRe", 0, 240));
    else
        fehler.push(...optional(daten, "augenRe", () => ganzzahl(daten, "augenRe", 0, 240)));
    fehler.push(...optional(daten, "ansagen", () => {
        const ansagen = daten["ansagen"];
        if (!Array.isArray(ansagen))
            return ["ansagen: muss eine Liste sein"];
        return ansagen.flatMap((a, i) => istObjekt(a) && (a["partei"] === "re" || a["partei"] === "kontra") && typeof a["stufe"] === "string" && ANSAGE_STUFEN.includes(a["stufe"])
            ? []
            : [`ansagen[${i}]: Partei re/kontra und Stufe ansage, k90, k60, k30 oder schwarz`]);
    }));
    fehler.push(...optional(daten, "vorbehalt", () => (daten["vorbehalt"] === "armut" ? [] : ["vorbehalt: nur „armut“ ist bekannt"])));
    fehler.push(...optional(daten, "ohneStich", () => (daten["ohneStich"] === "re" || daten["ohneStich"] === "kontra" ? [] : ["ohneStich: muss re oder kontra sein"])));
    fehler.push(...optional(daten, "sonderpunkteArten", () => {
        const arten = daten["sonderpunkteArten"];
        if (!istObjekt(arten))
            return ["sonderpunkteArten: ungültig"];
        return Object.entries(arten).flatMap(([art, wert]) => {
            if (!["fuchs", "doppelkopf", "karlchen"].includes(art))
                return [`sonderpunkteArten.${art}: unbekannte Art`];
            if (!istObjekt(wert))
                return [`sonderpunkteArten.${art}: ungültig`];
            return [...ganzzahl(wert, "re", 0), ...ganzzahl(wert, "kontra", 0)].map((m) => `sonderpunkteArten.${art}.${m}`);
        });
    }));
    fehler.push(...optional(daten, "sonderpunkte", () => {
        const sp = daten["sonderpunkte"];
        if (!istObjekt(sp))
            return ["sonderpunkte: ungültig"];
        return [...ganzzahl(sp, "re", 0), ...ganzzahl(sp, "kontra", 0)].map((m) => `sonderpunkte.${m}`);
    }));
    return fehler;
}
// ---------- Prüfer je Typ ----------
const PRUEFER = {
    rundeAngelegt: (d) => text(d, "name", 1, 40),
    rundeUmbenannt: (d) => text(d, "name", 1, 40),
    spielerAngelegt: (d) => [...id(d, "spielerId"), ...text(d, "name", 1, 24)],
    spielerUmbenannt: (d) => [...id(d, "spielerId"), ...text(d, "name", 1, 24)],
    spielerAusgeblendet: (d) => [...id(d, "spielerId"), ...wahrheitswert(d, "ausgeblendet")],
    profilGespeichert: (d) => profil(d["profil"]),
    profileZusammengefuehrt: (d) => {
        const fehler = [...id(d, "von"), ...id(d, "nach")];
        if (fehler.length === 0 && d["von"] === d["nach"])
            fehler.push("nach: ein Profil kann nicht mit sich selbst zusammengeführt werden");
        return fehler;
    },
    zusammenfuehrungAufgehoben: (d) => (istUlid(d["zusammenfuehrung"]) ? [] : ["zusammenfuehrung: muss die ID eines Zusammenführens sein"]),
    sitzungBegonnen: (d) => {
        const fehler = [...plaetze(d["plaetze"]), ...profil(d["profil"]), ...ganzzahl(d, "ersteVorhand", 1, 4)];
        const datum = d["datum"];
        if (typeof datum !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(datum) || Number.isNaN(Date.parse(`${datum}T00:00:00Z`))) {
            fehler.push("datum: muss ein Tag im Format JJJJ-MM-TT sein");
        }
        if (d["modus"] !== "schreiber" && d["modus"] !== "direkt")
            fehler.push("modus: muss schreiber oder direkt sein");
        if (d["modus"] === "schreiber" && Array.isArray(d["plaetze"]) && d["plaetze"].some((p) => istObjekt(p) && p["art"] === "ki")) {
            fehler.push("plaetze: im Schreiber sitzen nur Menschen am Tisch");
        }
        return fehler;
    },
    plaetzeGeaendert: (d) => [...plaetze(d["plaetze"]), ...ganzzahl(d, "abSpiel", 1)],
    profilGeaendert: (d) => [...profil(d["profil"]), ...ganzzahl(d, "abSpiel", 1)],
    sitzungUebernommen: (d) => id(d, "vonGeraet"),
    sitzungAbgeschlossen: (d) => {
        const fehler = optional(d, "punktwertCent", () => ganzzahl(d, "punktwertCent", 0));
        const endstand = d["endstand"];
        if (!istObjekt(endstand) || !Object.values(endstand).every((w) => typeof w === "number" && Number.isInteger(w))) {
            fehler.push("endstand: muss für jeden Spieler eine ganze Zahl enthalten");
        }
        return fehler;
    },
    sitzungWiederaufgenommen: () => [],
    sitzungVerworfen: (d) => [...wahrheitswert(d, "verworfen"), ...optional(d, "grund", () => text(d, "grund", 1, 80))],
    spielEingetragen: spiel,
    spielKorrigiert: spiel,
    spielVerworfen: (d) => [...ganzzahl(d, "nr", 1), ...wahrheitswert(d, "verworfen")],
    spielNeuGegeben: (d) => [...ganzzahl(d, "nr", 1), ...text(d, "grund", 1, 80)],
    // Stufe 1: Spielengine (Spec 008)
    kartenGegeben: (d) => [...ganzzahl(d, "spielNr", 1), ...ganzzahl(d, "vorhand", 1, 4)],
    vorbehalt: (d) => [
        ...ganzzahl(d, "spielNr", 1), ...ganzzahl(d, "platz", 1, 4),
        ...(["gesund", "vorbehalt", "hochzeit", "solo", "armut"].includes(d["art"]) ? [] : ["art: muss gesund, vorbehalt, hochzeit, solo oder armut sein"]),
        ...(d["art"] === "solo" && !["damen", "buben", "fleischlos", "kreuz", "pik", "herz", "karo"].includes(d["soloart"]) ? ["soloart: unbekannte Soloart"] : []),
        ...optional(d, "klaerung", () => (["fremder", "fehl", "trumpf"].includes(d["klaerung"]) ? [] : ["klaerung: muss fremder, fehl oder trumpf sein"])),
    ],
    karteGespielt: (d) => [
        ...ganzzahl(d, "spielNr", 1), ...ganzzahl(d, "platz", 1, 4), ...kartenId(d["karte"], "karte"),
        ...ganzzahl(d, "stich", 1, 12), ...ganzzahl(d, "position", 1, 4),
    ],
    angesagt: (d) => [
        ...ganzzahl(d, "spielNr", 1), ...ganzzahl(d, "platz", 1, 4), ...ganzzahl(d, "kartenInHand", 0, 12),
        ...(["ansage", "k90", "k60", "k30", "schwarz"].includes(d["stufe"]) ? [] : ["stufe: muss ansage, k90, k60, k30 oder schwarz sein"]),
    ],
    stichGewonnen: (d) => [...ganzzahl(d, "spielNr", 1), ...ganzzahl(d, "stich", 1, 12), ...ganzzahl(d, "platz", 1, 4), ...ganzzahl(d, "augen", 0, 44)],
    spielBeendet: spiel,
    spielOffengelegt: (d) => {
        const fehler = [...ganzzahl(d, "spielNr", 1)];
        if (typeof d["seed"] !== "string" || !/^[0-9a-f]{32}$/.test(d["seed"]))
            fehler.push("seed: muss 32 Hex-Zeichen haben");
        const haende = d["haende"];
        if (!istObjekt(haende) || Object.keys(haende).sort().join() !== "1,2,3,4")
            return [...fehler, "haende: braucht genau die Plätze 1 bis 4"];
        for (const [platz, hand] of Object.entries(haende)) {
            if (!Array.isArray(hand))
                fehler.push(`haende.${platz}: muss eine Liste sein`);
            else
                hand.forEach((k, i) => fehler.push(...kartenId(k, `haende.${platz}[${i}]`)));
        }
        fehler.push(...optional(d, "getauscht", () => {
            const g = d["getauscht"];
            if (!istObjekt(g) || !Array.isArray(g["abgegeben"]) || !Array.isArray(g["zurueck"]) || g["abgegeben"].length !== g["zurueck"].length) {
                return ["getauscht: abgegeben und zurueck müssen gleich lange Listen sein"];
            }
            return [...g["abgegeben"], ...g["zurueck"]].flatMap((k) => kartenId(k, "getauscht"));
        }));
        return fehler;
    },
    // Spec 012: Wiederverbinden
    spielerGetrennt: (d) => [...ganzzahl(d, "platz", 1, 4), ...text(d, "spielerId", 1, 80)],
    spielerZurueck: (d) => [...ganzzahl(d, "platz", 1, 4), ...text(d, "spielerId", 1, 80), ...(d["weg"] === "selbst" || d["weg"] === "qr" || d["weg"] === "raum" ? [] : ["weg: muss selbst, qr oder raum sein"])],
    geraetGewechselt: (d) => [...ganzzahl(d, "platz", 1, 4), ...text(d, "spielerId", 1, 80)],
    platzUebernommen: (d) => {
        const fehler = [...ganzzahl(d, "platz", 1, 4), ...text(d, "von", 1, 80), ...text(d, "nach", 1, 80), ...ganzzahl(d, "spielNr", 1)];
        if (fehler.length === 0 && d["von"] === d["nach"])
            fehler.push("nach: der Ersatz muss ein anderer Spieler sein");
        return fehler;
    },
    gastgeberGewechselt: (d) => [...text(d, "von", 1, 80), ...text(d, "nach", 1, 80), ...wahrheitswert(d, "geplant")],
    entscheidung: (d) => [
        ...text(d, "spielerId", 1, 80), ...ganzzahl(d, "platz", 1, 4),
        ...(d["frage"] === "platzVerwaist" ? [] : ["frage: nur platzVerwaist ist bekannt"]),
        ...(["ki", "warten", "ersatz", "neuGeben", "beenden"].includes(d["wahl"]) ? [] : ["wahl: muss ki, warten, ersatz, neuGeben oder beenden sein"]),
        ...optional(d, "zurueckgenommen", () => wahrheitswert(d, "zurueckgenommen")),
    ],
    kiUebernimmt: (d) => [...ganzzahl(d, "platz", 1, 4), ...text(d, "fuer", 1, 80), ...ganzzahl(d, "spielNr", 1),
        ...(d["ki"] === undefined || d["ki"] === "gut" || d["ki"] === "notfall" ? [] : ["ki: muss gut oder notfall sein"])],
    kiGibtAb: (d) => [...ganzzahl(d, "platz", 1, 4), ...text(d, "an", 1, 80), ...ganzzahl(d, "spielNr", 1), ...ganzzahl(d, "stich", 0, 12)],
    armutAntwort: (d) => [...ganzzahl(d, "spielNr", 1), ...ganzzahl(d, "platz", 1, 4), ...wahrheitswert(d, "nimmt")],
    armutGetauscht: (d) => {
        const fehler = [...ganzzahl(d, "spielNr", 1), ...ganzzahl(d, "armer", 1, 4), ...ganzzahl(d, "partner", 1, 4), ...ganzzahl(d, "anzahl", 0, 3)];
        if (fehler.length === 0 && d["armer"] === d["partner"])
            fehler.push("partner: kann nicht der Arme selbst sein");
        return fehler;
    },
};
function kartenId(wert, feld) {
    return typeof wert === "string" && /^(kreuz|pik|herz|karo)-(A|10|K|D|B|9)-(a|b)$/.test(wert) ? [] : [`${feld}: keine gültige Karte`];
}
// ---------- Umschlag und Gesamtprüfung ----------
/** Prüft den Umschlag. Gilt für alle Ereignisse, auch unbekannte Typen und neuere Versionen. */
export function pruefeUmschlag(e) {
    if (!istObjekt(e))
        return ["Ereignis: ist kein Objekt"];
    const fehler = [];
    if (typeof e["v"] !== "number" || !Number.isInteger(e["v"]) || e["v"] < 1)
        fehler.push("v: muss eine Versionsnummer ab 1 sein");
    if (!istUlid(e["id"]))
        fehler.push("id: keine gültige ULID");
    if (!istUlid(e["runde"]))
        fehler.push("runde: keine gültige ULID");
    if (e["sitzung"] !== undefined && !istUlid(e["sitzung"]))
        fehler.push("sitzung: keine gültige ULID");
    if (e["seq"] !== undefined)
        fehler.push(...ganzzahl(e, "seq", 1));
    const zeit = e["zeit"];
    if (typeof zeit !== "string" || !zeit.endsWith("Z") || Number.isNaN(Date.parse(zeit)))
        fehler.push("zeit: muss ISO-8601 in UTC sein");
    if (typeof e["geraet"] !== "string" || e["geraet"].length === 0)
        fehler.push("geraet: fehlt");
    if (typeof e["typ"] !== "string" || e["typ"].length === 0)
        fehler.push("typ: fehlt");
    if (!istObjekt(e["daten"]))
        fehler.push("daten: muss ein Objekt sein");
    return fehler;
}
/** Wird dieses Ereignis ausgewertet? Unbekannte Typen und neuere Versionen werden nur aufbewahrt. */
export function wirdAusgewertet(e) {
    return e.v === SCHEMA_VERSION && istBekannterTyp(e.typ);
}
/** Vollständige Formprüfung: Umschlag, und bei auswertbaren Ereignissen auch die Daten. */
export function pruefeForm(e) {
    const umschlag = pruefeUmschlag(e);
    if (umschlag.length > 0)
        return umschlag;
    const ereignis = e;
    if (!wirdAusgewertet(ereignis))
        return [];
    const typ = ereignis.typ;
    const fehler = [];
    if (SITZUNGS_TYPEN.has(typ)) {
        if (ereignis.sitzung === undefined)
            fehler.push("sitzung: fehlt bei einem Sitzungs-Ereignis");
        if (ereignis.seq === undefined)
            fehler.push("seq: fehlt bei einem Sitzungs-Ereignis");
    }
    else if (ereignis.sitzung !== undefined || ereignis.seq !== undefined) {
        fehler.push("sitzung: ein Runden-Ereignis gehört zu keiner Sitzung");
    }
    return [...fehler, ...PRUEFER[typ](ereignis.daten)];
}
//# sourceMappingURL=form.js.map