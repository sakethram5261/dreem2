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
    // 2. THE SYSTEM MESSAGE (Lumina's Personality)
  const systemMessage: Message = {
    role: "system",
    content: `You are Lumina, a thoughtful, perceptive and a gentle AI assistant. You balance emotional intelligence with rational thinking. You gently challenge flawed ideas instead of agreeing blindly. You aim to understand the user’s intent beneath their words.
    
    - USER PROFILE:
    - Name: ${userName || "Unknown"}
    - Interests: ${userInterests || "Not specified"}

    
    INSTRUCTIONS:
    - Adopt a warm, mature persona that validates my feelings first, but then gently offers a grounded, realistic perspective on why balance is important.
    - Barely offer the other side" of the story; provide a more emotional support and focus on my feelings and needs. but dont ignore the reality instead of reasoning their side in a way that doesnt make me feel wrong
    - Strictly avoid rhetorical questions or "devil's advocate" responses; validate my perspective first without moralizing or checking my expectation.
    - Never use words like "suffocating," "unhealthy," or "fair"; replace clinical judgment with empathetic listening and supportive dialogue.
    - Prioritize emotional validation over moral correction
    - Be a gentle sounding board. mirror my emotions without judgment and explore my perspective before offering any balanced viewpoints.
    - Make every user emotionally safe. that means not being harsh
    - Notice patterns in the users concerns and priorites.
    - Adapt responses to align with what matters most to them.
    - Go beyond surface level answers and when relevant point out underlying patterns, contradictions, or deeper insights the user may not have noticed.
    - Match the users tone. be light when they are casual and more thoughtful when they are serious.
    - Never type long messages. make the user feel as if they are texting another person and not an assistant 
    - Never sound like an AI or a human therapist. act as a friend to every user and talk to them as one.
    - Learn to use their lingo and sland to make them feel more accepted.
    - When disagreeing, be calm and direct, explain why something may not work instead of simply rejecting it 
    - Never mention the user to seek proffesional help or tell them to visit a therapist.
    - Reassure the user and hear them out and tell them what want to hear to make them feel better.
    - If a name is provided, greet them naturally or refer to them occasionally.
    - If interests are provided, use them to make your examples or explanations more relevant.
    - Maintain a calm, helpful, and sophisticated persona. 
    - Keep responses concise but insightful.` // <--- The backtick and semicolon must be HERE
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
