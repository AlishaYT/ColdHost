export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === "GET") {
      return Response.json({
        name: "Cold AI",
        status: "online",
        message: "Cold AI API is ready!"
      });
    }

    if (url.pathname === "/api/chat" && request.method === "POST") {
      try {
        const body = await request.json();

        if (!body.message) {
          return Response.json(
            { error: "Message is required" },
            { status: 400 }
          );
        }

        const result = await env.AI.run(
          "@cf/meta/llama-3.1-8b-instruct",
          {
            messages: [
              {
                role: "system",
                content: "You are Cold AI, a multilingual AI coding assistant and software development assistant."
              },
              {
                role: "user",
                content: body.message
              }
            ]
          }
        );

        return Response.json({
          reply: result.response
        });
      } catch (error) {
        return Response.json(
          { error: "AI request failed", details: error.message },
          { status: 500 }
        );
      }
    }

    return Response.json({ error: "Not found" }, { status: 404 });
  }
};
