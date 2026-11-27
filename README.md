# Campfire

A self-hosted Room where friends watch the same Media Item at the same moment, each in their own browser. The Host runs one program and shares a link; Viewers join with just a Nickname.

## Build

Needs Go 1.27+, Bun 1.3+ and `make`.

```sh
make build
```

This builds the frontend with Bun and writes one binary per platform into `bin/`, with the frontend embedded:

- `campfire-windows-amd64.exe`
- `campfire-darwin-arm64`, `campfire-darwin-amd64`
- `campfire-linux-amd64`, `campfire-linux-arm64`

## Run

```sh
./bin/campfire-darwin-arm64            # listens on port 8080
./bin/campfire-darwin-arm64 -port 9000 # or pick a port
```

It prints the local URL, e.g. `Campfire is running at http://localhost:8080`. Open it to join. Restarting starts a fresh, empty Room.

## Share it with ngrok

Campfire doesn't start ngrok for you. In a second terminal, with [ngrok](https://ngrok.com/download) installed and signed in:

```sh
ngrok http 8080   # use the same port Campfire is running on
```

Share the `https://….ngrok-free.app` URL it prints. On ngrok's free plan each Viewer first sees a one-time ngrok warning page: they click **Visit Site** once and the browser remembers it for 7 days. The WebSocket isn't affected. Media never goes through the tunnel, only sync messages, so the free data quota is plenty.

Anyone with the link has full control of the Room; the unguessable ngrok URL is the only protection.

## Develop

```sh
make test               # go vet + go test, and the frontend type-check
cd server && go run .   # server on :8080 (serves the last web build)
cd web && bun run dev   # Vite dev server with hot reload; proxies /ws to :8080
```

Layout:

- `server/room/`: the Room's state and rules, with no networking. `protocol.go` holds every protocol message type.
- `server/transport/`: HTTP and WebSocket transport, plus the protocol tests that run the real server in-process.
- `server/main.go`: flags and the embedded frontend (`server/dist/`, filled by the web build).
- `web/`: React + Vite + TypeScript + Tailwind frontend. `src/protocol.ts` mirrors the Go protocol types.
