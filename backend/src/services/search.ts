import { Client } from '@elastic/elasticsearch';
import { env } from '../config/env';

const INDEX = 'emails';
export const es = new Client({ node: env.esUrl });

export interface EmailDoc {
  id: string;
  user_id: string;
  to_email: string;
  subject: string;
  body: string;
  sender_email: string;
  status: string;
  scheduled_at: string;
  sent_at?: string | null;
}

export async function ensureIndex() {
  try {
    const exists = await es.indices.exists({ index: INDEX });
    if (!exists) {
      await es.indices.create({
        index: INDEX,
        mappings: {
          properties: {
            user_id: { type: 'keyword' },
            to_email: { type: 'text', fields: { raw: { type: 'keyword' } } },
            subject: { type: 'text' },
            body: { type: 'text' },
            sender_email: { type: 'keyword' },
            status: { type: 'keyword' },
            scheduled_at: { type: 'date' },
            sent_at: { type: 'date' },
          },
        },
      });
    }
  } catch (e) {
    console.warn('[es] ensureIndex failed (search falls back to SQL):', (e as Error).message);
  }
}

export async function indexEmails(docs: EmailDoc[]) {
  if (!docs.length) return;
  try {
    for (let i = 0; i < docs.length; i += 1000) {
      const chunk = docs.slice(i, i + 1000);
      await es.bulk({
        operations: chunk.flatMap((d) => [{ index: { _index: INDEX, _id: d.id } }, d]),
      });
    }
  } catch (e) {
    console.warn('[es] bulk index failed:', (e as Error).message);
  }
}

export async function updateEmailDoc(id: string, doc: Partial<EmailDoc>) {
  try {
    await es.update({ index: INDEX, id, doc, doc_as_upsert: true });
  } catch (e) {
    console.warn('[es] update failed:', (e as Error).message);
  }
}

export async function searchEmails(userId: string, q: string): Promise<EmailDoc[]> {
  const res = await es.search<EmailDoc>({
    index: INDEX,
    size: 100,
    sort: [{ scheduled_at: 'desc' }],
    query: {
      bool: {
        filter: [{ term: { user_id: userId } }],
        must: q
          ? [{ multi_match: { query: q, fields: ['to_email', 'subject', 'body'], fuzziness: 'AUTO' } }]
          : [{ match_all: {} }],
      },
    },
  });
  return res.hits.hits.map((h) => h._source as EmailDoc);
}
