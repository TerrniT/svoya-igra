FROM golang:1.24-alpine AS build
WORKDIR /src
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 GOOS=linux go build -o /out/server ./cmd/server

FROM alpine:3.20
RUN adduser -D -H -u 10001 app
COPY --from=build /out/server /server
USER app
EXPOSE 8080
ENV HOST=0.0.0.0
ENV PORT=8080
ENTRYPOINT ["/server"]
