import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';

export interface OcrResult {
  text: string;
  provider: string;
  confidence?: number;
}

/**
 * OCR service for handwritten warehouse inventory sheets.
 * Defaults to OpenAI's vision model (gpt-4o) which handles handwritten text well
 * and avoids the credential overhead of Google Vision / AWS Textract for now.
 * Provider can be swapped via OCR_PROVIDER env.
 */
@Injectable()
export class OcrService {
  private readonly logger = new Logger(OcrService.name);
  private readonly openai: OpenAI | null;
  private readonly provider: string;
  private readonly visionModel: string;

  constructor(private readonly cfg: ConfigService) {
    this.provider = this.cfg.get<string>('OCR_PROVIDER') ?? 'openai';
    this.visionModel = this.cfg.get<string>('OPENAI_VISION_MODEL') ?? 'gpt-4o';
    const apiKey = this.cfg.get<string>('OPENAI_API_KEY');
    this.openai = apiKey ? new OpenAI({ apiKey }) : null;
  }

  async extractText(imageBuffer: Buffer, mimeType: string): Promise<OcrResult> {
    if (this.provider !== 'openai') {
      // Adapter points for google-vision / aws-textract live here in production.
      this.logger.warn(`OCR provider ${this.provider} not implemented; falling back to openai`);
    }
    if (!this.openai) {
      throw new Error('OPENAI_API_KEY is not configured');
    }

    const dataUrl = `data:${mimeType};base64,${imageBuffer.toString('base64')}`;
    const completion = await this.openai.chat.completions.create({
      model: this.visionModel,
      temperature: 0,
      messages: [
        {
          role: 'system',
          content: OCR_SYSTEM_PROMPT,
        },
        {
          role: 'user',
          content: [
            { type: 'text', text: 'Extract all handwritten lines from this warehouse inventory sheet. Preserve original line breaks. Do not summarize. Do not invent text.' },
            { type: 'image_url', image_url: { url: dataUrl, detail: 'high' } },
          ],
        },
      ],
    });

    const text = completion.choices[0]?.message?.content?.trim() ?? '';
    this.logger.debug(`OCR extracted ${text.length} chars`);
    return { text, provider: this.provider };
  }
}

export const OCR_SYSTEM_PROMPT = `You are a high-accuracy OCR engine for handwritten warehouse inventory sheets.

Rules:
- Transcribe every visible handwritten line exactly as written.
- Preserve numerals, plus signs, equals signs, hyphens, and units (e.g. "pcs").
- Preserve original line breaks (one line per line).
- Do NOT translate, summarize, correct spelling, or add commentary.
- If a word is unclear, output your best guess followed by "(?)".
- Output ONLY the raw transcribed text — no markdown, no JSON, no preamble.`;
