// Jegyárak (Ft) – igény szerint módosíthatod
const NORMAL_TICKET_PRICE = 3100;
const DINNER_TICKET_PRICE = 6100;

function qs(selector) {
  return document.querySelector(selector);
}

function showMessage(element, text, isError = false) {
  if (!element) return;
  element.hidden = false;
  element.textContent = text;
  element.classList.toggle('error', isError);
}

// Auth ellenőrzés jegyvásárláshoz
async function checkAuthForTicketForm() {
  const infoBox = qs('#ticket-auth-info');
  const emailInput = qs('#ticket-email');
  const submitBtn = qs('#ticket-submit-btn');
  const form = qs('#ticket-form');
  if (!form) return;

  try {
    const res = await fetch('/api/auth/status');
    const data = await res.json();

    if (!data.loggedIn) {
      // Letiltjuk az űrlapot
      form.querySelectorAll('input, select, button').forEach((el) => {
        el.disabled = true;
      });
      showMessage(
        infoBox,
        'Jegyet csak bejelentkezett felhasználók vásárolhatnak. Kérlek, jelentkezz be vagy regisztrálj a felső menüben.',
        true
      );
    } else {
      // Engedélyezett űrlap, előtöltjük az e-mail mezőt
      form.querySelectorAll('input, select, button').forEach((el) => {
        el.disabled = false;
      });
      if (emailInput && data.email) {
        emailInput.value = data.email;
      }
      infoBox.hidden = true;
    }
  } catch {
    showMessage(infoBox, 'Nem sikerült ellenőrizni a bejelentkezést.', true);
  }
}

// Jegyár automatikus számítás
function setupTicketPriceCalculation() {
  const qtyInput = qs('#ticket-quantity');
  const totalInput = qs('#ticket-total');
  const typeSelect = qs('#ticket-type');

  if (!qtyInput || !totalInput || !typeSelect) return;

  const recalc = () => {
    const qty = parseInt(qtyInput.value, 10) || 0;
    const type = typeSelect.value;
    let unitPrice = NORMAL_TICKET_PRICE;

    if (type === 'dinner') {
      unitPrice = DINNER_TICKET_PRICE;
    }

    const total = qty * unitPrice;
    totalInput.value = total > 0 ? total : '';
  };

  qtyInput.addEventListener('input', recalc);
  typeSelect.addEventListener('change', recalc);
  recalc();
}

// Jegyvásárlás űrlap
function setupTicketForm() {
  const form = qs('#ticket-form');
  const msgEl = qs('#ticket-message');
  if (!form) return;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (form.querySelector('button[type="submit"]').disabled) {
      return;
    }

    showMessage(msgEl, 'Feldolgozás...', false);

    const name = qs('#ticket-name').value.trim();
    const email = qs('#ticket-email').value.trim();
    const ticket_type = qs('#ticket-type').value;
    const quantity = parseInt(qs('#ticket-quantity').value, 10);
    const total_price = parseFloat(qs('#ticket-total').value);

    try {
      const res = await fetch('/api/tickets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, ticket_type, quantity, total_price })
      });

      const data = await res.json();
      if (!res.ok) {
        showMessage(msgEl, data.error || 'Hiba történt.', true);
        return;
      }

      showMessage(
        msgEl,
        `Sikeres jegyrendelés! Jegykód: ${data.ticket.code}. A jegyeidet a "Saját jegyeim" menüpont alatt is eléred.`,
        false
      );
      form.reset();
      await checkAuthForTicketForm();
      setupTicketPriceCalculation();
    } catch {
      showMessage(msgEl, 'Hálózati hiba. Próbáld újra.', true);
    }
  });
}

// Asztalfoglalás űrlap
function setupReservationForm() {
  const form = qs('#reservation-form');
  const msgEl = qs('#reservation-message');
  if (!form) return;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    showMessage(msgEl, 'Feldolgozás...', false);

    const payload = {
      name: qs('#res-name').value.trim(),
      email: qs('#res-email').value.trim(),
      phone: qs('#res-phone').value.trim(),
      guests: parseInt(qs('#res-guests').value, 10),
      notes: qs('#res-notes').value.trim()
    };

    try {
      const res = await fetch('/api/reservations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const data = await res.json();
      if (!res.ok) {
        showMessage(msgEl, data.error || 'Hiba történt.', true);
        return;
      }

      showMessage(msgEl, 'Sikeres foglalás! Hamarosan visszaigazoljuk e-mailben.', false);
      form.reset();
    } catch {
      showMessage(msgEl, 'Hálózati hiba. Próbáld újra.', true);
    }
  });
}

document.addEventListener('DOMContentLoaded', () => {
  checkAuthForTicketForm();
  setupTicketPriceCalculation();
  setupTicketForm();
  setupReservationForm();
});
