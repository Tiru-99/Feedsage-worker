import { Hono } from 'hono'
import { feedRouter } from './routes/feed';
import { getRuntimeKey } from 'hono/adapter';
import { prompt } from './lib/prompt';


type Bindings = {
  AI: Ai
}

const app = new Hono<{
  Bindings: Bindings
}>();

app.get('/', (c) => {
  return c.text('Hello Hono!')
})

app.get('/embed', async (c) => {
  const text = "Hello There"

  const response = await c.env.AI.run('@cf/qwen/qwen3-embedding-0.6b', {
    text: [text]
  })

  return c.json(response)
})

app.get('/runtime', (c) => {
  const runtime = getRuntimeKey();
  return c.text(runtime);
})

app.get('/model', async (c) => {
  const userPrompt = "system design";
  const messages = [
    { role: "system", content: prompt.replace("<USER_PROMPT>", userPrompt) },
    {
      role: "user",
      content: userPrompt,
    },
  ];

  const response = await c.env.AI.run("@cf/deepseek-ai/deepseek-r1-distill-qwen-32b", {
    messages,
    stream: false,
  });
  return c.json(response);
})

app.route('/generate', feedRouter);


export default app
