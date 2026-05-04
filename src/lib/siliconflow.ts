import { ExtractionResult, MergedQuestion, Option, QuestionType } from '@/types/question';
import { normalizeAnswer } from './question-utils';
import { processInParallel } from './parallel-processor';

const EXTRACTION_SYSTEM_PROMPT = `你是一个专业的试卷题目提取助手。请从图片中提取所有选择题，严格按JSON格式输出。

背景：
- 材料、题干、题肢、答案、解析可能跨页
- 你的任务不是一次补全整套试卷，而是把”当前页看见的题目块”尽量稳定拆出来
- 后续系统只会审核”上一页最后一块”和”下一页第一块”是否需要合并
- 忽略页面中的装饰性图片、Logo、水印、页眉页脚等与题目内容无关的图片

## 输出格式

### 包含题目或题目片段的页面：
{
  "questions": [
    {
      "stem": "题干文本，没有就用空字符串",
      "options": [
        {"label": "A", "content": "选项内容"},
        {"label": "B", "content": "选项内容"}
      ],
      "answer": "A，没有就用空字符串",
      "explanation": "解析内容（如图中无解析则留空字符串）"
    }
  ],
  "has_answer_page": false,
  "answer_page_start": null
}

### 仅包含答案/解析的页面：
{
  "answers_only": [
    {"number": 1, "answer": "A", "explanation": "解析内容"}
  ]
}

## 通用规则
1. 题目数组必须严格按页面自然阅读顺序输出，不要重排
2. questions 里的每个对象只能包含 stem、options、answer、explanation 这四个字段，不要输出其他字段
3. 每个题目块只拆成这四类内容：stem、options、answer、explanation
4. 只有 A、B、C、D 这四类字母标签才算选项；其余如 1、2、3、4、①②③④ 都不要放进 options，统一视为 stem 的一部分
5. 页面里有多道题时，必须拆成多个 questions 项，绝不能把多道题拼成一个 questions 项
6. 页面里只有材料、题干、题肢、选项、答案、解析中的一部分时，也要照常输出这个片段，不要求每一页必须形成完整题
7. 如果答案单独出现在后面页面，优先使用 answers_only，且必须保持页面展示顺序
8. 没有答案或解析时留空字符串；不要为了补全而硬猜
9. 输出纯 JSON，不要添加其他文字
10. 如果页面中没有选择题，输出 {"questions": []}
11. 题号不要放进 stem；例如“1.”、“2、”、“第3题”这类编号都必须去掉，只保留真正的题干正文
12. 看到 ①②③④ 等序号时，必须完整保留其后面的所有内容，一字不漏地放入 stem
13. 题肢属于题干的一部分，必须并入 stem，绝不能单独输出字段
14. 如果选项是组合编号（如 ①③、②④），说明 ①②③④ 的完整陈述文本是题干的一部分，必须全部提取到 stem 中，包括材料区域中定义的子陈述`;

const BOUNDARY_REVIEW_SYSTEM_PROMPT = `你是一个选择题跨页合并审核助手。

你会收到两个相邻页面边界上的题目块：
- left_block：上一页最后一块
- right_block：下一页第一块

你的任务：
1. 判断 right_block 是否应当并入 left_block，二者是否属于同一道题
2. 如果应该合并，直接输出合并后的完整题目结构

判断原则：
1. 重点看 left_block 和 right_block 是否是同一道题的上下半部分
2. 如果 right_block 只是补充 left_block 缺失的题干、A/B/C/D 选项、答案或解析，应该合并
3. 如果 right_block 明显已经开启了新的题目，就不要合并
4. 不要依赖题号作为唯一依据；题号可以错

合并规则（必须严格遵守）：
- stem：必须包含 left_block.stem 和 right_block.stem 的全部内容，按顺序拼接，不能丢失任何一方的内容；同时不要带题号前缀，如“1.”、“2、”、“第3题”
- options：取 left 和 right 中 A/B/C/D 选项更完整的版本
- answer/explanation：取 left 和 right 中非空的值

输出 JSON：
不合并时：
{
  "should_merge": false,
  "reason": "一句简短原因"
}

合并时：
{
  "should_merge": true,
  "reason": "一句简短原因",
  "merged": {
    "stem": "合并后的题干",
    "options": [
      {"label": "A", "content": "选项内容"},
      {"label": "B", "content": "选项内容"},
      {"label": "C", "content": "选项内容"},
      {"label": "D", "content": "选项内容"}
    ],
    "answer": "",
    "explanation": "",
    "type": "single"
  }
}`;

const REPAIR_SYSTEM_PROMPT = `你是一个专业的试题修复助手。你会收到已经识别出来但部分字段缺失的选择题 JSON。

你的任务：
1. 只补全缺失的答案或解析，不要改动题号、题干和选项。
2. 如果答案可以较高把握推断，就补全标准答案，答案只允许返回 A、B、C、D 这类字母组合。
3. 如果解析缺失但能根据题干和答案补全，就补全解析。
4. 对你补全过的字段，在 ai_flags 中加入 "missing_answer_inferred" 或 "missing_explanation_inferred"。
5. 如果确实无法可靠判断，就保留空字符串，不要乱猜。
6. 输出纯 JSON，格式为：
{
  "repairs": [
    {
      "number": 1,
      "answer": "A",
      "explanation": "这里是补充解析",
      "ai_flags": ["missing_answer_inferred"]
    }
  ]
}`;

interface RepairResult {
  repairs?: Array<{
    number: number;
    answer?: string;
    explanation?: string;
    ai_flags?: string[];
  }>;
}

interface BoundaryReviewResult {
  should_merge?: boolean;
  reason?: string;
  merged?: {
    stem?: string;
    options?: Option[];
    answer?: string;
    explanation?: string;
    type?: QuestionType;
  };
}

interface BoundaryReviewBlock {
  stem: string;
  options: Option[];
  answer: string;
  explanation: string;
  type: QuestionType;
}

export interface ExtractionCallResult {
  data: ExtractionResult;
  rawContent: string;
}

export async function extractQuestionsFromImage(
  imageBase64: string,
  pageNumber: number
): Promise<ExtractionCallResult> {
  return callSiliconflow<ExtractionResult>([
    { role: 'system', content: EXTRACTION_SYSTEM_PROMPT },
    {
      role: 'user',
      content: [
        {
          type: 'image_url',
          image_url: { url: `data:image/png;base64,${imageBase64}` },
        },
        {
          type: 'text',
          text: `这是试卷的第 ${pageNumber} 页。请提取所有选择题，严格按JSON格式输出。`,
        },
      ],
    },
  ]);
}

export async function extractQuestionsFromText(
  text: string,
  pageNumber: number
): Promise<ExtractionCallResult> {
  return callSiliconflow<ExtractionResult>([
    { role: 'system', content: EXTRACTION_SYSTEM_PROMPT },
    {
      role: 'user',
      content: `这是试卷的文本内容（第 ${pageNumber} 页）。请提取所有选择题，严格按JSON格式输出。\n\n${text}`,
    },
  ]);
}

export async function repairIncompleteQuestions(
  questions: MergedQuestion[],
  onProgress?: (completed: number, total: number) => void
): Promise<MergedQuestion[]> {
  const incomplete = questions.filter((question) => !question.answer || !question.explanation);
  if (incomplete.length === 0) return questions;

  const repairResults = await processInParallel(
    incomplete,
    async (question) => repairSingleQuestion(question),
    10,
    onProgress
  );

  const repairMap = new Map<number, NonNullable<RepairResult['repairs']>[number]>();

  for (const result of repairResults) {
    if (result.error) {
      console.error(`[repair] question=${result.item.number} failed: ${String(result.error)}`);
      continue;
    }

    const repair = result.result;
    if (repair) {
      repairMap.set(result.item.number, repair);
    }
  }

  return questions.map((question) => {
    const repair = repairMap.get(question.number);
    const aiFlags = new Set(question.ai_flags);
    let answer = question.answer;
    let explanation = question.explanation;
    let isAiGenerated = question.is_ai_generated;

    if (!answer) {
      const repairedAnswer = normalizeAnswer(repair?.answer || '');
      if (repairedAnswer) {
        answer = repairedAnswer;
        isAiGenerated = true;
      }
    }

    if (!explanation) {
      const repairedExplanation = repair?.explanation?.trim() || '';
      if (repairedExplanation) {
        explanation = repairedExplanation.replace(/^\[AI补全\]\s*/, '');
        isAiGenerated = true;
      }
    }

    for (const flag of repair?.ai_flags || []) {
      aiFlags.add(flag);
    }

    const finalized = {
      ...question,
      answer,
      explanation,
      is_ai_generated: isAiGenerated || aiFlags.size > 0,
      ai_flags: Array.from(aiFlags),
    };

    return markStillIncomplete(finalized);
  });
}

async function repairSingleQuestion(
  question: MergedQuestion
): Promise<NonNullable<RepairResult['repairs']>[number] | undefined> {
  const payload = [{
    number: question.number,
    stem: question.stem,
    options: question.options,
    answer: question.answer,
    explanation: question.explanation,
  }];

  const repairResult = (await callSiliconflow<RepairResult>([
    { role: 'system', content: REPAIR_SYSTEM_PROMPT },
    {
      role: 'user',
      content: `请只补全下列题目中缺失的答案或解析：\n${JSON.stringify(payload, null, 2)}`,
    },
  ], 0.2, 2048)).data;

  return repairResult.repairs?.[0];
}

export async function reviewBoundaryMerge(
  leftBlock: BoundaryReviewBlock,
  rightBlock: BoundaryReviewBlock,
  leftPageNumber: number,
  rightPageNumber: number
): Promise<{ should_merge: boolean; reason: string; merged?: { stem: string; options: Option[]; answer: string; explanation: string; type: QuestionType } }> {
  try {
    const apiResult = await callSiliconflow<BoundaryReviewResult>([
      { role: 'system', content: BOUNDARY_REVIEW_SYSTEM_PROMPT },
      {
        role: 'user',
        content: JSON.stringify({
          left_page: leftPageNumber,
          right_page: rightPageNumber,
          left_block: leftBlock,
          right_block: rightBlock,
        }, null, 2),
      },
    ], 0.1, 2048);
    const result = apiResult.data;
    const rawContent = apiResult.rawContent;

    console.log(`[boundary] pages=${leftPageNumber}-${rightPageNumber} raw:\n${rawContent}`);

    if (!result.should_merge) {
      return { should_merge: false, reason: result.reason?.trim() || '' };
    }

    const m = result.merged;
    return {
      should_merge: true,
      reason: result.reason?.trim() || '',
      merged: m?.stem ? {
        stem: m.stem,
        options: m.options || [],
        answer: m.answer || '',
        explanation: m.explanation || '',
        type: m.type || 'single',
      } : undefined,
    };
  } catch (e) {
    console.error(`[boundary] pages=${leftPageNumber}-${rightPageNumber} error: ${String(e)}`);
    return {
      should_merge: false,
      reason: 'boundary_review_failed',
    };
  }
}

async function callSiliconflow<T>(
  messages: Array<Record<string, unknown>>,
  temperature = 0.1,
  maxTokens = 4096
): Promise<{ data: T; rawContent: string }> {
  const apiKey = process.env.SILICONFLOW_API_KEY;
  const apiUrl = process.env.SILICONFLOW_API_URL;
  const model = process.env.SILICONFLOW_MODEL;

  if (!apiKey || !apiUrl || !model) {
    throw new Error('缺少硅基流动API配置');
  }

  const response = await fetch(apiUrl, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      messages,
      temperature,
      max_tokens: maxTokens,
      response_format: { type: 'json_object' },
      chat_template_kwargs: { enable_thinking: false },
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`API请求失败: ${response.status} ${errText}`);
  }

  const data = await response.json();
  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new Error('API返回内容为空');

  const rawContent = typeof content === 'string'
    ? content
    : JSON.stringify(content, null, 2);

  const jsonMatch = rawContent.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error('无法从API响应中提取JSON');

  return {
    data: JSON.parse(jsonMatch[0]) as T,
    rawContent,
  };
}

function markStillIncomplete(question: MergedQuestion): MergedQuestion {
  const aiFlags = new Set(question.ai_flags);
  let explanation = question.explanation;

  if (!question.answer) {
    aiFlags.add('missing_answer_unresolved');
  }

  if (!question.explanation) {
    aiFlags.add('missing_explanation_unresolved');
    explanation = '当前解析缺失，暂未能可靠补全。';
  }

  return {
    ...question,
    type: inferQuestionType(question.answer, question.type),
    explanation,
    is_ai_generated: question.is_ai_generated || aiFlags.size > 0,
    ai_flags: Array.from(aiFlags),
  };
}

function inferQuestionType(answer: string, fallback: QuestionType): QuestionType {
  const normalized = normalizeAnswer(answer);
  if (!normalized) {
    return fallback;
  }
  return normalized.length > 1 ? 'multiple' : 'single';
}
