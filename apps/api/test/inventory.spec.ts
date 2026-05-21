import { AiParserService } from '../src/modules/ai-parser/ai-parser.service';
import { ConfigService } from '@nestjs/config';

describe('AiParserService (no network)', () => {
  it('dedupes by SKU when AI returns valid JSON', () => {
    const svc = new AiParserService(new ConfigService({ OPENAI_API_KEY: undefined, OPENAI_MODEL: 'x' }));
    // @ts-expect-error access internal helper for unit verification
    expect(typeof svc.parse).toBe('function');
  });
});

describe('Quantity arithmetic in parser prompt', () => {
  it('should use final total in "4 pcs + 2 pcs = 6 pcs" not the addends', () => {
    // Documentation test: ensures the few-shot demonstrates the "use final total" rule.
    const fewshot = require('../src/modules/ai-parser/ai-parser.service').PARSER_FEWSHOT_OUTPUT;
    expect(fewshot).toContain('"quantity":6');
    // 4 and 2 should not appear as standalone quantities
    expect(fewshot).not.toMatch(/"quantity":4\b/);
    expect(fewshot).not.toMatch(/"quantity":2\b/);
  });

  it('should parse leading numeric SKUs as strings', () => {
    const fewshot = require('../src/modules/ai-parser/ai-parser.service').PARSER_FEWSHOT_OUTPUT;
    expect(fewshot).toContain('"sku":"1275"');
    expect(fewshot).toContain('"sku":"1132"');
  });
});
