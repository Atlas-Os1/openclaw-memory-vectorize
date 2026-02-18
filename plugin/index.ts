/**
 * OpenClaw Memory (Cloudflare Vectorize) Plugin
 *
 * Long-term memory with vector search using Cloudflare Vectorize + Workers AI.
 * Provides seamless auto-recall and auto-capture via lifecycle hooks.
 * 
 * Connects to your deployed memory worker.
 */

import type { OpenClawPluginApi } from "openclaw/plugin-sdk";

// ============================================================================
// Types
// ============================================================================

interface PluginConfig {
  workerUrl: string;
  autoRecall: boolean;
  autoCapture: boolean;
  minRecallScore: number;
  recallLimit: number;
}

interface MemoryMatch {
  id: string;
  score: number;
  metadata: {
    agent: string;
    type: string;
    source_file: string;
    timestamp: string;
    raw_text: string;
  };
}

interface QueryResponse {
  query: string;
  count: number;
  matches: MemoryMatch[];
}

interface CaptureResponse {
  captured: boolean;
  type?: string;
  id?: string;
  reason?: string;
}

type MemoryType = "decision" | "correction" | "learning" | "preference" | "context" | "user_profile";

// ============================================================================
// Vectorize Client
// ============================================================================

class VectorizeClient {
  constructor(private workerUrl: string) {}

  async query(
    queryText: string,
    options: { agent?: string; type?: string; topK?: number; minScore?: number } = {}
  ): Promise<QueryResponse> {
    const response = await fetch(`${this.workerUrl}/query`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        query: queryText,
        agent: options.agent,
        type: options.type,
        topK: options.topK ?? 5,
        minScore: options.minScore ?? 0.5,
      }),
    });

    if (!response.ok) {
      throw new Error(`Query failed: ${response.status}`);
    }

    return response.json() as Promise<QueryResponse>;
  }

  async index(
    agent: string,
    text: string,
    type: MemoryType = "context",
    sourceFile = "plugin-capture"
  ): Promise<{ indexed: number; ids: string[] }> {
    const response = await fetch(`${this.workerUrl}/index`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ agent, text, type, source_file: sourceFile }),
    });

    if (!response.ok) {
      throw new Error(`Index failed: ${response.status}`);
    }

    return response.json() as Promise<{ indexed: number; ids: string[] }>;
  }

  async capture(
    agent: string,
    content: string,
    classification?: string
  ): Promise<CaptureResponse> {
    const response = await fetch(`${this.workerUrl}/capture`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        agent,
        turn_type: "assistant",
        content,
        classification,
      }),
    });

    if (!response.ok) {
      throw new Error(`Capture failed: ${response.status}`);
    }

    return response.json() as Promise<CaptureResponse>;
  }
}

// ============================================================================
// Capture Detection
// ============================================================================

const MEMORY_TRIGGERS = [
  /remember|zapamatuj/i,
  /prefer|radši|like|love|hate|want|need/i,
  /decided|decision|will use|budeme/i,
  /learned|realized|discovered/i,
  /actually|no,|that's wrong|correction/i,
  /important|always|never/i,
  /\+\d{10,}/,                    // Phone numbers
  /[\w.-]+@[\w.-]+\.\w+/,          // Email addresses
  /my\s+\w+\s+is|is\s+my/i,        // Personal facts
];

function shouldCapture(text: string): boolean {
  if (text.length < 10 || text.length > 500) return false;
  if (text.includes("<relevant-memories>")) return false;
  if (text.startsWith("<") && text.includes("</")) return false;
  if (text.includes("**") && text.includes("\n-")) return false;
  const emojiCount = (text.match(/[\u{1F300}-\u{1F9FF}]/gu) || []).length;
  if (emojiCount > 3) return false;
  return MEMORY_TRIGGERS.some((r) => r.test(text));
}

function detectCategory(text: string): MemoryType {
  const lower = text.toLowerCase();
  if (/actually|no,|that's wrong|correction/i.test(lower)) return "correction";
  if (/prefer|like|love|hate|want/i.test(lower)) return "preference";
  if (/decided|decision|will use/i.test(lower)) return "decision";
  if (/learned|realized|discovered/i.test(lower)) return "learning";
  return "context";
}

// ============================================================================
// Plugin Definition
// ============================================================================

const memoryVectorizePlugin = {
  id: "memory-vectorize",
  name: "Memory (Cloudflare Vectorize)",
  description: "Cloudflare Vectorize-backed long-term memory with auto-recall/capture",
  kind: "memory" as const,

  register(api: OpenClawPluginApi) {
    const cfg = (api.pluginConfig || {}) as Partial<PluginConfig>;
    const workerUrl = cfg.workerUrl;
    if (!workerUrl) {
      api.logger.error("memory-vectorize: workerUrl is required in config");
      return;
    }
    const client = new VectorizeClient(workerUrl);

    // Get current agent ID from context
    const getAgentId = (): string => {
      return (api as any).agentId ?? (api as any).context?.agentId ?? "flo";
    };

    api.logger.info(`memory-vectorize: plugin registered (worker: ${workerUrl})`);

    // ========================================================================
    // Tools - Use simple object schemas instead of Type.Object
    // ========================================================================

    api.registerTool(
      {
        name: "memory_vector_recall",
        label: "Vector Memory Recall",
        description:
          "Semantic search through long-term memories using Cloudflare Vectorize. Use when you need context about user preferences, past decisions, or previously discussed topics.",
        parameters: {
          type: "object",
          properties: {
            query: { type: "string", description: "Search query (natural language)" },
            agent: { type: "string", description: "Filter by agent ID (dev, flo, sage, etc.)" },
            limit: { type: "number", description: "Max results (default: 5)" },
          },
          required: ["query"],
        },
        async execute(_toolCallId: string, params: unknown) {
          const { query, agent, limit = 5 } = params as { query: string; agent?: string; limit?: number };

          try {
            const results = await client.query(query, { agent, topK: limit, minScore: 0.4 });

            if (results.count === 0) {
              return {
                content: [{ type: "text", text: "No relevant memories found." }],
                details: { count: 0 },
              };
            }

            const text = results.matches
              .map(
                (m, i) =>
                  `${i + 1}. [${m.metadata.type}] ${m.metadata.raw_text.slice(0, 200)}... (${(m.score * 100).toFixed(0)}%)`
              )
              .join("\n");

            return {
              content: [{ type: "text", text: `Found ${results.count} memories:\n\n${text}` }],
              details: { count: results.count, memories: results.matches },
            };
          } catch (err) {
            return {
              content: [{ type: "text", text: `Memory recall failed: ${String(err)}` }],
              details: { error: String(err) },
            };
          }
        },
      },
      { name: "memory_vector_recall" },
    );

    api.registerTool(
      {
        name: "memory_vector_store",
        label: "Vector Memory Store",
        description:
          "Save important information to long-term vector memory. Use for preferences, decisions, learnings.",
        parameters: {
          type: "object",
          properties: {
            text: { type: "string", description: "Information to remember" },
            type: { type: "string", enum: ["decision", "correction", "learning", "preference", "context", "user_profile"], description: "Memory type" },
            agent: { type: "string", description: "Agent to store for (defaults to current)" },
          },
          required: ["text"],
        },
        async execute(_toolCallId: string, params: unknown) {
          const { text, type = "context", agent } = params as {
            text: string;
            type?: MemoryType;
            agent?: string;
          };

          try {
            const targetAgent = agent ?? getAgentId();
            const result = await client.index(targetAgent, text, type);

            return {
              content: [{ type: "text", text: `Stored memory for ${targetAgent}: "${text.slice(0, 100)}..."` }],
              details: { action: "created", indexed: result.indexed, ids: result.ids },
            };
          } catch (err) {
            return {
              content: [{ type: "text", text: `Memory store failed: ${String(err)}` }],
              details: { error: String(err) },
            };
          }
        },
      },
      { name: "memory_vector_store" },
    );

    // ========================================================================
    // Lifecycle Hooks
    // ========================================================================

    // Auto-recall: inject relevant memories before agent starts
    if (cfg.autoRecall !== false) {
      api.on("before_agent_start", async (event: any) => {
        if (!event.prompt || event.prompt.length < 5) {
          return;
        }

        try {
          const agentId = getAgentId();
          const results = await client.query(event.prompt, {
            agent: agentId,
            topK: cfg.recallLimit ?? 3,
            minScore: cfg.minRecallScore ?? 0.5,
          });

          if (results.count === 0) {
            return;
          }

          const memoryContext = results.matches
            .map((m) => `- [${m.metadata.type}] ${m.metadata.raw_text}`)
            .join("\n");

          api.logger.info?.(`memory-vectorize: injecting ${results.count} memories into context`);

          return {
            prependContext: `<relevant-memories>\nThe following memories may be relevant to this conversation:\n${memoryContext}\n</relevant-memories>`,
          };
        } catch (err) {
          api.logger.warn?.(`memory-vectorize: recall failed: ${String(err)}`);
        }
      });
    }

    // Auto-capture: analyze and store important information after agent ends
    if (cfg.autoCapture !== false) {
      api.on("agent_end", async (event: any) => {
        if (!event.success || !event.messages || event.messages.length === 0) {
          return;
        }

        try {
          const agentId = getAgentId();
          const texts: string[] = [];

          for (const msg of event.messages) {
            if (!msg || typeof msg !== "object") continue;
            const msgObj = msg as Record<string, unknown>;
            const role = msgObj.role;
            if (role !== "user" && role !== "assistant") continue;

            const content = msgObj.content;
            if (typeof content === "string") {
              texts.push(content);
            } else if (Array.isArray(content)) {
              for (const block of content) {
                if (
                  block &&
                  typeof block === "object" &&
                  "type" in block &&
                  (block as Record<string, unknown>).type === "text" &&
                  "text" in block &&
                  typeof (block as Record<string, unknown>).text === "string"
                ) {
                  texts.push((block as Record<string, unknown>).text as string);
                }
              }
            }
          }

          const toCapture = texts.filter((text) => text && shouldCapture(text));
          if (toCapture.length === 0) return;

          let stored = 0;
          for (const text of toCapture.slice(0, 3)) {
            const category = detectCategory(text);
            const result = await client.capture(agentId, text, category);
            if (result.captured) stored++;
          }

          if (stored > 0) {
            api.logger.info?.(`memory-vectorize: auto-captured ${stored} memories`);
          }
        } catch (err) {
          api.logger.warn?.(`memory-vectorize: capture failed: ${String(err)}`);
        }
      });
    }

    // ========================================================================
    // Service
    // ========================================================================

    api.registerService({
      id: "memory-vectorize",
      start: () => {
        api.logger.info(`memory-vectorize: initialized (worker: ${workerUrl})`);
      },
      stop: () => {
        api.logger.info("memory-vectorize: stopped");
      },
    });
  },
};

export default memoryVectorizePlugin;
