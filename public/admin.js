function qs(sel) {
  return document.querySelector(sel);
}
function qsa(sel) {
  return Array.from(document.querySelectorAll(sel));
}
function showMessage(el, text, isError = false) {
  if (!el) return;
  el.hidden = false;
  el.textContent = text;
  el.classList.toggle('error', isError);
}

// Admin login
function setupAdminLogin() {
  const form = qs('#admin-login-form');
  const msgEl = qs('#admin-login-message');
  const panel = qs('#admin-panel');
  const loginSection = qs('#admin-login-section');
  if (!form) return;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const password = qs('#admin-password').value;
    showMessage(msgEl, 'Bejelentkezés...', false);

    try {
      const res = await fetch('/api/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password })
      });
      const data = await res.json();
      if (!res.ok) {
        showMessage(msgEl, data.error || 'Hibás jelszó.', true);
        return;
      }
      showMessage(msgEl, 'Sikeres admin belépés.', false);
      loginSection.hidden = true;
      panel.hidden = false;
      loadTickets();
      loadReservations();
    } catch {
      showMessage(msgEl, 'Hálózati hiba.', true);
    }
  });
}

// Tickets

async function loadTickets() {
  const tbody = qs('#tickets-table tbody');
  if (!tbody) return;
  tbody.innerHTML = '<tr><td colspan="8">Betöltés...</td></tr>';

  try {
    const res = await fetch('/api/admin/tickets');
    const data = await res.json();
    if (!res.ok) {
      tbody.innerHTML = `<tr><td colspan="8">Hiba: ${data.error || ''}</td></tr>`;
      return;
    }
    if (!Array.isArray(data) || data.length === 0) {
      tbody.innerHTML = '<tr><td colspan="8">Nincs jegy.</td></tr>';
      return;
    }

    tbody.innerHTML = '';
    data.forEach((t) => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${t.id}</td>
        <td>${t.name}</td>
        <td>${t.email}</td>
        <td>${t.ticket_type}</td>
        <td>${t.quantity}</td>
        <td>${t.total_price} Ft</td>
        <td>${t.code}</td>
        <td>
          <button class="btn btn-secondary btn-xs" data-action="edit" data-id="${t.id}">Szerkeszt</button>
          <button class="btn btn-secondary btn-xs" data-action="delete" data-id="${t.id}">Töröl</button>
        </td>
      `;
      tbody.appendChild(tr);
    });

    tbody.addEventListener('click', (e) => {
      const btn = e.target.closest('button[data-action]');
      if (!btn) return;
      const id = btn.dataset.id;
      const action = btn.dataset.action;
      if (action === 'edit') {
        fillTicketFormFromRow(id);
      } else if (action === 'delete') {
        deleteTicket(id);
      }
    });
  } catch {
    tbody.innerHTML = '<tr><td colspan="8">Hiba történt a betöltés során.</td></tr>';
  }
}

function fillTicketFormFromRow(id) {
  const row = qsa('#tickets-table tbody tr').find(
    (tr) => tr.children[0].textContent === String(id)
  );
  if (!row) return;
  qs('#admin-ticket-id').value = id;
  qs('#admin-ticket-name').value = row.children[1].textContent;
  qs('#admin-ticket-email').value = row.children[2].textContent;
  qs('#admin-ticket-type').value = row.children[3].textContent;
  qs('#admin-ticket-quantity').value = row.children[4].textContent;
  const totalText = row.children[5].textContent.replace(' Ft', '').trim();
  qs('#admin-ticket-total').value = totalText;
}

async function deleteTicket(id) {
  if (!confirm('Biztosan törlöd a jegyet?')) return;
  try {
    const res = await fetch(`/api/admin/tickets/${id}`, {
      method: 'DELETE'
    });
    const data = await res.json();
    if (!res.ok) {
      alert(data.error || 'Hiba történt törlés közben.');
      return;
    }
    loadTickets();
  } catch {
    alert('Hálózati hiba.');
  }
}

function setupTicketAdminForm() {
  const form = qs('#ticket-admin-form');
  const newBtn = qs('#admin-ticket-new');
  if (!form) return;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = qs('#admin-ticket-id').value || null;
    const payload = {
      name: qs('#admin-ticket-name').value.trim(),
      email: qs('#admin-ticket-email').value.trim(),
      ticket_type: qs('#admin-ticket-type').value,
      quantity: parseInt(qs('#admin-ticket-quantity').value, 10),
      total_price: parseFloat(qs('#admin-ticket-total').value)
    };

    const url = id ? `/api/admin/tickets/${id}` : '/api/admin/tickets';
    const method = id ? 'PUT' : 'POST';

    try {
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (!res.ok) {
        alert(data.error || 'Hiba mentés közben.');
        return;
      }
      clearTicketAdminForm();
      loadTickets();
    } catch {
      alert('Hálózati hiba.');
    }
  });

  if (newBtn) {
    newBtn.addEventListener('click', () => {
      clearTicketAdminForm();
    });
  }
}

function clearTicketAdminForm() {
  qs('#admin-ticket-id').value = '';
  qs('#admin-ticket-name').value = '';
  qs('#admin-ticket-email').value = '';
  qs('#admin-ticket-type').value = 'normal';
  qs('#admin-ticket-quantity').value = 1;
  qs('#admin-ticket-total').value = '';
}

// Reservations

async function loadReservations() {
  const tbody = qs('#reservations-table tbody');
  if (!tbody) return;
  tbody.innerHTML = '<tr><td colspan="7">Betöltés...</td></tr>';

  try {
    const res = await fetch('/api/admin/reservations');
    const data = await res.json();
    if (!res.ok) {
      tbody.innerHTML = `<tr><td colspan="7">Hiba: ${data.error || ''}</td></tr>`;
      return;
    }
    if (!Array.isArray(data) || data.length === 0) {
      tbody.innerHTML = '<tr><td colspan="7">Nincs foglalás.</td></tr>';
      return;
    }

    tbody.innerHTML = '';
    data.forEach((r) => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${r.id}</td>
        <td>${r.name}</td>
        <td>${r.email}</td>
        <td>${r.phone || ''}</td>
        <td>${r.guests}</td>
        <td>${r.notes || ''}</td>
        <td>
          <button class="btn btn-secondary btn-xs" data-action="edit" data-id="${r.id}">Szerkeszt</button>
          <button class="btn btn-secondary btn-xs" data-action="delete" data-id="${r.id}">Töröl</button>
        </td>
      `;
      tbody.appendChild(tr);
    });

    tbody.addEventListener('click', (e) => {
      const btn = e.target.closest('button[data-action]');
      if (!btn) return;
      const id = btn.dataset.id;
      const action = btn.dataset.action;
      if (action === 'edit') {
        fillResFormFromRow(id);
      } else if (action === 'delete') {
        deleteReservation(id);
      }
    });
  } catch {
    tbody.innerHTML = '<tr><td colspan="7">Hiba történt a betöltés során.</td></tr>';
  }
}

function fillResFormFromRow(id) {
  const row = qsa('#reservations-table tbody tr').find(
    (tr) => tr.children[0].textContent === String(id)
  );
  if (!row) return;
  qs('#admin-res-id').value = id;
  qs('#admin-res-name').value = row.children[1].textContent;
  qs('#admin-res-email').value = row.children[2].textContent;
  qs('#admin-res-phone').value = row.children[3].textContent;
  qs('#admin-res-guests').value = row.children[4].textContent;
  qs('#admin-res-notes').value = row.children[5].textContent;
}

async function deleteReservation(id) {
  if (!confirm('Biztosan törlöd a foglalást?')) return;
  try {
    const res = await fetch(`/api/admin/reservations/${id}`, {
      method: 'DELETE'
    });
    const data = await res.json();
    if (!res.ok) {
      alert(data.error || 'Hiba történt törlés közben.');
      return;
    }
    loadReservations();
  } catch {
    alert('Hálózati hiba.');
  }
}

function setupReservationAdminForm() {
  const form = qs('#reservation-admin-form');
  const newBtn = qs('#admin-res-new');
  if (!form) return;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = qs('#admin-res-id').value || null;
    const payload = {
      name: qs('#admin-res-name').value.trim(),
      email: qs('#admin-res-email').value.trim(),
      phone: qs('#admin-res-phone').value.trim(),
      guests: parseInt(qs('#admin-res-guests').value, 10),
      notes: qs('#admin-res-notes').value.trim()
    };

    const url = id ? `/api/admin/reservations/${id}` : '/api/admin/reservations';
    const method = id ? 'PUT' : 'POST';

    try {
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (!res.ok) {
        alert(data.error || 'Hiba mentés közben.');
        return;
      }
      clearResAdminForm();
      loadReservations();
    } catch {
      alert('Hálózati hiba.');
    }
  });

  if (newBtn) {
    newBtn.addEventListener('click', () => {
      clearResAdminForm();
    });
  }
}

function clearResAdminForm() {
  qs('#admin-res-id').value = '';
  qs('#admin-res-name').value = '';
  qs('#admin-res-email').value = '';
  qs('#admin-res-phone').value = '';
  qs('#admin-res-guests').value = 2;
  qs('#admin-res-notes').value = '';
}

document.addEventListener('DOMContentLoaded', () => {
  setupAdminLogin();
  setupTicketAdminForm();
  setupReservationAdminForm();
});
