// Bezugsprüfung (Spec 000, Stufe 2): gegen die Projektion. Gilt nur beim Erzeugen auf dem eigenen
// Gerät, nicht beim Import – dort dürfen Bezüge später nachkommen.
import { platzSchluessel } from "./typen.js";
export function pruefeBezug(typ, daten, k) {
    const d = daten;
    if (typ === "rundeAngelegt")
        return [];
    const runde = k.runde;
    if (!runde)
        return ["Die Runde gibt es auf diesem Gerät nicht."];
    const spielerDa = (id) => typeof id === "string" && runde.spieler[id] !== undefined;
    switch (typ) {
        case "rundeUmbenannt":
        case "spielerAngelegt":
        case "profilGespeichert":
            return [];
        case "spielerUmbenannt":
        case "spielerAusgeblendet":
            return spielerDa(d["spielerId"]) ? [] : ["Diesen Spieler gibt es in der Runde nicht."];
        case "profileZusammengefuehrt": {
            const von = d["von"];
            const nach = d["nach"];
            if (!spielerDa(von) || !spielerDa(nach))
                return ["Beide Profile müssen zur Runde gehören."];
            // Zyklus: Führt der Weg von „nach“ über aktive Zusammenführungen zurück zu „von“?
            const kante = new Map();
            for (const z of k.zusammenfuehrungen?.values() ?? [])
                if (!z.aufgehoben)
                    kante.set(z.von, z.nach);
            if (kante.has(von))
                return [`${runde.spieler[von]?.name ?? von} ist bereits mit einem anderen Profil zusammengeführt.`];
            const besucht = new Set();
            for (let x = nach; x !== undefined && !besucht.has(x); x = kante.get(x)) {
                if (x === von)
                    return ["Das würde einen Kreis ergeben: Die Profile sind schon in umgekehrter Richtung zusammengeführt."];
                besucht.add(x);
            }
            return [];
        }
        case "zusammenfuehrungAufgehoben": {
            const z = k.zusammenfuehrungen?.get(d["zusammenfuehrung"]);
            if (!z)
                return ["Diese Zusammenführung gibt es nicht."];
            return z.aufgehoben ? ["Diese Zusammenführung ist schon aufgehoben."] : [];
        }
        case "sitzungBegonnen":
            return menschenDa(d["plaetze"], spielerDa);
        default:
            break;
    }
    // Alles Weitere gehört zu einer Sitzung.
    const sitzung = k.sitzung;
    if (!sitzung)
        return ["Diese Sitzung gibt es auf diesem Gerät nicht."];
    const offen = () => (sitzung.abgeschlossen ? ["Der Abend ist abgeschlossen. Nimm ihn erst wieder auf, um etwas einzutragen."] : []);
    const nr = d["nr"];
    const spielDa = sitzung.spiele.some((s) => s.nr === nr);
    switch (typ) {
        case "plaetzeGeaendert": {
            const plaetze = d["plaetze"];
            const ki = sitzung.modus === "schreiber" && plaetze.some((p) => p.art === "ki") ? ["Im Schreiber sitzen nur Menschen am Tisch."] : [];
            return [...offen(), ...menschenDa(plaetze, spielerDa), ...ki];
        }
        case "profilGeaendert":
            return offen();
        case "sitzungAbgeschlossen":
            return sitzung.abgeschlossen ? ["Der Abend ist schon abgeschlossen."] : [];
        case "sitzungWiederaufgenommen":
            return sitzung.abgeschlossen ? [] : ["Der Abend ist noch offen."];
        case "spielEingetragen": {
            const fehler = [...offen()];
            if (nr !== sitzung.naechsteNr)
                fehler.push(`Als Nächstes ist Spiel ${sitzung.naechsteNr} dran, nicht ${nr}.`);
            fehler.push(...punkteZumTisch(d["punkte"], sitzung.plaetze));
            return fehler;
        }
        case "spielKorrigiert":
            return spielDa ? punkteZumTisch(d["punkte"], sitzung.plaetze) : [`Spiel ${nr} gibt es nicht.`];
        case "spielVerworfen":
            return spielDa ? [] : [`Spiel ${nr} gibt es nicht.`];
        case "spielNeuGegeben":
            return [...offen(), ...(nr === sitzung.naechsteNr ? [] : [`Neu gegeben werden kann nur Spiel ${sitzung.naechsteNr}.`])];
        default:
            return [];
    }
}
function menschenDa(plaetze, spielerDa) {
    return plaetze.every((p) => p.art === "ki" || spielerDa(p.spielerId)) ? [] : ["Am Tisch sitzt ein Spieler, den es in der Runde nicht gibt."];
}
function punkteZumTisch(punkte, plaetze) {
    const amTisch = plaetze.map(platzSchluessel).sort();
    const inPunkten = Object.keys(punkte).sort();
    return amTisch.join() === inPunkten.join() ? [] : ["Die Punkte passen nicht zu den Spielern, die gerade am Tisch sitzen."];
}
//# sourceMappingURL=bezug.js.map