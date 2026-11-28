# 56 — BreathFlow: diseño científico, ejercicios, animaciones y gamificación responsable

**Fecha de revisión:** 2026-11-27 (Perú). **Tipo:** especificación de producto + trazabilidad científica + protocolo de verificación; **NO** certificación clínica, estudio con usuarios ni función ya desplegada. **Base analizada:** main 03f59bc0; desarrollo: [PR #51](https://github.com/PillB/vocal-singing-training/pull/51) y [PR #53](https://github.com/PillB/vocal-singing-training/pull/53).

## 0. Cómo leer este documento y qué existe

- **En main:** la biblioteca vocal y su plan actual, el registro compartido de días en **js/practice-days.js**, sincronización en **js/sync.js**, el currículo estructurado en **data/technical-coaching-protocol.v1.json** y sus contratos en **tests/node/technical-curriculum.test.mjs**. Consultar [44](44-PROTOCOLO-TECNICO-VOCAL-EVIDENCIA-2026-11-06.md), [45](45-EVIDENCE-TO-EXERCISE-VALIDATION.md), [52](52-INTEGRATION-AND-SKILL-PRACTICE.md), [54](54-RELEASE-LEDGER-2026-11-26.md).
- **Implementado solo en un PR, no en main ni en producción:** página y motor **breathflow.html**, **js/breathflow.js**, estudio ilustrado **js/breathflow-teach.js**, **css/breathflow-teach.css**, test **tests/breathflow.spec.js**, workflow **breathflow-qa.yml** del PR #51. PR #53 añade correcciones para reintentar guardados y excluir el audio del tutorial durante la petición del micrófono. Los documentos 49, 50 y 51 están en esa rama; sus diagramas y pruebas no son evidencia de despliegue.
- **Diseño futuro, no implementado:** audio de profesor humano y pares de ejemplos de error/corrección, ejercicios SOVT específicos para BreathFlow, adaptación de dificultad por dominio, juego de transferencia entre canciones, visualizador de feedback calibrado, progreso por destreza y validación observacional.
- **Otra URL no implica migración:** GitHub Pages usa https://pillb.github.io/vocal-singing-training/; el frontend Cloudflare documentado en [55](55-CLOUDFLARE-FRONTEND.md) es una vista previa separada, con límites de cuentas/sync. No presentar este documento como lanzamiento en ninguno de los dos orígenes.

**Mapa de funciones del registro (estado verificable):** [BF-F01] tutorial ilustrado (PR51); [BF-F02] teach-back (PR51); [BF-F03] mic opcional (PR51); [BF-F04] VTDays (main); [BF-F05] cancelar audio previo (PR53); [BF-F06] SOVT (propuesta); [BF-F07] juego optativo (propuesta); [BF-F08] reflow de tarjetas (PR51); [BF-F09] sync existente (main); [BF-F10] voz humana revisada (propuesta); [BF-F11] recuperación/transferencia espaciada (propuesta).

**Regla epistemológica:** una casilla, una respuesta teórica, un número de respiraciones o un pico de audio NO prueban postura, movimiento diafragmático, presión subglótica, cierre laríngeo, soporte, mayor potencia cómoda ni aprendizaje transferido. Una persona puede necesitar respirar dentro de la frase sin estar haciendo nada incorrecto. La finalidad es **frasear con intención y comodidad**, no conseguir la menor cantidad de inspiraciones.

Este contrato se complementa con [matriz estructurada](../data/breathflow-evidence-design.v1.json) y [pruebas de deriva](../tests/node/breathflow-evidence-design.test.mjs). Esas pruebas validan trazabilidad y estados de lanzamiento; no validan efectividad pedagógica.

## 1. Problema observado, población y éxito

**Retroalimentación inicial del docente:** evitar el aire entre cada palabra; identificar naturalmente pausas entre ideas, mantener una proyección expresiva cómoda y aprender qué cantidad de aire resulta adecuada para las frases que se van a interpretar. Enseñar *dónde* descansar antes de cronometrar o comparar tomas. No atribuir el vibrato ni un sonido débil a una causa anatómica sin observación.

**Usuarios:** principiantes sin vocabulario técnico; personas con experiencia que desean revisar fraseo; público hispanohablante (es-PE) y, como requisito de release, paridad es/en. Estilos populares, narración y canto no requieren idénticas posiciones corporales, articulatorias ni dosis.

**Resultado observable de corto plazo:** un principiante identifica una pausa de sentido frente a un fraseo cortado; canta/habla una frase corta con su propia pausa y explica por qué la eligió; sabe dividir la frase sin forzar si pierde comodidad. **Resultado de transferencia:** aplica el criterio a *otra frase no vista* y lo observa un docente cegado a su grupo experimental. **No resultado:** sostener más segundos, inspirar menos veces, subir dB en un teléfono, «activar el diafragma» por una animación.

## 2. Registro de evidencia, autoridad y límites

| Ref | Tipo de evidencia comprobada | Qué autoriza razonablemente | Qué NO demuestra |
| --- | --- | --- | --- |
| [E01] | ASHA: portal clínico de trastornos de voz; flujo de fonación, SOVT y voz resonante | Diseño de ejercicios suaves con pasos graduados, alternativas y supervisión si existen problemas vocales | Que una intervención clínica sea universal para cantantes sanos |
| [E02] | NIDCD: pautas de cuidado vocal y signos de alarma | Descansar, evitar cantar con voz fatigada/ronca, parar ante dolor; consultar si persiste la alteración | Un diagnóstico remoto hecho por la app |
| [E03] | Titze (2006), fundamento físico de semioclusión | Justificación mecánica para proponer hum, lip trill y tubo/pajilla en contextos adecuados | Beneficio igual para todas las personas ni incremento garantizado de tesitura |
| [E04] | Revisión de alcance (Riquelme-Muñoz y cols., 2025; 20 estudios con cantantes) | Algunas mejoras medidas en SOVT/calentamientos y necesidad de individualización | Una duración o protocolo único basado en todos los estilos |
| [E05] | ECA (Meerschman y cols., 2026; 45 coristas, cuatro semanas) | El grupo con fonación con tubo en agua mejoró *algunos* resultados acústicos/perceptivos frente a comparadores | Superioridad universal del tubo sobre tarareo; mejora duradera no medida |
| [E06] | Revisión de mapeo SOVT (Lee y Choi, 2026; 244 estudios) | Exigir correspondencia entre métrica, constructo, diseño y horizonte temporal | Inferir eficacia de cuántos estudios midieron cierto indicador |
| [E07] | Medición de cinemática respiratoria en cantantes (2016 y trabajos relacionados) | Representar costillas y abdomen como movimientos coordinados que dependen de la tarea | Una única postura abdominal, tórax inmóvil, o comprobar el diafragma con un micrófono |
| [E08] | Metaanálisis/revisión de gamificación educativa (2024) | Optar por autonomía, feedback comprensible, relaciones y metas voluntarias | Que puntos/rankings produzcan dominio vocal; efecto pequeño en competencia percibida |
| [E09] | Revisiones de práctica musical/autoregulación y aprendizaje motor | Ciclo planear-practicar-escuchar-reflexionar, feedback claro, comparación en tarea nueva | Que repetir clics o ver animaciones demuestre coordinación muscular |
| [E10] | W3C WCAG 2.2 | Pausar contenido animado, reducir movimiento, zoom/reflujo, foco visible y lectores de pantalla | Accesibilidad real sin pruebas manuales con AT |
| [E11] | MDN/Web Audio y getUserMedia | Permisos explícitos, interrupciones, recuperación y propiedad de streams/audio | Fiabilidad universal en iOS o medición anatómica desde audio |
| [E12] | Competidores: Yousician, Simply Sing, Vocal Image y Sing Sharp (documentación del proveedor) | Hipótesis de navegación, bucles cortos, demos y feedback; investigación comparativa | Eficacia, sensibilidad de «detector de respiración» o veracidad clínica de publicidad |
| [E13] | Revisión 2026 de práctica de recuperación/espaciado en aulas | Justifica *experimentar* con pequeñas revisitas y recuperación activa | Equivalencia inmediata entre pruebas académicas y destreza motora vocal |
| [E14] | NIDCD disfonía y guía clínica AAO-HNS (2018) | Escalar señales de alarma; no ocultar consulta profesional | Que BreathFlow sea terapia o herramienta diagnóstica |

**Jerarquía:** directriz clínica para seguridad; ensayo o revisión para intervención concreta y población concreta; mecanismo para explicar plausibilidad; estudio de aprendizaje para hipótesis pedagógica; documentación de competidor solo para UX. La clasificación es descriptiva, **no un análisis GRADE formal**. Revisar los DOI/PMID y resultados, no copiar la conclusión de una nota de prensa. Ver URLs completas al final.

**Precisión fisiológica:** la respiración cantada puede diferir de la respiración quieta y varía por individuo y tarea [E07]. La señal de «manos en costillas bajas» es *exploración táctil*, no certificación. En /s/ la lengua y el ápice pueden variar según hablante/dialecto; una sección lateral es un modelo, no una receta universal. El motor **no puede** medir presión subglótica ni movimiento torácico. La autoevaluación de esfuerzo percibido es útil para conversar, pero es subjetiva.

## 3. Decisión preejecución: alternativas comparadas con experto

| Alternativa | Por qué la rechazaría un foniatra/pedagogo o experto UX | Decisión; compensación explícita |
| --- | --- | --- |
| A. Puntuar segundos de «/sss/», tomas de aire detectadas o volumen | Confunde resistencia/ruido/posición del teléfono con voz saludable o potencia controlada; induce sobreesfuerzo | **Rechazar**. No se dispone de calibración acústica/anatómica |
| B. Presentar instrucciones escritas y pasar directamente a micrófono | Un novato no oye ni ve el gesto y puede marcar casillas sin entenderlo | **Rechazar como único camino**; texto accesible sí sigue siendo alternativa válida |
| C. Tutorial largo obligatorio con postura idéntica para todos | Aumenta abandono; impone movimientos y tiempos que no son universales; perjudica experiencia y acceso | **Rechazar**. Ofrecer ejemplo corto, repeticiones, alternativas y Skip intencional |
| D. Mostrar/escuchar → contrastar error → probar → explicar decisión → frase nueva → reflexionar | Requiere medios revisados por docente y más pasos; un teach-back puede memorizarse | **Elegir como hipótesis** [E01, E09]; medir transferencia observada, no solo comprensión declarativa |
| E. Vídeo clínico complejo o detección de postura por cámara | Más invasivo y riesgoso; sin corpus etiquetado no se puede atribuir calidad de técnica | **Posponer**. SVG esquemático accesible; tutorial humano licenciado con consentimiento |
| F. Calendario/recompensas separadas en BreathFlow | Duplica autoridad y premia duración o frustración por falta de días | **Rechazar**. Reutilizar VTDays y metas voluntarias [E08] |

No aceptar una solución por ser la de menor coste de implementación. Enumerar en cada PR el coste/beneficio de privacidad, fidelidad científica, tiempo del alumno, idioma, mantenibilidad, latencia y dispositivos. No incorporar un método clínico como tratamiento sin protocolo y autorización pertinentes.

## 4. Secuencia por niveles: lo que se enseña y se verifica

**Formato obligatorio de cada ficha:** entrada segura → ejemplo correcto en audio y visual (si disponible) → contraejemplo no peligroso → gesto opcional de exploración → intento breve → una pregunta de transferencia → reflexión de comodidad → salida/descanso → oráculo positivo y negativo. Cada actividad debe indicar «implementada en main», «solo PR» o «propuesta», **no** usar «mejora garantizada».

| Ficha / estado | Objetivo y demostración | Ejecución y checkpoint seguro | Feedback útil y caso negativo observable | Base |
| --- | --- | --- | --- | --- |
| **BF-01 Postura cómoda** · PR #51 | SVG: contraste hombros que suben vs se relajan; cuello sin rigidez | Pies/apoyo cómodos, hombros libres; no fijar el pecho ni tensar mandíbula | «Afloja y adapta» si el alumno describe tensión; no calificar una pose desde micrófono | [E01, E07] |
| **BF-02 Aire natural / manos bajas** · PR #51 | Silueta torácica esquemática, flechas laterales sutiles y manos sobre costillas bajas | Notar movimiento suave *si aparece*, sin empujar abdomen, mantener una inhalación cómoda | Error: exigir máxima expansión o subida deliberada de hombros; permitir variación | [E07, E02] |
| **BF-03 /s/ → /a/** · PR #51 | Corte lateral ilustrado de lengua/mandíbula; selector /sss/ sin voz frente a /a/ vocal; ruido sintético/TTS | Probar sonido suave sin apretar; si /s/ no resulta accesible, alternativa de palabra suave | Error: interpretar segundos de /s/ como eficiencia vocal, imponer misma punta de lengua | [E01, E03] |
| **BF-04 Dónde respirar** · PR #51 | Comparación de palabras fragmentadas vs pausa entre ideas; TTS original no cantada | Elige una pausa razonable y responde cómo adaptar si falta aire | Dos respuestas separadas; falla si elige respirar tras cada palabra o aguantar con tensión. Respira dentro de frase si lo necesita | [E07, E09] |
| **BF-05 Detectar y ajustar fatiga** · parcial PR / propuesta de contenidos | Narración grabada por maestro: variante cómoda y variante con esfuerzo *sin exagerar daño* | Preguntar esfuerzo 0–10 solo como autoinforme, no score médico; salir ante dolor/mareo | Error: felicitar volumen creciente o recomendar continuar con dolor | [E02, E14] |
| **BF-06 SOVT accesible** · propuesta | Maestro demuestra tarareo suave, lip trill si natural, pajilla si apropiada; alternativa fácil | Intentos breves elegidos individualmente, sin soplar fuerte ni burbujear exageradamente | Error: diagnosticar técnica desde burbujas o exigir pajilla; transferir a una palabra/frase | [E03–E06] |
| **BF-07 Inicio fonatorio** · propuesta | Audio profesional de inicio cómodo, respirado y demasiado brusco en una vocal fácil, con límites | Probar voz suave a volumen moderado, elegir alternativa más cómoda | Error: «golpear» glotis para entrenar o buscar voz fuerte; sin videodiagnóstico | [E01, E02] |
| **BF-08 Vocales y dicción** · propuesta | Primer plano autorizado + diagramas de /a i u/, lengua móvil y mandíbula libre; dialectos | Contrastar claridad de una frase, no posición milimétrica | Error: exigir una única «a» o imitar diagrama como anatomía 1:1 | [E01, E09] |
| **BF-09 Ritmo, pausas y legato** · propuesta | Línea de frase y silencios opcionales, vista a pulso / ritmo y voz hablada/cantada | Cantar misma intención con pausa elegida; permitir transposición/fragmentación | Error: penalizar respiración fuera de un lugar «ideal» cuando falta aire | [E07, E09] |
| **BF-10 Proyección y matices sin forzar** · propuesta | Maestro demuestra frase hablada, cantada a intensidad cómoda, intención distinta, distancia de mic fija | Autoevalúa intención y comodidad; comparaciones no calibradas solo exploratorias | Error: confundir RMS en smartphone con presión laríngea o potencia saludable | [E02, E07] |
| **BF-11 Pasaje de registro/tesitura** · propuesta | Sirena corta suave con docente y opciones de transposición/descanso | Explorar rango cómodo; sin máximos ni competencia | Error: subir la nota más alta para ganar puntos | [E01, E04] |
| **BF-12 Transferencia al repertorio** · propuesta | Demostración con *texto original o licenciado*, una pausa planificada y dos interpretaciones | Aplicar el criterio a frase nueva y compartir reflexión con docente opcional | Error: memorizar la respuesta BF-04 pero seguir respirando en cada palabra | [E09, E13] |

**Progresión adaptable, no dosis terapéutica:** entrada segura → observación → fraseo/narración → coordinación aire/sonido → vocales/onset/SOVT optativo → ritmo/matices → repertorio y presencia. Un esquema de 12 semanas es solo un ejemplo de distribución; el plan existente en main es propietario de semanas, metas y descansos. Si el usuario practica SOVT u otro ejercicio con profesor, la app no presupone que debe repetirlo de forma universal.

**Diferenciar saber / hacer / transferir:** marcar una casilla y contestar bien verifica una elección declarativa; cantar una frase cómoda observado por un profesor es una muestra de desempeño; reproducirlo en otra frase y en otro día aproxima transferencia/retención. Nunca transformar automáticamente el primer estado en «dominado».

## 5. Animaciones: storyboard técnico, límites y accesibilidad

Todas las ilustraciones son **esquemas explicativos**, no captura de movimiento. Un experto en voz y otro en accesibilidad deben aprobar el guion. La animación NO dicta cuántos segundos inspirar o cuánto debe desplazarse un órgano. No debe animarse la laringe como si un vídeo pudiera ver las cuerdas vocales del alumno.

| Demo | Fotogramas clave (orientativos, no protocolo respiratorio) | Audio/controles | Diagnóstico y versión alternativa |
| --- | --- | --- | --- |
| **A1 Hombros** (PR) | K0 postura neutra, K1 contraste elevado **etiquetado como no imitar**, K2 retorno a hombros cómodos, K3 imagen estática | Botones reproducir/pausar; texto equivalente «sin elevar a propósito» | Red team: no mostrar inclinación cervical como ideal, no estereotipar una postura |
| **A2 Costillas/manos** (PR) | K0 manos opcionales bajas, K1 movimiento lateral pequeño, K2 reposo, K3 frase hablada sin gesto obligatorio | Sin inhalaciones sintéticas cronometradas; texto alternativo de posición de manos | Error: que el dibujo simule una expansión enorme o prometa medir diafragma |
| **A3 Boca/lengua** (PR) | K0 perfil simplificado, K1 /s/ con variante apical/laminal, K2 /a/ con mandíbula suelta, K3 pausa | Alternancia explicativa + /sss/ sintético o TTS, **nunca simultáneo con mic** | Error: que la flecha del aire pase por anatomía imposible o la lengua se inmovilice |
| **A4 Ideas/pausas** (PR) | K0 «aire / palabra / aire / palabra» fragmentado; K1 «aire → idea completa»; K2 alternativa con pausa intermedia por comodidad; K3 elección del usuario | Audio humano futuro; sistema TTS actual no ejemplifica canto profesional | Si se obliga a no respirar entre ideas, el ejemplo induce exceso de esfuerzo |
| **A5 SOVT** (propuesta) | K0 docente humano en ángulo claro; K1 hum fácil; K2 alternativa lip trill; K3 recuperación a palabra | Humano original/licenciado; mostrar alternativas y stop | No reutilizar vídeo publicitario sin licencia ni imponer pajilla |
| **A6 Fraseo musical/legato** (propuesta) | K0 frase escrita original; K1 colocación de pausa; K2 canto cómodo; K3 escucha/reflexión | Sin canciones protegidas; si acompaña música, no «detectar» inhalaciones por ruido | Las pausas pueden cambiar con métrica/estilo |
| **A7 Intención escénica** (propuesta) | K0 quietud/mirada, K1 respiración en pausa de sentido, K2 frase con intención, K3 decisión del alumno | Cámara solo mediante consentimiento independiente; modo sin vídeo igual válido | Expresividad no inferida de volumen ni movimiento corporal |

**Contrato UI:** texto alternativo de cada estado, foco visible y sin oclusión a 200% zoom; controles táctiles ≥44 px como objetivo del producto; botones de pausa/reinicio/avance/retroceso; estado alternativo estático con prefiere movimiento reducido; orientación vertical/apaisada iPhone 320–430 px y iPad; teclado/tab/VoiceOver/TalkBack; ninguno de los fotogramas transmite datos biométricos. «Pause/Stop/Hide», «Reflow», «Focus Not Obscured» y «Animation from Interactions» [E10] requieren prueba humana, no solo CSS. Sonido opcional y botón explícito, nunca autoplay. Antes de permiso de micrófono detener audio instructivo **sincrónicamente**, guardar generación de recurso y rechazar callbacks tardíos [E11]; PR #53 propone/revisa ese cambio.

**QOL:** repasar cada etapa sin perder la sesión, «ya conozco la técnica» explícito y no humillante, ajustar ritmo manualmente, silencio completo, evitar bucles que mareen, interrumpir si suena una llamada, salida de emergencia a «practicar sin micrófono», recordar la decisión por perfil pero volver a enseñar si cambia la versión didáctica.

## 6. Gamificación basada en aprendizaje, no en agotamiento

La revisión de gamificación [E08] halló mejoras modestas o heterogéneas en resultados motivacionales y poco efecto en competencia percibida. **No es evidencia de mejorar la voz**. Se propone reforzar autonomía (elegir frase/sonido/dificultad, saltar/repetir), competencia *observada* (feedback explicativo y transferencia) y relación con docente (revisión optativa), no puntos por cantidad de aire.

| Mecánica | Versión segura y falsable | Mecánica prohibida |
| --- | --- | --- |
| **Reto «salva la idea»** (propuesta) | El alumno elige una pausa, recibe explicación, prueba una frase **nueva** y puede corregirse | Premiar una respuesta sin practicar o castigarlo por necesitar aire |
| **Ruta de tres escenas** (propuesta) | Observar → repetir cómodamente → aplicar al repertorio, con botón Repetir | Exigir cantidad fija de segundos o volumen |
| **Logro de agencia** (propuesta) | «Elegí pausar al sentir tensión» como reflexión privada, nunca nota de salud | Badges por ignorar señales de fatiga |
| **Progreso de práctica existente** (main) | Una sesión guardada aporta actividad a **VTDays**; semana/mes son vistas de la misma autoridad; abstención si guardado falla | Segundo ledger de puntos/días, duplicación por reintentos |
| **Revisión espaciada optativa** (propuesta) | Recordatorio no coercitivo para intentar un fragmento nuevo en otro día; configurable | Romper «racha» por descanso recomendado por voz |

**Reglas:** pausa/descanso cuenta como buena autorregulación sin añadir un día falso de canto; la racha jamás reemplaza el chequeo de comodidad; desactivar gamificación en ajustes; no rankings sociales, presión por frecuencia o recuentos de fuerza pulmonar; ninguna promesa clínica; no métricas de salud o audio personales enviados a analítica sin consentimiento. La repetición en tarea nueva y un experto externo deben confirmar el aprendizaje antes de usar etiquetas como «progreso técnico».

## 7. Máquina de estados y autoridad de datos

~~~mermaid
stateDiagram-v2
  [*] --> PrimerUso
  PrimerUso --> Demo: tutorial por version/perfil
  PrimerUso --> Config: skip explicito
  Demo --> Contraste: ver/oir/pausar
  Contraste --> Reenseñar: decision insegura o pausa trivial
  Reenseñar --> Contraste
  Contraste --> Config: explicacion correcta + checks subjetivos
  Config --> MicroOff: frases propias validas
  MicroOff --> Solicitando: boton mic
  Solicitando --> MicLive: permiso vigente + epoch actual
  Solicitando --> MicroOff: denegado/cancelado/epoch viejo
  MicLive --> MicroOff: ocultar/salir/interrupcion
  MicroOff --> Practica: iniciar manualmente
  MicLive --> Practica: iniciar con pistas inciertas
  Practica --> Revision: ultima frase
  Practica --> Config: cancelar sin escritura
  Revision --> Revision: incomodidad/cambio perfil/guardado negado
  Revision --> Guardado: mismo owner + recibo original + escritura confirmada
  Guardado --> Config: otra toma
~~~

**Máquinas ortogonales:** didáctica y versión/perfil; navegación; permiso de mic off/requesting/live/interrupted; sonido demo off/TTS/hiss/closing; captura/audio; práctica setup/active/review/saved; registro de días; time zone/día-semana-mes; sincronización de cuentas/revisión; plan de doce semanas; entitlement/billing; foco de accesibilidad. Ninguna llamada tardía puede resucitar un stream cerrado o crear una segunda toma.

~~~mermaid
flowchart LR
  Coach[Leccion local - conocimiento declarativo] --> Plan[Frases y pausas elegidas]
  Plan --> Practice[Practica manual o pista mic no validada]
  Practice --> Receipt[Recibo de ronda + confort autodeclarado]
  Receipt --> Days[(VTDays por perfil)]
  Days --> Hist[Hoy / Semana / Mes / Historial]
  Days --> App[Plan actual y sync de main]
  App --> Worker[Worker de cuentas/entitlements]
  Worker --> DB[(D1/KV segun configuracion)]
  Spec[Docs y matriz evidencia] --> QA[QA - fuentes, status y contrapruebas]
~~~

**Invariantes de integración:** antes de primer guardado, no día acreditado; cancelar no escribe; error cuota deja guardado pendiente sin duplicar el recibo; retry idempotente usa mismo identificador de ronda y relee un ledger más nuevo antes de resolver, nunca suma dos veces por retry; cambio de perfil se rechaza; un tab tardío no borra el día del otro; todo hoy/semana/mes/historial/plan lee la misma fecha de calendario local bajo contrato explícito; progreso local NO garantiza que un segundo dispositivo ya esté sincronizado. El PR #53 trata guardado fallido y propietario del audio; probarlo integrado, no interpretar su CI individual como homologación del merge.

**Backend:** el frontend es estático y usa almacenamiento local/IndexedDB según cada módulo; el sistema de cuenta y pagos vive en el Worker y D1/KV existente. BreathFlow no necesita «pool de Postgres» inexistente ni un outbox nuevo para persistencia local. En flujos reales de cobro/notificación el outbox y consumidores idempotentes se evalúan separadamente; la reconciliación de progreso usa revisión/conflicto explícito, no último escritor ciego.

## 8. Riesgos y contratos de aceptación falsificables

| Test / dueño | Caso correcto observable | Mutación negativa / fracaso esperado | Evidencia exigida |
| --- | --- | --- | --- |
| BF-Q01 guía · PR51 | Primer usuario ve postura/costillas/boca/frase; no puede iniciar hasta aprendizaje o skip deliberado | Eliminar guard de frase / omitir demo → test rojo | Playwright Chromium + WebKit, no strings solamente |
| BF-Q02 frase · PR51 | Palabra por palabra da corrección; entre ideas permite continuar junto con respuesta segura | Forzar estado «ready» tras elección mala → rojo; no premiar aguantar dolor | Mutantes BF-M4/M12 y sesión observada |
| BF-Q03 gráfico · PR51 | Dos ejemplos legibles a 320/360/390 px, zoom, teclado, movimiento reducido | Cambiar min-width a 550 px → overflow y rojo | BF-M13 + iPhone físico/VoiceOver (pendiente) |
| BF-Q04 versión · PR51 | Marcador de lección anterior NO prueba la destreza nueva | Cambiar clave v2 a v1 → viejo usuario salta guía y test rojo | BF-M14, migración y política de skip |
| BF-Q05 audio · PR53 | Al pulsar mic se cancela sonido demostrativo antes de pedir permiso; nunca vuelve con epoch antiguo | Invertir orden o permitir sonido durante captura → rojo | WebKit emulado + iOS físico, ruta Bluetooth/llamadas |
| BF-Q06 guardado · PR53 | Error persistencia conserva recibo; otro reintento no duplica ni pierde día de otra pestaña | Rehacer VTDays.record o sobrescribir bag nueva → rojo | Tests de cuotas/tabs/reintentos reales |
| BF-Q07 navegación · integración | Historial/plan y el calendario muestran mismo día contado tras guardar | Estropear contador visible en una pestaña mientras storage es correcto → rojo | BF-M10/M11, UI real de cada vista |
| BF-Q08 ciencia · humano | Docente valora comodidad y transferencia en texto no entrenado | Un participante marca checks pero no puede interpretar frase nueva | Protocolo piloto, no sustituto con mock |
| BF-Q09 corpus acústico · futuro | Si hay «pista de pausa», se muestra incierta y permite corrección manual | Música, /s/, tela, respiración del altavoz activan supuesta inspiración y score falso | Corpus etiquetado por expertos, sensibilidad/especificidad con IC e intervalos por dispositivo; antes de etiquetar detector |
| BF-Q10 seguridad · ambos | Dolor o ronquera persistente lleva a detener y orientarse a experto | La interfaz empuja a aguantar o muestra «saludable» por señal de mic | Revisión foniátrica/voz y consentimiento |
| BF-Q11 implementación · este PR docs | Un borrador no se declara main, cada ficha cita fuente y tiene contraejemplo | Promocionar BF-F01 a main sin tener breathflow.html; eliminar referencia/contraejemplo → test rojo | tests/node/breathflow-evidence-design.test.mjs |
| BF-Q12 drift fuente · integrador | Una fuente científica cambia/queda retractada: se revisa antes de prescribir; DOI y fecha registrables | URL caída o edición mayor sin auditoría → bloqueo editorial, **no** «pasó» por HTML cached | revisión trimestral manual; no GET externo frágil en CI |

**Matriz temporal mínima:** primer uso; 2º intento mismo día; una semana con descanso y cambio de zona horaria; último día del mes; cambia perfil tras Start; dos tabs editando el mismo perfil; Safari tarda en responder permiso y usuario cancela; cuenta desconectada/reconectada; sonido demo a la vez que clic de mic; error de quota y reintento; zoom y orientación; versión cacheada tras update. Tras *cada transición* abrir Inicio, ejercicio, Plan, Historial y calendario y comparar valores observables, no solo JSON. No acreditar que fueron probadas si únicamente están escritas.

**Ejemplos de ejecución (cuando el branch con BreathFlow esté integrado):**

    npm run lint
    npm run test:core
    node --test tests/node/breathflow-evidence-design.test.mjs
    node qa/mutate-breathflow.mjs
    npx playwright test tests/breathflow.spec.js --project=chromium
    npx playwright test tests/breathflow.spec.js --project=webkit --project=mobile-safari

En este PR **solo de documentación y contrato** son directamente ejecutables lint, test:core y la prueba de matriz; breathflow.spec.js y mutate-breathflow.mjs existen en PR #51/53, no en main. **No falsificar ejecución de estos últimos sobre esta rama.** Los contratos de fuente requieren commit SHA y logs de mismo SHA. Un job «skipped», «cancelled» o TODO se declara no verificado.

## 9. Red team de cinco rondas; resultados diseñados vs observados

| Ronda | Ataque preejecutable | Qué haría un experto y por qué rechaza la primera solución | Prueba positiva, control negativo y bloqueo |
| --- | --- | --- | --- |
| RT1 Científica/pedagógica | «más segundos /sss/» consigue premio pero la voz se tensa; alumno recuerda respuesta sin cantarla | Maestro no usa segundos como sustituto de coordinación; introduce transferencia | Oráculo observable con audio real; falta valoración externa. La matriz impide llamar eficaz a la heurística |
| RT2 Recursos/estado | TTS sigue tras iniciar permiso de mic; callback tardío reabre stream; reintento duplica día | Ingeniero de audio modela dueño y epoch; ledger idempotente con recibo original | BF-Q05/Q06 y mutaciones reales sobre PR53; físico pendiente |
| RT3 UI/AT | SVG oculta botón a 200% zoom; animación no se detiene; usuarios daltónicos pierden significado | Accesibilidad ofrece texto, teclado, reflow, stop, reduce-motion y focos claros | BF-Q03 + iPhone VoiceOver/TalkBack real pendiente |
| RT4 Motivación/ética | «streak» penaliza descansos y usuarios fuerzan la voz para conservar logro | Motivación autodeterminada favorece elección y progreso sin presiones | Control de UI que nunca puntúa aguantar, estudio de abandono y autoinforme, opt-out |
| RT5 Integración/futuro drift | PR51/53 se fusiona y documento sigue diciendo «no está en main»; blog científico altera su contenido; fechas/sync divergen | Dev/revisor exige evidencia, versión, fuente en vigencia, verificación de compatibilidad antes del merge | Auditor de registro que falla si una ruta «draft» aparece en main; recheck trimestral de bibliografía; no inventar CI verde |

**Retrospectiva de fallos previos:** mutante BF-M9 detectó que Node 24 imprime ✖ y no TAP «not ok»; BF-M13 sí rompió UI pero el oráculo no reconoció el formato del error; corregir parser con casos positivos y negativos. No basta con «todos los tests corren»: injertar fuente rota y verificar el mensaje que describe el fallo. Una test suite que inspecciona su propia cadena o mock no demuestra competencia, persistencia ni soporte de Safari.

## 10. Estudio de usuarios y evaluación de calidad (PROPUESTO)

- **Piloto formativo de usabilidad:** 5–8 novatos y 2–3 personas con experiencia, dispositivos iPhone Safari/Android/desktop; observación grabada **solo con consentimiento**. Medir si identifica dónde parar, qué hacer ante falta de aire, si encuentra guía/Skip, si la UI refleja el mismo día guardado, y registrar fricciones cualitativas.
- **Comparación piloto pedagógica:** asignación aleatoria, si factible, de *texto+casillas* frente a *ver/escuchar/contrastar/teach-back*. Mismo tiempo y frases base. Un docente sin saber la condición puntúa (rúbrica previa) comodidad aparente/legibilidad de frase y elección de pausa en **material nuevo**; si es imposible cegar completamente, declarar sesgo. Registrar voz real opcional y control de distancia de mic/ruido.
- **Resultados primarios predefinidos:** proporción que elige un punto de respiración expresivamente defendible en frase no ensayada; porcentaje que adapta cuando experimenta incomodidad; tasa de errores de flujo y tiempo hasta la primera práctica. **Secundarios:** retención a días posteriores, autopercepción de comodidad, número de abandonos y control voluntario de descansos. No se usan RMS ni velocidad de inhale como ground truth.
- **No afirmar eficacia estadística** a partir de 5–8 usuarios: es detección de fricciones; un ensayo de eficacia necesita estimación de varianza, potencia, protocolo, aprobación ética/consentimiento según institución y evaluación profesional. Evitar hipótesis HARKing y selección oportunista de «mejor» subgrupo.
- **Gates del docente:** revisar secuencias A1–A7 cuadro por cuadro, voz original y dialectos, seguridad de SOVT y «apoyo», correcciones de respuestas falsas, y que no se desanime al cantar descansadamente.

## 11. Revisión de competidores (hipótesis, no estudios de efectividad)

| Producto y evidencia pública | Qué conviene estudiar | Qué se rechaza copiar |
| --- | --- | --- |
| **Yousician**: práctica con bucles/tempo, guía vocal y feedback de afinación [E12] | Control de fragmento, repetición y referencia audible para música | Tratar precisión de nota como calidad de apoyo o comodidad |
| **Simply Sing**: warm-ups diarios, feedback de tono y ajuste al usuario [E12] | Onboarding simple y elección de repertorio | Afirmar que el «tipo de voz» inferido determina una tesitura segura |
| **Vocal Image**: clips de voz, ejercicios respiratorios y dicción [E12] | Microlecciones y percepción de lenguaje corporal | Equiparar puntuación de dicción/AI con diagnóstico de respiración |
| **Sing Sharp**: afirma detectar respiración en tiempo real [E12] | Investigación comparativa de expectativa de los usuarios | Adoptar sin sensibilidad/especificidad verificadas o copiar copy comercial |

Research gap: documentar entrevistas y pruebas observadas, no presentar marketing de competidores como resultados de usuarios independientes.

## 12. Operación, release y pendientes no absorbidos

- **Código/documentación:** fuente en GitHub, wiki/versiones bajo docs/wiki y backlog en docs/issues; las reglas canónicas están en AGENTS.md, agent.md y CLAUDE.md. Este documento es un *diseño científico auditable*, no una migración de la app.
- **Ramas:** revisar PR51 y PR53 contra main actual, su base, conflictos, commits y checks finales. El PR53 no instala automáticamente sus fixes en main; no publicar un PR51 viejo por pasar CI de otro SHA.
- **Frontend:** GitHub Pages es la versión principal; la vista previa Cloudflare está separada. **Backend:** Worker entitlements/account con D1/KV, OAuth y payments según documentación de despliegue; revisar configuración efectiva por ambiente y no difundir secretos.
- **Release:** scripts/lint + tests en SHA integrado; pruebas reales iPhone Safari micro/altavoz/Bluetooth; zoom 200%, VoiceOver; revisión de profesor; primera sesión de novatos; paridad es/en; rollback, caché del script y comparación de SHA desplegado.
- **Compromisos:** más pedagogía vs fricción; animación comprensible vs simplificación anatómica; puntuación inmediata vs error clínico; gamificación vs presión; privacidad vs análisis centralizado; modo sin mic vs menor instrumentación; pruebas rápidas emuladas vs evidencia física. Cada PR declara el coste en abierto.

**Pendientes prioritarios:** (P0) docente revisa demos actuales y seguridad; (P0) corregir/merge PR51/53 sin perder CI; (P0) experiencias físicas Safari/AT y sync; (P1) ejemplos de voz humana licenciada; (P1) SOVT alternativo y rúbrica de transferencia; (P2) gamificación opcional y piloto con usuarios; (P2) corpus etiquetado y calibración antes de afirmar detectar inhalaciones. Ninguno se declara completado por esta documentación.

## 13. Referencias primarias y fecha de comprobación

Revisadas en web el **27-11-2026**, con distinción entre evidencia, recomendaciones y marketing. Se recomienda reevaluar cada 90 días, y ante retraction/cambio de DOI antes del merge de ejercicio.

- **[E01]** ASHA, Voice Disorders, Practice Portal: https://www.asha.org/practice-portal/clinical-topics/voice-disorders/
- **[E02]** NIDCD, Cómo cuidar de la voz: https://www.nidcd.nih.gov/es/espanol/cuidando-su-voz
- **[E03]** Titze, 2006, JSLHR, SOVT rationale, PMID 16671856: https://pubmed.ncbi.nlm.nih.gov/16671856/
- **[E04]** Riquelme-Muñoz et al., 2025, scoping review of singer exercises, PMID 41058356: https://pubmed.ncbi.nlm.nih.gov/41058356/
- **[E05]** Meerschman et al., 2026, 45 choristers randomized trial, PMID 41896048: https://pubmed.ncbi.nlm.nih.gov/41896048/
- **[E06]** Lee & Choi, 2026, outcome mapping review, PMID 42982685: https://pubmed.ncbi.nlm.nih.gov/42982685/
- **[E07]** Breathing and Singing: Objective Characterization of Breathing Patterns in Classical Singers, PMID 27159498: https://pubmed.ncbi.nlm.nih.gov/27159498/
- **[E08]** Gamification enhances motivation/autonomy/relatedness but minimal competence impact, 2024 systematic review/meta-analysis: https://link.springer.com/article/10.1007/s11423-023-10337-7
- **[E09]** From Practice to Reflection: systematic review of metacognition/SRL in music, PMID 41440823: https://pubmed.ncbi.nlm.nih.gov/41440823/
- **[E10]** W3C, Web Content Accessibility Guidelines 2.2: https://www.w3.org/TR/WCAG22/
- **[E11]** MDN, getUserMedia and audio interruption: https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getUserMedia ; https://developer.mozilla.org/en-US/docs/Web/API/BaseAudioContext/state
- **[E12]** Competidor, documentación comercial y **no** ensayos: https://support.yousician.com/hc/en-us/articles/360000553289-Practice-and-Play-modes-in-singing ; https://sing-help.hellosimply.com/en/articles/12616622-what-is-simply-sing ; https://apps.apple.com/us/app/vocal-image-speaking-coach/id1535324205 ; https://donate.singsharp.com/en/features
- **[E13]** Práctica de recuperación, espaciado e intercalado en aulas, metaanálisis 2026 (transferencia a canto no establecida): https://link.springer.com/article/10.1007/s10648-026-10225-5
- **[E14]** NIDCD, Hoarseness; AAO-HNS dysphonia guideline, PMID 29494316: https://www.nidcd.nih.gov/health/hoarseness ; https://pubmed.ncbi.nlm.nih.gov/29494316/

**Trazabilidad automática:** todo BF-Fxx de la matriz exige fuente, consecuencia observable y contraprueba, y no puede declararse función en main si su ruta solo existe en los PR. Las pruebas pueden detectar errores de documentación y cambios de código observables en el árbol; **no certifican que las afirmaciones científicas sean verdaderas**.
