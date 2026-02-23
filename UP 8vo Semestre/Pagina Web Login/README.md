# Login Seguro — Hackeo Ético y Recuperación Ante Desastres

Página de login minimalista (blanco y negro) con autenticación contra base de datos SQLite y bloqueo automático tras 5 intentos fallidos.

---

## Características

- Diseño minimalista en blanco y negro.
- Autenticación con usuario y contraseña almacenados en **SQLite**.
- Contraseñas hasheadas con **bcrypt** (12 rondas de sal).
- **Bloqueo de cuenta por 5 minutos** tras 5 intentos fallidos consecutivos.
- Contador regresivo en pantalla durante el bloqueo.
- Indicador de intentos restantes antes del bloqueo.
- Sesiones HTTP seguras con `express-session`.
- Página de dashboard protegida (solo accesible con sesión activa).

---

## Requisitos previos

| Herramienta | Versión mínima |
|-------------|---------------|
| [Node.js](https://nodejs.org/) | 18 LTS o superior |
| npm | viene con Node.js |

> **Windows:** Se recomienda usar la terminal **PowerShell** o **Git Bash**.

---

## Instalación y ejecución local

### 1. Clonar o descargar el repositorio

```bash
git clone https://github.com/<tu-usuario>/<tu-repo>.git
cd "UP 8vo Semestre/Hackeo Ético y Recuperación Ante Desastres/Pagina Web Login"
```

### 2. Instalar dependencias

```bash
npm install
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
npm run seed
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
npm start
```

Abre tu navegador en **http://localhost:3000**

---

## Desarrollo con recarga automática

Instala nodemon (ya incluido como devDependency) y usa:

```bash
npm run dev
```

---

## Estructura del proyecto

```
Pagina Web Login/
│
├── database/
│   ├── db.js          # Conexión y consultas SQLite
│   ├── seed.js        # Script para crear usuarios de prueba
│   └── login.db       # Base de datos (generada automáticamente, no en Git)
│
├── public/
│   ├── index.html     # Página de login
│   ├── dashboard.html # Página tras autenticación exitosa
│   └── style.css      # Estilos minimalistas B&N
│
├── server.js          # Servidor Express + lógica de login y bloqueo
├── package.json       # Dependencias y scripts npm
├── .env.example       # Plantilla de variables de entorno
├── .env               # Variables locales (NO subir a Git)
├── .gitignore
└── README.md
```

---

## Lógica de bloqueo

1. Cada intento fallido incrementa un contador en la tabla `login_lockouts`.
2. Al llegar al **5.° intento fallido**, el campo `locked_until` se fija en `NOW + 5 minutos`.
3. Mientras `locked_until > NOW`, todos los intentos de ese usuario son rechazados (HTTP 429).
4. Pasados los 5 minutos el bloqueo se limpia automáticamente.
5. Un **login exitoso** borra el registro de intentos del usuario.

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

> **Importante:** el archivo `.env` y `database/login.db` están en `.gitignore` y **no se subirán**. Eso es correcto: cada persona que clone el repo debe ejecutar `cp .env.example .env` y `npm run seed` por su cuenta.

---

## Dependencias principales

| Paquete | Descripción |
|---------|-------------|
| `express` | Framework web |
| `express-session` | Manejo de sesiones HTTP |
| `better-sqlite3` | Base de datos SQLite (síncrona, sin servidor) |
| `bcryptjs` | Hash seguro de contraseñas |
| `dotenv` | Carga de variables de entorno desde `.env` |
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
   | **Root Directory** | `UP 8vo Semestre/Hackeo Ético y Recuperación Ante Desastres/Pagina Web Login` |
   | **Environment** | `Node` |
   | **Build Command** | `npm install && npm run seed` |
   | **Start Command** | `npm start` |

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
> - Implementar rate-limiting a nivel de IP además del bloqueo por usuario.
