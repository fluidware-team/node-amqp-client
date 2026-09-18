# Fluidware AMQP Client

helper library to expose high-level functions for amqp client

## Graceful shutdown

On `SIGINT`/`SIGTERM` this library only closes its own broker connection; it never calls `process.exit()`.
Your application must register its own `SIGINT`/`SIGTERM` handler and call `process.exit()` once all cleanup
(including this library's) has completed.

