import axios from "axios";

// Zephyr Scale Cloud API v2
// Docs: https://support.smartbear.com/zephyr-scale-cloud/api-docs/

export class ZephyrClient {
  constructor(config) {
    this.config = config;
    this.http = axios.create({
      baseURL: "https://api.zephyrscale.smartbear.com/v2",
      headers: {
        Authorization: `Bearer ${config.token}`,
        "Content-Type": "application/json",
      },
    });
  }

  // ── Folders ────────────────────────────────────────────────────────────────

  async listFolders(projectKey) {
    const { data } = await this.http.get("/folders", {
      params: { projectKey, folderType: "TEST_CASE", maxResults: 200 },
    });
    return data;
  }

  async createFolder(projectKey, name, parentId) {
    const { data } = await this.http.post("/folders", {
      projectKey,
      name,
      folderType: "TEST_CASE",
      ...(parentId ? { parentId } : {}),
    });
    return data; // { id, name, ... }
  }

  /**
   * Get folder ID by name, creating it if it doesn't exist.
   */
  async getOrCreateFolder(projectKey, folderName) {
    const { values = [] } = await this.listFolders(projectKey);
    const existing = values.find(
      (f) => f.name.toLowerCase() === folderName.toLowerCase()
    );
    if (existing) return existing;
    return this.createFolder(projectKey, folderName);
  }

  // ── Test Cases ─────────────────────────────────────────────────────────────

  /**
   * Create TC shell (NO steps, NO testScript in body — Zephyr ignores it silently).
   * Steps must be inserted via insertSteps() in a separate call.
   */
  async createTestCase({ projectKey, name, folderId, labels, precondition, objective, storyKey }) {
    const payload = {
      projectKey,
      name,
      objective: objective || "",
      precondition: precondition || "",
      labels: labels || [],
      priority: { name: "Normal" },
      status: { name: "Draft" },
      ...(folderId ? { folder: { id: folderId } } : {}),
      ...(storyKey ? { issueLinks: [storyKey] } : {}),
    };

    const { data } = await this.http.post("/testcases", payload);
    return data; // { id, key, self }
  }

  /**
   * Insert steps into an existing TC (separate API call — mandatory for steps to appear).
   * @param {string} testCaseKey - e.g. ESSPFRT-T10
   * @param {Array}  steps       - [{ description, testData, expectedResult }]
   */
  async insertSteps(testCaseKey, steps) {
    const payload = {
      mode: "OVERWRITE",
      items: steps.map((s) => ({
        inline: {
          description: s.description || "",
          testData: s.test_data || s.testData || "",
          expectedResult: s.expected_result || s.expectedResult || "",
        },
        testCase: null,
      })),
    };
    const { data } = await this.http.post(`/testcases/${testCaseKey}/teststeps`, payload);
    return data;
  }

  async getTestCase(testCaseKey) {
    const { data } = await this.http.get(`/testcases/${testCaseKey}`);
    return data;
  }

  async getTestCases(projectKey, folder, label) {
    const params = { projectKey, maxResults: 100 };
    if (folder) params.folder = folder;
    if (label) params.label = label;
    const { data } = await this.http.get("/testcases", { params });
    return data;
  }

  async updateTestCase(testCaseKey, updates) {
    const { data } = await this.http.put(`/testcases/${testCaseKey}`, updates);
    return data;
  }

  // ── Test Cycles ────────────────────────────────────────────────────────────

  async createTestCycle(projectKey, name, description, issueKey) {
    const { data } = await this.http.post("/testcycles", {
      projectKey,
      name,
      description,
      jiraProjectVersion: issueKey,
    });
    return data;
  }

  async addTestCaseToCycle(cycleKey, testCaseKeys) {
    const { data } = await this.http.post("/testexecutions", {
      testCycleKey: cycleKey,
      items: testCaseKeys.map((key) => ({ testCaseKey: key })),
    });
    return data;
  }

  async updateTestResult(cycleKey, testCaseKey, status, comment) {
    const { data } = await this.http.put(`/testexecutions/${testCaseKey}`, {
      testCycleKey: cycleKey,
      statusName: status,
      comment,
      actualEndDate: new Date().toISOString(),
    });
    return data;
  }
}
