const { z } = require('zod');

const pointSchema = z.object({
  x: z.number(),
  y: z.number(),
});

const strokeSchema = z.object({
  id: z.string(),
  color: z.string().optional(),
  width: z.number().optional(),
  points: z.array(pointSchema).min(1),
});

const pageSchema = z.object({
  id: z.string(),
  text: z.string().default(''),
  strokes: z.array(strokeSchema).default([]),
});

const initDataSchema = z.union([
  z.object({ pages: z.array(pageSchema) }),
  z.array(pageSchema),
  z.string(),
  z.object({
    text: z.string().optional(),
    strokes: z.array(strokeSchema).optional(),
  }),
]);

const messageSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('init'), data: initDataSchema }),
  z.object({ type: z.literal('page:add'), data: pageSchema.optional() }),
  z.object({ type: z.literal('text:update'), pageId: z.string().optional(), data: z.string() }),
  z.object({ type: z.literal('update'), pageId: z.string().optional(), data: z.string() }),
  z.object({ type: z.literal('stroke:add'), pageId: z.string().optional(), data: strokeSchema }),
  z.object({
    type: z.literal('stroke:remove'),
    pageId: z.string().optional(),
    strokeId: z.string().optional(),
    data: z.object({ id: z.string() }).optional(),
  }),
  z.object({ type: z.literal('canvas:clear'), pageId: z.string().optional() }),
]);

const outboundMessageSchema = messageSchema;

const parseIncomingMessage = (payload) => messageSchema.safeParse(payload);
const parseOutgoingMessage = (payload) => outboundMessageSchema.safeParse(payload);

module.exports = {
  pointSchema,
  strokeSchema,
  pageSchema,
  initDataSchema,
  messageSchema,
  outboundMessageSchema,
  parseIncomingMessage,
  parseOutgoingMessage,
};
