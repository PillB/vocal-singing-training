/**
 * Admin page: give and take back Pro, gift codes, what people have reported,
 * and server housekeeping.
 *
 * Everything here is a thin client over the worker's `/v1/admin/*` routes,
 * which check the caller against `ADMIN_EMAILS` on every request. This page
 * decides what to draw by asking one of those routes, never by trusting the
 * `role` in `/v1/me`: a worker deployed before that field followed the list
 * could say "member" to a real admin, or "admin" to someone since removed.
 *
 * Nothing a person typed is ever put into the page as HTML. Names, notes,
 * addresses and the whole text of a bug report go in through `textContent`.
 */
(function () {
  "use strict";

  const STR = {
    es: {
      brandSub: "Panel de admin",
      title: "Panel de admin",
      lede: "Da y quita Pro, crea códigos de regalo y revisa el servidor.",
      backToApp: "← Estudio",
      signOut: "Salir",
      langToggle: "English",
      gateChecking: "Comprobando tu cuenta…",
      gateUnconfigured: "Este sitio no tiene servidor de cuentas configurado.",
      gateUnreachable: "No se pudo contactar al servidor de cuentas.",
      retry: "Reintentar",
      gateSignedOut: "Entra con la cuenta de Google de administrador.",
      gateGoogleBlocked: "El botón de Google no cargó (a veces lo bloquea una extensión).",
      gateUseApp: "Entra en el estudio con el botón «Entrar» de arriba y vuelve a esta página.",
      gateNotAdmin:
        "Esta cuenta no es administradora. Si debería serlo, su correo tiene que estar en la lista ADMIN_EMAILS del servidor (ver la guía de admin).",
      gateNotAdminWho: "Entraste como {email}.",
      signedInAs: "Administras como",
      navLookup: "Buscar",
      navGive: "Dar Pro",
      navCodes: "Códigos",
      navHolders: "Quién tiene Pro",
      navReports: "Reportes",
      navStats: "Estadísticas",
      navMaintenance: "Mantenimiento",
      navLabel: "Secciones",
      lookupTitle: "Buscar una cuenta",
      lookupHelp: "Escribe el correo con el que la persona entra al sitio.",
      email: "Correo",
      lookupSubmit: "Buscar",
      giveTitle: "Dar Pro a una persona",
      giveHelp:
        "Los días cuentan desde hoy. Si la cuenta aún no existe, se crea, y la persona tendrá Pro en cuanto entre con ese correo.",
      days: "Días",
      uses: "Usos",
      noteLabel: "Nota (la persona puede pedir verla)",
      giveSubmit: "Dar Pro",
      daysOpen: "Sin fecha de fin",
      giveKindLegend: "Qué le estás dando",
      giveKindGift: "Regalo (amigos y familia)",
      giveKindComp: "Cuenta de pruebas (nuestra)",
      giveKindHelp:
        "Las dos dan lo mismo. La diferencia es para nosotros: abajo puedes ver por separado quién tiene un regalo y quién es una cuenta de pruebas.",
      codesTitle: "Códigos de regalo",
      codesHelp:
        "Quien recibe el código entra en el estudio con «Entrar» y lo escribe en «¿Tienes un código de regalo?». Sus días cuentan desde que lo canjea.",
      codeSubmit: "Crear código",
      copyCode: "Copiar código",
      copyMessage: "Copiar mensaje para enviar",
      codesListTitle: "Códigos creados",
      codesRefresh: "Actualizar lista",
      codesStale: "La lista de abajo puede estar desactualizada. {failure}",
      maintenanceTitle: "Mantenimiento",
      healthTitle: "Estado del servidor",
      healthRefresh: "Comprobar de nuevo",
      sweepTitle: "Limpiar datos vencidos",
      sweepHelp:
        "Borra sesiones vencidas, códigos de entrada usados, contadores viejos y estadísticas de más de 180 días. El servidor lo hace solo cada día a las 04:17 (hora de Lima); este botón lo hace ahora. No toca cuentas, regalos ni progreso.",
      sweepRun: "Limpiar ahora",
      guideLink: "Guía de admin (paso a paso)",

      holdersTitle: "Quién tiene Pro",
      holdersHelp:
        "Todo lo que hemos dado a mano: regalos, cuentas de pruebas y pruebas gratis. Para ver todo lo de una persona, toca su correo.",
      holdersKind: "Tipo",
      holdersState: "Estado",
      holdersRefresh: "Actualizar",
      holdersMore: "Ver más antiguos",
      holdersEmpty: "Con este filtro no hay nadie.",
      holdersCounts: "{regalos} regalos y {pruebas} cuentas de pruebas vigentes · {total} en total",
      holdersStale: "La lista puede estar desactualizada. {failure}",
      holdersOld: "El servidor aún no tiene esta lista. Redespliega el worker (guía, sección 8.7).",
      holdersGone: "ese acceso ya no existe",
      hKindAll: "Todo",
      hKindGift: "Regalos",
      hKindComp: "Pruebas",
      hKindTrial: "Prueba gratis",
      hStateActive: "Vigentes",
      hStateExpired: "Vencidos",
      hStateRevoked: "Quitados",
      hStateAll: "Todos",
      colWho: "Quién",
      openEnded: "Sin fecha de fin",
      openEndedFrom: "Desde el {date}, sin fecha de fin",

      reportsTitle: "Lo que nos cuenta la gente",
      reportsHelp:
        "Lo que llega por «Reportar un problema», en las palabras de quien lo escribió. Cambiar el estado es solo para nosotros: la persona ve su estado pero nunca tu nota.",
      reportsFilter: "Estado",
      reportsKind: "Tipo",
      reportsRefresh: "Actualizar",
      reportsMore: "Ver más antiguos",
      reportsEmpty: "Nada por aquí. Con este filtro no hay reportes.",
      reportsCounts: "{nuevos} sin leer · {curso} en curso · {total} en total",
      reportsStale: "La lista puede estar desactualizada. {failure}",
      fOpen: "Sin cerrar",
      fNew: "Sin leer",
      fAll: "Todos",
      fAllKinds: "Todo",
      fBugs: "Fallos",
      fIdeas: "Ideas",
      rsNew: "Sin leer",
      rsTriaged: "En curso",
      rsFixed: "Arreglado",
      rsWontfix: "No se hará",
      rsDuplicate: "Repetido",
      rKindBug: "Fallo",
      rKindIdea: "Idea",
      rAreaPractice: "Practicar",
      rAreaAudio: "Micrófono o sonido",
      rAreaExercises: "Ejercicios",
      rAreaProgress: "Progreso",
      rAreaAccount: "Cuenta",
      rAreaPayment: "Pagos",
      rAreaSite: "La página",
      rAreaOther: "Otra cosa",
      rSevBlocks: "No puede seguir",
      rSevAnnoying: "Molesta",
      rSevCosmetic: "Se ve raro",
      rDetail: "Qué pasa",
      rSteps: "Cómo verlo",
      rWhere: "Página",
      rBuild: "Versión",
      rBrowser: "Navegador",
      rScreen: "Pantalla",
      rContact: "Responder a",
      rFrom: "De {email}",
      rAnon: "Sin cuenta",
      rNote: "Nota nuestra (la persona no la ve)",
      rSave: "Guardar",
      rSaved: "Guardado.",
      rStatusLabel: "Estado",
      rNoDetail: "No escribió más.",

      working: "Un momento…",
      badEmail: "Escribe un correo válido.",
      badDays: "Escribe un número de días entre 1 y 3650.",
      badUses: "Escribe cuántas veces se puede usar, entre 1 y 1000.",
      notFound:
        "No hay ninguna cuenta con {email}. Nadie ha entrado con ese correo y nadie le ha dado Pro. Si le das Pro, la cuenta se crea.",
      forbidden: "Tu cuenta ya no es administradora. Recarga la página.",
      sessionGone: "Tu sesión terminó. Vuelve a entrar.",
      offline: "No se pudo contactar al servidor. Revisa la conexión y vuelve a intentarlo.",
      generic: "Algo falló ({reason}). Vuelve a intentarlo.",
      giveMaybe:
        "El servidor no respondió. Puede que el regalo se haya guardado igual: revisa la cuenta en «Buscar una cuenta» antes de volver a intentarlo.",
      codeMaybe:
        "El servidor no respondió. Puede que el código se haya creado igual: revisa «Códigos creados» antes de crear otro.",

      proUntil: "Tiene Pro hasta el {date}",
      proLeft: "{n} días más",
      proLeftOne: "1 día más",
      proOpenEnded: "Tiene Pro (suscripción sin fecha de fin)",
      noPro: "Sin Pro ahora mismo",
      via: "por {source}",
      created: "Cuenta creada el {date}",
      adminBadge: "Admin",
      trialUsed: "Ya usó su prueba gratis (no puede empezar otra)",
      trialFree: "No ha usado su prueba gratis",
      neverSignedIn:
        "Nunca ha entrado con este correo. Si dice que ya entró, lo hizo con otra dirección: pídele que abra su cuenta (arriba a la derecha) y te lea el correo que aparece tras «Sesión iniciada como».",
      signedInWith: "Entra con {methods} · última vez: {date}",
      signedInWithNoDate: "Entra con {methods}",
      activeSessions: "Sesiones abiertas: {n}",
      grantsTitle: "Historial de acceso",
      noGrants: "No tiene regalos ni prueba.",
      paidTitle: "Suscripciones pagadas",
      paidLine: "{plan} · {provider} · {status}",
      paidHint: "Una suscripción pagada se cancela en {provider}, no aquí.",
      planMonthly: "Mensual",
      planYearly: "Anual",
      psActive: "activa",
      psPastDue: "pago atrasado",
      psCanceled: "cancelada",
      psPending: "pendiente",
      psPaused: "en pausa",
      colKind: "Tipo",
      colDates: "Fechas",
      colStatus: "Estado",
      colNote: "Nota",
      colAction: "Acción",
      colCode: "Código",
      colDays: "Días",
      colUsed: "Usos",
      colCreated: "Creado",
      range: "{from} → {to}",
      kindTrial: "Prueba gratis",
      kindGift: "Regalo",
      kindComp: "Cortesía",
      kindPaid: "Suscripción",
      fromCode: "con el código {code}",
      stActive: "Activo",
      stScheduled: "Programado",
      stExpired: "Vencido",
      stRevoked: "Quitado el {date}",
      revoke: "Quitar acceso",
      revokeConfirm:
        "¿Quitar este acceso a {email}?\n\n{kind} hasta el {date}.\n\n{others}Lo pierde la próxima vez que abra o recargue el sitio con conexión. Sin conexión puede conservarlo hasta 3 días.",
      revokeOthers: "Ojo: seguirá teniendo Pro por {list}. Quita eso también si quieres dejarle sin Pro.\n\n",
      otherUntil: "{kind} hasta el {date}",
      otherOpen: "{kind} sin fecha de fin",
      revoked: "Listo: se quitó el acceso. {summary}.",
      alreadyRevoked: "Ese acceso ya estaba quitado.",
      giveMore: "Dar más días a esta cuenta",
      given: "Listo: {email} tiene Pro hasta el {date}.",
      givenNoChange:
        "Se guardó el regalo, pero {email} ya tenía acceso hasta el {date}, así que su fecha final no cambia.",
      codeCreated: "Código creado: {days} días, {uses} uso(s).",
      codeMessage:
        "Te regalo {days} días de Estudio Vocal Pro. Entra en {url} , toca «Entrar» (arriba a la derecha), entra con Google, escribe este código en «¿Tienes un código de regalo?» y pulsa «Canjear»: {code}",
      copied: "Copiado.",
      copyFailed: "No se pudo copiar. Selecciónalo y cópialo a mano.",
      noCodes: "Todavía no hay códigos.",
      codeActive: "Activo",
      codeUsedUp: "Agotado",
      codeRevoked: "Anulado",
      codeExpired: "Vencido",
      codeRevoke: "Anular",
      codeRevokeConfirm:
        "¿Anular el código {code}?\n\nNadie más podrá canjearlo. Quien ya lo canjeó conserva sus días (eso se quita buscando su cuenta).",
      codeRevokedMsg: "Código {code} anulado.",
      healthAccounts: "Cuentas y regalos",
      healthSigning: "Firma de licencias Pro",
      healthGoogle: "Entrar con Google",
      healthEmail: "Entrar con código por correo",
      healthPayments: "Pagos (Mercado Pago o Stripe)",
      healthEvents: "Estadísticas anónimas",
      healthTrial: "Prueba gratis: {n} días",
      healthOld: "no informado (servidor antiguo: redespliégalo, guía 8.7)",
      healthOrigin: "Sitio permitido: {origin}",
      healthOn: "activo",
      healthOff: "apagado",
      healthUnreachable: "No se pudo leer el estado del servidor.",
      sweepDone: "Limpieza hecha.",
      statsTitle: "Estadísticas",
      statsLead:
        "Cuánta gente pasa de un paso al siguiente al entrar y probar Pro. Cuenta navegadores, nunca personas, y no es una prueba A/B. Este panel no envía estadísticas, así que mirarlo no las cambia.",
      statsWindow: "Periodo",
      statsDays: "{n} días",
      statsLoad: "Leer estadísticas",
      statsLoading: "Leyendo…",
      statsMissing: "El servidor aún no tiene esta función. Redespliega el worker (guía, sección 8.7).",
      funnelTitle: "Embudo de cuentas",
      funnelEmpty: "Todavía no hay datos en este periodo. Aparecen cuando alguien visita el sitio.",
      funnelWindow: "Últimos {n} días · {browsers} navegadores",
      funnelStepHead: "Paso",
      funnelNHead: "Navegadores",
      funnelOfHead: "De",
      funnelRateHead: "Pasan",
      funnelRangeHead: "Margen (95 %)",
      funnelStates: "Al abrir el panel de cuenta, qué vio la gente",
      funnelOutcomes: "Al pulsar la prueba, qué pasó",
      funnelNote:
        "Cada porcentaje es una sola proporción con su margen, condicionada al paso anterior. Cada fila mira solo el paso de encima: la prueba también se puede pulsar desde la ventana Pro sin entrar, así que «De» puede ser mayor que los navegadores de la fila anterior, y las filas no se multiplican entre sí. Sirve para encontrar un paso por el que nadie pasa, no para medir una mejora de unos puntos. «Recibió respuesta» pasa casi siempre por construcción: mira qué pasó al pulsar la prueba, sobre todo «le pedimos entrar primero».",
      ingestTitle: "Llegada de estadísticas (últimos 7 días)",
      ingestLast: "Último evento guardado: {date}",
      ingestNone: "Todavía no se ha guardado ningún evento.",
      ingestOff: "El servidor tiene las estadísticas apagadas (EVENTS_ENABLED).",
      ingestHint:
        "«Otro sitio» mayor que cero suele ser SITE_ORIGIN mal puesto. «Borrados a petición» es alguien que pulsó «No enviar y borrar lo enviado».",
      notSet: "—"
    },
    en: {
      brandSub: "Admin panel",
      title: "Admin panel",
      lede: "Give and take back Pro, make gift codes and check the server.",
      backToApp: "← Studio",
      signOut: "Sign out",
      langToggle: "Español",
      gateChecking: "Checking your account…",
      gateUnconfigured: "This site has no account server configured.",
      gateUnreachable: "Could not reach the account server.",
      retry: "Try again",
      gateSignedOut: "Sign in with the admin Google account.",
      gateGoogleBlocked: "Google's button did not load (an extension sometimes blocks it).",
      gateUseApp: "Sign in on the studio with the “Sign in” button at the top, then come back to this page.",
      gateNotAdmin:
        "This account is not an admin. If it should be, its address has to be on the server's ADMIN_EMAILS list (see the admin guide).",
      gateNotAdminWho: "Signed in as {email}.",
      signedInAs: "Signed in as admin",
      navLookup: "Look up",
      navGive: "Give Pro",
      navCodes: "Codes",
      navHolders: "Who has Pro",
      navReports: "Reports",
      navStats: "Statistics",
      navMaintenance: "Maintenance",
      navLabel: "Sections",
      lookupTitle: "Look up an account",
      lookupHelp: "Type the address the person signs in to the site with.",
      email: "Email",
      lookupSubmit: "Look up",
      giveTitle: "Give Pro to a person",
      giveHelp:
        "Days count from today. If the account does not exist yet it is created, and the person has Pro as soon as they sign in with that address.",
      days: "Days",
      uses: "Uses",
      noteLabel: "Note (the person may ask to see it)",
      giveSubmit: "Give Pro",
      daysOpen: "No end date",
      giveKindLegend: "What you are giving",
      giveKindGift: "A gift (friends and family)",
      giveKindComp: "A test account (ours)",
      giveKindHelp:
        "Both give exactly the same thing. The difference is for us: below you can see gifts and test accounts apart from each other.",
      codesTitle: "Gift codes",
      codesHelp:
        "Whoever gets the code signs in on the studio with “Sign in” and types it under “Have a gift code?”. Their days count from when they redeem it.",
      codeSubmit: "Create code",
      copyCode: "Copy code",
      copyMessage: "Copy message to send",
      codesListTitle: "Codes created",
      codesRefresh: "Refresh list",
      codesStale: "The list below may be out of date. {failure}",
      maintenanceTitle: "Maintenance",
      healthTitle: "Server status",
      healthRefresh: "Check again",
      sweepTitle: "Clean up expired data",
      sweepHelp:
        "Deletes expired sessions, used sign-in codes, old counters and statistics older than 180 days. The server does this by itself every day at 04:17 Lima time; this button does it now. Accounts, gifts and progress are untouched.",
      sweepRun: "Clean up now",
      guideLink: "Admin guide (step by step)",

      holdersTitle: "Who has Pro",
      holdersHelp:
        "Everything we handed out by hand: gifts, test accounts and free trials. To see everything one person holds, tap their address.",
      holdersKind: "Kind",
      holdersState: "State",
      holdersRefresh: "Refresh",
      holdersMore: "Show older",
      holdersEmpty: "Nobody matches this filter.",
      holdersCounts: "{regalos} gifts and {pruebas} test accounts running · {total} in total",
      holdersStale: "This list may be out of date. {failure}",
      holdersOld: "This server does not have the list yet. Redeploy the worker (guide, section 8.7).",
      holdersGone: "that grant is not there any more",
      hKindAll: "All",
      hKindGift: "Gifts",
      hKindComp: "Test accounts",
      hKindTrial: "Free trials",
      hStateActive: "Running",
      hStateExpired: "Ended",
      hStateRevoked: "Taken back",
      hStateAll: "All",
      colWho: "Who",
      openEnded: "No end date",
      openEndedFrom: "From {date}, no end date",

      reportsTitle: "What people tell us",
      reportsHelp:
        "What arrives through \u201cReport a problem\u201d, in the words the person wrote. Changing the status is for us: they see the status but never your note.",
      reportsFilter: "Status",
      reportsKind: "Kind",
      reportsRefresh: "Refresh",
      reportsMore: "Show older",
      reportsEmpty: "Nothing here. No reports match this filter.",
      reportsCounts: "{nuevos} unread · {curso} in hand · {total} in total",
      reportsStale: "This list may be out of date. {failure}",
      fOpen: "Not closed",
      fNew: "Unread",
      fAll: "All",
      fAllKinds: "Everything",
      fBugs: "Bugs",
      fIdeas: "Ideas",
      rsNew: "Unread",
      rsTriaged: "In hand",
      rsFixed: "Fixed",
      rsWontfix: "Not doing",
      rsDuplicate: "Duplicate",
      rKindBug: "Bug",
      rKindIdea: "Idea",
      rAreaPractice: "Practising",
      rAreaAudio: "Microphone or sound",
      rAreaExercises: "Exercises",
      rAreaProgress: "Progress",
      rAreaAccount: "Account",
      rAreaPayment: "Payments",
      rAreaSite: "The site",
      rAreaOther: "Something else",
      rSevBlocks: "Cannot carry on",
      rSevAnnoying: "Annoying",
      rSevCosmetic: "Looks wrong",
      rDetail: "What happens",
      rSteps: "How to see it",
      rWhere: "Page",
      rBuild: "Version",
      rBrowser: "Browser",
      rScreen: "Screen",
      rContact: "Reply to",
      rFrom: "From {email}",
      rAnon: "No account",
      rNote: "Our note (they do not see it)",
      rSave: "Save",
      rSaved: "Saved.",
      rStatusLabel: "Status",
      rNoDetail: "They wrote nothing more.",

      working: "One moment…",
      badEmail: "Type a valid email address.",
      badDays: "Type a number of days from 1 to 3650.",
      badUses: "Type how many times it can be used, from 1 to 1000.",
      notFound:
        "There is no account for {email}. Nobody has signed in with that address and nobody has given it Pro. Giving it Pro creates the account.",
      forbidden: "Your account is no longer an admin. Reload the page.",
      sessionGone: "Your session ended. Sign in again.",
      offline: "Could not reach the server. Check the connection and try again.",
      generic: "Something failed ({reason}). Try again.",
      giveMaybe:
        "The server did not answer. The gift may have been saved anyway: check the account under “Look up an account” before trying again.",
      codeMaybe:
        "The server did not answer. The code may have been created anyway: check “Codes created” before making another.",

      proUntil: "Has Pro until {date}",
      proLeft: "{n} more days",
      proLeftOne: "1 more day",
      proOpenEnded: "Has Pro (subscription with no end date)",
      noPro: "No Pro right now",
      via: "from {source}",
      created: "Account created {date}",
      adminBadge: "Admin",
      trialUsed: "Has used the free trial (cannot start another)",
      trialFree: "Has not used the free trial",
      neverSignedIn:
        "Has never signed in with this address. If they say they did, they used a different one: ask them to open their account (top right) and read you the address after “Signed in as”.",
      signedInWith: "Signs in with {methods} · last seen: {date}",
      signedInWithNoDate: "Signs in with {methods}",
      activeSessions: "Open sessions: {n}",
      grantsTitle: "Access history",
      noGrants: "No gifts or trial.",
      paidTitle: "Paid subscriptions",
      paidLine: "{plan} · {provider} · {status}",
      paidHint: "A paid subscription is cancelled in {provider}, not here.",
      planMonthly: "Monthly",
      planYearly: "Yearly",
      psActive: "active",
      psPastDue: "payment overdue",
      psCanceled: "cancelled",
      psPending: "pending",
      psPaused: "paused",
      colKind: "Kind",
      colDates: "Dates",
      colStatus: "Status",
      colNote: "Note",
      colAction: "Action",
      colCode: "Code",
      colDays: "Days",
      colUsed: "Uses",
      colCreated: "Created",
      range: "{from} → {to}",
      kindTrial: "Free trial",
      kindGift: "Gift",
      kindComp: "Comp",
      kindPaid: "Subscription",
      fromCode: "with code {code}",
      stActive: "Active",
      stScheduled: "Scheduled",
      stExpired: "Expired",
      stRevoked: "Removed {date}",
      revoke: "Remove access",
      revokeConfirm:
        "Remove this access from {email}?\n\n{kind} until {date}.\n\n{others}They lose it the next time they open or reload the site online. Offline they can keep it for up to 3 days.",
      revokeOthers: "Note: they keep Pro through {list}. Remove that too to leave them without Pro.\n\n",
      otherUntil: "{kind} until {date}",
      otherOpen: "{kind} with no end date",
      revoked: "Done: the access was removed. {summary}.",
      alreadyRevoked: "That access was already removed.",
      giveMore: "Give this account more days",
      given: "Done: {email} has Pro until {date}.",
      givenNoChange:
        "The gift was saved, but {email} already had access until {date}, so their end date does not change.",
      codeCreated: "Code created: {days} days, {uses} use(s).",
      codeMessage:
        "Here are {days} days of Vocal Studio Pro. Go to {url} , tap “Sign in” (top right), sign in with Google, type this code under “Have a gift code?” and press “Redeem”: {code}",
      copied: "Copied.",
      copyFailed: "Could not copy. Select it and copy it by hand.",
      noCodes: "No codes yet.",
      codeActive: "Active",
      codeUsedUp: "Used up",
      codeRevoked: "Cancelled",
      codeExpired: "Expired",
      codeRevoke: "Cancel",
      codeRevokeConfirm:
        "Cancel code {code}?\n\nNobody else can redeem it. People who already redeemed it keep their days (remove those by looking up their account).",
      codeRevokedMsg: "Code {code} cancelled.",
      healthAccounts: "Accounts and gifts",
      healthSigning: "Pro licence signing",
      healthGoogle: "Sign in with Google",
      healthEmail: "Sign in with an emailed code",
      healthPayments: "Payments (Mercado Pago or Stripe)",
      healthEvents: "Anonymous statistics",
      healthTrial: "Free trial: {n} days",
      healthOld: "not reported (old server: redeploy it, guide 8.7)",
      healthOrigin: "Allowed site: {origin}",
      healthOn: "on",
      healthOff: "off",
      healthUnreachable: "Could not read the server status.",
      sweepDone: "Clean-up done.",
      statsTitle: "Statistics",
      statsLead:
        "How many people get from one step to the next when signing in and trying Pro. It counts browsers, never people, and it is not an A/B test. This panel sends no statistics, so looking does not change them.",
      statsWindow: "Period",
      statsDays: "{n} days",
      statsLoad: "Read statistics",
      statsLoading: "Reading…",
      statsMissing: "The server does not have this yet. Redeploy the worker (guide, section 8.7).",
      funnelTitle: "Account funnel",
      funnelEmpty: "No data in this period yet. It appears once somebody visits the site.",
      funnelWindow: "Last {n} days · {browsers} browsers",
      funnelStepHead: "Step",
      funnelNHead: "Browsers",
      funnelOfHead: "Of",
      funnelRateHead: "Pass",
      funnelRangeHead: "Margin (95%)",
      funnelStates: "What people saw when the account panel opened",
      funnelOutcomes: "What happened when people pressed the trial",
      funnelNote:
        "Each percentage is one proportion with its margin, conditional on the step before it. Each row looks only at the step above it: the trial can also be pressed from the Pro window without signing in, so “Of” can be larger than the row above's browsers, and the rows do not multiply into one chain. It finds a step nobody gets through; it cannot measure an improvement of a few points. “Got an answer” passes almost always by construction: read what happened when people pressed the trial, above all “we asked them to sign in first”.",
      ingestTitle: "Statistics arriving (last 7 days)",
      ingestLast: "Last event stored: {date}",
      ingestNone: "No event has been stored yet.",
      ingestOff: "The server has statistics switched off (EVENTS_ENABLED).",
      ingestHint:
        "“Another site” above zero usually means SITE_ORIGIN is wrong. “Deleted on request” is someone who pressed “Stop sending and delete what was sent”.",
      notSet: "—"
    }
  };

  /**
   * Names for what the worker's funnel and ingest counters report. This page
   * loads no js/i18n.js, so the funnel's step, state and outcome names are
   * copied from there (the `funnel.*` keys); keep the two in step. A key the
   * table lacks shows as the worker sent it, never as nothing.
   */
  const STATS_LABELS = {
    es: {
      steps: {
        app_open: "abrió el sitio",
        account_panel_open: "abrió el panel de cuenta",
        signin_start: "empezó a entrar",
        signin_success: "entró",
        trial_cta_view: "vio la oferta de prueba",
        trial_click: "la pulsó",
        trial_result: "recibió respuesta",
        trial_first_practice: "practicó con la prueba"
      },
      states: {
        signed_in: "ya había entrado",
        not_configured: "cuentas apagadas",
        checking: "aún preguntando",
        unreachable: "servidor sin respuesta",
        blocked: "Google bloqueado en ese navegador",
        offered: "podía entrar",
        no_method: "sin forma de entrar"
      },
      outcomes: {
        started: "la prueba empezó",
        needs_account: "le pedimos entrar primero",
        trial_used: "ya la había usado",
        used: "ya la había usado en este navegador",
        already_active: "ya estaba activa",
        disabled: "prueba apagada",
        offline: "sin conexión",
        error: "error del servidor"
      },
      ingest: {
        accepted: "guardados",
        dropped: "descartados por mal formados",
        forget: "borrados a petición",
        eu_no_consent: "sin permiso (Europa)",
        opted_out: "navegador que pide no ser rastreado",
        automated: "navegadores automáticos",
        origin_not_allowed: "otro sitio",
        rate_limited: "demasiados seguidos",
        body_too_large: "envíos demasiado grandes",
        bad_request: "envíos mal formados",
        exposure_new: "exposiciones nuevas",
        exposure_recovered: "exposiciones recuperadas en otra visita",
        exposure_unregistered: "exposiciones a una prueba o versión que no existe",
        exposure_capped: "exposiciones por encima del tope diario de una dirección"
      }
    },
    en: {
      steps: {
        app_open: "opened the site",
        account_panel_open: "opened the account panel",
        signin_start: "started signing in",
        signin_success: "signed in",
        trial_cta_view: "saw the trial offer",
        trial_click: "pressed it",
        trial_result: "got an answer",
        trial_first_practice: "practised on the trial"
      },
      states: {
        signed_in: "already signed in",
        not_configured: "accounts switched off",
        checking: "still asking",
        unreachable: "server did not answer",
        blocked: "Google blocked in that browser",
        offered: "could sign in",
        no_method: "no way in"
      },
      outcomes: {
        started: "the trial started",
        needs_account: "we asked them to sign in first",
        trial_used: "already used it",
        used: "already used it in this browser",
        already_active: "already running",
        disabled: "trial switched off",
        offline: "offline",
        error: "server error"
      },
      ingest: {
        accepted: "stored",
        dropped: "dropped as malformed",
        forget: "deleted on request",
        eu_no_consent: "no consent (Europe)",
        opted_out: "browser asks not to be tracked",
        automated: "automated browsers",
        origin_not_allowed: "another site",
        rate_limited: "too many at once",
        body_too_large: "requests too large",
        bad_request: "malformed requests",
        exposure_new: "new exposures",
        exposure_recovered: "exposures recovered on a later visit",
        exposure_unregistered: "exposures to a test or arm that does not exist",
        exposure_capped: "exposures over one address's daily cap"
      }
    }
  };

  /**
   * Name one funnel or ingest value in the page's language.
   * @param {string} group steps, states, outcomes or ingest.
   * @param {string} key The worker's key.
   * @returns {string} Label.
   */
  function statsLabel(group, key) {
    const table = (STATS_LABELS[lang] || STATS_LABELS.es)[group] || {};
    // Outcomes are whatever a browser posted, so a key such as "constructor"
    // must not find something on Object.prototype.
    return Object.prototype.hasOwnProperty.call(table, key) ? table[key] : String(key);
  }

  const LANG_KEY = "vt_lang";
  let lang = "es";
  try {
    lang = localStorage.getItem(LANG_KEY) === "en" ? "en" : "es";
  } catch {
    lang = "es";
  }

  /**
   * Translate a key, filling `{name}` placeholders.
   * @param {string} key String key.
   * @param {Object} [vars] Placeholder values.
   * @returns {string} Text.
   */
  function t(key, vars) {
    const table = STR[lang] || STR.es;
    let text = table[key] !== undefined ? table[key] : STR.es[key] !== undefined ? STR.es[key] : key;
    if (vars) {
      text = text.replace(/\{(\w+)\}/g, (m, name) => (vars[name] === undefined ? m : String(vars[name])));
    }
    return text;
  }

  const $ = (sel) => document.querySelector(sel);

  /**
   * Build an element with text and attributes, never HTML.
   * @param {string} tag Tag name.
   * @param {Object} [attrs] Attributes; `text` sets textContent, `className` the class.
   * @param {Array<Node|string>} [children] Children.
   * @returns {HTMLElement} Element.
   */
  function el(tag, attrs, children) {
    const node = document.createElement(tag);
    Object.entries(attrs || {}).forEach(([key, value]) => {
      if (value === undefined || value === null || value === false) return;
      if (key === "text") node.textContent = String(value);
      else if (key === "className") node.className = value;
      else node.setAttribute(key, value === true ? "" : String(value));
    });
    (children || []).forEach((child) => {
      if (child === null || child === undefined) return;
      node.appendChild(typeof child === "string" ? document.createTextNode(child) : child);
    });
    return node;
  }

  function applyStaticText() {
    document.documentElement.lang = lang;
    document.querySelectorAll("[data-t]").forEach((node) => {
      node.textContent = t(node.getAttribute("data-t"));
    });
    document.querySelectorAll("[data-t-aria]").forEach((node) => {
      node.setAttribute("aria-label", t(node.getAttribute("data-t-aria")));
    });
    const toggle = $("#admin-lang");
    if (toggle) {
      toggle.textContent = t("langToggle");
      toggle.setAttribute("lang", lang === "es" ? "en" : "es");
    }
    document.title = `${t("title")} · ${lang === "es" ? "Estudio Vocal" : "Vocal Studio"}`;
  }

  const locale = () => (lang === "es" ? "es-PE" : "en-US");

  /**
   * Format a unix time as a date.
   * @param {number|null} seconds Unix seconds.
   * @returns {string} Date text.
   */
  function fmtDate(seconds) {
    if (!Number.isFinite(seconds)) return t("notSet");
    return new Intl.DateTimeFormat(locale(), { day: "numeric", month: "short", year: "numeric" }).format(
      new Date(seconds * 1000)
    );
  }

  /**
   * Format a unix time as a date and time.
   * @param {number|null} seconds Unix seconds.
   * @returns {string} Date and time text.
   */
  function fmtDateTime(seconds) {
    if (!Number.isFinite(seconds)) return t("notSet");
    return new Intl.DateTimeFormat(locale(), {
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit"
    }).format(new Date(seconds * 1000));
  }

  const nowSec = () => Math.floor(Date.now() / 1000);

  /** A gift code's normalized form back in display form, when it has the house shape. */
  function displayCode(normalized) {
    const raw = String(normalized || "");
    const m = /^VOCAL([A-Z0-9]{4})([A-Z0-9]{4})$/.exec(raw);
    return m ? `VOCAL-${m[1]}-${m[2]}` : raw;
  }

  function kindLabel(kind) {
    return kind === "trial" ? t("kindTrial") : kind === "comp" ? t("kindComp") : kind === "gift" ? t("kindGift") : t("kindPaid");
  }

  /** "Gift, with code VOCAL-…" for grants that came from a code. */
  function sourceLabel(grant) {
    const base = kindLabel(grant.kind);
    const src = String(grant.source || "");
    if (src.startsWith("gift_code:")) return `${base} (${t("fromCode", { code: displayCode(src.slice(10)) })})`;
    return base;
  }

  function planLabel(plan) {
    if (plan === "pro_monthly") return t("planMonthly");
    if (plan === "pro_yearly") return t("planYearly");
    return String(plan || t("notSet"));
  }

  function paidStatusLabel(status) {
    const key = { active: "psActive", past_due: "psPastDue", canceled: "psCanceled", cancelled: "psCanceled", pending: "psPending", paused: "psPaused" }[status];
    return key ? t(key) : String(status || t("notSet"));
  }

  function providerLabel(provider) {
    return provider === "mercadopago" ? "Mercado Pago" : provider === "stripe" ? "Stripe" : provider || "";
  }

  function grantStatusText(grant) {
    if (grant.status === "revoked") return t("stRevoked", { date: fmtDate(grant.revokedAt) });
    if (grant.status === "active") return t("stActive");
    if (grant.status === "scheduled") return t("stScheduled");
    return t("stExpired");
  }

  function isEmail(value) {
    return /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/.test(String(value || "").trim());
  }

  const api = (method, path, body, options) => window.VTAccount.request(method, path, body, options);

  /**
   * Turn a failed response into one sentence, and handle the two that change
   * what the page should show at all.
   * @param {{status: number, data: Object|null}} res Response.
   * @returns {string} Message.
   */
  function failureText(res) {
    if (!res || res.status === 0) return t("offline");
    if (res.status === 401) {
      // Drop the dead session locally too, so the sign-in drawn next is real.
      window.VTAccount.signOut().finally(() => showGate("signedOut", t("sessionGone")));
      return t("sessionGone");
    }
    if (res.status === 403) return t("forbidden");
    return t("generic", { reason: (res.data && res.data.reason) || res.status });
  }

  /**
   * Put one sentence in a message line. The line stays in the page even when
   * empty (CSS collapses it), so screen readers keep treating it as a live
   * region and announce what lands in it.
   * @param {HTMLElement|null} node Message element.
   * @param {string} text Text, or "" to clear.
   * @param {string} [tone] ok, error or info.
   */
  function setMessage(node, text, tone) {
    if (!node) return;
    node.hidden = false;
    node.textContent = text || "";
    node.dataset.tone = tone || "";
  }

  /**
   * Disable a form's submit button while a request is in flight.
   * @param {HTMLFormElement} form Form.
   * @param {boolean} busy Busy or not.
   */
  function setBusy(form, busy) {
    const button = form && form.querySelector('button[type="submit"]');
    if (!button) return;
    button.disabled = busy;
    button.setAttribute("aria-busy", busy ? "true" : "false");
  }

  // ---------------------------------------------------------------- gate

  const GATES = ["checking", "unconfigured", "unreachable", "signedOut", "notAdmin", "admin"];
  let gate = "checking";
  let adminEmail = "";

  function showGate(name, detail) {
    gate = name;
    const ids = {
      checking: "#gate-checking",
      unconfigured: "#gate-unconfigured",
      unreachable: "#gate-unreachable",
      signedOut: "#gate-signed-out",
      notAdmin: "#gate-not-admin",
      admin: "#gate-admin"
    };
    GATES.forEach((key) => {
      const node = $(ids[key]);
      if (node) node.hidden = key !== name;
    });
    const tools = $("#admin-tools");
    if (tools) tools.hidden = name !== "admin";
    const signOut = $("#admin-signout");
    if (signOut) signOut.hidden = !(name === "admin" || name === "notAdmin");
    document.body.dataset.gate = name;
    if (name !== "admin") clearWork();
    if (name === "signedOut") drawSignIn(detail);
    if (name === "notAdmin") {
      const who = $("#gate-not-admin-who");
      if (who) who.textContent = t("gateNotAdminWho", { email: detail || "" });
    }
    if (name === "admin") {
      const who = $("#gate-admin-who");
      if (who) who.textContent = adminEmail;
    }
  }

  /**
   * Forget everything drawn for the last admin: results, the newest code,
   * typed addresses. Runs whenever the tools hide, so the next person at this
   * browser does not find them.
   */
  function clearWork() {
    lookupSeq += 1;
    lastLookup = null;
    newestCode = null;
    statsSeq += 1;
    statsData = null;
    statsAsked = false;
    reportSeq += 1;
    reportRows = [];
    reportMore = false;
    reportCounts = null;
    grantSeq += 1;
    grantRows = [];
    grantMore = false;
    grantCounts = null;
    const statsButton = $("#stats-load");
    if (statsButton) statsButton.disabled = false;
    $("#lookup-result")?.replaceChildren();
    $("#stats-result")?.replaceChildren();
    $("#reports-list")?.replaceChildren();
    $("#holders-list")?.replaceChildren();
    [$("#reports-more"), $("#holders-more")].forEach((button) => {
      if (button) button.hidden = true;
    });
    ["#give-result", "#code-result", "#code-copy-status", "#sweep-result", "#reports-counts", "#holders-counts"].forEach(
      (sel) => setMessage($(sel), "", "")
    );
    const box = $("#code-new");
    if (box) box.hidden = true;
    ["#lookup-form", "#give-form", "#code-form"].forEach((sel) => $(sel)?.reset());
  }

  async function drawSignIn(errorText) {
    const box = $("#gate-google");
    const fallback = $("#gate-google-fallback");
    setMessage($("#gate-error"), errorText || "", "error");
    if (!box) return;
    box.hidden = false;
    const drawn = await window.VTAccount.renderGoogleButton(box, {
      onResult: (result) => {
        if (result && result.ok) boot();
        else setMessage($("#gate-error"), t("generic", { reason: (result && result.reason) || "error" }), "error");
      }
    });
    const ok = !!(drawn && drawn.ok);
    if (fallback) fallback.hidden = ok;
    box.hidden = !ok;
  }

  /**
   * Decide what this visitor may see. Asks an admin route, because the
   * route's answer is the only one that is always right.
   */
  async function boot() {
    const A = window.VTAccount;
    if (!A || !A.isConfigured()) {
      showGate("unconfigured");
      return;
    }
    showGate("checking");
    if (!A.getState().signedIn) {
      // Without this, a worker that is down reads as Google's button being
      // blocked, and the page points at browser extensions.
      const methods = await A.ensureMethods();
      if (!methods || !methods.ok) {
        showGate("unreachable");
        return;
      }
      showGate("signedOut");
      return;
    }
    // /v1/me has no timeout of its own; a worker that accepts and never
    // answers would leave this page on "Checking…" for good.
    const me = await Promise.race([
      A.refresh(),
      new Promise((resolve) => setTimeout(() => resolve({ ok: false, reason: "timeout" }), 10000))
    ]);
    if (!A.getState().signedIn) {
      // refresh() drops a session the worker no longer knows.
      showGate("signedOut");
      return;
    }
    if (!me || !me.ok) {
      // Still signed in means the worker did not say no, it just did not answer.
      showGate("unreachable");
      return;
    }
    const state = A.getState();
    adminEmail = (state.account && state.account.email) || "";
    const probe = await api("GET", "/v1/admin/gift-codes", null, { timeoutMs: 8000 });
    if (probe.status === 403) {
      showGate("notAdmin", adminEmail);
      return;
    }
    if (probe.status === 401) {
      showGate("signedOut");
      return;
    }
    if (!probe.ok) {
      showGate("unreachable");
      return;
    }
    showGate("admin");
    renderCodes(probe.data && probe.data.giftCodes);
    loadHealth();
    // Loaded without being asked, unlike the statistics: a report somebody
    // sent is the one thing on this page that may need doing today, and a
    // worker too old to have the route simply leaves the section empty.
    loadReports();
    loadHolders();
  }

  // -------------------------------------------------------------- lookup

  let lastLookup = null;
  // Each lookup takes a number; an answer that arrives after a newer lookup
  // started is dropped, so a slow reply never paints over the account the
  // admin is now looking at.
  let lookupSeq = 0;

  async function lookup(email, notice) {
    const out = $("#lookup-result");
    if (!out) return null;
    const seq = ++lookupSeq;
    lastLookup = null;
    const address = String(email || "").trim();
    if (!isEmail(address)) {
      out.replaceChildren(el("p", { className: "admin-message", "data-tone": "error", text: t("badEmail") }));
      return null;
    }
    out.replaceChildren(el("p", { className: "muted", text: t("working") }));
    const res = await api("GET", `/v1/admin/account?email=${encodeURIComponent(address)}`, null, { timeoutMs: 8000 });
    if (seq !== lookupSeq) return null;
    if (res.status === 404) {
      lastLookup = null;
      out.replaceChildren(
        el("p", { className: "admin-message", "data-tone": "info", text: t("notFound", { email: address }) }),
        giveMoreButton(address)
      );
      return null;
    }
    if (!res.ok || !res.data) {
      out.replaceChildren(el("p", { className: "admin-message", "data-tone": "error", text: failureText(res) }));
      return null;
    }
    lastLookup = res.data;
    renderAccount(res.data, notice);
    return res.data;
  }

  function giveMoreButton(email) {
    const button = el("button", { type: "button", className: "btn btn-sm", text: t("giveMore") });
    button.addEventListener("click", () => {
      const input = $("#give-email");
      if (input) input.value = email;
      $("#give")?.scrollIntoView({ behavior: "smooth", block: "start" });
      $("#give-days")?.focus();
    });
    return button;
  }

  function entitlementLine(ent) {
    if (!ent || !ent.pro) return { text: t("noPro"), tone: "off" };
    if (!Number.isFinite(ent.periodEnd)) return { text: t("proOpenEnded"), tone: "on" };
    const left = Math.max(0, Math.ceil((ent.periodEnd - nowSec()) / 86400));
    const leftText = left === 1 ? t("proLeftOne") : t("proLeft", { n: left });
    const source = ent.source === "paid" ? kindLabel("paid") : kindLabel(ent.source);
    return {
      text: `${t("proUntil", { date: fmtDate(ent.periodEnd) })} (${leftText}) · ${t("via", { source: source.toLowerCase() })}`,
      tone: "on"
    };
  }

  function renderAccount(data, notice) {
    const out = $("#lookup-result");
    const account = data.account || {};
    const status = entitlementLine(data.entitlement);

    const head = el("div", { className: "admin-account-head" }, [
      el("p", { className: "admin-account-email" }, [
        el("strong", { text: account.email || "" }),
        account.displayName ? el("span", { className: "muted", text: ` · ${account.displayName}` }) : null,
        account.role === "admin" ? el("span", { className: "admin-badge", text: t("adminBadge") }) : null
      ]),
      el("p", { className: "admin-status", "data-tone": status.tone, "data-testid": "lookup-status", text: status.text })
    ]);

    const facts = el("ul", { className: "admin-facts" });
    facts.appendChild(el("li", { text: t("created", { date: fmtDate(account.createdAt) }) }));
    facts.appendChild(el("li", { text: account.trialUsed ? t("trialUsed") : t("trialFree") }));
    // Present only once the worker reports it; an older deploy just omits the line.
    if (data.signIns) {
      const s = data.signIns;
      if (!s.methods || !s.methods.length) {
        facts.appendChild(el("li", { className: "admin-warn", "data-testid": "never-signed-in", text: t("neverSignedIn") }));
      } else {
        const methods = s.methods.map((m) => (m === "google" ? "Google" : m === "email" ? (lang === "es" ? "código por correo" : "emailed code") : m)).join(", ");
        facts.appendChild(
          el("li", {
            text: Number.isFinite(s.lastSeenAt)
              ? t("signedInWith", { methods, date: fmtDateTime(s.lastSeenAt) })
              : t("signedInWithNoDate", { methods })
          })
        );
        facts.appendChild(el("li", { text: t("activeSessions", { n: Number(s.activeSessions) || 0 }) }));
      }
    }

    // Newest first, and the same order every time for grants made in the
    // same second.
    const grants = (Array.isArray(data.grants) ? data.grants.slice() : []).sort(
      (a, b) => (b.startsAt || 0) - (a.startsAt || 0) || (b.endsAt || 0) - (a.endsAt || 0) || String(a.id).localeCompare(String(b.id))
    );
    const grantsBlock = el("div", { className: "admin-grants" }, [el("h3", { text: t("grantsTitle") })]);
    if (!grants.length) {
      grantsBlock.appendChild(el("p", { className: "muted", text: t("noGrants") }));
    } else {
      const table = el("table", { className: "admin-table", "data-testid": "grants-table" });
      table.appendChild(
        el("thead", {}, [
          el("tr", {}, [
            el("th", { scope: "col", text: t("colKind") }),
            el("th", { scope: "col", text: t("colDates") }),
            el("th", { scope: "col", text: t("colStatus") }),
            el("th", { scope: "col", text: t("colNote") }),
            el("th", { scope: "col", text: t("colAction") })
          ])
        ])
      );
      const body = el("tbody");
      grants.forEach((grant) => {
        const canRevoke = grant.status === "active" || grant.status === "scheduled";
        let action = el("span", { className: "muted", text: t("notSet") });
        if (canRevoke) {
          action = el("button", {
            type: "button",
            className: "btn btn-danger btn-sm",
            "data-grant": grant.id,
            text: t("revoke")
          });
          action.addEventListener("click", () => revokeGrant(account.email, grant, action, data));
        }
        body.appendChild(
          el("tr", { "data-status": grant.status }, [
            el("td", { "data-label": t("colKind"), text: sourceLabel(grant) }),
            el("td", { "data-label": t("colDates"), text: t("range", { from: fmtDate(grant.startsAt), to: fmtDate(grant.endsAt) }) }),
            el("td", { "data-label": t("colStatus") }, [el("span", { className: `admin-pill st-${grant.status}`, text: grantStatusText(grant) })]),
            el("td", { "data-label": t("colNote"), text: grant.note || t("notSet") }),
            el("td", { "data-label": t("colAction") }, [action])
          ])
        );
      });
      table.appendChild(body);
      grantsBlock.appendChild(el("div", { className: "admin-table-wrap" }, [table]));
    }

    const paid = Array.isArray(data.paid) ? data.paid : [];
    let paidBlock = null;
    if (paid.length) {
      paidBlock = el("div", { className: "admin-paid" }, [el("h3", { text: t("paidTitle") })]);
      paid.forEach((p) => {
        const provider = providerLabel(p.provider);
        paidBlock.appendChild(
          el("p", {
            text: `${t("paidLine", { plan: planLabel(p.plan), provider, status: paidStatusLabel(p.status) })} · ${Number.isFinite(p.periodEnd) ? fmtDate(p.periodEnd) : t("notSet")}`
          })
        );
        paidBlock.appendChild(el("p", { className: "muted admin-small", text: t("paidHint", { provider }) }));
      });
    }

    const noticeNode = notice
      ? el("p", { className: "admin-message", "data-tone": notice.tone || "ok", role: "status", tabindex: "-1", text: notice.text })
      : null;

    out.replaceChildren(
      ...[noticeNode, head, facts, grantsBlock, paidBlock, el("div", { className: "controls-row" }, [giveMoreButton(account.email)])].filter(Boolean)
    );
  }

  /**
   * Whatever else keeps this person on Pro once one grant goes: other gifts
   * or a trial still running or yet to start, and paid subscriptions.
   * @param {Object} data The lookup the button was drawn from.
   * @param {Object} grant The grant about to go.
   * @returns {string[]} One phrase per other source of access.
   */
  function otherAccess(data, grant) {
    const now = nowSec();
    const phrases = [];
    (data && Array.isArray(data.grants) ? data.grants : []).forEach((g) => {
      if (g.id === grant.id || (g.status !== "active" && g.status !== "scheduled")) return;
      phrases.push(t("otherUntil", { kind: sourceLabel(g), date: fmtDate(g.endsAt) }));
    });
    (data && Array.isArray(data.paid) ? data.paid : []).forEach((p) => {
      const kind = `${kindLabel("paid")} ${providerLabel(p.provider)}`.trim();
      if (!Number.isFinite(p.periodEnd)) phrases.push(t("otherOpen", { kind }));
      else if (p.periodEnd > now) phrases.push(t("otherUntil", { kind, date: fmtDate(p.periodEnd) }));
    });
    return phrases;
  }

  async function revokeGrant(email, grant, button, data) {
    const others = otherAccess(data, grant);
    const question = t("revokeConfirm", {
      email,
      kind: sourceLabel(grant),
      date: fmtDate(grant.endsAt),
      others: others.length ? t("revokeOthers", { list: others.join("; ") }) : ""
    });
    if (!window.confirm(question)) return;
    button.disabled = true;
    const res = await api("POST", "/v1/admin/grants/revoke", { grantId: grant.id }, { timeoutMs: 8000 });
    if (!res.ok) {
      button.disabled = false;
      const out = $("#lookup-result");
      out?.prepend(el("p", { className: "admin-message", "data-tone": "error", role: "alert", text: failureText(res) }));
      return;
    }
    const already = res.data && res.data.reason === "already_revoked";
    const fresh = await lookup(email);
    if (fresh) {
      const summary = entitlementLine(fresh.entitlement).text;
      renderAccount(fresh, { text: already ? t("alreadyRevoked") : t("revoked", { summary }), tone: "ok" });
      // The button that had focus is gone; put the reader on the outcome.
      $("#lookup-result .admin-message")?.focus();
    }
  }

  // ---------------------------------------------------------------- give

  async function give(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const result = $("#give-result");
    const email = ($("#give-email")?.value || "").trim();
    const days = Number($("#give-days")?.value);
    const note = ($("#give-note")?.value || "").trim();
    // Both kinds entitle identically; the label is so the list below can tell
    // our own test accounts apart from gifts to real people.
    const kind = form.querySelector('input[name="give-kind"]:checked')?.value === "comp" ? "comp" : "gift";
    if (!isEmail(email)) return setMessage(result, t("badEmail"), "error");
    if (!Number.isInteger(days) || days < 1 || days > 3650) return setMessage(result, t("badDays"), "error");
    setBusy(form, true);
    setMessage(result, t("working"), "");
    const res = await api("POST", "/v1/admin/grants", { email, days, note, kind }, { timeoutMs: 8000 });
    setBusy(form, false);
    if (res.status === 0) {
      // The request may have reached the worker and only the answer got
      // lost. Show the account instead of inviting a second gift.
      setMessage(result, t("giveMaybe"), "info");
      const lookupInput = $("#lookup-email");
      if (lookupInput) lookupInput.value = email;
      lookup(email);
      return;
    }
    if (!res.ok || !res.data || !res.data.grant) {
      setMessage(result, failureText(res), "error");
      return;
    }
    const grant = res.data.grant;
    const account = res.data.account || { email };
    // Show the account as it now stands, so the admin sees the real end date
    // rather than this one gift's.
    const lookupInput = $("#lookup-email");
    if (lookupInput) lookupInput.value = account.email;
    const fresh = await lookup(account.email);
    const end = fresh && fresh.entitlement && fresh.entitlement.periodEnd;
    const noChange = Number.isFinite(end) && end > grant.endsAt;
    const text = noChange
      ? t("givenNoChange", { email: account.email, date: fmtDate(end) })
      : t("given", { email: account.email, date: fmtDate(grant.endsAt) });
    setMessage(result, text, noChange ? "info" : "ok");
    if (fresh) renderAccount(fresh, { text, tone: noChange ? "info" : "ok" });
    // The list below now has a row it did not have.
    loadHolders();
    const noteInput = $("#give-note");
    if (noteInput) noteInput.value = "";
  }

  // --------------------------------------------------------------- codes

  let newestCode = null;

  function codeState(code) {
    if (code.revokedAt) return { key: "revoked", text: t("codeRevoked") };
    if (Number.isFinite(code.expiresAt) && code.expiresAt <= nowSec()) return { key: "expired", text: t("codeExpired") };
    if (code.redeemedCount >= code.maxRedemptions) return { key: "usedup", text: t("codeUsedUp") };
    return { key: "active", text: t("codeActive") };
  }

  function renderCodes(codes) {
    const box = $("#code-list");
    if (!box) return;
    const list = Array.isArray(codes) ? codes : [];
    if (!list.length) {
      box.replaceChildren(el("p", { className: "muted", text: t("noCodes") }));
      return;
    }
    const table = el("table", { className: "admin-table", "data-testid": "codes-table" });
    table.appendChild(
      el("thead", {}, [
        el("tr", {}, [
          el("th", { scope: "col", text: t("colCode") }),
          el("th", { scope: "col", text: t("colDays") }),
          el("th", { scope: "col", text: t("colUsed") }),
          el("th", { scope: "col", text: t("colStatus") }),
          el("th", { scope: "col", text: t("colNote") }),
          el("th", { scope: "col", text: t("colCreated") }),
          el("th", { scope: "col", text: t("colAction") })
        ])
      ])
    );
    const body = el("tbody");
    list.forEach((code) => {
      const state = codeState(code);
      let action = el("span", { className: "muted", text: t("notSet") });
      if (state.key === "active") {
        action = el("button", { type: "button", className: "btn btn-danger btn-sm", "data-code": code.code, text: t("codeRevoke") });
        action.addEventListener("click", () => revokeCode(code.code, action));
      }
      body.appendChild(
        el("tr", { "data-status": state.key }, [
          el("td", { "data-label": t("colCode") }, [el("code", { text: code.code })]),
          el("td", { "data-label": t("colDays"), text: String(code.days) }),
          el("td", { "data-label": t("colUsed"), text: `${code.redeemedCount}/${code.maxRedemptions}` }),
          el("td", { "data-label": t("colStatus") }, [el("span", { className: `admin-pill st-${state.key}`, text: state.text })]),
          el("td", { "data-label": t("colNote"), text: code.note || t("notSet") }),
          el("td", { "data-label": t("colCreated"), text: fmtDate(code.createdAt) }),
          el("td", { "data-label": t("colAction") }, [action])
        ])
      );
    });
    table.appendChild(body);
    box.replaceChildren(table);
  }

  /**
   * Re-read the codes list. When that fails, say so under the form, keeping
   * whatever the form already reported.
   * @param {string} [lead] Sentence to keep in front of the failure.
   * @returns {Promise<Object>} Response.
   */
  async function reloadCodes(lead) {
    const res = await api("GET", "/v1/admin/gift-codes", null, { timeoutMs: 8000 });
    if (res.ok) {
      renderCodes(res.data && res.data.giftCodes);
    } else {
      const stale = t("codesStale", { failure: failureText(res) });
      setMessage($("#code-result"), lead ? `${lead}\n${stale}` : stale, "error");
    }
    return res;
  }

  async function createCode(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const result = $("#code-result");
    const days = Number($("#code-days")?.value);
    const uses = Number($("#code-uses")?.value);
    const note = ($("#code-note")?.value || "").trim();
    if (!Number.isInteger(days) || days < 1 || days > 3650) return setMessage(result, t("badDays"), "error");
    if (!Number.isInteger(uses) || uses < 1 || uses > 1000) return setMessage(result, t("badUses"), "error");
    setBusy(form, true);
    const res = await api("POST", "/v1/admin/gift-codes", { days, maxRedemptions: uses, note }, { timeoutMs: 8000 });
    setBusy(form, false);
    if (res.status === 0) {
      setMessage(result, t("codeMaybe"), "info");
      await reloadCodes(t("codeMaybe"));
      return;
    }
    if (!res.ok || !res.data || !res.data.giftCode) {
      setMessage(result, failureText(res), "error");
      return;
    }
    newestCode = res.data.giftCode;
    const box = $("#code-new");
    if (box) box.hidden = false;
    const value = $("#code-new-value");
    if (value) value.textContent = newestCode.code;
    setMessage($("#code-copy-status"), "", "");
    const created = t("codeCreated", { days: newestCode.days, uses: newestCode.maxRedemptions });
    setMessage(result, created, "ok");
    const noteInput = $("#code-note");
    if (noteInput) noteInput.value = "";
    await reloadCodes(created);
  }

  async function copyText(text) {
    const status = $("#code-copy-status");
    try {
      await navigator.clipboard.writeText(text);
      setMessage(status, t("copied"), "ok");
    } catch {
      setMessage(status, t("copyFailed"), "error");
    }
  }

  function siteUrl() {
    return new URL("./", window.location.href).href;
  }

  async function revokeCode(code, button) {
    if (!window.confirm(t("codeRevokeConfirm", { code }))) return;
    button.disabled = true;
    const res = await api("POST", "/v1/admin/gift-codes/revoke", { code }, { timeoutMs: 8000 });
    if (!res.ok) {
      button.disabled = false;
      setMessage($("#code-result"), failureText(res), "error");
      return;
    }
    const done = t("codeRevokedMsg", { code });
    setMessage($("#code-result"), done, "ok");
    // The button that had focus is about to be redrawn away.
    $("#code-result")?.focus();
    await reloadCodes(done);
  }

  // --------------------------------------------------------- maintenance

  async function loadHealth() {
    const list = $("#health-list");
    if (!list) return;
    const res = await api("GET", "/v1/health", null, { auth: false, timeoutMs: 8000 });
    if (!res.ok || !res.data) {
      list.replaceChildren(el("li", { "data-tone": "error", text: t("healthUnreachable") }));
      return;
    }
    const h = res.data;
    const methods = h.authMethods || {};
    const rows = [
      [t("healthAccounts"), !!h.accountsConfigured],
      [t("healthSigning"), !!h.signingKeyConfigured],
      [t("healthGoogle"), !!methods.google],
      [t("healthEmail"), !!methods.email],
      [t("healthPayments"), !!(h.mercadopagoConfigured || h.stripeConfigured)],
      // A worker built before the statistics existed sends no such field, which
      // is a different answer from "switched off" and needs a redeploy, not a
      // setting.
      [t("healthEvents"), h.eventsEnabled === undefined ? null : !!h.eventsEnabled]
    ];
    const trialDays = Number(methods.trialDays);
    const items = [
      ...rows.map(([label, on]) =>
        el("li", { "data-tone": on === null ? "error" : on ? "on" : "off" }, [
          el("span", { className: "admin-dot", "aria-hidden": "true" }),
          `${label}: `,
          el("strong", { text: on === null ? t("healthOld") : on ? t("healthOn") : t("healthOff") })
        ])
      ),
      // The trial length is also the quickest way to tell which build is live:
      // builds from before the seven-day trial answer 30.
      trialDays > 0 ? el("li", { className: "muted", text: t("healthTrial", { n: trialDays }) }) : null,
      el("li", { className: "muted", text: t("healthOrigin", { origin: h.siteOrigin || t("notSet") }) })
    ];
    list.replaceChildren(...items.filter(Boolean));
  }

  async function sweep() {
    const button = $("#sweep-run");
    const result = $("#sweep-result");
    if (button) button.disabled = true;
    const res = await api("POST", "/v1/admin/sweep", {}, { timeoutMs: 15000 });
    if (button) button.disabled = false;
    setMessage(result, res.ok ? t("sweepDone") : failureText(res), res.ok ? "ok" : "error");
  }

  // ------------------------------------------------------------ statistics

  // Read on demand, never on load: each read is two queries over the events
  // table, and most visits here are to give or remove Pro. Once the admin has
  // asked, choosing another period reads that period straight away.
  let statsDays = 28;
  let statsData = null;
  let statsSeq = 0;
  let statsAsked = false;

  /**
   * Read the funnel and the ingest counters for the chosen window.
   *
   * This page loads neither js/analytics.js nor js/region-gate.js, so reading
   * the funnel from here adds nothing to it; reading it from the studio's
   * account panel counts the admin as a visitor who opened the panel.
   */
  async function loadStats() {
    const box = $("#stats-result");
    const button = $("#stats-load");
    if (!box) return;
    const seq = ++statsSeq;
    statsAsked = true;
    // Nothing from an earlier read may be redrawn (on a language switch, say)
    // while this one is on its way.
    statsData = null;
    if (button) button.disabled = true;
    box.replaceChildren(el("p", { className: "muted", text: t("statsLoading") }));
    const [funnel, experiments, health] = await Promise.all([
      api("GET", `/v1/admin/funnel?days=${statsDays}`, null, { timeoutMs: 15000 }),
      api("GET", "/v1/admin/experiments", null, { timeoutMs: 15000 }),
      // Only health says whether the kill switch is on: while it is, nothing
      // arrives and nothing is counted, which would otherwise read as a quiet
      // week.
      api("GET", "/v1/health", null, { auth: false, timeoutMs: 8000 })
    ]);
    if (seq !== statsSeq) return;
    if (button) button.disabled = false;
    if (!funnel.ok || !funnel.data) {
      statsData = null;
      // A worker from before the statistics has no such route, and says so
      // with a 404 rather than an error of its own.
      const text = funnel.status === 404 ? t("statsMissing") : failureText(funnel);
      box.replaceChildren(el("p", { className: "admin-message", "data-tone": "error", text }));
      return;
    }
    statsData = {
      funnel: funnel.data,
      ingest: experiments.ok && experiments.data ? experiments.data.ingest || null : null,
      ingestFailed: !experiments.ok,
      switchedOff: !!(health.ok && health.data && health.data.eventsEnabled === false)
    };
    renderStats();
  }

  /** Draw what loadStats() last read, in the page's current language. */
  function renderStats() {
    const box = $("#stats-result");
    if (!box || !statsData) return;
    const data = statsData.funnel;
    const count = (v) => Number(v || 0).toLocaleString(locale());
    const pct = (v) =>
      v === null || v === undefined
        ? "–"
        : `${(Number(v) * 100).toLocaleString(locale(), { minimumFractionDigits: 1, maximumFractionDigits: 1 })} %`;
    const parts = [];
    if (statsData.switchedOff) {
      parts.push(el("p", { className: "admin-message", "data-tone": "info", text: t("ingestOff") }));
    }
    parts.push(el("h3", { text: t("funnelTitle") }));
    const days = (data.window && data.window.days) || statsDays;
    if (!data.browsers) {
      parts.push(el("p", { className: "muted", text: t("funnelEmpty") }));
    } else {
      parts.push(el("p", { className: "muted", text: t("funnelWindow", { n: days, browsers: count(data.browsers) }) }));
      const head = el("tr", {}, [
        el("th", { scope: "col", text: t("funnelStepHead") }),
        el("th", { scope: "col", text: t("funnelNHead") }),
        el("th", { scope: "col", text: t("funnelOfHead") }),
        el("th", { scope: "col", text: t("funnelRateHead") }),
        el("th", { scope: "col", text: t("funnelRangeHead") })
      ]);
      const body = (data.steps || []).map((step) =>
        el("tr", {}, [
          el("th", { scope: "row", text: statsLabel("steps", step.step) }),
          el("td", { "data-label": t("funnelNHead"), text: count(step.browsers) }),
          el("td", { "data-label": t("funnelOfHead"), text: step.of === null || step.of === undefined ? "–" : count(step.of) }),
          el("td", { "data-label": t("funnelRateHead"), text: pct(step.rate) }),
          el("td", {
            "data-label": t("funnelRangeHead"),
            text: step.rate === null || step.rate === undefined ? "–" : `${pct(step.lo)} – ${pct(step.hi)}`
          })
        ])
      );
      parts.push(
        el("div", { className: "admin-table-wrap" }, [
          el("table", { className: "admin-table admin-funnel" }, [el("thead", {}, [head]), el("tbody", {}, body)])
        ])
      );
      const states = Object.entries(data.panelStates || {}).filter(([, n]) => Number(n) > 0);
      if (states.length) {
        parts.push(el("h4", { text: t("funnelStates") }));
        parts.push(
          el(
            "ul",
            { className: "admin-counts" },
            states.map(([key, n]) => el("li", {}, [`${statsLabel("states", key)}: `, el("strong", { text: count(n) })]))
          )
        );
      }
      const outcomes = (data.trialOutcomes || []).filter((o) => Number(o.browsers) > 0);
      if (outcomes.length) {
        parts.push(el("h4", { text: t("funnelOutcomes") }));
        parts.push(
          el(
            "ul",
            { className: "admin-counts" },
            outcomes.map((o) =>
              el("li", {}, [`${statsLabel("outcomes", o.outcome)}: `, el("strong", { text: count(o.browsers) })])
            )
          )
        );
      }
      parts.push(el("p", { className: "muted admin-small", text: t("funnelNote") }));
    }
    parts.push(...ingestNodes(statsData.ingest, statsData.ingestFailed, count));
    box.replaceChildren(...parts);
  }

  /**
   * How statistics are arriving: the last event stored and the last week's
   * counters. These are the only server-side proof that the delete switch and
   * the Europe consent gate work, because the site posts without reading the
   * answer.
   * @param {Object|null} ingest `ingest` from /v1/admin/experiments.
   * @param {boolean} failed Whether that read failed.
   * @param {Function} count Number formatter.
   * @returns {Array<HTMLElement>} Nodes.
   */
  function ingestNodes(ingest, failed, count) {
    const nodes = [el("h3", { text: t("ingestTitle") })];
    if (failed || !ingest) {
      nodes.push(el("p", { className: "muted", text: t("healthUnreachable") }));
      return nodes;
    }
    const totals = ingest.totals || {};
    const n = (key) => Number(totals[key]) || 0;
    // Grouped as the worker groups them (INGEST_REASONS in
    // workers/entitlements/src/events.js): events dropped one by one are summed,
    // and each whole request turned away has its own row. body_too_large and
    // bad_request used to be summed in with the events, which mixed requests
    // with events and made this "dropped" disagree with the A/B panel's.
    // tests/admin.spec.js holds the two lists to each other.
    const dropped = ["unknown_event", "bad_cid", "not_an_object"].reduce((sum, key) => sum + n(key), 0);
    nodes.push(
      el("p", {
        className: "muted",
        text: ingest.lastAcceptedAt ? t("ingestLast", { date: fmtDateTime(ingest.lastAcceptedAt) }) : t("ingestNone")
      })
    );
    const rows = [
      ["accepted", n("accepted")],
      ["forget", n("forget")],
      ["eu_no_consent", n("eu_no_consent")],
      ["opted_out", n("opted_out")],
      ["automated", n("automated")],
      ["origin_not_allowed", n("origin_not_allowed")],
      ["rate_limited", n("rate_limited")],
      ["body_too_large", n("body_too_large")],
      ["bad_request", n("bad_request")],
      ["dropped", dropped],
      // What became of the exposures among the events stored, which the worker
      // counts and this list used to leave out.
      ["exposure_new", n("exposure_new")],
      ["exposure_recovered", n("exposure_recovered")],
      ["exposure_unregistered", n("exposure_unregistered")],
      ["exposure_capped", n("exposure_capped")]
    ];
    // Stored events are always listed, so a zero reads as a zero; the rest only
    // when something happened.
    const shown = rows.filter(([key, value]) => key === "accepted" || value > 0);
    // A wrong origin or a stuck limit is a broken pipeline. A capped exposure
    // (one address over its daily allowance: a school, an office) is recorded
    // only if that browser comes back another day, so it can skew who is
    // counted. An unknown arm is forged traffic or a site and worker deployed out
    // of step, the registry doing its job, so it is listed but not coloured.
    const faults = ["origin_not_allowed", "rate_limited", "exposure_capped"];
    nodes.push(
      el(
        "ul",
        { className: "admin-counts" },
        shown.map(([key, value]) =>
          el("li", { "data-tone": faults.includes(key) && value > 0 ? "error" : "" }, [
            `${statsLabel("ingest", key)}: `,
            el("strong", { text: count(value) })
          ])
        )
      )
    );
    nodes.push(el("p", { className: "muted admin-small", text: t("ingestHint") }));
    return nodes;
  }

  /** Name each window chip in the page's language and mark the chosen one. */
  function markStatsWindow() {
    document.querySelectorAll("#stats [data-window]").forEach((chip) => {
      const days = Number(chip.getAttribute("data-window"));
      chip.textContent = t("statsDays", { n: days });
      chip.setAttribute("aria-pressed", String(days === statsDays));
    });
  }

  // --------------------------------------------------------------- holders

  /**
   * Who holds Pro we handed out.
   *
   * The lookup above answers "what does this person hold". This answers the
   * question that had no answer: who holds what. `grantState` starts on
   * "active" because that is the question worth asking most days — which
   * testers are still comped, which gifts run out this week — not the archive.
   */
  let grantKind = "";
  let grantState = "active";
  let grantRows = [];
  let grantMore = false;
  let grantCounts = null;
  // Each load takes a number, so a slow answer never paints over a newer filter.
  let grantSeq = 0;

  /**
   * The dates cell. An open-ended gift is the longest grant the worker allows,
   * not a null end date, so say so in words rather than printing a date in
   * 2036 that nobody meant.
   * @param {Object} grant Grant from the worker.
   * @returns {string} Dates text.
   */
  function holderDates(grant) {
    if (grant.openEnded) return t("openEndedFrom", { date: fmtDate(grant.startsAt) });
    return t("range", { from: fmtDate(grant.startsAt), to: fmtDate(grant.endsAt) });
  }

  /** Every grant this deployment has, whatever its kind or state. */
  function grantTotal(counts) {
    let total = 0;
    Object.values(counts || {}).forEach((byState) => {
      Object.values(byState || {}).forEach((n) => {
        total += Number(n) || 0;
      });
    });
    return total;
  }

  /**
   * One row: who, what we gave them, until when, and the one action.
   * @param {Object} row Grant with `email` and `createdAt`.
   * @returns {HTMLElement} Table row.
   */
  function holderRow(row) {
    // The address is the way into the account, because "who is this" is the
    // next question after seeing a row, every time.
    const who = el("button", { type: "button", className: "admin-linkish", "data-holder-email": row.email, text: row.email });
    who.addEventListener("click", () => {
      const input = $("#lookup-email");
      if (input) input.value = row.email;
      $("#lookup")?.scrollIntoView({ behavior: "smooth", block: "start" });
      lookup(row.email);
    });

    const canRevoke = row.status === "active" || row.status === "scheduled";
    let action = el("span", { className: "muted", text: t("notSet") });
    if (canRevoke) {
      action = el("button", { type: "button", className: "btn btn-danger btn-sm", "data-grant": row.id, text: t("revoke") });
      action.addEventListener("click", () => revokeHolder(row, action));
    }

    return el("tr", { "data-status": row.status, "data-kind": row.kind, "data-testid": "holder-row" }, [
      el("td", { "data-label": t("colWho") }, [who]),
      el("td", { "data-label": t("colKind"), text: sourceLabel(row) }),
      el("td", { "data-label": t("colDates"), text: holderDates(row) }),
      el("td", { "data-label": t("colStatus") }, [
        el("span", { className: `admin-pill st-${row.status}`, text: grantStatusText(row) })
      ]),
      el("td", { "data-label": t("colNote"), text: row.note || t("notSet") }),
      el("td", { "data-label": t("colAction") }, [action])
    ]);
  }

  /** Draw what the last load read, in the page's current language. */
  function renderHolders() {
    const box = $("#holders-list");
    if (!box) return;
    if (!grantRows.length) {
      box.replaceChildren(el("p", { className: "muted", text: grantCounts ? t("holdersEmpty") : "" }));
    } else {
      const table = el("table", { className: "admin-table", "data-testid": "holders-table" });
      table.appendChild(
        el("thead", {}, [
          el("tr", {}, [
            el("th", { scope: "col", text: t("colWho") }),
            el("th", { scope: "col", text: t("colKind") }),
            el("th", { scope: "col", text: t("colDates") }),
            el("th", { scope: "col", text: t("colStatus") }),
            el("th", { scope: "col", text: t("colNote") }),
            el("th", { scope: "col", text: t("colAction") })
          ])
        ])
      );
      const body = el("tbody");
      grantRows.forEach((row) => body.appendChild(holderRow(row)));
      table.appendChild(body);
      box.replaceChildren(table);
    }
    const more = $("#holders-more");
    if (more) {
      more.hidden = !grantMore;
      more.textContent = t("holdersMore");
    }
    if (grantCounts) {
      const gifts = (grantCounts.gift && grantCounts.gift.active) || 0;
      const comps = (grantCounts.comp && grantCounts.comp.active) || 0;
      setMessage(
        $("#holders-counts"),
        t("holdersCounts", { regalos: gifts, pruebas: comps, total: grantTotal(grantCounts) }),
        ""
      );
    }
  }

  /** Name each chip in the page's language and mark the chosen ones. */
  function markHolderFilters() {
    const kindNames = { "": t("hKindAll"), gift: t("hKindGift"), comp: t("hKindComp"), trial: t("hKindTrial") };
    const stateNames = { active: t("hStateActive"), expired: t("hStateExpired"), revoked: t("hStateRevoked"), "": t("hStateAll") };
    document.querySelectorAll("#holders [data-grant-kind]").forEach((chip) => {
      const value = chip.getAttribute("data-grant-kind");
      chip.textContent = kindNames[value] || value;
      chip.setAttribute("aria-pressed", value === grantKind ? "true" : "false");
    });
    document.querySelectorAll("#holders [data-grant-state]").forEach((chip) => {
      const value = chip.getAttribute("data-grant-state");
      chip.textContent = stateNames[value] || value;
      chip.setAttribute("aria-pressed", value === grantState ? "true" : "false");
    });
  }

  /**
   * Read a page of grants.
   * @param {{append?: boolean}} [options] Append the next page instead of replacing.
   * @returns {Promise<void>} Resolves when drawn.
   */
  async function loadHolders(options) {
    const append = !!(options && options.append);
    const seq = ++grantSeq;
    const params = new URLSearchParams({ limit: "25" });
    if (grantKind) params.set("kind", grantKind);
    if (grantState) params.set("state", grantState);
    if (append && grantRows.length) {
      const last = grantRows[grantRows.length - 1];
      params.set("before", String(last.createdAt));
      params.set("beforeId", last.id);
    }
    const res = await api("GET", `/v1/admin/grants?${params.toString()}`, null, { timeoutMs: 10000 });
    if (seq !== grantSeq) return;
    if (!res.ok) {
      // 405 means this worker has POST /v1/admin/grants but not GET: a deploy
      // older than this list, which is a different thing to do about it.
      const why = res.status === 405 ? t("holdersOld") : t("holdersStale", { failure: failureText(res) });
      setMessage($("#holders-counts"), why, "error");
      return;
    }
    const page = (res.data && res.data.grants) || [];
    grantRows = append ? grantRows.concat(page) : page;
    grantMore = !!(res.data && res.data.more);
    grantCounts = (res.data && res.data.counts) || {};
    renderHolders();
  }

  /**
   * Take one grant back from this list.
   *
   * It looks the account up first and hands the real grant to `revokeGrant`,
   * so the confirmation still names whatever else keeps this person on Pro —
   * the same warning the account view gives — and so the admin ends up
   * looking at the account they just changed instead of a row that moved.
   * @param {Object} row The grant as drawn here.
   * @param {HTMLButtonElement} button The button that was pressed.
   * @returns {Promise<void>} Resolves when the list is redrawn.
   */
  async function revokeHolder(row, button) {
    button.disabled = true;
    const input = $("#lookup-email");
    if (input) input.value = row.email;
    const data = await lookup(row.email);
    const grant = data && (Array.isArray(data.grants) ? data.grants : []).find((g) => g.id === row.id);
    button.disabled = false;
    if (!grant) {
      // The account or the grant is gone, so the list we are holding is stale.
      setMessage($("#holders-counts"), t("holdersStale", { failure: t("holdersGone") }), "error");
      await loadHolders();
      return;
    }
    await revokeGrant(row.email, grant, button, data);
    await loadHolders();
  }

  // --------------------------------------------------------------- reports

  /**
   * What the filter chips are on, and the page we are holding.
   *
   * `reportStatus` "open" is the worker's own shorthand for new + triaged, and
   * it is the default because an admin opening this page wants what still
   * needs doing, not the archive.
   */
  let reportStatus = "open";
  let reportKind = "";
  let reportRows = [];
  let reportMore = false;
  let reportCounts = null;
  // Each load takes a number, so a slow answer never paints over a newer filter.
  let reportSeq = 0;

  /**
   * Name one of a report's enumerated fields. A value the dictionary does not
   * know shows as the worker sent it, never as nothing: a worker newer than
   * this page must not make a report invisible.
   * @param {string} prefix String-key prefix, e.g. "rArea".
   * @param {string} value Code from the worker.
   * @returns {string} Label.
   */
  function reportLabel(prefix, value) {
    if (!value) return "";
    const key = `${prefix}${String(value).charAt(0).toUpperCase()}${String(value).slice(1)}`;
    const named = t(key);
    return named === key ? String(value) : named;
  }

  /**
   * One report as a card: their words, then what we know about where they
   * were, then the two controls that move it along.
   * @param {Object} report Report from the worker.
   * @returns {HTMLElement} Card.
   */
  function reportCard(report) {
    const env = report.environment || {};
    const card = el("div", {
      className: "admin-report",
      "data-status": report.status,
      "data-severity": report.severity || "",
      "data-testid": "report-card"
    });

    const pills = [el("span", { className: "admin-pill", text: reportLabel("rKind", report.kind) })];
    if (report.severity) {
      pills.push(el("span", { className: "admin-pill", text: reportLabel("rSev", report.severity) }));
    }
    pills.push(el("span", { className: `admin-pill st-${report.status}`, text: reportLabel("rs", report.status) }));
    card.appendChild(
      el("div", { className: "admin-report-head" }, [el("h4", { text: report.summary }), ...pills])
    );

    const meta = [
      el("span", { text: fmtDateTime(report.createdAt) }),
      el("span", { text: reportLabel("rArea", report.area) }),
      el("code", { text: report.reference })
    ];
    if (report.accountId) {
      meta.push(el("span", { text: report.contact ? t("rFrom", { email: report.contact }) : t("rFrom", { email: report.accountId }) }));
    } else {
      meta.push(el("span", { text: t("rAnon") }));
    }
    card.appendChild(el("p", { className: "admin-report-meta" }, meta));

    card.appendChild(el("span", { className: "admin-report-label", text: t("rDetail") }));
    card.appendChild(el("p", { className: "admin-report-text", text: report.detail || t("rNoDetail") }));
    if (report.steps) {
      card.appendChild(el("span", { className: "admin-report-label", text: t("rSteps") }));
      card.appendChild(el("p", { className: "admin-report-text", text: report.steps }));
    }

    const where = [];
    if (report.page) where.push(el("span", { text: `${t("rWhere")}: ${report.page}` }));
    if (report.build) where.push(el("span", { text: `${t("rBuild")}: ${report.build}` }));
    if (env.ua) where.push(el("span", { text: `${t("rBrowser")}: ${env.ua}` }));
    if (env.viewport) {
      where.push(el("span", { text: `${t("rScreen")}: ${env.viewport}${env.screen ? ` (${env.screen})` : ""}` }));
    }
    if (report.contact) {
      // A mailto, because answering somebody is the commonest next action and
      // retyping an address off a screen is where typos come from.
      where.push(
        el("span", {}, [
          `${t("rContact")}: `,
          el("a", { href: `mailto:${report.contact}`, text: report.contact })
        ])
      );
    }
    if (where.length) {
      card.appendChild(el("p", { className: "admin-report-meta" }, where));
    }

    const status = el("select", { id: `report-status-${report.reference}` });
    ["new", "triaged", "fixed", "wontfix", "duplicate"].forEach((value) => {
      const option = el("option", { value, text: reportLabel("rs", value) });
      if (value === report.status) option.selected = true;
      status.appendChild(option);
    });
    const note = el("input", {
      type: "text",
      maxlength: "1000",
      id: `report-note-${report.reference}`,
      autocomplete: "off",
      value: report.adminNote || ""
    });
    const message = el("p", { className: "admin-message", "aria-live": "polite" });
    const save = el("button", { type: "button", className: "btn btn-sm", text: t("rSave") });
    save.addEventListener("click", () => saveReport(report, status.value, note.value, save, message));
    card.appendChild(
      el("div", { className: "admin-report-actions" }, [
        el("label", { className: "field", for: status.id }, [el("span", { text: t("rStatusLabel") }), status]),
        el("label", { className: "field", for: note.id }, [el("span", { text: t("rNote") }), note]),
        save
      ])
    );
    card.appendChild(message);
    return card;
  }

  /** Draw what the last load read, in the page's current language. */
  function renderReports() {
    const box = $("#reports-list");
    if (!box) return;
    if (!reportRows.length) {
      box.replaceChildren(el("p", { className: "muted", text: reportCounts ? t("reportsEmpty") : "" }));
    } else {
      box.replaceChildren(...reportRows.map(reportCard));
    }
    const more = $("#reports-more");
    if (more) {
      more.hidden = !reportMore;
      more.textContent = t("reportsMore");
    }
    if (reportCounts) {
      setMessage(
        $("#reports-counts"),
        t("reportsCounts", {
          nuevos: reportCounts.new || 0,
          curso: reportCounts.triaged || 0,
          total: Object.values(reportCounts).reduce((sum, n) => sum + (Number(n) || 0), 0)
        }),
        (reportCounts.new || 0) > 0 ? "info" : ""
      );
    }
  }

  /** Name each chip in the page's language and mark the chosen ones. */
  function markReportFilters() {
    const statusNames = { open: t("fOpen"), new: t("fNew"), "": t("fAll") };
    const kindNames = { "": t("fAllKinds"), bug: t("fBugs"), idea: t("fIdeas") };
    document.querySelectorAll("#reports [data-report-status]").forEach((chip) => {
      const value = chip.getAttribute("data-report-status");
      chip.textContent = statusNames[value] || value;
      chip.setAttribute("aria-pressed", value === reportStatus ? "true" : "false");
    });
    document.querySelectorAll("#reports [data-report-kind]").forEach((chip) => {
      const value = chip.getAttribute("data-report-kind");
      chip.textContent = kindNames[value] || value;
      chip.setAttribute("aria-pressed", value === reportKind ? "true" : "false");
    });
  }

  /**
   * Read a page of reports.
   * @param {{append?: boolean}} [options] Append the next page instead of replacing.
   * @returns {Promise<void>} Resolves when drawn.
   */
  async function loadReports(options) {
    const append = !!(options && options.append);
    const seq = ++reportSeq;
    const params = new URLSearchParams({ limit: "25" });
    if (reportStatus) params.set("status", reportStatus);
    if (reportKind) params.set("kind", reportKind);
    if (append && reportRows.length) {
      const last = reportRows[reportRows.length - 1];
      params.set("before", String(last.createdAt));
      params.set("beforeId", last.reference);
    }
    const res = await api("GET", `/v1/admin/reports?${params.toString()}`, null, { timeoutMs: 10000 });
    if (seq !== reportSeq) return;
    if (!res.ok) {
      setMessage($("#reports-counts"), t("reportsStale", { failure: failureText(res) }), "error");
      return;
    }
    const page = (res.data && res.data.reports) || [];
    reportRows = append ? reportRows.concat(page) : page;
    reportMore = !!(res.data && res.data.more);
    reportCounts = (res.data && res.data.counts) || {};
    renderReports();
  }

  /**
   * Move one report along. The whole row comes back from the worker, so what
   * is drawn afterwards is what is stored, never what we hoped we stored.
   * @param {Object} report The report as drawn.
   * @param {string} status Chosen status.
   * @param {string} note Our note.
   * @param {HTMLButtonElement} button The save button.
   * @param {HTMLElement} message Where to say what happened.
   * @returns {Promise<void>} Resolves when said.
   */
  async function saveReport(report, status, note, button, message) {
    button.disabled = true;
    setMessage(message, t("working"), "");
    const res = await api(
      "POST",
      "/v1/admin/reports/update",
      { reference: report.reference, status, note },
      { timeoutMs: 10000 }
    );
    button.disabled = false;
    if (!res.ok) {
      setMessage(message, failureText(res), "error");
      return;
    }
    const updated = res.data && res.data.report;
    if (updated) {
      const at = reportRows.findIndex((row) => row.reference === updated.reference);
      if (at >= 0) reportRows[at] = updated;
    }
    reportCounts = (res.data && res.data.counts) || reportCounts;
    // A report that no longer matches the filter leaves the list rather than
    // sitting there claiming to be open.
    const stillShown =
      !reportStatus ||
      (reportStatus === "open"
        ? updated && (updated.status === "new" || updated.status === "triaged")
        : updated && updated.status === reportStatus);
    if (!stillShown) {
      reportRows = reportRows.filter((row) => row.reference !== report.reference);
    }
    renderReports();
  }

  // ---------------------------------------------------------------- wire

  function bind() {
    $("#admin-lang")?.addEventListener("click", () => {
      lang = lang === "es" ? "en" : "es";
      try {
        localStorage.setItem(LANG_KEY, lang);
      } catch {
        /* private mode */
      }
      applyStaticText();
      markStatsWindow();
      // Redraw what was built from data in the old language.
      if (gate === "admin") {
        if (lastLookup) renderAccount(lastLookup);
        renderStats();
        markReportFilters();
        renderReports();
        markHolderFilters();
        renderHolders();
        reloadCodes();
        loadHealth();
      } else {
        showGate(gate, gate === "notAdmin" ? adminEmail : undefined);
      }
    });
    $("#admin-signout")?.addEventListener("click", () => {
      // signOut() drops the session before it tells the worker, so the page
      // can move on without waiting for that call.
      window.VTAccount.signOut();
      showGate("signedOut");
    });
    $("#codes-refresh")?.addEventListener("click", async (event) => {
      const button = event.currentTarget;
      button.disabled = true;
      setMessage($("#code-result"), "", "");
      await reloadCodes();
      button.disabled = false;
    });
    $("#gate-retry")?.addEventListener("click", () => boot());
    $("#lookup-form")?.addEventListener("submit", (event) => {
      event.preventDefault();
      lookup($("#lookup-email")?.value);
    });
    $("#give-form")?.addEventListener("submit", give);
    document.querySelectorAll(".admin-chips [data-days]").forEach((chip) => {
      chip.addEventListener("click", () => {
        const input = $("#give-days");
        if (input) input.value = chip.getAttribute("data-days");
      });
    });
    $("#code-form")?.addEventListener("submit", createCode);
    $("#code-copy")?.addEventListener("click", () => newestCode && copyText(newestCode.code));
    $("#code-copy-message")?.addEventListener("click", () => {
      if (!newestCode) return;
      copyText(t("codeMessage", { days: newestCode.days, url: siteUrl(), code: newestCode.code }));
    });
    $("#health-refresh")?.addEventListener("click", loadHealth);
    $("#sweep-run")?.addEventListener("click", sweep);
    document.querySelectorAll("#stats [data-window]").forEach((chip) => {
      chip.addEventListener("click", () => {
        statsDays = Number(chip.getAttribute("data-window")) || 28;
        markStatsWindow();
        if (statsAsked) loadStats();
      });
    });
    markStatsWindow();
    $("#stats-load")?.addEventListener("click", loadStats);
    document.querySelectorAll("#reports [data-report-status]").forEach((chip) => {
      chip.addEventListener("click", () => {
        reportStatus = chip.getAttribute("data-report-status");
        markReportFilters();
        if (gate === "admin") loadReports();
      });
    });
    document.querySelectorAll("#reports [data-report-kind]").forEach((chip) => {
      chip.addEventListener("click", () => {
        reportKind = chip.getAttribute("data-report-kind");
        markReportFilters();
        if (gate === "admin") loadReports();
      });
    });
    $("#reports-refresh")?.addEventListener("click", async (event) => {
      const button = event.currentTarget;
      button.disabled = true;
      await loadReports();
      button.disabled = false;
    });
    $("#reports-more")?.addEventListener("click", async (event) => {
      const button = event.currentTarget;
      button.disabled = true;
      await loadReports({ append: true });
      button.disabled = false;
    });
    document.querySelectorAll("#holders [data-grant-kind]").forEach((chip) => {
      chip.addEventListener("click", () => {
        grantKind = chip.getAttribute("data-grant-kind");
        markHolderFilters();
        if (gate === "admin") loadHolders();
      });
    });
    document.querySelectorAll("#holders [data-grant-state]").forEach((chip) => {
      chip.addEventListener("click", () => {
        grantState = chip.getAttribute("data-grant-state");
        markHolderFilters();
        if (gate === "admin") loadHolders();
      });
    });
    $("#holders-refresh")?.addEventListener("click", async (event) => {
      const button = event.currentTarget;
      button.disabled = true;
      await loadHolders();
      button.disabled = false;
    });
    $("#holders-more")?.addEventListener("click", async (event) => {
      const button = event.currentTarget;
      button.disabled = true;
      await loadHolders({ append: true });
      button.disabled = false;
    });
    markReportFilters();
    markHolderFilters();
  }

  applyStaticText();
  bind();
  boot();

  window.VTAdmin = { boot, lookup, loadReports, loadHolders, t };
})();
