# Programa técnico vocal v1: trazabilidad científica, ejercicios y pruebas de aceptación

**Fecha:** 2026-11-06 · **Estado:** piloto educativo, no terapia clínica ni validación de eficacia.  
**Fuente estructurada:** [`data/technical-coaching-protocol.v1.json`](../data/technical-coaching-protocol.v1.json) · **Contrato de CI:** [`tests/node/technical-curriculum.test.mjs`](../tests/node/technical-curriculum.test.mjs) · **Protocolo previo:** [44](44-PROTOCOLO-TECNICO-VOCAL-EVIDENCIA-2026-11-06.md).

## Pregunta práctica y límites

El profesor quiere escuchar notas claras y controladas, mejor coordinación respiratoria y un sonido grave expresivo. **La aparición de vibrato no confirma insuficiencia del apoyo**: podría ser una decisión estética, oscilación natural, fatiga, afinación inestable o un problema de captura. Sin audio de calidad y valoración de voz no se puede adjudicar la causa. Un teléfono no mide presión subglótica, movimiento costal, cierre de cuerdas vocales ni soporte.

Este trabajo distingue **foniatría y terapia vocal** (seguridad/rehabilitación clínica), **vocología, fonética acústica y pedagogía del canto** (producción/medición/aprendizaje), y **fonología** (organización de sonidos en lenguas; útil principalmente para dicción y prosodia). Los resultados de pacientes con disfonía no se transfieren automáticamente a cantantes sanos.

## Evidencia → decisión → límite

| Ref | Investigación / guía | Traducción a diseño | Límite |
|---|---|---|---|
| [TITZE06](https://pubmed.ncbi.nlm.nih.gov/16671856/) | Fundamento físico de semioclusión (SOVT) | Pajita y tarareo de baja carga con transferencia inmediata | Mecanismo ≠ eficacia individual |
| [SOVT24](https://pmc.ncbi.nlm.nih.gov/articles/PMC11567055/) | Ensayo comparativo con 67 participantes con trastornos de voz | Individualizar tarea y dosis | Población clínica; no prueba que mejore el canto de un usuario sano |
| [SOVT26](https://pubmed.ncbi.nlm.nih.gov/41896048/) | RCT de cuatro semanas: 45 coristas aficionados, seis hombres; determinadas medidas favorecieron tubo en agua | Ensayo conservador de SOVT, no promesa de efecto | Mayoría mujeres; resultados específicos y duración limitada |
| [BREATH19](https://pubmed.ncbi.nlm.nih.gov/30819608/) | Revisión de 23 estudios: beneficio respiratorio/vocal dependiente de necesidades | No premiar soplar más segundos; evaluar frase cantada | No hay indicación universal de fortalecer músculos respiratorios |
| [VIBRATO24](https://pubmed.ncbi.nlm.nih.gov/39127534/) | Comparación fisiológica de tono recto y vibrato en profesionales | Contraste voluntario con descanso; nunca vibrato = patología | No es un ensayo de eficacia de ejercicios en principiantes |
| [LEARNING23](https://pubmed.ncbi.nlm.nih.gov/37210322/) | Estructura de práctica/frecuencia de feedback y aprendizaje motor vocal | Probar sin pantalla después de práctica asistida | Participantes mayores; transferencia a canto es hipótesis |
| [ASSESS18](https://pubs.asha.org/doi/10.1044/2018_AJSLP-17-0009) | Protocolo ASHA de evaluación instrumental de voz | Combinación de escucha, autoinforme y curvas; CPP solo exploratorio con grabación adecuada | Micrófono de móvil no calibrado; no usar como herramienta diagnóstica |
| [CLINIC18](https://pubmed.ncbi.nlm.nih.gov/29494316/) | Guía AAO-HNS de disfonía | Gate de seguridad, derivación temprana ante alarma | Una app no sustituye la exploración laríngea |
| [ASHA](https://www.asha.org/practice-portal/clinical-topics/voice-disorders/) | Portal clínico de trastornos vocales | Dosis y tareas individualizadas | No convertir métodos clínicos en prescripción automática |

**Calidad de evidencia:** alta para seguir directrices de seguridad clínica, moderada para ciertos beneficios SOVT observados en ensayos, variable para entrenamiento respiratorio, y limitada/indirecta para transferencia de una intervención específica a este cantante. Son categorías de orientación, **no una evaluación GRADE formal**.

## Inventario implementado vs piloto

Se incluyeron ocho tarjetas en JSON: `BREATH-OBSERVE` → `s18`; `SOVT-STRAW` → `s6`; `FLOW-S-TO-A` → `s8`; `PITCH-CENTER` → `s9`. Estas cuatro hacen referencia a **ejercicios interactivos ya existentes**, no crean nuevos controles.

Las otras cuatro son **pilotos manuales**, marcados `manual-pilot`: `SOVT-HUM-TRANSFER` (`s7`), `VIBRATO-CHOICE` (`s9`), `REPERTOIRE-TRANSFER` (`s3`) y `STAGE-DUAL-TASK` (`s3`). Sus pasos están definidos en español e inglés, pero **no hay botones, análisis de vibrato ni un nuevo juego desplegado** para ellos. La validación con profesor y voz real debe preceder a promoverlos al catálogo interactivo.

En las tarjetas constan la dosis **inicial**, el descanso, la transferencia, el criterio de evaluación, el fallback sin micrófono, las fuentes y la etiqueta de entrega. Estas duraciones son **hipótesis conservadoras de pilotaje**, no prescripciones individualizadas respaldadas directamente por un RCT.

## Ruta inicial: 12–15 minutos, adaptable

1. **Preparación (`s18`, 1–2 min):** observar costillas bajas sin forzarlas; ritmo gráfico 4–0–6 opcional, sin apnea. Si se produce mareo, detener.
2. **Semioclusión (`s6`, 2 min):** vocalizar suavemente con cañita común, dos o tres deslizamientos cortos, y pasar sin demora a /u/ y /a/. No interpretar la burbuja ni el pitido como medida de presión.
3. **Coordinación (`s8`, 2–3 min):** S cómoda de 4–6 s y /a/ cómoda tras descanso. El tiempo de un silbido/soplido no equivale a «fuerza de apoyo».
4. **Centro tonal (`s9`, 3–4 min):** hasta tres tomas de 3–4 s, en altura cómoda, sin inmovilizar garganta ni mandíbula. Revisar por escucha antes de fijarse en la gráfica.
5. **Repertorio (2–3 min):** una frase hablada → entonada → cantada; misma respiración y volumen suave. Cerrar con evaluación de esfuerzo/comodidad.

**A partir de la semana 2, opcional y con profesor:** `VIBRATO-CHOICE`: tres tomas cortas de la misma nota (centro cómodo, vibrato natural, sin consigna). No inducir oscilación con abdomen o mandíbula; si el tono recto requiere presión, suspender la comparación. La meta no es eliminar vibrato, sino poder usarlo expresivamente sin tensión.

## Evaluación N-of-1 y reglas para iterar

**Línea de base:** tres tomas /u/, /a/, una frase hablada y una cantada, sin pista. Mantener distancia, dispositivo, ángulo, sala, volumen y acompañamiento iguales entre comparaciones; no publicar voz identificable en GitHub.

| Fecha | Observaciones / decisiones |
|---|---|
| Día 0 | Voz base; esfuerzo 0–10, comodidad 0–10, 3 frases completadas, juicio ciego del docente |
| Semana 2 | Repetición A/B y retención sin pantalla al día siguiente |
| Semana 4 | A/B ciego de la misma frase; evaluación de transferencia con movimiento y pista a volumen seguro |
| Tras revisión | Modificar **una variable por vez**: duración, tesitura, tipo de semioclusión, feedback o secuencia |

Definir de antemano éxito como **mejora funcional**: menos esfuerzo sin pérdida de claridad, centro tonal más consistente cuando se solicita, control estilístico y frase cantada mejor o igual evaluada por un oyente ciego. Los índices de F0, CPP y tiempo máximo son auxiliares, nunca oráculos médicos. El ejercicio con menor esfuerzo pero peor sonido no se declara automáticamente exitoso.

## Análisis de causas raíz y pruebas falsables

| ID | Problema / hipótesis | Prueba discriminante y oráculo | Estado |
|---|---|---|---|
| VT-09 | CI exigía texto nasal antiguo en ficha s18 | Comprobar copia real de catálogo: comienzo significativo + «sin retener el aire»; ejecución Chromium | **Test corregido, reejecución CI pendiente** |
| VT-10 | Puntuación recompensa prolongar S/SH | Verificar que el texto pide comodidad/transferencia y que no existe promesa de fortalecer apoyo por más segundos | **Copia corregida; gamificación residual pendiente de revisión** |
| VT-11 | iOS Safari confunde pista/ruido con voz o pierde permisos | Micrófono denegado, permiso tardío, interrupción, cambio de salida, pausa/reinicio; comparar eventos y audio real | **Bloqueado: hardware Safari** |
| VT-12 | Vibrato artístico penalizado por afinador | Señal sintética con F0 modulado vs nota estable; escucha docente y gráfica de micrófono real | **No validar eficacia solo con simulación** |
| VT-13 | Voz grave oculta por pista | Grabar voz sola/pista/mezcla en dos espacios; ajustar monitor/EQ antes de aumentar esfuerzo | **Prueba de sonido pendiente** |
| VT-14 | Zoom o teléfono oculta escena/instrucciones | 320–430 px, zoom 200 %, paisaje, teclado, VoiceOver y contenido ES/EN; sin superposición ni pérdida de controles | **CI parcial, físico pendiente** |
| VT-15 | Una tarjeta piloto parece una función interactiva | Contrato Node exige `delivery` explícito; las cuatro nuevas variantes no se anuncian como juegos existentes | **Contrato incorporado** |
| VT-16 | Sobredosis, falta de traducción o fuente sin trazabilidad | Seis mutantes: 120 s, referencia falsa, traducción ausente, transferencia borrada, regla de parada borrada, ID duplicado | **Pruebas automáticas incorporadas; CI pendiente** |

**Pruebas de navegador a conservar:** guía abierta al pasar de ES a EN, pantalla estrecha, ejercicio de respiración que cambia de inspiración a espiración sin pausa, sin petición de micrófono en `s18`, Start/Stop/cambio de pestaña, permiso rechazado y vuelta a practicar. Las pruebas de Chromium no prueban una fonación real, comodidad en garganta ni la exactitud del detector en Safari.

## Puertas para integrar o desplegar

1. **Código:** Node, contratos de seguridad, seis negativos, formato de assets, catálogo 47/40/13, cuatro shards Chromium y revisión cruzada con PR #24/#27 en verde en el SHA exacto.
2. **Dispositivos:** iPhone Safari y Android físico, audio/piano/micrófono, interrupciones, permisos, VoiceOver, zoom 200 %, colores/contraste y controles sin oclusión.
3. **Pedagogía:** un profesor revisa al menos tres tomas por ejercicio, seguridad, redacción y transferencia a la canción.
4. **Producción:** el SHA en GitHub Pages coincide con el aprobado; no unir o desplegar mientras haya gates abiertos.

**Reglas de parada:** ante dolor, mareo, disnea, fatiga vocal creciente, ronquera empeorada o pérdida de voz, parar y no «ganarle» al ejercicio. Para disfonía persistente o señales de alarma, evaluación por especialista según [AAO-HNS](https://pubmed.ncbi.nlm.nih.gov/29494316/); disnea/estridor requieren atención urgente.
