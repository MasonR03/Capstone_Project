
# Networking Notes (Draft)

- Authoritative server @ 30 Hz tick
- Broadcast snapshots ~15 Hz (serverTime in ms)
- Client keeps 100 ms interpolation buffer and renders between two snapshots
- Inputs sent ~20 Hz: { thrust, turn, clientTime }
- Minimal prediction: local ship only (future)
