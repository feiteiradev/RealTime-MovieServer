# Local Files are own copies, not streamed from the Host

Each Viewer opens their own copy of a Local File in the browser; the server shares only the Playback State and never serves the file. The Host's tunnel is ngrok's free plan, capped at 1 GB of transfer per month, while one movie sent to 3–5 Viewers is 6–20 GB. Streaming from the Host would also bring home upload limits and ffmpeg conversion into scope. The cost is that everyone must have the file before watching.

## Considered Options

- **Stream from the Host over ngrok free**: rejected because of the 1 GB/month cap.
- **Stream over Cloudflare Tunnel**: rejected because its terms forbid serving video over free public tunnel hostnames.
- **Stream over Tailscale Funnel**: deferred. It's free with no data cap, but its throughput is unpublished and may be too low for several HD streams. It's worth revisiting if own copies prove too inconvenient.
