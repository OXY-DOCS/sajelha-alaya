const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');
const crypto = require('crypto');

const PORT = process.env.PORT || 3000;
const DB_PATH = path.join(__dirname, 'database.json');
const PUBLIC = __dirname; // Serve from root (files are in root on GitHub)

// Session store (in-memory for simplicity, persists while server runs)
const sessions = new Map();

function loadDB() {
  if (!fs.existsSync(DB_PATH)) {
    const initial = {
      users: [
        { id: 1, username: 'oxy', password: '200767@', role: 'user' },
        { id: 2, username: 'admin', password: '200200', role: 'admin' }
      ],
      customers: [],
      transactions: [],
      nextCustomerId: 1,
      nextTransactionId: 1
    };
    fs.writeFileSync(DB_PATH, JSON.stringify(initial, null, 2));
    return initial;
  }
  return JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
}

function saveDB(db) {
  fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2));
}

function parseCookies(req) {
  const list = {};
  const cookieHeader = req.headers.cookie;
  if (!cookieHeader) return list;
  cookieHeader.split(';').forEach(cookie => {
    const parts = cookie.split('=');
    list[parts[0].trim()] = decodeURIComponent(parts[1] || '');
  });
  return list;
}

function getSession(req) {
  const cookies = parseCookies(req);
  const sid = cookies.sid;
  if (sid && sessions.has(sid)) return sessions.get(sid);
  return null;
}

function setSession(res, user) {
  const sid = crypto.randomBytes(16).toString('hex');
  sessions.set(sid, user);
  res.setHeader('Set-Cookie', `sid=${sid}; Path=/; HttpOnly; Max-Age=86400`);
  return sid;
}

function clearSession(req, res) {
  const cookies = parseCookies(req);
  if (cookies.sid) sessions.delete(cookies.sid);
  res.setHeader('Set-Cookie', 'sid=; Path=/; HttpOnly; Max-Age=0');
}

function sendJSON(res, data, status = 200) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(data));
}

function sendFile(res, filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const types = {
    '.html': 'text/html; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.json': 'application/json'
  };
  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404);
      res.end('Not found');
      return;
    }
    res.writeHead(200, { 'Content-Type': types[ext] || 'text/plain' });
    res.end(data);
  });
}

const server = http.createServer((req, res) => {
  const parsed = url.parse(req.url, true);
  const pathname = parsed.pathname;
  const method = req.method;

  // CORS
  res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  // API Routes
  if (pathname.startsWith('/api/')) {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      let data = {};
      try { if (body) data = JSON.parse(body); } catch (e) {}

      const session = getSession(req);

      // Login
      if (pathname === '/api/login' && method === 'POST') {
        const db = loadDB();
        const user = db.users.find(u => u.username === data.username && u.password === data.password);
        if (!user) return sendJSON(res, { error: 'اسم المستخدم أو كلمة المرور غير صحيحة' }, 401);
        setSession(res, { id: user.id, username: user.username, role: user.role });
        return sendJSON(res, { success: true, user: { id: user.id, username: user.username, role: user.role } });
      }

      // Logout
      if (pathname === '/api/logout' && method === 'POST') {
        clearSession(req, res);
        return sendJSON(res, { success: true });
      }

      // Me
      if (pathname === '/api/me' && method === 'GET') {
        if (!session) return sendJSON(res, { error: 'غير مسجل' }, 401);
        return sendJSON(res, session);
      }

      // Require auth for the rest
      if (!session) return sendJSON(res, { error: 'غير مصرح' }, 401);

      // Customers list
      if (pathname === '/api/customers' && method === 'GET') {
        const search = (parsed.query.search || '').toLowerCase();
        const db = loadDB();
        let customers = db.customers.map(c => {
          const trans = db.transactions.filter(t => t.customer_id === c.id);
          const balance = trans.reduce((sum, t) => sum + (t.type === 'debt' ? t.amount : -t.amount), 0);
          const first = trans.length ? trans.map(t => t.date).sort()[0] : null;
          return { ...c, balance, first_transaction: first };
        });
        if (search) {
          customers = customers.filter(c => c.name.toLowerCase().includes(search) || c.phone.includes(search));
        }
        customers.sort((a, b) => a.name.localeCompare(b.name, 'ar'));
        return sendJSON(res, customers);
      }

      // Add customer
      if (pathname === '/api/customers' && method === 'POST') {
        const { name, phone } = data;
        if (!name || !phone) return sendJSON(res, { error: 'الاسم والهاتف مطلوبان' }, 400);
        const db = loadDB();
        const customer = { id: db.nextCustomerId++, name, phone, created_at: new Date().toISOString() };
        db.customers.push(customer);
        saveDB(db);
        return sendJSON(res, customer);
      }

      // Customer detail
      const custMatch = pathname.match(/^\/api\/customers\/(\d+)$/);
      if (custMatch && method === 'GET') {
        const id = parseInt(custMatch[1]);
        const db = loadDB();
        const customer = db.customers.find(c => c.id === id);
        if (!customer) return sendJSON(res, { error: 'الزبون غير موجود' }, 404);
        const transactions = db.transactions
          .filter(t => t.customer_id === id)
          .sort((a, b) => new Date(b.date) - new Date(a.date) || b.id - a.id);
        const balance = transactions.reduce((sum, t) => sum + (t.type === 'debt' ? t.amount : -t.amount), 0);
        return sendJSON(res, { ...customer, transactions, balance });
      }

      // Add transaction
      const transMatch = pathname.match(/^\/api\/customers\/(\d+)\/transactions$/);
      if (transMatch && method === 'POST') {
        const id = parseInt(transMatch[1]);
        const { type, amount, date } = data;
        if (!['debt', 'payment'].includes(type) || !amount || amount <= 0 || !date) {
          return sendJSON(res, { error: 'بيانات غير صحيحة' }, 400);
        }
        const db = loadDB();
        if (!db.customers.find(c => c.id === id)) return sendJSON(res, { error: 'الزبون غير موجود' }, 404);
        const trans = {
          id: db.nextTransactionId++,
          customer_id: id,
          type,
          amount: parseFloat(amount),
          date,
          created_at: new Date().toISOString()
        };
        db.transactions.push(trans);
        saveDB(db);
        return sendJSON(res, trans);
      }

      // Stats (admin only)
      if (pathname === '/api/stats' && method === 'GET') {
        if (session.role !== 'admin') return sendJSON(res, { error: 'صلاحيات غير كافية' }, 403);
        const db = loadDB();
        const now = new Date();
        const today = now.toISOString().split('T')[0];
        const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
        const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];

        const total = db.transactions.reduce((sum, t) => sum + (t.type === 'debt' ? t.amount : -t.amount), 0);
        const daily = db.transactions.filter(t => t.date === today && t.type === 'debt').reduce((s, t) => s + t.amount, 0);
        const weekly = db.transactions.filter(t => t.date >= weekAgo && t.type === 'debt').reduce((s, t) => s + t.amount, 0);
        const monthly = db.transactions.filter(t => t.date >= monthStart && t.type === 'debt').reduce((s, t) => s + t.amount, 0);

        return sendJSON(res, { total, daily, weekly, monthly });
      }

      return sendJSON(res, { error: 'غير موجود' }, 404);
    });
    return;
  }

  // Static files
  let filePath = pathname === '/' ? path.join(PUBLIC, 'index.html') : path.join(PUBLIC, pathname);
  if (!filePath.startsWith(PUBLIC)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }
  sendFile(res, filePath);
});

server.listen(PORT, () => {
  console.log(`\n✅ سجلها علي يعمل على: http://localhost:${PORT}`);
  console.log('المستخدمون:');
  console.log('  oxy   / 200767@  (موظف)');
  console.log('  admin / 200200   (صاحب المحل)\n');
  console.log('قاعدة البيانات: database.json (على السيرفر)\n');
});