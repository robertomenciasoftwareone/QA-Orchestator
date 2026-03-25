import axios from "axios";

export class ConfluenceClient {
  constructor(config) {
    this.config = config;
    this.http = axios.create({
      baseURL: `${config.baseUrl}/wiki/rest/api`,
      auth: { username: config.email, password: config.token },
      headers: { "Content-Type": "application/json" },
    });
  }

  async getPage(pageId) {
    const { data } = await this.http.get(`/content/${pageId}`, {
      params: { expand: "body.storage,body.view,version,space,ancestors,children.page" },
    });
    return {
      id: data.id,
      title: data.title,
      space: data.space?.name,
      url: `${this.config.baseUrl}/wiki${data._links?.webui}`,
      // Return storage format (HTML-like) and view format (rendered)
      body_storage: data.body?.storage?.value || "",
      body_view: data.body?.view?.value || "",
      // Extract plain text for easier LLM consumption
      text: extractText(data.body?.view?.value || data.body?.storage?.value || ""),
      version: data.version?.number,
      lastModified: data.version?.when,
    };
  }

  async getPageByUrl(url) {
    // Extract page ID from URL patterns like /pages/123456/Title
    const idMatch = url.match(/\/pages\/(\d+)/);
    if (idMatch) {
      return this.getPage(idMatch[1]);
    }

    // Try to find by title from URL slug
    const titleMatch = url.match(/\/pages\/\d+\/([^?#]+)/);
    if (titleMatch) {
      const title = decodeURIComponent(titleMatch[1].replace(/\+/g, " "));
      return this.searchByTitle(title);
    }

    throw new Error(`Cannot extract page ID from URL: ${url}`);
  }

  async searchByTitle(title, spaceKey) {
    const cql = spaceKey
      ? `title = "${title}" AND space.key = "${spaceKey}"`
      : `title = "${title}"`;

    const { data } = await this.http.get("/content/search", {
      params: { cql, expand: "body.storage,body.view", limit: 1 },
    });

    if (data.results?.length) {
      return this.getPage(data.results[0].id);
    }
    throw new Error(`Page not found: ${title}`);
  }

  async search(query, spaceKey) {
    const cql = spaceKey
      ? `text ~ "${query}" AND space.key = "${spaceKey}" AND type = page`
      : `text ~ "${query}" AND type = page`;

    const { data } = await this.http.get("/content/search", {
      params: { cql, expand: "space,version", limit: 10 },
    });

    return (data.results || []).map((p) => ({
      id: p.id,
      title: p.title,
      space: p.space?.name,
      url: `${this.config.baseUrl}/wiki${p._links?.webui}`,
      lastModified: p.version?.when,
    }));
  }
}

function extractText(html) {
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}
