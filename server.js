const express = require('express');
const session = require('express-session');
const SQLiteStore = require('connect-sqlite3')(session);
const bodyParser = require('body-parser');
const bcrypt = require('bcrypt');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Initialize SQLite database
const dbPath = path.join(__dirname, 'data.db');
const db = new sqlite3.Database(dbPath);

// Create tables if they don't exist
db.serialize(() => {
  /**
   * Roles table – defines different user roles for finer-grained permissions
   */
  db.run(`CREATE TABLE IF NOT EXISTS roles (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE
  )`);
  /**
   * Users table – accounts for staff, volunteers and admin. Each user belongs to a role.
   */
  db.run(`CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    email TEXT UNIQUE,
    password TEXT NOT NULL,
    role_id INTEGER NOT NULL,
    FOREIGN KEY(role_id) REFERENCES roles(id)
  )`);
  /**
   * Volunteers table – separate table storing public profile information for team members. Each volunteer may be linked to a user account but remains optional.
   */
  db.run(`CREATE TABLE IF NOT EXISTS volunteers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    position TEXT NOT NULL,
    bio TEXT,
    photo TEXT,
    user_id INTEGER,
    FOREIGN KEY(user_id) REFERENCES users(id)
  )`);
  /**
   * Events table – stores scheduled events and workshops. Normalised fields separate date and time values for sorting.
   */
  db.run(`CREATE TABLE IF NOT EXISTS events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    description TEXT,
    date TEXT NOT NULL,
    start_time TEXT NOT NULL,
    end_time TEXT,
    location TEXT NOT NULL,
    cost TEXT,
    capacity INTEGER
  )`);
  /**
   * Registrations table – collects sign‑ups for events. Each registration references a specific event.
   */
  db.run(`CREATE TABLE IF NOT EXISTS registrations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    event_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    email TEXT NOT NULL,
    phone TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY(event_id) REFERENCES events(id)
  )`);
  /**
   * Categories table – used to categorise products for the shop (e.g. merch, broc).
   */
  db.run(`CREATE TABLE IF NOT EXISTS categories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE
  )`);
  /**
   * Products table – inventory for the shop. Each product belongs to a category.
   */
  db.run(`CREATE TABLE IF NOT EXISTS products (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    description TEXT,
    price REAL NOT NULL,
    image TEXT,
    category_id INTEGER NOT NULL,
    FOREIGN KEY(category_id) REFERENCES categories(id)
  )`);
  /**
   * Orders table – represents a customer order. Orders may be placed by anonymous visitors (user_id optional).
   */
  db.run(`CREATE TABLE IF NOT EXISTS orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    name TEXT,
    email TEXT,
    phone TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    total REAL NOT NULL,
    FOREIGN KEY(user_id) REFERENCES users(id)
  )`);
  /**
   * Order items table – line items for each order.
   */
  db.run(`CREATE TABLE IF NOT EXISTS order_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    order_id INTEGER NOT NULL,
    product_id INTEGER NOT NULL,
    quantity INTEGER NOT NULL,
    price REAL NOT NULL,
    FOREIGN KEY(order_id) REFERENCES orders(id),
    FOREIGN KEY(product_id) REFERENCES products(id)
  )`);
  /**
   * Contacts table – stores contact form submissions for follow‑up.
   */
  db.run(`CREATE TABLE IF NOT EXISTS contacts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT NOT NULL,
    phone TEXT,
    subject TEXT,
    message TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`);

  // Seed roles if none exist
  db.get('SELECT COUNT(*) AS cnt FROM roles', (err, row) => {
    if (row && row.cnt === 0) {
      const stmt = db.prepare('INSERT INTO roles (name) VALUES (?), (?), (?)');
      stmt.run('admin', 'staff', 'volunteer');
      stmt.finalize();
    }
  });
  // Seed default admin if none exist
  db.get('SELECT COUNT(*) AS cnt FROM users', (err, row) => {
    if (row && row.cnt === 0) {
      // default admin credentials: admin/admin
      bcrypt.hash('admin', 10, (errHash, hash) => {
        if (!errHash) {
          db.get('SELECT id FROM roles WHERE name = ?', ['admin'], (errRole, roleRow) => {
            const roleId = roleRow ? roleRow.id : 1;
            db.run('INSERT INTO users (username, password, role_id) VALUES (?, ?, ?)', ['admin', hash, roleId]);
          });
        }
      });
    }
  });
  // Seed volunteers if none exist
  db.get('SELECT COUNT(*) AS cnt FROM volunteers', (err, row) => {
    if (row && row.cnt === 0) {
      const stmt = db.prepare('INSERT INTO volunteers (name, position, bio, photo) VALUES (?, ?, ?, ?)');
      stmt.run('Alice Martin', 'Coordinatrice numérique', 'Anime des ateliers d\u2019initiation au numérique et aide les usagers à se familiariser avec les outils en ligne.', 'https://images.unsplash.com/photo-1502685104226-ee32379fefbe?auto=format&fit=crop&w=400&q=60');
      stmt.run('Jean Dupont', 'Juriste bénévole', 'Offre des consultations gratuites sur les droits sociaux et oriente les bénéficiaires vers les partenaires appropriés.', 'https://images.unsplash.com/photo-1607746882042-944635dfe10e?auto=format&fit=crop&w=400&q=60');
      stmt.run('Sophie Leblanc', 'Responsable Resto/Broc', 'Gère le restaurant et la brocante solidaire, tout en favorisant l\u2019insertion des bénévoles en cuisine et en salle.', 'https://images.unsplash.com/photo-1550525811-e5869dd03032?auto=format&fit=crop&w=400&q=60');
      stmt.finalize();
    }
  });
  // Seed events if none exist
  db.get('SELECT COUNT(*) AS cnt FROM events', (err, row) => {
    if (row && row.cnt === 0) {
      const stmt = db.prepare('INSERT INTO events (title, description, date, start_time, end_time, location, cost, capacity) VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
      stmt.run('Atelier "Premiers pas numériques"', 'Créer une adresse mail, mots de passe, sécurité', '2025-09-21', '10:00', '12:00', 'Maison des Associations', 'gratuit', 10);
      stmt.run('Permanence juridique (droits sociaux)', 'Première information, orientation et aide aux courriers.', '2025-09-25', '14:00', '17:00', 'Salle 2', 'gratuit', null);
      stmt.run('Soirée "Chiner & Dîner"', 'Soirée spéciale au Resto/Broc avec plat unique.', '2025-10-12', '19:30', null, 'Resto/Broc', 'prix solidaire', null);
      stmt.finalize();
    }
  });
  // Seed categories and products
  db.get('SELECT COUNT(*) AS cnt FROM categories', (err, row) => {
    if (row && row.cnt === 0) {
      db.run('INSERT INTO categories (name) VALUES (?), (?)', ['merch', 'broc']);
    }
  });
  db.get('SELECT COUNT(*) AS cnt FROM products', (err, row) => {
    if (row && row.cnt === 0) {
      // Insert products with corresponding categories
      db.get('SELECT id FROM categories WHERE name = ?', ['merch'], (errMerch, merchRow) => {
        db.get('SELECT id FROM categories WHERE name = ?', ['broc'], (errBroc, brocRow) => {
          const merchId = merchRow ? merchRow.id : 1;
          const brocId = brocRow ? brocRow.id : 2;
          const stmt = db.prepare('INSERT INTO products (name, description, price, image, category_id) VALUES (?, ?, ?, ?, ?)');
          // Merch items
          stmt.run('T-shirt PACS/SIMPA', 'Coton bio – Blanc', 20.0, 'https://images.unsplash.com/photo-1520975682031-ae7c8b1a9a02?q=80&w=1200&auto=format&fit=crop', merchId);
          stmt.run('Hoodie', 'Molleton doux – Bleu', 38.0, 'https://images.unsplash.com/photo-1548883354-7622d03aca27?q=80&w=1200&auto=format&fit=crop', merchId);
          stmt.run('Tote Bag', 'Coton épais', 12.0, 'https://images.unsplash.com/photo-1618354691438-c1d83adfb4b3?q=80&w=1200&auto=format&fit=crop', merchId);
          // Brocante items
          stmt.run('Service d\u2019assiettes vintage (x6)', 'Porcelaine – État : Très bon', 28.0, 'https://images.unsplash.com/photo-1523419409543-8c1b9b9aa4a0?q=80&w=1200&auto=format&fit=crop', brocId);
          stmt.finalize();
        });
      });
    }
  });
});

// Session configuration
app.use(session({
  store: new SQLiteStore({ db: 'sessions.db', dir: __dirname }),
  secret: 'replace-with-a-secure-secret',
  resave: false,
  saveUninitialized: false
}));

app.use(bodyParser.urlencoded({ extended: false }));
// Serve static assets (CSS, JS, images)
app.use(express.static(path.join(__dirname, 'public')));
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Middleware to expose user to views
app.use((req, res, next) => {
  res.locals.user = req.session.user || null;
  next();
});

// Helper to fetch common data (events, volunteers, products) for the homepage
function fetchHomeData(callback) {
  db.all('SELECT * FROM events ORDER BY date ASC', [], (errEvents, events) => {
    if (errEvents) return callback(errEvents);
    db.all('SELECT * FROM volunteers', [], (errVol, volunteers) => {
      if (errVol) return callback(errVol);
      // get categories and products
      db.all(`SELECT p.*, c.name AS category_name FROM products p JOIN categories c ON p.category_id = c.id`, [], (errProd, products) => {
        if (errProd) return callback(errProd);
        callback(null, { events, volunteers, products });
      });
    });
  });
}

// Home page
app.get('/', (req, res) => {
  fetchHomeData((err, data) => {
    if (err) return res.status(500).send('Erreur lors du chargement des données');
    const { events, volunteers, products } = data;
    res.render('index', {
      events,
      volunteers,
      products,
      success: req.query.success === '1',
      contactSuccess: req.query.contact === '1'
    });
  });
});

// Event registration handler
app.post('/events/register', (req, res) => {
  const { event_id, name, email, phone } = req.body;
  if (!event_id || !name || !email) {
    return res.status(400).send('Tous les champs requis manquent.');
  }
  db.run('INSERT INTO registrations (event_id, name, email, phone) VALUES (?, ?, ?, ?)', [event_id, name, email, phone || null], (err) => {
    if (err) return res.status(500).send('Erreur lors de l\u2019inscription à l\u2019atelier.');
    res.redirect('/?success=1');
  });
});

// Contact form handler
app.post('/contact', (req, res) => {
  const { name, email, phone, subject, message } = req.body;
  if (!name || !email || !message) {
    return res.status(400).send('Veuillez remplir les champs obligatoires.');
  }
  db.run('INSERT INTO contacts (name, email, phone, subject, message) VALUES (?, ?, ?, ?, ?)', [name, email, phone || null, subject || null, message], (err) => {
    if (err) return res.status(500).send('Erreur lors de l\u2019enregistrement du message.');
    res.redirect('/?contact=1');
  });
});

// Login page
app.get('/login', (req, res) => {
  res.render('login', { error: null });
});

// Login submission
app.post('/login', (req, res) => {
  const { username, password } = req.body;
  db.get('SELECT u.*, r.name AS role_name FROM users u JOIN roles r ON u.role_id = r.id WHERE u.username = ?', [username], (err, user) => {
    if (err) return res.render('login', { error: 'Erreur de base de données.' });
    if (!user) return res.render('login', { error: 'Utilisateur inconnu.' });
    bcrypt.compare(password, user.password, (err2, same) => {
      if (err2 || !same) return res.render('login', { error: 'Mot de passe incorrect.' });
      req.session.user = { id: user.id, username: user.username, role: user.role_name };
      res.redirect('/admin');
    });
  });
});

// Logout
app.get('/logout', (req, res) => {
  req.session.destroy(() => {
    res.redirect('/');
  });
});

// Protect admin routes
function requireAdmin(req, res, next) {
  if (!req.session.user || req.session.user.role !== 'admin') {
    return res.redirect('/login');
  }
  next();
}

// Admin dashboard
app.get('/admin', requireAdmin, (req, res) => {
  // Fetch events, registrations, volunteers, contacts and orders for overview
  db.all('SELECT * FROM events ORDER BY date ASC', [], (errEv, events) => {
    if (errEv) return res.status(500).send('Erreur lors de la récupération des événements');
    db.all('SELECT r.*, e.title AS event_title FROM registrations r JOIN events e ON r.event_id = e.id ORDER BY r.created_at DESC', [], (errReg, registrations) => {
      if (errReg) return res.status(500).send('Erreur lors de la récupération des inscriptions');
      db.all('SELECT * FROM volunteers', [], (errVol, volunteers) => {
        if (errVol) return res.status(500).send('Erreur lors de la récupération des bénévoles');
        db.all('SELECT * FROM contacts ORDER BY created_at DESC', [], (errCon, contacts) => {
          if (errCon) return res.status(500).send('Erreur lors de la récupération des messages');
          db.all('SELECT o.*, COUNT(oi.id) AS items FROM orders o LEFT JOIN order_items oi ON o.id = oi.order_id GROUP BY o.id ORDER BY o.created_at DESC', [], (errOrd, orders) => {
            if (errOrd) return res.status(500).send('Erreur lors de la récupération des commandes');
            res.render('admin', { events, registrations, volunteers, contacts, orders });
          });
        });
      });
    });
  });
});

// Add new event (admin)
app.post('/admin/events/add', requireAdmin, (req, res) => {
  const { title, description, date, start_time, end_time, location, cost, capacity } = req.body;
  if (!title || !date || !start_time || !location) {
    return res.status(400).send('Champs obligatoires manquants.');
  }
  db.run('INSERT INTO events (title, description, date, start_time, end_time, location, cost, capacity) VALUES (?, ?, ?, ?, ?, ?, ?, ?)', [title, description || null, date, start_time, end_time || null, location, cost || null, capacity || null], (err) => {
    if (err) return res.status(500).send('Erreur lors de la création de l’événement');
    res.redirect('/admin');
  });
});

// Add new volunteer (admin)
app.post('/admin/volunteers/add', requireAdmin, (req, res) => {
  const { name, position, bio, photo } = req.body;
  if (!name || !position) {
    return res.status(400).send('Nom et poste obligatoires.');
  }
  db.run('INSERT INTO volunteers (name, position, bio, photo) VALUES (?, ?, ?, ?)', [name, position, bio || null, photo || null], (err) => {
    if (err) return res.status(500).send('Erreur lors de la création du bénévole');
    res.redirect('/admin');
  });
});

// TODO: endpoints for creating/editing/deleting events, volunteers, products could be added here

// Start server when not on Vercel
if (!process.env.VERCEL) {
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

module.exports = app;
