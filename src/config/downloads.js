import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const BACKEND_ROOT = path.join(__dirname, '..', '..');
export const DOWNLOADS_DIR = path.join(BACKEND_ROOT, 'downloads');
// electron-updater's "generic" provider feed — latest.yml/latest-mac.yml
// plus the installer files they reference. Served as a plain static
// directory (see app.js) since electron-updater is a bare HTTP client, not
// a browser — no auth, no download headers, just files at stable paths.
export const AGENT_UPDATES_DIR = path.join(BACKEND_ROOT, 'agent-updates');
// The NSIS installer itself — since the switch to NSIS (see
// desktop-agent/package.json's win.target), the backend URL is baked in as
// config.js's DEFAULT_API_BASE_URL, so unlike the old portable .zip build
// this needs no config.json sitting next to it. A bare installer download
// also means every fresh install lands on the NSIS build from day one,
// which is what makes electron-updater (and this feed) apply to it at all —
// the old portable .zip had no update mechanism whatsoever.
export const DESKTOP_AGENT_FILENAME = 'Advertisers360AgentSetup.exe';
// macOS build (see desktop-agent/package.json's "mac"/"dmg" electron-builder
// config) — a signed/notarized .dmg doesn't need config.json bundled
// alongside it the way the Windows zip does, since it's a single installer.
export const DESKTOP_AGENT_MAC_FILENAME = 'Advertiser360Agent-Mac.dmg';
