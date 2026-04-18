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
    return new Response(JSON.stringify({ error: "GROQ_API_KEY missing" }), { status: 500 });
  }

  // 1. Get the data we sent from Home.tsx
  const { messages, userName, userInterests } = await req.json() as { 
    messages?: Message[], 
    userName?: string, 
    userInterests?: string 
  };

  // 2. THE SYSTEM MESSAGE (Lumina's Personality)
  // This uses the personalization data to "prime" the AI
  const systemMessage: Message = {
    role: "system",
    content: `You are Lumina, a thoughtful, articulate, and highly intelligent AI assistant. 
    
    USER PROFILE:
    - Name: ${userName || "Unknown"}
    - Interests: ${userInterests || "Not specified"}
    
    INSTRUCTIONS:
    - If a name is provided, greet them naturally or refer to them occasionally.
    - If interests are provided, use them to make your examples or explanations more relevant.
    - Maintain a calm, helpful, and sophisticated persona. 
    - Keep responses concise but insightful.`
  };

  // 3. Talk to Groq
  const groqRes = await fetch(GROQ_API_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "llama-3.3-70b-versatile",
      messages: [systemMessage, ...(messages || [])], // Inject personality at the start
      max_tokens: 1024,
      temperature: 0.7,
      stream: true,
    }),
  });

  // 4. Handle the stream (with the buffer fix)
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
            } catch (e) { /* skip partial JSON */ }
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
