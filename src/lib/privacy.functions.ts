import { createServerFn } from "@tanstack/react-start";

export type PrivacyReview = {
  findings: { text: string; reason: string }[];
  rewrite: string;
};

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["findings", "rewrite"],
  properties: {
    findings: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["text", "reason"],
        properties: { text: { type: "string" }, reason: { type: "string" } },
      },
    },
    rewrite: { type: "string" },
  },
};

const INSTRUCTIONS = `You protect the anonymity of people posting confessions on Whispr, an anonymous app used mostly by young Kenyans.
Find details that could identify the author or another real person: names, nicknames, phone numbers, emails, social handles, exact addresses, specific hostels/rooms/offices, unique job titles, exact dates, school + year combos, distinctive events, or combinations of details that narrow it to a few people.
Broad places like a town or county (e.g. "Kisii town", "Nairobi") are fine — keep them.
Return each risky snippet exactly as written with a short plain reason. Then write a privacy-safe rewrite that keeps the author's voice, slang, feeling and meaning, only generalising the risky parts. If nothing is risky, return no findings and the original text unchanged.`;

/** Public: posting is account-free, so this check is too. Input is length-capped. */
export const reviewConfessionPrivacy = createServerFn({ method: "POST" })
  .inputValidator((d: { text: string }) => {
    const text = typeof d?.text === "string" ? d.text.trim() : "";
    if (text.length < 3 || text.length > 5000) throw new Error("Write 3–5000 characters first.");
    return { text };
  })
  .handler(async ({ data }): Promise<PrivacyReview> => {
    const key = process.env["LOVABLE_API_KEY"];
    if (!key) throw new Error("AI is not configured.");
    const res = await fetch("https://ai.gateway.lovable.dev/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
        "X-Lovable-AIG-SDK": "fetch",
      },
      body: JSON.stringify({
        model: "openai/gpt-6-astra",
        instructions: INSTRUCTIONS,
        input: data.text,
        reasoning: { effort: "low" },
        store: false,
        stream: true,
        text: { format: { type: "json_schema", name: "privacy_review", strict: true, schema: SCHEMA } },
      }),
    });
    if (!res.ok || !res.body) {
      const body = await res.text().catch(() => "");
      console.error(`Privacy check failed [${res.status}]: ${body}`);
      if (res.status === 429) throw new Error("Too many checks right now — try again in a minute.");
      if (res.status === 402) throw new Error("AI credits have run out for this app.");
      throw new Error("Privacy check is unavailable right now.");
    }
    // Consume the SSE stream server-side and accumulate the output text.
    const reader = res.body.getReader();
    const dec = new TextDecoder();
    let buf = "";
    let out = "";
    let refused = false;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      let i;
      while ((i = buf.indexOf("\n")) >= 0) {
        const line = buf.slice(0, i).trim();
        buf = buf.slice(i + 1);
        if (!line.startsWith("data:")) continue;
        const payload = line.slice(5).trim();
        if (!payload || payload === "[DONE]") continue;
        try {
          const ev = JSON.parse(payload);
          if (ev.type === "response.output_text.delta") out += ev.delta ?? "";
          else if (ev.type === "response.refusal.delta") refused = true;
          else if (ev.type === "error" || ev.type === "response.failed") throw new Error("failed");
        } catch (e) {
          if ((e as Error).message === "failed") throw new Error("Privacy check failed. Try again later.");
        }
      }
    }
    if (refused || !out) throw new Error("The privacy check couldn't review this text.");
    const parsed = JSON.parse(out) as PrivacyReview;
    return { findings: parsed.findings ?? [], rewrite: parsed.rewrite ?? data.text };
  });
