import axios from "axios";

// Zephyr Scale Cloud API v2
// Docs: https://support.smartbear.com/zephyr-scale-cloud/api-docs/
// Base URL: https://api.zephyrscale.smartbear.com/v2

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

  async createTestCase({ projectKey, name, folder, steps, labels, precondition, objective, storyKey }) {
    const testScript = {
      type: "STEP_BY_STEP",
      steps: steps.map((s, i) => ({
        index: i,
        description: s.description,
        testData: s.test_data || "",
        expectedResult: s.expected_result,
      })),
    };

    const payload = {
      projectKey,
      name,
      labels: labels || [],
      objective: objective || "",
      precondition: precondition || "",
      testScript,
      ...(folder ? { folder: { name: folder } } : {}),
      ...(storyKey ? { issueLinks: [storyKey] } : {}),
    };

    const { data } = await this.http.post("/testcases", payload);
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
    return data;
  }

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
    const { data } = await this.http.post(`/testexecutions`, {
      testCycleKey: cycleKey,
      items: testCaseKeys.map((key) => ({ testCaseKey: key })),
    });
    return data;
  }

  async updateTestResult(cycleKey, testCaseKey, status, comment) {
    // status: PASS | FAIL | WIP | BLOCKED | NOT_EXECUTED
    const { data } = await this.http.put(`/testexecutions/${testCaseKey}`, {
      testCycleKey: cycleKey,
      statusName: status,
      comment,
      actualEndDate: new Date().toISOString(),
    });
    return data;
  }
}
