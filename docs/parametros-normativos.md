# Parámetros normativos del semáforo

La lógica de evaluación está en [`frontend/assets/js/normativa.js`](../frontend/assets/js/normativa.js).
Se basa en los documentos **Parámetros 1 y 2** del equipo, que organizan el **Decreto 1886 de 2015**,
modificado por el **Decreto 944 de 2022**.

El sistema distingue siempre:

- **Límite normativo** (rojo / alarma): valor del decreto, con su artículo. No se edita en la app.
- **Criterio interno** (amarillo / precaución): umbral preventivo que define el equipo. Es configurable en
  *Límites y configuración* y **no es un límite legal**.

## Reglas implementadas

| Variable | Regla | Referencia |
| --- | --- | --- |
| O₂ | Alarma si es inferior a 19,5 % o superior a 23,5 % | Art. 38 |
| CH₄ | Alarma al **alcanzar** el límite del sitio: 1,0 % en frentes de explotación o avance y en retornos principales; 1,5 % en retornos de tajos y de frentes de preparación y desarrollo. Acción: suspender labores y evacuar | Art. 53 |
| CH₄ | Por encima de 2,0 %: solo personal de salvamento | Art. 53, par. 1 |
| CO, CO₂, H₂S, NO, NO₂, SO₂ | Se evalúan como **exposición**: promedio de la jornada en curso frente al TLV-TWA y promedio de 15 min frente al TLV-STEL. No son umbrales instantáneos de evacuación | Art. 39 |
| Jornada > 8 h | El TLV-TWA se corrige con Brief & Scala: Fc = (8/hd) × (24 − hd)/16 | Art. 39, par. 2 |
| Temperatura efectiva | te = 0,7 × th + 0,3 × ts − V. 28 °C sin limitación · 29 °C 6 h · 30 °C 4 h · 31 °C 2 h · 32 °C 0 h | Art. 217 |
| Temperatura efectiva | Por encima de 31 °C: solo cuadrillas de salvamento | Art. 218 |
| Temperatura seca, húmeda y HR | Son **entradas** para calcular te; no tienen semáforo propio | Arts. 217 y 218 |
| Velocidad del aire | Mínimo y máximo según el tipo de vía (por ejemplo, 0,3 m/s en ventilación auxiliar en carbón; máximo general 6,0 m/s; 4,5 m/s en tajos de carbón) | Art. 56 |
| Sensores | Lectura ausente, inválida o con calibración vencida = “no disponible”, nunca estado seguro | Arts. 46, 51 y 52 · criterio de diseño |

## Decisiones del equipo (por confirmar con Ingeniería de Minas)

Los Parámetros 1 y 2 no definen estos puntos. Se tomó la alternativa más conservadora y quedan editables:

| Tema | Decisión | Por qué |
| --- | --- | --- |
| Precaución de CH₄ | 50 % del límite del Art. 53 del sitio (0,5 % en frentes) | Da margen para actuar antes del límite de evacuación |
| Precaución de O₂ | Por debajo de 20,0 % o por encima de 23,0 % | Queda dentro del rango legal |
| Precaución por gases | Lectura instantánea ≥ 100 % del TLV-TWA, o promedio de jornada ≥ 50 % del TLV-TWA (nivel de acción) | Aviso temprano sin confundirlo con el límite legal |
| Alarma instantánea por gases | Gases con STEL: lectura ≥ STEL. Gases sin STEL (CO, NO, NO₂): lectura ≥ 5 × TLV-TWA | Criterio de excursiones de la ACGIH, a cuyos estándares remite el Art. 39 |
| Precaución de velocidad del aire | Menos de 20 % por encima del mínimo, o más de 90 % del máximo | Avisa de una posible falla de ventilación antes de incumplir |
| Temperatura efectiva intermedia | Se aplica el valor siguiente de la tabla (por ejemplo, 28,4 °C → 29 °C → 6 h) | Es la lectura más conservadora |
| Jornada | 8 horas (Fc = 1) | Turno de la demo: 06:00–14:00 |
| Sitios no listados en el Art. 53 | Bocamina, galerías de transporte, inclinado y bombeo usan 1,0 % | Es el valor más estricto de la tabla |
| Pozo o chimenea de retorno | Mínimo 0,5 m/s (ventilación principal); máximo exceptuado | El Art. 56 exceptúa los pozos del máximo general y no da un mínimo propio |
| Polvo de carbón | 0,5 / 0,9 mg/m³ | No está en los Parámetros 1 y 2; criterio interno |

### Clasificación de zonas de la mina simulada

| Zona | Sitio (Art. 53) | Tipo de vía (Art. 56) |
| --- | --- | --- |
| Bocamina | Vía de entrada (1,0 %) | Ventilación principal: vía de explotación |
| Galería principal N1 | Vía de transporte (1,0 %) | Ventilación principal: vía de explotación |
| Frente de explotación 1 | Frente de explotación o avance (1,0 %) | Ventilación auxiliar: vía en carbón |
| Inclinado / tambor | Vía de comunicación (1,0 %) | Ventilación principal: vía de explotación |
| Galería N2 | Vía de transporte (1,0 %) | Ventilación principal: vía de explotación |
| Frente de explotación 2 | Frente de explotación o avance (1,0 %) | Ventilación auxiliar: vía en carbón |
| Estación de bombeo | Vía de servicio (1,0 %) | Ventilación auxiliar: vía en roca |
| Chimenea de retorno | Retorno principal de aire (1,0 %) | Pozo de ventilación |

> Observación para Minas: en el plano simulado, el aire que sale del Frente 1 vuelve a la galería N1 y sigue
> hacia el Frente 2. El Art. 53, par. 2 limita a 0,5 % el metano en el retorno de frentes con ventilación
> auxiliar (categorías II y III) cuando ese aire se conduce a otros frentes. Si la mina es de esas categorías,
> conviene revisar esa regla o el circuito.

## Alcance

Es un prototipo académico, no una certificación de cumplimiento legal ni un plan de emergencia. Antes de uso
real, el responsable técnico debe confirmar el texto vigente, la categoría de la mina, los valores de exposición
ocupacional aplicables (ACGIH vigente) y los procedimientos de respuesta.
