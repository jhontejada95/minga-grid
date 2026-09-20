/**
 * MINGA Grid internationalization dictionary.
 *
 * English is the authoritative default. Spanish is written in a natural Colombian register
 * suitable for the demo presentation in Cali, while keeping established technical terms
 * (demand response, offtaker, release, etc.).
 */

export type Lang = "en" | "es";

export const COPY = {
  // Navigation & Common Header
  "nav.problem": { en: "The problem", es: "El problema" },
  "nav.howItWorks": { en: "How it works", es: "Cómo funciona" },
  "nav.business": { en: "The business", es: "El modelo" },
  "nav.hardware": { en: "Hardware", es: "Hardware" },
  "nav.honesty": { en: "Honesty", es: "Honestidad" },
  "nav.openApp": { en: "Open the app", es: "Abrir la app" },

  // Hero Section
  "hero.pill": {
    en: "HSK Chain testnet · live protocol, not live data",
    es: "HSK Chain testnet · protocolo en vivo, no datos en vivo",
  },
  "hero.title1": {
    en: "Get paid for the electricity you don’t use when ",
    es: "Te pagan por la electricidad que no consumes cuando ",
  },
  "hero.titleHighlight": {
    en: "the grid is about to fall",
    es: "la red está a punto de caer",
  },
  "hero.subtitle": {
    en: "An agent watches Colombia’s real wholesale price, smart meters sign what they measured, and a contract on HSK settles the verified reduction in stablecoin — within minutes, to anyone with a meter. No invoice, no reconciliation, and no human signature anywhere in the payment.",
    es: "Un agente monitorea el precio de bolsa real de Colombia, medidores inteligentes firman lo que midieron y un contrato en HSK liquida la reducción verificada en stablecoin — en minutos, a cualquiera con un medidor. Sin factura, sin conciliación y sin firma humana en ningún punto del pago.",
  },
  "hero.openApp": { en: "Open the app", es: "Abrir la app" },
  "hero.viewOnHsk": { en: "View on HSK", es: "Ver en HSK" },
  "hero.dispatchTarget": { en: "Dispatch target", es: "Objetivo de despacho" },
  "hero.settlementWindow": { en: "Settlement window", es: "Ventana de liquidación" },
  "hero.proofType": { en: "Proof type", es: "Tipo de prueba" },
  "hero.proofValue": { en: "Dual-signature baseline", es: "Línea base con doble firma" },
  "hero.network": { en: "Network", es: "Red" },

  // Problem Section
  "problem.eyebrow": { en: "The problem", es: "El problema" },
  "problem.title": {
    en: "The cheapest megawatt is the one nobody uses. Nobody gets paid for it.",
    es: "El megavatio más barato es el que nadie consume. A nadie le pagan por él.",
  },
  "problem.stat1": {
    en: "evening peak vs the day's own average",
    es: "pico nocturno vs promedio del propio día",
  },
  "problem.stat2": {
    en: "USD per kWh, 18:00–21:00 window",
    es: "USD por kWh, ventana 18:00–21:00",
  },
  "problem.stat3": {
    en: "demand-response market that skipped the region",
    es: "mercado de demand response que no llegó a la región",
  },
  "problem.prose1": {
    en: "Every evening between six and nine, Colombian wholesale electricity costs well over half again what it costs the rest of the day — thermal plants set the price when hydro runs short of the peak. The figures above are read live from XM, the system operator, and converted at the official exchange rate. In a dry year the gap widens sharply, which is the risk the country has been managing all through 2026.",
    es: "Cada tarde entre las seis y las nueve, la electricidad en la bolsa colombiana cuesta más de un 50% por encima del resto del día — las térmicas marcan el precio cuando las hidroeléctricas no alcanzan para cubrir el pico. Las cifras anteriores se leen en vivo de XM, el operador del sistema, y se liquidan a la TRM oficial. En año seco la brecha se dispara, que es el riesgo latente en el país durante todo 2026.",
  },
  "problem.prose2": {
    en: "The fastest capacity any grid has is demand that simply steps aside for those three hours. There is no way for a household or a small business here to be paid for stepping aside.",
    es: "La capacidad más rápida que tiene cualquier red es la demanda que sencillamente se aparta durante esas tres horas. Hoy no existe forma de que un hogar o una empresa reciba un pago por apartarse.",
  },

  // Why LatAm Section
  "latam.eyebrow": { en: "Why it doesn’t exist here", es: "Por qué no existe aquí" },
  "latam.title": {
    en: "Settlement costs more than the energy saved.",
    es: "Liquidar cuesta más que la energía ahorrada.",
  },
  "latam.prose1": {
    en: "Demand response is an established, roughly eight-billion-dollar market in the places that have it. It has not reached Latin America for an unglamorous reason: metering, verifying, contracting and paying ten thousand small participants costs more than the electricity they would save. The economics fail on paperwork, not on physics.",
    es: "El demand response es un mercado consolidado de unos ocho mil millones de dólares donde opera. No ha llegado a América Latina por una razón poco glamurosa: medir, verificar, contratar y pagarle a diez mil pequeños participantes cuesta más que la electricidad que ahorrarían. La ecuación quiebra por el papeleo, no por la física.",
  },
  "latam.proseStrong": {
    en: "That paperwork is exactly what an agent, a stablecoin and a contract delete. This is the whole thesis, and it is the only reason a blockchain belongs anywhere near this problem.",
    es: "Ese papeleo es exactamente lo que un agente, una stablecoin y un smart contract eliminan. Esa es toda la tesis, y la única razón por la que una blockchain tiene sentido aquí.",
  },
  "latam.cardLegacyTitle": { en: "Legacy utility bilaterals", es: "Contratos bilaterales tradicionales" },
  "latam.legacy1": { en: "Wet signatures & notary contracts", es: "Firmas físicas y contratos ante notaría" },
  "latam.legacy2": { en: "Manual reconciliation, paid on invoice", es: "Conciliación manual, pagada contra factura" },
  "latam.legacy3": { en: "Verification costs more than the energy it confirms", es: "Verificar cuesta más que la energía que confirma" },
  "latam.cardMingaTitle": { en: "MINGA autonomous settlement", es: "Liquidación autónoma MINGA" },
  "latam.minga1": { en: "Every reading carries the device key's signature", es: "Cada lectura lleva la firma de la llave del dispositivo" },
  "latam.minga2": { en: "Counterfactual baseline rebuilt by the agent", es: "Línea base contrafactual reconstruida por el agente" },
  "latam.minga3": { en: "Settlement and protocol fee release in one transaction", es: "Liquidación y fee del protocolo liberados en una sola transacción" },

  // How it works Section
  "how.eyebrow": { en: "How it works", es: "Cómo funciona" },
  "how.title": { en: "Four steps, no human in the loop.", es: "Cuatro pasos, sin humanos en el bucle." },
  "how.step": { en: "Step", es: "Paso" },
  "how.step1Title": { en: "The agent senses", es: "El agente sensa" },
  "how.step1Body": {
    en: "It reads XM's published hourly price and reservoir level, compares the evening window against that day's own average, and decides by arithmetic whether the hour is worth an event.",
    es: "Lee el precio horario publicado por XM y el nivel de embalses, compara la ventana pico contra el promedio del propio día y decide por aritmética si se justifica declarar un evento.",
  },
  "how.step1Foot": { en: "Source: XM REST API", es: "Fuente: REST API pública de XM" },
  "how.step2Title": { en: "The meters sign", es: "Los medidores firman" },
  "how.step2Body": {
    en: "Every fifteen-minute reading is signed by the device's own key. The contract verifies a meter signature exactly as it verifies a human wallet.",
    es: "Cada lectura cada quince minutos es firmada por la llave del dispositivo. El contrato verifica la firma de un medidor exactamente igual a como verifica una wallet humana.",
  },
  "how.step2Foot": { en: "Auth: EIP-712, device key", es: "Auth: EIP-712, llave de dispositivo" },
  "how.step3Title": { en: "The agent verifies", es: "El agente verifica" },
  "how.step3Body": {
    en: "It rebuilds the counterfactual from five ordinary evenings, subtracts what was measured, and compares the result against the reduction the site committed to.",
    es: "Reconstruye el contrafactual a partir de cinco tardes ordinarias, resta lo medido y compara el resultado con la reducción comprometida por el sitio.",
  },
  "how.step3Foot": { en: "Compute: baseline delta", es: "Cálculo: delta contra línea base" },
  "how.step4Title": { en: "The contract pays", es: "El contrato paga" },
  "how.step4Body": {
    en: "If and only if the commitment was met, the escrow releases. Ninety per cent to the site, ten per cent to the protocol — atomically, in one transaction.",
    es: "Si y solo si se cumplió el compromiso, el escrow se libera. Noventa por ciento al sitio, diez por ciento al protocolo — de forma atómica, en una sola transacción.",
  },
  "how.step4Foot": { en: "Execution: release() on HSK", es: "Ejecución: release() en HSK" },
  "how.prose": {
    en: "The contract requires two signatures. One belongs to the meter, one to the agent. Neither can release funds alone, neither can change the amount, and a person who broadcasts the transaction is paying gas rather than approving a payment — their signature is not in it.",
    es: "El contrato exige dos firmas: una del medidor y otra del agente. Ninguno puede liberar fondos por sí solo ni alterar el monto. Quien retransmite la transacción simplemente paga el gas — su firma no está en la autorización.",
  },

  // Business Section
  "biz.eyebrow": { en: "The business", es: "El negocio" },
  "biz.title": {
    en: "Ten per cent of every settlement, enforced inside the contract.",
    es: "Diez por ciento de cada liquidación, ejecutado dentro del contrato.",
  },
  "biz.stat1": { en: "protocol fee, split on chain", es: "tarifa del protocolo, dividida en cadena" },
  "biz.stat2": { en: "to the site that reduced", es: "para el sitio que redujo" },
  "biz.stat3": { en: "paid per avoided kWh", es: "pagado por kWh evitado" },
  "biz.cardSplitTitle": { en: "Atomic split", es: "División atómica" },
  "biz.cardSplitProse": {
    en: "The fee is not an invoice anyone has to chase. It is a split inside release(): the same transaction that pays the site pays the protocol, or neither happens. On top of that sit a per-dispatch fee the agent charges the offtaker machine to machine, and a subscription for committed capacity.",
    es: "La tarifa no es una factura que haya que perseguir. Es una división dentro de release(): la misma transacción que le paga al sitio le paga al protocolo, o no se ejecuta ninguna. A eso se suman una tarifa por despacho máquina-a-máquina y una suscripción por capacidad comprometida.",
  },
  "biz.cardArbTitle": { en: "Arbitrage mechanics", es: "Mecánica de arbitraje" },
  "biz.cardArbProse": {
    en: "The offtaker pays fifteen cents for a kilowatt-hour it would otherwise buy at thirty-one during the evening window. That is roughly half price for the same relief, and it beats a blackout by considerably more. The arbitrage is the business; the contract is only what makes it cheap enough to run at scale.",
    es: "El offtaker paga quince centavos por un kilovatio-hora que de otro modo compraría a treinta y uno durante la ventana pico. Eso es casi mitad de precio por el mismo alivio, y mucho mejor que un apagón. El arbitraje es el negocio; el contrato es lo que lo hace viable a escala.",
  },

  // Beyond Section
  "beyond.eyebrow": { en: "Beyond electricity", es: "Más allá de la electricidad" },
  "beyond.title": { en: "The contract knows nothing about energy.", es: "El contrato no sabe nada sobre energía." },
  "beyond.prose": {
    en: "It knows that an offtaker funded a budget, a device signed a measurement, and an agent verified that measurement against an agreed baseline. Change the sensor and the same machinery pays for cubic metres of water not drawn during a drought, or for verified fire-risk mitigation around a páramo. Electricity is the first vertical because it is the one on fire this month.",
    es: "Sabe que un offtaker financió un presupuesto, un dispositivo firmó una medición y un agente la verificó contra una línea base acordada. Cambia el sensor y la misma infraestructura paga por metros cúbicos de agua no consumidos en sequía o por mitigación de riesgo de incendios en un páramo. La electricidad es el primer frente porque es el que está en crisis hoy.",
  },
  "beyond.pill1": { en: "Phase 1 · Power grid", es: "Fase 1 · Red eléctrica" },
  "beyond.pill2": { en: "Phase 2 · Drought reservoirs", es: "Fase 2 · Embalses en sequía" },
  "beyond.pill3": { en: "Phase 3 · Páramo wildfire risk", es: "Fase 3 · Riesgo de incendios en páramos" },

  // Honesty Section
  "honest.eyebrow": { en: "What this is not", es: "Lo que esto no es" },
  "honest.title": { en: "The honest part.", es: "La parte honesta." },
  "honest.card1Title": { en: "The grid price is real", es: "El precio de la red es real" },
  "honest.card1Prose": {
    en: "The agent reads XM’s published hourly spot price and reservoir level, and converts with the official exchange rate. XM publishes a couple of days behind, so the app always shows which day the figure belongs to. If those sources cannot be reached it falls back to a fixture that says so on the page, in those words.",
    es: "El agente lee el precio de bolsa horario y el nivel de embalses publicados por XM, convirtiendo con la TRM oficial. XM publica con rezago de un par de días, por lo que la aplicación siempre muestra a qué fecha corresponde el dato. Si la fuente no responde, cae a un fixture que lo declara explícitamente.",
  },
  "honest.card2Title": { en: "Meter readings are synthetic", es: "Las lecturas de medidor son sintéticas" },
  "honest.card2Prose": {
    en: "They are synthetic and signed by a development key, because there is no meter connected — and even with one, the baseline needs five days of history before it exists. A signature proves non-repudiation, that this device said this, and nothing more. It does not prove the meter was not physically tampered with; that needs a secure element, and it is the next step rather than a solved problem.",
    es: "Son sintéticas y firmadas por una llave de desarrollo porque no hay un medidor conectado — e incluso con uno, la línea base requiere cinco días de historia para existir. Una firma prueba no repudio: que este dispositivo dijo esto. No prueba que el medidor no haya sido manipulado físicamente; eso requiere un elemento seguro, y es el siguiente paso.",
  },
  "honest.card3Title": { en: "The baseline is a convention", es: "La línea base es una convención" },
  "honest.card3Prose": {
    en: "It is agreed in the programme terms, not a measurement of a world that did not happen. No utility has signed anything. What is real is the contract, the verification, and the payment you can watch execute.",
    es: "Es una convención acordada en los términos del programa, no una medida de un mundo que no ocurrió. Ninguna empresa de energía ha firmado nada todavía. Lo que sí es real es el contrato, la verificación y el pago que puedes ver ejecutarse.",
  },

  // Hardware Section
  "hard.eyebrow": { en: "The next step", es: "El siguiente paso" },
  "hard.title": { en: "From a simulated meter to a real one.", es: "De un medidor simulado a uno real." },
  "hard.prose1": {
    en: "A real device has to solve three separate problems, and solving one does not solve the others: measure the watt-hours, attest that this specific device said so, and transport the statement out of the building. Everything downstream — verification, the baseline, the payout — is already built and does not change.",
    es: "Un dispositivo real debe resolver tres retos independientes: medir los vatios-hora, atestiguar que este dispositivo en particular lo dijo y transmitir la información. Todo lo demás —verificación, línea base y liquidación— ya está construido y no cambia.",
  },
  "hard.stage1": { en: "Measure", es: "Medir" },
  "hard.stage1Body": { en: "CT clamp + metering IC", es: "Transformador de corriente + IC de medición" },
  "hard.stage2": { en: "Attest", es: "Atestiguar" },
  "hard.stage2Body": { en: "Secure element, secp256k1 signature", es: "Elemento seguro, firma secp256k1" },
  "hard.stage3": { en: "Transport", es: "Transmitir" },
  "hard.stage3Body": { en: "WiFi / LTE-M / LoRaWAN", es: "WiFi / LTE-M / LoRaWAN" },
  "hard.stage4": { en: "Settle", es: "Liquidar" },
  "hard.stage4Body": { en: "Agent verifies, contract pays — unchanged", es: "Agente verifica, contrato paga — sin cambios" },
  "hard.prose2": {
    en: "The middle card is the hard one. The cheap secure element everyone reaches for first signs a different elliptic curve than Ethereum uses — a mismatch that has sunk other projects after the hardware was already ordered. docs/hardware-roadmap.md in the repository writes out the trap and the three honest ways around it, plus a costed, phased pilot starting at one cooperating site for about USD 150 in hardware.",
    es: "El segundo paso es el crítico. El elemento seguro económico firma una curva elíptica distinta a la de Ethereum — un desfase que ha frenado proyectos tras haber comprado el hardware. docs/hardware-roadmap.md documenta esta trampa y tres alternativas viables, además de un piloto costeado por fases con un sitio cooperante por unos USD 150 en hardware.",
  },
  "hard.link": { en: "Read the full hardware roadmap", es: "Leer la hoja de ruta completa de hardware" },

  // Footer
  "footer.mingaMeaning": {
    en: "A minga is what people in the Andes call it when a whole community drops what it is doing and works together for one common goal. Ten thousand households turning things off at the same hour so the grid does not fall is a minga. We just made it pay.",
    es: "Una minga es como llamamos en los Andes al momento en que toda una comunidad deja lo que está haciendo y trabaja junta por un objetivo común. Diez mil hogares apagando consumos a la misma hora para que la red no colapse es una minga. Nosotros la hicimos rentable.",
  },
  "footer.legendTitle": {
    en: "Where every number on this page comes from",
    es: "De dónde proviene cada número en esta página",
  },
  "footer.colombia": {
    en: "Built for the EAG hackathon in Cali, Colombia · HSK Chain testnet",
    es: "Construido para la hackathon EAG en Cali, Colombia · HSK Chain testnet",
  },

  // ── APP DASHBOARD COPY ───────────────────────────────────────────────
  "app.headerTitle": { en: "MINGA Grid", es: "MINGA Grid" },
  "app.tagline": {
    en: "Get paid for the electricity you don’t use when the grid is about to fall.",
    es: "Te pagan por la electricidad que no consumes cuando la red está a punto de caer.",
  },
  "app.metaNotice": {
    en: "HSK testnet · no monetary value · live grid price from XM · meter readings are synthetic and signed by a device key",
    es: "HSK testnet · sin valor monetario · precio de red en vivo de XM · lecturas sintéticas firmadas por llave de dispositivo",
  },
  "app.backendError": {
    en: "Backend unreachable.",
    es: "Backend no disponible.",
  },
  "app.panelGridTitle": { en: "Grid status", es: "Estado de la red" },
  "app.published": { en: "published", es: "publicado" },
  "app.reservoirsAt": { en: "reservoirs at", es: "embalses al" },
  "app.stress": { en: "Stress", es: "Estrés" },
  "app.stressNormal": { en: "Normal", es: "Normal" },
  "app.stressElevated": { en: "Elevated", es: "Elevado" },
  "app.stressCritical": { en: "Critical", es: "Crítico" },
  "app.statWindowPrice": { en: "Window price", es: "Precio ventana" },
  "app.noteWindowPrice": { en: "per kWh, 18–21h", es: "por kWh, 18–21h" },
  "app.statDayAverage": { en: "Day average", es: "Promedio día" },
  "app.noteDayAverage": { en: "per kWh, 24h mean", es: "por kWh, media 24h" },
  "app.statPeakRatio": { en: "Peak ratio", es: "Múltiplo pico" },
  "app.noteDispatchAt": { en: "dispatch at", es: "despacho a" },
  "app.statProgrammePays": { en: "Programme pays", es: "El programa paga" },
  "app.notePerAvoided": { en: "per avoided kWh", es: "por kWh evitado" },
  "app.agentVerdict": { en: "Agent verdict:", es: "Veredicto del agente:" },

  // Panel 2: The Site
  "app.panelSiteTitle": { en: "The site", es: "El sitio" },
  "app.meter": { en: "meter", es: "medidor" },
  "app.eventWindow": { en: "event window", es: "ventana de evento" },
  "app.loadingMeter": { en: "Loading meter data…", es: "Cargando datos del medidor…" },
  "app.statCommitted": { en: "Committed", es: "Comprometido" },
  "app.noteCommitted": { en: "kWh agreed reduction", es: "kWh de reducción pactada" },
  "app.statAvoided": { en: "Avoided", es: "Evitado" },
  "app.noteAvoidedVerified": { en: "kWh verified by the agent", es: "kWh verificados por el agente" },
  "app.noteAvoidedPending": { en: "run the agent to verify", es: "ejecuta el agente para verificar" },
  "app.statSiteEarned": { en: "Site earned", es: "Ganado por el sitio" },
  "app.noteSiteEarned": { en: "90% share, all programmes", es: "90% participación, todos los programas" },
  "app.statTreasury": { en: "Treasury", es: "Treasury" },
  "app.noteTreasury": { en: "10% fee, all programmes", es: "10% tarifa, todos los programas" },

  // Panel 3: Live Settlement
  "app.panelSettleTitle": { en: "Live settlement", es: "Liquidación en vivo" },
  "app.panelSettleSubtitle": {
    en: "The agent senses, verifies, decides and signs. No human signature is involved.",
    es: "El agente sensa, verifica, decide y firma. No interviene ninguna firma humana.",
  },
  "app.scenarioDelivered": { en: "Site shed load", es: "El sitio redujo carga" },
  "app.scenarioShortfall": { en: "Site missed its commitment", es: "El sitio incumplió compromiso" },
  "app.btnRunAgent": { en: "Run the settlement agent", es: "Ejecutar el agente liquidador" },
  "app.btnAgentRunning": { en: "Agent running…", es: "Agente ejecutándose…" },
  "app.agentOutput": { en: "Agent output", es: "Salida del agente" },

  // Pipeline descriptions when idle
  "pipeline.sense": {
    en: "read the grid signal and decide whether an event is warranted",
    es: "leer la señal de la red y decidir si se justifica un evento",
  },
  "pipeline.verify": {
    en: "recover the signer of every meter reading in the window",
    es: "recuperar el firmante de cada lectura en la ventana",
  },
  "pipeline.baseline": {
    en: "rebuild the counterfactual from five ordinary evenings",
    es: "reconstruir el contrafactual a partir de cinco tardes ordinarias",
  },
  "pipeline.measure": {
    en: "baseline minus measured equals avoided energy",
    es: "línea base menos medido es igual a energía evitada",
  },
  "pipeline.decide": {
    en: "compare against the reduction the site committed to",
    es: "comparar contra la reducción comprometida por el sitio",
  },
  "pipeline.sign": {
    en: "produce one of the two signatures release() requires",
    es: "producir una de las dos firmas que release() requiere",
  },

  // Settlement results
  "app.settled": { en: "Settled", es: "Liquidado" },
  "app.refused": { en: "Refused to settle", es: "Rechazó liquidar" },
  "app.relayNotice": {
    en: "Both machine signatures are ready. Someone has to pay the gas to put them on chain — that is all a relayer does. Your signature is not in this transaction.",
    es: "Ambas firmas de máquina están listas. Alguien debe pagar el gas para subirlas a la cadena — eso es todo lo que hace un relayer. Tu firma no está en la transacción.",
  },
  "app.btnRelay": { en: "Relay the settlement to HSK", es: "Retransmitir liquidación a HSK" },
  "app.btnRelayConfirming": { en: "Confirm in your wallet…", es: "Confirma en tu wallet…" },
  "app.statusWaitingBlock": { en: "Waiting for the block…", es: "Esperando el bloque…" },
  "app.statusConfirmed": { en: "Confirmed on HSK", es: "Confirmado en HSK" },
  "app.statusSent": { en: "Sent", es: "Enviado" },
  "app.paidOnChain": { en: "Paid on chain:", es: "Pagado en cadena:" },
  "app.toTheSite": { en: "to the site,", es: "al sitio," },
  "app.toTheTreasury": { en: "to the protocol treasury.", es: "al treasury del protocolo." },
  "app.viewBlockscout": { en: "View the transaction on Blockscout", es: "Ver la transacción en Blockscout" },
  "app.evidenceHash": { en: "Evidence hash committed on chain:", es: "Hash de evidencia asentado en cadena:" },

  // Panel 4: Programme on HSK
  "app.panelProgTitle": { en: "The programme on HSK", es: "El programa en HSK" },
  "app.statBudget": { en: "Budget", es: "Presupuesto" },
  "app.noteBudget": { en: "funded by the offtaker", es: "financiado por el offtaker" },
  "app.statPaidOut": { en: "Paid out", es: "Pagado" },
  "app.statInEscrow": { en: "In escrow", es: "En escrow" },
  "app.noteInEscrow": { en: "locked in the contract", es: "bloqueado en el contrato" },
  "app.statSplit": { en: "Split", es: "División" },
  "app.noteSplit": { en: "site / protocol, enforced on chain", es: "sitio / protocolo, en cadena" },
  "app.contract": { en: "Contract", es: "Contrato" },
  "app.meterSigner": { en: "Meter key (signer 1)", es: "Llave medidor (firmante 1)" },
  "app.agentSigner": { en: "Agent key (signer 2)", es: "Llave agente (firmante 2)" },
  "app.treasury": { en: "Treasury", es: "Treasury" },
  "app.openProgrammeBlockscout": { en: "Open the programme on Blockscout", es: "Abrir el programa en Blockscout" },
  "app.noProgramme": { en: "No programme on chain yet.", es: "Aún no hay programa en cadena." },

  // Dashboard Footer
  "app.footerText": {
    en: "A minga is when a whole community drops what it is doing and works together for one common goal. Baseline method: 5-day ordinary evening median. The agent produces one of the two signatures the contract requires and cannot change the amount.",
    es: "Una minga es cuando una comunidad entera deja lo que hace y colabora por una meta común. Método de línea base: mediana de 5 tardes ordinarias. El agente produce una de las dos firmas que el contrato requiere y no puede alterar el monto.",
  },

  // EventChart
  "chart.baselineLegend": {
    en: "Baseline — what five ordinary evenings predicted",
    es: "Línea base — predicción de 5 tardes ordinarias",
  },
  "chart.actualLabelDelivered": {
    en: "Measured — delivered",
    es: "Medido — entregado",
  },
  "chart.actualLabelShortfall": {
    en: "Measured — shortfall",
    es: "Medido — déficit",
  },
  "chart.avoidedLegend": {
    en: "Avoided energy — what gets paid",
    es: "Energía evitada — lo que se paga",
  },
  "chart.kwhAvoided": {
    en: "kWh avoided",
    es: "kWh evitados",
  },
  "chart.showTable": {
    en: "Show the readings as a table",
    es: "Mostrar lecturas en tabla",
  },
  "chart.hideTable": {
    en: "Hide the readings",
    es: "Ocultar las lecturas",
  },
  "chart.colInterval": { en: "Interval (COT)", es: "Intervalo (COT)" },
  "chart.colBaseline": { en: "Baseline kWh", es: "Línea base kWh" },
  "chart.colMeasured": { en: "Measured kWh", es: "Medido kWh" },
  "chart.colAvoided": { en: "Avoided kWh", es: "Evitado kWh" },
  "chart.baselineHover": { en: "Baseline", es: "Línea base" },
  "chart.measuredHover": { en: "Measured", es: "Medido" },
  "chart.caption": {
    en: "kWh per 15-minute interval. Readings are synthetic and signed by the device key; the signature proves non-repudiation, not physical tamper resistance.",
    es: "kWh por intervalo de 15 minutos. Lecturas sintéticas firmadas por llave de dispositivo; la firma prueba no repudio, no inviolabilidad física.",
  },
} as const;

export type CopyKey = keyof typeof COPY;

export function t(key: CopyKey, lang: Lang = "en"): string {
  const item = COPY[key];
  if (!item) {
    if (process.env.NODE_ENV !== "production") {
      console.warn(`[i18n] Missing translation key: ${key}`);
    }
    return key;
  }
  return item[lang] ?? item.en;
}
