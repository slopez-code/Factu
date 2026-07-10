/* ============ Factura de Intervención — lógica de la app (con base de datos) ============ */

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));

function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
function fmtMoney(n) { return (Number(n) || 0).toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €'; }
function fmtDate(iso) { if (!iso) return ''; const [y, m, d] = iso.split('-'); return `${d}/${m}/${y}`; }
function todayISO() { return new Date().toISOString().slice(0, 10); }
function escapeHtml(s) { return String(s || '').replace(/[&<>"']/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m])); }

let toastTimer;
function toast(msg) {
  const el = $('#toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2600);
}

function translateAuthError(msg) {
  const map = {
    'Invalid login credentials': 'Email o contraseña incorrectos.',
    'User already registered': 'Ya existe una cuenta con ese email.',
    'Password should be at least 6 characters': 'La contraseña debe tener al menos 6 caracteres.',
    'Email not confirmed': 'Debes confirmar tu email antes de entrar. Revisa tu bandeja de entrada.',
  };
  return map[msg] || msg || 'Ha ocurrido un error.';
}

/* ================= CONFIGURACIÓN / CONEXIÓN ================= */
const CONFIG_OK = typeof SUPABASE_URL !== 'undefined' && SUPABASE_URL && !SUPABASE_URL.includes('TU-PROYECTO');
let sb = null;
if (CONFIG_OK) {
  sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
} else {
  $('#authWrap').innerHTML = `
    <div class="auth-card">
      <div class="brand" style="justify-content:center;margin-bottom:12px;">
        <div class="brand-mark">F</div>
        <div><h1 style="color:var(--ink);">Falta configurar la conexión</h1></div>
      </div>
      <p style="font-size:13.5px;color:var(--text-mute);line-height:1.6;">
        Esta app necesita una base de datos gratuita en Supabase. Abre el archivo <code>config.js</code>
        y pega ahí la URL y la clave "anon" de tu proyecto (créalo gratis en supabase.com).
        Después ejecuta <code>setup.sql</code> en el "SQL Editor" de tu proyecto. Todo el detalle está en el README.
      </p>
    </div>`;
}

/* ================= ESTADO ================= */
let session = null;
let profile = null;
let empresa = null;
let clientesCache = [];
let facturasCache = [];
let currentItems = [];
let selectedClienteId = null;

/* ================= NAVEGACIÓN ENTRE PESTAÑAS ================= */
$$('.tab').forEach((tab) => {
  tab.addEventListener('click', async () => {
    $$('.tab').forEach((t) => t.classList.remove('active'));
    $$('.view').forEach((v) => v.classList.remove('active'));
    tab.classList.add('active');
    $('#view-' + tab.dataset.view).classList.add('active');
    if (tab.dataset.view === 'historial') { await fetchFacturas(); renderHistorial(); }
    if (tab.dataset.view === 'clientes') { await fetchClientes(); renderClientes(); }
    if (tab.dataset.view === 'usuarios') { renderUsuarios(); }
  });
});

/* ================= AUTENTICACIÓN: UI ================= */
$$('.auth-tab').forEach((t) => {
  t.addEventListener('click', () => {
    $$('.auth-tab').forEach((x) => x.classList.remove('active'));
    $$('.auth-form').forEach((x) => x.classList.remove('active'));
    t.classList.add('active');
    $('#' + t.dataset.authview + 'Form').classList.add('active');
  });
});

function showAuth() {
  $('#authWrap').style.display = 'flex';
  $('#resetWrap').style.display = 'none';
  $('#appWrap').style.display = 'none';
}
function showResetPassword() {
  $('#authWrap').style.display = 'none';
  $('#appWrap').style.display = 'none';
  $('#resetWrap').style.display = 'flex';
}
function showApp() {
  $('#authWrap').style.display = 'none';
  $('#resetWrap').style.display = 'none';
  $('#appWrap').style.display = 'block';
  $('#tabUsuarios').style.display = profile.role === 'admin' ? '' : 'none';
  updateEmpresaTag();
  fillEmpresaForm();
  $('#inviteCodeTxt').textContent = empresa.invite_code || '--------';
}

if (sb) {
  $('#loginForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    $('#loginError').textContent = '';
    const email = $('#loginEmail').value.trim();
    const password = $('#loginPass').value;
    const { data, error } = await sb.auth.signInWithPassword({ email, password });
    if (error) { $('#loginError').textContent = translateAuthError(error.message); return; }
    await handleSession(data.session);
  });

  $('#signupForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const errEl = $('#signupError');
    errEl.style.color = 'var(--danger)';
    errEl.textContent = '';
    const nombre = $('#suNombre').value.trim();
    const email = $('#suEmail').value.trim();
    const password = $('#suPass').value;
    const invite_code = $('#suInvite').value.trim();
    const { data, error } = await sb.auth.signUp({ email, password, options: { data: { nombre, invite_code } } });
    if (error) { errEl.textContent = translateAuthError(error.message); return; }
    if (!data.session) {
      errEl.style.color = 'var(--ok)';
      errEl.textContent = 'Cuenta creada. Revisa tu email para confirmarla y luego entra desde "Entrar".';
      return;
    }
    await handleSession(data.session);
  });

  $('#forgotBtn').addEventListener('click', async () => {
    const email = prompt('Escribe el email de tu cuenta para enviarte un enlace de recuperación:');
    if (!email) return;
    const redirectTo = window.location.origin + window.location.pathname;
    const { error } = await sb.auth.resetPasswordForEmail(email.trim(), { redirectTo });
    toast(error ? 'No se pudo enviar el email' : 'Revisa tu correo para restablecer la contraseña');
  });

  $('#logoutBtn').addEventListener('click', async () => {
    await sb.auth.signOut();
    session = null; profile = null; empresa = null;
    showAuth();
  });

  $('#resetPassForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const errEl = $('#resetPassError');
    errEl.style.color = 'var(--danger)';
    errEl.textContent = '';
    const p1 = $('#resetPass1').value;
    const p2 = $('#resetPass2').value;
    if (p1 !== p2) { errEl.textContent = 'Las contraseñas no coinciden.'; return; }
    if (p1.length < 6) { errEl.textContent = 'La contraseña debe tener al menos 6 caracteres.'; return; }
    const { error } = await sb.auth.updateUser({ password: p1 });
    if (error) { errEl.textContent = translateAuthError(error.message); return; }
    toast('Contraseña actualizada');
    $('#resetPassForm').reset();
    const { data } = await sb.auth.getSession();
    if (data.session) { await handleSession(data.session); } else { showAuth(); }
  });
}

/* ================= SESIÓN Y PERFIL ================= */
async function ensureProfile(user) {
  const { data: existing } = await sb.from('profiles').select('*').eq('id', user.id).maybeSingle();
  if (existing) return existing;

  const meta = user.user_metadata || {};
  const nombre = meta.nombre || (user.email || '').split('@')[0];
  const inviteCode = (meta.invite_code || '').trim();

  if (inviteCode) {
    const { data, error } = await sb.rpc('join_empresa_by_code', { code: inviteCode, p_nombre: nombre });
    if (error) throw new Error('El código de equipo no es válido. Revísalo con tu administrador.');
    return data;
  }
  const { data: newEmp, error: eErr } = await sb.from('empresas')
    .insert({ owner_id: user.id, nombre: nombre + ' — Mi empresa' }).select().single();
  if (eErr) throw eErr;
  const { data: newProfile, error: pErr } = await sb.from('profiles')
    .insert({ id: user.id, empresa_id: newEmp.id, email: user.email, nombre, role: 'admin' }).select().single();
  if (pErr) throw pErr;
  return newProfile;
}

async function handleSession(sess) {
  session = sess;
  try {
    profile = await ensureProfile(sess.user);
    if (!profile.empresa_id) {
      toast('Tu cuenta no pertenece a ninguna empresa. Contacta con tu administrador.');
      await sb.auth.signOut();
      showAuth();
      return;
    }
    const { data: emp, error } = await sb.from('empresas').select('*').eq('id', profile.empresa_id).single();
    if (error) throw error;
    empresa = emp;
    showApp();
    resetNuevaFactura();
    await fetchClientes();
    renderClienteChips();
  } catch (e) {
    console.error(e);
    toast(e.message || 'No se pudo iniciar sesión');
    await sb.auth.signOut();
    showAuth();
  }
}

async function init() {
  if (!sb) return;
  let recovering = false;
  sb.auth.onAuthStateChange((event, sess) => {
    if (event === 'PASSWORD_RECOVERY') {
      recovering = true;
      showResetPassword();
    } else if (event === 'SIGNED_OUT') {
      showAuth();
    }
  });
  // Pequeña espera para dejar que Supabase procese el enlace de recuperación de la URL
  // antes de decidir qué pantalla mostrar.
  await new Promise((r) => setTimeout(r, 150));
  if (recovering) return;
  const { data } = await sb.auth.getSession();
  if (data.session) {
    await handleSession(data.session);
  } else {
    showAuth();
  }
}

/* ================= EMPRESA ================= */
function updateEmpresaTag() {
  $('#empresaTag').textContent = empresa && empresa.nombre
    ? `${empresa.nombre}${empresa.profesion ? ' · ' + empresa.profesion : ''}`
    : 'Configura tu empresa en «Ajustes»';
}
function fillEmpresaForm() {
  if (!empresa) return;
  $('#empNombre').value = empresa.nombre || '';
  $('#empProfesion').value = empresa.profesion || '';
  $('#empNif').value = empresa.nif || '';
  $('#empTelefono').value = empresa.telefono || '';
  $('#empDireccion').value = empresa.direccion || '';
  $('#empEmail').value = empresa.email || '';
  $('#empIban').value = empresa.iban || '';
  $('#empPrefijo').value = empresa.prefijo || '';
  $('#empSiguiente').value = empresa.siguiente || 1;
  if (empresa.logo) { $('#logoPreview').src = empresa.logo; $('#logoPreview').style.display = 'block'; }
}

async function saveEmpresaFields(fields) {
  const { data, error } = await sb.from('empresas').update(fields).eq('id', empresa.id).select().single();
  if (error) { toast('Solo un administrador puede editar los datos de empresa'); return false; }
  empresa = data;
  updateEmpresaTag();
  return true;
}

$('#empLogo').addEventListener('change', (ev) => {
  const file = ev.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = async () => {
    const ok = await saveEmpresaFields({ logo: reader.result });
    if (ok) {
      $('#logoPreview').src = reader.result;
      $('#logoPreview').style.display = 'block';
      toast('Logo actualizado');
    }
  };
  reader.readAsDataURL(file);
});

$('#btnGuardarEmpresa').addEventListener('click', async () => {
  const ok = await saveEmpresaFields({
    nombre: $('#empNombre').value.trim(),
    profesion: $('#empProfesion').value.trim(),
    nif: $('#empNif').value.trim(),
    telefono: $('#empTelefono').value.trim(),
    direccion: $('#empDireccion').value.trim(),
    email: $('#empEmail').value.trim(),
    iban: $('#empIban').value.trim(),
  });
  if (ok) toast('Datos de empresa guardados');
});

$('#btnGuardarNum').addEventListener('click', async () => {
  const ok = await saveEmpresaFields({
    prefijo: $('#empPrefijo').value.trim(),
    siguiente: parseInt($('#empSiguiente').value, 10) || 1,
  });
  if (ok) { setDocNumero(); toast('Numeración actualizada'); }
});

$('#btnBorrarTodo').addEventListener('click', async () => {
  if (profile.role !== 'admin') { toast('Solo un administrador puede borrar los datos'); return; }
  if (!confirm('¿Seguro que quieres borrar todo el historial y los clientes de tu empresa? Esta acción no se puede deshacer y afecta a todo tu equipo.')) return;
  await sb.from('facturas').delete().eq('empresa_id', empresa.id);
  await sb.from('clientes').delete().eq('empresa_id', empresa.id);
  await fetchClientes(); await fetchFacturas();
  renderHistorial(); renderClientes(); renderClienteChips();
  toast('Historial y clientes borrados');
});

/* ================= EQUIPO / USUARIOS ================= */
$('#copyInviteBtn').addEventListener('click', () => {
  navigator.clipboard.writeText(empresa.invite_code).then(() => toast('Código copiado'));
});

async function renderUsuarios() {
  const wrap = $('#usuariosList');
  const { data, error } = await sb.from('profiles').select('*').eq('empresa_id', empresa.id).order('created_at');
  if (error) { wrap.innerHTML = '<div class="empty">No se pudo cargar el equipo.</div>'; return; }
  wrap.innerHTML = data.map((u) => `
    <div class="user-row" data-id="${u.id}">
      <div>
        <div class="u-name">${escapeHtml(u.nombre || u.email)}${u.id === profile.id ? ' (tú)' : ''}</div>
        <div class="u-email">${escapeHtml(u.email || '')}</div>
      </div>
      <div style="display:flex;align-items:center;gap:8px;">
        <select class="role-select" data-role-for="${u.id}" ${u.id === profile.id ? 'disabled' : ''}>
          <option value="tecnico" ${u.role === 'tecnico' ? 'selected' : ''}>Técnico</option>
          <option value="admin" ${u.role === 'admin' ? 'selected' : ''}>Admin</option>
        </select>
        ${u.id !== profile.id ? `<button class="btn btn-danger btn-sm" data-remove="${u.id}">Quitar</button>` : ''}
      </div>
    </div>
  `).join('') || '<div class="empty">No hay usuarios todavía.</div>';

  wrap.querySelectorAll('[data-role-for]').forEach((sel) => {
    sel.addEventListener('change', async (e) => {
      const { error } = await sb.from('profiles').update({ role: e.target.value }).eq('id', sel.dataset.roleFor);
      toast(error ? 'No se pudo actualizar el rol' : 'Rol actualizado');
    });
  });
  wrap.querySelectorAll('[data-remove]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      if (!confirm('¿Quitar a esta persona del equipo? Dejará de ver los datos de tu empresa.')) return;
      const { error } = await sb.from('profiles').update({ empresa_id: null }).eq('id', btn.dataset.remove);
      if (error) { toast('No se pudo quitar al usuario'); return; }
      renderUsuarios();
    });
  });
}

/* ================= CLIENTES ================= */
async function fetchClientes() {
  const { data, error } = await sb.from('clientes').select('*').eq('empresa_id', empresa.id).order('nombre');
  clientesCache = error ? [] : data;
  return clientesCache;
}
async function upsertClienteDB(c) {
  if (c.id) {
    const { data, error } = await sb.from('clientes').update({
      nombre: c.nombre, nif: c.nif, telefono: c.telefono, direccion: c.direccion, email: c.email,
    }).eq('id', c.id).select().single();
    if (error) { toast('No se pudo guardar el cliente'); return null; }
    return data;
  }
  const { data, error } = await sb.from('clientes').insert({
    empresa_id: empresa.id, nombre: c.nombre, nif: c.nif, telefono: c.telefono, direccion: c.direccion, email: c.email,
  }).select().single();
  if (error) { toast('No se pudo guardar el cliente'); return null; }
  return data;
}
async function deleteClienteDB(id) {
  const { error } = await sb.from('clientes').delete().eq('id', id);
  if (error) toast('No se pudo eliminar el cliente');
}

function renderClienteChips() {
  const wrap = $('#clienteChips');
  if (!clientesCache.length) { wrap.innerHTML = ''; return; }
  wrap.innerHTML = clientesCache.map((c) =>
    `<span class="client-chip ${c.id === selectedClienteId ? 'sel' : ''}" data-id="${c.id}">${escapeHtml(c.nombre)}</span>`
  ).join('');
  $$('.client-chip', wrap).forEach((chip) => {
    chip.addEventListener('click', () => {
      const c = clientesCache.find((x) => x.id === chip.dataset.id);
      if (!c) return;
      selectedClienteId = c.id;
      $('#clNombre').value = c.nombre || '';
      $('#clNif').value = c.nif || '';
      $('#clTelefono').value = c.telefono || '';
      $('#clDireccion').value = c.direccion || '';
      $('#clEmail').value = c.email || '';
      renderClienteChips();
    });
  });
}

$('#saveClienteBtn').addEventListener('click', async () => {
  const nombre = $('#clNombre').value.trim();
  if (!nombre) { toast('Escribe el nombre del cliente'); return; }
  const saved = await upsertClienteDB({
    id: selectedClienteId,
    nombre, nif: $('#clNif').value.trim(), telefono: $('#clTelefono').value.trim(),
    direccion: $('#clDireccion').value.trim(), email: $('#clEmail').value.trim(),
  });
  if (!saved) return;
  selectedClienteId = saved.id;
  await fetchClientes();
  renderClienteChips();
  toast('Cliente guardado en tu lista');
});

function renderClientes() {
  const wrap = $('#clientesList');
  if (!clientesCache.length) {
    wrap.innerHTML = `<div class="empty"><div class="ico">👤</div>Todavía no tenéis clientes guardados.<br>Añádelos desde aquí o al crear una factura.</div>`;
    return;
  }
  wrap.innerHTML = clientesCache.map((c) => `
    <div class="card" data-id="${c.id}">
      <div class="card-title">${escapeHtml(c.nombre)}</div>
      <div style="font-size:13px;color:var(--text-mute);line-height:1.6;">
        ${c.nif ? 'NIF: ' + escapeHtml(c.nif) + '<br>' : ''}
        ${c.direccion ? escapeHtml(c.direccion) + '<br>' : ''}
        ${c.telefono ? escapeHtml(c.telefono) + ' · ' : ''}${c.email ? escapeHtml(c.email) : ''}
      </div>
      <div class="actions-row">
        <button class="btn btn-ghost btn-sm" data-act="edit">Usar / editar</button>
        <button class="btn btn-danger btn-sm" data-act="del">Eliminar</button>
      </div>
    </div>
  `).join('');
  wrap.querySelectorAll('[data-act="edit"]').forEach((btn) => {
    btn.addEventListener('click', (ev) => {
      const id = ev.target.closest('.card').dataset.id;
      const c = clientesCache.find((x) => x.id === id);
      if (!c) return;
      selectedClienteId = c.id;
      $('#clNombre').value = c.nombre || ''; $('#clNif').value = c.nif || '';
      $('#clTelefono').value = c.telefono || ''; $('#clDireccion').value = c.direccion || '';
      $('#clEmail').value = c.email || '';
      goToTab('nueva');
      renderClienteChips();
    });
  });
  wrap.querySelectorAll('[data-act="del"]').forEach((btn) => {
    btn.addEventListener('click', async (ev) => {
      const id = ev.target.closest('.card').dataset.id;
      if (!confirm('¿Eliminar este cliente de tu lista?')) return;
      await deleteClienteDB(id);
      await fetchClientes();
      renderClientes();
      renderClienteChips();
    });
  });
}

$('#btnNuevoCliente').addEventListener('click', () => {
  selectedClienteId = null;
  $('#clNombre').value = ''; $('#clNif').value = ''; $('#clTelefono').value = '';
  $('#clDireccion').value = ''; $('#clEmail').value = '';
  goToTab('nueva');
  renderClienteChips();
  $('#clNombre').focus();
});

function goToTab(name) {
  $$('.tab').forEach((t) => t.classList.remove('active'));
  $$('.view').forEach((v) => v.classList.remove('active'));
  $(`.tab[data-view="${name}"]`).classList.add('active');
  $('#view-' + name).classList.add('active');
}

/* ================= LÍNEAS DE INTERVENCIÓN ================= */
function addItem(data) {
  currentItems.push(Object.assign({ id: uid(), concepto: '', cantidad: 1, precio: 0 }, data || {}));
  renderItems();
}
function removeItem(id) { currentItems = currentItems.filter((i) => i.id !== id); renderItems(); }
function renderItems() {
  const wrap = $('#itemsWrap');
  wrap.innerHTML = currentItems.map((it) => `
    <div class="item-row" data-id="${it.id}">
      <input type="text" class="f-concepto" placeholder="Ej. Sustitución de mecanismo, revisión de instalación…" value="${escapeHtml(it.concepto)}">
      <input type="number" class="f-cantidad" min="0" step="0.5" value="${it.cantidad}">
      <input type="number" class="f-precio" min="0" step="0.01" value="${it.precio}">
      <input type="text" class="f-importe" value="${fmtMoney(it.cantidad * it.precio)}" readonly>
      <button class="del" data-del="${it.id}" title="Eliminar línea" type="button">&times;</button>
    </div>
  `).join('');
  wrap.querySelectorAll('.item-row').forEach((row) => {
    const it = currentItems.find((i) => i.id === row.dataset.id);
    row.querySelector('.f-concepto').addEventListener('input', (e) => { it.concepto = e.target.value; });
    row.querySelector('.f-cantidad').addEventListener('input', (e) => {
      it.cantidad = parseFloat(e.target.value) || 0;
      row.querySelector('.f-importe').value = fmtMoney(it.cantidad * it.precio);
      updateTotals();
    });
    row.querySelector('.f-precio').addEventListener('input', (e) => {
      it.precio = parseFloat(e.target.value) || 0;
      row.querySelector('.f-importe').value = fmtMoney(it.cantidad * it.precio);
      updateTotals();
    });
  });
  wrap.querySelectorAll('[data-del]').forEach((btn) => btn.addEventListener('click', () => removeItem(btn.dataset.del)));
  updateTotals();
}
$('#addItemBtn').addEventListener('click', () => addItem());

function updateTotals() {
  const subtotal = currentItems.reduce((s, it) => s + (it.cantidad * it.precio), 0);
  const ivaPct = parseFloat($('#ivaPct').value) || 0;
  const iva = subtotal * (ivaPct / 100);
  const total = subtotal + iva;
  $('#tSubtotal').textContent = fmtMoney(subtotal);
  $('#tIva').textContent = fmtMoney(iva);
  $('#tTotal').textContent = fmtMoney(total);
  return { subtotal, iva, total, ivaPct };
}
$('#ivaPct').addEventListener('input', updateTotals);

/* ================= NUMERACIÓN Y FECHA ================= */
function setDocNumero() {
  const n = (empresa && empresa.siguiente) || 1;
  $('#docNumero').value = `${(empresa && empresa.prefijo) || ''}${String(n).padStart(4, '0')}`;
}
function resetNuevaFactura() {
  currentItems = [];
  selectedClienteId = null;
  $('#docFecha').value = todayISO();
  $('#docTipo').value = 'Factura de intervención';
  $('#docNotas').value = '';
  $('#docEstado').value = 'pendiente';
  $('#clNombre').value = ''; $('#clNif').value = ''; $('#clTelefono').value = '';
  $('#clDireccion').value = ''; $('#clEmail').value = '';
  $('#ivaPct').value = 21;
  addItem();
  setDocNumero();
  renderClienteChips();
}

/* ================= GUARDAR FACTURA ================= */
function buildFacturaObject() {
  const totals = updateTotals();
  return {
    tipo: $('#docTipo').value,
    numero: $('#docNumero').value,
    fecha: $('#docFecha').value || todayISO(),
    estado: $('#docEstado').value,
    notas: $('#docNotas').value.trim(),
    cliente: {
      nombre: $('#clNombre').value.trim(), nif: $('#clNif').value.trim(),
      telefono: $('#clTelefono').value.trim(), direccion: $('#clDireccion').value.trim(),
      email: $('#clEmail').value.trim(),
    },
    items: currentItems.map((it) => ({ concepto: it.concepto, cantidad: it.cantidad, precio: it.precio })),
    subtotal: totals.subtotal, ivaPct: totals.ivaPct, iva: totals.iva, total: totals.total,
  };
}
function validarFactura(f) {
  if (!f.cliente.nombre) { toast('Indica el nombre del cliente'); return false; }
  if (!f.items.length || f.items.every((i) => !i.concepto)) { toast('Añade al menos un concepto'); return false; }
  return true;
}
function mapRowToFactura(row) {
  return {
    id: row.id, tipo: row.tipo, numero: row.numero, fecha: row.fecha, estado: row.estado,
    notas: row.notas || '', cliente: row.cliente || {}, items: row.items || [],
    subtotal: row.subtotal, ivaPct: row.iva_pct, iva: row.iva, total: row.total,
    creadoPor: row.creado_por_nombre,
  };
}

$('#btnGuardar').addEventListener('click', async () => {
  const f = buildFacturaObject();
  if (!validarFactura(f)) return;
  const { data, error } = await sb.from('facturas').insert({
    empresa_id: empresa.id, numero: f.numero, tipo: f.tipo, fecha: f.fecha, estado: f.estado, notas: f.notas,
    cliente: f.cliente, items: f.items, subtotal: f.subtotal, iva_pct: f.ivaPct, iva: f.iva, total: f.total,
    created_by: profile.id, creado_por_nombre: profile.nombre,
  }).select().single();
  if (error) { toast('No se pudo guardar la factura'); console.error(error); return; }
  await saveEmpresaFields({ siguiente: (empresa.siguiente || 1) + 1 });
  toast('Guardada en el historial');
  resetNuevaFactura();
});

/* ================= HISTORIAL ================= */
async function fetchFacturas() {
  const { data, error } = await sb.from('facturas').select('*').eq('empresa_id', empresa.id).order('created_at', { ascending: false });
  facturasCache = error ? [] : data;
  return facturasCache;
}
function renderHistorial(filter) {
  const wrap = $('#histList');
  let list = facturasCache;
  if (filter) {
    const f = filter.toLowerCase();
    list = list.filter((x) => (x.cliente?.nombre || '').toLowerCase().includes(f) || (x.numero || '').toLowerCase().includes(f));
  }
  if (!list.length) {
    wrap.innerHTML = `<div class="empty"><div class="ico">🧾</div>${filter ? 'Sin resultados.' : 'Aún no habéis guardado ningún documento.<br>Créalo en la pestaña «Nueva».'}</div>`;
    return;
  }
  wrap.innerHTML = list.map((f) => `
    <div class="hist-item" data-id="${f.id}">
      <div class="hist-main">
        <div class="n">${escapeHtml(f.numero)} · ${escapeHtml(f.tipo)}</div>
        <div class="c">${escapeHtml(f.cliente?.nombre || '')}</div>
        <div class="d">${fmtDate(f.fecha)} · <span class="status-badge ${f.estado}">${f.estado === 'pagada' ? 'Pagada' : 'Pendiente'}</span>${f.creado_por_nombre ? ' · ' + escapeHtml(f.creado_por_nombre) : ''}</div>
      </div>
      <div class="hist-amt">${fmtMoney(f.total)}</div>
    </div>
  `).join('');
  wrap.querySelectorAll('.hist-item').forEach((el) => el.addEventListener('click', () => openModal(el.dataset.id)));
}
$('#buscarHist').addEventListener('input', (e) => renderHistorial(e.target.value));

/* ================= MODAL DE DOCUMENTO GUARDADO ================= */
let modalFacturaId = null;
function openModal(id) {
  const row = facturasCache.find((x) => x.id === id);
  if (!row) return;
  const f = mapRowToFactura(row);
  modalFacturaId = id;
  $('#modalTitulo').textContent = `${f.tipo} · ${f.numero}`;
  $('#modalBody').innerHTML = `
    <div class="card" style="margin-bottom:10px;">
      <div class="card-title">Cliente</div>
      <div style="font-size:13.5px;line-height:1.7;">
        <strong>${escapeHtml(f.cliente.nombre)}</strong><br>
        ${f.cliente.nif ? 'NIF: ' + escapeHtml(f.cliente.nif) + '<br>' : ''}
        ${f.cliente.direccion ? escapeHtml(f.cliente.direccion) + '<br>' : ''}
        ${f.cliente.telefono || ''} ${f.cliente.email ? '· ' + escapeHtml(f.cliente.email) : ''}
      </div>
    </div>
    <div class="card">
      <div class="card-title">Conceptos</div>
      ${f.items.map((it) => `
        <div style="display:flex;justify-content:space-between;font-size:13.5px;padding:4px 0;border-bottom:1px solid var(--line);">
          <span>${escapeHtml(it.concepto)} ${it.cantidad !== 1 ? '× ' + it.cantidad : ''}</span>
          <span>${fmtMoney(it.cantidad * it.precio)}</span>
        </div>
      `).join('')}
      <div class="totals">
        <div class="totals-row"><span>Base imponible</span><span>${fmtMoney(f.subtotal)}</span></div>
        <div class="totals-row"><span>IVA (${f.ivaPct}%)</span><span>${fmtMoney(f.iva)}</span></div>
        <div class="totals-row grand"><span>Total</span><span>${fmtMoney(f.total)}</span></div>
      </div>
      ${f.notas ? `<p style="font-size:12.5px;color:var(--text-mute);margin-top:10px;">${escapeHtml(f.notas)}</p>` : ''}
      ${f.creadoPor ? `<p style="font-size:11.5px;color:var(--text-mute);">Creado por ${escapeHtml(f.creadoPor)}</p>` : ''}
    </div>
  `;
  $('#modalBg').classList.add('show');
}
$('#modalClose').addEventListener('click', () => $('#modalBg').classList.remove('show'));
$('#modalBg').addEventListener('click', (e) => { if (e.target === $('#modalBg')) $('#modalBg').classList.remove('show'); });

$('#modalDelBtn').addEventListener('click', async () => {
  if (!confirm('¿Eliminar este documento del historial?')) return;
  const { error } = await sb.from('facturas').delete().eq('id', modalFacturaId);
  if (error) { toast('No se pudo eliminar'); return; }
  $('#modalBg').classList.remove('show');
  await fetchFacturas();
  renderHistorial();
});
$('#modalDupBtn').addEventListener('click', () => {
  const row = facturasCache.find((x) => x.id === modalFacturaId);
  if (!row) return;
  const f = mapRowToFactura(row);
  goToTab('nueva');
  $('#docTipo').value = f.tipo;
  $('#docFecha').value = todayISO();
  $('#docNotas').value = f.notas;
  $('#docEstado').value = 'pendiente';
  $('#clNombre').value = f.cliente.nombre || ''; $('#clNif').value = f.cliente.nif || '';
  $('#clTelefono').value = f.cliente.telefono || ''; $('#clDireccion').value = f.cliente.direccion || '';
  $('#clEmail').value = f.cliente.email || '';
  $('#ivaPct').value = f.ivaPct;
  currentItems = f.items.map((it) => Object.assign({ id: uid() }, it));
  renderItems();
  setDocNumero();
  $('#modalBg').classList.remove('show');
  toast('Documento duplicado, revisa los datos antes de guardar');
});
$('#modalPdfBtn').addEventListener('click', async () => {
  const row = facturasCache.find((x) => x.id === modalFacturaId);
  if (!row) return;
  const f = mapRowToFactura(row);
  const doc = await generarPDF(f);
  doc.save(`${f.numero}.pdf`);
});
$('#modalEmailBtn').addEventListener('click', () => {
  const row = facturasCache.find((x) => x.id === modalFacturaId);
  if (row) enviarPorEmail(mapRowToFactura(row));
});

/* ================= GENERACIÓN DE PDF ================= */
async function generarPDF(f) {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const pageW = doc.internal.pageSize.getWidth();
  const margin = 40;
  const ink = [16, 35, 63];
  const accent = [255, 107, 26];
  const mute = [107, 114, 128];
  let y = margin;

  if (empresa.logo) {
    try {
      const props = doc.getImageProperties(empresa.logo);
      const w = 46, h = (props.height / props.width) * 46;
      doc.addImage(empresa.logo, 'PNG', margin, y, w, h);
    } catch (e) { /* ignore bad image */ }
  }

  doc.setFont('helvetica', 'bold'); doc.setFontSize(12); doc.setTextColor(...ink);
  doc.text(empresa.nombre || 'Tu empresa', pageW - margin, y + 12, { align: 'right' });
  doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(...mute);
  const empLines = [
    empresa.profesion, empresa.nif ? 'NIF: ' + empresa.nif : '', empresa.direccion,
    [empresa.telefono, empresa.email].filter(Boolean).join(' · '),
  ].filter(Boolean);
  empLines.forEach((line, i) => doc.text(line, pageW - margin, y + 26 + i * 12, { align: 'right' }));

  y += 70;
  doc.setDrawColor(218, 214, 201); doc.line(margin, y, pageW - margin, y);
  y += 24;

  doc.setFont('helvetica', 'bold'); doc.setFontSize(18); doc.setTextColor(...ink);
  doc.text(f.tipo.toUpperCase(), margin, y);
  doc.setTextColor(...accent); doc.setFontSize(11);
  doc.text(f.numero, margin, y + 16);

  doc.setTextColor(...mute); doc.setFont('helvetica', 'normal'); doc.setFontSize(9);
  doc.text('Fecha: ' + fmtDate(f.fecha), pageW - margin, y - 4, { align: 'right' });
  doc.text('Estado: ' + (f.estado === 'pagada' ? 'Pagada' : 'Pendiente de cobro'), pageW - margin, y + 10, { align: 'right' });

  y += 34;
  doc.setFillColor(241, 239, 232);
  doc.roundedRect(margin, y, pageW - margin * 2, 62, 4, 4, 'F');
  doc.setFont('helvetica', 'bold'); doc.setFontSize(9); doc.setTextColor(...mute);
  doc.text('CLIENTE', margin + 12, y + 16);
  doc.setTextColor(...ink); doc.setFontSize(11);
  doc.text(f.cliente.nombre || '-', margin + 12, y + 32);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(...mute);
  const clLine2 = [f.cliente.nif ? 'NIF: ' + f.cliente.nif : '', f.cliente.telefono, f.cliente.email].filter(Boolean).join('   ·   ');
  doc.text(clLine2, margin + 12, y + 46);
  doc.text(f.cliente.direccion || '', margin + 12, y + 58);

  y += 82;
  const rows = f.items.map((it) => [it.concepto || '-', String(it.cantidad), fmtMoney(it.precio), fmtMoney(it.cantidad * it.precio)]);
  doc.autoTable({
    startY: y,
    head: [['Descripción de la intervención', 'Cant.', 'Precio', 'Importe']],
    body: rows,
    margin: { left: margin, right: margin },
    styles: { font: 'helvetica', fontSize: 9.5, cellPadding: 7, textColor: [30, 36, 48] },
    headStyles: { fillColor: ink, textColor: 255, fontStyle: 'bold' },
    alternateRowStyles: { fillColor: [250, 250, 247] },
    columnStyles: { 1: { halign: 'right', cellWidth: 50 }, 2: { halign: 'right', cellWidth: 70 }, 3: { halign: 'right', cellWidth: 80 } },
  });

  y = doc.lastAutoTable.finalY + 20;
  const totX = pageW - margin - 190;
  doc.setFontSize(10); doc.setTextColor(...mute);
  doc.text('Base imponible', totX, y); doc.text(fmtMoney(f.subtotal), pageW - margin, y, { align: 'right' });
  y += 16;
  doc.text(`IVA (${f.ivaPct}%)`, totX, y); doc.text(fmtMoney(f.iva), pageW - margin, y, { align: 'right' });
  y += 10;
  doc.setDrawColor(218, 214, 201); doc.line(totX, y, pageW - margin, y);
  y += 16;
  doc.setFont('helvetica', 'bold'); doc.setFontSize(13); doc.setTextColor(...ink);
  doc.text('TOTAL', totX, y); doc.text(fmtMoney(f.total), pageW - margin, y, { align: 'right' });

  y += 34;
  if (f.notas) {
    doc.setFont('helvetica', 'bold'); doc.setFontSize(9); doc.setTextColor(...mute);
    doc.text('NOTAS', margin, y); y += 13;
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9.5); doc.setTextColor(30, 36, 48);
    const split = doc.splitTextToSize(f.notas, pageW - margin * 2);
    doc.text(split, margin, y); y += split.length * 12;
  }
  if (empresa.iban) {
    y += 8; doc.setFontSize(9); doc.setTextColor(...mute);
    doc.text('IBAN para transferencia: ' + empresa.iban, margin, y);
  }

  const pageH = doc.internal.pageSize.getHeight();
  doc.setFontSize(8); doc.setTextColor(...mute);
  doc.text(`${empresa.nombre || ''}  ·  Generado con Factura de Intervención`, margin, pageH - 24);
  return doc;
}

$('#btnPdf').addEventListener('click', async () => {
  const f = buildFacturaObject();
  if (!validarFactura(f)) return;
  const doc = await generarPDF(f);
  doc.save(`${f.numero || 'documento'}.pdf`);
});

/* ================= ENVÍO POR EMAIL ================= */
async function enviarPorEmail(f) {
  const doc = await generarPDF(f);
  const blob = doc.output('blob');
  const filename = `${f.numero}.pdf`;
  const file = new File([blob], filename, { type: 'application/pdf' });
  const asunto = `${f.tipo} ${f.numero} - ${empresa.nombre || ''}`.trim();
  const cuerpo = `Hola ${f.cliente.nombre || ''},\n\nAdjunto ${f.tipo.toLowerCase()} ${f.numero} por importe de ${fmtMoney(f.total)}.\n\nUn saludo,\n${empresa.nombre || ''}`;

  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: asunto, text: cuerpo });
      return;
    } catch (e) {
      if (e.name === 'AbortError') return;
    }
  }
  doc.save(filename);
  const to = encodeURIComponent(f.cliente.email || '');
  const mailto = `mailto:${to}?subject=${encodeURIComponent(asunto)}&body=${encodeURIComponent(cuerpo + '\n\n(Adjunta el PDF que se acaba de descargar)')}`;
  toast('PDF descargado. Adjúntalo en tu app de correo.');
  setTimeout(() => { window.location.href = mailto; }, 700);
}

$('#btnEmail').addEventListener('click', async () => {
  const f = buildFacturaObject();
  if (!validarFactura(f)) return;
  enviarPorEmail(f);
});

/* ================= PWA: instalación y service worker ================= */
let deferredPrompt;
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredPrompt = e;
  $('#installBanner').classList.add('show');
});
$('#installBtn').addEventListener('click', async () => {
  if (!deferredPrompt) return;
  deferredPrompt.prompt();
  await deferredPrompt.userChoice;
  deferredPrompt = null;
  $('#installBanner').classList.remove('show');
});
window.addEventListener('appinstalled', () => $('#installBanner').classList.remove('show'));

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => { navigator.serviceWorker.register('sw.js').catch(() => {}); });
}

/* ================= INIT ================= */
init();
