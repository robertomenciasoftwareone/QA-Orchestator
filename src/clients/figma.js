import axios from "axios";

export class FigmaClient {
  constructor(config) {
    this.config = config;
    this.http = axios.create({
      baseURL: "https://api.figma.com/v1",
      headers: { "X-Figma-Token": config.token },
    });
  }

  async getFile(fileKey) {
    const { data } = await this.http.get(`/files/${fileKey}`, {
      params: { depth: 2 },
    });
    return {
      name: data.name,
      lastModified: data.lastModified,
      version: data.version,
      pages: (data.document?.children || []).map((page) => ({
        id: page.id,
        name: page.name,
        frames: (page.children || [])
          .filter((n) => n.type === "FRAME" || n.type === "COMPONENT")
          .map((f) => ({ id: f.id, name: f.name, type: f.type })),
      })),
    };
  }

  async getComponents(fileKey) {
    const { data } = await this.http.get(`/files/${fileKey}/components`);
    const components = (data.meta?.components || []).map((c) => ({
      key: c.key,
      name: c.name,
      description: c.description,
      nodeId: c.node_id,
    }));

    // Also get top-level frames (screens)
    const file = await this.getFile(fileKey);
    return {
      components,
      screens: file.pages.flatMap((p) =>
        p.frames.map((f) => ({ ...f, page: p.name }))
      ),
    };
  }

  async getNode(fileKey, nodeId) {
    const { data } = await this.http.get(`/files/${fileKey}/nodes`, {
      params: { ids: nodeId },
    });
    return data.nodes?.[nodeId];
  }

  extractFileKeyFromUrl(url) {
    const match = url.match(/figma\.com\/(file|design)\/([^/?]+)/);
    return match ? match[2] : null;
  }
}
