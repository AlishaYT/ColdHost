import { useEffect, useRef, useState } from "react";
import { Plus, PanelLeftClose, PanelLeftOpen, Send, Paperclip, Square, Copy, Trash2, Sun, Moon, Sparkles, Bot, User, X, FileText, Hammer, Download, ExternalLink } from "lucide-react";

type Message = { id: string; role: "user" | "assistant"; content: string; downloadUrl?: string; runUrl?: string };
type Chat = { id: string; title: string; messages: Message[]; updatedAt: number };
type Attachment = { id: string; name: string; type: string; text?: string; preview?: string };

const STORE = "coldai_chats_v1";
const MAX_FILES = 5;
const MAX_FILE_SIZE = 2 * 1024 * 1024;
const TEXT_EXTENSIONS = new Set([
  "txt", "log", "java", "kt", "kts", "yml", "yaml", "json", "xml",
  "properties", "md", "csv", "js", "jsx", "ts", "tsx", "html", "css",
  "scss", "toml", "cfg", "conf", "gradle", "py", "sh", "sql", "diff",
]);
const IMAGE_EXTENSIONS = new Set(["png", "jpg", "jpeg", "webp"]);
const ACCEPTED_FILES = [
  ...Array.from(TEXT_EXTENSIONS, ext => "." + ext),
  ...Array.from(IMAGE_EXTENSIONS, ext => "." + ext),
].join(",");
const uid = () => crypto.randomUUID();
const titleFrom = (s: string) => s.trim().slice(0, 42) || "New chat";
const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

function isPluginBuildIntent(prompt: string): boolean {
  const value = prompt.trim();
  if (!value) return false;
  if (/^(how do i|how can i|what is|explain|show me how|steps to|tutorial|why does|why is)\b/i.test(value)) {
    return false;
  }
  return (
    /\b(build|make|create|generate|develop)\b.{0,65}\b(minecraft\s+|paper\s+|spigot\s+|bukkit\s+)?plugin\b/i.test(value) ||
    /\b(build|make|create|generate|compile|package)\b.{0,50}\b(jar|\.jar)\b/i.test(value) ||
    /\b(convert|turn)\b.{0,35}\b(plugin|java\s+project)\b.{0,20}\b(jar|\.jar)\b/i.test(value)
  );
}

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => typeof reader.result === "string" ? resolve(reader.result) : reject(new Error("Could not read " + file.name));
    reader.onerror = () => reject(new Error("Could not read " + file.name));
    reader.readAsDataURL(file);
  });
}

export default function App() {
  const [chats, setChats] = useState<Chat[]>(() => { try { return JSON.parse(localStorage.getItem(STORE) || "[]"); } catch { return []; } });
  const [activeId, setActiveId] = useState<string | null>(() => localStorage.getItem("coldai_active_v1"));
  const [draft, setDraft] = useState("");
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [busy, setBusy] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [light, setLight] = useState(false);
  const [error, setError] = useState("");
  const [apiStatus, setApiStatus] = useState("Checking AI");
  const [dragActive, setDragActive] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const dragDepth = useRef(0);
  const active = chats.find(c => c.id === activeId) || null;

  useEffect(() => { localStorage.setItem(STORE, JSON.stringify(chats)); }, [chats]);
  useEffect(() => { if (activeId) localStorage.setItem("coldai_active_v1", activeId); else localStorage.removeItem("coldai_active_v1"); }, [activeId]);
  useEffect(() => {
    fetch("/api/health").then(r => r.ok ? r.json() : Promise.reject())
      .then(data => setApiStatus(data.jarBuilderAvailable ? "AI + JAR builder ready" : "AI ready · JAR builder setup needed"))
      .catch(() => setApiStatus("AI unavailable"));
  }, []);
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [active?.messages, busy]);

  function newChat() {
    if (busy) return;
    const chat: Chat = { id: uid(), title: "New chat", messages: [], updatedAt: Date.now() };
    setChats(prev => [chat, ...prev]); setActiveId(chat.id); setDraft(""); setAttachments([]); setError("");
    setTimeout(() => inputRef.current?.focus(), 20);
  }

  function updateChat(id: string, fn: (c: Chat) => Chat) {
    setChats(prev => prev.map(c => c.id === id ? fn(c) : c).sort((a,b) => b.updatedAt-a.updatedAt));
  }

  function updateMessage(chatId: string, messageId: string, patch: Partial<Message>) {
    updateChat(chatId, c => ({
      ...c,
      messages: c.messages.map(m => m.id === messageId ? { ...m, ...patch } : m),
      updatedAt: Date.now(),
    }));
  }

  function deleteChat(id: string) {
    setChats(prev => prev.filter(c => c.id !== id));
    if (activeId === id) { const next = chats.find(c => c.id !== id); setActiveId(next?.id || null); }
  }

  async function addFiles(incoming: File[]) {
    if (!incoming.length) return;
    const accepted: Attachment[] = [];
    const problems: string[] = [];

    for (const file of incoming) {
      if (attachments.length + accepted.length >= MAX_FILES) {
        problems.push("You can attach up to 5 files per message.");
        break;
      }
      if (file.size > MAX_FILE_SIZE) {
        problems.push(file.name + " is larger than 2 MB.");
        continue;
      }

      const ext = file.name.toLowerCase().split(".").pop() || "";
      const isImage = file.type.startsWith("image/") && IMAGE_EXTENSIONS.has(ext);
      const isText = file.type.startsWith("text/") || TEXT_EXTENSIONS.has(ext) ||
        ["application/json", "application/xml", "application/javascript"].includes(file.type);

      if (!isImage && !isText) {
        problems.push(file.name + ": unsupported file type. Add a text, log, code, config or PNG/JPG/WEBP image.");
        continue;
      }

      try {
        if (isImage) {
          const preview = await readAsDataUrl(file);
          accepted.push({ id: uid(), name: file.name, type: file.type, preview });
        } else {
          const text = await file.text();
          accepted.push({ id: uid(), name: file.name, type: file.type || "text/plain", text: text.slice(0, 200000) });
        }
      } catch (e) {
        problems.push(e instanceof Error ? e.message : "Could not read " + file.name);
      }
    }

    if (accepted.length) {
      setAttachments(prev => [...prev, ...accepted].slice(0, MAX_FILES));
      setError("");
    }
    if (problems.length) setError(problems.join(" "));
    if (fileRef.current) fileRef.current.value = "";
    inputRef.current?.focus();
  }

  function handleDragEnter(e: React.DragEvent<HTMLElement>) {
    if (!e.dataTransfer.types.includes("Files")) return;
    e.preventDefault();
    dragDepth.current += 1;
    setDragActive(true);
  }

  function handleDragOver(e: React.DragEvent<HTMLElement>) {
    if (!e.dataTransfer.types.includes("Files")) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
  }

  function handleDragLeave(e: React.DragEvent<HTMLElement>) {
    if (!e.dataTransfer.types.includes("Files")) return;
    e.preventDefault();
    dragDepth.current = Math.max(0, dragDepth.current - 1);
    if (dragDepth.current === 0) setDragActive(false);
  }

  function handleDrop(e: React.DragEvent<HTMLElement>) {
    if (!e.dataTransfer.files.length) return;
    e.preventDefault();
    dragDepth.current = 0;
    setDragActive(false);
    void addFiles(Array.from(e.dataTransfer.files));
  }

  async function send() {
    const prompt = draft.trim();
    if ((!prompt && !attachments.length) || busy) return;
    if (isPluginBuildIntent(prompt)) {
      await buildJar();
      return;
    }
    const chatId = activeId || uid();
    let chat = chats.find(c => c.id === chatId);
    if (!chat) {
      chat = { id: chatId, title: titleFrom(prompt || attachments[0]?.name || "New chat"), messages: [], updatedAt: Date.now() };
      setChats(prev => [chat!, ...prev]); setActiveId(chatId);
    }
    const userContent = prompt || "Please inspect the attached file(s).";
    const userMsg: Message = {
      id: uid(), role: "user",
      content: userContent + (attachments.length ? "\n\n" + attachments.map(a => "[Attached: " + a.name + "]").join("\n") : ""),
    };
    const history = [...chat.messages, userMsg];
    updateChat(chatId, c => ({
      ...c,
      title: c.messages.length ? c.title : titleFrom(prompt || attachments[0]?.name || "New chat"),
      messages: history,
      updatedAt: Date.now(),
    }));
    const files = attachments;
    setDraft(""); setAttachments([]); setBusy(true); setError("");

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: history.map(m => ({ role: m.role, content: m.content })),
          attachments: files.map(f => ({ name: f.name, type: f.type, text: f.text, data: f.preview })),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "AI request failed (" + res.status + ")");
      const reply = String(data.reply || "").trim();
      if (!reply) throw new Error("The AI returned an empty response.");
      updateChat(chatId, c => ({ ...c, messages: [...c.messages, {id:uid(),role:"assistant",content:reply}], updatedAt:Date.now() }));
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Unknown error";
      setError(msg);
      updateChat(chatId, c => ({ ...c, messages: [...c.messages, {id:uid(),role:"assistant",content:"I couldn't complete that request. " + msg}], updatedAt:Date.now() }));
    } finally {
      setBusy(false);
      inputRef.current?.focus();
    }
  }

  async function buildJar() {
    const prompt = draft.trim() || (attachments.length ? "Build a Minecraft plugin project using the attached source files where applicable." : "");
    if (!prompt || busy) return;

    const chatId = activeId || uid();
    let chat = chats.find(c => c.id === chatId);
    if (!chat) {
      chat = { id: chatId, title: titleFrom(prompt), messages: [], updatedAt: Date.now() };
      setChats(prev => [chat!, ...prev]); setActiveId(chatId);
    }

    const files = attachments;
    const userMsg: Message = {
      id: uid(),
      role: "user",
      content: prompt + (files.length ? "\n\n" + files.map(a => "[Attached: " + a.name + "]").join("\n") : ""),
    };
    const assistantId = uid();
    updateChat(chatId, c => ({
      ...c,
      title: c.messages.length ? c.title : titleFrom(prompt),
      messages: [...c.messages, userMsg, { id: assistantId, role: "assistant", content: "❄ Preparing the Maven project with Cold AI…" }],
      updatedAt: Date.now(),
    }));

    setDraft("");
    setAttachments([]);
    setBusy(true);
    setError("");

    try {
      const start = await fetch("/api/plugin/build", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt,
          attachments: files.map(f => ({ name: f.name, type: f.type, text: f.text })),
        }),
      });
      const started = await start.json().catch(() => ({}));
      if (!start.ok) throw new Error(started.error || "Could not start the JAR build.");
      const buildId = String(started.buildId || "");
      if (!buildId) throw new Error("The build service did not return a build ID.");

      updateMessage(chatId, assistantId, {
        content: "✅ Maven project generated for " + String(started.pluginName || "your plugin") + ".\n" +
          String(started.summary || "") + "\n\n⏳ GitHub's private Java builder is compiling the JAR…",
        runUrl: started.runUrl,
      });

      for (let attempt = 0; attempt < 150; attempt++) {
        await wait(4000);
        const statusResponse = await fetch("/api/plugin/status?id=" + encodeURIComponent(buildId), { cache: "no-store" });
        const status = await statusResponse.json().catch(() => ({}));

        if (!statusResponse.ok) throw new Error(status.error || "Could not read plugin build status.");
        if (status.status === "success") {
          updateMessage(chatId, assistantId, {
            content: "✅ " + String(started.pluginName || "Your plugin") + " is ready. Your compiled Minecraft plugin file is attached below.",
            downloadUrl: String(status.downloadUrl || ""),
            runUrl: String(status.runUrl || started.runUrl || ""),
          });
          return;
        }
        if (status.status === "failure") {
          updateMessage(chatId, assistantId, {
            content: "❌ Plugin compilation failed.\n" + String(status.message || "Open the build logs to inspect the Maven error."),
            runUrl: String(status.runUrl || started.runUrl || ""),
          });
          return;
        }

        if (attempt % 3 === 2) {
          updateMessage(chatId, assistantId, {
            content: "✅ Maven project generated for " + String(started.pluginName || "your plugin") + ".\n" +
              String(started.summary || "") + "\n\n⏳ Build status: " + String(status.status || "queued") + ". Compiling with Maven and Java 21…",
            runUrl: String(status.runUrl || started.runUrl || ""),
          });
        }
      }

      updateMessage(chatId, assistantId, {
        content: "The plugin build is still running. Open the build run to check its progress, then try the build status again.",
        runUrl: String(started.runUrl || "https://github.com/AlishaYT/ColdAI-Builder/actions"),
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Unknown build error";
      setError(msg);
      updateMessage(chatId, assistantId, { content: "I couldn't build the JAR. " + msg });
    } finally {
      setBusy(false);
      inputRef.current?.focus();
    }
  }

  async function copy(text: string) {
    try { await navigator.clipboard.writeText(text); }
    catch { setError("Clipboard access was blocked by the browser."); }
  }

  const starter = [
    "Debug this Minecraft server error log",
    "Create a Paper plugin with commands and permissions",
    "Explain this Java exception",
    "Help optimize my Minecraft server",
  ];

  return <div className={light ? "app light" : "app"}>
    <aside className={sidebarOpen ? "sidebar" : "sidebar collapsed"}>
      <div className="brand"><div className="brand-mark">❄</div>{sidebarOpen && <div><b>Cold AI</b><small>MINECRAFT · SOFTWARE · AI</small></div>}</div>
      <button className="new-chat" type="button" onClick={newChat} disabled={busy}><Plus size={17}/>{sidebarOpen && "New chat"}</button>
      {sidebarOpen && <><div className="side-label">RECENTS</div><div className="chat-list">{chats.map(c=><div className={c.id===activeId?"chat-item selected":"chat-item"} key={c.id}><button type="button" onClick={()=>setActiveId(c.id)} title={c.title}>{c.title}</button><button type="button" className="delete-chat" onClick={()=>deleteChat(c.id)} aria-label="Delete chat"><Trash2 size={14}/></button></div>)}</div></>}
      <div className="side-bottom"><button type="button" className="icon-button" onClick={()=>setSidebarOpen(!sidebarOpen)} title="Toggle sidebar">{sidebarOpen?<PanelLeftClose size={18}/>:<PanelLeftOpen size={18}/>}</button><button type="button" className="icon-button" onClick={()=>setLight(!light)} title="Toggle theme">{light?<Moon size={18}/>:<Sun size={18}/>}</button><span className="status"><i/> {sidebarOpen && apiStatus}</span></div>
    </aside>
    <main className={dragActive ? "main drag-active" : "main"}
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}>
      {dragActive && <div className="drop-overlay"><div className="drop-card"><Paperclip size={28}/><strong>Drop files to attach</strong><span>Up to 5 files · 2 MB each</span></div></div>}
      <header className="topbar"><div className="top-left"><span className="mobile-brand">❄ Cold AI</span><span className="model-label"><Sparkles size={14}/> Cold AI <span className="model-sub">· Minecraft & Software Assistant</span></span></div><div className="top-right"><span className="status top-status"><i/> {apiStatus}</span></div></header>
      <section className="conversation">
        {!active || active.messages.length===0 ? <div className="welcome"><div className="welcome-icon"><span>❄</span></div><h1>What are we building today?</h1><p>Your AI partner for Minecraft development, debugging and software engineering.</p><div className="suggestions">{starter.map(s=><button type="button" key={s} onClick={()=>setDraft(s)}>{s}<span>↗</span></button>)}</div></div> :
          <div className="messages">{active.messages.map(m=><article className={"message "+m.role} key={m.id}><div className="message-avatar">{m.role==="assistant"?<Bot size={18}/>:<User size={18}/>}</div><div className="message-body"><div className="message-role">{m.role==="assistant"?"Cold AI":"You"}</div><pre>{m.content}</pre>{m.downloadUrl&&<a className="jar-download" href={m.downloadUrl}><Download size={15}/> Download .jar</a>}{m.runUrl&&<a className="build-logs" href={m.runUrl} target="_blank" rel="noreferrer"><ExternalLink size={13}/> Build logs</a>}{m.role==="assistant"&&<div className="message-actions"><button type="button" onClick={()=>copy(m.content)}><Copy size={14}/> Copy</button></div>}</div></article>)}{busy&&<div className="message assistant"><div className="message-avatar"><Bot size={18}/></div><div className="message-body"><div className="message-role">Cold AI</div><div className="typing"><i/><i/><i/> Working…</div></div></div>}<div ref={bottomRef}/></div>}
      </section>
      <footer className="composer-wrap">
        {error&&<div className="error-banner" role="alert">{error}<button type="button" onClick={()=>setError("")}><X size={14}/></button></div>}
        {attachments.length>0&&<div className="attachments">{attachments.map(a=><div className="attachment" key={a.id}>{a.preview?<img src={a.preview} alt={a.name}/>:<FileText size={17}/>}<span>{a.name}</span><button type="button" aria-label={"Remove "+a.name} onClick={()=>setAttachments(p=>p.filter(x=>x.id!==a.id))}><X size={13}/></button></div>)}</div>}
        <div className="composer">
          <textarea ref={inputRef} value={draft} onChange={e=>setDraft(e.target.value)}
            onPaste={e=>{ const pasted = Array.from(e.clipboardData.files); if (pasted.length) { e.preventDefault(); void addFiles(pasted); } }}
            onKeyDown={e=>{if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();void send();}}}
            placeholder="Message Cold AI…" rows={1} disabled={busy}/>
          <div className="composer-tools">
            <div>
              <button type="button" className="tool-button" onClick={()=>fileRef.current?.click()} disabled={busy} title="Attach files" aria-label="Attach files"><Paperclip size={18}/></button>
              <span className="hint">Attach/drop files · Plugin requests auto-build a JAR</span>
            </div>
            <div className="composer-actions">
              <button type="button" className="build-button" onClick={()=>void buildJar()} disabled={busy||(!draft.trim()&&!attachments.length)} title="Generate, compile and download a Minecraft plugin JAR"><Hammer size={15}/> Build JAR</button>
              <button type="button" className="send-button" onClick={()=>void send()} disabled={busy||(!draft.trim()&&!attachments.length)} title="Send message">{busy?<Square size={15}/>:<Send size={16}/>}</button>
            </div>
          </div>
          <input ref={fileRef} className="file-picker" type="file" multiple accept={ACCEPTED_FILES}
            onChange={e=>{ void addFiles(Array.from(e.currentTarget.files || [])); }} aria-label="Choose files"/>
        </div>
        <div className="disclaimer">Cold AI can make mistakes. Verify important code and server changes before deploying.</div>
      </footer>
    </main>
  </div>;
}
