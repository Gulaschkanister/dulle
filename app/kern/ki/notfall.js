// Notfall-KI (Spec 013): spielt regelkonform und einfach, ohne Ansagen. Sie bekommt nur die Sicht ihres Platzes,
// genau wie ein Mensch (netz-sicherheit, Wiederverbinden Regel 9). Gleiche Sicht ergibt den gleichen Zug.
// Erlaubte Importe (Test `ki.test.ts`): Typ `Sicht`, Kartenhilfen, Profil-Schalter, Typen.
import { augen, karte } from "../spiel/karten.js";
import { bedienFarbe, istTrumpf, rang, stichGewinner } from "../spiel/stich.js";
import { hochzeitKlaerung, soliErlaubt, zweiteDulle } from "../profile.js";
/** Der nächste Zug aus dieser Sicht, oder null, wenn die KI gerade nichts zu tun hat. */
export function kiZug(s, profil) {
    const ich = s.ich;
    switch (s.phase) {
        case "vorbehalt":
            return s.amZug === ich ? { typ: "vorbehalt", art: "gesund" } : null;
        case "vorbehaltArt": {
            // Nur, wenn der Mensch vor dem Ausfall „Vorbehalt“ gesagt hat: irgendein erlaubter Vorbehalt.
            if (s.amZug !== ich)
                return null;
            const m = s.moeglicheVorbehalte;
            if (m.includes("hochzeit"))
                return { typ: "vorbehalt", art: "hochzeit", ...(hochzeitKlaerung(profil) === null ? { klaerung: "fehl" } : {}) };
            if (m.includes("armut"))
                return { typ: "vorbehalt", art: "armut" };
            const solo = soliErlaubt(profil)[0];
            return solo ? { typ: "vorbehalt", art: "solo", soloart: solo } : null;
        }
        case "armutAngebot":
            return s.amZug === ich ? { typ: "armut", nimmt: false } : null;
        case "armutRueckgabe": {
            if (s.armut?.partner !== ich)
                return null;
            const k = kontextAus(s);
            // Wenigste Augen, Fehl vor Trumpf.
            const sortiert = [...s.hand].sort((a, b) => Number(istTrumpf(a, k)) - Number(istTrumpf(b, k)) || augen(a) - augen(b) || rang(b, k) - rang(a, k));
            return { typ: "rueckgabe", karten: sortiert.slice(0, s.armut.anzahl) };
        }
        case "spiel":
            return s.amZug === ich && s.erlaubteKarten.length > 0 ? { typ: "karte", karte: karteWaehlen(s, profil) } : null;
        default:
            return null;
    }
}
function kontextAus(s) {
    return { trumpf: s.solo?.soloart ?? "normal", schweinchen: s.schweinchen !== null };
}
/** Wenigste Augen, bei Gleichstand die schwächere Karte, dann die Reihenfolge der Hand. */
function wenigsteAugen(karten, k) {
    return [...karten].sort((a, b) => augen(a) - augen(b) || rang(b, k) - rang(a, k))[0];
}
function karteWaehlen(s, profil) {
    const k = kontextAus(s);
    const erlaubt = s.erlaubteKarten;
    // Ausspielen: Fehl-Ass einer Farbe, die noch nicht gelaufen ist; sonst niedrigste Fehlkarte; sonst niedrigster Trumpf.
    if (s.stich.length === 0) {
        const gelaufen = new Set(s.stiche.map((st) => bedienFarbe(st.karten[0].karte, k)));
        const ass = erlaubt.find((x) => !istTrumpf(x, k) && karte(x).wert === "A" && !gelaufen.has(karte(x).farbe));
        if (ass)
            return ass;
        const fehl = erlaubt.filter((x) => !istTrumpf(x, k));
        return wenigsteAugen(fehl.length > 0 ? fehl : erlaubt, k);
    }
    const stich = s.stich.map((g) => g.karte);
    const letzterStich = s.hand.length === 1;
    const dulle = zweiteDulle(profil);
    const vorn = s.stich[stichGewinner(stich, dulle, letzterStich, k)].platz;
    const binLetzter = s.stich.length === 3;
    // Nur, was die Sicht verrät: eigene Partei und öffentlich bekannte Parteien.
    const partnerVorn = s.eigenePartei !== null && s.bekanntePartei[vorn] === s.eigenePartei;
    if (partnerVorn && binLetzter)
        return [...erlaubt].sort((a, b) => augen(b) - augen(a) || rang(b, k) - rang(a, k))[0];
    if (!partnerVorn) {
        const gewinnen = erlaubt.filter((x) => stichGewinner([...stich, x], dulle, letzterStich, k) === stich.length);
        const imStich = stich.reduce((summe, x) => summe + augen(x), 0);
        // Niedrigste Karte, die gewinnt: die schwächste unter den Gewinnern.
        if (gewinnen.length > 0 && (imStich >= 10 || binLetzter))
            return [...gewinnen].sort((a, b) => rang(b, k) - rang(a, k) || augen(a) - augen(b))[0];
    }
    return wenigsteAugen(erlaubt, k);
}
//# sourceMappingURL=notfall.js.map