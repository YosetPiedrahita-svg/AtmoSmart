# Requerimientos de datos de AtmoSmart

Información que se necesita para que el sistema funcione en una mina real y se adapte a su contexto.
El sistema no debe inventar nada: **el mapa sale del plano oficial, los límites del decreto y los datos de los equipos que la mina ya tiene.**

> Los valores numéricos (límites, caudales, tiempos) **deben verificarse directamente en la normativa** por el equipo de Ingeniería de Minas. Los del prototipo son solo de referencia.

---

## 1. La mina (cambia con el avance)

| Dato | Para qué se usa | Fuente |
| --- | --- | --- |
| Plano de labores y de ventilación vigente: niveles, galerías, frentes, chimeneas, ventiladores, puertas y reguladores | Dibujar el mapa y saber por dónde circula el aire | Topografía (el Decreto 1886 de 2015 exige mantenerlo actualizado) |
| Avance de frentes, labores nuevas y zonas cerradas o selladas | Actualizar el mapa por versiones | Topografía o supervisor de turno |
| Tipo de mineral (carbón, oro, otro) | Definir qué gases son críticos (carbón → metano; voladuras → CO y NO₂) | Título minero y Programa de Trabajos y Obras (PTO) |
| Clasificación de la mina por grisú, método de explotación y profundidad | Ajustar límites y frecuencia de medición | Ingeniería de Minas |

**Cómo se mantiene actualizado el mapa:** cada vez que topografía actualiza el plano, el backend publica una nueva **versión** (con fecha y responsable) y el mapa cambia solo. En una mina pequeña puede bastar con que el supervisor marque en la app "frente nuevo", "avance de X metros" o "zona sellada".

## 2. La normativa (límites y acciones)

| Dato | Para qué se usa |
| --- | --- |
| Límites de O₂, CH₄, CO, CO₂, H₂S y NO₂ (Decreto 1886 de 2015) | Umbrales de precaución y alarma |
| Velocidad mínima y máxima del aire; caudal mínimo por persona y por equipo | Evaluar la ventilación |
| Temperatura máxima permitida | Estrés térmico |
| Acciones obligatorias por nivel (suspender, cortar energía, evacuar) | Protocolos de cada alerta |
| Frecuencia de medición, quién mide y qué registros se conservan | Reglas de "sin señal" y reportes |
| Valores límite permisibles de exposición vigentes en Colombia | Exposición del trabajador por turno |
| Plan de emergencias de la mina: rutas, refugios, brigada, cadena de mando | Protocolos y notificaciones |

## 3. Los sensores (de dónde salen los datos)

| Dato | Para qué se usa |
| --- | --- |
| Inventario real de equipos: tipo, marca, modelo y ubicación | Crear los **perfiles de dispositivo** (ver `arquitectura.md`) |
| Cómo exporta datos cada equipo: Modbus, 4–20 mA, base de carga (CSV), Bluetooth | Elegir el adaptador de entrada |
| Comunicación disponible bajo tierra: cable, fibra, radio o ninguna | Definir si es tiempo real o descarga al final del turno |
| Fechas de calibración y pruebas de respuesta (*bump test*) | Marcar lecturas no confiables |

## 4. La operación diaria (contexto)

| Dato | Para qué se usa |
| --- | --- |
| Turnos y personal por zona (control de lámparas o fichas) | Saber quién está expuesto y a quién evacuar |
| Voladuras programadas: hora, lugar, tiempo de reingreso | Interpretar picos de CO/NO₂ y bloquear el reingreso |
| Estado de los ventiladores (encendido/apagado, caudal) | Reglas compuestas (p. ej., ventilador apagado + personal en el frente) |
| Histórico de mediciones e incidentes | Ajustar las alertas predictivas a esa mina |

## 5. Quién actualiza cada dato

| Dato | Frecuencia | Quién o qué |
| --- | --- | --- |
| Lecturas de gases y ambiente | Segundos o minutos | Sensores y gateway (automático) |
| Personal por zona | Por turno | Control de lámparas o fichas |
| Plano y frentes | Semanal o con cada avance | Topografía o supervisor |
| Voladuras | Cada disparo | Supervisor / responsable de voladuras |
| Límites y protocolos | Cuando cambie la normativa | Responsable de seguridad (HSE), con historial de cambios |

## 6. Para el demo inicial (frente de explotación)

Mínimo necesario para mostrar el sistema funcionando en un frente:

- [ ] Plano simplificado del frente y su conexión con la galería y el retorno
- [ ] Límites de CH₄, CO y O₂ validados por Minas
- [ ] Variables del frente: CH₄, CO, O₂, temperatura, velocidad del aire y estado del ventilador auxiliar
- [ ] Número de personas en el frente
- [ ] Protocolo de respuesta para metano alto y para falla del ventilador auxiliar
- [ ] Tipo genérico de equipo con que se mediría (sin modelos inventados)
