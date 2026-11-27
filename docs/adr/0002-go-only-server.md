# Go only for the server, no Rust

The goal was to learn Rust, Go or both. The server is written only in Go (net/http, WebSockets, `embed` to ship the frontend in one cross-compiled binary). Splitting one small app across two languages would mean two toolchains and a protocol between them, with no product benefit. Rust stays available for a later, genuinely separate component, such as a media converter, if one appears.
