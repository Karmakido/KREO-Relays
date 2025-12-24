# KREO Relay Directory

Relay discovery list used by KREO clients and relays.

- File: `relays.json` (`{"relays": ["wss://...", "ws://..."]}`)
- Clients: override via `KREO_RELAYS_URL` env or `--server/--seeds`; relays can use `RELAY_SEEDS_URL`.

## Tooling (Node >= 18)
- Validate: `npm run validate` (shape + duplicates + protocol)
- Admin UI: `npm run admin` then open http://<host>:<port> (default 0.0.0.0:4000; override with `ADMIN_HOST`/`ADMIN_PORT`)  
  - Enter host pattern with `{N}`, start port, count, and generate URLs.  
  - Manually add/remove URLs in the UI list or textarea.  
  - Health checks run before saving.  
  - Load Current: pulls from `GITHUB_RELAYS_URL` if set (uses `GITHUB_TOKEN` for private repos), otherwise from local `relays.json`.  
  - Saves (merges + sorts) into `relays.json`.  
  - Optional auto-push: set `GIT_AUTO_PUSH=1` (+ `GIT_REMOTE`, `GIT_BRANCH`, git creds in the container) to `git add/commit/push` after save.
  - Optional token: set env `ADMIN_TOKEN=secret` and pass header `x-admin-token`.
- Docker: `docker build -t kreo-relays-admin . && docker run -p 4000:4000 -e ADMIN_HOST=0.0.0.0 -v $PWD/relays.json:/app/relays.json kreo-relays-admin`
  - Mount `relays.json` (or the whole repo) to persist edits and commit/push to GitHub outside the container.
- Windows helper: `run-admin-docker.bat` (reads `.env` for HOST/PORT/TOKEN/GIT_AUTO_PUSH/etc.).
- Env defaults in `.env` (edit before running; do not commit secrets).
  - Note: Dockerfile installs `git` for auto-push; rebuild image after changes.
  - For auto-push: ensure the container sees a `.git` directory. `run-admin-docker.bat` mounts the whole repo if `.git` is present next to the script; otherwise only `relays.json` is mounted.

## Notes
- Prefer `wss://` where possible; `ws://` entries should be intentional.
- Publish the raw `relays.json` (e.g., GitHub raw) for clients to consume.
