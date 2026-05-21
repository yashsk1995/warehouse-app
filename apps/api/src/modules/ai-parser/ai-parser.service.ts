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

Each line typically describes one product: a numeric SKU code followed by quantity in pieces.

CRITICAL RULES:
1. SKU is the leading numeric code on the line (typically 3-5 digits, e.g. "1275", "1132", "1558"). Output the SKU as a string with no spaces or padding.
2. If a line contains arithmetic like "10 pcs + 5 pcs = 15 pcs", use ONLY the final total (15). NEVER use intermediate addends.
3. If no "=" is present, sum all "<n> pcs" on the line.
4. Skip lines that have no leading numeric SKU OR no quantity (headers, dates, notes, signatures).
5. quantity must be a non-negative integer.
6. confidence is your 0-1 belief in the parse for each item; lower it when the SKU digits or quantity were unclear in the OCR (look for "(?)" markers).
7. Do NOT invent SKUs. If you can't read the leading number, skip that line.

Output schema (strict JSON):
{
  "items": [
    { "sku": "string", "productName": null, "quantity": int, "confidence": 0..1, "raw": "string" }
  ],
  "notes": "string|null"
}`;

export const PARSER_FEWSHOT = `1275 - 10 pcs
1132 - 4 pcs + 2 pcs = 6 pcs
1558 - 12 pcs
1485 (?) - 3 pcs
Date: 21/05
note: 2 damaged boxes`;

export const PARSER_FEWSHOT_OUTPUT = JSON.stringify({
  items: [
    { sku: '1275', productName: null, quantity: 10, confidence: 0.99, raw: '1275 - 10 pcs' },
    { sku: '1132', productName: null, quantity: 6, confidence: 0.98, raw: '1132 - 4 pcs + 2 pcs = 6 pcs' },
    { sku: '1558', productName: null, quantity: 12, confidence: 0.99, raw: '1558 - 12 pcs' },
    { sku: '1485', productName: null, quantity: 3, confidence: 0.72, raw: '1485 (?) - 3 pcs' },
  ],
  notes: '2 damaged boxes',
});
