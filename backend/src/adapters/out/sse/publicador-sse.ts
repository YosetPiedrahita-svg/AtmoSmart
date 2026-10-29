/**
 * Adaptador de salida: publica eventos del dominio a los navegadores
 * conectados mediante Server-Sent Events (GET /api/stream).
 * SSE es HTTP simple de una vía (servidor → navegador) y el navegador
 * reconecta solo si se cae la conexión.
 */
import type { Response } from "express";
import type { EventoDominio, Publicador } from "../../../application/ports/salida";

export class PublicadorSSE implements Publicador {
  private clientes = new Set<Response>();

  conectar(res: Response): void {
    res.set({ "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" });
    res.flushHeaders();
    res.write("retry: 3000\n\n");
    this.clientes.add(res);
    const latido = setInterval(() => res.write(": latido\n\n"), 25_000);
    res.on("close", () => {
      clearInterval(latido);
      this.clientes.delete(res);
    });
  }

  publicar(evento: EventoDominio): void {
    const datos = `event: ${evento.tipo}\ndata: ${JSON.stringify(evento)}\n\n`;
    for (const c of this.clientes) c.write(datos);
  }

  get conectados(): number {
    return this.clientes.size;
  }
}
