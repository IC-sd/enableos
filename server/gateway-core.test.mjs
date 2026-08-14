import { describe, expect, it } from 'vitest';
import { buildEmbeddingRequest, buildModelRequest, extractEmbeddings, extractModelContent, normalizeEndpointIdentity } from './gateway-core.mjs';

describe('model gateway contracts', () => {
  it('builds Responses API requests and reads output', () => {
    const request = buildModelRequest({ endpoint: 'https://api.example.com/v1/', protocol: 'responses', model: 'm1', system: 'rules', user: 'hello' });
    expect(request.url).toBe('https://api.example.com/v1/responses');
    expect(request.body).toEqual({ model: 'm1', instructions: 'rules', input: 'hello' });
    expect(extractModelContent({ output: [{ content: [{ type: 'output_text', text: 'answer' }] }] }, 'responses')).toBe('answer');
  });

  it('keeps Chat Completions compatibility', () => {
    const request = buildModelRequest({ endpoint: 'https://api.example.com/v1', protocol: 'chat-completions', model: 'm2', system: 's', user: 'u' });
    expect(request.url).toBe('https://api.example.com/v1/chat/completions');
    expect(request.body.messages).toHaveLength(2);
    expect(extractModelContent({ choices: [{ message: { content: 'ok' } }] }, 'chat-completions')).toBe('ok');
  });

  it('validates and orders embedding vectors', () => {
    const request = buildEmbeddingRequest({ endpoint: 'https://api.example.com/v1', model: 'embed', input: ['a', 'b'] });
    expect(request.url).toBe('https://api.example.com/v1/embeddings');
    expect(extractEmbeddings({ data: [{ index: 1, embedding: [2] }, { index: 0, embedding: [1] }] }, 2)).toEqual([[1], [2]]);
    expect(() => extractEmbeddings({ data: [] }, 1)).toThrow('不完整');
  });

  it('normalizes endpoint identity before binding a session key', () => {
    expect(normalizeEndpointIdentity('https://API.example.com/v1///')).toBe('https://api.example.com/v1');
    expect(() => normalizeEndpointIdentity('file:///secret')).toThrow('http');
    expect(() => normalizeEndpointIdentity('https://user:pass@example.com/v1')).toThrow('用户名');
    expect(() => normalizeEndpointIdentity('https://example.com/v1?key=secret')).toThrow('查询参数');
  });
});
