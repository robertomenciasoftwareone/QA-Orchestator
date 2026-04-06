# qa-orchestrator-mcp

Servidor MCP local de QA que integra **Jira**, **Confluence**, **Figma**, **Zephyr Scale** y **Playwright** para generar y ejecutar casos de prueba de forma automática desde GitHub Copilot.

---

## ¿Qué hace?

Con un solo prompt en Copilot como:
```
Quiero que según la info que tienes de la STORY "ESCPIC-187" de JIRA (con enlace a Confluence) me crees en Zephyr Scale todos los TC posibles organizados por flujos MF/AF/EX con script Step by Step en la carpeta "Sprint_24" con labels TC_GENERATED_BY_IA y POR_REVISAR
```

El servidor:
1. Lee la **historia de Jira** (descripción + AC)
2. Sigue el enlace a **Confluence** y extrae la documentación
3. Si hay links a **Figma**, analiza las pantallas/componentes
4. Genera todos los **Test Cases** organizados por flujo (MF/AF/EX)
5. Los crea directamente en **Zephyr Scale** con script Step-by-Step
6. Opcionalmente genera **scripts Playwright** y **Gherkin** para cada TC

---

## Instalación

### 1. Requisitos
- Node.js 18+
- Acceso a Jira Cloud, Confluence, Figma y Zephyr Scale

### 2. Instalar dependencias
```bash
cd qa-orchestrator-mcp
npm install
npx playwright install chromium
```

### 3. Configurar tokens
```bash
cp src/.env.example .env
# Editar .env con tus tokens
```

### 4. Configurar en VS Code / GitHub Copilot

Añade esto a tu `settings.json` o al fichero `.vscode/mcp.json`:

```json
{
  "mcpServers": {
    "qa-orchestrator": {
      "command": "node",
      "args": ["./qa-orchestrator-mcp/src/index.js"],
      "env": {
        "JIRA_BASE_URL": "https://tu-org.atlassian.net",
        "JIRA_EMAIL": "tu-email@company.com",
        "JIRA_API_TOKEN": "tu_token",
        "CONFLUENCE_BASE_URL": "https://tu-org.atlassian.net",
        "CONFLUENCE_EMAIL": "tu-email@company.com",
        "CONFLUENCE_API_TOKEN": "tu_token",
        "FIGMA_TOKEN": "tu_figma_token",
        "ZEPHYR_API_TOKEN": "tu_zephyr_token",
        "JIRA_PROJECT_KEY": "ESCPIC"
      }
    }
  }
}
```

---

## Herramientas disponibles

### JIRA
| Tool | Descripción |
|------|-------------|
| `jira_get_story` | Obtiene los detalles de una historia |
| `jira_get_linked_pages` | Obtiene los enlaces a Confluence/Figma de una historia |

### Confluence
| Tool | Descripción |
|------|-------------|
| `confluence_get_page` | Lee el contenido de una página por ID o URL |
| `confluence_search` | Busca páginas por texto |

### Figma
| Tool | Descripción |
|------|-------------|
| `figma_get_file` | Obtiene las pantallas de un fichero Figma |
| `figma_get_components` | Lista los componentes/frames de un fichero Figma |

### Zephyr Scale
| Tool | Descripción |
|------|-------------|
| `zephyr_create_test_cases_from_story` | **HERRAMIENTA PRINCIPAL** - Genera todos los TCs desde una historia |
| `zephyr_create_test_case` | Crea un único TC |
| `zephyr_get_test_cases` | Lista TCs de un proyecto/carpeta |
| `zephyr_export_test_cases` | Exporta TCs en JSON/CSV para importación manual |
| `zephyr_list_folders` | Lista carpetas disponibles en Zephyr Scale |

### Playwright
| Tool | Descripción |
|------|-------------|
| `playwright_run_test` | Ejecuta un script Playwright |
| `playwright_generate_from_gherkin` | Ejecuta tests en formato Gherkin/BDD (estilo Hercules) |
| `playwright_generate_script_from_tc` | Genera script Playwright desde un TC de Zephyr |
| `playwright_accessibility_audit` | Auditoría de accesibilidad WCAG (axe-core) |
| `playwright_visual_snapshot` | Captura screenshots para testing visual |

### QA / Generación
| Tool | Descripción |
|------|-------------|
| `generate_gherkin_from_story` | Genera feature file BDD desde una historia |
| `generate_test_cases_preview` | Preview de TCs sin crearlos en Zephyr |

---

## Tipos de flujo

| Prefijo | Tipo | Descripción |
|---------|------|-------------|
| `[MF]` | Flujo Principal | Camino feliz, funcionalidad core |
| `[AF]` | Flujo Alternativo | Paths alternativos, campos opcionales, roles |
| `[EX]` | Flujo Excepción | Validaciones, errores, casos límite |

---

## Ejemplos de prompts para Copilot

```
# Generar y crear TCs completos
Quiero que según la info de la STORY "ESCPIC-187" en JIRA (que tiene enlace a Confluence) me crees en Zephyr Scale todos los TC posibles organizados por flujos MF/AF/EX con script Step by Step en la carpeta "Sprint_24". Asignar labels TC_GENERATED_BY_IA y POR_REVISAR.

# Solo preview antes de crear
Genera un preview de todos los TCs de la story ESCPIC-187 sin crearlos en Zephyr

# Incluir Playwright
Genera los TCs de ESCPIC-187 en Zephyr Scale en la carpeta "Regresion" e incluye también los scripts de Playwright para cada TC

# Exportar para importación manual
Exporta los TCs de ESCPIC-187 en formato JSON para importar en Zephyr Scale

# Ejecutar test desde Gherkin (estilo Hercules)
Genera un feature BDD de ESCPIC-187 y ejecútalo con Playwright contra https://app.miempresa.com

# Auditoría accesibilidad
Ejecuta una auditoría de accesibilidad WCAG AA sobre https://app.miempresa.com/dashboard
```

---

## Arquitectura

```
qa-orchestrator-mcp/
├── src/
│   ├── index.js              # MCP Server + tool handlers
│   ├── clients/
│   │   ├── jira.js           # Jira REST API v3
│   │   ├── confluence.js     # Confluence REST API
│   │   ├── figma.js          # Figma REST API
│   │   └── zephyr.js         # Zephyr Scale REST API
│   ├── qa/
│   │   ├── tc-generator.js   # Motor de generación de TCs (MF/AF/EX)
│   │   └── gherkin-generator.js # Generador de feature files BDD
│   └── playwright/
│       └── runner.js         # Playwright + Gherkin runner + accessibility
└── README.md
```

## Inspiración

Este servidor incorpora conceptos de [TestZeus Hercules](https://github.com/test-zeus-ai/testzeus-hercules):
- Ejecución de tests desde Gherkin en lenguaje natural
- Generación de Gherkin desde AC
- Auditoría de accesibilidad WCAG integrada
- Testing visual con screenshots
- Soporte multi-browser (Chromium, Firefox, WebKit)
- Compatibilidad con emulación mobile

---

## Cómo obtener los tokens

### Jira + Confluence (Atlassian Cloud)
1. Ve a https://id.atlassian.com/manage-profile/security/api-tokens
2. Crea un token de API
3. Usa tu email + ese token para `JIRA_API_TOKEN` y `CONFLUENCE_API_TOKEN`

### Figma
1. Ve a Figma → Settings → Account → Personal Access Tokens
2. Genera un nuevo token

### Zephyr Scale
1. En Jira → Apps → Zephyr Scale
2. Ve a Settings → API Access Tokens
3. Genera un token para el servidor
