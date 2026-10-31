// Schutz vor Datenverlust (Spec 000): Safari löscht Website-Speicher nach 7 Tagen ohne Nutzung,
// Home-Bildschirm-Apps sind davon ausgenommen. Die Oberfläche (Spec 001/003) zeigt den Hinweis.
/** Fragt dauerhaften Speicher an. Muss bei jedem Start erneut passieren. */
export async function bittePersistenz(speicher) {
    if (!speicher?.persist)
        return "nicht-verfuegbar";
    try {
        if (await speicher.persisted())
            return "dauerhaft";
        return (await speicher.persist()) ? "dauerhaft" : "abgelehnt";
    }
    catch {
        return "nicht-verfuegbar";
    }
}
/** Läuft die App im iPhone/iPad-Browser statt als Home-Bildschirm-App? Dann droht die 7-Tage-Löschung. */
export function brauchtHomeBildschirmHinweis(u) {
    const ios = /iPhone|iPad|iPod/.test(u.userAgent) || (/Macintosh/.test(u.userAgent) && u.maxTouchPoints > 1);
    const alsApp = u.standalone === true || u.displayModeStandalone;
    return ios && !alsApp;
}
//# sourceMappingURL=persistenz.js.map