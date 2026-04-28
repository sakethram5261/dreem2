export const config = { runtime: "edge" };

export default async function handler(req: Request) {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405 });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return new Response(JSON.stringify({ error: "GEMINI_API_KEY missing" }), { status: 500 });
  }

  const { messages, userName, hasImage } = await req.json() as {
    messages?: Array<{ role: string; content: any }>;
    userName?: string;
    hasImage?: boolean;
  };

  // Convert messages to Gemini format
  // Gemini uses "user"/"model" instead of "user"/"assistant"
  const geminiMessages = (messages || []).map(m => {
    let parts: any[] = [];

    if (typeof m.content === "string") {
      parts = [{ text: m.content }];
    } else if (Array.isArray(m.content)) {
      parts = m.content.map((p: any) => {
        if (p.type === "text") return { text: p.text };
        if (p.type === "image_url") {
          // Extract base64 from data URL: "data:image/jpeg;base64,XXXX"
          const [meta, data] = p.image_url.url.split(",");
          const mimeType = meta.split(":")[1].split(";")[0];
          return { inlineData: { mimeType, data } };
        }
        return { text: "" };
      });
    }

    return {
      role: m.role === "assistant" ? "model" : "user",
      parts,
    };
  });

  const systemInstruction = `You are Lumina, a thoughtful, perceptive and gentle AI assistant. You prioritise emotional intelligence.
  - User's name: ${userName || "Dreamer"}
  - When analyzing images, be warm and emotionally perceptive. Notice details and connect them to feelings.
  - If asked to identify something (anime, manga, art, etc.), do your best and be specific.
  - Keep responses concise but insightful.
  - Never sound like an AI or therapist — talk like a close friend.
  - Validate feelings first before offering perspective.`;

  const body = {
    system_instruction: { parts: [{ text: systemInstruction }] },
    contents: geminiMessages,
    generationConfig: {
      maxOutputTokens: 1024,
      temperature: 0.7,
    },
  };

  const geminiRes = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:streamGenerateContent?alt=sse&key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }
  );

  // Gemini with alt=sse streams JSON chunks — read full response then stream it back
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
async start(controller) {
  try {
    const fullText = await geminiRes.text();
    console.log("GEMINI RAW:", fullText.slice(0, 500));
    
    const lines = fullText.split("\n");
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith("data: ")) continue;
      const data = trimmed.slice(6).trim();
      if (!data || data === "[DONE]") continue;
      try {
        const parsed = JSON.parse(data);
        const text = parsed.candidates?.[0]?.content?.parts?.[0]?.text;
        console.log("PARSED TEXT:", text);
        if (text) {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ text })}\n\n`));
        }
      } catch (e) { console.log("PARSE ERROR:", e); }
    }
  } catch (err) {
    console.log("STREAM ERROR:", err);
    controller.error(err);
  } finally {
    controller.enqueue(encoder.encode("data: [DONE]\n\n"));
    controller.close();
  }
},
  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
    },
  });
}
