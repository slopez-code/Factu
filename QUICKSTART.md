# Puesta en marcha — 10 minutos, todo gratis

Todo el código, la base de datos y el despliegue automático ya están preparados.
Solo faltan las partes que *obligatoriamente* requieren tu propia cuenta (nadie más puede hacerlas por ti: piden tu email y contraseña). Sigue el orden.

---

### ☐ 1. Crear el proyecto de base de datos (3 min)
1. Entra en **https://supabase.com** → *Start your project* → regístrate gratis.
2. **New project** → nombre, contraseña de base de datos (guárdala en algún sitio), región cercana, plan **Free**.
3. Espera ~1 min a que se cree.

### ☐ 2. Instalar las tablas (1 min)
1. Menú lateral → **SQL Editor** → **New query**.
2. Abre el archivo `setup.sql` de esta carpeta, copia todo, pégalo ahí, pulsa **Run**.
3. Debe decir "Success. No rows returned".

### ☐ 3. Copiar tus claves (1 min)
1. Menú lateral → **Project Settings → API**.
2. Copia el **Project URL** (algo como `https://xxxx.supabase.co`).
3. Copia la **anon public key** (una cadena larga que empieza por `eyJ...`).
4. Guárdalas, las necesitas en el paso 6.

### ☐ 4. Crear el repositorio en GitHub (1 min)
1. Entra en **https://github.com/new**.
2. Ponle nombre, por ejemplo `factura-intervencion`. Puede ser **privado** (recomendado).
3. NO marques "Add a README" ni ".gitignore" (ya los trae el proyecto). Crear repositorio.
4. Copia la URL que te muestra GitHub, algo como `https://github.com/TU-USUARIO/factura-intervencion.git`.

### ☐ 5. Subir el proyecto (1 min)
Abre una terminal en esta carpeta y ejecuta:
```bash
./deploy-setup.sh
```
Te pedirá la URL del paso 4 y hace el resto (`git remote add` + `git push`) por ti.

*(Si prefieres hacerlo a mano: `git remote add origin TU_URL && git push -u origin main`)*

### ☐ 6. Añadir tus claves como secretos (2 min)
1. En tu repo de GitHub → **Settings → Secrets and variables → Actions**.
2. **New repository secret** → Name: `SUPABASE_URL` → Value: pega la URL del paso 3 → Add secret.
3. **New repository secret** otra vez → Name: `SUPABASE_ANON_KEY` → Value: pega la anon key del paso 3 → Add secret.

### ☐ 7. Activar la publicación (1 min)
1. En tu repo → **Settings → Pages**.
2. En "Build and deployment" → **Source: GitHub Actions**.
3. Ve a la pestaña **Actions**: verás el workflow ejecutándose (círculo amarillo → check verde en 1-2 min).
4. Cuando termine, tu app está en `https://TU-USUARIO.github.io/factura-intervencion/`.

### ☐ 8. Crear tu cuenta dentro de la app (1 min)
1. Abre esa URL.
2. Pestaña **Crear cuenta**, sin código de equipo → te conviertes en administrador.
3. Ve a **Ajustes** y rellena los datos de tu empresa.
4. (Si tienes compañeros) pestaña **Equipo** → comparte tu código de invitación con ellos.

### ☐ 9. Instalarla como app
- **Android**: aviso "Instalar" al abrir la web, o menú ⋮ → Instalar app.
- **iPhone**: Compartir → Añadir a pantalla de inicio.

---

**Nota de seguridad:** las claves que pegas en el paso 6 quedan cifradas dentro de GitHub y nunca se escriben en tu código ni en el historial — solo se usan de forma efímera durante cada despliegue automático (ver `.github/workflows/deploy.yml`).

Si algo falla, el detalle completo de cada paso está en `README.md`.
