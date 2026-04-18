export const config = { runtime: "edge" };

const GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions";

interface Message {
  role: "user" | "assistant" | "system";
  content: string;
}

export default async function handler(req: Request) {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405 });
  }

  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    return new Response(JSON.stringify({ error: "GROQ_API_KEY is not configured." }), { status: 500 });
  }

  const { messages } = await req.json() as { messages?: Message[] };

  if (!Array.isArray(messages) || messages.length === 0) {
    return new Response(JSON.stringify({ error: "messages array is required." }), { status: 400 });
  }

  const systemMessage: Message = {
    role: "system",
    content: "You are Lumina, a helpful, thoughtful, and articulate AI assistant. Keep your answers clear, friendly, and genuinely useful. Be concise unless depth is needed.",
  };

  const groqRes = await fetch(GROQ_API_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "llama-3.3-70b-versatile",
      messages: [systemMessage, ...messages],
      max_tokens: 1024,
      temperature: 0.7,
      stream: true,
    }),
  });

  if (!groqRes.ok) {
    const err = await groqRes.json().catch(() => ({})) as { error?: { message?: string } };
    return new Response(JSON.stringify({ error: err.error?.message ?? "Groq API error" }), { status: groqRes.status });
  }

  // Transform Groq's SSE stream into our own SSE format
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const reader = groqRes.body!.getReader();
      const decoder = new TextDecoder();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split("\n").filter(l => l.trim());

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const data = line.slice(6);
          if (data === "[DONE]") {
            controller.enqueue(encoder.encode("data: [DONE]\n\n"));
            continue;
          }
          try {
            const parsed = JSON.parse(data);
            const delta = parsed.choices?.[0]?.delta?.content;
            if (delta) {
              controller.enqueue(encoder.encode(`data: ${JSON.stringify({ text: delta })}\n\n`));
            }
          } catch { /* skip */ }
        }
      }
      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
    },
  });
}
