const { z } = require('zod');
const schema = z.object({ email: z.string().email().optional() });
try {
  schema.parse({ email: '' });
} catch (e) {
  console.log(e);
}
