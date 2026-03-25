/**
 * TCGenerator
 * Generates structured test cases (MF/AF/EX) from Jira story + Confluence + Figma data.
 * This is the "brain" of qa-orchestrator-mcp.
 */
export class TCGenerator {
  /**
   * Generate all test cases from aggregated source data.
   * @param {object} story - Jira issue object
   * @param {object|null} confluencePage - Confluence page object
   * @param {object|null} figmaData - Figma components/screens
   * @returns {object[]}
   */
  generate(story, confluencePage, figmaData) {
    const context = this._buildContext(story, confluencePage, figmaData);
    const testCases = [];

    // ── Main Flows (MF) ────────────────────────────────────────────────────────
    testCases.push(...this._generateMainFlows(context));

    // ── Alternative Flows (AF) ─────────────────────────────────────────────────
    testCases.push(...this._generateAlternativeFlows(context));

    // ── Exception Flows (EX) ──────────────────────────────────────────────────
    testCases.push(...this._generateExceptionFlows(context));

    return testCases;
  }

  _buildContext(story, confluencePage, figmaData) {
    const fields = story.fields || {};
    const summary = fields.summary || "";
    const description = this._extractText(fields.description);
    const acceptanceCriteria = this._extractAcceptanceCriteria(fields);
    const confluenceText = confluencePage?.text || "";
    const screens = figmaData?.screens || [];
    const components = figmaData?.components || [];

    // Parse acceptance criteria into individual criteria items
    const acItems = this._parseAcceptanceCriteria(acceptanceCriteria + "\n" + confluenceText);

    return {
      storyKey: story.key,
      summary,
      description,
      acceptanceCriteria,
      acItems,
      confluenceText,
      screens,
      components,
      issuetype: fields.issuetype?.name || "Story",
    };
  }

  _generateMainFlows(ctx) {
    const tcs = [];

    // TC1: Happy path - main functionality
    tcs.push({
      flowType: "MF",
      name: `Verificar el flujo principal de "${ctx.summary}"`,
      objective: `Validar que el usuario puede completar exitosamente la funcionalidad principal: ${ctx.summary}`,
      precondition: this._buildPrecondition(ctx),
      steps: this._buildMainFlowSteps(ctx),
      gherkin: this._buildGherkin("MF", ctx),
    });

    // TC per acceptance criteria (main/positive ones)
    const positiveAC = ctx.acItems.filter((a) => a.type === "positive");
    for (const ac of positiveAC) {
      tcs.push({
        flowType: "MF",
        name: `Verificar: ${ac.title}`,
        objective: `Validar criterio de aceptación: ${ac.title}`,
        precondition: this._buildPrecondition(ctx),
        steps: this._buildACSteps(ac, ctx),
        gherkin: this._buildGherkin("MF", ctx, ac),
      });
    }

    // Screens from Figma → one TC per main screen/flow
    const mainScreens = ctx.screens.slice(0, 3); // First 3 screens = main flows
    for (const screen of mainScreens) {
      tcs.push({
        flowType: "MF",
        name: `Verificar pantalla/componente: ${screen.name}`,
        objective: `Validar que la pantalla "${screen.name}" se muestra y funciona correctamente`,
        precondition: this._buildPrecondition(ctx),
        steps: this._buildScreenSteps(screen, ctx),
        gherkin: "",
      });
    }

    return tcs;
  }

  _generateAlternativeFlows(ctx) {
    const tcs = [];

    // TC: Navigation alternatives
    tcs.push({
      flowType: "AF",
      name: `Verificar flujo alternativo - Cancelar operación en "${ctx.summary}"`,
      objective: `Validar que el usuario puede cancelar la operación y el sistema regresa al estado anterior`,
      precondition: this._buildPrecondition(ctx),
      steps: [
        { description: "Navegar a la funcionalidad principal", test_data: "", expected_result: "La pantalla principal se muestra correctamente" },
        { description: "Iniciar el flujo principal de la historia", test_data: "", expected_result: "El flujo se inicia correctamente" },
        { description: "En mitad del flujo, seleccionar la opción 'Cancelar' o navegar hacia atrás", test_data: "", expected_result: "Se muestra confirmación de cancelación si aplica" },
        { description: "Confirmar la cancelación", test_data: "", expected_result: "El sistema vuelve al estado anterior sin guardar cambios" },
        { description: "Verificar que no se han guardado datos parciales", test_data: "", expected_result: "Los datos no persisten y el sistema está en estado limpio" },
      ],
      gherkin: "",
    });

    // TC: Optional fields / partial data
    tcs.push({
      flowType: "AF",
      name: `Verificar comportamiento con datos mínimos en "${ctx.summary}"`,
      objective: `Validar que la funcionalidad opera correctamente con solo los campos obligatorios`,
      precondition: this._buildPrecondition(ctx),
      steps: [
        { description: "Navegar a la funcionalidad", test_data: "", expected_result: "Se muestra el formulario/pantalla correctamente" },
        { description: "Rellenar únicamente los campos obligatorios", test_data: "Campos mínimos requeridos", expected_result: "Los campos obligatorios se validan en tiempo real si aplica" },
        { description: "Dejar campos opcionales vacíos", test_data: "", expected_result: "Los campos opcionales no bloquean el flujo" },
        { description: "Completar la acción principal (guardar/enviar/confirmar)", test_data: "", expected_result: "La acción se completa con éxito con datos mínimos" },
        { description: "Verificar resultado con campos mínimos", test_data: "", expected_result: "El registro/resultado se crea correctamente con los datos mínimos" },
      ],
      gherkin: "",
    });

    // AC-based alternative flows
    const conditionalAC = ctx.acItems.filter((a) => a.type === "conditional");
    for (const ac of conditionalAC) {
      tcs.push({
        flowType: "AF",
        name: `Verificar flujo alternativo: ${ac.title}`,
        objective: `Validar el comportamiento alternativo: ${ac.title}`,
        precondition: this._buildPrecondition(ctx),
        steps: this._buildACSteps(ac, ctx),
        gherkin: "",
      });
    }

    // TC: Multiple user roles (if detected in description)
    if (this._detectsMultipleRoles(ctx)) {
      tcs.push({
        flowType: "AF",
        name: `Verificar acceso con diferentes roles de usuario en "${ctx.summary}"`,
        objective: `Validar que distintos roles tienen el acceso correcto a la funcionalidad`,
        precondition: "El sistema tiene configurados usuarios con distintos roles",
        steps: [
          { description: "Acceder con usuario de rol básico/limitado", test_data: "Usuario: rol_basico@test.com", expected_result: "El usuario ve únicamente las opciones permitidas para su rol" },
          { description: "Intentar acceder a funciones restringidas", test_data: "", expected_result: "El sistema muestra mensaje de acceso denegado o no muestra la opción" },
          { description: "Cerrar sesión y acceder con usuario administrador", test_data: "Usuario: admin@test.com", expected_result: "El administrador tiene acceso completo a todas las funciones" },
          { description: "Verificar todas las funciones disponibles para el administrador", test_data: "", expected_result: "Todas las opciones del admin están habilitadas y funcionan correctamente" },
        ],
        gherkin: "",
      });
    }

    return tcs;
  }

  _generateExceptionFlows(ctx) {
    const tcs = [];

    // TC: Required field validation
    tcs.push({
      flowType: "EX",
      name: `Verificar validación de campos obligatorios en "${ctx.summary}"`,
      objective: `Validar que el sistema muestra errores cuando campos obligatorios están vacíos`,
      precondition: this._buildPrecondition(ctx),
      steps: [
        { description: "Navegar a la funcionalidad", test_data: "", expected_result: "La pantalla se carga correctamente" },
        { description: "Dejar todos los campos obligatorios vacíos", test_data: "", expected_result: "Los campos están vacíos" },
        { description: "Intentar completar la acción principal sin rellenar campos", test_data: "", expected_result: "El sistema NO permite continuar" },
        { description: "Verificar mensajes de error en los campos obligatorios", test_data: "", expected_result: "Se muestran mensajes de error descriptivos junto a cada campo obligatorio" },
        { description: "Verificar que el foco se sitúa en el primer campo con error", test_data: "", expected_result: "El cursor se posiciona en el primer campo incorrecto" },
      ],
      gherkin: "",
    });

    // TC: Invalid data format
    tcs.push({
      flowType: "EX",
      name: `Verificar comportamiento con datos inválidos en "${ctx.summary}"`,
      objective: `Validar que el sistema rechaza datos con formato incorrecto y muestra mensajes de error apropiados`,
      precondition: this._buildPrecondition(ctx),
      steps: [
        { description: "Navegar a la funcionalidad", test_data: "", expected_result: "La pantalla se carga correctamente" },
        { description: "Introducir datos con formato inválido en los campos", test_data: "Datos incorrectos: texto en campos numéricos, emails sin @, fechas incorrectas", expected_result: "Se muestra error de formato en el campo correspondiente" },
        { description: "Intentar guardar/enviar con datos inválidos", test_data: "", expected_result: "El sistema bloquea la acción y muestra errores de validación" },
        { description: "Corregir los datos con valores válidos", test_data: "Datos correctos según especificación", expected_result: "Los errores de validación desaparecen al corregir los datos" },
        { description: "Completar la acción con datos corregidos", test_data: "", expected_result: "La acción se completa exitosamente" },
      ],
      gherkin: "",
    });

    // TC: Connectivity / server error
    tcs.push({
      flowType: "EX",
      name: `Verificar manejo de errores del servidor en "${ctx.summary}"`,
      objective: `Validar que el sistema maneja correctamente errores del servidor y muestra mensajes amigables`,
      precondition: `${this._buildPrecondition(ctx)} El servidor está configurado para simular errores (entorno de prueba)`,
      steps: [
        { description: "Navegar a la funcionalidad con conectividad inestable o servidor en error", test_data: "Simular timeout o error 500", expected_result: "La pantalla muestra estado de carga" },
        { description: "Intentar completar la acción principal", test_data: "", expected_result: "El sistema detecta el error del servidor" },
        { description: "Verificar mensaje de error mostrado al usuario", test_data: "", expected_result: "Se muestra un mensaje de error descriptivo y amigable (no técnico)" },
        { description: "Verificar opción de reintento", test_data: "", expected_result: "El usuario puede reintentar la operación" },
        { description: "Restaurar conectividad y reintentar", test_data: "", expected_result: "La operación se completa exitosamente al recuperar conectividad" },
      ],
      gherkin: "",
    });

    // TC: Duplicate data / business rules
    tcs.push({
      flowType: "EX",
      name: `Verificar manejo de duplicados/reglas de negocio en "${ctx.summary}"`,
      objective: `Validar que el sistema previene datos duplicados y respeta las reglas de negocio`,
      precondition: `${this._buildPrecondition(ctx)} Existe al menos un registro previo en el sistema`,
      steps: [
        { description: "Intentar crear un registro con datos que ya existen en el sistema", test_data: "Datos de un registro existente", expected_result: "El sistema detecta la duplicidad" },
        { description: "Verificar mensaje de error de duplicado", test_data: "", expected_result: "Se muestra un mensaje claro indicando que el registro ya existe" },
        { description: "Verificar que no se ha creado el registro duplicado", test_data: "", expected_result: "La base de datos no contiene el duplicado" },
        { description: "Modificar los datos para que sean únicos y reintentar", test_data: "Datos únicos y válidos", expected_result: "El registro se crea correctamente con datos únicos" },
      ],
      gherkin: "",
    });

    // EX cases from negative AC
    const negativeAC = ctx.acItems.filter((a) => a.type === "negative");
    for (const ac of negativeAC) {
      tcs.push({
        flowType: "EX",
        name: `Verificar excepción: ${ac.title}`,
        objective: `Validar el comportamiento de excepción: ${ac.title}`,
        precondition: this._buildPrecondition(ctx),
        steps: this._buildACSteps(ac, ctx),
        gherkin: "",
      });
    }

    return tcs;
  }

  // ─── Helper builders ──────────────────────────────────────────────────────────

  _buildPrecondition(ctx) {
    return `El usuario tiene acceso al sistema y está autenticado correctamente. La historia "${ctx.storyKey}: ${ctx.summary}" está disponible en el entorno de prueba.`;
  }

  _buildMainFlowSteps(ctx) {
    const steps = [
      { description: `Acceder al sistema con credenciales válidas`, test_data: "Usuario de prueba con permisos adecuados", expected_result: "El usuario accede al sistema correctamente" },
      { description: `Navegar a la sección correspondiente a: ${ctx.summary}`, test_data: "", expected_result: "La sección se muestra correctamente y es accesible" },
      { description: "Verificar que todos los elementos de la pantalla están presentes", test_data: "", expected_result: "Todos los campos, botones y elementos definidos en el diseño están visibles y activos" },
      { description: "Completar el flujo principal con datos válidos", test_data: "Datos de prueba válidos", expected_result: "El sistema acepta los datos y procesa la solicitud" },
      { description: "Confirmar la acción principal", test_data: "", expected_result: "El sistema muestra confirmación de éxito" },
      { description: "Verificar que el resultado es el esperado", test_data: "", expected_result: "El resultado final coincide con los criterios de aceptación de la historia" },
    ];

    // Add steps from acceptance criteria
    for (const ac of ctx.acItems.slice(0, 2)) {
      steps.push({
        description: `Verificar criterio: ${ac.title}`,
        test_data: ac.testData || "",
        expected_result: ac.expected || ac.title,
      });
    }

    return steps;
  }

  _buildACSteps(ac, ctx) {
    return [
      { description: `Acceder a la funcionalidad: ${ctx.summary}`, test_data: "", expected_result: "La funcionalidad se muestra correctamente" },
      { description: `Preparar las condiciones para: ${ac.title}`, test_data: ac.testData || "Datos definidos en AC", expected_result: "Las condiciones están preparadas" },
      { description: `Ejecutar la acción descrita en el criterio: ${ac.condition || ac.title}`, test_data: ac.testData || "", expected_result: "La acción se ejecuta" },
      { description: `Verificar el resultado esperado`, test_data: "", expected_result: ac.expected || "El sistema se comporta según el criterio de aceptación" },
    ];
  }

  _buildScreenSteps(screen, _ctx) {
    return [
      { description: `Navegar a la pantalla "${screen.name}"`, test_data: "", expected_result: `La pantalla "${screen.name}" se carga completamente` },
      { description: "Verificar todos los elementos visuales de la pantalla", test_data: "", expected_result: "Todos los elementos del diseño Figma están presentes y correctamente posicionados" },
      { description: "Verificar la responsividad de la pantalla", test_data: "Diferentes resoluciones de pantalla", expected_result: "La pantalla se adapta correctamente a distintas resoluciones" },
      { description: "Verificar que todos los elementos interactivos responden", test_data: "", expected_result: "Botones, links y elementos interactivos responden al click/tap" },
      { description: "Verificar la accesibilidad básica de la pantalla", test_data: "", expected_result: "Los elementos tienen etiquetas ARIA apropiadas y son navegables por teclado" },
    ];
  }

  _buildGherkin(flowType, ctx, ac) {
    const flowLabel = { MF: "flujo principal", AF: "flujo alternativo", EX: "flujo de excepción" }[flowType];
    const title = ac ? ac.title : ctx.summary;
    return `Feature: ${ctx.summary}\n\n  Scenario: [${flowType}] Verificar ${flowLabel} - ${title}\n    Given el usuario está autenticado en el sistema\n    When navega a la funcionalidad "${ctx.summary}"\n    And completa el ${flowLabel} con datos válidos\n    Then el sistema procesa la solicitud correctamente\n    And muestra el resultado esperado`;
  }

  // ─── AC Parser ────────────────────────────────────────────────────────────────

  _parseAcceptanceCriteria(text) {
    const items = [];
    if (!text) return items;

    const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);

    for (const line of lines) {
      const cleanLine = line.replace(/^[-*•·]\s*/, "").trim();
      if (!cleanLine || cleanLine.length < 5) continue;

      let type = "positive";
      if (/no\s|debe\s+impedir|error|fallo|inválid|incorrecto|deneg|bloqu/i.test(cleanLine)) {
        type = "negative";
      } else if (/cuando|si\s|en\s+caso\s+de|opcionalmente|puede/i.test(cleanLine)) {
        type = "conditional";
      }

      items.push({
        title: cleanLine.length > 80 ? cleanLine.substring(0, 77) + "..." : cleanLine,
        condition: cleanLine,
        expected: cleanLine,
        testData: "",
        type,
      });
    }

    return items.slice(0, 10); // Max 10 AC items to avoid explosion of TCs
  }

  _extractAcceptanceCriteria(fields) {
    // Common custom field names for acceptance criteria
    const acFields = [
      "customfield_10014", // Common AC field
      "customfield_10000",
      "customfield_10500",
      "acceptance_criteria",
    ];

    for (const field of acFields) {
      if (fields[field]) {
        return this._extractText(fields[field]);
      }
    }

    // Try to find in description
    const desc = this._extractText(fields.description);
    const acMatch = desc.match(/criterios?\s+de\s+aceptaci[oó]n[:\s]*([\s\S]+?)(?:\n\n|$)/i);
    return acMatch ? acMatch[1] : "";
  }

  _extractText(node) {
    if (!node) return "";
    if (typeof node === "string") return node;

    if (node.type === "doc" || node.type === "blockquote" || node.type === "paragraph" || node.type === "bulletList" || node.type === "orderedList") {
      return (node.content || []).map((n) => this._extractText(n)).join("\n");
    }
    if (node.type === "text") return node.text || "";
    if (node.type === "listItem") return (node.content || []).map((n) => this._extractText(n)).join("") + "\n";
    if (node.type === "heading") return (node.content || []).map((n) => this._extractText(n)).join("") + "\n";

    if (Array.isArray(node)) return node.map((n) => this._extractText(n)).join("\n");
    if (node.content) return this._extractText(node.content);

    return "";
  }

  _detectsMultipleRoles(ctx) {
    const roleKeywords = /rol|role|perfil|admin|gestor|usuario|operador|supervisor/i;
    return roleKeywords.test(ctx.description) || roleKeywords.test(ctx.confluenceText);
  }
}
