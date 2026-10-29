# AtmoSmart

Sistema inteligente de monitoreo de atmósferas en minas subterráneas: registra niveles
de oxígeno, gases peligrosos, temperatura y ventilación por zona, evalúa los valores
frente a los límites establecidos y genera alertas preventivas (por umbral y por tendencia).

## Contenido

- [`frontend/`](frontend/README.md): mockup navegable en HTML, CSS y JS con datos simulados,
  estilos base y páginas principales. Para verlo, abra `frontend/index.html` en el navegador.
- [`docs/arquitectura.md`](docs/arquitectura.md): arquitectura hexagonal (puertos y adaptadores),
  independiente de la marca del sensor, con el demo inicial centrado en el frente de explotación.
- [`docs/parametros-normativos.md`](docs/parametros-normativos.md): reglas del semáforo según los Parámetros 1 y 2
  (Decreto 1886 de 2015 y Decreto 944 de 2022) y decisiones por confirmar con Ingeniería de Minas.
- [`docs/requerimientos-de-datos.md`](docs/requerimientos-de-datos.md): información que se necesita
  de la mina, la normativa, los sensores y la operación para usar el sistema en la vida real.
