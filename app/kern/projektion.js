// Projektion (Spec 000): der aus allen Ereignissen berechnete Zustand. Reine Funktion, tolerant:
// Fehlende Bezüge (z. B. ein Spieler aus einem noch nicht abgeglichenen Ereignis) brechen nichts ab.
import { wirdAusgewertet } from "./form.js";
import { SITZUNGS_TYPEN, platzSchluessel } from "./typen.js";
const UNBEKANNTER_NAME = "Unbekannt";
export function projiziere(ereignisse) {
    const projektion = {};
    const nachRunde = gruppiere(ereignisse, (e) => e.runde);
    for (const [rundeId, liste] of nachRunde) {
        projektion[rundeId] = projiziereRunde(rundeId, liste);
    }
    return projektion;
}
function projiziereRunde(rundeId, ereignisse) {
    const runde = { id: rundeId, name: UNBEKANNTER_NAME, spieler: {}, sitzungen: {}, profile: {}, unbekannt: 0 };
    const zusammenfuehrungen = new Map();
    const aufgehoben = new Set();
    const rundenEreignisse = ereignisse.filter((e) => !SITZUNGS_TYPEN.has(e.typ)).sort(nachZeit);
    for (const e of rundenEreignisse) {
        if (!wirdAusgewertet(e)) {
            runde.unbekannt++;
            continue;
        }
        const b = e;
        switch (b.typ) {
            case "rundeAngelegt":
            case "rundeUmbenannt":
                runde.name = b.daten.name;
                break;
            case "spielerAngelegt":
            case "spielerUmbenannt": {
                const d = b.daten;
                const vorher = runde.spieler[d.spielerId];
                runde.spieler[d.spielerId] = { id: d.spielerId, name: d.name, ausgeblendet: vorher?.ausgeblendet ?? false };
                break;
            }
            case "spielerAusgeblendet": {
                const d = b.daten;
                const spieler = holeSpieler(runde, d.spielerId);
                spieler.ausgeblendet = d.ausgeblendet;
                break;
            }
            case "profileZusammengefuehrt":
                zusammenfuehrungen.set(b.id, b.daten);
                break;
            case "zusammenfuehrungAufgehoben":
                aufgehoben.add(b.daten.zusammenfuehrung);
                break;
            case "profilGespeichert": {
                const p = b.daten.profil;
                const vorher = runde.profile[p.id];
                if (!vorher || vorher.version <= p.version)
                    runde.profile[p.id] = p;
                break;
            }
            default:
                break;
        }
    }
    // Aktive Zusammenführungen: von → nach. Ketten werden bis zum Ende verfolgt, Zyklen gestoppt.
    const kante = new Map();
    for (const [id, z] of zusammenfuehrungen)
        if (!aufgehoben.has(id))
            kante.set(z.von, z.nach);
    const aufloesen = (spielerId) => {
        let aktuell = spielerId;
        const besucht = new Set([aktuell]);
        for (let naechster = kante.get(aktuell); naechster !== undefined; naechster = kante.get(aktuell)) {
            if (besucht.has(naechster))
                return aktuell;
            besucht.add(naechster);
            aktuell = naechster;
        }
        return aktuell;
    };
    for (const spieler of Object.values(runde.spieler)) {
        const ziel = aufloesen(spieler.id);
        if (ziel !== spieler.id)
            spieler.zusammengefuehrtIn = ziel;
    }
    const nachSitzung = gruppiere(ereignisse.filter((e) => SITZUNGS_TYPEN.has(e.typ) && e.sitzung !== undefined), (e) => e.sitzung);
    for (const [sitzungId, liste] of nachSitzung) {
        const sitzung = projiziereSitzung(sitzungId, liste, aufloesen, runde);
        if (sitzung)
            runde.sitzungen[sitzungId] = sitzung;
    }
    return runde;
}
function projiziereSitzung(sitzungId, ereignisse, aufloesen, runde) {
    const sortiert = [...ereignisse].sort(nachSeq);
    let sitzung;
    const spiele = new Map();
    let letzteHandlung;
    // Stellvertretungen durch die KI: von Spiel bis Spiel (beide einschließlich), offen bis zum Ende des Abends.
    const kiAb = new Map();
    const kiSpanne = [];
    for (const e of sortiert) {
        if (!wirdAusgewertet(e)) {
            runde.unbekannt++;
            continue;
        }
        const b = e;
        if (b.typ === "sitzungBegonnen") {
            if (sitzung)
                continue; // ein zweites Beginnen ändert nichts
            const d = b.daten;
            sitzung = {
                id: sitzungId, datum: d.datum, modus: d.modus, profil: d.profil, plaetze: d.plaetze,
                abgeschlossen: false, verworfen: false, schreibendesGeraet: b.geraet, hoechsteSeq: 0,
                spiele: [], neuGegeben: [], summen: {}, praemien: {}, naechsteNr: 1, naechsteVorhand: d.ersteVorhand,
                widerspruechlich: false, konflikte: [], kiPlatz: d.plaetze.some((p) => p.art === "ki"), mitKi: [],
            };
            continue;
        }
        if (!sitzung)
            continue; // Rest ohne Beginn (noch nicht abgeglichen): wartet, bis der Beginn da ist
        switch (b.typ) {
            case "plaetzeGeaendert":
                sitzung.plaetze = b.daten.plaetze;
                if (sitzung.plaetze.some((p) => p.art === "ki"))
                    sitzung.kiPlatz = true;
                break;
            case "kiUebernimmt": {
                const d = b.daten;
                if (!kiAb.has(d.platz))
                    kiAb.set(d.platz, d.spielNr);
                break;
            }
            case "kiGibtAb": {
                const d = b.daten;
                const ab = kiAb.get(d.platz);
                if (ab !== undefined)
                    kiSpanne.push([ab, d.spielNr]);
                kiAb.delete(d.platz);
                break;
            }
            case "profilGeaendert":
                sitzung.profil = b.daten.profil;
                break;
            case "sitzungUebernommen":
                sitzung.schreibendesGeraet = b.geraet;
                break;
            // Spec 016: Nach einem Gastgeber-Wechsel schreibt das neue Gerät den Abend weiter.
            case "gastgeberGewechselt":
                sitzung.schreibendesGeraet = b.daten.nach;
                break;
            case "sitzungAbgeschlossen": {
                sitzung.abgeschlossen = true;
                const cent = b.daten.punktwertCent;
                if (cent !== undefined)
                    sitzung.punktwertCent = cent;
                else
                    delete sitzung.punktwertCent;
                break;
            }
            case "sitzungWiederaufgenommen":
                sitzung.abgeschlossen = false;
                break;
            case "sitzungVerworfen":
                sitzung.verworfen = b.daten.verworfen;
                break;
            case "spielEingetragen":
            case "spielBeendet":
            case "spielKorrigiert": {
                const d = b.daten;
                const vorher = spiele.get(d.nr);
                spiele.set(d.nr, { nr: d.nr, daten: d, korrigiert: b.typ === "spielKorrigiert" || (vorher?.korrigiert ?? false), verworfen: vorher?.verworfen ?? false });
                if (b.typ !== "spielKorrigiert")
                    letzteHandlung = { art: "spiel", nr: d.nr, vorhand: d.vorhand };
                break;
            }
            case "spielVerworfen": {
                const d = b.daten;
                const spiel = spiele.get(d.nr);
                if (spiel)
                    spiel.verworfen = d.verworfen;
                break;
            }
            case "spielNeuGegeben": {
                const d = b.daten;
                sitzung.neuGegeben.push({ nr: d.nr, grund: d.grund });
                letzteHandlung = { art: "neuGegeben", nr: d.nr };
                break;
            }
            default:
                break;
        }
    }
    if (!sitzung)
        return undefined;
    sitzung.hoechsteSeq = Math.max(0, ...ereignisse.map((e) => e.seq ?? 0));
    sitzung.spiele = [...spiele.values()].sort((a, b) => a.nr - b.nr);
    for (const ab of kiAb.values())
        kiSpanne.push([ab, Number.POSITIVE_INFINITY]);
    sitzung.mitKi = sitzung.spiele.map((s) => s.nr).filter((nr) => sitzung.kiPlatz || kiSpanne.some(([ab, bis]) => nr >= ab && nr <= bis));
    sitzung.naechsteNr = Math.max(0, ...sitzung.spiele.map((s) => s.nr)) + 1;
    if (letzteHandlung?.art === "spiel" && letzteHandlung.vorhand !== undefined) {
        sitzung.naechsteVorhand = ((letzteHandlung.vorhand % 4) + 1);
    }
    else if (letzteHandlung?.art === "neuGegeben") {
        // Nach einem Schmeißen bleibt die Vorhand gleich: die des letzten echten Spiels + 1, sonst die erste.
        const letztesSpiel = sitzung.spiele.filter((s) => s.nr < letzteHandlung.nr).at(-1);
        if (letztesSpiel)
            sitzung.naechsteVorhand = ((letztesSpiel.daten.vorhand % 4) + 1);
    }
    for (const spiel of sitzung.spiele) {
        if (spiel.verworfen)
            continue;
        for (const [spielerId, punkte] of Object.entries(spiel.daten.punkte)) {
            const ziel = aufloesen(spielerId);
            sitzung.summen[ziel] = (sitzung.summen[ziel] ?? 0) + punkte;
        }
        for (const [spielerId, punkte] of Object.entries(spiel.daten.praemie ?? {})) {
            const ziel = aufloesen(spielerId);
            sitzung.summen[ziel] = (sitzung.summen[ziel] ?? 0) + punkte;
            sitzung.praemien[ziel] = (sitzung.praemien[ziel] ?? 0) + punkte;
        }
    }
    // Konflikte: mehrere Ereignisse mit gleicher seq (zwei Geräte haben dieselbe Sitzung beschrieben).
    for (const [seq, gleiche] of gruppiere(ereignisse.filter((e) => e.seq !== undefined), (e) => String(e.seq))) {
        if (gleiche.length < 2)
            continue;
        const spielNummern = [...new Set(gleiche.map((e) => e.daten.nr).filter((nr) => typeof nr === "number"))].sort((a, b) => a - b);
        sitzung.konflikte.push({ seq: Number(seq), ereignisse: gleiche.map((e) => e.id).sort(), spielNummern });
    }
    sitzung.konflikte.sort((a, b) => a.seq - b.seq);
    sitzung.widerspruechlich = sitzung.konflikte.length > 0;
    // Spieler, die in Plätzen oder Punkten vorkommen, aber (noch) nicht angelegt sind: tolerant anlegen.
    const ids = new Set([
        ...sitzung.plaetze.map(platzSchluessel).filter((s) => !s.startsWith("ki-")),
        ...sitzung.spiele.flatMap((s) => Object.keys(s.daten.punkte)).filter((s) => !s.startsWith("ki-")),
    ]);
    for (const spielerId of ids)
        holeSpieler(runde, spielerId);
    return sitzung;
}
/** Alle Zusammenführungen einer Runde mit Status, für die Bezugsprüfung beim Erzeugen. */
export function zusammenfuehrungenAus(ereignisse, rundeId) {
    const ergebnis = new Map();
    const eigene = ereignisse.filter((e) => e.runde === rundeId && wirdAusgewertet(e)).sort(nachZeit);
    for (const e of eigene) {
        if (e.typ === "profileZusammengefuehrt") {
            const d = e.daten;
            ergebnis.set(e.id, { von: d.von, nach: d.nach, aufgehoben: false });
        }
        else if (e.typ === "zusammenfuehrungAufgehoben") {
            const z = ergebnis.get(e.daten.zusammenfuehrung);
            if (z)
                z.aufgehoben = true;
        }
    }
    return ergebnis;
}
function holeSpieler(runde, spielerId) {
    let spieler = runde.spieler[spielerId];
    if (!spieler) {
        spieler = { id: spielerId, name: `${UNBEKANNTER_NAME} (…${spielerId.slice(-4)})`, ausgeblendet: false };
        runde.spieler[spielerId] = spieler;
    }
    return spieler;
}
function gruppiere(liste, schluessel) {
    const gruppen = new Map();
    for (const x of liste) {
        const k = schluessel(x);
        const gruppe = gruppen.get(k);
        if (gruppe)
            gruppe.push(x);
        else
            gruppen.set(k, [x]);
    }
    return gruppen;
}
/** Runden-Ereignisse: nach Zeit, bei gleicher Zeit nach ID. */
export function nachZeit(a, b) {
    return a.zeit < b.zeit ? -1 : a.zeit > b.zeit ? 1 : a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}
/** Sitzungs-Ereignisse: nach seq, dann Zeit, dann ID. */
export function nachSeq(a, b) {
    const s = (a.seq ?? 0) - (b.seq ?? 0);
    return s !== 0 ? s : nachZeit(a, b);
}
//# sourceMappingURL=projektion.js.map