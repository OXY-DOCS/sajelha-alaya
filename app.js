const API = '';

let currentUser = null;
let currentCustomerId = null;

// DOM Elements
const loginScreen = document.getElementById('login-screen');
const mainApp = document.getElementById('main-app');
const userView = document.getElementById('user-view');
const adminView = document.getElementById('admin-view');

// Login
document.getElementById('login-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const username = document.getElementById('username').value.trim();
  const password = document.getElementById('password').value;
  const errorEl = document.getElementById('login-error');

  try {
    const res = await fetch('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ username, password })
    });
    const data = await res.json();
    if (!res.ok) {
      errorEl.textContent = data.error || 'خطأ في تسجيل الدخول';
      return;
    }
    currentUser = data.user;
    showApp();
  } catch (err) {
    errorEl.textContent = 'خطأ في الاتصال بالسيرفر';
  }
});

// Logout
document.getElementById('logout-btn').addEventListener('click', async () => {
  await fetch('/api/logout', { method: 'POST', credentials: 'include' });
  currentUser = null;
  loginScreen.classList.add('active');
  mainApp.classList.remove('active');
  document.getElementById('login-form').reset();
  document.getElementById('login-error').textContent = '';
});

async function showApp() {
  loginScreen.classList.remove('active');
  mainApp.classList.add('active');
  document.getElementById('current-user').textContent = currentUser.username;
  document.getElementById('user-role').textContent = currentUser.role === 'admin' ? 'صاحب المحل' : 'موظف';

  if (currentUser.role === 'admin') {
    userView.classList.remove('active');
    adminView.classList.add('active');
    await loadAdminData();
  } else {
    adminView.classList.remove('active');
    userView.classList.add('active');
    await loadCustomers();
  }
}

// Load Customers (User)
async function loadCustomers(search = '') {
  const res = await fetch(`/api/customers?search=${encodeURIComponent(search)}`, { credentials: 'include' });
  const customers = await res.json();
  const container = document.getElementById('customers-list');
  container.innerHTML = customers.length ? customers.map(c => `
    <div class="customer-card" onclick="openCustomer(${c.id})">
      <h4>${escapeHtml(c.name)}</h4>
      <div class="phone">${escapeHtml(c.phone)}</div>
      <div class="balance ${getBalanceClass(c.balance)}">${formatMoney(c.balance)}</div>
    </div>
  `).join('') : '<p style="text-align:center;color:#757575;">لا توجد نتائج</p>';
}

document.getElementById('search-input').addEventListener('input', (e) => {
  loadCustomers(e.target.value);
});

// Admin Data
async function loadAdminData() {
  const [statsRes, customersRes] = await Promise.all([
    fetch('/api/stats', { credentials: 'include' }),
    fetch('/api/customers', { credentials: 'include' })
  ]);
  const stats = await statsRes.json();
  const customers = await customersRes.json();

  document.getElementById('total-debt').textContent = formatMoney(stats.total);
  document.getElementById('daily-debt').textContent = formatMoney(stats.daily);
  document.getElementById('weekly-debt').textContent = formatMoney(stats.weekly);
  document.getElementById('monthly-debt').textContent = formatMoney(stats.monthly);

  const container = document.getElementById('admin-customers-list');
  container.innerHTML = `
    <div class="customers-grid">
      ${customers.map(c => `
        <div class="customer-card" onclick="openCustomer(${c.id})">
          <h4>${escapeHtml(c.name)}</h4>
          <div class="phone">${escapeHtml(c.phone)}</div>
          <div class="balance ${getBalanceClass(c.balance)}">${formatMoney(c.balance)}</div>
          <div style="font-size:13px;color:#757575;margin-top:6px">منذ: ${c.first_transaction ? formatDate(c.first_transaction) : '-'}</div>
        </div>
      `).join('')}
    </div>
  `;
}

// Customer Modal
async function openCustomer(id) {
  currentCustomerId = id;
  const res = await fetch(`/api/customers/${id}`, { credentials: 'include' });
  const data = await res.json();

  document.getElementById('modal-customer-name').textContent = data.name;
  document.getElementById('modal-phone').textContent = data.phone;
  const balanceEl = document.getElementById('modal-balance');
  balanceEl.textContent = formatMoney(data.balance);
  balanceEl.className = 'balance ' + getBalanceClass(data.balance);

  const transContainer = document.getElementById('transactions-container');
  const isAdmin = currentUser && currentUser.role === 'admin';
  transContainer.innerHTML = data.transactions.length ? data.transactions.map(t => `
    <div class="transaction-item">
      <div>
        <span class="type ${t.type}">${t.type === 'debt' ? 'دين' : 'دفعة'}</span>
        <span style="color:#757575;margin-right:10px">${formatDate(t.date)}</span>
      </div>
      <div style="display:flex;align-items:center;gap:8px">
        <strong class="${t.type === 'debt' ? 'type debt' : 'type payment'}">
          ${t.type === 'debt' ? '+' : '-'}${formatMoney(t.amount)}
        </strong>
        ${isAdmin ? `
          <button onclick="editTransaction(${t.id}, '${t.type}', ${t.amount}, '${t.date}')" style="background:#FF9800;color:white;border:none;padding:4px 8px;border-radius:6px;cursor:pointer;font-size:12px">تعديل</button>
          <button onclick="deleteTransaction(${t.id})" style="background:#E53935;color:white;border:none;padding:4px 8px;border-radius:6px;cursor:pointer;font-size:12px">حذف</button>
        ` : ''}
      </div>
    </div>
  `).join('') : '<p style="text-align:center;color:#757575;">لا توجد حركات بعد</p>';

  // Admin customer controls
  let adminControls = document.getElementById('admin-customer-controls');
  if (!adminControls) {
    adminControls = document.createElement('div');
    adminControls.id = 'admin-customer-controls';
    adminControls.style.marginTop = '10px';
    document.querySelector('.customer-info').appendChild(adminControls);
  }
  if (isAdmin) {
    adminControls.innerHTML = `
      <button onclick="editCustomer(${data.id}, '${escapeHtml(data.name)}', '${escapeHtml(data.phone)}')" style="background:#FF9800;color:white;border:none;padding:8px 12px;border-radius:8px;cursor:pointer;margin-left:8px">تعديل الزبون</button>
      <button onclick="deleteCustomer(${data.id})" style="background:#E53935;color:white;border:none;padding:8px 12px;border-radius:8px;cursor:pointer">حذف الزبون</button>
    `;
  } else {
    adminControls.innerHTML = '';
  }

  // WhatsApp
  document.getElementById('whatsapp-btn').onclick = () => {
    const phone = cleanPhone(data.phone);
    const message = `مرحباً ${data.name}،\nالرصيد المتبقي عليك هو ${data.balance.toFixed(2)} ₪.\nشكراً لك.`;
    window.open(`https://wa.me/${phone}?text=${encodeURIComponent(message)}`, '_blank');
  };

  // Set date to today
  document.getElementById('trans-date').valueAsDate = new Date();

  document.getElementById('customer-modal').classList.add('active');
}

function closeModal() {
  document.getElementById('customer-modal').classList.remove('active');
  currentCustomerId = null;
}

// Admin functions
async function editCustomer(id, name, phone) {
  const newName = prompt('الاسم الجديد:', name);
  if (!newName) return;
  const newPhone = prompt('الهاتف الجديد:', phone);
  if (!newPhone) return;
  const res = await fetch(`/api/customers/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ name: newName, phone: newPhone })
  });
  if (res.ok) {
    await openCustomer(id);
    if (currentUser.role === 'admin') await loadAdminData();
  }
}

async function deleteCustomer(id) {
  if (!confirm('هل أنت متأكد من حذف هذا الزبون وكل حركاته؟')) return;
  try {
    const res = await fetch(`/api/customers/${id}`, {
      method: 'DELETE',
      credentials: 'include'
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok) {
      alert('تم الحذف بنجاح');
      closeModal();
      if (currentUser.role === 'admin') await loadAdminData();
      else await loadCustomers();
    } else {
      alert('فشل الحذف: ' + (data.error || res.status));
    }
  } catch (err) {
    alert('خطأ في الاتصال: ' + err.message);
  }
}

async function editTransaction(id, type, amount, date) {
  const newType = prompt('النوع (debt أو payment):', type);
  if (!newType || !['debt', 'payment'].includes(newType)) return;
  const newAmount = prompt('المبلغ الجديد:', amount);
  if (!newAmount || isNaN(newAmount)) return;
  const newDate = prompt('التاريخ (YYYY-MM-DD):', date);
  if (!newDate) return;
  const res = await fetch(`/api/transactions/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ type: newType, amount: parseFloat(newAmount), date: newDate })
  });
  if (res.ok && currentCustomerId) await openCustomer(currentCustomerId);
}

async function deleteTransaction(id) {
  if (!confirm('هل أنت متأكد من حذف هذه الحركة؟')) return;
  try {
    const res = await fetch(`/api/transactions/${id}`, {
      method: 'DELETE',
      credentials: 'include'
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok) {
      alert('تم حذف الحركة');
      if (currentCustomerId) await openCustomer(currentCustomerId);
    } else {
      alert('فشل الحذف: ' + (data.error || res.status));
    }
  } catch (err) {
    alert('خطأ: ' + err.message);
  }
}

// Add Transaction
document.getElementById('add-trans-btn').addEventListener('click', async () => {
  if (!currentCustomerId) return;
  const type = document.getElementById('trans-type').value;
  const amount = parseFloat(document.getElementById('trans-amount').value);
  const date = document.getElementById('trans-date').value;

  if (!amount || amount <= 0 || !date) {
    alert('يرجى إدخال مبلغ وتاريخ صحيحين');
    return;
  }

  const res = await fetch(`/api/customers/${currentCustomerId}/transactions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ type, amount, date })
  });

  if (res.ok) {
    document.getElementById('trans-amount').value = '';
    await openCustomer(currentCustomerId);
    if (currentUser.role === 'admin') await loadAdminData();
    else await loadCustomers(document.getElementById('search-input').value);
  }
});

// Add Customer
document.getElementById('add-customer-btn').addEventListener('click', () => {
  document.getElementById('add-customer-modal').classList.add('active');
});

function closeAddModal() {
  document.getElementById('add-customer-modal').classList.remove('active');
  document.getElementById('add-customer-form').reset();
}

document.getElementById('add-customer-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const name = document.getElementById('new-name').value.trim();
  const phone = document.getElementById('new-phone').value.trim();

  const res = await fetch('/api/customers', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ name, phone })
  });

  if (res.ok) {
    closeAddModal();
    await loadCustomers();
  }
});

// Helpers
function formatMoney(amount) {
  const num = Number(amount).toFixed(2);
  return num + ' ₪';
}

function getBalanceClass(balance) {
  if (balance > 0) return 'positive';
  if (balance < 0) return 'negative';
  return 'zero';
}

function formatDate(dateStr) {
  if (!dateStr) return '-';
  const d = new Date(dateStr + 'T00:00:00');
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = String(d.getFullYear());
  return day + '/' + month + '/' + year;
}

function cleanPhone(phone) {
  let cleaned = phone.replace(/\D/g, '');
  if (cleaned.startsWith('0')) cleaned = '972' + cleaned.slice(1);
  if (!cleaned.startsWith('972')) cleaned = '972' + cleaned;
  return cleaned;
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// Check session on load
(async function init() {
  try {
    const res = await fetch('/api/me', { credentials: 'include' });
    if (res.ok) {
      currentUser = await res.json();
      showApp();
    }
  } catch (e) {}
})();