# Hubble — Cloud Version (Phase 1–4, bugfix round)

## Fixes in this round
1. **Private message images** — root cause: Socket.IO's default 1MB message
   size limit was silently dropping larger images. Raised to 25MB.
2. **My Contacts not clickable** — rows now open the full saved card (all
   shared fields + your note).
3. **"My Hubs" showing empty** — this was a *cross-device identity* issue:
   each browser/device gets its own anonymous identity by default, so a hub
   opened on your laptop won't show as "mine" on your phone. Added an
   identity-sync code (Home screen → "חיבור בין מכשירים"): copy the code
   from one device, paste it into another, and they become the same
   identity, sharing cards/hubs/contacts.
4. **New "ההודעות שלי" page** — aggregates all private messages you've
   received, across every hub, with sender + hub name.
5. **"Hubs near me" empty** — this one is inherent to local testing: the
   physical-presence check compares public IP addresses, which only line
   up correctly once the server sits behind a real NAT boundary (i.e. once
   deployed to the cloud in Phase 6). Locally, each device shows its own
   distinct LAN IP, so nothing matches yet — this isn't a bug, it will
   start working correctly after deployment.
6. **Background image/music not loading, not stopping on leaving the hub,
   couldn't re-edit** — root cause: the same 1MB Socket.IO limit as #1 was
   silently dropping the upload before it ever reached the server. Switched
   background/music upload to a normal HTTP POST (more robust for large
   files) and applied immediately client-side instead of only via
   broadcast. Also fixed: leaving a hub now properly stops the music and
   clears the background.
7. **Hub ownership confusion** — same root cause as #3 (cross-device
   identity). Ownership itself was always correctly tied to the person who
   opened the hub, not to which card was active — the sync-code feature is
   the real fix here too.

## Run locally
```bash
python3 -m venv venv
source venv/bin/activate      # Windows: venv\Scripts\activate
pip install -r requirements.txt
python3 app.py
```
Open http://localhost:5050

## Next: Phase 6 — deploy to a free cloud tier with a public URL
(Phase 5, the guided demo-script mode, is on hold per request.)
