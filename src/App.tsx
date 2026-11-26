import { useEffect, useRef, useState } from "react";
import { Plus, PanelLeftClose, PanelLeftOpen, Send, Paperclip, Square, Copy, RotateCcw, Trash2, Sun, Moon, Sparkles, Bot, User, X, FileText, Image as ImageIcon } from "lucide-react";

type Message = { id: string; role: "user" | "assistant"; content: string };
type Chat = { id: string; title: string; messages: Message[]; updatedAt: number };
type Attachment = { id: string; name: string; type: string; text?: string; preview?: string };

const STORE = "coldai_chats_v1";
const uid = () => crypto.randomUUID();
const titleFrom = (s: string) => s.trim().slice(0, 42) || "New chat";

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
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const active = chats.find(c => c.id === activeId) || null;

  useEffect(() => { localStorage.setItem(STORE, JSON.stringify(chats)); }, [chats]);
  useEffect(() => { if (activeId) localStorage.setItem("coldai_active_v1", activeId); else localStorage.removeItem("coldai_active_v1"); }, [activeId]);
  useEffect(() => { fetch("/api/health").then(r => r.ok ? r.json() : Promise.reject()).then(() => setApiStatus("AI ready")).catch(() => setApiStatus("AI unavailable")); }, []);
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
  function deleteChat(id: string) {
    setChats(prev => prev.filter(c => c.id !== id));
    if (activeId === id) { const next = chats.find(c => c.id !== id); setActiveId(next?.id || null); }
  }
  async function addFiles(list: FileList | null) {
    if (!list) return;
    const accepted: Attachment[] = [];
    for (const file of Array.from(list).slice(0, 5)) {
      if (file.size > 2 * 1024 * 1024) { setError(file.name + " is larger than 2 MB."); continue; }
      if (file.type.startsWith("image/")) {
        const preview = await new Promise<string>((resolve,reject) => { const r = new FileReader(); r.onload=()=>resolve(String(r.result)); r.onerror=reject; r.readAsDataURL(file); });
        accepted.push({ id: uid(), name: file.name, type: file.type, preview });
      } else {
        const text = await file.text();
        accepted.push({ id: uid(), name: file.name, type: file.type || "text/plain", text: text.slice(0, 100000) });
      }
    }
    setAttachments(prev => [...prev, ...accepted].slice(0,5));
    if (fileRef.current) fileRef.current.value = "";
  }
  async function send() {
    const prompt = draft.trim();
    if ((!prompt && !attachments.length) || busy) return;
    const chatId = activeId || uid();
    let chat = chats.find(c => c.id === chatId);
    if (!chat) { chat = { id: chatId, title: titleFrom(prompt || attachments[0]?.name || "New chat"), messages: [], updatedAt: Date.now() }; setChats(prev => [chat!, ...prev]); setActiveId(chatId); }
    const userContent = prompt || "Please inspect the attached file(s).";
    const userMsg: Message = { id: uid(), role: "user", content: userContent + (attachments.length ? "\n\n" + attachments.map(a => "[Attached: " + a.name + "]").join("\n") : "") };
    const history = [...chat.messages, userMsg];
    updateChat(chatId, c => ({ ...c, title: c.messages.length ? c.title : titleFrom(prompt || attachments[0]?.name || "New chat"), messages: history, updatedAt: Date.now() }));
    const files = attachments; setDraft(""); setAttachments([]); setBusy(true); setError("");
    try {
      const res = await fetch("/api/chat", { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({ messages: history.map(m => ({role:m.role,content:m.content})), attachments: files.map(f => ({name:f.name,type:f.type,text:f.text})) }) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "AI request failed (" + res.status + ")");
      const reply = String(data.reply || "").trim();
      if (!reply) throw new Error("The AI returned an empty response.");
      updateChat(chatId, c => ({ ...c, messages: [...c.messages, {id:uid(),role:"assistant",content:reply}], updatedAt:Date.now() }));
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Unknown error";
      setError(msg);
      updateChat(chatId, c => ({ ...c, messages: [...c.messages, {id:uid(),role:"assistant",content:"I couldn't complete that request. " + msg}], updatedAt:Date.now() }));
    } finally { setBusy(false); inputRef.current?.focus(); }
  }
  async function copy(text: string) { try { await navigator.clipboard.writeText(text); } catch { setError("Clipboard access was blocked by the browser."); } }
  const starter = ["Debug this Minecraft server error log","Create a Paper plugin with commands and permissions","Explain this Java exception","Help optimize my Minecraft server"];

  return <div className={light ? "app light" : "app"}>
    <aside className={sidebarOpen ? "sidebar" : "sidebar collapsed"}>
      <div className="brand"><div className="brand-mark">❄</div>{sidebarOpen && <div><b>Cold AI</b><small>MINECRAFT · SOFTWARE · AI</small></div>}</div>
      <button className="new-chat" onClick={newChat} disabled={busy}><Plus size={17}/>{sidebarOpen && "New chat"}</button>
      {sidebarOpen && <><div className="side-label">RECENTS</div><div className="chat-list">{chats.map(c=><div className={c.id===activeId?"chat-item selected":"chat-item"} key={c.id}><button onClick={()=>setActiveId(c.id)} title={c.title}>{c.title}</button><button className="delete-chat" onClick={()=>deleteChat(c.id)} aria-label="Delete chat"><Trash2 size={14}/></button></div>)}</div></>}
      <div className="side-bottom"><button className="icon-button" onClick={()=>setSidebarOpen(!sidebarOpen)} title="Toggle sidebar">{sidebarOpen?<PanelLeftClose size={18}/>:<PanelLeftOpen size={18}/>}</button><button className="icon-button" onClick={()=>setLight(!light)} title="Toggle theme">{light?<Moon size={18}/>:<Sun size={18}/>}</button><span className="status"><i/> {sidebarOpen && apiStatus}</span></div>
    </aside>
    <main className="main">
      <header className="topbar"><div className="top-left"><span className="mobile-brand">❄ Cold AI</span><span className="model-label"><Sparkles size={14}/> Cold AI <span className="model-sub">· Minecraft & Software Assistant</span></span></div><div className="top-right"><span className="status top-status"><i/> {apiStatus}</span></div></header>
      <section className="conversation">
        {!active || active.messages.length===0 ? <div className="welcome"><div className="welcome-icon"><span>❄</span></div><h1>What are we building today?</h1><p>Your AI partner for Minecraft development, debugging and software engineering.</p><div className="suggestions">{starter.map(s=><button key={s} onClick={()=>setDraft(s)}>{s}<span>↗</span></button>)}</div></div> :
          <div className="messages">{active.messages.map(m=><article className={"message "+m.role} key={m.id}><div className="message-avatar">{m.role==="assistant"?<Bot size={18}/>:<User size={18}/>}</div><div className="message-body"><div className="message-role">{m.role==="assistant"?"Cold AI":"You"}</div><pre>{m.content}</pre>{m.role==="assistant"&&<div className="message-actions"><button onClick={()=>copy(m.content)}><Copy size={14}/> Copy</button></div>}</div></article>)}{busy&&<div className="message assistant"><div className="message-avatar"><Bot size={18}/></div><div className="message-body"><div className="message-role">Cold AI</div><div className="typing"><i/><i/><i/> Thinking…</div></div></div>}<div ref={bottomRef}/></div>}
      </section>
      <footer className="composer-wrap">
        {error&&<div className="error-banner">{error}<button onClick={()=>setError("")}><X size={14}/></button></div>}
        {attachments.length>0&&<div className="attachments">{attachments.map(a=><div className="attachment" key={a.id}>{a.preview?<img src={a.preview} alt={a.name}/>:<FileText size={17}/>}<span>{a.name}</span><button onClick={()=>setAttachments(p=>p.filter(x=>x.id!==a.id))}><X size={13}/></button></div>)}</div>}
        <div className="composer"><textarea ref={inputRef} value={draft} onChange={e=>setDraft(e.target.value)} onKeyDown={e=>{if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();send();}}} placeholder="Message Cold AI…" rows={1} disabled={busy}/><div className="composer-tools"><div><button className="tool-button" onClick={()=>fileRef.current?.click()} disabled={busy} title="Attach files"><Paperclip size={18}/></button><span className="hint">Upload logs, code, configs or images · Enter to send</span></div><div><button className="send-button" onClick={send} disabled={busy||(!draft.trim()&&!attachments.length)} title="Send message">{busy?<Square size={15}/>:<Send size={16}/>}</button></div></div><input ref={fileRef} type="file" hidden multiple accept=".txt,.log,.java,.yml,.yaml,.json,.xml,.properties,.md,.csv,.png,.jpg,.jpeg,.webp,.pdf" onChange={e=>addFiles(e.target.files)}/></div>
        <div className="disclaimer">Cold AI can make mistakes. Verify important code and server changes before deploying.</div>
      </footer>
    </main>
  </div>;
}