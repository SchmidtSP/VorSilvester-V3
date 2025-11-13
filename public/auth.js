function qs(sel) {
  return document.querySelector(sel);
}

function showMessage(el, text, isError = false) {
  if (!el) return;
  el.hidden = false;
  el.textContent = text;
  el.classList.toggle('error', isError);
}

async function handleLoginPage() {
  const form = qs('#login-form');
  const msgEl = qs('#login-message');
  if (!form) return;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    showMessage(msgEl, 'Bejelentkezés...', false);
    const email = qs('#login-email').value.trim();
    const password = qs('#login-password').value;

    try {
      const res = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      });
      const data = await res.json();
      if (!res.ok) {
        showMessage(msgEl, data.error || 'Hibás adatok.', true);
        return;
      }
      showMessage(msgEl, 'Sikeres bejelentkezés, átirányítás...', false);
      setTimeout(() => {
        window.location.href = '/my-tickets';
      }, 600);
    } catch {
      showMessage(msgEl, 'Hálózati hiba.', true);
    }
  });
}

async function handleRegisterPage() {
  const form = qs('#register-form');
  const msgEl = qs('#register-message');
  if (!form) return;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    showMessage(msgEl, 'Regisztráció...', false);
    const email = qs('#reg-email').value.trim();
    const password = qs('#reg-password').value;

    try {
      const res = await fetch('/api/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      });
      const data = await res.json();
      if (!res.ok) {
        showMessage(msgEl, data.error || 'Hiba történt.', true);
        return;
      }
      showMessage(msgEl, 'Sikeres regisztráció, átirányítás...', false);
      setTimeout(() => {
        window.location.href = '/my-tickets';
      }, 600);
    } catch {
      showMessage(msgEl, 'Hálózati hiba.', true);
    }
  });
}

function mapTicketTypeLabel(type) {
  if (type === 'normal') return 'Belépő';
  if (type === 'dinner' || type === 'vip') return 'Belépő + vacsora';
  return type;
}

function mapTicketTagClass(type) {
  if (type === 'normal') return 'normal';
  if (type === 'dinner' || type === 'vip') return 'dinner';
  return '';
}

async function loadMyTickets() {
  const msgEl = qs('#mytickets-message');
  const listEl = qs('#mytickets-list');
  const logoutBtn = qs('#logout-btn');
  if (!listEl) return;

  try {
    const statusRes = await fetch('/api/auth/status');
    const status = await statusRes.json();
    if (!status.loggedIn) {
      showMessage(
        msgEl,
        'Ehhez az oldalhoz be kell jelentkezned. Kattints a „Bejelentkezés” gombra a felső menüben.',
        true
      );
      listEl.innerHTML = '';
      if (logoutBtn) logoutBtn.style.display = 'none';
      return;
    }
  } catch {
    showMessage(msgEl, 'Nem sikerült ellenőrizni a bejelentkezést.', true);
    return;
  }

  try {
    const res = await fetch('/api/my-tickets');
    const data = await res.json();
    if (!res.ok) {
      showMessage(msgEl, data.error || 'Nem sikerült lekérni a jegyeket.', true);
      return;
    }

    if (!Array.isArray(data) || data.length === 0) {
      showMessage(msgEl, 'Még nincs jegyed ezzel az e-mail címmel.', false);
      listEl.innerHTML = '';
      return;
    }

    msgEl.hidden = true;
    listEl.innerHTML = data
      .map((t) => {
        const date = new Date(t.created_at).toLocaleString('hu-HU');
        const typeLabel = mapTicketTypeLabel(t.ticket_type);
        const tagClass = mapTicketTagClass(t.ticket_type);
        const qrImg = t.qrDataUrl
          ? `<div class="ticket-qr"><img src="${t.qrDataUrl}" alt="QR kód" /></div>`
          : '';

        return `
          <div class="ticket-card">
            <div class="ticket-card-header">
              <div>
                <strong>${typeLabel}</strong>
                <div class="ticket-code">Kód: ${t.code}</div>
                <div class="ticket-meta">
                  <span>Mennyiség: <strong>${t.quantity}</strong></span> ·
                  <span>Végösszeg: <strong>${t.total_price} Ft</strong></span>
                </div>
                <div class="ticket-date">Vásárlás ideje: ${date}</div>
              </div>
              <span class="ticket-tag ${tagClass}">${typeLabel.toUpperCase()}</span>
            </div>
            ${qrImg}
          </div>
        `;
      })
      .join('');
  } catch {
    showMessage(msgEl, 'Hiba történt a jegyek betöltése közben.', true);
  }

  if (logoutBtn) {
    logoutBtn.addEventListener('click', async () => {
      try {
        await fetch('/api/logout', { method: 'POST' });
      } catch {
        // ignore
      }
      window.location.href = '/';
    });
  }
}

document.addEventListener('DOMContentLoaded', () => {
  const page = document.body.dataset.page;
  if (page === 'login') {
    handleLoginPage();
  } else if (page === 'register') {
    handleRegisterPage();
  } else if (page === 'my-tickets') {
    loadMyTickets();
  }
});
