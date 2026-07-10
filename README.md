# Factura de Intervención — PWA multiusuario (100% gratis, claves fuera del repo)

**¿Prisa?** Sigue `QUICKSTART.md` — checklist de 9 pasos, ~10 minutos, con un script (`deploy-setup.sh`) que hace el `git push` por ti.

App instalable (PWA) para generar facturas/partes de intervención de cualquier profesión, con **login por email y contraseña**, **base de datos en la nube** compartida por tu equipo, exportación a **PDF**, **envío por email**, **historial** completo y **claves de conexión gestionadas como variables de entorno** (nunca quedan escritas en el código ni en el historial de Git).

Stack, 100% capa gratuita, sin tarjeta:
- **Supabase** → base de datos (Postgres) + autenticación de usuarios.
- **GitHub Pages + GitHub Actions** → alojamiento con HTTPS y despliegue automático que inyecta tus claves de forma segura.

---

## 1. Crear la base de datos (Supabase) — 5 minutos

1. Ve a **https://supabase.com** → *Start your project* → crea una cuenta gratis.
2. **New project** → nombre, contraseña de base de datos (guárdala), región cercana, plan **Free**.
3. **SQL Editor → New query**: pega todo el contenido de `setup.sql` de este proyecto y pulsa **Run**. Crea las tablas y la seguridad por empresa (Row Level Security).
4. **Project Settings → API**: copia el **Project URL** y la **anon public key**. Las necesitarás en el paso 3.
5. (Recomendado) **Authentication → Providers → Email**: activa "Leaked Password Protection" y decide si quieres exigir confirmación de email antes del primer acceso ("Confirm email").

## 2. Probarla en tu ordenador (opcional)

```bash
cd factura-pwa
cp config.example.js config.js   # config.js está en .gitignore, nunca se sube
```
Edita `config.js` y pega ahí tu URL y tu anon key. Luego:
```bash
python3 -m http.server 8080
```
Abre `http://localhost:8080`.

## 3. Publicar gratis en GitHub, con las claves como variables de entorno

1. Crea un repositorio nuevo en GitHub (puede ser **privado**, ver nota de privacidad más abajo).
2. Desde esta carpeta:
   ```bash
   git remote add origin https://github.com/TU-USUARIO/TU-REPO.git
   git push -u origin main
   ```
   (el repositorio ya viene inicializado con un commit; `config.js` no se sube porque está en `.gitignore`).
3. En GitHub, ve a tu repo → **Settings → Secrets and variables → Actions → New repository secret** y crea dos secretos:
   - `SUPABASE_URL` → tu Project URL
   - `SUPABASE_ANON_KEY` → tu anon public key
4. Ve a **Settings → Pages** → en "Build and deployment", **Source: GitHub Actions**.
5. Ve a la pestaña **Actions** de tu repo: el workflow `Deploy PWA to GitHub Pages` se ejecuta automáticamente. Al terminar (1-2 min), tu app estará publicada en `https://TU-USUARIO.github.io/TU-REPO/`.

Cada vez que hagas `git push` a `main`, el workflow (`.github/workflows/deploy.yml`) genera `config.js` al vuelo a partir de esos Secrets cifrados y publica la web — el archivo con las claves reales nunca se escribe en tu repositorio, solo existe de forma efímera durante el despliegue.

## 4. Instalar en el móvil

- **Android (Chrome)**: aviso "Instalar" al abrir la web, o menú ⋮ → "Instalar app".
- **iPhone (Safari)**: botón Compartir → "Añadir a pantalla de inicio".

---

## Máxima privacidad: qué se ha reforzado

- **Sin claves en el código fuente**: `config.js` está en `.gitignore`; en producción se genera desde *GitHub Secrets* (cifrados, solo visibles para el propio despliegue). El repositorio se puede subir incluso a un proyecto público sin exponer nada sensible.
- **Repositorio privado (recomendado)**: puedes marcar el repo de GitHub como privado sin coste — solo tú y quien invites verá el código y el historial de commits. El *sitio publicado* en GitHub Pages es necesariamente accesible por URL (para poder instalarlo como app), pero nadie puede entrar sin su cuenta y contraseña.
- **Aislamiento de datos por empresa** (Row Level Security en Postgres): aunque toda la app comparte una única base de datos, cada empresa solo puede leer o escribir sus propias filas — imposible acceder a los datos de otra empresa aunque se conozca la URL o la anon key.
- **La `anon key` de Supabase está diseñada para exponerse en clientes** (apps web/móvil): por sí sola no da acceso a datos, la protección real es la Row Level Security. Nunca uses ni publiques la `service_role key` — este proyecto no la necesita en ningún momento.
- **`referrer` deshabilitado** en la app para no filtrar la URL interna a servicios externos al compartir o exportar.
- Si en algún momento sospechas que una clave se ha filtrado, puedes regenerarla gratis desde **Project Settings → API → Reset** en Supabase sin perder datos.

## Cómo funciona el acceso por usuarios

- La **primera persona** que crea cuenta (sin código de equipo) se convierte en **administrador** de una empresa nueva.
- Desde la pestaña **Equipo** (solo administradores), hay un **código de invitación** de 8 caracteres para compartir con el resto del equipo.
- Quien se registre con ese código se une automáticamente a la misma empresa (rol **Técnico** por defecto), viendo los mismos clientes, facturas y datos.
- El administrador puede cambiar roles o quitar a alguien del equipo desde esa pestaña.
- Solo los administradores editan los datos fiscales de la empresa, el logo, la numeración, o borran el historial completo.

## Qué incluye

- Login y contraseña con recuperación por email.
- Datos de empresa (nombre, actividad, NIF/CIF, dirección, contacto, logo, IBAN) y numeración automática.
- Datos de cliente por intervención + lista de clientes habituales del equipo.
- Líneas de intervención libres (descripción, cantidad, precio) válidas para cualquier profesión, con base, IVA y total calculados.
- Exportación a PDF con logo y datos fiscales.
- Envío por email (panel nativo de compartir en móvil con el PDF adjunto; en escritorio, descarga + apertura del correo).
- Historial compartido por todo el equipo, con buscador, ver, duplicar, reimprimir, borrar y autoría de cada documento.
- Instalable, con interfaz disponible offline (los datos requieren conexión).

## Estructura del proyecto

```
factura-pwa/
├── index.html            interfaz completa
├── styles.css             estilos
├── app.js                 lógica: auth, base de datos, PDF, email
├── config.example.js      plantilla de configuración (sí se sube a git)
├── config.js               tus claves reales para pruebas locales (NO se sube, está en .gitignore)
├── setup.sql               script para crear la base de datos (ejecútalo una vez en Supabase)
├── manifest.json           manifest de la PWA
├── sw.js                   service worker (interfaz offline)
├── icons/                  iconos de la app
└── .github/workflows/
    └── deploy.yml          despliegue automático inyectando los Secrets de GitHub
```
