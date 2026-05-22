import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import { ParsedSheet, ParsedSheetSchema } from '@warehouse/types';

@Injectable()
export class AiParserService {
  private readonly logger = new Logger(AiParserService.name);
  private readonly openai: OpenAI | null;
  private readonly model: string;

  constructor(cfg: ConfigService) {
    const apiKey = cfg.get<string>('OPENAI_API_KEY');
    this.openai = apiKey ? new OpenAI({ apiKey }) : null;
    this.model = cfg.get<string>('OPENAI_MODEL') ?? 'gpt-4o-mini';
  }

  async parse(rawOcrText: string): Promise<ParsedSheet> {
    if (!this.openai) throw new Error('OPENAI_API_KEY is not configured');

    const completion = await this.openai.chat.completions.create({
      model: this.model,
      temperature: 0,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: PARSER_SYSTEM_PROMPT },
        { role: 'user', content: PARSER_FEWSHOT },
        { role: 'assistant', content: PARSER_FEWSHOT_OUTPUT },
        { role: 'user', content: rawOcrText },
      ],
    });

    const content = completion.choices[0]?.message?.content ?? '{}';
    let raw: unknown;
    try {
      raw = JSON.parse(content);
    } catch {
      this.logger.warn(`AI parser returned non-JSON: ${content.slice(0, 200)}`);
      raw = { items: [] };
    }

    const parsed = ParsedSheetSchema.safeParse(raw);
    if (!parsed.success) {
      this.logger.warn(`Parsed JSON failed schema validation: ${parsed.error.message}`);
      return { items: [] };
    }
    // De-dupe by normalized SKU.
    const seen = new Map<string, ParsedSheet['items'][number]>();
    for (const item of parsed.data.items) {
      const key = item.sku.trim().toLowerCase();
      if (!seen.has(key)) seen.set(key, { ...item, sku: item.sku.trim() });
    }
    return { items: Array.from(seen.values()), notes: parsed.data.notes };
  }
}

export const PARSER_SYSTEM_PROMPT = `You convert raw OCR text from handwritten warehouse inventory sheets into clean JSON.

Each line typically describes one product: a numeric SKU code followed by a quantity in pieces.
The input may contain ONE line or MANY lines. Always extract every line that has both an SKU and a quantity.

EXTRACTION RULES (read carefully):
1. SKU is the leading numeric code on the line — usually 3 to 6 digits (e.g. "1275", "1132", "874"). Output as a string, no spaces or padding.
2. Quantity is the number immediately followed by "pcs", "Pcs", "PCS", "pc", or "p" (case-insensitive). The number may be 1 to 5 digits.
3. The separator between SKU and quantity can be "-", "—", ":", or whitespace.
4. ARITHMETIC: if a line has an "=", use ONLY the right-hand total. e.g. "10 pcs + 5 pcs = 15 pcs" -> quantity 15. NEVER use the addends (10, 5).
5. If a line has multiple "<n> pcs" with no "=", sum them.
6. SKIP lines that lack EITHER a leading numeric SKU OR a quantity (headers, dates, notes, signatures, blank).
7. quantity must be a non-negative integer.
8. confidence is your 0-1 belief; lower it when digits are smudged or the OCR includes "(?)" markers.
9. Do NOT invent SKUs. But DO extract every clear single-line entry — a one-line sheet with "1275 - 10 pcs" is a valid input and must return one item.
10. Whitespace, capitalization, and punctuation in the OCR are all tolerated.

Output schema (strict JSON — return {"items":[]} only when literally nothing parseable is present):
{
  "items": [
    { "sku": "string", "productName": null, "quantity": int, "confidence": 0..1, "raw": "string" }
  ],
  "notes": "string|null"
}`;

export const PARSER_FEWSHOT = `1275 - 10 Pcs
1132 - 4 pcs + 2 pcs = 6 pcs
1558 - 12 PCS
874 : 3 pc
1485 (?) - 3 pcs
Date: 21/05
note: 2 damaged boxes`;

export const PARSER_FEWSHOT_OUTPUT = JSON.stringify({
  items: [
    { sku: '1275', productName: null, quantity: 10, confidence: 0.99, raw: '1275 - 10 Pcs' },
    { sku: '1132', productName: null, quantity: 6, confidence: 0.98, raw: '1132 - 4 pcs + 2 pcs = 6 pcs' },
    { sku: '1558', productName: null, quantity: 12, confidence: 0.99, raw: '1558 - 12 PCS' },
    { sku: '874', productName: null, quantity: 3, confidence: 0.97, raw: '874 : 3 pc' },
    { sku: '1485', productName: null, quantity: 3, confidence: 0.72, raw: '1485 (?) - 3 pcs' },
  ],
  notes: '2 damaged boxes',
});
