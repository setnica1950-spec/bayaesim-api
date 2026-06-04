# BAYA eSIM API

Small Node.js HTTP API for health checks and local OMAX credential diagnostics.

## Requirements

- Node.js 18 or newer

## Run

```sh
npm start
```

The server listens on `PORT` when set, otherwise `3000`.

## Test

```sh
npm test
```

## Configuration

| Variable | Required | Description |
| --- | --- | --- |
| `PORT` | No | HTTP port. Defaults to `3000`. |
| `NODE_ENV` | No | Set to `development` together with `OMAX_DEBUG_ENABLED=true` to enable the debug endpoint. |
| `OMAX_DEBUG_ENABLED` | No | Must be `true` to expose `/api/debug-omax`. |
| `OMAX_CLIENT_ID` | Debug only | OMAX OAuth client ID. |
| `OMAX_CLIENT_SECRET` | Debug only | OMAX OAuth client secret. |

Copy `.env.example` when setting local environment variables. Do not commit real secrets.

## Endpoints

### `GET /health`

Returns:

```json
{"status":"ok"}
```

### `GET /api/debug-omax`

Development-only OMAX token endpoint diagnostic. It is hidden unless both of these are set:

```sh
NODE_ENV=development
OMAX_DEBUG_ENABLED=true
```

The endpoint requires `OMAX_CLIENT_ID` and `OMAX_CLIENT_SECRET`, forwards a client-credentials request to OMAX, and redacts token or secret fields before returning the upstream status and response shape.
