/**
 * TCGenerator
 * Generates structured test cases (MF/AF/EX) from Jira story + Confluence + Figma data.
 *
 * Rules (aligned with the reusable prompt):
 * - Steps in SPANISH, Gherkin format: Dado / Cuando / Y / Entonces
 * - First step always "Dado que..." (precondition/initial state)
 * - Middle steps: "Cuando..." (user action) or "Y..." (chained)
 * - Last/verification steps: "Entonces..." (observable result)
 * - testData: concrete values where applicable
 * - expectedResult: verifiable by a QA tester without ambiguity
 * - Minimum 6 steps per TC
 */
export class TCGenerator {
  /**
   * @param {object} story - Jira issue object
   * @param {object|null} confluencePage - Confluence page object
   * @param {object|null} figmaData - Figma components/screens
   * @returns {object[]}
   */
  generate(story, confluencePage, figmaData) {
    const context = this._buildContext(story, confluencePage, figmaData);
    const testCases = [];

    testCases.push(...this._generateMainFlows(context));
    testCases.push(...this._generateAlternativeFlows(context));
    testCases.push(...this._generateExceptionFlows(context));

    return testCases;
  }

  // ── Context builder ──────────────────────────────────────────────────────────

  _buildContext(story, confluencePage, figmaData) {
    const fields = story.fields || {};
    const summary = fields.summary || "";
    const description = this._extractText(fields.description);
    const acceptanceCriteria = this._extractAcceptanceCriteria(fields);
    const confluenceText = confluencePage?.text || "";
    const screens = figmaData?.screens || [];

    const acItems = this._parseAcceptanceCriteria(acceptanceCriteria + "\n" + confluenceText);
    const businessRules = this._parseBusinessRules(confluenceText);

    return {
      storyKey: story.key,
      summary,
      description,
      acceptanceCriteria,
      acItems,
      businessRules,
      confluenceText,
      screens,
      issuetype: fields.issuetype?.name || "Story",
    };
  }

  // ── MF — Flujo Principal ─────────────────────────────────────────────────────

  _generateMainFlows(ctx) {
    const tcs = [];

    // TC1: Happy path
    tcs.push({
      flowType: "MF",
      name: `Verificar el flujo principal de "${ctx.summary}"`,
      objective: `Validar que el usuario puede completar exitosamente el flujo principal: ${ctx.summary}`,
      precondition: this._buildPrecondition(ctx),
      steps: this._buildMainFlowSteps(ctx),
    });

    // One TC per positive AC
    const positiveAC = ctx.acItems.filter((a) => a.type === "positive");
    for (const ac of positiveAC) {
      tcs.push({
        flowType: "MF",
        name: `Verificar: ${ac.title}`,
        objective: `Validar el criterio de aceptación: ${ac.title}`,
        precondition: this._buildPrecondition(ctx),
        steps: this._buildACSteps(ac, ctx, "MF"),
      });
    }

    // One TC per Figma screen (first 3)
    for (const screen of ctx.screens.slice(0, 3)) {
      tcs.push({
        flowType: "MF",
        name: `Verificar pantalla: ${screen.name}`,
        objective: `Validar que la pantalla "${screen.name}" se muestra y funciona correctamente`,
        precondition: this._buildPrecondition(ctx),
        steps: this._buildScreenSteps(screen, ctx),
      });
    }

    return tcs;
  }

  // ── AF — Flujo Alternativo ────────────────────────────────────────────────────

  _generateAlternativeFlows(ctx) {
    const tcs = [];

    // Cancel flow
    tcs.push({
      flowType: "AF",
      name: `Verificar cancelación del flujo en "${ctx.summary}"`,
      objective: `Validar que el usuario puede cancelar la operación y el sistema regresa al estado anterior sin guardar cambios`,
      precondition: this._buildPrecondition(ctx),
      steps: [
        { description: `Dado que el usuario está autenticado y navega a la sección "${ctx.summary}"`, test_data: "Usuario con permisos: usuario_test@empresa.com", expected_result: "La pantalla principal de la funcionalidad se muestra correctamente" },
        { description: `Cuando el usuario inicia el flujo principal`, test_data: "", expected_result: "El formulario o pantalla de acción se activa correctamente" },
        { description: `Y el usuario completa parcialmente los campos del formulario`, test_data: "Datos parciales: solo los primeros campos obligatorios", expected_result: "Los campos rellenados muestran los valores introducidos" },
        { description: `Cuando el usuario selecciona la opción 'Cancelar' o navega hacia atrás`, test_data: "", expected_result: "El sistema solicita confirmación de cancelación si aplica, o cancela directamente" },
        { description: `Y el usuario confirma la cancelación`, test_data: "", expected_result: "El sistema vuelve al estado anterior sin guardar los datos parciales" },
        { description: `Entonces el usuario verifica que no se han guardado cambios`, test_data: "", expected_result: "Los datos introducidos no persisten; el sistema muestra el estado limpio anterior a la acción" },
      ],
    });

    // Minimum data flow
    tcs.push({
      flowType: "AF",
      name: `Verificar flujo con datos mínimos obligatorios en "${ctx.summary}"`,
      objective: `Validar que la funcionalidad opera correctamente completando únicamente los campos obligatorios`,
      precondition: this._buildPrecondition(ctx),
      steps: [
        { description: `Dado que el usuario está autenticado y accede a "${ctx.summary}"`, test_data: "Usuario con permisos: usuario_test@empresa.com", expected_result: "La pantalla se carga y muestra todos los campos disponibles" },
        { description: `Cuando el usuario rellena únicamente los campos obligatorios`, test_data: "Valores mínimos requeridos según especificación", expected_result: "Los campos obligatorios se completan sin errores de validación en tiempo real" },
        { description: `Y el usuario deja todos los campos opcionales vacíos`, test_data: "", expected_result: "Los campos opcionales permanecen vacíos sin bloquear la acción principal" },
        { description: `Cuando el usuario ejecuta la acción principal (guardar/enviar/confirmar)`, test_data: "", expected_result: "El sistema acepta el formulario con datos mínimos y procesa la solicitud" },
        { description: `Entonces el sistema muestra confirmación de éxito`, test_data: "", expected_result: "Se muestra mensaje de confirmación o redirección al resultado esperado" },
        { description: `Y el usuario verifica que el registro se ha creado con los datos mínimos introducidos`, test_data: "", expected_result: "El registro existe en el sistema con los campos obligatorios correctamente almacenados y los opcionales vacíos o con valor por defecto" },
      ],
    });

    // Conditional AC flows
    const conditionalAC = ctx.acItems.filter((a) => a.type === "conditional");
    for (const ac of conditionalAC) {
      tcs.push({
        flowType: "AF",
        name: `Verificar flujo alternativo: ${ac.title}`,
        objective: `Validar el comportamiento alternativo definido en el criterio: ${ac.title}`,
        precondition: this._buildPrecondition(ctx),
        steps: this._buildACSteps(ac, ctx, "AF"),
      });
    }

    // Multi-role flow (if applicable)
    if (this._detectsMultipleRoles(ctx)) {
      tcs.push({
        flowType: "AF",
        name: `Verificar acceso según rol de usuario en "${ctx.summary}"`,
        objective: `Validar que cada rol de usuario tiene el acceso y permisos correctos sobre la funcionalidad`,
        precondition: "El sistema tiene configurados usuarios con distintos roles activos",
        steps: [
          { description: `Dado que el usuario con rol básico accede a "${ctx.summary}"`, test_data: "Usuario: rol_basico@empresa.com / contraseña de test", expected_result: "El usuario accede pero solo ve las opciones permitidas para su rol" },
          { description: `Cuando el usuario básico intenta acceder a funciones restringidas`, test_data: "Intentar acceder a: [función restringida]", expected_result: "El sistema muestra mensaje de acceso denegado o no presenta la opción en la interfaz" },
          { description: `Y el usuario básico completa las acciones permitidas para su rol`, test_data: "", expected_result: "Las acciones permitidas se completan correctamente sin errores" },
          { description: `Cuando el usuario con rol administrador accede a la misma funcionalidad`, test_data: "Usuario: admin@empresa.com / contraseña de test", expected_result: "El administrador visualiza todas las opciones disponibles sin restricciones" },
          { description: `Y el administrador ejecuta una acción restringida para el rol básico`, test_data: "", expected_result: "La acción se ejecuta correctamente para el rol administrador" },
          { description: `Entonces el sistema aplica los permisos según el rol en cada caso`, test_data: "", expected_result: "Cada rol ve y puede ejecutar únicamente las acciones definidas en la matriz de permisos" },
        ],
      });
    }

    return tcs;
  }

  // ── EX — Flujo de Excepción ───────────────────────────────────────────────────

  _generateExceptionFlows(ctx) {
    const tcs = [];

    // Required field validation
    tcs.push({
      flowType: "EX",
      name: `Verificar validación de campos obligatorios en "${ctx.summary}"`,
      objective: `Validar que el sistema impide continuar y muestra mensajes de error cuando los campos obligatorios están vacíos`,
      precondition: this._buildPrecondition(ctx),
      steps: [
        { description: `Dado que el usuario está autenticado y accede a "${ctx.summary}"`, test_data: "Usuario con permisos: usuario_test@empresa.com", expected_result: "La pantalla con el formulario se carga correctamente" },
        { description: `Cuando el usuario deja todos los campos obligatorios vacíos`, test_data: "Todos los campos obligatorios sin rellenar", expected_result: "Los campos están vacíos y no muestran error hasta intentar enviar" },
        { description: `Y el usuario intenta ejecutar la acción principal sin rellenar los campos`, test_data: "", expected_result: "El sistema bloquea la acción y no procesa la solicitud" },
        { description: `Entonces el sistema muestra mensajes de error descriptivos junto a cada campo obligatorio vacío`, test_data: "", expected_result: "Cada campo obligatorio vacío muestra un mensaje de error claro indicando que es requerido" },
        { description: `Y el foco del cursor se posiciona en el primer campo con error`, test_data: "", expected_result: "El cursor se sitúa automáticamente en el primer campo obligatorio sin rellenar" },
        { description: `Cuando el usuario rellena los campos obligatorios con datos válidos y reenvía`, test_data: "Datos válidos según especificación", expected_result: "Los mensajes de error desaparecen y la acción se procesa correctamente" },
      ],
    });

    // Invalid data format
    tcs.push({
      flowType: "EX",
      name: `Verificar comportamiento con datos con formato inválido en "${ctx.summary}"`,
      objective: `Validar que el sistema rechaza datos con formato incorrecto y muestra mensajes de error apropiados sin procesar la solicitud`,
      precondition: this._buildPrecondition(ctx),
      steps: [
        { description: `Dado que el usuario está autenticado y accede al formulario de "${ctx.summary}"`, test_data: "Usuario: usuario_test@empresa.com", expected_result: "El formulario se muestra correctamente con todos sus campos" },
        { description: `Cuando el usuario introduce datos con formato inválido en los campos`, test_data: "Ejemplos: texto en campo numérico, email sin '@', fecha en formato incorrecto (ej: 32/13/2024), caracteres especiales no permitidos", expected_result: "El sistema detecta el formato incorrecto en tiempo real o al enviar" },
        { description: `Y el usuario intenta guardar o enviar el formulario con datos inválidos`, test_data: "", expected_result: "El sistema bloquea el envío y no procesa la solicitud" },
        { description: `Entonces el sistema muestra mensajes de error de validación junto a cada campo con formato incorrecto`, test_data: "", expected_result: "Los mensajes indican el formato esperado (ej: 'Introduce un email válido', 'Solo se permiten números')" },
        { description: `Cuando el usuario corrige los datos introduciendo valores con formato válido`, test_data: "Datos corregidos con formato correcto", expected_result: "Los mensajes de error de formato desaparecen al corregir cada campo" },
        { description: `Entonces el usuario completa la acción principal con datos válidos y el sistema procesa correctamente`, test_data: "", expected_result: "La acción se completa con éxito y el sistema confirma el resultado esperado" },
      ],
    });

    // Server/service error
    tcs.push({
      flowType: "EX",
      name: `Verificar manejo de error de servidor/servicio en "${ctx.summary}"`,
      objective: `Validar que el sistema gestiona correctamente errores del servidor y muestra mensajes amigables sin exponer información técnica`,
      precondition: `${this._buildPrecondition(ctx)} El entorno de test está configurado para simular errores de servidor (error 500 o timeout).`,
      steps: [
        { description: `Dado que el usuario está autenticado y ha completado el formulario de "${ctx.summary}" con datos válidos`, test_data: "Datos válidos completos; servidor configurado para devolver error 500 o timeout", expected_result: "El formulario muestra los datos correctos listos para enviar" },
        { description: `Cuando el usuario ejecuta la acción principal y el servidor devuelve un error`, test_data: "Simular: error HTTP 500, timeout de red o servicio no disponible", expected_result: "El sistema detecta el error del servidor durante el procesamiento" },
        { description: `Entonces el sistema muestra un mensaje de error amigable al usuario`, test_data: "", expected_result: "Se muestra un mensaje descriptivo (ej: 'Ha ocurrido un error. Por favor, inténtalo de nuevo.') sin exponer códigos técnicos ni stack traces" },
        { description: `Y el sistema ofrece al usuario la opción de reintentar la operación`, test_data: "", expected_result: "Existe un botón o enlace de reintento visible y accesible" },
        { description: `Cuando el servidor se recupera y el usuario reintenta la operación`, test_data: "Servidor restaurado al estado normal", expected_result: "La operación se procesa correctamente en el reintento" },
        { description: `Entonces el sistema confirma el éxito de la operación y muestra el resultado esperado`, test_data: "", expected_result: "El resultado es el mismo que en el flujo principal sin errores; los datos se han guardado correctamente" },
      ],
    });

    // Duplicate / business rule violation
    tcs.push({
      flowType: "EX",
      name: `Verificar manejo de duplicados y reglas de negocio en "${ctx.summary}"`,
      objective: `Validar que el sistema detecta y previene la creación de registros duplicados y el incumplimiento de reglas de negocio`,
      precondition: `${this._buildPrecondition(ctx)} Existe al menos un registro previo en el sistema con datos conocidos.`,
      steps: [
        { description: `Dado que existe un registro previo en el sistema con datos conocidos`, test_data: "Registro existente con identificador único conocido (ej: mismo nombre, código o email)", expected_result: "El registro previo existe y está activo en el sistema" },
        { description: `Cuando el usuario intenta crear un nuevo registro con los mismos datos únicos`, test_data: "Datos idénticos al registro existente (mismo identificador único)", expected_result: "El sistema detecta la duplicidad antes o durante el procesamiento" },
        { description: `Entonces el sistema rechaza la creación y muestra un mensaje de error de duplicado`, test_data: "", expected_result: "Se muestra un mensaje claro indicando que el registro ya existe (ej: 'Ya existe un registro con este nombre/código')" },
        { description: `Y el sistema no crea el registro duplicado en la base de datos`, test_data: "", expected_result: "Verificado: solo existe un registro con ese identificador único en el sistema" },
        { description: `Cuando el usuario modifica los datos duplicados por valores únicos y válidos`, test_data: "Nuevo identificador único diferente al existente", expected_result: "El sistema acepta los nuevos datos sin error de duplicado" },
        { description: `Entonces el sistema crea el nuevo registro correctamente y confirma el resultado`, test_data: "", expected_result: "El nuevo registro se crea exitosamente y aparece en el sistema con los datos únicos introducidos" },
      ],
    });

    // Permissions / insufficient access
    tcs.push({
      flowType: "EX",
      name: `Verificar control de acceso con permisos insuficientes en "${ctx.summary}"`,
      objective: `Validar que el sistema impide el acceso a la funcionalidad a usuarios sin los permisos necesarios`,
      precondition: "Existe un usuario sin permisos para acceder a la funcionalidad bajo prueba",
      steps: [
        { description: `Dado que el usuario sin permisos intenta acceder a "${ctx.summary}"`, test_data: "Usuario sin permisos: sin_permisos@empresa.com", expected_result: "El sistema evalúa los permisos del usuario" },
        { description: `Cuando el sistema verifica que el usuario no tiene los permisos necesarios`, test_data: "", expected_result: "El acceso es denegado antes de cargar la funcionalidad" },
        { description: `Entonces el sistema muestra un mensaje de acceso no autorizado`, test_data: "", expected_result: "Se muestra mensaje claro (ej: 'No tienes permisos para acceder a esta funcionalidad') o redirección a página de error 403" },
        { description: `Y el sistema no expone datos ni funcionalidades de la pantalla restringida`, test_data: "", expected_result: "Ningún dato de la funcionalidad restringida es visible ni accesible para el usuario sin permisos" },
        { description: `Cuando el usuario con permisos correctos accede a la misma funcionalidad`, test_data: "Usuario con permisos: usuario_test@empresa.com", expected_result: "El acceso se concede y la funcionalidad se muestra correctamente" },
        { description: `Entonces el sistema permite el acceso completo según los permisos asignados al rol`, test_data: "", expected_result: "Todas las opciones y datos de la funcionalidad son accesibles para el usuario autorizado" },
      ],
    });

    // Negative AC flows
    const negativeAC = ctx.acItems.filter((a) => a.type === "negative");
    for (const ac of negativeAC) {
      tcs.push({
        flowType: "EX",
        name: `Verificar excepción: ${ac.title}`,
        objective: `Validar el comportamiento de excepción definido en el criterio: ${ac.title}`,
        precondition: this._buildPrecondition(ctx),
        steps: this._buildACSteps(ac, ctx, "EX"),
      });
    }

    return tcs;
  }

  // ── Step builders ─────────────────────────────────────────────────────────────

  _buildPrecondition(ctx) {
    return `El usuario tiene acceso al sistema y está autenticado correctamente. La funcionalidad "${ctx.storyKey}: ${ctx.summary}" está disponible y accesible en el entorno de prueba.`;
  }

  _buildMainFlowSteps(ctx) {
    const steps = [
      {
        description: `Dado que el usuario está autenticado en el sistema con credenciales válidas`,
        test_data: "Usuario de prueba: usuario_test@empresa.com con permisos adecuados para la funcionalidad",
        expected_result: "El usuario accede al sistema correctamente y visualiza la pantalla principal",
      },
      {
        description: `Cuando el usuario navega a la sección "${ctx.summary}"`,
        test_data: "",
        expected_result: "La sección se muestra completamente con todos sus elementos: campos, botones y etiquetas visibles y activos",
      },
      {
        description: `Y el usuario verifica que todos los elementos de la interfaz están presentes y accesibles`,
        test_data: "",
        expected_result: "Todos los elementos definidos en la especificación están presentes, son interactivos y no muestran errores",
      },
      {
        description: `Cuando el usuario completa el flujo principal con datos válidos`,
        test_data: "Datos de prueba válidos según especificación de la historia",
        expected_result: "El sistema acepta todos los datos introducidos sin mostrar errores de validación",
      },
      {
        description: `Y el usuario confirma o ejecuta la acción principal`,
        test_data: "",
        expected_result: "El sistema procesa la solicitud y muestra indicador de progreso si corresponde",
      },
      {
        description: `Entonces el sistema confirma el éxito de la operación`,
        test_data: "",
        expected_result: "Se muestra mensaje de confirmación de éxito o redirección al resultado esperado",
      },
      {
        description: `Y el resultado final cumple con todos los criterios de aceptación de la historia`,
        test_data: "",
        expected_result: "El resultado almacenado o mostrado coincide exactamente con lo definido en los criterios de aceptación",
      },
    ];

    // Add specific AC verification steps
    for (const ac of ctx.acItems.slice(0, 2)) {
      steps.push({
        description: `Y el usuario verifica el criterio: ${ac.title}`,
        test_data: ac.testData || "",
        expected_result: ac.expected || ac.title,
      });
    }

    return steps;
  }

  _buildACSteps(ac, ctx, flowType) {
    const isException = flowType === "EX";
    return [
      {
        description: `Dado que el usuario está autenticado y accede a "${ctx.summary}"`,
        test_data: "Usuario con permisos: usuario_test@empresa.com",
        expected_result: "La funcionalidad se muestra correctamente",
      },
      {
        description: `Y el usuario verifica el contexto necesario para: ${ac.title}`,
        test_data: ac.testData || "Datos de contexto según criterio de aceptación",
        expected_result: "El contexto y las condiciones previas están correctamente establecidos",
      },
      {
        description: `Cuando el usuario prepara las condiciones para: ${ac.title}`,
        test_data: ac.testData || "Datos de entrada definidos en el criterio",
        expected_result: "Las condiciones están preparadas y el sistema está listo para ejecutar el criterio",
      },
      {
        description: `Y el usuario ejecuta la acción correspondiente al criterio: ${ac.condition || ac.title}`,
        test_data: ac.testData || "",
        expected_result: isException ? "El sistema detecta la condición de excepción o error" : "La acción se ejecuta sin errores",
      },
      {
        description: isException
          ? `Entonces el sistema muestra el comportamiento de error/excepción esperado`
          : `Entonces el sistema muestra el resultado esperado para el criterio`,
        test_data: "",
        expected_result: ac.expected || (isException
          ? "El sistema gestiona correctamente la excepción según la especificación"
          : "El sistema se comporta según el criterio de aceptación definido"),
      },
      {
        description: `Y el usuario confirma que el comportamiento cumple con la especificación del criterio`,
        test_data: "",
        expected_result: `El criterio "${ac.title}" queda verificado y cumplido según la especificación de la historia ${ctx.storyKey}`,
      },
    ];
  }

  _buildScreenSteps(screen, ctx) {
    return [
      {
        description: `Dado que el usuario está autenticado y navega a la pantalla "${screen.name}"`,
        test_data: "Usuario con permisos: usuario_test@empresa.com",
        expected_result: `La pantalla "${screen.name}" se carga completamente sin errores`,
      },
      {
        description: `Cuando el usuario verifica todos los elementos visuales de la pantalla`,
        test_data: "Resolución estándar: 1920x1080",
        expected_result: "Todos los elementos del diseño están presentes, correctamente posicionados y con el estilo esperado",
      },
      {
        description: `Y el usuario verifica la responsividad en diferentes resoluciones`,
        test_data: "Resoluciones a probar: 1920x1080 (desktop), 768x1024 (tablet), 375x812 (móvil)",
        expected_result: "La pantalla se adapta correctamente a cada resolución sin pérdida de contenido ni superposición de elementos",
      },
      {
        description: `Cuando el usuario interactúa con los elementos interactivos de la pantalla`,
        test_data: "Botones, enlaces, campos de formulario y controles de la pantalla",
        expected_result: "Todos los elementos interactivos responden correctamente al click/tap sin errores de consola",
      },
      {
        description: `Y el usuario verifica la accesibilidad básica de la pantalla`,
        test_data: "Herramienta: navegación por teclado (Tab) y lector de pantalla",
        expected_result: "Los elementos tienen etiquetas ARIA apropiadas, el orden de tabulación es lógico y el contraste de color cumple WCAG AA",
      },
      {
        description: `Entonces la pantalla cumple con los requisitos visuales y funcionales definidos en el diseño`,
        test_data: "",
        expected_result: `La pantalla "${screen.name}" está implementada correctamente según el diseño de referencia y todos los criterios de aceptación visuales están cumplidos`,
      },
    ];
  }

  // ── AC Parser ─────────────────────────────────────────────────────────────────

  _parseAcceptanceCriteria(text) {
    const items = [];
    if (!text) return items;

    const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);

    for (const line of lines) {
      const cleanLine = line.replace(/^[-*•·\d+\.]\s*/, "").trim();
      if (!cleanLine || cleanLine.length < 5) continue;

      let type = "positive";
      if (/\bno\b|debe\s+impedir|error|fallo|inválid|incorrecto|deneg|bloqu|rechaz|prohib/i.test(cleanLine)) {
        type = "negative";
      } else if (/cuando|si\s|en\s+caso\s+de|opcionalmente|puede|podría/i.test(cleanLine)) {
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

    return items.slice(0, 10);
  }

  _parseBusinessRules(text) {
    if (!text) return [];
    const rules = [];
    const matches = text.match(/RN[-_]?\d+[^\n]*/gi) || [];
    for (const match of matches) {
      rules.push(match.trim());
    }
    return rules.slice(0, 5);
  }

  _extractAcceptanceCriteria(fields) {
    const acFields = [
      "customfield_10014",
      "customfield_10000",
      "customfield_10500",
      "acceptance_criteria",
    ];

    for (const field of acFields) {
      if (fields[field]) {
        return this._extractText(fields[field]);
      }
    }

    const desc = this._extractText(fields.description);
    const acMatch = desc.match(/criterios?\s+de\s+aceptaci[oó]n[:\s]*([\s\S]+?)(?:\n\n|$)/i);
    return acMatch ? acMatch[1] : "";
  }

  _extractText(node) {
    if (!node) return "";
    if (typeof node === "string") return node;

    if (["doc", "blockquote", "paragraph", "bulletList", "orderedList"].includes(node.type)) {
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
