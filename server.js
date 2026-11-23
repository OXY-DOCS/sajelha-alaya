const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');
const crypto = require('crypto');

function hashPassword(password) {
  return crypto.createHash('sha256').update(password + 'sajelha-salt-2026').digest('hex');
}

const loginAttempts = new Map();

function checkRateLimit(ip) {
  const now = Date.now();
  const attempts = loginAttempts.get(ip) || [];
  const recent = attempts.filter(t => now - t < 15 * 60 * 1000);
  if (recent.length >= 5) return false;
  recent.push(now);
  loginAttempts.set(ip, recent);
  return true;
}

const PORT = process.env.PORT || 3000;
const PUBLIC = __dirname;

const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SUPABASE_KEY = process.env.SUPABASE_KEY || '';

const sessions = new Map();

async function supabaseRequest(endpoint, options = {}) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${endpoint}`, {
    ...options,
    headers: {
      'apikey': SUPABASE_KEY,
      'Authorization': `Bearer ${SUPABASE_KEY}`,
      'Content-Type': 'application/json',
      'Prefer': options.prefer || 'return=representation',
      ...options.headers
    }
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(err);
  }
  const text = await res.text();
  return text ? JSON.parse(text) : null;
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
  res.setHeader('Set-Cookie', `sid=${sid}; Path=/; HttpOnly; Max-Age=86400; SameSite=None; Secure`);
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

const server = http.createServer(async (req, res) => {
  const parsed = url.parse(req.url, true);
  const pathname = parsed.pathname;
  const method = req.method;

  res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  if (pathname.startsWith('/api/')) {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', async () => {
      let data = {};
      try { if (body) data = JSON.parse(body); } catch (e) {}

      const session = getSession(req);

      try {
        if (pathname === '/api/login' && method === 'POST') {
          const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown';
          if (!checkRateLimit(ip)) {
            return sendJSON(res, { error: 'تم تجاوز عدد المحاولات. حاول بعد 15 دقيقة' }, 429);
          }
          const hashed = hashPassword(data.password || '');
          const users = await supabaseRequest(`users?username=eq.${encodeURIComponent(data.username)}&select=*`);
          const user = users && users.find(u => u.password === hashed || u.password === data.password);
          if (!user) return sendJSON(res, { error: 'اسم المستخدم أو كلمة المرور غير صحيحة' }, 401);
          setSession(res, { id: user.id, username: user.username, role: user.role });
          return sendJSON(res, { success: true, user: { id: user.id, username: user.username, role: user.role } });
        }

        if (pathname === '/api/logout' && method === 'POST') {
          clearSession(req, res);
          return sendJSON(res, { success: true });
        }

        if (pathname === '/api/me' && method === 'GET') {
          if (!session) return sendJSON(res, { error: 'غير مسجل' }, 401);
          return sendJSON(res, session);
        }

        if (!session) return sendJSON(res, { error: 'غير مصرح' }, 401);

        if (pathname === '/api/customers' && method === 'GET') {
          const search = (parsed.query.search || '').toLowerCase();
          let customers = await supabaseRequest('customers?select=*&order=name.asc') || [];
          const allTrans = await supabaseRequest('transactions?select=*') || [];
          customers = customers.map(c => {
            const trans = allTrans.filter(t => t.customer_id === c.id);
            const balance = trans.reduce((sum, t) => sum + (t.type === 'debt' ? Number(t.amount) : -Number(t.amount)), 0);
            const first = trans.length ? trans.map(t => t.date).sort()[0] : null;
            return { ...c, balance, first_transaction: first };
          });
          if (search) {
            customers = customers.filter(c => c.name.toLowerCase().includes(search) || (c.phone && c.phone.includes(search)));
          }
          return sendJSON(res, customers);
        }

        if (pathname === '/api/customers' && method === 'POST') {
          const { name, phone } = data;
          if (!name || !phone) return sendJSON(res, { error: 'الاسم والهاتف مطلوبان' }, 400);
          const result = await supabaseRequest('customers', {
            method: 'POST',
            body: JSON.stringify({ name, phone })
          });
          return sendJSON(res, result[0]);
        }

        const custMatch = pathname.match(/^\/api\/customers\/(\d+)$/);
        if (custMatch && method === 'GET') {
          const id = parseInt(custMatch[1]);
          const customers = await supabaseRequest(`customers?id=eq.${id}&select=*`);
          if (!customers || !customers[0]) return sendJSON(res, { error: 'الزبون غير موجود' }, 404);
          const customer = customers[0];
          const transactions = await supabaseRequest(`transactions?customer_id=eq.${id}&order=date.desc,id.desc`) || [];
          const balance = transactions.reduce((sum, t) => sum + (t.type === 'debt' ? Number(t.amount) : -Number(t.amount)), 0);
          return sendJSON(res, { ...customer, transactions, balance });
        }

        if (custMatch && method === 'PUT') {
          if (session.role !== 'admin') return sendJSON(res, { error: 'صلاحيات غير كافية' }, 403);
          const id = parseInt(custMatch[1]);
          const { name, phone } = data;
          if (!name || !phone) return sendJSON(res, { error: 'الاسم والهاتف مطلوبان' }, 400);
          const result = await supabaseRequest(`customers?id=eq.${id}`, {
            method: 'PATCH',
            body: JSON.stringify({ name, phone })
          });
          return sendJSON(res, result[0]);
        }

        if (custMatch && method === 'DELETE') {
          if (session.role !== 'admin') return sendJSON(res, { error: 'صلاحيات غير كافية' }, 403);
          const id = parseInt(custMatch[1]);
          await supabaseRequest(`customers?id=eq.${id}`, { method: 'DELETE' });
          return sendJSON(res, { success: true });
        }

        const transMatch = pathname.match(/^\/api\/customers\/(\d+)\/transactions$/);
        if (transMatch && method === 'POST') {
          const id = parseInt(transMatch[1]);
          const { type, amount, date } = data;
          if (!['debt', 'payment'].includes(type) || !amount || amount <= 0 || !date) {
            return sendJSON(res, { error: 'بيانات غير صحيحة' }, 400);
          }
          const result = await supabaseRequest('transactions', {
            method: 'POST',
            body: JSON.stringify({ customer_id: id, type, amount: parseFloat(amount), date })
          });
          return sendJSON(res, result[0]);
        }

        const transIdMatch = pathname.match(/^\/api\/transactions\/(\d+)$/);
        if (transIdMatch && method === 'PUT') {
          if (session.role !== 'admin') return sendJSON(res, { error: 'صلاحيات غير كافية' }, 403);
          const id = parseInt(transIdMatch[1]);
          const { type, amount, date } = data;
          const result = await supabaseRequest(`transactions?id=eq.${id}`, {
            method: 'PATCH',
            body: JSON.stringify({ type, amount: parseFloat(amount), date })
          });
          return sendJSON(res, result[0]);
        }

        if (transIdMatch && method === 'DELETE') {
          if (session.role !== 'admin') return sendJSON(res, { error: 'صلاحيات غير كافية' }, 403);
          const id = parseInt(transIdMatch[1]);
          await supabaseRequest(`transactions?id=eq.${id}`, { method: 'DELETE' });
          return sendJSON(res, { success: true });
        }

        if (pathname === '/api/stats' && method === 'GET') {
          if (session.role !== 'admin') return sendJSON(res, { error: 'صلاحيات غير كافية' }, 403);
          const allTrans = await supabaseRequest('transactions?select=*') || [];
          const now = new Date();
          const today = now.toISOString().split('T')[0];
          const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
          const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];

          const total = allTrans.reduce((sum, t) => sum + (t.type === 'debt' ? Number(t.amount) : -Number(t.amount)), 0);
          const daily = allTrans.filter(t => t.date === today && t.type === 'debt').reduce((s, t) => s + Number(t.amount), 0);
          const weekly = allTrans.filter(t => t.date >= weekAgo && t.type === 'debt').reduce((s, t) => s + Number(t.amount), 0);
          const monthly = allTrans.filter(t => t.date >= monthStart && t.type === 'debt').reduce((s, t) => s + Number(t.amount), 0);

          return sendJSON(res, { total, daily, weekly, monthly });
        }

        return sendJSON(res, { error: 'غير موجود' }, 404);
      } catch (err) {
        console.error(err);
        return sendJSON(res, { error: 'خطأ في قاعدة البيانات' }, 500);
      }
    });
    return;
  }

  let filePath = pathname === '/' ? path.join(PUBLIC, 'index.html') : path.join(PUBLIC, pathname);
  if (!filePath.startsWith(PUBLIC)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }
  sendFile(res, filePath);
});

server.listen(PORT, () => {
  console.log(`✅ سجلها علي يعمل على المنفذ ${PORT}`);
});