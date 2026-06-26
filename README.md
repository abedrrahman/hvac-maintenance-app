# HVAC Maintenance Report App

Fully offline, on-device HVAC maintenance reporting app for **Aladdin Sweiti Engineering Est. (ASEE)**.

Built with React Native, Expo SDK 56, TypeScript, and Expo Router. All data is stored locally using **expo-sqlite** — no server or internet required.

## Features

- **8 machine types**: AHU, Chiller, FCU, Split, VRF, Cooling Tower, Boiler, Custom
- **Dynamic checklists** per machine type with custom row support
- **6-step form wizard**: Info → Machine Data → Checklist → Notes & Materials → Photos → Signatures
- **PDF export** matching ASEE company template (bilingual EN/AR, header/footer on every page)
- **Signature capture** with lock-on-customer-sign workflow
- **Photo attachments** with captions (camera + gallery)
- **Report list** with search, filter, and long-press delete
- **Tablet-friendly** responsive layout

## Getting Started

```bash
cd hvac-maintenance-app
npm install
npx expo start
```

Scan the QR code with **Expo Go** (SDK 56) on your device, or run:

```bash
npx expo run:android
npx expo run:ios
```

> **Note**: Signature canvas and PDF export work best on a physical device or emulator — not all features are available in web preview.

## Project Structure

```
app/                    # Expo Router screens
  index.tsx             # Report list
  new.tsx               # Create new report (machine type selection)
  custom-templates.tsx  # Admin custom checklist templates
  report/[id]/[step].tsx # 6-step report form
components/             # Reusable UI components
constants/              # Theme, checklists, machine types, company info
context/                # Database provider
db/                     # SQLite schema + repositories
services/               # PDF generation + sharing
hooks/                  # useReport hook
types/                  # TypeScript interfaces
utils/                  # Helpers
```

## Database Schema

| Table | Purpose |
|-------|---------|
| `reports` | Main report metadata |
| `checklist_items` | Per-report checklist values |
| `attention_notes` | Attention-needed rows |
| `materials` | Materials used |
| `photos` | Site photo URIs + captions |
| `signatures` | Technician & customer signatures |
| `custom_checklist_templates` | Custom machine type field definitions |

## PDF Export

Uses `expo-print` with an HTML template that matches the ASEE layout:

- Company header (logo + bilingual name) on every page
- Company footer (EN + AR contact info) on every page
- Orange/amber highlights (`#E8730A`) for filled values
- Page 1: Info + Machine Data + Checklist
- Page 2: Attention + Required Maintenance + Materials
- Page 3: Notes + Signatures
- Page 4+: Site Photos grid (if photos exist)

Export via native share sheet (Save, WhatsApp, Email, Print).

## Workflow

1. Tap **+ New Report** → select machine type + maintenance type
2. Complete steps 1–6, saving draft at any point
3. Customer signs on step 6 → **Lock & Export PDF**
4. Report becomes read-only with **SIGNED & LOCKED** badge

## Tech Stack

- React Native + Expo SDK 56
- Expo Router (file-based navigation)
- TypeScript
- expo-sqlite, expo-print, expo-sharing, expo-image-picker, expo-file-system
- react-native-signature-canvas
