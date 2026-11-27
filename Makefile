PLATFORMS := windows/amd64 darwin/arm64 darwin/amd64 linux/amd64 linux/arm64

.PHONY: build web test e2e run

# Build the frontend, then a Campfire binary per platform into bin/.
build: web
	cd server && for p in $(PLATFORMS); do \
		os=$${p%/*}; arch=$${p#*/}; ext=$$([ $$os = windows ] && echo .exe); \
		CGO_ENABLED=0 GOOS=$$os GOARCH=$$arch go build -trimpath -ldflags="-s -w" -o ../bin/campfire-$$os-$$arch$$ext . || exit 1; \
	done

web:
	cd web && bun install --frozen-lockfile && bun run build
	touch server/dist/.gitkeep # vite empties dist; keep the committed placeholder

test:
	cd server && go vet ./... && go test -race ./...
	cd web && bun run typecheck && bun test

# Browser end-to-end tests against the real server (downloads Playwright's Chromium once).
e2e: web
	cd web && bunx playwright install chromium && bunx playwright test

run: web
	cd server && go run .
