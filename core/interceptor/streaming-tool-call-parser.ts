import type { ToolCall, ToolDescriptor, ToolError } from '../types';
import {
  createToolCallFromInvocation,
  createToolInvocationCatalog,
  getToolCloseTag,
  type ToolInvocationCatalog,
} from '../tool';
import {
  findFirstXmlToolTag,
  getPartialXmlToolTagTailLength,
} from '../tool/xml-tags';

const STREAM_TOOL_RAW_MAX_LENGTH = 2048;
const TRUNCATION_SUFFIX = '\n...[truncated]';

export interface StreamingToolCallParserEvent {
  started: ToolCall[];
  completed: ToolCall[];
}

export interface StreamingToolCallParser {
  append(chunk: string): StreamingToolCallParserEvent;
  flush(): StreamingToolCallParserEvent;
}

export function createStreamingToolCallParser(
  descriptors: readonly ToolDescriptor[],
): StreamingToolCallParser {
  return new XmlStreamingToolCallParser(createToolInvocationCatalog(descriptors));
}

class XmlStreamingToolCallParser implements StreamingToolCallParser {
  private readonly invocationNames: ReadonlySet<string>;
  private state: 'NORMAL' | 'SUPPRESSING' = 'NORMAL';
  private pendingNormal = '';
  private pendingSuppressed = '';
  private current: {
    id: string;
    invocationName: string;
    openTag: string;
    closeTag: string;
    bodyParts: string[];
    bodyLength: number;
  } | null = null;

  constructor(private readonly catalog: ToolInvocationCatalog) {
    this.invocationNames = new Set(catalog.invocationNames);
  }

  append(chunk: string): StreamingToolCallParserEvent {
    const event: StreamingToolCallParserEvent = { started: [], completed: [] };
    if (!chunk || this.invocationNames.size === 0) return event;

    let remaining = chunk;
    while (remaining.length > 0) {
      remaining = this.state === 'SUPPRESSING'
        ? this.consumeSuppressedText(remaining, event)
        : this.consumeNormalText(remaining, event);
    }
    return event;
  }

  flush(): StreamingToolCallParserEvent {
    this.state = 'NORMAL';
    this.pendingNormal = '';
    this.pendingSuppressed = '';
    this.current = null;
    return { started: [], completed: [] };
  }

  private consumeNormalText(input: string, event: StreamingToolCallParserEvent): string {
    const text = this.pendingNormal + input;
    this.pendingNormal = '';

    const found = findFirstXmlToolTag(text, this.invocationNames, { closing: false });
    if (!found) {
      const tailLength = getPartialXmlToolTagTailLength(text, this.invocationNames, { closing: false });
      this.pendingNormal = tailLength > 0 ? text.slice(-tailLength) : '';
      return '';
    }

    const id = crypto.randomUUID();
    this.state = 'SUPPRESSING';
    this.pendingSuppressed = '';
    this.current = {
      id,
      invocationName: found.name,
      openTag: found.raw,
      closeTag: getToolCloseTag(found.name),
      bodyParts: [],
      bodyLength: 0,
    };
    event.started.push(createToolCallFromInvocation(
      found.name,
      {},
      found.raw,
      this.catalog,
      { id },
    ));
    return text.slice(found.endIndex);
  }

  private consumeSuppressedText(input: string, event: StreamingToolCallParserEvent): string {
    const current = this.current;
    if (!current) {
      this.state = 'NORMAL';
      return input;
    }

    const text = this.pendingSuppressed + input;
    this.pendingSuppressed = '';
    const closeTag = findFirstXmlToolTag(text, new Set([current.invocationName]), { closing: true });

    if (!closeTag) {
      const tailLength = getPartialXmlToolTagTailLength(text, new Set([current.invocationName]), { closing: true });
      this.appendBody(text.slice(0, text.length - tailLength));
      this.pendingSuppressed = tailLength > 0 ? text.slice(-tailLength) : '';
      return '';
    }

    this.appendBody(text.slice(0, closeTag.index));
    event.completed.push(this.createCompletedCall({ ...current, closeTag: closeTag.raw }));
    this.state = 'NORMAL';
    this.pendingSuppressed = '';
    this.current = null;
    return text.slice(closeTag.endIndex);
  }

  private appendBody(value: string): void {
    if (!value || !this.current) return;
    this.current.bodyParts.push(value);
    this.current.bodyLength += value.length;
  }

  private createCompletedCall(current: NonNullable<XmlStreamingToolCallParser['current']>): ToolCall {
    const body = current.bodyParts.join('');
    const raw = createBoundedRaw(current, body);

    try {
      const parsed = body.length === 0 ? {} : JSON.parse(body);
      if (!isToolPayload(parsed)) {
        return createToolCallFromInvocation(current.invocationName, {}, raw, this.catalog, {
          id: current.id,
          parseError: createToolParseError(
            'tool_call_payload_invalid',
            current.invocationName,
            'Tool call body must be a JSON object.',
          ),
        });
      }
      return createToolCallFromInvocation(current.invocationName, parsed, raw, this.catalog, {
        id: current.id,
      });
    } catch (error) {
      return createToolCallFromInvocation(current.invocationName, {}, raw, this.catalog, {
        id: current.id,
        parseError: createToolParseError(
          'tool_call_json_invalid',
          current.invocationName,
          [
            'Tool call body is not valid JSON.',
            'Use double quotes for strings and escape backslashes in local file paths, for example "D:\\\\project\\\\file.txt" or "D:/project/file.txt".',
            error instanceof Error ? error.message : String(error),
          ].join(' '),
        ),
      });
    }
  }

}

function createBoundedRaw(
  current: { openTag: string; closeTag: string },
  body: string,
): string {
  const rawLength = current.openTag.length + body.length + current.closeTag.length;
  if (rawLength <= STREAM_TOOL_RAW_MAX_LENGTH) return `${current.openTag}${body}${current.closeTag}`;
  return [
    current.openTag,
    `...[payload ${body.length} chars omitted]`,
    current.closeTag,
    TRUNCATION_SUFFIX,
  ].join('\n');
}

function isToolPayload(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function createToolParseError(code: string, invocationName: string, message: string): ToolError {
  return {
    code,
    message,
    retryable: false,
    details: { invocationName },
  };
}
