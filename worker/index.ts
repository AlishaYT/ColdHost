export interface Env {
  AI: { run(model: string, input: any): Promise<any> };
  DB: D1Database;
  ASSETS: Fetcher;
}
const MODEL = "@cf/google/gemma-4-26b-a4b-it";
const SYSTEM = `You are Cold AI, an expert AI assistant specializing in Minecraft Java and Bedrock, Bukkit, Spigot, Paper, Purpur, Velocity, BungeeCord, Fabric, Forge, NeoForge, Java, JavaScript, TypeScript, web development, Python, server administration, debugging and general software engineering.
Respond in the same language as the user, including Urdu, Hindi and Roman Urdu. Be accurate and practical. Never claim to have searched the internet, run code, compiled a plugin, inspected unavailable files, or fixed a system unless that action actually occurred. If the user provides logs or code, analyze the supplied content and distinguish evidence from assumptions. For Minecraft development, ask for the server platform and version when compatibility depends on it. Provide complete files when requested, not misleading partial snippets. `;
const json = (data: unknown, status=200) => new Response(JSON.stringify(data), { status, headers: { "content-type":"application/json; charset=utf-8", "cache-control":"no-store", "access-control-allow-origin":"*" } });
export default {
 async fetch(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  if (request.method === "OPTIONS") return new Response(null,{headers:{"access-control-allow-origin":"*","access-control-allow-methods":"POST,GET,OPTIONS","access-control-allow-headers":"content-type"}});
  if (url.pathname === "/api/health") return json({ok:true,service:"Cold AI",aiAvailable:!!env.AI,version:"0.1.0"});
  if (url.pathname === "/api/chat" && request.method === "POST") {
   try {
    const body = await request.json() as {messages?:Array<{role:string;content:string}>;attachments?:Array<{name:string;text?:string}>};
    if (!Array.isArray(body.messages) || body.messages.length===0) return json({error:"A message is required."},400);
    const messages = body.messages.slice(-24).map(m=>({role:m.role==="assistant"?"assistant":"user",content:String(m.content||"").slice(0,30000)}));
    const files = Array.isArray(body.attachments) ? body.attachments.slice(0,5) : [];
    const fileContext = files.filter(f=>f.text).map(f=>"\n\n[Uploaded file: "+String(f.name).slice(0,120)+"]\n"+String(f.text).slice(0,100000)).join("");
    if (fileContext && messages.length) messages[messages.length-1].content += fileContext;
    const result = await env.AI.run(MODEL,{messages:[{role:"system",content:SYSTEM},...messages],max_tokens:1800});
    const reply = typeof result === "string" ? result : (result?.response || result?.output_text || "");
    if (!reply) return json({error:"The AI provider returned an empty response."},502);
    return json({reply:String(reply),model:MODEL});
   } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown server error";
    console.error("Cold AI chat error:",message);
    return json({error:"AI request failed: "+message},500);
   }
  }
  if (url.pathname.startsWith("/api/")) return json({error:"API route not found."},404);
  return env.ASSETS.fetch(request);
 }
};