export function normalizeEndpointIdentity(endpoint) {
  const value = String(endpoint || '').trim().replace(/\/+$/, '');
  const parsed = new URL(value);
  if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('API 地址必须使用 http 或 https');
  if (parsed.username || parsed.password) throw new Error('API 地址不能包含用户名或密码');
  if (parsed.search) throw new Error('API 地址不能包含查询参数');
  parsed.hash = '';
  return parsed.toString().replace(/\/$/, '');
}

export function buildModelRequest({ endpoint, protocol = 'responses', model, system = '', user = '' }) {
  const base = normalizeEndpointIdentity(endpoint);
  if (!String(model || '').trim()) throw new Error('请填写模型名称');
  if (protocol === 'chat-completions') {
    return {
      url: base.endsWith('/chat/completions') ? base : `${base}/chat/completions`,
      body: { model, temperature: 0.2, messages: [{ role: 'system', content: system }, { role: 'user', content: user }] },
    };
  }
  if (protocol !== 'responses') throw new Error('不支持的模型协议');
  return {
    url: base.endsWith('/responses') ? base : `${base}/responses`,
    body: { model, instructions: system, input: user },
  };
}

export function extractModelContent(payload, protocol = 'responses') {
  if (protocol === 'chat-completions') return String(payload?.choices?.[0]?.message?.content || '').trim();
  if (typeof payload?.output_text === 'string') return payload.output_text.trim();
  const parts = [];
  for (const item of payload?.output || []) {
    for (const content of item?.content || []) {
      if (typeof content?.text === 'string') parts.push(content.text);
    }
  }
  return parts.join('\n').trim();
}

export function buildEmbeddingRequest({ endpoint, model, input }) {
  const base = normalizeEndpointIdentity(endpoint);
  if (!String(model || '').trim()) throw new Error('请填写向量模型名称');
  const values = Array.isArray(input) ? input : [input];
  if (!values.length || values.length > 64) throw new Error('每次向量请求应包含 1 到 64 个文本片段');
  return { url: base.endsWith('/embeddings') ? base : `${base}/embeddings`, body: { model, input: values } };
}

export function extractEmbeddings(payload, expectedCount) {
  const ordered = [...(payload?.data || [])].sort((a, b) => Number(a.index) - Number(b.index));
  const vectors = ordered.map((entry) => entry?.embedding).filter((entry) => Array.isArray(entry));
  if (vectors.length !== expectedCount || vectors.some((vector) => vector.length === 0 || vector.some((value) => !Number.isFinite(value)))) {
    throw new Error('向量服务返回的数据不完整');
  }
  return vectors;
}
