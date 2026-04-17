/**
 * Finance Tracker Frontend Logic
 * - Handles tab switching, period selection
 * - Manages cascading dropdowns (Direction → Type → Description)
 * - POSTs new entries, GETs existing data from Apps Script Web App
 */

// ⚠️ REPLACE WITH YOUR DEPLOYED WEB APP URL (see setup instructions)
const API_URL = 'https://script.google.com/macros/s/AKfycbwdpYkUbxPfBY5kf560T7Jr20O_fGUJW9P_qPJ6iU6QaXwemY-3VDNBoQ20DwR8oVwh5A/exec';

// ===== Category Configuration =====
// Edit here to add/remove categories
const CATEGORIES = {
  'sisse': {
    'sisse': ['Palk', 'Säästud', 'Muu']
  },
  'välja': {
    'unistus': ['INVESTEERING', 'SÄÄST', 'REIS', 'KOGEMUS'],
    'kohustus': ['ÜÜRIKORTER', 'KOMMUNAALID', 'LAENUDE TAGASIMAKSED', 'TOIT', 'AUTO sh KÜTUS', 'TEL, INT, JMS', 'JUUKSUR', 'ELATIS'],
    'lõbustus': ['RIIDED & JALANÕUD', 'VÄLJAS SÖÖMAS', 'LASTEGA', 'MUUD LÕBUSTUSED']
  }
};

// ===== State =====
let entries = [];
let currentDirection = 'välja';

// ===== Utility: Format period as "MM/YYYY" =====
function formatPeriod(date) {
  const m = String(date.getMonth() + 1).padStart(2, '0');
  return `${m}/${date.getFullYear()}`;
}

// Generate period options: last month, current, next 6 months
function generatePeriods() {
  const periods = [];
  const now = new Date();
  for (let i = -1; i <= 6; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
    periods.push(formatPeriod(d));
  }
  return periods;
}

// Format number as euro
function fmtEur(n) {
  return `${Number(n).toFixed(2)}€`;
}

// ===== Toast notification =====
function toast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.add('show');
  setTimeout(() => el.classList.remove('show'), 2000);
}

// ===== Tab switching =====
document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById(btn.dataset.tab).classList.add('active');
    if (btn.dataset.tab === 'tab-summary') renderSummary();
  });
});

// ===== Populate period selectors =====
function populatePeriods() {
  const periods = generatePeriods();
  const now = new Date();
  const currentPeriod = formatPeriod(now);
  
  const fill = (selectEl, defaultVal) => {
    selectEl.innerHTML = '';
    periods.forEach(p => {
      const opt = document.createElement('option');
      opt.value = p;
      opt.textContent = p;
      if (p === defaultVal) opt.selected = true;
      selectEl.appendChild(opt);
    });
  };
  
  fill(document.getElementById('period-select'), currentPeriod);
  fill(document.getElementById('sum-period-from'), currentPeriod);
  fill(document.getElementById('sum-period-to'), currentPeriod);
}

// ===== Direction segmented control =====
document.querySelectorAll('#direction-segmented .seg-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('#direction-segmented .seg-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    currentDirection = btn.dataset.value;
    populateTypeDropdown();
  });
});

// ===== Cascading dropdowns =====
function populateTypeDropdown() {
  const typeSelect = document.getElementById('type-select');
  const types = Object.keys(CATEGORIES[currentDirection]);
  
  typeSelect.innerHTML = '';
  types.forEach(t => {
    const opt = document.createElement('option');
    opt.value = t;
    opt.textContent = t.toUpperCase();
    typeSelect.appendChild(opt);
  });
  
  // For "sisse": type is forced to "sisse"
  if (currentDirection === 'sisse') {
    typeSelect.value = 'sisse';
    typeSelect.disabled = true;
  } else {
    typeSelect.disabled = false;
  }
  
  populateDescDropdown();
}

function populateDescDropdown() {
  const descSelect = document.getElementById('desc-select');
  const type = document.getElementById('type-select').value;
  const descs = (CATEGORIES[currentDirection][type]) || [];
  
  descSelect.innerHTML = '';
  descs.forEach(d => {
    const opt = document.createElement('option');
    opt.value = d;
    opt.textContent = d;
    descSelect.appendChild(opt);
  });
}

document.getElementById('type-select').addEventListener('change', populateDescDropdown);

// ===== Dashboard calculations =====
function updateDashboard() {
  const period = document.getElementById('period-select').value;
  const periodEntries = entries.filter(e => e.period === period);
  
  // Income entries (sisse) add to budget; outgoing (välja) reduce balance
  const income = periodEntries
    .filter(e => e.direction === 'sisse')
    .reduce((sum, e) => sum + e.actual, 0);
  const spent = periodEntries
    .filter(e => e.direction === 'välja')
    .reduce((sum, e) => sum + e.actual, 0);
  
  document.getElementById('stat-spent').textContent = fmtEur(spent);
  document.getElementById('stat-budget').textContent = fmtEur(income);
  
  // Preview: what will balance be after current form amount?
  const amount = parseFloat(document.getElementById('amount-input').value) || 0;
  const delta = currentDirection === 'sisse' ? amount : -amount;
  const newBalance = (income - spent) + delta;
  document.getElementById('stat-preview').textContent = fmtEur(newBalance);
}

document.getElementById('amount-input').addEventListener('input', updateDashboard);
document.getElementById('period-select').addEventListener('change', () => {
  updateDashboard();
  renderRecent();
});

// ===== Render recent entries =====
function renderRecent() {
  const list = document.getElementById('recent-list');
  const period = document.getElementById('period-select').value;
  const filtered = entries.filter(e => e.period === period).slice(-15).reverse();
  
  if (!filtered.length) {
    list.innerHTML = '<div class="loading">Pole kandeid</div>';
    return;
  }
  
  list.innerHTML = filtered.map((e, i) => `
    <div class="entry-item" data-index="${entries.indexOf(e)}">
      <div class="entry-main">
        <div class="entry-desc">${e.description}</div>
        <div class="entry-meta">${e.type.toUpperCase()} • ${e.period}</div>
      </div>
      <div class="entry-amount ${e.direction === 'sisse' ? 'income' : 'expense'}">
        ${e.direction === 'sisse' ? '+' : '−'}${fmtEur(e.actual)}
      </div>
    </div>
  `).join('');
  
  // Tap to prefill form
  list.querySelectorAll('.entry-item').forEach(el => {
    el.addEventListener('click', () => {
      const entry = entries[parseInt(el.dataset.index)];
      prefillForm(entry);
    });
  });
}

// ===== Prefill form from past entry =====
function prefillForm(entry) {
  // Set direction
  currentDirection = entry.direction;
  document.querySelectorAll('#direction-segmented .seg-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.value === entry.direction);
  });
  populateTypeDropdown();
  // Set type
  document.getElementById('type-select').value = entry.type;
  populateDescDropdown();
  // Set description
  document.getElementById('desc-select').value = entry.description;
  // Clear amount & focus
  document.getElementById('amount-input').value = '';
  document.getElementById('amount-input').focus();
  // Scroll to form
  document.getElementById('entry-form').scrollIntoView({ behavior: 'smooth', block: 'center' });
  toast('Vorm täidetud');
}

// ===== Form submission =====
document.getElementById('entry-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const submitBtn = document.getElementById('submit-btn');
  
  const payload = {
    period: document.getElementById('period-select').value,
    direction: currentDirection,
    type: document.getElementById('type-select').value,
    description: document.getElementById('desc-select').value,
    budget: 0,
    actual: parseFloat(document.getElementById('amount-input').value) || 0
  };
  
  if (!payload.actual) {
    toast('Sisesta summa');
    return;
  }
  
  submitBtn.disabled = true;
  submitBtn.textContent = 'Salvestan...';
  
  try {
    // Apps Script Web App requires text/plain to avoid CORS preflight
    await fetch(API_URL, {
      method: 'POST',
      mode: 'no-cors', // Apps Script doesn't set CORS headers
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(payload)
    });
    
    // Optimistically add to local state (no-cors hides response)
    entries.push(payload);
    document.getElementById('amount-input').value = '';
    updateDashboard();
    renderRecent();
    toast('✓ Salvestatud');
    
    // Refresh from server after short delay
    setTimeout(loadEntries, 1500);
  } catch (err) {
    toast('Viga salvestamisel');
    console.error(err);
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = 'Lisa kanne';
  }
});

// ===== Load entries from server =====
async function loadEntries() {
  try {
    const res = await fetch(API_URL + '?t=' + Date.now());
    const data = await res.json();
    if (data.success) {
      entries = data.entries.map(e => ({
        period: e.period,
        direction: e.direction,
        type: e.type,
        description: e.description,
        budget: e.budget,
        actual: e.actual
      }));
      updateDashboard();
      renderRecent();
    }
  } catch (err) {
    console.error('Load failed:', err);
    document.getElementById('recent-list').innerHTML = '<div class="loading">Ei saa andmeid laadida</div>';
  }
}

// ===== Summary tab rendering =====
function renderSummary() {
  const from = document.getElementById('sum-period-from').value;
  const to = document.getElementById('sum-period-to').value;
  const periods = generatePeriods();
  const fromIdx = periods.indexOf(from);
  const toIdx = periods.indexOf(to);
  const [lo, hi] = [Math.min(fromIdx, toIdx), Math.max(fromIdx, toIdx)];
  const rangePeriods = periods.slice(lo, hi + 1);
  
  const filtered = entries.filter(e => rangePeriods.includes(e.period));
  
  // Budget usage
  const income = filtered.filter(e => e.direction === 'sisse').reduce((s, e) => s + e.actual, 0);
  const spent = filtered.filter(e => e.direction === 'välja').reduce((s, e) => s + e.actual, 0);
  const usage = income > 0 ? Math.round((spent / income) * 100) : 0;
  
  document.getElementById('budget-usage').innerHTML = `
    <div class="cat-row">
      <div class="cat-header">
        <span>Sissetulek</span>
        <span>${fmtEur(income)}</span>
      </div>
    </div>
    <div class="cat-row">
      <div class="cat-header">
        <span>Kulutused</span>
        <span>${fmtEur(spent)}</span>
      </div>
      <div class="cat-bar">
        <div class="cat-bar-fill ${usage > 100 ? 'over' : ''}" style="width:${Math.min(usage, 100)}%"></div>
      </div>
      <div class="entry-meta" style="margin-top:4px">${usage}% eelarvest</div>
    </div>
    <div class="cat-row">
      <div class="cat-header">
        <span><strong>Jääk</strong></span>
        <span><strong>${fmtEur(income - spent)}</strong></span>
      </div>
    </div>
  `;
  
  // Categories breakdown (by type)
  const byType = {};
  filtered.filter(e => e.direction === 'välja').forEach(e => {
    byType[e.type] = (byType[e.type] || 0) + e.actual;
  });
  
  const totalOut = spent || 1;
  document.getElementById('category-overview').innerHTML = Object.entries(byType)
    .sort((a, b) => b[1] - a[1])
    .map(([type, amount]) => {
      const pct = Math.round((amount / totalOut) * 100);
      return `
        <div class="cat-row">
          <div class="cat-header">
            <span>${type.toUpperCase()}</span>
            <span>${fmtEur(amount)}</span>
          </div>
          <div class="cat-bar">
            <div class="cat-bar-fill" style="width:${pct}%"></div>
          </div>
          <div class="entry-meta" style="margin-top:4px">${pct}%</div>
        </div>
      `;
    }).join('') || '<div class="loading">Pole kulutusi</div>';
}

document.getElementById('sum-period-from').addEventListener('change', renderSummary);
document.getElementById('sum-period-to').addEventListener('change', renderSummary);

// ===== Init =====
populatePeriods();
populateTypeDropdown();
loadEntries();
