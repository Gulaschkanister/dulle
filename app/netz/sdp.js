// Kompaktes Verbindungsformat für den QR-Tausch (Spec 010, übernommen aus Spike 009).
// Aus dem SDP bleibt nur, was ein reiner Datenkanal braucht: ICE-Zugangsdaten, Fingerabdruck, DTLS-Rolle, UDP-Kandidaten.
// Format: D1!<o|a>!<s|->!<ufrag>!<pwd>!<alg>!<fingerabdruck base64url>!<setup a|p|x>!<kandidat~kandidat…>
// Kandidat: <h|s|r|p>,<adresse>,<port>,<priorität>. Reine Funktionen, kein DOM.
const MAX_KANDIDATEN = 8;
function hexZuB64(hex) {
    const bytes = hex.split(":").map((x) => Number.parseInt(x, 16));
    return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function b64ZuHex(b64) {
    const s = atob(b64.replace(/-/g, "+").replace(/_/g, "/"));
    return [...s].map((c) => c.charCodeAt(0).toString(16).padStart(2, "0").toUpperCase()).join(":");
}
export function komprimiere(sdp, art, mitStun) {
    const zeilen = sdp.split(/\r?\n/);
    const wert = (k) => zeilen.find((z) => z.startsWith(`a=${k}:`))?.slice(k.length + 3).trim();
    const fingerabdruck = wert("fingerprint");
    const ufrag = wert("ice-ufrag");
    const pwd = wert("ice-pwd");
    if (!fingerabdruck || !ufrag || !pwd)
        throw new Error("Das Verbindungsangebot ist unvollständig.");
    const [alg, fp] = fingerabdruck.split(" ");
    const setup = { actpass: "x", active: "a", passive: "p" }[wert("setup") ?? ""] ?? "x";
    const kandidaten = zeilen.filter((z) => z.startsWith("a=candidate:")).map((z) => z.slice(12).split(" "))
        .filter((t) => t[1] === "1" && t[2]?.toLowerCase() === "udp")
        .map((t) => ({ typ: t[7] ?? "", adresse: t[4] ?? "", port: t[5] ?? "", prio: t[3] ?? "" }))
        .filter((k) => ["host", "srflx", "relay", "prflx"].includes(k.typ))
        .slice(0, MAX_KANDIDATEN)
        .map((k) => `${k.typ[0]},${k.adresse},${k.port},${k.prio}`);
    return ["D1", art === "offer" ? "o" : "a", mitStun ? "s" : "-", ufrag, pwd, alg, hexZuB64(fp), setup, kandidaten.join("~")].join("!");
}
export function entpacke(code) {
    const teile = code.trim().split("!");
    const [kennung, art, stun, ufrag, pwd, alg, fp, setup, kand] = teile;
    if (kennung !== "D1" || teile.length !== 9 || !ufrag || !pwd || !alg || !fp)
        throw new Error("Das ist kein Code von Dulle.");
    const typ = { h: "host", s: "srflx", r: "relay", p: "prflx" };
    const kandidaten = (kand ? kand.split("~") : []).map((k, i) => {
        const [t, adresse, port, prio] = k.split(",");
        const rel = t === "h" ? "" : " raddr 0.0.0.0 rport 0";
        return `a=candidate:${i + 1} 1 udp ${prio} ${adresse} ${port} typ ${typ[t ?? ""] ?? "host"}${rel}`;
    });
    const sdp = [
        "v=0", `o=- ${Date.now()} 2 IN IP4 127.0.0.1`, "s=-", "t=0 0", "a=group:BUNDLE 0", "a=msid-semantic: WMS",
        "m=application 9 UDP/DTLS/SCTP webrtc-datachannel", "c=IN IP4 0.0.0.0",
        ...kandidaten, "a=end-of-candidates",
        `a=ice-ufrag:${ufrag}`, `a=ice-pwd:${pwd}`, "a=ice-options:trickle",
        `a=fingerprint:${alg} ${b64ZuHex(fp)}`, `a=setup:${{ x: "actpass", a: "active", p: "passive" }[setup ?? "x"] ?? "actpass"}`,
        "a=mid:0", "a=sctp-port:5000", "a=max-message-size:262144", "",
    ].join("\r\n");
    return { art: art === "o" ? "offer" : "answer", stun: stun === "s", sdp };
}
/** Code aus einem gescannten Text holen: reiner Code oder Einladungs-Link (…#/beitreten/<code>). */
export function codeAusText(text) {
    const t = text.trim();
    const marke = "#/beitreten/";
    const i = t.indexOf(marke);
    return i >= 0 ? decodeURIComponent(t.slice(i + marke.length)) : t;
}
//# sourceMappingURL=sdp.js.map