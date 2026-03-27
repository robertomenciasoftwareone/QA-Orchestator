import axios from "axios";

export class JiraClient {
  constructor(config) {
    this.config = config;
    this.http = axios.create({
      baseURL: `${config.baseUrl}/rest/api/3`,
      auth: { username: config.email, password: config.token },
      headers: { "Content-Type": "application/json" },
    });
  }

  async getIssue(issueKey) {
    const { data } = await this.http.get(`/issue/${issueKey}`, {
      params: {
        fields: "summary,description,status,assignee,priority,labels,issuetype,subtasks,acceptance_criteria,customfield_10014,customfield_10000,customfield_10500,comment,attachment,remotelinks",
        expand: "renderedFields,names",
      },
    });
    return data;
  }

  async getLinkedPages(issueKey) {
    const result = { confluence: [], figma: [], other: [] };

    // Remote links (Confluence, Figma, etc.)
    try {
      const { data } = await this.http.get(`/issue/${issueKey}/remotelink`);
      for (const link of data) {
        const url = link.object?.url || "";
        const title = link.object?.title || link.object?.summary || url;

        if (url.includes("confluence") || url.includes("atlassian.net/wiki")) {
          const pageId = extractConfluencePageId(url);
          result.confluence.push({ url, title, id: pageId });
        } else if (url.includes("figma.com")) {
          result.figma.push({ url, title });
        } else {
          result.other.push({ url, title });
        }
      }
    } catch {
      // ignore if no remote links
    }

    // Issue links
    const issue = await this.getIssue(issueKey);
    const desc = issue.fields?.description;
    if (desc) {
      const rawText = JSON.stringify(desc);
      const confluenceMatches = rawText.match(/https?:\/\/[^\s"]+\/wiki\/[^\s"]+/g) || [];
      const figmaMatches = rawText.match(/https?:\/\/www\.figma\.com\/[^\s"]+/g) || [];

      for (const url of confluenceMatches) {
        if (!result.confluence.find((c) => c.url === url)) {
          result.confluence.push({ url, title: url, id: extractConfluencePageId(url) });
        }
      }
      for (const url of figmaMatches) {
        if (!result.figma.find((f) => f.url === url)) {
          result.figma.push({ url, title: url });
        }
      }
    }

    return result;
  }
}

function extractConfluencePageId(url) {
  const match = url.match(/\/pages\/(\d+)/);
  return match ? match[1] : null;
}
