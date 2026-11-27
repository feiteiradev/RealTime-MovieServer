PLATFORMS := windows/amd64 darwin/arm64 darwin/amd64 linux/amd64 linux/arm64

.PHONY: build web test run

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
	cd server && go vet ./... && go test ./...
	cd web && bun run typecheck

run: web
	cd server && go run .
