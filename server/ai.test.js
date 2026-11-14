import test from 'node:test'
import assert from 'node:assert/strict'
import http from 'node:http'
import { complete } from './ai.js'

/** DeepSeek simulado: guarda la última petición y responde según `mode` */
function mockServer() {
  const state = { last: null, mode: 'ok', status: 200 }
  const server = http.createServer((req, res) => {
    let body = ''
    req.on('data', (c) => (body += c))
    req.on('end', () => {
      state.last = { url: req.url, auth: req.headers.authorization, body: JSON.parse(body) }
      res.writeHead(state.status, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify(state.mode === 'empty' ? { choices: [] } : { choices: [{ message: { content: '  resultado simulado  ' } }] }))
    })
  })
  return new Promise((resolve) => server.listen(0, () => resolve({ server, state, url: `http://127.0.0.1:${server.address().port}` })))
}

test('complete llama a la API con modelo, clave y prompt del servidor', async (t) => {
  const { server, state, url } = await mockServer()
  t.after(() => server.close())
  Object.assign(process.env, { DEEPSEEK_API_KEY: 'sk-test', DEEPSEEK_BASE_URL: url })

  const out = await complete('translate', 'Hola mundo', { target: 'en' })
  assert.equal(out, 'resultado simulado')
  assert.equal(state.last.url, '/chat/completions')
  assert.equal(state.last.auth, 'Bearer sk-test')
  assert.equal(state.last.body.model, 'deepseek-chat')
  assert.match(state.last.body.messages[0].content, /inglés/)
  assert.match(state.last.body.messages[1].content, /Hola mundo/)
})

test('rechaza tareas, idiomas y textos no válidos sin llamar a la API', async (t) => {
  const { server, state, url } = await mockServer()
  t.after(() => server.close())
  Object.assign(process.env, { DEEPSEEK_API_KEY: 'sk-test', DEEPSEEK_BASE_URL: url })

  await assert.rejects(complete('hackear', 'x'), { status: 404 })
  await assert.rejects(complete('translate', 'x', { target: 'xx' }), { status: 400 })
  await assert.rejects(complete('summarize', '   '), { status: 400 })
  await assert.rejects(complete('summarize', 'a'.repeat(20_001)), { status: 413 })
  assert.equal(state.last, null)
})

test('traduce errores de la API a mensajes genéricos', async (t) => {
  const { server, state, url } = await mockServer()
  t.after(() => server.close())
  Object.assign(process.env, { DEEPSEEK_API_KEY: 'sk-test', DEEPSEEK_BASE_URL: url })

  state.status = 402
  await assert.rejects(complete('summarize', 'texto'), (e) => e.status === 502 && !/402|saldo|balance/i.test(e.message))
  state.status = 429
  await assert.rejects(complete('summarize', 'texto'), { status: 429 })
  state.status = 200
  state.mode = 'empty'
  await assert.rejects(complete('summarize', 'texto'), { status: 502 })
})

test('sin clave la IA no está disponible', async () => {
  const key = process.env.DEEPSEEK_API_KEY
  delete process.env.DEEPSEEK_API_KEY
  await assert.rejects(complete('summarize', 'texto'), { status: 503 })
  process.env.DEEPSEEK_API_KEY = key
})

test('ask envía fragmentos, pregunta e historial y valida longitudes', async (t) => {
  const { server, state, url } = await mockServer()
  t.after(() => server.close())
  Object.assign(process.env, { DEEPSEEK_API_KEY: 'sk-test', DEEPSEEK_BASE_URL: url })

  const out = await complete('ask', '[p. 2] El plazo es de 30 días.', { question: '¿Cuál es el plazo?', history: 'Usuario: hola' })
  assert.equal(out, 'resultado simulado')
  assert.match(state.last.body.messages[0].content, /\(p\. N\)/)
  const user = state.last.body.messages[1].content
  assert.match(user, /\[p\. 2\] El plazo/)
  assert.match(user, /Pregunta actual: ¿Cuál es el plazo\?/)
  assert.match(user, /Usuario: hola/)

  state.last = null
  await assert.rejects(complete('ask', '[p. 1] x', {}), { status: 400 })
  await assert.rejects(complete('ask', '[p. 1] x', { question: '   ' }), { status: 400 })
  await assert.rejects(complete('ask', '[p. 1] x', { question: 'a'.repeat(501) }), { status: 413 })
  await assert.rejects(complete('ask', '[p. 1] x', { question: 'a', history: 'h'.repeat(4001) }), { status: 413 })
  await assert.rejects(complete('ask', 'x'.repeat(20_001), { question: 'a' }), { status: 413 })
  assert.equal(state.last, null)
})
