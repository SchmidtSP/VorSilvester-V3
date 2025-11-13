require('dotenv').config();

const express = require('express');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();
const crypto = require('crypto');
const session = require('express-session');
const bcrypt = require('bcrypt');
const QRCode = require('qrcode');
const { Resend } = require('resend');

const app = express();
const PORT = process.env.PORT || 3000;

// Konfiguráció
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'WemenderGJU';
const PUBLIC_BASE_URL = process.env.PUBLIC_BASE_URL || `http://localhost:${PORT}`;

const RESEND_API_KEY = process.env.RESEND_API_KEY;
const EMAIL_FROM = process.env.EMAIL_FROM || 'Wemender GJU <jegyek@example.com>';

let resend = null;
if (RESEND_API_KEY) {
  resend = new Resend(RESEND_API_KEY);
} else {
  console.log('Figyelem: nincs RESEND_API_KEY beállítva, e-mail nem lesz küldve.');
}

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(
  session({
    secret: 'wemender-gju-super-secret',
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      maxAge: 1000 * 60 * 60 * 2 // 2 óra
    }
  })
);

app.use(express.static(path.join(__dirname, 'public')));

// Adatbázis
const dbPath = path.join(__dirname, 'data.db');
const db = new sqlite3.Database(dbPath);

db.serialize(() => {
  db.run(
    `CREATE TABLE IF NOT EXISTS tickets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT NOT NULL,
      ticket_type TEXT NOT NULL,
      quantity INTEGER NOT NULL,
      total_price REAL NOT NULL,
      code TEXT UNIQUE NOT NULL,
      created_at TEXT NOT NULL
    )`
  );

  db.run(
    `CREATE TABLE IF NOT EXISTS reservations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT NOT NULL,
      phone TEXT,
      guests INTEGER NOT NULL,
      notes TEXT,
      created_at TEXT NOT NULL
    )`
  );

  db.run(
    `CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      created_at TEXT NOT NULL
    )`
  );
});

// Segédek
function requireLogin(req, res, next) {
  if (!req.session.userId) {
    return res.status(401).json({ error: 'Bejelentkezés szükséges a jegyvásárláshoz.' });
  }
  next();
}

function requireAdmin(req, res, next) {
  if (!req.session.isAdmin) {
    return res.status(401).json({ error: 'Admin jogosultság szükséges.' });
  }
  next();
}

function mapTicketTypeLabel(type) {
  if (type === 'normal') return 'Belépő';
  if (type === 'dinner' || type === 'vip') return 'Belépő + vacsora';
  return type;
}

async function generateTicketQr(code) {
  const verifyUrl = `${PUBLIC_BASE_URL.replace(/\/+$/, '')}/verify/${code}`;
  return QRCode.toDataURL(verifyUrl);
}

async function sendTicketEmail({ to, ticket, qrDataUrl }) {
  if (!resend || !EMAIL_FROM) {
    console.log('Resend nincs rendesen beállítva, e-mail nem kerül kiküldésre.');
    return;
  }

  const typeLabel = mapTicketTypeLabel(ticket.ticket_type);
  const verifyUrl = `${PUBLIC_BASE_URL.replace(/\/+$/, '')}/verify/${ticket.code}`;

  const html = `
    <div style="font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;">
      <h2>Wemender GJU – Jegyvisszaigazolás</h2>
      <p>Kedves ${ticket.name}!</p>
      <p>Sikeresen megvásároltad a(z) <strong>${typeLabel}</strong> jegyed.</p>
      <ul>
        <li>Mennyiség: <strong>${ticket.quantity}</strong></li>
        <li>Végösszeg: <strong>${ticket.total_price} Ft</strong></li>
        <li>Jegykód: <strong>${ticket.code}</strong></li>
      </ul>
      <p>A jegyed ellenőrzése itt is lehetséges: <a href="${verifyUrl}">${verifyUrl}</a></p>
      <p><strong>QR-kód a gyors beléptetéshez:</strong></p>
      <p><img src="${qrDataUrl}" alt="Jegy QR kód" /></p>
      <p>Üdv,<br />Wemender GJU</p>
    </div>
  `;

  await resend.emails.send({
    from: EMAIL_FROM,
    to,
    subject: 'Wemender GJU – Jegyvisszaigazolás',
    html
  });
}

// ---------- AUTH ----------

app.post('/api/register', async (req, res) => {
  const { email, password } = req.body || {};

  if (!email || !password) {
    return res.status(400).json({ error: 'E-mail és jelszó megadása kötelező.' });
  }

  try {
    const passwordHash = await bcrypt.hash(password, 10);
    const createdAt = new Date().toISOString();

    db.run(
      `INSERT INTO users (email, password_hash, created_at) VALUES (?, ?, ?)`,
      [email, passwordHash, createdAt],
      function (err) {
        if (err) {
          if (err.code === 'SQLITE_CONSTRAINT') {
            return res.status(400).json({ error: 'Ezzel az e-mail címmel már van regisztráció.' });
          }
          console.error(err);
          return res.status(500).json({ error: 'Adatbázis hiba.' });
        }

        req.session.userId = this.lastID;
        req.session.userEmail = email;
        return res.json({ message: 'Sikeres regisztráció és bejelentkezés.', email });
      }
    );
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Szerver hiba.' });
  }
});

app.post('/api/login', (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) {
    return res.status(400).json({ error: 'E-mail és jelszó megadása kötelező.' });
  }

  db.get(`SELECT * FROM users WHERE email = ?`, [email], async (err, user) => {
    if (err) {
      console.error(err);
      return res.status(500).json({ error: 'Adatbázis hiba.' });
    }
    if (!user) {
      return res.status(400).json({ error: 'Hibás e-mail vagy jelszó.' });
    }

    try {
      const ok = await bcrypt.compare(password, user.password_hash);
      if (!ok) {
        return res.status(400).json({ error: 'Hibás e-mail vagy jelszó.' });
      }

      req.session.userId = user.id;
      req.session.userEmail = user.email;
      return res.json({ message: 'Sikeres bejelentkezés.', email: user.email });
    } catch (e) {
      console.error(e);
      return res.status(500).json({ error: 'Szerver hiba.' });
    }
  });
});

app.post('/api/logout', (req, res) => {
  req.session.destroy(() => {
    res.json({ message: 'Kijelentkeztél.' });
  });
});

app.get('/api/auth/status', (req, res) => {
  if (req.session.userId) {
    return res.json({ loggedIn: true, email: req.session.userEmail || null });
  }
  res.json({ loggedIn: false });
});

// ---------- JEGYVÁSÁRLÁS + SAJÁT JEGYEIM ----------

app.post('/api/tickets', requireLogin, (req, res) => {
  const sessionEmail = req.session.userEmail;
  const { name, email, ticket_type, quantity, total_price } = req.body || {};

  if (!name || !ticket_type || !quantity || !total_price) {
    return res.status(400).json({ error: 'Minden mező kitöltése kötelező.' });
  }

  if (!email || email !== sessionEmail) {
    return res.status(400).json({
      error: `A jegyvásárláshoz ugyanazt az e-mail címet kell használnod, amivel be vagy jelentkezve: ${sessionEmail}.`
    });
  }

  if (!['normal', 'dinner'].includes(ticket_type)) {
    return res.status(400).json({ error: 'Érvénytelen jegytípus.' });
  }

  const qty = parseInt(quantity, 10);
  const total = parseFloat(total_price);
  if (!Number.isInteger(qty) || qty <= 0 || !Number.isFinite(total) || total <= 0) {
    return res.status(400).json({ error: 'Hibás mennyiség vagy végösszeg.' });
  }

  const code = crypto.randomBytes(4).toString('hex').toUpperCase();
  const createdAt = new Date().toISOString();

  db.run(
    `INSERT INTO tickets (name, email, ticket_type, quantity, total_price, code, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [name, sessionEmail, ticket_type, qty, total, code, createdAt],
    function (err) {
      if (err) {
        console.error(err);
        return res.status(500).json({ error: 'Adatbázis hiba.' });
      }

      const ticket = {
        id: this.lastID,
        name,
        email: sessionEmail,
        ticket_type,
        quantity: qty,
        total_price: total,
        code,
        created_at: createdAt
      };

      generateTicketQr(code)
        .then(async (qrDataUrl) => {
          try {
            await sendTicketEmail({ to: sessionEmail, ticket, qrDataUrl });
          } catch (e) {
            console.error('E-mail küldés sikertelen:', e.message);
          }

          res.json({
            message: 'Sikeres jegyrendelés.',
            ticket,
            qrDataUrl
          });
        })
        .catch((e) => {
          console.error('QR generálás sikertelen:', e.message);
          res.json({
            message: 'Sikeres jegyrendelés (QR nélkül).',
            ticket
          });
        });
    }
  );
});

app.get('/api/my-tickets', requireLogin, (req, res) => {
  const email = req.session.userEmail;
  if (!email) {
    return res.status(500).json({ error: 'Hiányzó felhasználói e-mail.' });
  }

  db.all(
    `SELECT * FROM tickets WHERE email = ? ORDER BY created_at DESC`,
    [email],
    async (err, rows) => {
      if (err) {
        console.error(err);
        return res.status(500).json({ error: 'Adatbázis hiba.' });
      }

      try {
        const ticketsWithQr = await Promise.all(
          rows.map(async (row) => {
            const qrDataUrl = await generateTicketQr(row.code);
            return { ...row, qrDataUrl };
          })
        );
        res.json(ticketsWithQr);
      } catch (e) {
        console.error('QR generálás hiba (my-tickets):', e.message);
        res.json(rows);
      }
    }
  );
});

// ---------- ASZTALFOGLALÁS ----------

app.post('/api/reservations', (req, res) => {
  const { name, email, phone, guests, notes } = req.body || {};

  if (!name || !email || !guests) {
    return res.status(400).json({ error: 'Név, e-mail és létszám megadása kötelező.' });
  }

  const g = parseInt(guests, 10);
  if (!Number.isInteger(g) || g <= 0) {
    return res.status(400).json({ error: 'A létszámnak pozitív egész számnak kell lennie.' });
  }

  const createdAt = new Date().toISOString();
  db.run(
    `INSERT INTO reservations (name, email, phone, guests, notes, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [name, email, phone || null, g, notes || null, createdAt],
    function (err) {
      if (err) {
        console.error(err);
        return res.status(500).json({ error: 'Adatbázis hiba.' });
      }
      return res.json({
        message: 'Sikeres foglalás.',
        reservation: {
          id: this.lastID,
          name,
          email,
          phone: phone || null,
          guests: g,
          notes: notes || null,
          created_at: createdAt
        }
      });
    }
  );
});

// ---------- ADMIN ----------

app.post('/api/admin/login', (req, res) => {
  const { password } = req.body || {};
  if (!password) {
    return res.status(400).json({ error: 'Jelszó megadása kötelező.' });
  }
  if (password !== ADMIN_PASSWORD) {
    return res.status(401).json({ error: 'Hibás admin jelszó.' });
  }
  req.session.isAdmin = true;
  res.json({ message: 'Sikeres admin bejelentkezés.' });
});

app.get('/api/admin/tickets', requireAdmin, (req, res) => {
  db.all(`SELECT * FROM tickets ORDER BY created_at DESC`, [], (err, rows) => {
    if (err) {
      console.error(err);
      return res.status(500).json({ error: 'Adatbázis hiba.' });
    }
    res.json(rows);
  });
});

app.post('/api/admin/tickets', requireAdmin, (req, res) => {
  const { name, email, ticket_type, quantity, total_price } = req.body || {};

  if (!name || !email || !ticket_type || !quantity || !total_price) {
    return res.status(400).json({ error: 'Minden mező kitöltése kötelező.' });
  }

  if (!['normal', 'dinner'].includes(ticket_type)) {
    return res.status(400).json({ error: 'Érvénytelen jegytípus.' });
  }

  const qty = parseInt(quantity, 10);
  const total = parseFloat(total_price);
  if (!Number.isInteger(qty) || qty <= 0 || !Number.isFinite(total) || total <= 0) {
    return res.status(400).json({ error: 'Hibás mennyiség vagy végösszeg.' });
  }

  const code = crypto.randomBytes(4).toString('hex').toUpperCase();
  const createdAt = new Date().toISOString();

  db.run(
    `INSERT INTO tickets (name, email, ticket_type, quantity, total_price, code, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [name, email, ticket_type, qty, total, code, createdAt],
    function (err) {
      if (err) {
        console.error(err);
        return res.status(500).json({ error: 'Adatbázis hiba.' });
      }
      res.json({
        message: 'Jegy hozzáadva.',
        ticket: {
          id: this.lastID,
          name,
          email,
          ticket_type,
          quantity: qty,
          total_price: total,
          code,
          created_at: createdAt
        }
      });
    }
  );
});

app.put('/api/admin/tickets/:id', requireAdmin, (req, res) => {
  const { id } = req.params;
  const { name, email, ticket_type, quantity, total_price } = req.body || {};

  if (!name || !email || !ticket_type || !quantity || !total_price) {
    return res.status(400).json({ error: 'Minden mező kitöltése kötelező.' });
  }

  if (!['normal', 'dinner'].includes(ticket_type)) {
    return res.status(400).json({ error: 'Érvénytelen jegytípus.' });
  }

  const qty = parseInt(quantity, 10);
  const total = parseFloat(total_price);
  if (!Number.isInteger(qty) || qty <= 0 || !Number.isFinite(total) || total <= 0) {
    return res.status(400).json({ error: 'Hibás mennyiség vagy végösszeg.' });
  }

  db.run(
    `UPDATE tickets
     SET name = ?, email = ?, ticket_type = ?, quantity = ?, total_price = ?
     WHERE id = ?`,
    [name, email, ticket_type, qty, total, id],
    function (err) {
      if (err) {
        console.error(err);
        return res.status(500).json({ error: 'Adatbázis hiba.' });
      }
      if (this.changes === 0) {
        return res.status(404).json({ error: 'Nincs ilyen jegy.' });
      }
      res.json({ message: 'Jegy módosítva.' });
    }
  );
});

app.delete('/api/admin/tickets/:id', requireAdmin, (req, res) => {
  const { id } = req.params;
  db.run(`DELETE FROM tickets WHERE id = ?`, [id], function (err) {
    if (err) {
      console.error(err);
      return res.status(500).json({ error: 'Adatbázis hiba.' });
    }
    if (this.changes === 0) {
      return res.status(404).json({ error: 'Nincs ilyen jegy.' });
    }
    res.json({ message: 'Jegy törölve.' });
  });
});

app.get('/api/admin/reservations', requireAdmin, (req, res) => {
  db.all(`SELECT * FROM reservations ORDER BY created_at DESC`, [], (err, rows) => {
    if (err) {
      console.error(err);
      return res.status(500).json({ error: 'Adatbázis hiba.' });
    }
    res.json(rows);
  });
});

app.post('/api/admin/reservations', requireAdmin, (req, res) => {
  const { name, email, phone, guests, notes } = req.body || {};
  if (!name || !email || !guests) {
    return res.status(400).json({ error: 'Név, e-mail és létszám megadása kötelező.' });
  }
  const g = parseInt(guests, 10);
  if (!Number.isInteger(g) || g <= 0) {
    return res.status(400).json({ error: 'A létszámnak pozitív egész számnak kell lennie.' });
  }
  const createdAt = new Date().toISOString();
  db.run(
    `INSERT INTO reservations (name, email, phone, guests, notes, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [name, email, phone || null, g, notes || null, createdAt],
    function (err) {
      if (err) {
        console.error(err);
        return res.status(500).json({ error: 'Adatbázis hiba.' });
      }
      res.json({
        message: 'Foglalás hozzáadva.',
        reservation: {
          id: this.lastID,
          name,
          email,
          phone: phone || null,
          guests: g,
          notes: notes || null,
          created_at: createdAt
        }
      });
    }
  );
});

app.put('/api/admin/reservations/:id', requireAdmin, (req, res) => {
  const { id } = req.params;
  const { name, email, phone, guests, notes } = req.body || {};
  if (!name || !email || !guests) {
    return res.status(400).json({ error: 'Név, e-mail és létszám megadása kötelező.' });
  }
  const g = parseInt(guests, 10);
  if (!Number.isInteger(g) || g <= 0) {
    return res.status(400).json({ error: 'A létszámnak pozitív egész számnak kell lennie.' });
  }

  db.run(
    `UPDATE reservations
     SET name = ?, email = ?, phone = ?, guests = ?, notes = ?
     WHERE id = ?`,
    [name, email, phone || null, g, notes || null, id],
    function (err) {
      if (err) {
        console.error(err);
        return res.status(500).json({ error: 'Adatbázis hiba.' });
      }
      if (this.changes === 0) {
        return res.status(404).json({ error: 'Nincs ilyen foglalás.' });
      }
      res.json({ message: 'Foglalás módosítva.' });
    }
  );
});

app.delete('/api/admin/reservations/:id', requireAdmin, (req, res) => {
  const { id } = req.params;
  db.run(`DELETE FROM reservations WHERE id = ?`, [id], function (err) {
    if (err) {
      console.error(err);
      return res.status(500).json({ error: 'Adatbázis hiba.' });
    }
    if (this.changes === 0) {
      return res.status(404).json({ error: 'Nincs ilyen foglalás.' });
    }
    res.json({ message: 'Foglalás törölve.' });
  });
});

// ---------- JEGY ELLENŐRZÉS ----------

app.get('/verify/:code', (req, res) => {
  const code = req.params.code;
  db.get(`SELECT * FROM tickets WHERE code = ?`, [code], (err, row) => {
    if (err) {
      console.error(err);
      return res.status(500).send('<h1>Hiba történt</h1>');
    }
    if (!row) {
      return res.send('<h1>Érvénytelen vagy nem létező jegykód.</h1>');
    }

    const typeLabel = mapTicketTypeLabel(row.ticket_type);

    return res.send(`
      <html>
        <head><title>Jegy ellenőrzés</title></head>
        <body style="font-family: sans-serif; text-align:center;">
          <h1>Érvényes jegy</h1>
          <p>Név: <strong>${row.name}</strong></p>
          <p>E-mail: <strong>${row.email}</strong></p>
          <p>Jegytípus: <strong>${typeLabel}</strong></p>
          <p>Mennyiség: <strong>${row.quantity}</strong></p>
          <p>Kód: <strong>${row.code}</strong></p>
        </body>
      </html>
    `);
  });
});

// Oldalak
app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

app.get('/my-tickets', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'my-tickets.html'));
});

app.listen(PORT, () => {
  console.log(`Server listening on ${PUBLIC_BASE_URL}`);
});
