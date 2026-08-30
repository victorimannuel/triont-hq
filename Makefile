.PHONY: dev build front back test tidy clean

# Build the bundle first: the Go binary embeds it.
build: front back

front:
	cd frontend && npm install --no-audit --no-fund && npm run build

back:
	go build -trimpath -o bin/hq ./cmd/hq

dev:
	go run ./cmd/hq

test:
	go vet ./...
	go test ./...
	cd frontend && npm run typecheck

tidy:
	go mod tidy

clean:
	rm -rf bin internal/web/dist/assets internal/web/dist/index.html
