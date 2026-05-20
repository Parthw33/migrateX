/*eslint-disable*/
import type { ContentstackSchema, ContentstackField, CompactContentModel } from '~/types/contentstack';
import Anthropic from '@anthropic-ai/sdk';

/**
 * Configuration.
 */
const CONFIG = {
  ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY || '',
  CLAUDE_MODEL: 'claude-sonnet-4-20250514',
  CLAUDE_MAX_TOKENS: 9000,
};

/**
 * Simple prompt for Claude.
 */
const PROMPT = `Transform Contentstack schemas to compact JSON format.

Output ONLY a JSON array. No markdown, no explanations.

Rules:
1. Extract: uid, type (single if options.singleton=true, else multiple)
2. Detect title field (uid="title")
3. Detect url field (uid matches: url, slug, path)
4. Detect seo field (uid matches: seo, metadata, meta)
5. Extract only these field types:
   - reference → "@ref:type" 
   - json with rich_text → "json_rte"
   - file → "asset"
   - link → "link"
   - global_field → "@global:uid"
6. Use dot notation: "group.field"
7. Use array notation: "blocks[]"

Example: [{"uid":"page","type":"multiple","title":"title","url":"url","fields":{"logo":"asset","body":"json_rte"}}]

Schemas:`;

/**
 * Main transformation function.
 */
export async function transformContentstackSchemas(
  schemas: ContentstackSchema[] | any[],
  aiFunction?: (prompt: string) => Promise<string>,
): Promise<string> {
  try {
    if (aiFunction) {
      return await transformWithAI(schemas, aiFunction);
    }
  } catch {
    console.warn('AI transformation failed, using manual fallback');
  }

  return transformManually(schemas);
}

/**
 * Transform using Claude AI.
 */
export async function transformWithClaude(schemas: ContentstackSchema[] | any[]): Promise<string> {
  const anthropic = new Anthropic({ apiKey: CONFIG.ANTHROPIC_API_KEY });

  const normalizedSchemas = schemas.map((s) => ('content_type' in s ? s : { content_type: s }));

  const prompt = `${PROMPT}\n\n${JSON.stringify(normalizedSchemas, null, 2)}`;

  const message = await anthropic.messages.create({
    model: CONFIG.CLAUDE_MODEL,
    max_tokens: CONFIG.CLAUDE_MAX_TOKENS,
    temperature: 0,
    messages: [{ role: 'user', content: prompt }],
  });

  const content = message.content[0];

  if (content.type !== 'text') {
    throw new Error('Invalid response from Claude');
  }

  const response = content.text;
  const jsonMatch = response.match(/\[[\s\S]*\]/);

  if (!jsonMatch) {
    throw new Error('No JSON found in response');
  }

  const parsed = JSON.parse(jsonMatch[0]);

  if (!Array.isArray(parsed) || parsed.length === 0) {
    throw new Error('Invalid or empty array from Claude');
  }

  return jsonMatch[0];
}

/**
 * Transform using custom AI function.
 */
export async function transformWithAI(
  schemas: ContentstackSchema[] | any[],
  aiFunction: (prompt: string) => Promise<string>,
): Promise<string> {
  const normalizedSchemas = schemas.map((s) => ('content_type' in s ? s : { content_type: s }));

  const prompt = `${PROMPT}\n\n${JSON.stringify(normalizedSchemas, null, 2)}`;
  const response = await aiFunction(prompt);

  if (!response || response.trim().length === 0) {
    throw new Error('Empty response from AI');
  }

  const jsonMatch = response.match(/\[[\s\S]*\]/);

  if (!jsonMatch) {
    throw new Error('No JSON found in response');
  }

  const parsed = JSON.parse(jsonMatch[0]);

  if (!Array.isArray(parsed) || parsed.length === 0) {
    throw new Error('Invalid or empty array from AI');
  }

  return jsonMatch[0];
}

/**
 * Manual transformation (no AI).
 */
// export function transformManually(schemas: ContentstackSchema[] | any[]): string {
//   const models: CompactContentModel[] = schemas.map((schema) => {
//     const ct = 'content_type' in schema ? schema.content_type : schema;
//     const options = ct.options || {};

//     const model: CompactContentModel = {
//       uid: ct.uid,
//       type: options.singleton ? 'single' : 'multiple',
//       fields: {},
//     };

//     if (options.is_page === true) {
//       (model as any).is_page = true;

//       if (options.url_prefix) {
//         (model as any).url_prefix = options.url_prefix;
//       }

//       if (options.url_pattern) {
//         (model as any).url_pattern = options.url_pattern;
//       }
//     }

//     if (ct.uid === 'faq') {
//       (model as any).url_prefix = '/faq';
//     }

//     const titleField = ct.schema?.find((f: any) => f.uid === 'title' && f.data_type === 'text');

//     if (titleField) {
//       (model as any).title = titleField.uid;
//     }

//     // URL field (still useful to know the field name)
//     const urlFields = ['url', 'slug', 'path', 'permalink', 'route'];
//     const urlField = urlFields
//       .map((uid) => ct.schema?.find((f: any) => f.uid.toLowerCase() === uid && f.data_type === 'text'))
//       .find((f) => f);

//     if (urlField) {
//       (model as any).url = urlField.uid;
//     }

//     // SEO field
//     const seoField = ct.schema?.find(
//       (f: any) =>
//         ['seo', 'metadata', 'meta'].includes(f.uid.toLowerCase()) &&
//         (f.data_type === 'group' || f.data_type === 'global_field'),
//     );

//     if (seoField) {
//       (model as any).seo = seoField.uid;
//     }

//     if (ct.schema) {
//       extractFields(ct.schema, '', model.fields);
//     }

//     if (Object.keys(model.fields).length === 0) {
//       delete (model as any).fields;
//     }

//     return model;
//   });

//   return JSON.stringify(models);
// }

// /**
//  * Extract fields recursively.
//  */
// function extractFields(
//   fields: ContentstackField[] | any[],
//   parentPath: string,
//   result: Record<string, string | any>,
// ): void {
//   for (const field of fields) {
//     const path = parentPath ? `${parentPath}.${field.uid}` : field.uid;

//     if (field.data_type === 'reference' && field.reference_to) {
//       const types = Array.isArray(field.reference_to) ? field.reference_to.join('|') : field.reference_to;
//       result[path] = `@ref:${types}`;
//     } else if (
//       field.data_type === 'json' &&
//       (field.field_metadata?.rich_text_type || field.field_metadata?.allow_rich_text)
//     ) {
//       result[path] = 'json_rte';
//     } else if (field.data_type === 'file') {
//       result[path] = 'asset';
//     } else if (field.data_type === 'link') {
//       result[path] = 'link';
//     } else if (field.data_type === 'global_field' && field.reference_to) {
//       result[path] = `@global:${field.reference_to}`;
//     } else if (field.data_type === 'group' && field.schema) {
//       extractFields(field.schema, path, result);
//     } else if (field.data_type === 'blocks' && field.blocks) {
//       const blocks: Record<string, any> = {};

//       for (const block of field.blocks) {
//         const blockFields: Record<string, string> = {};

//         if (block.schema) {
//           extractFields(block.schema, '', blockFields);
//         }

//         if (Object.keys(blockFields).length > 0) {
//           blocks[block.uid] = blockFields;
//         }
//       }

//       if (Object.keys(blocks).length > 0) {
//         result[`${path}[]`] = blocks;
//       }
//     }
//   }
// }

export function transformManually(schemas: ContentstackSchema[] | any[]): string {
  const models: CompactContentModel[] = schemas.map((schema) => {
    const ct = 'content_type' in schema ? schema.content_type : schema;
    const options = ct.options || {};

    const model: CompactContentModel = {
      uid: ct.uid,
      type: options.singleton ? 'single' : 'multiple',
      fields: {},
    };

    if (options.is_page === true) {
      (model as any).is_page = true;

      if (options.url_prefix) {
        (model as any).url_prefix = options.url_prefix;
      }

      if (options.url_pattern) {
        (model as any).url_pattern = options.url_pattern;
      }
    }

    if (ct.uid === 'faq_hub_page') {
      (model as any).url_prefix = '/faq/';
    }

    const titleField = ct.schema?.find((f: any) => f.uid === 'title' && f.data_type === 'text');

    if (titleField) {
      (model as any).title = 'title';
    }

    const urlFields = ['url', 'slug', 'path', 'permalink', 'route'];
    const urlField = urlFields
      .map((uid) => ct.schema?.find((f: any) => f.uid.toLowerCase() === uid && f.data_type === 'text'))
      .find((f) => f);

    if (urlField) {
      (model as any).url = urlField.uid;
    }

    const seoFields = ct.schema?.filter((f: any) =>
      ['seo', 'metadata', 'meta', 'meta_title', 'meta_description', 'og_image'].includes(f.uid.toLowerCase()),
    );

    if (seoFields && seoFields.length > 0) {
      const hasSeoGroup = seoFields.some((f: any) => ['group', 'global_field'].includes(f.data_type));
      if (hasSeoGroup) {
        (model as any).seo = seoFields.find((f: any) => ['group', 'global_field'].includes(f.data_type)).uid;
      }
    }

    if (ct.schema) {
      extractFieldsEnhanced(ct.schema, '', model.fields);
    }

    if (Object.keys(model.fields).length === 0) {
      delete (model as any).fields;
    }

    return model;
  });

  return JSON.stringify(models, null, 2);
}

function extractFieldsEnhanced(schema: any[], prefix: string = '', fields: any): void {
  schema.forEach((field) => {
    const fieldKey = prefix ? `${prefix}.${field.uid}` : field.uid;
    const isMultiple = field.multiple === true;

    switch (field.data_type) {
      case 'text':
        fields[isMultiple ? `${fieldKey}[]` : fieldKey] = 'text';
        break;

      case 'number':
        fields[isMultiple ? `${fieldKey}[]` : fieldKey] = 'number';
        break;

      case 'boolean':
        fields[fieldKey] = 'boolean';
        break;

      case 'isodate':
        fields[fieldKey] = 'date';
        break;

      case 'file':
        fields[isMultiple ? `${fieldKey}[]` : fieldKey] = 'asset';
        break;

      case 'json':
        if (field.field_metadata?.allow_json_rte) {
          fields[fieldKey] = 'json_rte';
        } else {
          fields[fieldKey] = 'json';
        }
        break;

      case 'reference':
        if (field.reference_to && field.reference_to.length > 0) {
          const refType = field.reference_to[0];
          const isRefMultiple = field.field_metadata?.ref_multiple || field.multiple;
          fields[fieldKey] = isRefMultiple ? `@ref:${refType}[]` : `@ref:${refType}`;
        }
        break;

      case 'blocks':
        if (field.blocks) {
          const blockFields: any = {};
          field.blocks.forEach((block: any) => {
            if (block.schema) {
              const blockData: any = {};
              extractFieldsEnhanced(block.schema, '', blockData);
              blockFields[block.uid] = blockData;
            }
          });
          fields[`${fieldKey}[]`] = blockFields;
        }
        break;

      case 'group':
        if (field.schema) {
          if (isMultiple) {
            const groupFields: any = {};
            extractFieldsEnhanced(field.schema, '', groupFields);
            fields[`${fieldKey}[]`] = groupFields;
          } else {
            extractFieldsEnhanced(field.schema, fieldKey, fields);
          }
        }
        break;

      default:
        fields[fieldKey] = field.data_type;
        break;
    }
  });
}
/**
 * Validate content models.
 */
export function validateContentModels(json: string): boolean {
  try {
    const models = JSON.parse(json);

    if (!Array.isArray(models) || models.length === 0) {
      return false;
    }

    for (const model of models) {
      if (!model.uid || !model.type) {
        return false;
      }

      if (!['single', 'multiple'].includes(model.type)) {
        return false;
      }

      if (model.fields && !validateFields(model.fields)) {
        return false;
      }
    }

    return true;
  } catch {
    return false;
  }
}

/**
 * Validate field types recursively.
 */
function validateFields(fields: Record<string, any>): boolean {
  for (const value of Object.values(fields)) {
    if (typeof value === 'object' && value !== null) {
      if (!validateFields(value)) {
        return false;
      }

      continue;
    }

    if (typeof value !== 'string') {
      return false;
    }

    const valid =
      ['json_rte', 'asset', 'link'].includes(value) || value.startsWith('@ref:') || value.startsWith('@global:');

    if (!valid) {
      return false;
    }
  }

  return true;
}

/**
 * Get statistics.
 */
export function getContentModelsStats(json: string) {
  const models = JSON.parse(json);

  const stats = {
    totalModels: models.length,
    singleTypes: 0,
    multipleTypes: 0,
    totalFields: 0,
    referencesCount: 0,
    jsonRteCount: 0,
    assetCount: 0,
    linkCount: 0,
    globalFieldCount: 0,
  };

  for (const model of models) {
    if (model.type === 'single') {
      stats.singleTypes++;
    } else {
      stats.multipleTypes++;
    }

    if (model.fields) {
      countFields(model.fields, stats);
    }
  }

  return stats;
}

/**
 * Count fields recursively.
 */
function countFields(fields: Record<string, any>, stats: any): void {
  for (const value of Object.values(fields)) {
    if (typeof value === 'string') {
      stats.totalFields++;

      if (value.startsWith('@ref:')) {
        stats.referencesCount++;
      } else if (value === 'json_rte') {
        stats.jsonRteCount++;
      } else if (value === 'asset') {
        stats.assetCount++;
      } else if (value === 'link') {
        stats.linkCount++;
      } else if (value.startsWith('@global:')) {
        stats.globalFieldCount++;
      }
    } else if (typeof value === 'object' && value !== null) {
      countFields(value, stats);
    }
  }
}
