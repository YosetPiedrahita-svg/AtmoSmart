/**
 * Casos de uso de AtmoSmart (capa de aplicación).
 *
 * Orquesta el flujo de una lectura:
 *   adaptador → ingerir() → normalizar + calidad → guardar → ventana reciente
 *   → evaluarZona() (dominio) → sincronizar alertas → publicar evento en vivo
 *
 * Solo depende de los puertos (interfaces) y del dominio.
 */
import { aUnidadCanonica, clasificarCalidad } from "../domain/calidad";
import { evaluarZona, type ResultadoEvaluacion } from "../domain/reglas";
import { evaluarValor, limiteSuperado, umbralesValidos } from "../domain/umbrales";
import { NIVELES_PRUEBA, valorParaNivel, type NivelPrueba } from "../domain/dato-de-prueba";
import { TIPO, type Alerta, type CondicionDeAlerta, type ConfiguracionLimites, type Dispositivo, type Medicion, type Umbrales, type Variable, type Zona } from "../domain/modelo";
import type { GestionarAlertas, GestionarLimites, IngerirMediciones, MensajeCanonico, RegistrarLecturaManual, ResultadoIngesta } from "./ports/entrada";
import type { AlertasRepositorio, CatalogoRepositorio, MedicionesRepositorio, Publicador, Reloj } from "./ports/salida";
import { VentanaReciente } from "./ventana-reciente";

export interface Dependencias {
  catalogo: CatalogoRepositorio;
  mediciones: MedicionesRepositorio;
  alertas: AlertasRepositorio;
  publicador: Publicador;
  reloj: Reloj;
}

export interface Opciones {
  /** segundos sin datos para considerar un equipo / zona sin señal */
  sinSenalSegundos: number;
  /** minutos de anticipación para alertas predictivas */
  horizonteMin: number;
  /** ventana (min) usada para calcular la tendencia */
  ventanaTendenciaMin: number;
  /** segundos que una condición debe desaparecer antes de cerrar la alerta (evita parpadeo) */
  histeresisSegundos: number;
}

export class ErrorDeDominio extends Error {
  constructor(message: string, readonly codigo: "no_encontrado" | "invalido" = "invalido") {
    super(message);
  }
}

const ALCANCE_ZONA = ["umbral:", "tendencia:", "ventilacion:", "manual:"];
const ALCANCE_EQUIPOS = ["sensor:", "calibracion:"];
const GASES = ["o2", "ch4", "co", "co2", "h2s", "no2"];

export class ServicioMonitoreo implements IngerirMediciones, RegistrarLecturaManual, GestionarAlertas, GestionarLimites {
  private zonas: Zona[] = [];
  private variables = new Map<string, Variable>();
  private dispositivos = new Map<string, Dispositivo>();
  private ventana = new VentanaReciente(30);
  private resultados = new Map<string, ResultadoEvaluacion>();
  private ausentes = new Map<string, number>();
  private ultimaEscrituraDispositivo = new Map<string, number>();

  constructor(private readonly d: Dependencias, private readonly o: Opciones) {}

  /** Carga el catálogo y reconstruye la ventana reciente desde la base de datos. */
  async iniciar(): Promise<void> {
    const [zonas, variables, dispositivos] = await Promise.all([this.d.catalogo.zonas(), this.d.catalogo.variables(), this.d.catalogo.dispositivos()]);
    if (!zonas.length || !variables.length) {
      throw new Error("El catálogo está vacío. Si usa Supabase, ejecute primero la migración y `npm run db:seed`.");
    }
    this.zonas = zonas.sort((a, b) => a.orden - b.orden);
    this.variables = new Map(variables.map((v) => [v.clave, v]));
    this.dispositivos = new Map(dispositivos.map((x) => [x.id, x]));

    const recientes = await this.d.mediciones.desde(new Date(this.d.reloj.ahora().getTime() - 30 * 60_000));
    recientes.forEach((m) => this.ventana.agregar(m));
    await this.vigilar();
  }

  // ---------------------------------------------------------------------------
  // Ingesta
  // ---------------------------------------------------------------------------

  async ingerir(mensajes: MensajeCanonico[]): Promise<ResultadoIngesta> {
    return this.procesar(mensajes, true);
  }

  async ingerirHistorico(mensajes: MensajeCanonico[]): Promise<ResultadoIngesta> {
    return this.procesar(mensajes, false);
  }

  private async procesar(mensajes: MensajeCanonico[], enVivo: boolean): Promise<ResultadoIngesta> {
    const ahora = this.d.reloj.ahora();
    const aceptadas: Medicion[] = [];
    const rechazadas: ResultadoIngesta["rechazadas"] = [];
    const zonasAfectadas = new Set<string>();

    for (const msg of mensajes) {
      const disp = this.dispositivos.get(msg?.dispositivoId);
      if (!disp) {
        rechazadas.push({ motivo: "dispositivo no registrado", dispositivoId: msg?.dispositivoId });
        continue;
      }
      const zonaId = msg.zonaId ?? disp.zonaId;
      if (!this.zonas.some((z) => z.id === zonaId)) {
        rechazadas.push({ motivo: "zona desconocida", dispositivoId: disp.id });
        continue;
      }
      const instante = msg.instante ? new Date(msg.instante) : ahora;
      if (Number.isNaN(instante.getTime()) || instante.getTime() > ahora.getTime() + 60_000) {
        rechazadas.push({ motivo: "instante inválido", dispositivoId: disp.id });
        continue;
      }

      for (const l of msg.lecturas ?? []) {
        const variable = this.variables.get(l.variable);
        if (!variable || typeof l.valor !== "number" || !Number.isFinite(l.valor)) {
          rechazadas.push({ motivo: "variable o valor inválido", dispositivoId: disp.id, variable: l.variable });
          continue;
        }
        const valor = aUnidadCanonica(l.variable, l.valor, l.unidad);
        const origen = msg.origen ?? (disp.tipo.includes("portátil") ? "portatil" : "sensor_fijo");
        const m: Medicion = {
          zonaId,
          variable: l.variable,
          valor,
          instante,
          dispositivoId: disp.id,
          origen,
          calidad: clasificarCalidad({ valor, variable, origen, dispositivo: disp, ahora, recientes: this.ventana.recientesDispositivo(disp.id, l.variable) }),
        };
        aceptadas.push(m);
        // Lo histórico reciente (≤ 30 min) también da contexto para las tendencias.
        if (enVivo || ahora.getTime() - instante.getTime() <= 30 * 60_000) this.ventana.agregar(m);
        zonasAfectadas.add(zonaId);
      }

      if (enVivo) await this.registrarComunicacion(disp, instante, msg.bateria);
    }

    if (aceptadas.length) await this.d.mediciones.guardar(aceptadas);
    if (enVivo && zonasAfectadas.size) {
      for (const z of zonasAfectadas) await this.evaluarYSincronizar(z);
      this.d.publicador.publicar({ tipo: "mediciones", zonas: [...zonasAfectadas] });
    }
    return { aceptadas: aceptadas.length, rechazadas };
  }

  /** Actualiza batería y última comunicación (en BD como máximo cada 30 s por equipo). */
  private async registrarComunicacion(disp: Dispositivo, instante: Date, bateria?: number | null) {
    if (!disp.ultimaComunicacion || disp.ultimaComunicacion < instante) disp.ultimaComunicacion = instante;
    if (bateria != null) disp.bateria = bateria;
    const ultima = this.ultimaEscrituraDispositivo.get(disp.id) ?? 0;
    if (Date.now() - ultima > 30_000) {
      this.ultimaEscrituraDispositivo.set(disp.id, Date.now());
      await this.d.catalogo.actualizarDispositivo(disp.id, { bateria: disp.bateria, ultimaComunicacion: disp.ultimaComunicacion });
    }
  }

  // ---------------------------------------------------------------------------
  // Registro manual (contingencia)
  // ---------------------------------------------------------------------------

  async registrarManual(cmd: { zonaId: string; valores: Record<string, number | null>; detector: string; motivo: string; usuario: string }): Promise<ResultadoIngesta> {
    if (!this.zonas.some((z) => z.id === cmd.zonaId)) throw new ErrorDeDominio("Zona desconocida", "no_encontrado");
    if (!cmd.detector?.trim()) throw new ErrorDeDominio("Debe indicar el detector portátil utilizado");
    const ahora = this.d.reloj.ahora();
    const detalle = { detector: cmd.detector.trim(), motivo: cmd.motivo, usuario: cmd.usuario };
    const mediciones: Medicion[] = [];
    const condiciones: CondicionDeAlerta[] = [];

    for (const [clave, valor] of Object.entries(cmd.valores ?? {})) {
      const v = this.variables.get(clave);
      if (!v || valor == null || !Number.isFinite(valor)) continue;
      mediciones.push({ zonaId: cmd.zonaId, variable: clave, valor, instante: ahora, dispositivoId: null, origen: "manual", calidad: "manual", detalle });
      // Aunque la zona esté sin señal, una lectura manual fuera de límite debe alertar.
      const estado = evaluarValor(valor, v.umbrales);
      const sup = (estado === "warn" || estado === "crit") && limiteSuperado(valor, v.umbrales, estado);
      if (sup) {
        condiciones.push({
          clave: `manual:${cmd.zonaId}:${clave}`,
          severidad: estado,
          tipo: TIPO.umbral,
          zonaId: cmd.zonaId,
          variable: clave,
          valor,
          limite: sup.limite,
          titulo: `${v.nombre} ${sup.direccion === "alto" ? "por encima" : "por debajo"} del límite (lectura manual)`,
          detalle: `Medido con ${detalle.detector} por ${cmd.usuario}. Motivo: ${cmd.motivo}.`,
          protocolo: clave,
        });
      }
    }
    if (!mediciones.length) throw new ErrorDeDominio("Ingrese al menos una medición válida");

    await this.d.mediciones.guardar(mediciones);
    mediciones.forEach((m) => this.ventana.agregar(m));
    for (const c of condiciones) await this.crearOActualizar(c, ahora);
    await this.evaluarYSincronizar(cmd.zonaId);
    this.d.publicador.publicar({ tipo: "mediciones", zonas: [cmd.zonaId] });
    return { aceptadas: mediciones.length, rechazadas: [] };
  }

  // ---------------------------------------------------------------------------
  // Evaluación de riesgo y alertas
  // ---------------------------------------------------------------------------

  private zonaSinSenal(zonaId: string, ahora: Date): boolean {
    const ultima = this.ventana.ultimaLecturaSensor(zonaId);
    const gases = GASES.some((g) => {
      const u = this.ventana.ultimo(zonaId, g);
      return u && u.origen !== "manual" && ahora.getTime() - u.instante.getTime() <= this.o.sinSenalSegundos * 1000;
    });
    return !ultima || !gases;
  }

  private async evaluarYSincronizar(zonaId: string): Promise<ResultadoEvaluacion> {
    const zona = this.zonas.find((z) => z.id === zonaId)!;
    const ahora = this.d.reloj.ahora();
    const actuales: Record<string, number | null> = {};
    const series: Record<string, { t: number; v: number }[]> = {};
    for (const v of this.variables.values()) {
      actuales[v.clave] = this.ventana.ultimo(zonaId, v.clave)?.valor ?? null;
      series[v.clave] = this.ventana.serie(zonaId, v.clave, this.o.ventanaTendenciaMin, ahora);
    }
    const sinSenal = this.zonaSinSenal(zonaId, ahora);
    const resultado = evaluarZona({ zona, variables: [...this.variables.values()], actuales, series, sinSenal, horizonteMin: this.o.horizonteMin });
    this.resultados.set(zonaId, resultado);

    // Sin datos no se puede afirmar que el riesgo desapareció: no se cierran alertas.
    if (!sinSenal) {
      await this.sincronizar(resultado.condiciones, (a) => a.zonaId === zonaId && ALCANCE_ZONA.some((p) => a.clave.startsWith(p)), ahora);
    }
    return resultado;
  }

  /** Revisión periódica: equipos sin señal, calibraciones vencidas y re-evaluación de zonas. */
  async vigilar(): Promise<void> {
    const ahora = this.d.reloj.ahora();
    const hoy = ahora.toISOString().slice(0, 10);
    const condiciones: CondicionDeAlerta[] = [];

    for (const disp of this.dispositivos.values()) {
      const fijo = !disp.tipo.includes("portátil") && !disp.tipo.includes("Gateway");
      const silencio = disp.ultimaComunicacion ? (ahora.getTime() - disp.ultimaComunicacion.getTime()) / 1000 : null;
      // Solo se alerta por equipos que ya comunicaron alguna vez (los nunca vistos
      // aparecen como "pendiente de instalación", no como falla).
      if (fijo && silencio != null && silencio > this.o.sinSenalSegundos) {
        const min = Math.max(1, Math.round(silencio / 60));
        condiciones.push({
          clave: `sensor:${disp.id}`,
          severidad: "off",
          tipo: TIPO.sinSenal,
          zonaId: disp.zonaId,
          variable: null,
          valor: null,
          limite: null,
          titulo: `${disp.tipo} ${disp.id} sin comunicación`,
          detalle: `Última lectura hace ${min} min. Mientras se restablece, mida con detector portátil y use el registro manual.`,
          protocolo: "sensor",
        });
      }
      if (disp.calibracionVence && disp.calibracionVence < hoy) {
        const dias = Math.round((Date.parse(hoy) - Date.parse(disp.calibracionVence)) / 86_400_000);
        condiciones.push({
          clave: `calibracion:${disp.id}`,
          severidad: "info",
          tipo: TIPO.calibracion,
          zonaId: disp.zonaId,
          variable: null,
          valor: null,
          limite: null,
          titulo: `${disp.tipo} ${disp.id}: calibración vencida hace ${dias} día(s)`,
          detalle: "Las lecturas pueden no ser confiables hasta recalibrar.",
          protocolo: "sensor",
        });
      }
    }
    await this.sincronizar(condiciones, (a) => ALCANCE_EQUIPOS.some((p) => a.clave.startsWith(p)), ahora);
    for (const z of this.zonas) await this.evaluarYSincronizar(z.id);
  }

  /**
   * Convierte condiciones en alertas persistentes:
   *  - condición nueva → crea alerta
   *  - condición existente → actualiza valor/severidad
   *  - alerta cuya condición desapareció (por más de la histéresis) → se resuelve
   */
  private async sincronizar(condiciones: CondicionDeAlerta[], enAlcance: (a: Alerta) => boolean, ahora: Date) {
    const activas = (await this.d.alertas.activas()).filter(enAlcance);
    const claves = new Set(condiciones.map((c) => c.clave));

    for (const c of condiciones) {
      this.ausentes.delete(c.clave);
      await this.crearOActualizar(c, ahora, activas);
    }
    for (const a of activas) {
      if (claves.has(a.clave)) continue;
      const desde = this.ausentes.get(a.clave) ?? ahora.getTime();
      this.ausentes.set(a.clave, desde);
      if (ahora.getTime() - desde >= this.o.histeresisSegundos * 1000) {
        this.ausentes.delete(a.clave);
        await this.d.alertas.actualizar(a.id, { activa: false, resueltaEn: ahora, actualizadaEn: ahora });
        this.d.publicador.publicar({ tipo: "alerta", accion: "resuelta", alertaId: a.id, zonaId: a.zonaId });
      }
    }
  }

  private async crearOActualizar(c: CondicionDeAlerta, ahora: Date, activas?: Alerta[]) {
    const existente = (activas ?? (await this.d.alertas.activas())).find((a) => a.clave === c.clave);
    if (!existente) {
      const nueva = await this.d.alertas.crear(c, ahora);
      this.d.publicador.publicar({ tipo: "alerta", accion: "creada", alertaId: nueva.id, zonaId: nueva.zonaId });
      return;
    }
    const cambios: Partial<Alerta> = { valor: c.valor, detalle: c.detalle, titulo: c.titulo, actualizadaEn: ahora };
    if (existente.severidad !== c.severidad) {
      cambios.severidad = c.severidad;
      // Si la situación empeora, se exige un nuevo reconocimiento.
      if (c.severidad === "crit") cambios.reconocimiento = null;
    }
    await this.d.alertas.actualizar(existente.id, cambios);
    if (cambios.severidad) this.d.publicador.publicar({ tipo: "alerta", accion: "actualizada", alertaId: existente.id, zonaId: existente.zonaId });
  }

  async reconocer(alertaId: string, usuario: string, nota: string): Promise<void> {
    const a = await this.d.alertas.porId(alertaId);
    if (!a) throw new ErrorDeDominio("Alerta no encontrada", "no_encontrado");
    if (!usuario?.trim()) throw new ErrorDeDominio("Debe indicar el usuario que reconoce la alerta");
    await this.d.alertas.actualizar(alertaId, { reconocimiento: { usuario: usuario.trim(), nota: nota ?? "", instante: this.d.reloj.ahora() } });
    this.d.publicador.publicar({ tipo: "alerta", accion: "reconocida", alertaId, zonaId: a.zonaId });
  }

  async actualizarLimites(clave: string, umbrales: Umbrales, usuario: string): Promise<void> {
    const v = this.variables.get(clave);
    if (!v) throw new ErrorDeDominio("Variable desconocida", "no_encontrado");
    if (!umbralesValidos(umbrales)) throw new ErrorDeDominio("Los límites deben ir de menor a mayor");
    await this.d.catalogo.guardarUmbrales(clave, umbrales, usuario);
    v.umbrales = { ...umbrales };
    for (const z of this.zonas) await this.evaluarYSincronizar(z.id);
    this.d.publicador.publicar({ tipo: "mediciones", zonas: this.zonas.map((z) => z.id) });
  }

  // ---------------------------------------------------------------------------
  // Límites y configuración, y datos de prueba
  // ---------------------------------------------------------------------------

  /** Límites normativos, límites por zona y criterios internos (guardados en la base de datos). */
  limitesConfiguracion(): Promise<ConfiguracionLimites> {
    return this.d.catalogo.limitesConfiguracion();
  }

  /** Guarda los criterios internos que cambió el equipo (no son límites legales). */
  async guardarCriterios(valores: Record<string, unknown>, usuario: string): Promise<void> {
    const actuales = new Map((await this.d.catalogo.limitesConfiguracion()).criterios.map((c) => [c.clave, c]));
    const limpios: Record<string, number | string> = {};
    for (const [clave, valor] of Object.entries(valores ?? {})) {
      const actual = actuales.get(clave);
      if (!actual) throw new ErrorDeDominio(`Criterio desconocido: ${clave}`);
      if (typeof actual.valor === "number") {
        const n = Number(valor);
        if (valor === "" || valor == null || !Number.isFinite(n) || n < 0) throw new ErrorDeDominio(`Valor inválido en «${actual.etiqueta}»`);
        limpios[clave] = n;
      } else {
        if (clave === "teRedondeo" && valor !== "arriba" && valor !== "cercano") throw new ErrorDeDominio("El redondeo debe ser «arriba» o «cercano»");
        limpios[clave] = String(valor);
      }
    }
    if (typeof limpios["jornadaHoras"] === "number" && (limpios["jornadaHoras"] < 1 || limpios["jornadaHoras"] > 24)) throw new ErrorDeDominio("La jornada debe estar entre 1 y 24 horas");
    await this.d.catalogo.guardarCriterios(limpios, usuario?.trim() || "desconocido");
    this.d.publicador.publicar({ tipo: "mediciones", zonas: this.zonas.map((z) => z.id) });
  }

  /**
   * Genera lecturas que provocan un nivel (normal / precaución / alarma) en una variable de una zona,
   * calculadas desde los límites vigentes, y las procesa como si las enviara el sensor de esa zona.
   * Devuelve el resultado REAL de la evaluación (la alerta se crea por el flujo normal, no se inventa).
   */
  async generarDatosPrueba(cmd: { zonaId: string; variable: string; nivel: string }) {
    const nivel = cmd.nivel as NivelPrueba;
    if (!NIVELES_PRUEBA.includes(nivel)) throw new ErrorDeDominio("El nivel debe ser ok, warn o crit");
    const zona = this.zonas.find((z) => z.id === cmd.zonaId);
    if (!zona) throw new ErrorDeDominio("Zona desconocida", "no_encontrado");
    const variable = this.variables.get(cmd.variable);
    if (!variable || !variable.monitoreada) throw new ErrorDeDominio("Variable desconocida o sin límites", "no_encontrado");
    const valor = valorParaNivel(variable, nivel);
    if (valor == null) throw new ErrorDeDominio(`«${variable.nombre}» no tiene límites para generar ese nivel`);
    const sensor = this.listarDispositivos().find((d) => d.zonaId === zona.id && d.variables.includes(variable.clave) && !d.tipo.includes("portátil"));
    if (!sensor) throw new ErrorDeDominio(`La zona «${zona.nombre}» no tiene un sensor de ${variable.nombre}`, "no_encontrado");

    // Tres lecturas en 20 s: así la evaluación y la histéresis las toman como una condición sostenida.
    const ahora = this.d.reloj.ahora();
    const mensajes: MensajeCanonico[] = [20, 10, 0].map((s) => ({
      dispositivoId: sensor.id, zonaId: zona.id, instante: new Date(ahora.getTime() - s * 1000).toISOString(), origen: "simulado", lecturas: [{ variable: variable.clave, valor }],
    }));
    // Una variable que no es un gas (aire, polvo, temperatura...) no da "señal" a la zona: sin ella la zona
    // quedaría en «sin señal» y no se generarían alertas. Se acompaña con O₂ normal del sensor de gas de la zona.
    if (!GASES.includes(variable.clave) && this.zonaSinSenal(zona.id, ahora)) {
      const o2 = this.variables.get("o2");
      const sensorGas = this.listarDispositivos().find((d) => d.zonaId === zona.id && d.variables.includes("o2") && !d.tipo.includes("portátil"));
      const normal = o2 ? valorParaNivel(o2, "ok") : null;
      if (sensorGas && normal != null) mensajes.push({ dispositivoId: sensorGas.id, zonaId: zona.id, instante: ahora.toISOString(), origen: "simulado", lecturas: [{ variable: "o2", valor: normal }] });
    }
    const r = await this.ingerir(mensajes);
    const e = this.estadoZona(zona.id);
    return {
      zonaId: zona.id, zona: zona.nombre, variable: variable.clave, nombre: variable.nombre, unidad: variable.unidad, nivel, valor, sensor: sensor.id,
      aceptadas: r.aceptadas, estadoVariable: e?.resultado?.estados[variable.clave] ?? null, estadoZona: e?.resultado?.estadoZona ?? null,
    };
  }

  /** Vuelve a evaluar todas las zonas y genera / actualiza las alertas con los límites vigentes. */
  async evaluarAhora(): Promise<{ zonas: number; alertasActivas: number }> {
    await this.vigilar();
    return { zonas: this.zonas.length, alertasActivas: (await this.d.alertas.activas()).length };
  }

  // ---------------------------------------------------------------------------
  // Consultas (lado de lectura)
  // ---------------------------------------------------------------------------

  listarZonas(): Zona[] {
    return this.zonas;
  }

  listarVariables(): Variable[] {
    return [...this.variables.values()];
  }

  listarDispositivos(): Dispositivo[] {
    return [...this.dispositivos.values()];
  }

  estadoZona(zonaId: string) {
    const zona = this.zonas.find((z) => z.id === zonaId);
    if (!zona) return null;
    const actuales: Record<string, number | null> = {};
    for (const v of this.variables.values()) actuales[v.clave] = this.ventana.ultimo(zonaId, v.clave)?.valor ?? null;
    return {
      zona,
      resultado: this.resultados.get(zonaId) ?? null,
      actuales,
      ultimaLectura: this.ventana.ultimaLecturaSensor(zonaId),
      personas: actuales["personas"] ?? 0,
    };
  }

  estadoMina() {
    return this.zonas.map((z) => this.estadoZona(z.id)!);
  }

  async serie(zonaId: string, variable: string, minutos: number, pasoMin: number) {
    const ahora = this.d.reloj.ahora();
    const paso = Math.max(1, Math.round(pasoMin));
    const desde = new Date(ahora.getTime() - minutos * 60_000);
    const datos = await this.d.mediciones.agregadas({ zonaId, variable, desde, hasta: ahora, pasoMin: paso });
    // Rellena los intervalos sin datos con null para que el gráfico muestre el hueco.
    const porBalde = new Map(datos.map((p) => [Math.floor(p.t.getTime() / (paso * 60_000)), p.valor]));
    const puntos: { t: number; v: number | null }[] = [];
    const ini = Math.floor(desde.getTime() / (paso * 60_000));
    const fin = Math.floor(ahora.getTime() / (paso * 60_000));
    for (let b = ini; b <= fin; b++) puntos.push({ t: b * paso * 60_000, v: porBalde.get(b) ?? null });
    // El último punto usa el valor más reciente para que el gráfico llegue hasta "ahora".
    const ultimo = this.ventana.ultimo(zonaId, variable);
    if (ultimo && puntos.length) puntos[puntos.length - 1] = { t: ahora.getTime(), v: ultimo.valor };
    return puntos;
  }

  pronostico(zonaId: string, variable: string, minutos: number) {
    const t = this.resultados.get(zonaId)?.tendencias[variable];
    const ultimo = this.ventana.ultimo(zonaId, variable);
    if (!t || t.direccion === "flat" || !ultimo) return [];
    const ahora = this.d.reloj.ahora().getTime();
    return [
      { t: ahora, v: ultimo.valor },
      { t: ahora + minutos * 60_000, v: Math.max(0, ultimo.valor + t.pendiente * minutos) },
    ];
  }

  async historial(zonaId: string | undefined, horas: number, pasoMin: number) {
    const ahora = this.d.reloj.ahora();
    const desde = new Date(ahora.getTime() - horas * 3_600_000);
    const [agregadas, manuales] = await Promise.all([
      this.d.mediciones.agregadas({ zonaId, desde, hasta: ahora, pasoMin }),
      this.d.mediciones.manuales({ zonaId, desde }),
    ]);
    return { agregadas, manuales };
  }

  async alertas(): Promise<Alerta[]> {
    const ahora = this.d.reloj.ahora();
    const [recientes, activas] = await Promise.all([this.d.alertas.listar(new Date(ahora.getTime() - 24 * 3_600_000)), this.d.alertas.activas()]);
    const porId = new Map([...recientes, ...activas].map((a) => [a.id, a]));
    return [...porId.values()].sort((a, b) => b.creadaEn.getTime() - a.creadaEn.getTime());
  }

  plano() {
    return this.d.catalogo.planoVigente();
  }

  turno() {
    return this.d.catalogo.turno();
  }

  get opciones(): Opciones {
    return this.o;
  }
}
