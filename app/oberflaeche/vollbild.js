// Spec 017, Nachtrag H (Handy-Test 2026-11-13): Am Handy-Browser nimmt die Kopfzeile des Browsers dem quer gehaltenen
// Tisch die Höhe. Vollbild (wo der Browser es erlaubt, z. B. Android) und Querformat sperren. Am iPhone erlaubt Safari
// kein Vollbild für Seiten; dort hilft nur die Installation als App.
/** Kann dieser Browser die Seite im Vollbild zeigen? */
export function vollbildMoeglich() {
    return typeof document.documentElement.requestFullscreen === "function" && document.fullscreenEnabled !== false;
}
export function istVollbild() {
    return document.fullscreenElement !== null && document.fullscreenElement !== undefined;
}
/** Nur auf Touch-Geräten (Handy, Tablet) und nicht in der installierten App: Dort gibt es keine Browserleisten. */
export function vollbildSinnvoll(alsApp) {
    // Oberflächentests ändern ständig die Fenstergröße; das geht im Vollbild nicht (Schalter nur im Test gesetzt).
    try {
        if (localStorage.getItem("dulle.test.ohneVollbild"))
            return false;
    }
    catch { /* kein Speicher */ }
    return !alsApp && vollbildMoeglich() && matchMedia("(pointer: coarse)").matches;
}
/**
 * Vollbild an und Querformat sperren. Muss im selben Tipp wie die Aktion aufgerufen werden (Nutzergeste), daher vor
 * jedem `await` der eigentlichen Aktion. Fehler (abgelehnt, nicht erlaubt) stören nie.
 */
export function vollbildAn(quer = true) {
    if (!vollbildMoeglich() || istVollbild())
        return;
    void document.documentElement.requestFullscreen({ navigationUI: "hide" })
        .then(() => (quer ? querSperren() : undefined))
        .catch(() => undefined);
}
/** Querformat sperren, wenn im Vollbild (nur dort erlaubt der Browser es). Braucht keine Nutzergeste. */
export function querSperren() {
    if (!istVollbild())
        return;
    void (screen.orientation.lock?.("landscape") ?? Promise.resolve()).catch(() => undefined);
}
export function vollbildAus() {
    if (!istVollbild())
        return;
    try {
        screen.orientation.unlock?.();
    }
    catch { /* nicht gesperrt */ }
    void document.exitFullscreen().catch(() => undefined);
}
//# sourceMappingURL=vollbild.js.map