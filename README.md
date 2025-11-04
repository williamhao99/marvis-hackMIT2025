# Marvis

William Hao, Pierce Brookins, Jessica Young, and Atharv Mungale's HackMIT 2025 project

AI-powered handyman assistant for smart glasses. Scan a barcode, get step-by-step AR instructions.

**1st Place - Mentra Track @ HackMIT 2025** | [Devpost (Plume)](https://plume.hackmit.org/project/rmgcj-hlsfk-pplsy-jbtfm)

## Stack

MentraOS • Bun/TypeScript • Express • Anthropic Claude • Cerebras • SerpAPI/Exa • AWS S3

## Setup

```bash
bun install
cp .env.example .env  # Add MENTRAOS_API_KEY and ANTHROPIC_API_KEY
bun run dev
```

## MentraOS Configuration

**Create app** at [developer.mentra.com](https://developer.mentra.com):
- Package: `com.marvis.hackmit2025`
- Permissions: MICROPHONE, CAMERA
- Server URL: `http://[YOUR_IP]:3000` (find IP: `ifconfig | grep "inet "`)

**For remote access:** Run `bun run ngrok` in a separate terminal, then use the ngrok HTTPS URL as your server URL. The app will tunnel port 3000 automatically.

Launch the app on your glasses to connect.

## Web Interface

- Dashboard: `http://localhost:3000/webview`
- Photo Viewer: `http://localhost:3000/photo-viewer`

## How It Works

Barcode scan -> Cerebras identifies product -> SerpAPI finds manual -> Claude parses instructions -> Display on glasses
