import { Hono } from 'hono'
import { feedRouter } from './routes/feed';
import { getRuntimeKey } from 'hono/adapter';


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

  // Use the AI binding to run the embedding model
  const response = await c.env.AI.run('@cf/qwen/qwen3-embedding-0.6b', {
    text: [text]
  })

  return c.json(response)
})

app.get('/runtime', (c) => {
  const runtime = getRuntimeKey();
  return c.text(runtime);
})

app.route('/generate', feedRouter);


export default app


/*
  Steps to build an ai pipeline 
  search 5 results 
  build a feed from that 
*/
