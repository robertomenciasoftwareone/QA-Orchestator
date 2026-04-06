import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

import { ConfluenceClient } from "./clients/confluence.js";
import { FigmaClient } from "./clients/figma.js";
import { JiraClient } from "./clients/jira.js";
import { ZephyrClient } from "./clients/zephyr.js";
import { PlaywrightRunner } from "./playwright/runner.js";
import { GherkinGenerator } from "./qa/gherkin-generator.js";
import { TCGenerator } from "./qa/tc-generator.js";

// ─── Config (tokens added via .env or mcp settings) ───────────────────────────
const CONFIG = {
  jira: {
    baseUrl: process.env.JIRA_BASE_URL || "",
    email: process.env.JIRA_EMAIL || "",
    token: process.env.JIRA_API_TOKEN || "",
  },
  confluence: {
    baseUrl: process.env.CONFLUENCE_BASE_URL || "",
    email: process.env.CONFLUENCE_EMAIL || "",
    token: process.env.CONFLUENCE_API_TOKEN || "",
  },
  figma: {
    token: process.env.FIGMA_TOKEN || "",
    fileKey: process.env.FIGMA_FILE_KEY || "",
  },
  zephyr: {
    baseUrl: process.env.JIRA_BASE_URL || "", // Zephyr lives inside Jira
    token: process.env.ZEPHYR_API_TOKEN || "",
    accountId: process.env.ZEPHYR_ACCOUNT_ID || "",
    projectKey: process.env.JIRA_PROJECT_KEY || "",
  },
};

// ─── Clients ───────────────────────────────────────────────────────────────────
const jira = new JiraClient(CONFIG.jira);
const confluence = new ConfluenceClient(CONFIG.confluence);
const figma = new FigmaClient(CONFIG.figma);
const zephyr = new ZephyrClient(CONFIG.zephyr);
const playwright = new PlaywrightRunner();
const tcGenerator = new TCGenerator();
const gherkin = new GherkinGenerator();

// ─── MCP Server ───────────────────────────────────────────────────────────────
const server = new Server(
  { name: "qa-orchestrator-mcp", version: "1.0.0" },
  { capabilities: { tools: {} } }
);

// ─── Tool definitions ─────────────────────────────────────────────────────────
server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    // ── JIRA ──
    {
      name: "jira_get_story",
      description: "Get a Jira story/issue details including description, acceptance criteria and linked Confluence/Figma pages",
      inputSchema: {
        type: "object",
        properties: {
          issue_key: { type: "string", description: "Jira issue key, e.g. ESCPIC-187" },
        },
        required: ["issue_key"],
      },
    },
    {
      name: "jira_get_linked_pages",
      description: "Get all linked pages (Confluence, Figma, etc.) from a Jira issue",
      inputSchema: {
        type: "object",
        properties: {
          issue_key: { type: "string" },
        },
        required: ["issue_key"],
      },
    },

    // ── CONFLUENCE ──
    {
      name: "confluence_get_page",
      description: "Get a Confluence page content by page ID or URL",
      inputSchema: {
        type: "object",
        properties: {
          page_id: { type: "string", description: "Confluence page ID" },
          url: { type: "string", description: "Full Confluence page URL (alternative to page_id)" },
        },
      },
    },
    {
      name: "confluence_search",
      description: "Search Confluence for pages related to a topic",
      inputSchema: {
        type: "object",
        properties: {
          query: { type: "string" },
          space_key: { type: "string", description: "Optional space key to scope the search" },
        },
        required: ["query"],
      },
    },

    // ── FIGMA ──
    {
      name: "figma_get_file",
      description: "Get Figma file details, screens and components for a given file key or URL",
      inputSchema: {
        type: "object",
        properties: {
          file_key: { type: "string", description: "Figma file key (from URL)" },
          url: { type: "string", description: "Full Figma URL (alternative)" },
        },
      },
    },
    {
      name: "figma_get_components",
      description: "List all components/frames from a Figma file to understand UI flows",
      inputSchema: {
        type: "object",
        properties: {
          file_key: { type: "string" },
        },
        required: ["file_key"],
      },
    },

    // ── ZEPHYR SCALE ──
    {
      name: "zephyr_create_test_case",
      description: "Create a single test case in Zephyr Scale with Step-by-Step script",
      inputSchema: {
        type: "object",
        properties: {
          project_key: { type: "string" },
          name: { type: "string", description: "Test case name (will be prefixed with flow type)" },
          flow_type: {
            type: "string",
            enum: ["MF", "AF", "EX"],
            description: "MF=Flujo Principal, AF=Flujo Alternativo, EX=Flujo Excepción",
          },
          folder: { type: "string", description: "Folder path inside Zephyr Scale" },
          steps: {
            type: "array",
            items: {
              type: "object",
              properties: {
                description: { type: "string" },
                test_data: { type: "string" },
                expected_result: { type: "string" },
              },
              required: ["description", "expected_result"],
            },
          },
          labels: { type: "array", items: { type: "string" }, description: "Labels to assign" },
          precondition: { type: "string" },
          objective: { type: "string" },
          story_key: { type: "string", description: "Jira story key to link the TC to" },
        },
        required: ["project_key", "name", "flow_type", "steps"],
      },
    },
    {
      name: "zephyr_create_test_cases_from_story",
      description: "MAIN TOOL: Reads a Jira story + Confluence page + Figma designs and auto-generates ALL test cases in Zephyr Scale organized by MF/AF/EX flows with Step-by-Step scripts",
      inputSchema: {
        type: "object",
        properties: {
          issue_key: { type: "string", description: "Jira story key, e.g. ESCPIC-187" },
          folder: { type: "string", description: "Zephyr Scale folder where TCs will be created" },
          extra_labels: {
            type: "array",
            items: { type: "string" },
            description: "Additional labels (TC_GENERATED_BY_IA and POR_REVISAR are always added)",
          },
          include_playwright: {
            type: "boolean",
            default: false,
            description: "Also generate Playwright test scripts for each TC",
          },
        },
        required: ["issue_key", "folder"],
      },
    },
    {
      name: "zephyr_get_test_cases",
      description: "Get test cases from Zephyr Scale for a project or folder",
      inputSchema: {
        type: "object",
        properties: {
          project_key: { type: "string" },
          folder: { type: "string" },
          label: { type: "string" },
        },
        required: ["project_key"],
      },
    },
    {
      name: "zephyr_export_test_cases",
      description: "Export test cases as JSON/CSV ready for Zephyr Scale import",
      inputSchema: {
        type: "object",
        properties: {
          issue_key: { type: "string", description: "Jira story key to generate TCs from" },
          folder: { type: "string" },
          format: { type: "string", enum: ["json", "csv"], default: "json" },
        },
        required: ["issue_key"],
      },
    },
    {
      name: "zephyr_list_folders",
      description: "List available folders in Zephyr Scale for a project",
      inputSchema: {
        type: "object",
        properties: {
          project_key: { type: "string" },
        },
        required: ["project_key"],
      },
    },

    // ── PLAYWRIGHT ──
    {
      name: "playwright_run_test",
      description: "Execute a Playwright test script and return results",
      inputSchema: {
        type: "object",
        properties: {
          script: { type: "string", description: "Playwright test script code" },
          url: { type: "string", description: "Base URL to test against" },
          browser: { type: "string", enum: ["chromium", "firefox", "webkit"], default: "chromium" },
          headless: { type: "boolean", default: true },
        },
        required: ["script"],
      },
    },
    {
      name: "playwright_generate_from_gherkin",
      description: "Generate and run a Playwright test from Gherkin/BDD feature steps (Hercules-style)",
      inputSchema: {
        type: "object",
        properties: {
          feature: { type: "string", description: "Gherkin feature text (Feature + Scenario + steps)" },
          url: { type: "string", description: "Base URL of the application" },
          browser: { type: "string", enum: ["chromium", "firefox", "webkit"], default: "chromium" },
          headless: { type: "boolean", default: true },
          record_video: { type: "boolean", default: false },
          take_screenshots: { type: "boolean", default: true },
        },
        required: ["feature", "url"],
      },
    },
    {
      name: "playwright_generate_script_from_tc",
      description: "Generate a Playwright test script from a Zephyr Scale test case (Step-by-Step format)",
      inputSchema: {
        type: "object",
        properties: {
          test_case_key: { type: "string", description: "Zephyr test case key" },
          url: { type: "string", description: "Base URL to test against" },
        },
        required: ["test_case_key", "url"],
      },
    },
    {
      name: "playwright_accessibility_audit",
      description: "Run an accessibility audit (WCAG 2.0/2.1) on a page using Playwright + axe-core",
      inputSchema: {
        type: "object",
        properties: {
          url: { type: "string" },
          wcag_level: { type: "string", enum: ["A", "AA", "AAA"], default: "AA" },
        },
        required: ["url"],
      },
    },
    {
      name: "playwright_visual_snapshot",
      description: "Take screenshots/visual snapshots of a page for visual regression testing",
      inputSchema: {
        type: "object",
        properties: {
          url: { type: "string" },
          full_page: { type: "boolean", default: true },
          mobile: { type: "boolean", default: false },
          device: { type: "string", description: "Device to emulate, e.g. 'iPhone 15 Pro Max'" },
        },
        required: ["url"],
      },
    },

    // ── GHERKIN / BDD ──
    {
      name: "generate_gherkin_from_story",
      description: "Generate Gherkin BDD feature file from a Jira story (ready for Hercules/Playwright)",
      inputSchema: {
        type: "object",
        properties: {
          issue_key: { type: "string" },
          include_negative: { type: "boolean", default: true },
          include_edge_cases: { type: "boolean", default: true },
        },
        required: ["issue_key"],
      },
    },

    // ── TC GENERATION (local, no Zephyr) ──
    {
      name: "generate_test_cases_preview",
      description: "Generate and preview all test cases from a Jira story without creating them in Zephyr (useful for review before publishing)",
      inputSchema: {
        type: "object",
        properties: {
          issue_key: { type: "string" },
          include_gherkin: { type: "boolean", default: false },
        },
        required: ["issue_key"],
      },
    },
  ],
}));

// ─── Tool handlers ────────────────────────────────────────────────────────────
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    switch (name) {
      // ── JIRA ──
      case "jira_get_story": {
        const story = await jira.getIssue(args.issue_key);
        return { content: [{ type: "text", text: JSON.stringify(story, null, 2) }] };
      }

      case "jira_get_linked_pages": {
        const links = await jira.getLinkedPages(args.issue_key);
        return { content: [{ type: "text", text: JSON.stringify(links, null, 2) }] };
      }

      // ── CONFLUENCE ──
      case "confluence_get_page": {
        const page = args.url
          ? await confluence.getPageByUrl(args.url)
          : await confluence.getPage(args.page_id);
        return { content: [{ type: "text", text: JSON.stringify(page, null, 2) }] };
      }

      case "confluence_search": {
        const results = await confluence.search(args.query, args.space_key);
        return { content: [{ type: "text", text: JSON.stringify(results, null, 2) }] };
      }

      // ── FIGMA ──
      case "figma_get_file": {
        const key = args.file_key || extractFigmaKey(args.url) || CONFIG.figma.fileKey;
        const file = await figma.getFile(key);
        return { content: [{ type: "text", text: JSON.stringify(file, null, 2) }] };
      }

      case "figma_get_components": {
        const key = args.file_key || CONFIG.figma.fileKey;
        const components = await figma.getComponents(key);
        return { content: [{ type: "text", text: JSON.stringify(components, null, 2) }] };
      }

      // ── ZEPHYR ──
      case "zephyr_create_test_case": {
        const tc = await zephyr.createTestCase({
          projectKey: args.project_key,
          name: `[${args.flow_type}] ${args.name}`,
          folder: args.folder,
          steps: args.steps,
          labels: [...(args.labels || []), "TC_GENERATED_BY_IA", "POR_REVISAR"],
          precondition: args.precondition,
          objective: args.objective,
          storyKey: args.story_key,
        });
        return { content: [{ type: "text", text: JSON.stringify(tc, null, 2) }] };
      }

      case "zephyr_create_test_cases_from_story": {
        const result = await handleCreateTCsFromStory(args);
        return { content: [{ type: "text", text: result }] };
      }

      case "zephyr_get_test_cases": {
        const tcs = await zephyr.getTestCases(args.project_key, args.folder, args.label);
        return { content: [{ type: "text", text: JSON.stringify(tcs, null, 2) }] };
      }

      case "zephyr_export_test_cases": {
        const exported = await handleExportTCs(args);
        return { content: [{ type: "text", text: exported }] };
      }

      case "zephyr_list_folders": {
        const folders = await zephyr.listFolders(args.project_key);
        return { content: [{ type: "text", text: JSON.stringify(folders, null, 2) }] };
      }

      // ── PLAYWRIGHT ──
      case "playwright_run_test": {
        const result = await playwright.runScript(args.script, { url: args.url, browser: args.browser, headless: args.headless });
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      }

      case "playwright_generate_from_gherkin": {
        const result = await playwright.runGherkin(args.feature, {
          url: args.url,
          browser: args.browser,
          headless: args.headless,
          recordVideo: args.record_video,
          takeScreenshots: args.take_screenshots,
        });
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      }

      case "playwright_generate_script_from_tc": {
        const tc = await zephyr.getTestCase(args.test_case_key);
        const script = playwright.generateScriptFromTC(tc, args.url);
        return { content: [{ type: "text", text: script }] };
      }

      case "playwright_accessibility_audit": {
        const result = await playwright.accessibilityAudit(args.url, args.wcag_level);
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      }

      case "playwright_visual_snapshot": {
        const result = await playwright.visualSnapshot(args.url, {
          fullPage: args.full_page,
          mobile: args.mobile,
          device: args.device,
        });
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      }

      // ── GHERKIN ──
      case "generate_gherkin_from_story": {
        const story = await jira.getIssue(args.issue_key);
        const links = await jira.getLinkedPages(args.issue_key);
        let confluenceContent = null;
        if (links.confluence?.length) {
          confluenceContent = await confluence.getPage(links.confluence[0].id);
        }
        const feature = gherkin.generate(story, confluenceContent, {
          includeNegative: args.include_negative,
          includeEdgeCases: args.include_edge_cases,
        });
        return { content: [{ type: "text", text: feature }] };
      }

      // ── TC PREVIEW ──
      case "generate_test_cases_preview": {
        const preview = await handleGeneratePreview(args);
        return { content: [{ type: "text", text: preview }] };
      }

      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  } catch (err) {
    return {
      content: [{ type: "text", text: `ERROR: ${err.message}\n${err.stack || ""}` }],
      isError: true,
    };
  }
});

// ─── Orchestration helpers ────────────────────────────────────────────────────

async function handleCreateTCsFromStory(args) {
  const log = [];
  const labels = ["TC_GENERATED_BY_IA", "POR_REVISAR", ...(args.extra_labels || [])];
  const projectKey = CONFIG.zephyr.projectKey || args.issue_key.split("-")[0];

  // ── PASO 1: Recopilación de información ────────────────────────────────────
  log.push(`📋 PASO 1 — Recopilando información`);
  log.push(`   Story Jira: ${args.issue_key}`);
  const story = await jira.getIssue(args.issue_key);
  const storyLabels = (story.fields?.labels || []).join(", ") || "(sin labels)";
  const subtasks = (story.fields?.subtasks || []).map((s) => s.key).join(", ") || "(sin subtareas)";
  log.push(`   ✅ Story: ${story.fields?.summary}`);
  log.push(`   Labels Jira: ${storyLabels}`);
  log.push(`   Subtareas: ${subtasks}`);

  const links = await jira.getLinkedPages(args.issue_key);

  let confluenceContent = null;
  if (links.confluence?.length) {
    log.push(`   📄 Confluence: ${links.confluence[0].title}`);
    confluenceContent = await confluence.getPage(links.confluence[0].id);
    log.push(`   ✅ Confluence cargado (${confluenceContent.text?.length || 0} chars)`);
  }

  let figmaData = null;
  if (links.figma?.length) {
    log.push(`   🎨 Figma: ${links.figma[0].url}`);
    const figmaKey = extractFigmaKey(links.figma[0].url);
    figmaData = await figma.getComponents(figmaKey);
  }

  // ── PASO 2: Generación de TCs ──────────────────────────────────────────────
  log.push(`\n🧠 PASO 2 — Generando casos de prueba`);
  const testCases = tcGenerator.generate(story, confluenceContent, figmaData);
  const mfCount = testCases.filter((t) => t.flowType === "MF").length;
  const afCount = testCases.filter((t) => t.flowType === "AF").length;
  const exCount = testCases.filter((t) => t.flowType === "EX").length;
  log.push(`   MF (Flujo Principal):  ${mfCount}`);
  log.push(`   AF (Flujo Alternativo): ${afCount}`);
  log.push(`   EX (Flujo Excepción):  ${exCount}`);
  log.push(`   Total: ${testCases.length} TCs`);

  // ── PASO 3: Carpeta en Zephyr ──────────────────────────────────────────────
  log.push(`\n📁 PASO 3 — Carpeta Zephyr: "${args.folder}"`);
  let folderId = null;
  try {
    // 3.1 Listar carpetas existentes
    const existingFolders = await zephyr.listFolders(projectKey);
    const allFolders = existingFolders.values || [];
    log.push(`   📂 Carpetas existentes (${allFolders.length}): ${allFolders.map(f => `"${f.name}"(${f.id})`).join(", ") || "ninguna"}`);

    // 3.2 Buscar o crear
    const folderResult = await zephyr.getOrCreateFolder(projectKey, args.folder);
    folderId = folderResult.id;
    log.push(`   ✅ Carpeta lista — nombre: "${folderResult.name}", id: ${folderId}`);
  } catch (err) {
    log.push(`   ❌ ERROR creando carpeta: ${err.message}`);
    if (err.response) {
      log.push(`   HTTP ${err.response.status}: ${JSON.stringify(err.response.data)}`);
    }
    log.push(`   ⚠️  Los TCs se crearán SIN carpeta — revisar permisos Zephyr.`);
  }

  // ── PASO 4: Creación de TCs + pasos ───────────────────────────────────────
  log.push(`\n⚙️  PASO 4 — Creando TCs en Zephyr Scale`);
  const created = [];
  const failed = [];

  for (const tc of testCases) {
    const tcName = `[${tc.flowType}] ${tc.name}`;
    try {
      // 4a. Crear shell del TC (sin pasos)
      const result = await zephyr.createTestCase({
        projectKey,
        name: tcName,
        folderId,
        labels,
        precondition: tc.precondition,
        objective: tc.objective,
        storyKey: args.issue_key,
      });
      const key = result.key;

      // 4b. Insertar pasos en llamada separada (obligatorio)
      try {
        await zephyr.insertSteps(key, tc.steps);
        log.push(`   ✅ ${key} — ${tcName} (${tc.steps.length} pasos insertados)`);
      } catch (stepsErr) {
        const detail = stepsErr.response ? `HTTP ${stepsErr.response.status}: ${JSON.stringify(stepsErr.response.data)}` : stepsErr.message;
        log.push(`   ⚠️  ${key} creado PERO fallo al insertar pasos: ${detail}`);
      }

      created.push({ key, name: tcName, flowType: tc.flowType, steps: tc.steps.length });
    } catch (err) {
      failed.push({ name: tcName, flowType: tc.flowType, error: err.message });
      log.push(`   ❌ FAILED — ${tcName}: ${err.message}`);
    }
  }

  // Reintentar fallidos una vez
  if (failed.length > 0) {
    log.push(`\n🔁 Reintentando ${failed.length} TCs fallidos...`);
    const stillFailed = [];
    for (const f of failed) {
      const tc = testCases.find((t) => `[${t.flowType}] ${t.name}` === f.name);
      if (!tc) continue;
      try {
        const result = await zephyr.createTestCase({
          projectKey,
          name: f.name,
          folderId,
          labels,
          precondition: tc.precondition,
          objective: tc.objective,
          storyKey: args.issue_key,
        });
        await zephyr.insertSteps(result.key, tc.steps);
        created.push({ key: result.key, name: f.name, flowType: tc.flowType, steps: tc.steps.length });
        log.push(`   ✅ Reintento OK: ${result.key}`);
      } catch (err2) {
        stillFailed.push({ ...f, error: err2.message });
        log.push(`   ❌ Sigue fallando: ${f.name}`);
      }
    }
    failed.length = 0;
    failed.push(...stillFailed);
  }

  // ── PASO 5: Verificación final ─────────────────────────────────────────────
  log.push(`\n✅ PASO 5 — Verificación final`);

  // 5a. Confirm folder
  if (folderId) {
    log.push(`   📁 Carpeta "${args.folder}" creada/encontrada correctamente (id: ${folderId})`);
  } else {
    log.push(`   ⚠️  TCs creados sin carpeta (no se pudo obtener el ID)`);
  }

  // 5b. Verify labels on a sample TC
  if (created.length > 0) {
    try {
      const sample = await zephyr.getTestCase(created[0].key);
      const savedLabels = sample.labels || [];
      const labelsOk = labels.every((l) => savedLabels.includes(l));
      log.push(`   🏷️  Labels verificados en ${created[0].key}: ${savedLabels.join(", ")} ${labelsOk ? "✅" : "⚠️ (algunos labels no se guardaron)"}`);
    } catch {
      log.push(`   🏷️  Labels enviados: ${labels.join(", ")} (no se pudo verificar)`);
    }
  }

  // 5c. Confirm steps inserted
  const withSteps = created.filter((t) => t.steps > 0);
  log.push(`   📝 Pasos insertados: ${withSteps.length}/${created.length} TCs con pasos`);

  // 5d. Summary table (Markdown)
  log.push(`\n## Resumen de ejecución — ${args.issue_key} → Carpeta: \`${args.folder}\``);
  log.push(`\n| Clave | Nombre del TC | Flujo | Nº Pasos | Estado |`);
  log.push(`|-------|---------------|-------|----------|--------|`);

  for (const tc of created) {
    const name = tc.name.length > 55 ? tc.name.substring(0, 52) + "..." : tc.name;
    log.push(`| ${tc.key} | ${name} | ${tc.flowType} | ${tc.steps} | ✅ OK |`);
  }
  for (const tc of failed) {
    const name = tc.name.length > 55 ? tc.name.substring(0, 52) + "..." : tc.name;
    log.push(`| ERROR | ${name} | ${tc.flowType} | – | ❌ ${tc.error.substring(0, 40)} |`);
  }

  log.push(`\n**Total:** ${created.length}/${testCases.length} TCs creados`);
  log.push(`**Labels aplicados:** ${labels.join(", ")}`);
  log.push(`**Claves asignadas:** ${created.map((t) => t.key).join(", ") || "–"}`);

  return log.join("\n");
}

async function handleExportTCs(args) {
  const story = await jira.getIssue(args.issue_key);
  const links = await jira.getLinkedPages(args.issue_key);

  let confluenceContent = null;
  if (links.confluence?.length) {
    confluenceContent = await confluence.getPage(links.confluence[0].id);
  }

  const testCases = tcGenerator.generate(story, confluenceContent, null);
  const labels = ["TC_GENERATED_BY_IA", "POR_REVISAR"];

  const exportData = testCases.map((tc) => ({
    name: `[${tc.flowType}] ${tc.name}`,
    objective: tc.objective,
    precondition: tc.precondition,
    labels: labels.join(", "),
    folder: args.folder || "/GeneratedTC",
    status: "Draft",
    steps: tc.steps,
  }));

  if (args.format === "csv") {
    const rows = ["name,objective,precondition,labels,folder,status,step_description,step_data,step_expected"];
    for (const tc of exportData) {
      for (const step of tc.steps) {
        rows.push(
          [tc.name, tc.objective, tc.precondition, tc.labels, tc.folder, tc.status, step.description, step.test_data || "", step.expected_result]
            .map((v) => `"${(v || "").replace(/"/g, '""')}"`)
            .join(",")
        );
      }
    }
    return rows.join("\n");
  }

  return JSON.stringify(exportData, null, 2);
}

async function handleGeneratePreview(args) {
  const story = await jira.getIssue(args.issue_key);
  const links = await jira.getLinkedPages(args.issue_key);

  let confluenceContent = null;
  if (links.confluence?.length) {
    confluenceContent = await confluence.getPage(links.confluence[0].id);
  }

  const testCases = tcGenerator.generate(story, confluenceContent, null);
  const lines = [`# Test Cases Preview for ${args.issue_key}: ${story.fields?.summary}\n`];

  for (const flowType of ["MF", "AF", "EX"]) {
    const flowLabel = { MF: "Flujo Principal", AF: "Flujo Alternativo", EX: "Flujo Excepción" }[flowType];
    const tcs = testCases.filter((t) => t.flowType === flowType);
    if (!tcs.length) continue;

    lines.push(`\n## [${flowType}] ${flowLabel} (${tcs.length} TCs)\n`);
    for (const tc of tcs) {
      lines.push(`### [${flowType}] ${tc.name}`);
      lines.push(`**Objetivo:** ${tc.objective}`);
      if (tc.precondition) lines.push(`**Precondición:** ${tc.precondition}`);
      lines.push(`\n**Steps:**`);
      tc.steps.forEach((s, i) => {
        lines.push(`${i + 1}. **Acción:** ${s.description}`);
        if (s.test_data) lines.push(`   - **Datos:** ${s.test_data}`);
        lines.push(`   - **Resultado esperado:** ${s.expected_result}`);
      });
      if (args.include_gherkin) {
        lines.push(`\n**Gherkin:**\n\`\`\`gherkin\n${tc.gherkin || ""}\n\`\`\``);
      }
      lines.push("");
    }
  }

  lines.push(`\n---\n**Total: ${testCases.length} TCs** | Labels: TC_GENERATED_BY_IA, POR_REVISAR`);
  return lines.join("\n");
}

// ─── Utils ────────────────────────────────────────────────────────────────────
function extractFigmaKey(url) {
  if (!url) return "";
  const match = url.match(/figma\.com\/(file|design)\/([^/?]+)/);
  return match ? match[2] : url;
}

// ─── Start ────────────────────────────────────────────────────────────────────
const transport = new StdioServerTransport();
await server.connect(transport);
console.error("🚀 qa-orchestrator-mcp running");
