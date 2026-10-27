FROM golang:1.22-alpine AS build
WORKDIR /app
COPY go.mod ./
RUN go mod download || true
COPY . .
RUN go mod tidy && go build -o /api ./cmd/api

FROM alpine:3.20
WORKDIR /app
COPY --from=build /api /app/api
EXPOSE 8080
CMD ["/app/api"]
