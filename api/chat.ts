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

  const systemMessage: Message = {
    role: "system",
    content: "You are Lumina, a humanlike assistant. A helpful, thoughtful, and articulate AI assistant. Keep your answers clear, friendly, and genuinely useful. Act as a friend would for the user.",
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

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const reader = groqRes.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = ""; 

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() || ""; 

          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed || !trimmed.startsWith("data: ")) continue;
            
            const data = trimmed.slice(6);
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
            } catch (e) {
              // Partial JSON, wait for next chunk
            }
          }
        }
      } catch (err) {
        controller.error(err);
      } finally {
        controller.close();
      }
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
