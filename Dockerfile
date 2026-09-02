# Base images come from Google's pull-through cache of Docker Hub rather than
# from Docker Hub itself: registry-1.docker.io is filtered on the network this
# is built from, and the TLS handshake hangs rather than failing fast. The
# mirror serves the same images by the same names, so this changes where the
# bytes come from and nothing about what gets built.

# 1. Build the React bundle straight into the Go embed directory.
# Debian rather than Alpine: sharp (used by the icon script in devDependencies)
# has far better glibc prebuild coverage than musl. This stage is discarded.
FROM mirror.gcr.io/library/node:20-bookworm-slim AS frontend
WORKDIR /src
COPY frontend/package.json frontend/package-lock.json ./frontend/
RUN cd frontend && npm ci --no-audit --no-fund
COPY frontend/ ./frontend/
RUN mkdir -p internal/web/dist && cd frontend && npm run build

# 2. Compile a static binary with that bundle baked in.
FROM mirror.gcr.io/library/golang:1.25-alpine AS backend
WORKDIR /src
COPY go.mod go.sum ./
RUN go mod download
COPY . .
COPY --from=frontend /src/internal/web/dist ./internal/web/dist
RUN CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" -o /out/hq ./cmd/hq

# 3. Ship the binary and nothing else.
FROM gcr.io/distroless/static-debian12:nonroot
COPY --from=backend /out/hq /hq
EXPOSE 8080
USER nonroot:nonroot
ENTRYPOINT ["/hq"]
