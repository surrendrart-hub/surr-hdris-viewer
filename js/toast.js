/**
 * toast.js
 * ------------------------------------------------------------
 * Petit système de notifications "toast" coin haut-droit.
 * Utilisable depuis n'importe quel module via showToast().
 * ------------------------------------------------------------
 */

let host = null;

function ensureHost() {
    if (host) return host;
    host = document.getElementById('toast-host');
    if (!host) {
        host = document.createElement('div');
        host.id = 'toast-host';
        host.className = 'toast-host';
        document.body.appendChild(host);
    }
    return host;
}

/**
 * Affiche un toast 3s.
 * @param {string} msg
 * @param {'info'|'success'|'error'} [kind='info']
 * @param {number} [duration=3000]
 */
export function showToast(msg, kind = 'info', duration = 3000) {
    const h = ensureHost();
    const t = document.createElement('div');
    t.className = `toast toast-${kind}`;
    t.textContent = msg;
    h.appendChild(t);

    setTimeout(() => {
        t.classList.add('fade-out');
        setTimeout(() => t.remove(), 350);
    }, duration);
}
