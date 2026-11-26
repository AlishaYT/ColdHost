
const PAGE = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Cold AI</title>
<style>
*{box-sizing:border-box}
body{margin:0;background:#090e18;color:#eaf2ff;font-family:Arial,sans-serif}
header{padding:20px;text-align:center;border-bottom:1px solid #26344a}
.logo{font-size:30px;font-weight:bold;color:#8bd5ff}
main{max-width:850px;margin:35px auto;padding:15px}
#chat{height:55vh;overflow-y:auto;background:#111b2b;border:1px solid #263c57;border-radius:14px;padding:18px}
.msg{padding:13px;margin:10px 0;border-radius:10px;white-space:pre-wrap;overflow-wrap:anywhere;line-height:1.5}
.user{background:#183b5a}
.ai{background:#202b3c}
form{display:flex;gap:10px;margin-top:15px}
textarea{flex:1;resize:vertical;min-height:55px;max-height:160px;background:#111b2b;color:white;border:1px solid #38516e;border-radius:10px;padding:15px;font-size:15px}
button{background:#168bd0;color:white;border:0;border-radius:10px;padding:0 22px;font-weight:bold;cursor:pointer}
button:disabled{opacity:.5}
small{display:block;text-align:center;color:#91a4bd;margin-top:15px}
</style>
</head>
<body>
<header>
<div class="logo">❄ COLD AI</div>
<div>Your AI Coding Assistant</div>
</header>
<main>
<div id="chat">
<div class="msg ai">Hello! I am Cold AI. Ask me to write code, explain programming or help with your software project.</div>
</div>
<form id="form">
<textarea id="message" placeholder="Ask Cold AI anything..." required></textarea>
<button id="send">Send</button>
</form>
<small>Cold AI • Powered by Cloudflare Workers AI</small>
</main>
<script>
const form=document.getElementById('form');
const input=document.getElementById('message');
const chat=document.getElementById('chat');
const send=document.getElementById('send');

function addMessage(text,type){
 const div=document.createElement('div');
 div.className='msg '+type;
 div.textContent=text;
 chat.appendChild(div);
 chat.scrollTop=chat.scrollHeight;
}

form.addEventListener('submit',async function(e){
 e.preventDefault();
 const message=input.value.trim();
 if(!message)return;
 addMessage(message,'user');
 input.value='';
 send.disabled=true;
 send.textContent='...';
 try{
  const response=await fetch('/api/chat',{
   method:'POST',
   headers:{'Content-Type':'application/json'},
   body:JSON.stringify({message})
  });
  const data=await response.json();
  if(!response.ok)throw new Error(data.error||'Request failed');
  addMessage(data.reply||'No response received.','ai');
 }catch(error){
  addMessage('Error: '+error.message,'ai');
 }
 send.disabled=false;
 send.textContent='Send';
});
</script>
</body>
</html>`;

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === "GET" && url.pathname === "/") {
      return new Response(PAGE, {
        headers: { "Content-Type": "text/html;charset=UTF-8" }
      });
    }

    if (request.method === "GET" && url.pathname === "/health") {
      return Response.json({
        name: "Cold AI",
        status: "online"
      });
    }

    if (request.method === "POST" && url.pathname === "/api/chat") {
      try {
        const body = await request.json();
        const message = String(body.message || "").trim();

        if (!message) {
          return Response.json(
            { error: "Please enter a message." },
            { status: 400 }
          );
        }

        const result = await env.AI.run(
          "@cf/google/gemma-4-26b-a4b-it",
          {
            messages: [
              {
                role: "system",
                content: "You are Cold AI, a multilingual AI coding assistant. Help users understand programming, write code, debug errors and plan software projects. Be clear and accurate. Do not claim to have created or compiled files unless that actually happened."
              },
              {
                role: "user",
                content: message
              }
            ]
          }
        );

        return Response.json({
          reply: result.response || "I could not generate a response."
        });

      } catch (error) {
        return Response.json(
          { error: "AI request failed: " + error.message },
          { status: 500 }
        );
      }
    }

    return Response.json({ error: "Not found" }, { status: 404 });
  }
};
