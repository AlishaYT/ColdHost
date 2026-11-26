export interface Env {
  AI: { run(model: string, input: any): Promise<any> };
  DB: D1Database;
  ASSETS: Fetcher;
}

const MODEL = "@cf/google/gemma-4-26b-a4b-it";

const SYSTEM = `You are Cold AI, an expert AI assistant specializing in Minecraft Java and Bedrock, Bukkit, Spigot, Paper, Purpur, Velocity, BungeeCord, Fabric, Forge, NeoForge, Java, JavaScript, TypeScript, web development, Python, server administration, debugging and general software engineering.
Respond in the same language as the user, including Urdu, Hindi and Roman Urdu. Be accurate and practical. Never claim to have searched the internet, run code, compiled a plugin, inspected unavailable files, or fixed a system unless that action actually occurred. If the user provides logs or code, analyze the supplied content and distinguish evidence from assumptions. For Minecraft development, ask for the server platform and version when compatibility depends on it. Provide complete files when requested, not misleading partial snippets.`;

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "access-control-allow-origin": "*",
    },
  });

function extractText(value: unknown): string {
  if (typeof value === "string") return value.trim();

  if (Array.isArray(value)) {
    return value
      .map((part) => {
        if (typeof part === "string") return part;
        if (part && typeof part === "object") {
          const item = part as Record<string, unknown>;
          if (typeof item.text === "string") return item.text;
          if (typeof item.content === "string") return item.content;
        }
        return "";
      })
      .filter(Boolean)
      .join("\n")
      .trim();
  }

  if (value && typeof value === "object") {
    const item = value as Record<string, unknown>;
    if (typeof item.text === "string") return item.text.trim();
    if (typeof item.content === "string") return item.content.trim();
  }

  return "";
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return new Response(null, {
        headers: {
          "access-control-allow-origin": "*",
          "access-control-allow-methods": "POST,GET,OPTIONS",
          "access-control-allow-headers": "content-type",
        },
      });
    }

    if (url.pathname === "/api/health") {
      return json({
        ok: true,
        service: "Cold AI",
        aiAvailable: !!env.AI,
        model: MODEL,
        version: "0.1.1",
      });
    }

    if (url.pathname === "/api/chat" && request.method === "POST") {
      try {
        const body = (await request.json()) as {
          messages?: Array<{ role: string; content: string }>;
          attachments?: Array<{ name: string; type?: string; text?: string; data?: string }>;
        };

        if (!Array.isArray(body.messages) || body.messages.length === 0) {
          return json({ error: "A message is required." }, 400);
        }

        const messages: Array<{ role: string; content: any }> = body.messages.slice(-24).map((message) => ({
          role: message.role === "assistant" ? "assistant" : "user",
          content: String(message.content || "").slice(0, 30000),
        }));

        const files = Array.isArray(body.attachments) ? body.attachments.slice(0, 5) : [];
        const textFiles = files.filter((file) => typeof file.text === "string" && file.text.length > 0);
        const imageFiles = files.filter(
          (file) =>
            typeof file.data === "string" &&
            /^data:image\/(png|jpeg|webp);base64,/i.test(file.data),
        );
        const fileContext = textFiles
          .map(
            (file) =>
              "\n\n[Uploaded file: " +
              String(file.name).slice(0, 120) +
              "]\n" +
              String(file.text).slice(0, 100000),
          )
          .join("");

        if (messages.length) {
          const lastMessage = messages[messages.length - 1];
          if (imageFiles.length) {
            const textContent = [lastMessage.content, fileContext].filter(Boolean).join("\n\n");
            lastMessage.content = [
              { type: "text", text: textContent || "Please inspect the attached image(s)." },
              ...imageFiles.map((file) => ({
                type: "image_url",
                image_url: { url: file.data, detail: "auto" },
              })),
            ];
          } else if (fileContext) {
            lastMessage.content += fileContext;
          }
        }

        const result = await env.AI.run(MODEL, {
          messages: [{ role: "system", content: SYSTEM }, ...messages],
          max_completion_tokens: 1800,
          chat_template_kwargs: { enable_thinking: false },
        });

        const candidates = [
          extractText(result),
          extractText((result as any)?.response),
          extractText((result as any)?.output_text),
          extractText((result as any)?.choices?.[0]?.message?.content),
          extractText((result as any)?.message?.content),
          extractText((result as any)?.output?.text),
          extractText((result as any)?.result?.response),
        ];

        const reply = candidates.find(Boolean) || "";

        if (!reply) {
          const providerFields =
            result && typeof result === "object" ? Object.keys(result as object) : [typeof result];
          console.error("Cold AI provider returned no text. Response fields:", providerFields);
          return json(
            { error: "The AI provider returned no text. Check the Worker logs for the provider response fields." },
            502,
          );
        }

        return json({ reply, model: MODEL });
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown server error";
        console.error("Cold AI chat error:", message);
        return json({ error: "AI request failed: " + message }, 500);
      }
    }

    if (url.pathname.startsWith("/api/")) {
      return json({ error: "API route not found." }, 404);
    }

    return env.ASSETS.fetch(request);
  },
};
