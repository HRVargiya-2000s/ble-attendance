# LAS Attendance System (PWA + Local Node Backend)

This project now uses your own local backend (Node + Express) and reads login credentials from Excel files in the workspace.

## What is implemented

- Local backend in [backend/src/server.js](backend/src/server.js)
- Excel files used as credential source:
  - [Student_Comp.xlsx](Student_Comp.xlsx)
  - [Student_EC.xlsx](Student_EC.xlsx)
  - [Student_Mech.xlsx](Student_Mech.xlsx)
  - [Faculty_EC.xlsx](Faculty_EC.xlsx)
  - [Faculty_Mech.xlsx](Faculty_Mech.xlsx)
- Frontend connected to configurable API base URL in [src/App.tsx](src/App.tsx)
- APK preparation setup with Capacitor in [capacitor.config.ts](capacitor.config.ts)

## Backend API endpoints

- `POST /api/auth/student-login`
- `POST /api/auth/faculty-login`
- `GET /api/faculty/subjects`
- `POST /api/bluetooth/session/start`
- `GET /api/auth/biometric/status`
- `POST /api/auth/biometric/enroll`
- `POST /api/attendance/mark`
- `GET /api/health`

## Credential behavior

The backend reads all `Student_*.xlsx` and `Faculty_*.xlsx` files from project root.

- Student login fields:
  - `enrollment_no`
  - `password`
- Faculty login fields:
  - `email` (or employee id)
  - `password`

If password column is missing in Excel:
- Student password defaults to enrollment number
- Faculty password defaults to employee id or generated identifier

Credential snapshot is generated at startup in [backend/data/credentials-cache.json](backend/data/credentials-cache.json).

## Run locally

1) Install frontend deps

```bash
npm install
```

2) Install backend deps

```bash
npm --prefix backend install
```

3) Configure env

Copy [\.env.example](.env.example) to `.env`:

```env
VITE_API_BASE_URL=http://localhost:3002
```

Copy [backend/.env.example](backend/.env.example) to `backend/.env`:

```env
PORT=3002
JWT_SECRET=your_secret
```

4) Start backend

```bash
npm run dev:server
```

5) Start frontend

```bash
npm run dev
```

## APK setup (Capacitor)

First-time Android setup:

```bash
npx cap add android
```

Sync web build to Android:

```bash
npm run android:sync
```

Open Android Studio project:

```bash
npm run android:open
```

Build debug APK:

```bash
npm run apk:debug
```

## Important for phone/APK testing

Set frontend API base URL to your laptop LAN IP (example):

```env
VITE_API_BASE_URL=http://192.168.1.20:3002
```

Phone and laptop must be on same network.

## Next step

Biometric hardening can be done next, after backend stability is confirmed.
