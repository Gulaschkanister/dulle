// ULID: 48 Bit Zeit + 80 Bit Zufall, Crockford-Base32, 26 Zeichen.
// Monoton: Innerhalb derselben Millisekunde (oder wenn die Uhr zurückspringt) wird der
// Zufallsteil hochgezählt, damit IDs eines Geräts immer aufsteigend sortieren.
const ZEICHEN = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
const ULID_MUSTER = /^[0-9A-HJKMNP-TV-Z]{26}$/;
let letzteZeit = -1;
let letzterZufall = [];
export function istUlid(wert) {
    return typeof wert === "string" && ULID_MUSTER.test(wert);
}
export function neueUlid(jetzt = Date.now()) {
    if (jetzt <= letzteZeit) {
        letzterZufall = erhoehe(letzterZufall);
    }
    else {
        letzteZeit = jetzt;
        letzterZufall = zufall();
    }
    return kodiereZeit(letzteZeit) + letzterZufall.map((z) => ZEICHEN[z]).join("");
}
function kodiereZeit(zeit) {
    let rest = zeit;
    let text = "";
    for (let i = 0; i < 10; i++) {
        text = ZEICHEN[rest % 32] + text;
        rest = Math.floor(rest / 32);
    }
    return text;
}
function zufall() {
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    return Array.from(bytes, (b) => b % 32);
}
function erhoehe(stellen) {
    const neu = [...stellen];
    for (let i = neu.length - 1; i >= 0; i--) {
        const stelle = neu[i] ?? 0;
        if (stelle < 31) {
            neu[i] = stelle + 1;
            return neu;
        }
        neu[i] = 0;
    }
    throw new Error("ULID-Zufallsteil übergelaufen");
}
//# sourceMappingURL=ulid.js.map