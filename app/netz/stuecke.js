// Große Nachrichten in Stücken (Spec 030): Chrome und Safari brechen Datenkanal-Nachrichten über etwa 256 KB ab, und die
// Ereignisse einer Runde werden mit der Zeit größer. Kein DOM.
/** Höchste Länge eines Stücks (Zeichen JSON); deutlich unter jeder Grenze der Browser. */
export const STUECK = 16_000;
const istStueck = (x) => typeof x === "object" && x !== null && typeof x["~"] === "string"
    && Number.isInteger(x.i) && Number.isInteger(x.n) && typeof x.d === "string";
let zaehler = 0;
/** JSON-Text in Rahmen zum Senden: kurze Nachrichten unverändert, lange als Stücke. */
export function zerlege(text, max = STUECK) {
    if (text.length <= max)
        return [text];
    const id = `${Date.now().toString(36)}-${(zaehler++).toString(36)}`;
    // Im Rahmen wird der Text noch einmal kodiert; Anführungszeichen und \ werden dabei doppelt so lang. Halbe Länge reicht sicher.
    const teil = Math.floor(max / 2) - 100;
    const n = Math.ceil(text.length / teil);
    return Array.from({ length: n }, (_, i) => JSON.stringify({ "~": id, i, n, d: text.slice(i * teil, (i + 1) * teil) }));
}
/** Setzt Stücke wieder zusammen. `nimm` liefert die fertige Nachricht oder null, solange noch Stücke fehlen. */
export class Zusammensetzer {
    offen = new Map();
    nimm(rahmen) {
        if (!istStueck(rahmen))
            return { fertig: true, nachricht: rahmen };
        const { n, i } = rahmen;
        if (n < 1 || n > 10_000 || i < 0 || i >= n)
            return { fertig: false };
        const teile = this.offen.get(rahmen["~"]) ?? new Array(n);
        teile[i] = rahmen.d;
        this.offen.set(rahmen["~"], teile);
        for (let k = 0; k < n; k++)
            if (teile[k] === undefined)
                return { fertig: false };
        this.offen.delete(rahmen["~"]);
        try {
            return { fertig: true, nachricht: JSON.parse(teile.join("")) };
        }
        catch {
            return { fertig: false };
        }
    }
}
//# sourceMappingURL=stuecke.js.map