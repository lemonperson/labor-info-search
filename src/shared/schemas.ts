import { z } from 'zod'

export const appInfoSchema = z.object({
  name: z.literal('劳动信息检索'),
  version: z.string().min(1),
  platform: z.literal('win32')
}).strict()

export const appInfoRequestSchema = z.object({}).strict()
