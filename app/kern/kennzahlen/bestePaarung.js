import { hatGewonnen, partnerVon, spieleVon } from "./spiele.js";
export const MIN_GEMEINSAM = 5;
/** Mit wem gewinnt der Spieler am häufigsten? Nur Spiele 2 gegen 2, mindestens 5 gemeinsame. */
export const bestePaarung = {
    id: "beste-paarung",
    titel: "Beste Paarung",
    braucht: ["gewinner", "partner"],
    berechne(spiele, id) {
        const paar = spieleVon(spiele, id).map((s) => ({ s, partner: partnerVon(s, id) })).filter((x) => x.partner !== null);
        if (paar.length === 0)
            return null;
        const je = new Map();
        for (const { s, partner } of paar) {
            const z = je.get(partner) ?? { gewonnen: 0, gemeinsam: 0 };
            z.gemeinsam++;
            if (hatGewonnen(s, id))
                z.gewonnen++;
            je.set(partner, z);
        }
        const kandidaten = [...je].filter(([p, z]) => z.gemeinsam >= MIN_GEMEINSAM && !p.startsWith("ki-"))
            .sort((a, b) => b[1].gewonnen / b[1].gemeinsam - a[1].gewonnen / a[1].gemeinsam || b[1].gemeinsam - a[1].gemeinsam);
        const bester = kandidaten[0];
        return { wert: bester ? { partner: bester[0], ...bester[1] } : null, basis: paar.length };
    },
    format: (w, name = (id) => id) => (w ? `${name(w.partner)} ${Math.round((100 * w.gewonnen) / w.gemeinsam)} %` : "–"),
    hinweis: (w) => (w ? `aus ${w.gemeinsam} gemeinsamen Spielen` : `noch mit niemandem ${MIN_GEMEINSAM} Spiele zusammen`),
};
//# sourceMappingURL=bestePaarung.js.map