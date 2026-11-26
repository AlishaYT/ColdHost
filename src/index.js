const PAGE = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="theme-color" content="#090e18">
<title>Cold AI</title>
<style>
:root{color-scheme:dark;--bg:#090e18;--panel:#0e1726;--panel2:#131f31;--line:#26364c;--text:#eaf2ff;--muted:#8fa4bf;--blue:#67c8ff;--blue2:#168bd0}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--text);font:14px Inter,Arial,sans-serif}
button,textarea{font:inherit}
button{cursor:pointer}
.app{display:flex;height:100dvh;min-height:560px;overflow:hidden}
.sidebar{width:270px;flex-shrink:0;background:#0b1320;border-right:1px solid var(--line);display:flex;flex-direction:column;padding:16px;gap:14px}
.brand{display:flex;align-items:center;gap:10px;font-size:20px;font-weight:800;color:var(--blue);padding:4px}
.brandmark{font-size:25px}
.newchat,.navitem,.history button{width:100%;text-align:left;border:1px solid transparent;background:transparent;color:var(--text);border-radius:10px;padding:11px 12px}
.newchat{border-color:#29445f;background:#122239}
.newchat:hover,.navitem:hover,.history button:hover{background:#17283d}
.sectionlabel{font-size:10px;letter-spacing:1.3px;color:var(--muted);font-weight:700;margin:8px 4px}
.nav{display:grid;gap:4px}
.navitem{color:#c8d8ea;display:flex;align-items:center;gap:10px}
.navitem.active{background:#172d45;border-color:#2c5275;color:#fff}
.history{overflow:auto;display:grid;gap:3px}
.history button{font-size:12px;color:#aebfd3;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;padding:9px}
.sidebottom{margin-top:auto;color:var(--muted);font-size:11px;line-height:1.6;padding:8px}
.main{min-width:0;flex:1;display:flex;flex-direction:column}
.topbar{height:60px;flex-shrink:0;border-bottom:1px solid var(--line);display:flex;align-items:center;padding:0 22px;gap:12px}
.mobilemenu{display:none;background:none;border:0;color:var(--text);font-size:20px}
.topname{font-weight:700}
.modepill{font-size:11px;color:#9fcdf0;border:1px solid #29445f;border-radius:20px;padding:5px 9px}
.topright{margin-left:auto;color:var(--muted);font-size:12px}
.content{width:min(920px,100%);margin:0 auto;padding:26px 24px 18px;display:flex;flex-direction:column;flex:1;min-height:0}
.welcome{margin:auto auto 22px;text-align:center;max-width:650px}
.welcome .hero{font-size:42px;margin-bottom:10px}
.welcome h1{font-size:27px;margin:0 0 10px}
.welcome p{color:var(--muted);line-height:1.6;margin:0}
.suggestions{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:9px;margin-top:22px}
.suggestion{background:var(--panel);border:1px solid var(--line);border-radius:12px;padding:13px;text-align:left;color:#d7e6f8}
.suggestion:hover{border-color:#4a83ad;background:#132239}
.suggestion b{display:block;margin-bottom:5px}
.suggestion span{font-size:11px;color:var(--muted)}
#messages{overflow:auto;flex:1;display:flex;flex-direction:column;gap:16px;padding:8px 2px 20px}
.message{display:flex;gap:11px;align-items:flex-start;max-width:100%}
.avatar{width:30px;height:30px;border-radius:9px;display:grid;place-items:center;flex-shrink:0;background:#17324d;color:var(--blue);font-weight:800}
.message.user .avatar{background:#25364a;color:#d7e6f8}
.bubble{min-width:0;max-width:calc(100% - 42px);line-height:1.65;white-space:pre-wrap;overflow-wrap:anywhere;color:#e2ecf8}
.message.user .bubble{background:#14243a;border:1px solid #263d58;border-radius:12px;padding:10px 13px}
.message.assistant .bubble{padding:3px 0}
.composerwrap{padding-top:10px}
.composer{border:1px solid #334a64;background:#101b2b;border-radius:16px;padding:10px 12px;box-shadow:0 10px 40px #0003}
#prompt{width:100%;border:0;outline:0;resize:none;min-height:48px;max-height:180px;background:transparent;color:var(--text);padding:7px;font-size:14px;line-height:1.5}
.composerbar{display:flex;align-items:center;gap:8px}
.toolbtn{border:0;background:transparent;color:var(--muted);padding:7px;border-radius:8px}
.toolbtn:hover{background:#1c2b3e;color:white}
.modehint{font-size:11px;color:var(--muted)}
.spacer{flex:1}
.send{border:0;background:var(--blue2);color:white;border-radius:10px;padding:9px 15px;font-weight:700}
.send:disabled{opacity:.5;cursor:wait}
.footnote{text-align:center;color:#6f849e;font-size:10px;margin-top:10px}
.filechip{display:inline-flex;align-items:center;gap:8px;background:#14263b;border:1px solid #31506d;border-radius:10px;padding:9px 12px;margin:8px 8px 0 0;color:#d6eaff;font-size:12px}
.filechip a{color:var(--blue)}
.typing{color:var(--muted);font-size:12px}
@media(max-width:760px){
 .sidebar{position:fixed;z-index:5;inset:0 auto 0 0;transform:translateX(-100%);transition:transform .2s;width:280px;box-shadow:20px 0 60px #0008}
 .sidebar.open{transform:translateX(0)}
 .mobilemenu{display:block}
 .topbar{padding:0 13px}
 .content{padding:18px 13px 12px}
 .suggestions{grid-template-columns:1fr}
 .welcome h1{font-size:23px}
}
</style>
</head>
<body>
<div class="app">
<aside class="sidebar" id="sidebar">
 <div class="brand"><span class="brandmark">❄</span> COLD AI</div>
 <button class="newchat" id="newChat">＋ &nbsp; New chat</button>
 <div>
  <div class="sectionlabel">WORKSPACES</div>
  <nav class="nav" id="modes">
   <button class="navitem active" data-mode="assistant">✦ &nbsp; AI Assistant</button>
   <button class="navitem" data-mode="plugin">⚙ &nbsp; Minecraft Plugin Builder</button>
   <button class="navitem" data-mode="menus">▦ &nbsp; DeluxeMenus Builder</button>
   <button class="navitem" data-mode="config">☷ &nbsp; Config Generator</button>
   <button class="navitem" data-mode="software">⌘ &nbsp; Software Builder</button>
  </nav>
 </div>
 <div class="sectionlabel">RECENT CHATS</div>
 <div class="history" id="history"></div>
 <div class="sidebottom">Cold AI · Early access<br>Project builds require a connected build service.</div>
</aside>
<section class="main">
 <header class="topbar">
  <button class="mobilemenu" id="mobileMenu" aria-label="Open menu">☰</button>
  <span class="topname">Cold AI</span><span class="modepill" id="modePill">AI Assistant</span>
  <span class="topright">● Online</span>
 </header>
 <main class="content">
  <section class="welcome" id="welcome">
   <div class="hero">❄️</div>
   <h1>What are we building today?</h1>
   <p>Describe your idea. Cold AI can help plan projects, generate configurations and assist with code.</p>
   <div class="suggestions">
    <button class="suggestion" data-prompt="Build a Paper Minecraft MOTD plugin with editable config.yml and a 64x64 server icon."><b>⚙ Minecraft plugin</b><span>Create a plugin project</span></button>
    <button class="suggestion" data-prompt="Create a DeluxeMenus shop menu with item names, lore, prices, commands and a complete YAML configuration."><b>▦ DeluxeMenus menu</b><span>Generate menu YAML</span></button>
    <button class="suggestion" data-prompt="Help me debug this project. I will attach the relevant files."><b>⌘ Debug a project</b><span>Find and explain errors</span></button>
    <button class="suggestion" data-prompt="Plan and generate a complete web application project."><b>✦ Build software</b><span>Plan a complete application</span></button>
   </div>
  </section>
  <div id="messages" hidden></div>
  <div class="composerwrap">
   <form class="composer" id="chatForm">
    <textarea id="prompt" placeholder="Message Cold AI..." rows="1" required></textarea>
    <div class="composerbar">
     <button class="toolbtn" type="button" id="attach" title="Attach a text file">＋</button>
     <input type="file" id="fileInput" hidden multiple>
     <span class="modehint" id="modeHint">Ask anything · Enter to send</span>
     <span class="spacer"></span>
     <button class="send" id="send" type="submit">Send ↑</button>
    </div>
   </form>
   <div class="footnote">AI can make mistakes. Review generated files before using them on a live server.</div>
  </div>
 </main>
</section>
</div>
<script>
const $=id=>document.getElementById(id);
const promptBox=$('prompt'),messages=$('messages'),welcome=$('welcome'),historyBox=$('history');
let mode='assistant',chats=[],current=[],currentChatId=null;
async function api(path,options={}){const r=await fetch(path,{credentials:'same-origin',...options});const d=await r.json().catch(()=>({error:'Invalid server response'}));if(!r.ok)throw new Error(d.error||'Request failed');return d;}
async function loadCloudChats(){try{const d=await api('/api/chats');chats=d.chats||[];renderHistory();}catch(e){console.warn('Cloud chat history unavailable:',e.message);}}
const modeNames={assistant:'AI Assistant',plugin:'Minecraft Plugin Builder',menus:'DeluxeMenus Builder',config:'Config Generator',software:'Software Builder'};
const modeHints={assistant:'Ask anything · Enter to send',plugin:'Describe the plugin and target server version',menus:'Describe menu items, lore, prices and commands',config:'Name the plugin and configuration format',software:'Describe the software and desired output'};
let attachments=[];
function setMode(next){
 mode=next;$('modePill').textContent=modeNames[mode];$('modeHint').textContent=modeHints[mode];
 document.querySelectorAll('.navitem').forEach(b=>b.classList.toggle('active',b.dataset.mode===mode));
 promptBox.placeholder=mode==='menus'?'Describe your DeluxeMenus layout...':mode==='plugin'?'Describe the Minecraft plugin you want...':'Message Cold AI...';
 $('sidebar').classList.remove('open');
}
document.querySelectorAll('.navitem').forEach(b=>b.addEventListener('click',()=>setMode(b.dataset.mode)));
$('mobileMenu').onclick=()=>$('sidebar').classList.toggle('open');
function renderHistory(){
 historyBox.innerHTML='';
 chats.slice(0,30).forEach(c=>{const b=document.createElement('button');b.textContent=c.title||'New chat';b.onclick=async()=>{try{const d=await api('/api/chats/'+encodeURIComponent(c.id));currentChatId=c.id;current=(d.messages||[]).map(m=>({role:m.role,content:m.content}));setMode(d.chat?.mode||c.mode||'assistant');renderMessages();}catch(e){alert('Could not load chat: '+e.message);}};historyBox.appendChild(b);});
}
function persistChat(){renderHistory();}
async function saveCloudChat(userText,assistantText){
 const d=await api('/api/chat',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({chatId:currentChatId,message:userText,reply:assistantText,mode})});
 currentChatId=d.chatId;
 await loadCloudChats();
}
function addMessage(role,text){
 const row=document.createElement('div');row.className='message '+(role==='user'?'user':'assistant');
 const avatar=document.createElement('div');avatar.className='avatar';avatar.textContent=role==='user'?'U':'❄';
 const bubble=document.createElement('div');bubble.className='bubble';bubble.textContent=text;
 row.append(avatar,bubble);messages.appendChild(row);messages.scrollTop=messages.scrollHeight;
 return bubble;
}
function renderMessages(){
 welcome.hidden=true;messages.hidden=false;messages.innerHTML='';
 current.forEach(m=>addMessage(m.role,m.content));
}
function newChat(){
 currentChatId=null;current=[];messages.innerHTML='';messages.hidden=true;welcome.hidden=false;promptBox.value='';attachments=[];renderHistory();
}
$('newChat').onclick=newChat;
document.querySelectorAll('.suggestion').forEach(b=>b.onclick=()=>{promptBox.value=b.dataset.prompt;promptBox.focus();});
$('attach').onclick=()=>$('fileInput').click();
$('fileInput').onchange=async e=>{
 attachments=[];
 for(const f of [...e.target.files].slice(0,5)){
  if(f.size>150000)continue;
  const text=await f.text();attachments.push({name:f.name,content:text});
 }
 $('modeHint').textContent=attachments.length?attachments.length+' file(s) attached':modeHints[mode];
};
promptBox.addEventListener('input',()=>{promptBox.style.height='auto';promptBox.style.height=Math.min(promptBox.scrollHeight,180)+'px';});
promptBox.addEventListener('keydown',e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();$('chatForm').requestSubmit();}});
$('chatForm').onsubmit=async e=>{
 e.preventDefault();const text=promptBox.value.trim();if(!text)return;
 welcome.hidden=true;messages.hidden=false;
 const userText=text+(attachments.length?'\n\nAttached files: '+attachments.map(f=>f.name).join(', '):'');
 addMessage('user',userText);current.push({role:'user',content:userText,mode});promptBox.value='';promptBox.style.height='auto';
 const thinking=addMessage('assistant','Cold AI is thinking…');$('send').disabled=true;
 try{
  const response=await fetch('/api/generate',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({message:text,mode,attachments})});
  const data=await response.json();if(!response.ok)throw new Error(data.error||'Request failed');
  thinking.textContent=data.reply||'No response received.';current.push({role:'assistant',content:thinking.textContent});try{await saveCloudChat(userText,thinking.textContent);}catch(saveError){thinking.textContent+='\\n\\n(Note: this reply was generated, but cloud saving failed: '+saveError.message+')';}
 }catch(err){thinking.textContent='Error: '+err.message;}
 finally{$('send').disabled=false;attachments=[];$('fileInput').value='';$('modeHint').textContent=modeHints[mode];messages.scrollTop=messages.scrollHeight;}
};
loadCloudChats();
api('/api/session').then(()=>loadCloudChats()).catch(e=>console.warn('Session setup failed:',e.message));
</script>
</body>
</html>`;

const MODE_INSTRUCTIONS = {
  assistant: "You are Cold AI, a multilingual coding assistant. Explain clearly, debug code, and help plan projects. Be honest about what tools you can actually execute.",
  plugin: "You are Cold AI Minecraft Plugin Builder. Help design complete Java plugin projects. Always ask or state the target server software and Minecraft version when relevant. Output a structured project plan and all required files when asked. Do not claim a JAR was compiled unless a build service actually compiled it.",
  menus: "You are Cold AI DeluxeMenus Builder. Generate valid DeluxeMenus YAML configurations, including menu title, size, open commands, items, slots, material, display_name, lore, click commands, requirements and actions. Ask for the installed DeluxeMenus version if compatibility matters. Output YAML as a file-ready artifact, not pretend it was installed.",
  config: "You are Cold AI configuration generator. Produce valid, properly indented configuration files and explain where each file belongs.",
  software: "You are Cold AI Software Builder. Plan complete applications and provide project files. Never claim files were built or deployed unless an actual build/deploy service did so."
};

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === "GET" && url.pathname === "/") {
      return new Response(PAGE, { headers: { "Content-Type": "text/html;charset=UTF-8" } });
    }

    const cookieHeader = request.headers.get("Cookie") || "";
    const sessionCookie = cookieHeader.split(";").map(v => v.trim()).find(v => v.startsWith("coldai_session="));
    const sessionToken = sessionCookie ? decodeURIComponent(sessionCookie.slice("coldai_session=".length)) : null;
    const sessionRow = sessionToken ? await env.DB.prepare(
      "SELECT user_id FROM sessions WHERE id = ? AND expires_at > datetime('now')"
    ).bind(sessionToken).first() : null;
    const currentUserId = sessionRow?.user_id || null;

    if (request.method === "GET" && url.pathname === "/api/session") {
      if (currentUserId) return Response.json({ authenticated: false, userId: currentUserId, accountType: "guest" });
      const userId = crypto.randomUUID();
      const token = crypto.randomUUID() + crypto.randomUUID();
      await env.DB.prepare("INSERT INTO users (id, display_name) VALUES (?, ?)")
        .bind(userId, "Guest").run();
      await env.DB.prepare("INSERT INTO sessions (id, user_id, expires_at) VALUES (?, ?, datetime('now', '+30 days'))")
        .bind(token, userId).run();
      return Response.json(
        { authenticated: false, userId, accountType: "guest" },
        { headers: { "Set-Cookie": "coldai_session=" + encodeURIComponent(token) + "; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=2592000" } }
      );
    }

    if (request.method === "GET" && url.pathname === "/api/chats") {
      if (!currentUserId) return Response.json({ error: "Session missing. Reload the page." }, { status: 401 });
      const result = await env.DB.prepare(
        "SELECT id, title, mode, updated_at FROM chats WHERE user_id = ? ORDER BY updated_at DESC LIMIT 50"
      ).bind(currentUserId).all();
      return Response.json({ chats: result.results || [] });
    }

    if (request.method === "GET" && url.pathname.startsWith("/api/chats/")) {
      if (!currentUserId) return Response.json({ error: "Session missing. Reload the page." }, { status: 401 });
      const chatId = decodeURIComponent(url.pathname.slice("/api/chats/".length));
      const chat = await env.DB.prepare("SELECT id, title, mode FROM chats WHERE id = ? AND user_id = ?")
        .bind(chatId, currentUserId).first();
      if (!chat) return Response.json({ error: "Chat not found." }, { status: 404 });
      const rows = await env.DB.prepare(
        "SELECT role, content, created_at FROM messages WHERE chat_id = ? AND user_id = ? ORDER BY created_at ASC"
      ).bind(chatId, currentUserId).all();
      return Response.json({ chat, messages: rows.results || [] });
    }

    if (request.method === "GET" && url.pathname === "/health") {
      return Response.json({ name: "Cold AI", status: "online", version: "0.2.0" });
    }

    if (request.method === "POST" && url.pathname === "/api/chat") {
      if (!currentUserId) return Response.json({ error: "Session missing. Reload the page." }, { status: 401 });
      try {
        const body = await request.json();
        const message = String(body.message || "").trim();
        const reply = String(body.reply || "");
        const mode = ["assistant","plugin","menus","config","software"].includes(body.mode) ? body.mode : "assistant";
        let chatId = String(body.chatId || "");
        if (!message || !reply) return Response.json({ error: "Message and reply are required to save." }, { status: 400 });
        let chat = chatId ? await env.DB.prepare("SELECT id FROM chats WHERE id = ? AND user_id = ?").bind(chatId,currentUserId).first() : null;
        if (!chat) {
          chatId = crypto.randomUUID();
          await env.DB.prepare("INSERT INTO chats (id,user_id,title,mode) VALUES (?,?,?,?)")
            .bind(chatId,currentUserId,message.slice(0,70) || "New Chat",mode).run();
        } else {
          await env.DB.prepare("UPDATE chats SET updated_at = CURRENT_TIMESTAMP, mode = ? WHERE id = ? AND user_id = ?")
            .bind(mode,chatId,currentUserId).run();
        }
        await env.DB.batch([
          env.DB.prepare("INSERT INTO messages (id,chat_id,user_id,role,content) VALUES (?,?,?,?,?)")
            .bind(crypto.randomUUID(),chatId,currentUserId,"user",message),
          env.DB.prepare("INSERT INTO messages (id,chat_id,user_id,role,content) VALUES (?,?,?,?,?)")
            .bind(crypto.randomUUID(),chatId,currentUserId,"assistant",reply)
        ]);
        return Response.json({ saved: true, chatId });
      } catch (error) {
        console.error("D1 chat save error:", error);
        return Response.json({ error: "Could not save chat: " + error.message }, { status: 500 });
      }
    }


    if (request.method === "POST" && url.pathname === "/api/generate") {
      try {
        const body = await request.json();
        const message = String(body.message || "").trim();
        const mode = MODE_INSTRUCTIONS[body.mode] ? body.mode : "assistant";
        const attachments = Array.isArray(body.attachments) ? body.attachments.slice(0, 5) : [];
        if (!message) return Response.json({ error: "Please enter a message." }, { status: 400 });
        const attachmentText = attachments.map(file =>
          "\n\nFILE: " + String(file.name || "attachment").slice(0, 120) +
          "\n" + String(file.content || "").slice(0, 12000)
        ).join("");
        const result = await env.AI.run("@cf/google/gemma-4-26b-a4b-it", {
          messages: [
            { role: "system", content: MODE_INSTRUCTIONS[mode] },
            { role: "user", content: message + attachmentText }
          ],
          chat_template_kwargs: { enable_thinking: false },
          max_tokens: 1800
        });
        const reply = result?.response || result?.choices?.[0]?.message?.content;
        if (!reply) return Response.json({ error: "AI returned an empty response. Check Cloudflare logs." }, { status: 502 });
        return Response.json({ reply, mode });
      } catch (error) {
        console.error("Cold AI generation error:", error);
        return Response.json({ error: "AI request failed: " + error.message }, { status: 500 });
      }
    }

    return Response.json({ error: "Not found" }, { status: 404 });
  }
};