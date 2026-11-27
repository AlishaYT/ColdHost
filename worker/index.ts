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

const PLUGIN_PLANNER_SYSTEM = \`You are Cold AI's Minecraft plugin architect. Read the user's full plugin requirements and create a concise implementation plan for a COMPLETE, COMPILABLE Maven project. Use Java 21. Respect the exact server platform and version requested. For Paper, use the Paper Maven repository and the closest valid API version for the requested release. Plan all required Java classes, resources, configuration files and dependencies. Keep classes focused and reasonably small; split large features into multiple classes. Include pom.xml, src/main/resources/plugin.yml, at least one Java source file under src/main/java/, and README.md. Use no more than 40 files total. Every path must be unique and relative. Return ONLY valid JSON in this shape: {"pluginName":"ShortName","summary":"One sentence","files":[{"path":"pom.xml","purpose":"Maven project configuration and dependencies"},{"path":"src/main/resources/plugin.yml","purpose":"Plugin metadata, main class, commands and permissions"},{"path":"src/main/java/example/Main.java","purpose":"Main plugin class and lifecycle"}]}. Do not write file contents in this planning response. No markdown or commentary.\`;

const PLUGIN_FILE_GENERATOR_SYSTEM = \`You are Cold AI's expert Minecraft plugin developer. Generate exactly ONE complete, production-quality project file at a time for the project described by the user and the supplied file manifest. Use Java 21 and the specified Minecraft platform/version. Keep every class consistent with the other planned files, package names, main class, commands, permissions, dependencies and configuration keys. Use real APIs and complete implementations, not pseudocode or placeholders. For pom.xml, include correct repositories/dependencies and Java 21 compiler configuration. For plugin.yml, use the exact main class and declare commands/permissions. For YAML, XML, Markdown and Java, output the complete raw file contents only: no JSON wrapper, no markdown fences, no explanations, no filename heading. Do not omit sections or truncate the file. Keep each individual file reasonably concise; move substantial logic into the other files listed in the manifest.\`;

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

async function generatePluginProject(
  env: Env,
  userRequest: string,
): Promise<{ pluginName: string; summary: string; files: Array<{ path: string; content: string }> }> {
  const plannerResult = await env.AI.run(MODEL, {
    messages: [
      { role: "system", content: PLUGIN_PLANNER_SYSTEM },
      { role: "user", content: "Create the file manifest for this plugin request:\n\n" + userRequest },
    ],
    max_completion_tokens: 2048,
    chat_template_kwargs: { enable_thinking: false },
  });

  const plannerText = modelText(plannerResult);
  if (!plannerText) throw new Error("The AI could not create a plugin file plan. Try a more specific request.");

  const plan = jsonFromModel(plannerText);
  if (!Array.isArray(plan.files) || plan.files.length < 1 || plan.files.length > 40) {
    throw new Error("The AI file plan must contain between 1 and 40 files.");
  }

  const plannedFiles: Array<{ path: string; purpose: string }> = [];
  const seen = new Set<string>();
  for (const entry of plan.files) {
    if (!entry || typeof entry.path !== "string" || typeof entry.purpose !== "string") {
      throw new Error("The AI file plan contains an invalid file entry.");
    }
    const path = entry.path.replace(/\\/g, "/");
    if (
      path.startsWith("/") ||
      path.split("/").some((part: string) => !part || part === "." || part === "..") ||
      !(path === "pom.xml" || path === "README.md" || path.startsWith("src/"))
    ) {
      throw new Error("The AI file plan contains an unsafe or unsupported path: " + path);
    }
    if (seen.has(path)) throw new Error("The AI file plan contains a duplicate path: " + path);
    seen.add(path);
    plannedFiles.push({ path, purpose: entry.purpose.slice(0, 500) });
  }

  const requiredFiles = [
    { path: "pom.xml", purpose: "Complete Maven configuration, repositories, dependencies and Java 21 compiler settings." },
    { path: "src/main/resources/plugin.yml", purpose: "Complete Bukkit-compatible plugin metadata, exact main class, commands and permissions." },
    { path: "README.md", purpose: "Installation, commands, permissions, configuration and usage documentation." },
  ];
  for (const required of requiredFiles) {
    if (!seen.has(required.path)) {
      if (plannedFiles.length >= 40) throw new Error("The file plan is full and omitted a required project file.");
      plannedFiles.push(required);
      seen.add(required.path);
    }
  }
  if (!plannedFiles.some((file) => file.path.startsWith("src/main/java/") && file.path.endsWith(".java"))) {
    throw new Error("The AI file plan is missing a Java main/source class.");
  }

  const manifest = JSON.stringify({
    pluginName: String(plan.pluginName || "ColdAIPlugin"),
    summary: String(plan.summary || "Minecraft plugin generated by Cold AI."),
    files: plannedFiles,
  });

  const generatedFiles: Array<{ path: string; content: string }> = [];
  let totalBytes = 0;
  for (const file of plannedFiles) {
    const result = await env.AI.run(MODEL, {
      messages: [
        { role: "system", content: PLUGIN_FILE_GENERATOR_SYSTEM },
        {
          role: "user",
          content:
            "PLUGIN REQUEST:\n" + userRequest +
            "\n\nCOMPLETE PROJECT FILE MANIFEST:\n" + manifest +
            "\n\nGenerate the complete raw contents for this exact file now:\nPATH: " + file.path +
            "\nPURPOSE: " + file.purpose +
            "\n\nOutput only the file contents. Do not output a code fence.",
        },
      ],
      max_completion_tokens: 4096,
      chat_template_kwargs: { enable_thinking: false },
    });

    let content = modelText(result);
    content = content
      .replace(/^\x60{3}[a-zA-Z0-9_-]*\s*\n?/, "")
      .replace(/\n?\x60{3}\s*$/, "")
      .trim();

    if (!content) throw new Error("The AI returned an empty file: " + file.path);
    const bytes = new TextEncoder().encode(content).length;
    if (bytes > 50000) throw new Error("Generated file is too large: " + file.path);
    totalBytes += bytes;
    if (totalBytes > 250000) throw new Error("The generated plugin project exceeds the 250 KB project limit.");

    generatedFiles.push({ path: file.path, content });
  }

  return validateProject({
    pluginName: plan.pluginName,
    summary: plan.summary,
    files: generatedFiles,
  });
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

  const userRequest =
    "Plugin request:\n" + (prompt || "Build a plugin from the attached project files.") + attachmentContext;

  let project: ReturnType<typeof validateProject>;
  try {
    project = await generatePluginProject(env, userRequest);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown project generation error.";
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
        version: "0.2.2",
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
