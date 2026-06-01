# Login Seguro — Hackeo Ético y Recuperación Ante Desastres

Página de login minimalista (blanco y negro) con autenticación SQLite, **protección contra ataques comunes** y registro de actividad (logs).

## Protecciones activas

| Ataque | Qué hace |
|--------|----------|
| **Fuerza bruta** | Lockout: 5 intentos → bloqueo 5 min + máx. 30 logins por IP / 15 min |
| **Robo de contraseña/sesión** | Cookies `httpOnly`, `sameSite: strict`, `secure` en producción; `helmet`; contraseñas solo con bcrypt; nunca se guardan en logs |
| **Inyección SQL** | Solo consultas preparadas en SQLite + validación en `/api/logs` |
| **Inyección LDAP** | Usuario solo `[a-zA-Z0-9_]` + `ldap-escape` |
| **XSS** | Sanitización con `xss` en body/query + CSP con `helmet` + escape en el dashboard |

---

## Características

- Diseño minimalista en blanco y negro.
- Autenticación con usuario y contraseña almacenados en **SQLite** (consultas parametrizadas).
- Contraseñas hasheadas con **bcrypt** (12 rondas de sal).
- **Bloqueo de cuenta (lockout)** tras 5 intentos fallidos (5 minutos, configurable en `.env`).
- **Rate limiting** por IP en login y en el resto de rutas (`express-rate-limit`).
- **Cabeceras HTTP seguras** (`helmet`), cookies `httpOnly` / `sameSite` / `secure` en producción.
- Validación y sanitización de entradas (`express-validator`, `xss`, `ldap-escape`, `hpp`).
- Sesiones HTTP con `express-session`.
- Dashboard protegido con **registro de actividad** (consola, SQLite, `logs.json`).

---

## Requisitos previos

| Herramienta | Versión mínima |
|-------------|---------------|
| [Node.js](https://nodejs.org/) | 18 LTS o superior |
| [pnpm](https://pnpm.io/installation) | 9 o superior |

> **Windows:** Se recomienda usar la terminal **PowerShell** o **Git Bash**.  
> Este proyecto usa **pnpm** exclusivamente (`npm install` está bloqueado vía `only-allow`).

### Instalar pnpm (solo la primera vez)

```bash
corepack enable
corepack prepare pnpm@9.15.9 --activate
```

Si `corepack` falla por permisos, instálalo globalmente: `npm install -g pnpm@9`

---

## Instalación y ejecución local

### 1. Clonar o descargar el repositorio

```bash
git clone https://github.com/<tu-usuario>/<tu-repo>.git
cd "UP 8vo Semestre/Hackeo Ético y Recuperación Ante Desastres/Pagina Web Login"
```

### 2. Instalar dependencias

```bash
pnpm install
```

### 3. Configurar variables de entorno

```bash
# Copia el archivo de ejemplo
cp .env.example .env
```

Abre `.env` y cambia `SESSION_SECRET` por cualquier cadena larga y aleatoria:

```env
PORT=3000
SESSION_SECRET=mi-clave-super-secreta-123
```

### 4. Crear usuarios de prueba en la base de datos

```bash
pnpm run seed
```

Este comando crea automáticamente los siguientes usuarios:

| Usuario  | Contraseña  |
|----------|-------------|
| `admin`  | `Admin123!` |
| `carlos` | `Carlos456!`|
| `prueba` | `Test789!`  |

> La base de datos se guarda en `database/login.db` (ignorada por Git).

### 5. Iniciar el servidor

```bash
pnpm start
```

Abre tu navegador en **http://localhost:3000**

---

## Desarrollo con recarga automática

Instala nodemon (ya incluido como devDependency) y usa:

```bash
pnpm run dev
```

---

## Estructura del proyecto

```
Pagina Web Login/
│
├── database/
│   ├── db.js          # Conexión, consultas SQLite y tabla logs
│   ├── seed.js        # Script para crear usuarios de prueba
│   └── login.db       # Base de datos (generada automáticamente, no en Git)
│
├── public/
│   ├── index.html     # Página de login
│   ├── dashboard.html # Dashboard + registro de actividad (logs)
│   └── style.css      # Estilos minimalistas B&N
│
├── middleware/
│   └── security.js    # Validación, XSS, LDAP, constantes de lockout
├── server.js          # Servidor Express + seguridad + login + logging
├── logs.json          # Logs en JSON (generado en ejecución, no en Git)
├── package.json       # Dependencias y scripts (pnpm)
├── pnpm-lock.yaml     # Lockfile de pnpm (sí se sube a Git)
├── .npmrc             # Configuración de pnpm
├── .env.example       # Plantilla de variables de entorno
├── .env               # Variables locales (NO subir a Git)
├── .gitignore
└── README.md
```

---

## Logs

Los eventos se registran en **tres sitios**:

1. **Consola** — Cada petición HTTP con **morgan** y cada evento de login/logout con timestamp, usuario e IP.
2. **SQLite** — Tabla `logs` con `event_type`, `username`, `ip`, `message`, `created_at`. Se consultan vía **GET /api/logs** (requiere sesión). Parámetros: `?limit=100` (máx. 500), `?type=login_success` | `login_failed` | `logout`.
3. **Archivo `logs.json`** — Array JSON con las últimas 2000 entradas (timestamp, event_type, username, ip, message). Se crea/actualiza en la raíz del proyecto; está en `.gitignore`.

En el **dashboard**, tras iniciar sesión, la sección **«Registro de actividad»** muestra la tabla de logs con filtro por tipo y botón **Actualizar**.

---

## Seguridad (bibliotecas y medidas)

| Amenaza | Medida | Biblioteca / técnica |
|---------|--------|----------------------|
| **Fuerza bruta** | Lockout tras 5 fallos (5 min) + límite 30 intentos/login por IP cada 15 min | `login_lockouts` en SQLite + `express-rate-limit` |
| **Robo de contraseña / sesión** | Cookies `httpOnly`, `sameSite: strict`, `secure` en producción; cabeceras seguras; contraseñas solo en bcrypt; nunca se registran en logs | `helmet`, `express-session`, `bcryptjs` |
| **Inyección SQL** | Solo consultas **preparadas** (`?`); validación de usuario y parámetros de `/api/logs` | `better-sqlite3`, `express-validator` |
| **Inyección LDAP** | Usuario restringido a `[a-zA-Z0-9_]` + escape LDAP del valor | `ldap-escape`, `express-validator` |
| **XSS** | Sanitización de `body`/`query`/`params`; CSP con `helmet`; escape en el dashboard al renderizar logs | `xss`, `helmet` |
| **Otros** | Anti HTTP Parameter Pollution; límite global 200 req/15 min por IP | `hpp`, `express-rate-limit` |

Variables opcionales en `.env`:

```env
LOCKOUT_MAX_ATTEMPTS=5
LOCKOUT_MINUTES=5
NODE_ENV=production   # en Render, para cookies secure
```

---

## Cómo subir a GitHub

### Opción A — Primera vez (repo nuevo)

```bash
# 1. Inicializa Git en la carpeta raíz del proyecto
git init

# 2. Agrega todos los archivos
git add .

# 3. Primer commit
git commit -m "feat: login seguro con bloqueo por intentos fallidos"

# 4. Crea el repositorio en GitHub.com y copia la URL, luego:
git remote add origin https://github.com/<tu-usuario>/<nombre-repo>.git
git branch -M main
git push -u origin main
```

### Opción B — Ya existe el repositorio (como este proyecto de UP)

```bash
# Desde la raíz del repo (carpeta UP/)
git add "UP 8vo Semestre/Hackeo Ético y Recuperación Ante Desastres/Pagina Web Login/"
git commit -m "feat: login seguro con bloqueo por intentos fallidos"
git push
```

> **Importante:** `.env`, `database/login.db` y `logs.json` están en `.gitignore` y **no se subirán**. Cada persona que clone el repo debe ejecutar `cp .env.example .env` y `pnpm run seed` por su cuenta.

---

## Dependencias principales

| Paquete | Descripción |
|---------|-------------|
| `express` | Framework web |
| `express-session` | Manejo de sesiones HTTP |
| `better-sqlite3` | Base de datos SQLite (síncrona, sin servidor) |
| `bcryptjs` | Hash seguro de contraseñas |
| `dotenv` | Carga de variables de entorno desde `.env` |
| `morgan` | Log de peticiones HTTP en consola |
| `helmet` | Cabeceras HTTP seguras (CSP, etc.) |
| `express-rate-limit` | Límite de peticiones por IP |
| `express-validator` | Validación de entradas |
| `hpp` | Protección HTTP Parameter Pollution |
| `xss` | Sanitización anti-XSS en el servidor |
| `ldap-escape` | Escape de caracteres LDAP en el usuario |
| `nodemon` *(dev)* | Reinicio automático en desarrollo |

---

## Despliegue en la nube (demo pública)

### ¿Por qué no GitHub Pages?

GitHub Pages **solo sirve archivos estáticos** (HTML/CSS/JS sin servidor). Este proyecto requiere un backend Node.js y una base de datos SQLite, por lo que **no es compatible con GitHub Pages**.

| Plataforma | Backend Node.js | Base de datos | Plan gratuito |
|------------|:-:|:-:|:-:|
| GitHub Pages | ✗ | ✗ | ✓ |
| **Render** | ✓ | ✓ | ✓ |
| Railway | ✓ | ✓ | ✓ (limitado) |
| Glitch | ✓ | ✓ | ✓ |

---

### Despliegue gratuito en Render (recomendado)

[Render](https://render.com) permite desplegar aplicaciones Node.js gratis con un clic.

#### Paso 1 — Preparar el repositorio

Asegúrate de que el repo esté subido a GitHub (ver sección anterior).

#### Paso 2 — Agregar el script de inicio para producción

El `package.json` ya incluye `"start": "node server.js"`, que es lo que Render usará automáticamente.

#### Paso 3 — Crear el servicio en Render

1. Ve a [https://dashboard.render.com](https://dashboard.render.com) y crea una cuenta (gratis).
2. Haz clic en **"New +"** → **"Web Service"**.
3. Conecta tu cuenta de GitHub y selecciona el repositorio.
4. Configura el servicio:

   | Campo | Valor |
   |-------|-------|
   | **Name** | `login-seguro` (o el que quieras) |
   | **Root Directory** | `UP 8vo Semestre/Pagina Web Login` |
   | **Environment** | `Node` |
   | **Build Command** | `pnpm install && pnpm run seed` |
   | **Start Command** | `pnpm start` |

5. En la sección **"Environment Variables"** agrega:

   | Key | Value |
   |-----|-------|
   | `SESSION_SECRET` | (una cadena larga y aleatoria, p. ej. `render-secret-abc123xyz789`) |
   | `PORT` | `10000` |

6. Haz clic en **"Create Web Service"**.

Render construirá e iniciará el servidor automáticamente. En ~2 minutos tendrás una URL pública del tipo:
```
https://login-seguro.onrender.com
```

#### Notas sobre el plan gratuito de Render

- El servidor se **duerme** tras 15 minutos de inactividad (la primera petición tarda ~30 s en despertar).
- La base de datos SQLite **se resetea** cada vez que Render redespliega (el comando `seed` en el Build Command la recrea automáticamente).
- Para persistencia permanente se necesitaría una base de datos externa (p. ej. PostgreSQL en Render, también gratuito).

---

## Notas de seguridad

> Este proyecto es para **fines académicos y de pruebas**. Para producción se recomienda:
> - Usar HTTPS (certificado TLS).
> - Cambiar `SESSION_SECRET` por un valor aleatorio de 64+ caracteres.
> - Considerar una base de datos más robusta (PostgreSQL, MySQL).
> - Agregar protección CSRF.
> - Valorar rate-limiting o bloqueo por intentos si se requiere limitar ataques de fuerza bruta.
