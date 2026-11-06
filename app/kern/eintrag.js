// Spec 016: Ein Spiel eintragen, im Schreiber wie am Live-Tisch. Die Eingabe enthält nur, was der Spieler wählt.
// Nummer, Vorhand, Plätze und die Werte aus dem Profil kommen von dem Gerät, das schreibt. So rechnen Schreiber und
// Gastgeber-Gerät gleich, und ein Mitspieler kann keine Punkte vorgeben (Skill `netz-sicherheit`).
import { ansagenErlaubt, bockErlaubt, hochzeitPraemie, soloFaktor } from "./profile.js";
import { spielAusSchnell } from "./schnell.js";
import { spielAusRechner } from "./wertung.js";
export function spielAusEintrag(e, o) {
    const bock = bockErlaubt(o.profil) ? e.bock : 1;
    if (e.art === "schnell") {
        const praemie = hochzeitPraemie(o.profil);
        const { art: _, ...rest } = e;
        return spielAusSchnell({
            ...rest, nr: o.nr, vorhand: o.vorhand, amTisch: o.amTisch, bock, soloFaktor: soloFaktor(o.profil),
            ...(e.spielart === "hochzeit" && praemie !== null ? { praemie } : {}),
        });
    }
    const { art: _, ...rest } = e;
    return spielAusRechner({ ...rest, nr: o.nr, vorhand: o.vorhand, amTisch: o.amTisch, bock, ansagen: ansagenErlaubt(o.profil) ? e.ansagen : [] }, o.profil);
}
const istText = (x) => typeof x === "string" && x.length > 0 && x.length <= 64;
const istTexte = (x, max) => Array.isArray(x) && x.length <= max && x.every(istText);
const istGanz = (x, von, bis) => typeof x === "number" && Number.isInteger(x) && x >= von && x <= bis;
/**
 * Ein am Tisch abgeschickter Entwurf ist erledigt, wenn seine Nummer als eingetragenes Spiel im Block steht. Wurde er
 * abgelehnt oder die Nummer live gespielt, bleibt er (Spec 016).
 */
export function entwurfErledigt(gesendetNr, spiele) {
    return gesendetNr !== undefined && spiele.some((sp) => sp.nr === gesendetNr && sp.daten.eingabe !== "direkt");
}
/**
 * Prüft eine Eingabe, die von einem anderen Gerät kommt, auf ihre Form. Inhaltlich (wer am Tisch sitzt, gültige Augen)
 * prüft danach `spielAusEintrag`.
 */
export function istEintrag(x) {
    if (typeof x !== "object" || x === null)
        return false;
    const e = x;
    if (!istGanz(e["bock"], 1, 16))
        return false;
    if (e["art"] === "schnell") {
        return (e["spielart"] === "normal" || e["spielart"] === "solo" || e["spielart"] === "hochzeit") && istGanz(e["wert"], 0, 99)
            && (e["gewinner"] === undefined || istTexte(e["gewinner"], 4)) && (e["solist"] === undefined || istText(e["solist"]))
            && (e["hochzeiter"] === undefined || istText(e["hochzeiter"])) && (e["soloGewonnen"] === undefined || typeof e["soloGewonnen"] === "boolean")
            && (e["ohnePartner"] === undefined || typeof e["ohnePartner"] === "boolean")
            && (e["gewinnerPartei"] === undefined || e["gewinnerPartei"] === "re" || e["gewinnerPartei"] === "kontra");
    }
    if (e["art"] === "rechner") {
        const sp = e["sonderpunkte"];
        const ansageOk = (a) => typeof a === "object" && a !== null && ["re", "kontra"].includes(a["partei"])
            && ["ansage", "k90", "k60", "k30", "schwarz"].includes(a["stufe"]);
        return ["normal", "hochzeit", "solo", "stillesSolo"].includes(e["spielart"]) && istTexte(e["re"], 2) && istGanz(e["augenRe"], 0, 240)
            && Array.isArray(e["ansagen"]) && e["ansagen"].length <= 10 && e["ansagen"].every(ansageOk) && (e["soloart"] === undefined || istText(e["soloart"]))
            && (e["vorbehalt"] === undefined || e["vorbehalt"] === "armut") && (e["ohneStich"] === undefined || e["ohneStich"] === "re" || e["ohneStich"] === "kontra")
            && (sp === undefined || (typeof sp === "object" && sp !== null && Object.values(sp).every((v) => typeof v === "object" && v !== null
                && istGanz(v["re"], 0, 8) && istGanz(v["kontra"], 0, 8))));
    }
    return false;
}
//# sourceMappingURL=eintrag.js.map