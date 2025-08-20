const express = require('express');
const session = require('express-session');
const bodyParser = require('body-parser');
const bcrypt = require('bcrypt');
const { Pool } = require('pg');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// PostgreSQL connection pool using DATABASE_URL (Supabase)
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
});

// Set up middleware
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.static(path.join(__dirname, 'public')));
app.use(bodyParser.urlencoded({ extended: false }));
app.use(
  session({
    secret: process.env.SESSION_SECRET || 'secret',
    resave: false,
    saveUninitialized: false
  })
);

// Ensure roles and admin user exist
async function ensureAdmin() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    // Create minimal tables if not present
    await client.query(`
      CREATE TABLE IF NOT EXISTS roles (
        id SERIAL PRIMARY KEY,
        name VARCHAR(50) UNIQUE NOT NULL
      );
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        username VARCHAR(100) UNIQUE NOT NULL,
        password VARCHAR(200) NOT NULL,
        role_id INTEGER REFERENCES roles(id)
      );
    `);
    // Insert default roles if none
    const roleCountRes = await client.query('SELECT COUNT(*) FROM roles');
    const roleCount = parseInt(roleCountRes.rows[0].count, 10);
    if (roleCount === 0) {
      await client.query("INSERT INTO roles (name) VALUES ('admin'),('staff'),('volunteer')");
    }
    // Create default admin user if none
    const adminRes = await client.query("SELECT id FROM users WHERE username = 'admin'");
    if (adminRes.rows.length === 0) {
      const hashed = await bcrypt.hash('admin', 10);
      const roleRes = await client.query("SELECT id FROM roles WHERE name = 'admin' LIMIT 1");
      const adminRoleId = roleRes.rows[0].id;
      await client.query(
        'INSERT INTO users (username, password, role_id) VALUES ($1, $2, $3)',
        ['admin', hashed, adminRoleId]
      );
    }
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Error ensuring admin:', err);
  } finally {
    client.release();
  }
}

// Authentication middleware
function isAuthenticated(req, res, next) {
  if (req.session.userId) {
    return next();
  }
  res.redirect('/login');
}

// Home route
app.get('/', async (req, res) => {
  try {
    const [eventsRes, volunteersRes, productsRes, categoriesRes] = await Promise.all([
      pool.query('SELECT id, title, description, date, time, location FROM events ORDER BY date ASC'),
      pool.query('SELECT id, name, role, bio FROM volunteers ORDER BY id ASC'),
      pool.query('SELECT id, name, price, img, category_id FROM products ORDER BY id ASC'),
      pool.query('SELECT id, name FROM categories ORDER BY id ASC')
    ]);
    res.render('index', {
      events: eventsRes.rows,
      volunteers: volunteersRes.rows,
      products: productsRes.rows,
      categories: categoriesRes.rows,
      user: req.session.userId
    });
  } catch (err) {
    console.error(err);
    res.status(500).send("Erreur lors du chargement de la page d'accueil.");
  }
});

// Handle event registration
app.post('/register/:id', async (req, res) => {
  const eventId = parseInt(req.params.id, 10);
  const { name, email } = req.body;
  try {
    await pool.query(
      'INSERT INTO registrations (event_id, name, email) VALUES ($1, $2, $3)',
      [eventId, name, email]
    );
    res.redirect('/');
  } catch (err) {
    console.error(err);
    res.status(500).send("Erreur lors de l'inscription.");
  }
});

// Handle contact form
app.post('/contact', async (req, res) => {
  const { name, email, message } = req.body;
  try {
    await pool.query(
      'INSERT INTO contacts (name, email, message) VALUES ($1, $2, $3)',
      [name, email, message]
    );
    res.redirect('/');
  } catch (err) {
    console.error(err);
    res.status(500).send("Erreur lors de l'envoi du message.");
  }
});

// Show login page
app.get('/login', (req, res) => {
  res.render('login', { error: null });
});

// Process login
app.post('/login', async (req, res) => {
  const { username, password } = req.body;
  try {
    const userRes = await pool.query('SELECT id, password FROM users WHERE username = $1', [username]);
    if (userRes.rows.length === 0) {
      return res.render('login', { error: "Nom d'utilisateur inconnu" });
    }
    const user = userRes.rows[0];
    const match = await bcrypt.compare(password, user.password);
    if (!match) {
      return res.render('login', { error: 'Mot de passe incorrect' });
    }
    req.session.userId = user.id;
    res.redirect('/admin');
  } catch (err) {
    console.error(err);
    res.status(500).send('Erreur lors de la connexion.');
  }
});

// Logout
app.get('/logout', (req, res) => {
  req.session.destroy(() => {
    res.redirect('/');
  });
});

// Admin dashboard
app.get('/admin', isAuthenticated, async (req, res) => {
  try {
    const [eventsRes, registrationsRes, volunteersRes, contactsRes] = await Promise.all([
      pool.query('SELECT * FROM events ORDER BY date ASC'),
      pool.query('SELECT r.id, r.name, r.email, r.created_at, e.title FROM registrations r JOIN events e ON r.event_id = e.id ORDER BY r.created_at DESC'),
      pool.query('SELECT * FROM volunteers ORDER BY id ASC'),
      pool.query('SELECT * FROM contacts ORDER BY id DESC')
    ]);
    res.render('admin', {
      events: eventsRes.rows,
      registrations: registrationsRes.rows,
      volunteers: volunteersRes.rows,
      contacts: contactsRes.rows
    });
  } catch (err) {
    console.error(err);
    res.status(500).send('Erreur lors du chargement du tableau de bord.');
  }
});

// Add new event (admin)
app.post('/admin/add-event', isAuthenticated, async (req, res) => {
  const { title, description, date, time, location } = req.body;
  try {
    await pool.query(
      'INSERT INTO events (title, description, date, time, location) VALUES ($1, $2, $3, $4, $5)',
      [title, description, date, time, location]
    );
    res.redirect('/admin');
  } catch (err) {
    console.error(err);
    res.status(500).send("Erreur lors de l'ajout de l'événement.");
  }
});

// Add new volunteer (admin)
app.post('/admin/add-volunteer', isAuthenticated, async (req, res) => {
  const { name, role, bio } = req.body;
  try {
    await pool.query(
      'INSERT INTO volunteers (name, role, bio) VALUES ($1, $2, $3)',
      [name, role, bio]
    );
    res.redirect('/admin');
  } catch (err) {
    console.error(err);
    res.status(500).send("Erreur lors de l'ajout du bénévole.");
  }
});

// Initialize admin on startup
ensureAdmin().catch((err) => {
  console.error('Failed to ensure admin user:', err);
});

// Export the app for Vercel. Only listen locally if not on Vercel
if (!process.env.VERCEL) {
  app.listen(PORT, () => {
    console.log(`Serveur démarré sur http://localhost:${PORT}`);
  });
}

module.exports = app;
