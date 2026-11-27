import { unzipSync } from "fflate";

export interface Env {
  AI: { run(model: string, input: any): Promise<any> };
  DB: D1Database;
  ASSETS: Fetcher;
  GITHUB_BUILD_TOKEN?: string;
}

const MODEL = "@cf/google/gemma-4-26b-a4b-it";
const BUILDER_REPO = "AlishaYT/ColdAI-Builder";
const GH_API = "https://api.github.com/repos/" + BUILDER_REPO;

const SYSTEM = `You are Cold AI, an expert AI assistant specializing in Minecraft Java and Bedrock, Bukkit, Spigot, Paper, Purpur, Velocity, BungeeCord, Fabric, Forge, NeoForge, Java, JavaScript, TypeScript, web development, Python, server administration, debugging and general software engineering.
Respond in the same language as the user, including Urdu, Hindi and Roman Urdu. Be accurate and practical. Never claim to have searched the internet, run code, compiled a plugin, inspected unavailable files, or fixed a system unless that action actually occurred.
IMPORTANT CAPABILITY: This app includes a real automatic Minecraft plugin JAR build integration. The chat interface routes clear requests to create/build/generate a Minecraft/Paper/Spigot/Bukkit plugin, or to compile/package a JAR, into that build pipeline. The pipeline generates a Maven project, submits it to a private GitHub Actions runner, compiles it with Java 21 and Maven, and returns a real JAR download only when the build succeeds. Never claim that AI models are physically unable to compile, package, or provide JAR files, and never invent a security restriction against executable files. If the user asks how to build rather than requests a plugin, explain the steps. If the builder is not configured or a build fails, state the actual error rather than claiming success.
If the user provides logs or code, analyze the supplied content and distinguish evidence from assumptions. For Minecraft development, ask for the server platform and version when compatibility depends on it. Provide complete files when requested, not misleading partial snippets.`;

const PLUGIN_GENERATOR_SYSTEM = `You are Cold AI's Minecraft plugin project generator. Generate a COMPLETE, COMPILABLE Maven project for the exact plugin requested by the user.
Use Java 21 and Maven. For Paper servers, use the Paper API from https://repo.papermc.io/repository/maven-public/ and an appropriate Paper API version. If the user's requested platform/version is not specified, default to Paper 1.21.4 with Java 21 and state that assumption in summary. Use the appropriate API and repository when the user specifies Spigot, Bukkit, or another supported Bukkit-compatible platform.
Every project MUST include pom.xml, at least one complete Java source file under src/main/java/, and src/main/resources/plugin.yml with the correct main class, name, version, and api-version. Add all required supporting classes, configuration defaults, permissions and commands. Use real API methods, avoid placeholder methods, avoid missing imports, and make all classes compile together. Do not include precompiled binaries.
Return ONLY valid JSON with this exact structure: {"pluginName":"ShortPluginName","summary":"One sentence describing the generated plugin and target platform","files":[{"path":"pom.xml","content":"complete file content"},{"path":"src/main/java/example/PluginMain.java","content":"complete Java file content"},{"path":"src/main/resources/plugin.yml","content":"complete YAML file content"}]}. No markdown fences, no explanation outside JSON. All file content must be plain strings with JSON escaping.`;

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
    return value.map((part) => {
      if (typeof part === "string") return part;
      if (part && typeof part === "object") {
        const item = part as Record<string, unknown>;
        if (typeof item.text === "string") return item.text;
        if (typeof item.content === "string") return item.content;
      }
      return "";
    }).filter(Boolean).join("\n").trim();
  }
  if (value && typeof value === "object") {
    const item = value as Record<string, unknown>;
    if (typeof item.text === "string") return item.text.trim();
    if (typeof item.content === "string") return item.content.trim();
  }
  return "";
}

function modelText(result: any): string {
  return [
    extractText(result),
    extractText(result?.response),
    extractText(result?.output_text),
    extractText(result?.choices?.[0]?.message?.content),
    extractText(result?.message?.content),
    extractText(result?.output?.text),
  ].find(Boolean) || "";
}

function jsonFromModel(text: string): any {
  const clean = text.replace(/^\s*```(?:json)?\s*/i, "").replace(/\s*```\s*$/, "").trim();
  const first = clean.indexOf("{");
  const last = clean.lastIndexOf("}");
  if (first < 0 || last <= first) throw new Error("The AI did not return a valid plugin project JSON.");
  return JSON.parse(clean.slice(first, last + 1));
}

function toBase64Utf8(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary);
}

async function githubJson(token: string, path: string, init: RequestInit = {}): Promise<any> {
  const response = await fetch(GH_API + path, {
    ...init,
    headers: {
      Authorization: "Bearer " + token,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "Content-Type": "application/json",
      ...(init.headers || {}),
    },
  });
  const raw = await response.text();
  if (!response.ok) {
    console.error("GitHub builder API error:", response.status, raw.slice(0, 800));
    throw new Error("GitHub builder request failed (" + response.status + "). Check the builder repository token permissions.");
  }
  return raw ? JSON.parse(raw) : null;
}

async function checkBuildRateLimit(request: Request, env: Env): Promise<boolean> {
  await env.DB.prepare(
    "CREATE TABLE IF NOT EXISTS coldai_build_rate_limits (ip_hash TEXT NOT NULL, hour_window INTEGER NOT NULL, build_count INTEGER NOT NULL, PRIMARY KEY (ip_hash, hour_window))",
  ).run();

  const ip = request.headers.get("CF-Connecting-IP") || "unknown";
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(ip));
  const ipHash = Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
  const hour = Math.floor(Date.now() / 3600000);

  const row = await env.DB.prepare(
    "INSERT INTO coldai_build_rate_limits (ip_hash, hour_window, build_count) VALUES (?, ?, 1) ON CONFLICT(ip_hash, hour_window) DO UPDATE SET build_count = build_count + 1 RETURNING build_count",
  ).bind(ipHash, hour).first<{ build_count: number }>();

  await env.DB.prepare("DELETE FROM coldai_build_rate_limits WHERE hour_window < ?").bind(hour - 24).run();
  return (row?.build_count || 0) <= 2;
}

function validateProject(project: any): { pluginName: string; summary: string; files: Array<{ path: string; content: string }> } {
  if (!project || !Array.isArray(project.files) || project.files.length < 3 || project.files.length > 40) {
    throw new Error("The generated project must contain between 3 and 40 files.");
  }

  const files: Array<{ path: string; content: string }> = [];
  let totalBytes = 0;

  for (const file of project.files) {
    if (!file || typeof file.path !== "string" || typeof file.content !== "string") {
      throw new Error("The generated project contains an invalid file entry.");
    }
    const path = file.path.replace(/\\/g, "/");
    if (path.startsWith("/") || path.split("/").some((part: string) => !part || part === "." || part === "..")) {
      throw new Error("The generated project contains an unsafe file path.");
    }
    if (!(path === "pom.xml" || path === "README.md" || path.startsWith("src/"))) {
      throw new Error("The generated project may only contain pom.xml, README.md, and source/resource files under src/.");
    }
    const bytes = new TextEncoder().encode(file.content).length;
    if (bytes > 50000) throw new Error("A generated source file is too large.");
    totalBytes += bytes;
    files.push({ path, content: file.content });
  }

  if (totalBytes > 250000) throw new Error("The generated plugin project is too large for one build.");
  if (!files.some((file) => file.path === "pom.xml")) throw new Error("The generated project is missing pom.xml.");
  if (!files.some((file) => file.path.startsWith("src/main/java/") && file.path.endsWith(".java"))) {
    throw new Error("The generated project is missing Java source files.");
  }
  if (!files.some((file) => file.path === "src/main/resources/plugin.yml")) {
    throw new Error("The generated project is missing src/main/resources/plugin.yml.");
  }

  const pluginName = String(project.pluginName || "ColdAIPlugin").replace(/[^a-zA-Z0-9._-]/g, "").slice(0, 50) || "ColdAIPlugin";
  const summary = String(project.summary || "Minecraft plugin project generated by Cold AI.").slice(0, 300);
  return { pluginName, summary, files };
}

async function createPluginBuild(request: Request, env: Env): Promise<Response> {
  if (!env.GITHUB_BUILD_TOKEN) {
    return json({
      error: "The automatic JAR builder is not connected yet. Add the GITHUB_BUILD_TOKEN secret to the cold-ai Worker.",
      setupRequired: true,
    }, 503);
  }

  const allowed = await checkBuildRateLimit(request, env);
  if (!allowed) return json({ error: "Build limit reached: maximum 2 plugin builds per hour from this connection. Please try again later." }, 429);

  const body = await request.json() as {
    prompt?: string;
    attachments?: Array<{ name?: string; text?: string }>;
  };
  const prompt = String(body.prompt || "").trim().slice(0, 6000);
  const attachments = Array.isArray(body.attachments) ? body.attachments.slice(0, 5) : [];
  const attachmentContext = attachments
    .filter((file) => typeof file.text === "string" && file.text.length > 0)
    .map((file) => "\n\n[Attached file: " + String(file.name || "file").slice(0, 120) + "]\n" + String(file.text).slice(0, 20000))
    .join("")
    .slice(0, 60000);

  if (!prompt && !attachmentContext) return json({ error: "Describe the Minecraft plugin you want to build, or attach project source files." }, 400);

  const generated = await env.AI.run(MODEL, {
    messages: [
      { role: "system", content: PLUGIN_GENERATOR_SYSTEM },
      { role: "user", content: "Plugin request:\n" + (prompt || "Build a plugin from the attached project files.") + attachmentContext },
    ],
    max_completion_tokens: 8192,
    chat_template_kwargs: { enable_thinking: false },
  });

  const raw = modelText(generated);
  if (!raw) return json({ error: "The AI could not generate the Maven project. Try a smaller or more specific plugin request." }, 502);

  let project: ReturnType<typeof validateProject>;
  try {
    project = validateProject(jsonFromModel(raw));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invalid generated project.";
    console.error("Plugin project generation error:", message);
    return json({ error: "Plugin project generation failed: " + message }, 502);
  }

  const buildId = crypto.randomUUID().replace(/-/g, "");
  const branch = "coldai-build-" + buildId;
  const token = env.GITHUB_BUILD_TOKEN;

  const base = await githubJson(token, "/git/ref/heads/main");
  const baseSha = base?.object?.sha;
  if (!baseSha) throw new Error("Could not read the private builder repository's main branch.");

  await githubJson(token, "/git/refs", {
    method: "POST",
    body: JSON.stringify({ ref: "refs/heads/" + branch, sha: baseSha }),
  });

  for (const file of project.files) {
    const path = file.path.split("/").map(encodeURIComponent).join("/");
    await githubJson(token, "/contents/" + path, {
      method: "PUT",
      body: JSON.stringify({
        message: "Cold AI generated plugin project " + buildId,
        content: toBase64Utf8(file.content),
        branch,
      }),
    });
  }

  await githubJson(token, "/actions/workflows/build-plugin.yml/dispatches", {
    method: "POST",
    body: JSON.stringify({ ref: branch, inputs: { build_id: buildId } }),
  });

  return json({
    ok: true,
    buildId,
    pluginName: project.pluginName,
    summary: project.summary,
    status: "queued",
    runUrl: "https://github.com/" + BUILDER_REPO + "/actions",
  });
}

async function getPluginBuildStatus(buildId: string, env: Env): Promise<any> {
  if (!/^[a-f0-9]{32}$/.test(buildId)) throw new Error("Invalid build ID.");
  if (!env.GITHUB_BUILD_TOKEN) throw new Error("The automatic JAR builder is not connected.");
  const branch = "coldai-build-" + buildId;
  const query = "?branch=" + encodeURIComponent(branch) + "&event=workflow_dispatch&per_page=5";
  const runList = await githubJson(env.GITHUB_BUILD_TOKEN, "/actions/runs" + query);
  const run = runList?.workflow_runs?.[0];

  if (!run) return { status: "queued", message: "Waiting for the GitHub build runner to start." };
  if (run.status !== "completed") {
    return { status: run.status || "in_progress", runUrl: run.html_url };
  }
  if (run.conclusion !== "success") {
    return { status: "failure", conclusion: run.conclusion, runUrl: run.html_url, message: "Plugin compilation failed. Open build logs to see the Maven error." };
  }

  const artifacts = await githubJson(env.GITHUB_BUILD_TOKEN, "/actions/runs/" + run.id + "/artifacts?per_page=30");
  const artifact = artifacts?.artifacts?.find((item: any) => item.name === "plugin-jar-" + buildId && !item.expired);
  if (!artifact) return { status: "failure", runUrl: run.html_url, message: "The build completed, but GitHub did not provide the JAR artifact." };

  return {
    status: "success",
    runUrl: run.html_url,
    downloadUrl: "/api/plugin/download?id=" + buildId,
    artifactName: artifact.name,
  };
}

async function downloadPluginJar(buildId: string, env: Env): Promise<Response> {
  const status = await getPluginBuildStatus(buildId, env);
  if (status.status !== "success") return json({ error: "The plugin JAR is not ready yet.", status: status.status }, 409);

  const branch = "coldai-build-" + buildId;
  const runList = await githubJson(env.GITHUB_BUILD_TOKEN!, "/actions/runs?branch=" + encodeURIComponent(branch) + "&event=workflow_dispatch&per_page=5");
  const run = runList?.workflow_runs?.[0];
  if (!run) return json({ error: "Build run not found." }, 404);

  const artifacts = await githubJson(env.GITHUB_BUILD_TOKEN!, "/actions/runs/" + run.id + "/artifacts?per_page=30");
  const artifact = artifacts?.artifacts?.find((item: any) => item.name === "plugin-jar-" + buildId && !item.expired);
  if (!artifact) return json({ error: "The plugin JAR artifact has expired or is missing." }, 404);

  const response = await fetch("https://api.github.com/repos/" + BUILDER_REPO + "/actions/artifacts/" + artifact.id + "/zip", {
    headers: {
      Authorization: "Bearer " + env.GITHUB_BUILD_TOKEN,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
    },
  });
  if (!response.ok) return json({ error: "Could not download the JAR artifact from GitHub (" + response.status + ")." }, 502);

  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.length > 20000000) return json({ error: "The downloaded build artifact exceeds the 20 MB safety limit." }, 413);

  let entries: Record<string, Uint8Array>;
  try {
    entries = unzipSync(bytes);
  } catch {
    return json({ error: "The GitHub build artifact was not a valid ZIP archive." }, 502);
  }

  const jarEntry = Object.entries(entries).find(([name]) => name.toLowerCase().endsWith(".jar"));
  if (!jarEntry) return json({ error: "No compiled .jar file was found inside the build artifact." }, 404);

  const fileName = jarEntry[0].split("/").pop() || "ColdAIPlugin.jar";
  try {
    await githubJson(env.GITHUB_BUILD_TOKEN!, "/git/refs/heads/" + branch, { method: "DELETE" });
  } catch (error) {
    console.warn("Could not remove temporary build branch:", error);
  }

  return new Response(jarEntry[1], {
    headers: {
      "content-type": "application/java-archive",
      "content-disposition": "attachment; filename=\"" + fileName.replace(/[^a-zA-Z0-9._-]/g, "_") + "\"",
      "cache-control": "private, no-store",
    },
  });
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
        jarBuilderAvailable: !!env.GITHUB_BUILD_TOKEN,
        model: MODEL,
        version: "0.2.1",
      });
    }

    if (url.pathname === "/api/plugin/build" && request.method === "POST") {
      try {
        return await createPluginBuild(request, env);
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown build error";
        console.error("Cold AI plugin build error:", message);
        return json({ error: "Could not start plugin build: " + message }, 500);
      }
    }

    if (url.pathname === "/api/plugin/status" && request.method === "GET") {
      try {
        const buildId = url.searchParams.get("id") || "";
        const status = await getPluginBuildStatus(buildId, env);
        return json(status);
      } catch (error) {
        const message = error instanceof Error ? error.message : "Could not read build status.";
        return json({ error: message }, 400);
      }
    }

    if (url.pathname === "/api/plugin/download" && request.method === "GET") {
      try {
        const buildId = url.searchParams.get("id") || "";
        return await downloadPluginJar(buildId, env);
      } catch (error) {
        const message = error instanceof Error ? error.message : "Could not download the plugin JAR.";
        console.error("Cold AI plugin download error:", message);
        return json({ error: "Could not download the plugin JAR: " + message }, 500);
      }
    }

    if (url.pathname === "/api/chat" && request.method === "POST") {
      try {
        const body = await request.json() as {
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

        const reply = modelText(result);
        if (!reply) {
          const providerFields =
            result && typeof result === "object" ? Object.keys(result as object) : [typeof result];
          console.error("Cold AI provider returned no text. Response fields:", providerFields);
          return json({ error: "The AI provider returned no text. Check the Worker logs for the provider response fields." }, 502);
        }

        return json({ reply, model: MODEL });
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown server error";
        console.error("Cold AI chat error:", message);
        return json({ error: "AI request failed: " + message }, 500);
      }
    }

    if (url.pathname.startsWith("/api/")) return json({ error: "API route not found." }, 404);
    return env.ASSETS.fetch(request);
  },
};
